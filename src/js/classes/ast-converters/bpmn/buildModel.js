import { nodeTypes } from '../../YarbpParser.js';
import {
  BpmnDefinitions, BpmnCollaboration, BpmnParticipant,
  BpmnProcess, BpmnLane, BpmnFlowNode, BpmnSequenceFlow,
  BpmnMessageFlow, BpmnTextAnnotation, BpmnAssociation,
  BpmnCategory, BpmnGroup,
  BpmnDataInputAssociation, BpmnDataOutputAssociation,
  BpmnDataObjectReference, BpmnDataStoreReference,
} from './BpmnModel.js';
import {
  IdGenerator, extractExplicitId, childValue, readBounds, readJoinBounds,
} from './utils.js';
import {
  TASK_TAG_MAP, DEFAULT_TASK_TAG,
  GATEWAY_TAG_MAP, DEFAULT_GATEWAY_TAG,
  EVENT_DEFINITION_MAP, CATCH_EVENT_DEFINITIONS, EVENT_DIRECTION,
  LOCATION, LOOP, ARTIFACT_OFFSETS,
  KNOWN_NODE_KEYS,
  isFlowNode, isArtifact,
} from './definitions.js';

/** Номер строки по смещению в исходном тексте (для предупреждений). */
function lineAt(source, offset) {
  if (!source || !Number.isFinite(offset)) return 0;

  let line = 1;
  const limit = Math.min(offset, source.length);
  for (let index = 0; index < limit; index++) {
    if (source[index] === '\n') line++;
  }
  return line;
}

/** Предупреждение сборки: строка исходника + понятный текст (B-1). */
function warn(ctx, node, message) {
  const start = node && node.position ? node.position.start : undefined;
  ctx.warnings.push({ line: lineAt(ctx.source, start), message });
}

/**
 * Значение-флаг из разметки.
 *
 * Лексер превращает литералы `да`/`нет` в boolean, поэтому проверять только
 * строку нельзя — иначе `.прерывающее нет` и `.по-умолчанию да` молча не
 * срабатывают.
 */
function isFlagOn(value) {
  return value === true || value === 'да' || value === 'yes';
}

function isFlagOff(value) {
  return value === false || value === 'нет' || value === 'no';
}

export function buildModel(ast, options = {}) {
  const ctx = {
    idGen:       new IdGenerator(),
    nodesById:   new Map(),
    nodesByName: new Map(),
    source:      options.source || '',
    warnings:    [],
  };

  const definitions = new BpmnDefinitions();
  definitions.id    = ctx.idGen.next('Definitions');

  const topMeans = (ast.children || []).filter(n => n.nodeType === nodeTypes.MEANING);
  const processNodes = topMeans.filter(n => n.key === 'процесс');

  for (const pNode of processNodes) {
    definitions.processes.push(buildProcess(pNode, ctx));
  }

  // собираем артефакты со всех процессов в collaboration
  const allTextAnnotations = [];
  const allAssociations    = [];
  const allMessageFlows    = [];

  for (const proc of definitions.processes) {
    if (proc._category) {
      definitions.categories.push(proc._category);
      delete proc._category;
    }
    if (proc._pendingArtifacts) {
      allTextAnnotations.push(...proc._pendingArtifacts.textAnnotations);
      allAssociations.push(...proc._pendingArtifacts.associations);
      allMessageFlows.push(...proc._pendingArtifacts.messageFlows);
      delete proc._pendingArtifacts;
    }
  }

  const needsCollab =
    definitions.processes.length > 1 ||
    allTextAnnotations.length > 0 ||
    allAssociations.length > 0 ||
    allMessageFlows.length > 0;

  if (needsCollab) {
    const collab = new BpmnCollaboration();
    collab.id = ctx.idGen.next('Collaboration');
    for (const proc of definitions.processes) {
      const participant = new BpmnParticipant(
        ctx.idGen.next('Participant'), proc.poolName || proc.name, proc.id);
      collab.participants.push(participant);
    }
    collab.textAnnotations = allTextAnnotations;
    collab.associations    = allAssociations;
    collab.messageFlows    = allMessageFlows;
    definitions.collaboration = collab;
  }

  validateModel(definitions, ctx);
  definitions.warnings = ctx.warnings;

  return definitions;
}

/**
 * Проверки «а схема получилась осмысленной» (B-1).
 *
 * Конвертер и раньше молча выкидывал то, что не понял: здесь мы собираем это в
 * предупреждения со строками, чтобы редактор мог их показать.
 */
function validateModel(definitions, ctx) {
  for (const process of definitions.processes) {
    const starts = process.flowNodes.filter(node => node.tag === 'startEvent');
    if (!starts.length) {
      warn(ctx, process,
        'в процессе «' + (process.name || process.id) + '» нет стартового события');
    }

    checkIncoming(process.flowNodes, ctx);
  }

  if (definitions.collaboration) {
    // Кто в каком процессе: нужно, чтобы понять, соединяет ли message flow
    // разные пулы (только так он валиден по BPMN).
    const ownerByNodeId = new Map();
    const collectOwners = (nodes, process) => {
      for (const node of nodes || []) {
        ownerByNodeId.set(node.id, process);
        if (node.children && node.children.length) collectOwners(node.children, process);
      }
    };
    for (const process of definitions.processes) collectOwners(process.flowNodes, process);

    for (const flow of definitions.collaboration.messageFlows) {
      const where = { position: flow.position };
      const known = ctx.nodesById.has(flow.sourceRef) && ctx.nodesById.has(flow.targetRef);
      if (!known) {
        warn(ctx, where, 'связь ссылается на неизвестный узел: ' +
          flow.sourceRef + ' → ' + flow.targetRef);
        continue;
      }

      const sourceProcess = ownerByNodeId.get(flow.sourceRef);
      const targetProcess = ownerByNodeId.get(flow.targetRef);
      if (sourceProcess && sourceProcess === targetProcess) {
        warn(ctx, where, 'связь соединяет узлы одного пула «' +
          (sourceProcess.name || sourceProcess.id) + '»: по BPMN message flow ' +
          'идёт между пулами, внутри пула нужен sequence flow');
      }
    }
  }
}

/** У каждого узла, кроме стартовых и boundary, должен быть входящий поток. */
function checkIncoming(nodes, ctx) {
  for (const node of nodes || []) {
    if (node.tag !== 'startEvent' && node.tag !== 'boundaryEvent' && !node.incoming.length) {
      warn(ctx, node, 'у узла «' + (node.name || node.tag) + '» нет входящего потока');
    }

    if (Array.isArray(node.children) && node.children.length) {
      checkIncoming(node.children, ctx);
    }
  }
}

/* ------------------------------------------------------------------ */

function buildProcess(node, ctx) {
  const process = new BpmnProcess();
  // B-7: `.ид` у процесса нужен, чтобы на него можно было ссылаться из
  // `задача .тип вызов .вызывает = <ид>`. Без `.ид` — как раньше, авто-id.
  process.id = extractExplicitId(node) || ctx.idGen.next('Process');
  process.name = node.value;
  // B-7: `.исполняемый да` → isExecutable, `.пул = <имя>` → имя пула-участника.
  // Без ключей поведение прежнее, поэтому старые схемы не меняются.
  process.isExecutable = isFlagOn(childValue(node, 'исполняемый'));
  process.poolName = childValue(node, 'пул') || node.value;
  process.bounds = readBounds(node);
  process.position = node.position;
  process._pendingArtifacts = {
    textAnnotations: [],
    associations:    [],
    messageFlows:    [],
  };

  const children = (node.children || []).filter(c => c.nodeType === nodeTypes.MEANING);

  const rolesNode = children.find(c => c.key === 'роли');
  if (rolesNode) {
    for (const roleNode of rolesNode.children || []) {
      const laneName = childValue(roleNode, 'имя') || roleNode.value || null;
      const lane = new BpmnLane(ctx.idGen.next('Lane'), laneName);
      lane.bounds = readBounds(roleNode);
      process.lanes.push(lane);
    }
    process.laneSetId = ctx.idGen.next('LaneSet');
  }

  const flowChildren = children.filter(c => c.key !== 'роли');
  const laneState = {
    current: process.lanes.length ? process.lanes[0] : null,
  };

  buildChainOfNodes(flowChildren, ctx, process, {
    isFirst: true,
    laneState,
  });

  return process;
}

/* ================================================================== *
 *  Цепочка сиблингов
 * ================================================================== */

function buildChainOfNodes(nodes, ctx, process, opts) {
  let head = null;
  let openTails = [];
  let first = opts.isFirst;

  for (const node of nodes) {
    if (!isFlowNode(node)) continue;

    // Опечатка в ключе (`задачя`) или чужое слово: узел раньше исчезал молча.
    if (!KNOWN_NODE_KEYS.has(node.key)) {
      warn(ctx, node, 'неизвестный узел «' + node.key + '» — пропущен');
      continue;
    }

    const built = buildNode(node, ctx, process, {
      isFirst: first,
      laneState: opts.laneState,
      container: opts.container || process,
    });
    if (!built) continue;

    first = false;

    if (!head) head = built.head;

    for (const tail of openTails) {
      addSequenceFlow(tail, built.head, ctx, opts.container || process);
    }

    openTails = [];
    if (built.tail) openTails.push(built.tail);
    for (const b of built.branches) {
      if (b) openTails.push(b);
    }
  }

  return { head, tails: openTails };
}

/* ================================================================== *
 *  Один узел
 * ================================================================== */

function buildNode(node, ctx, process, opts) {
  switch (node.key) {
    case 'событие':    return buildEvent(node, ctx, process, opts);
    case 'задача':     return buildTask(node, ctx, process, opts);
    case 'шлюз':       return buildGateway(node, ctx, process, opts);
    case 'подпроцесс': return buildSubProcess(node, ctx, process, opts);
    default:           return null;
  }
}

/* ------------------------------------------------------------------ *
 *  Событие
 * ------------------------------------------------------------------ */

function buildEvent(node, ctx, process, opts) {
  const name       = node.value || null;
  const explicitId = extractExplicitId(node);
  const location   = childValue(node, 'расположение');
  const typeValue  = childValue(node, 'тип');
  const direction  = childValue(node, 'направление');

  // B-3: определение события (`сообщение`, `таймер`, `ошибка`, …).
  let definition = null;
  if (typeValue !== null) {
    definition = EVENT_DEFINITION_MAP[typeValue] || null;
    if (!definition) {
      warn(ctx, node, 'неизвестный тип события «' + typeValue + '» — без определения');
    }
  }

  let tag;
  if (location === LOCATION.END) {
    tag = 'endEvent';
  } else if (opts.isFirst && location !== LOCATION.INTERMEDIATE) {
    tag = 'startEvent';
  } else {
    // Промежуточное: ловящее, если это явно сказано или вид события ловящий.
    const catching = direction === EVENT_DIRECTION.CATCH
      || (direction !== EVENT_DIRECTION.THROW && CATCH_EVENT_DEFINITIONS.has(definition));
    tag = catching ? 'intermediateCatchEvent' : 'intermediateThrowEvent';
  }

  const id = explicitId || ctx.idGen.next(idPrefixForEvent(tag));
  const self = new BpmnFlowNode({ id, tag, name });
  self.eventDefinition = definition;
  self.bounds = readBounds(node);
  self.position = node.position;
  registerNode(self, name, ctx, process, opts);

  if (tag === 'endEvent') {
    return { head: self, tail: null, branches: [] };
  }

  const childFlow = (node.children || []).filter(isFlowNode);
  if (!childFlow.length) {
    return { head: self, tail: self, branches: [] };
  }

  const inner = buildChainOfNodes(childFlow, ctx, process, {
    isFirst: false,
    laneState: opts.laneState,
    container: opts.container,
  });

  if (inner.head) {
    addSequenceFlow(self, inner.head, ctx, opts.container || process);
  }

  return {
    head: self,
    tail: inner.tails.length ? inner.tails[inner.tails.length - 1] : self,
    branches: inner.tails.slice(0, -1),
  };
}

function idPrefixForEvent(tag) {
  switch (tag) {
    case 'startEvent':             return 'StartEvent';
    case 'endEvent':               return 'EndEvent';
    case 'intermediateThrowEvent': return 'IntermediateThrowEvent';
    case 'boundaryEvent':          return 'BoundaryEvent';
    default:                       return 'Event';
  }
}

/* ------------------------------------------------------------------ *
 *  Задача
 * ------------------------------------------------------------------ */

function buildTask(node, ctx, process, opts) {
  const name       = node.value || null;
  const explicitId = extractExplicitId(node);
  const typeValue  = childValue(node, 'тип');
  const tag        = TASK_TAG_MAP[typeValue] || DEFAULT_TASK_TAG;

  // Имя задачи берётся из значения после «=»; `.имя` внутри узла не читается,
  // но выглядит правдоподобно — поэтому предупреждаем, а не молчим.
  if (childValue(node, 'имя') !== null) {
    warn(ctx, node, 'имя задачи берётся из значения после «=»: .имя игнорируется');
  }

  const roleValue = childValue(node, 'роль');
  if (roleValue !== null) {
    const lane = process.lanes.find(l => l.name === roleValue);
    if (lane) opts.laneState.current = lane;
  }

  const id = explicitId || ctx.idGen.next('Activity');
  const self = new BpmnFlowNode({ id, tag, name });
  self.bounds = readBounds(node);
  self.position = node.position;
  self.loopCharacteristics = readLoopCharacteristics(node);

  // B-7: вызов другого процесса — `callActivity` + `calledElement`.
  // Ссылка идёт на `id` процесса из разметки (`.ид` у `процесс`).
  if (tag === 'callActivity') {
    const called = childValue(node, 'вызывает');
    if (called === null) {
      warn(ctx, node, 'у задачи-вызова нет .вызывает — callActivity без calledElement');
    } else {
      self.calledElement = String(called);
    }
  }

  registerNode(self, name, ctx, process, opts);

  const branches = buildBoundaryBranches(node, self, ctx, process, opts);
  buildArtifacts(node, self, ctx, process, opts);

  const children = (node.children || []).filter(isFlowNode);
  if (!children.length) {
    return { head: self, tail: self, branches };
  }

  // Вложенные потоковые узлы задачи (кроме `событие` — это boundary) образуют
  // цепочку после задачи. Пример из readme ставит `шлюз` внутрь задачи, и
  // раньше развилка просто выпадала из схемы.
  const nested = children.filter(child => child.key !== 'событие');
  if (!nested.length) {
    return { head: self, tail: self, branches };
  }

  const inner = buildChainOfNodes(nested, ctx, process, {
    isFirst: false,
    laneState: opts.laneState,
    container: opts.container,
  });

  if (inner.head) {
    addSequenceFlow(self, inner.head, ctx, opts.container || process);
  }

  return {
    head: self,
    tail: inner.tails.length ? inner.tails[inner.tails.length - 1] : self,
    branches: [...branches, ...inner.tails.slice(0, -1)],
  };
}

function readLoopCharacteristics(node) {
  const value = childValue(node, 'повторение');
  if (value === LOOP.PARALLEL)   return 'multiInstanceParallel';
  if (value === LOOP.SEQUENTIAL) return 'multiInstanceSequential';
  if (value === LOOP.STANDARD)   return 'standardLoop';
  return null;
}

/* ------------------------------------------------------------------ *
 *  Артефакты задачи
 * ------------------------------------------------------------------ */

function buildArtifacts(node, task, ctx, process, opts) {
  const artifacts = (node.children || []).filter(isArtifact);
  for (const art of artifacts) {
    // Значение у артефакта обязательно, но `данные Товар` без «=» разбирается
    // как узел без значения, а слово «Товар» вообще не попадает в AST
    // (дефект §17.5 №13). Показать это в предупреждении — единственное, что
    // можно сделать на уровне конвертера, не трогая парсер.
    if (art.value === undefined || art.value === null) {
      warn(ctx, art, 'у артефакта «' + art.key + '» нет значения — ' +
        'пишите «' + art.key + ' = <значение>»');
    }

    switch (art.key) {
      case 'комментарий':  buildComment(art, task, ctx, process); break;
      case 'данные':
      case 'данные-выход': buildDataObject(art, task, ctx, process); break;
      case 'данные-вход':  buildDataInput(art, task, ctx, process); break;
      case 'база-данных':  buildDataStore(art, task, ctx, process); break;
      case 'группа':       buildGroup(art, task, ctx, process); break;
      case 'связь':        buildMessageFlow(art, task, ctx, process); break;
    }
  }
}

function buildComment(node, task, ctx, process) {
  const text = node.value || '';
  const id = ctx.idGen.next('TextAnnotation');
  const ta = new BpmnTextAnnotation({ id, text });
  // bounds посчитает BpmnDiGenerator после layout

  const assocId = ctx.idGen.next('Association');
  const assoc = new BpmnAssociation({
    id: assocId,
    sourceRef: task.id,
    targetRef: id,
  });

  process._pendingArtifacts.textAnnotations.push(ta);
  process._pendingArtifacts.associations.push(assoc);
}

/**
 * Общий `dataObject` на имя: два `.данные Товар` в разных задачах — это один
 * объект данных и две ссылки на него (в BPMN `dataObjectReference` — отдельная
 * сущность со своим местом на схеме).
 */
function resolveDataObject(process, ctx, name) {
  const key = name || null;
  const existing = process.dataObjects.find(obj => (obj.name || null) === key);
  if (existing) return existing.id;

  const id = ctx.idGen.next('DataObject');
  process.dataObjects.push({ id, name: key });
  return id;
}

function buildDataObject(node, task, ctx, process) {
  const name = node.value || null;
  const dataObjectId = resolveDataObject(process, ctx, name);

  const refId = ctx.idGen.next('DataObjectReference');
  const ref = new BpmnDataObjectReference({
    id: refId,
    name,
    dataObjectRef: dataObjectId,
  });

  const assocId = ctx.idGen.next('DataOutputAssociation');
  const assoc = new BpmnDataOutputAssociation({
    id: assocId,
    targetRef: refId,
    name,
  });

  process.dataObjectRefs.push(ref);
  task.dataOutputAssocs.push(assoc);
}

/** `.данные-вход Товар` — задача читает данные (dataInputAssociation). */
function buildDataInput(node, task, ctx, process) {
  const name = node.value || null;
  const dataObjectId = resolveDataObject(process, ctx, name);

  const refId = ctx.idGen.next('DataObjectReference');
  const ref = new BpmnDataObjectReference({
    id: refId,
    name,
    dataObjectRef: dataObjectId,
  });

  const assocId = ctx.idGen.next('DataInputAssociation');
  const assoc = new BpmnDataInputAssociation({
    id: assocId,
    sourceRef: refId,
    name,
  });

  process.dataObjectRefs.push(ref);
  task.dataInputAssocs.push(assoc);
}

/** `.группа = <имя>` — рамка группы вокруг задачи (B-7). */
function buildGroup(node, task, ctx, process) {
  const name = node.value || null;

  // По BPMN у группы нет своего имени: подпись живёт в categoryValue.
  let category = process._category;
  if (!category) {
    category = new BpmnCategory(ctx.idGen.next('Category'));
    process._category = category;
  }

  const categoryValueId = ctx.idGen.next('CategoryValue');
  category.values.push({ id: categoryValueId, value: name });

  process.groups.push(new BpmnGroup({
    id: ctx.idGen.next('Group'),
    name,
    categoryValueId,
    ownerId: task.id,
  }));
}

function buildDataStore(node, task, ctx, process) {
  const name = node.value || null;
  const id = ctx.idGen.next('DataStoreReference');
  const ref = new BpmnDataStoreReference({ id, name });

  const assocId = ctx.idGen.next('DataOutputAssociation');
  const assoc = new BpmnDataOutputAssociation({
    id: assocId,
    targetRef: id,
  });

  process.dataStores.push(ref);
  task.dataOutputAssocs.push(assoc);
}

function buildMessageFlow(node, task, ctx, process) {
  const value = String(node.value || '').trim();
  const arrowMatch = value.match(/^(-->|<--)\s+(.+)$/);
  if (!arrowMatch) return;

  const [, arrow, refRaw] = arrowMatch;
  const ref = refRaw.trim();

  let sourceRef, targetRef;
  if (arrow === '-->') {
    sourceRef = task.id;
    targetRef = ref;
  } else {
    sourceRef = ref;
    targetRef = task.id;
  }

  const id = ctx.idGen.next('Flow');
  const mf = new BpmnMessageFlow({ id, sourceRef, targetRef });
  mf.position = node.position;

  // По BPMN message flow соединяет **разные** пулы. Внутри одного пула нужен
  // sequence flow, иначе схема формально невалидна (bpmn-io рисует молча, а
  // валидаторы и моделлер — нет). Проверить это можно только после сборки всех
  // процессов, поэтому проверка живёт в validateModel.
  process._pendingArtifacts.messageFlows.push(mf);
}

/* ------------------------------------------------------------------ *
 *  Boundary
 * ------------------------------------------------------------------ */

function buildBoundaryBranches(node, parentTask, ctx, process, opts) {
  const children = (node.children || []).filter(isFlowNode);
  if (!children.length) return [];

  const segments = [];
  let current = null;

  for (const child of children) {
    if (child.key === 'событие') {
      current = [child];
      segments.push(current);
    } else if (current) {
      current.push(child);
    }
  }

  const branches = [];
  for (const segment of segments) {
    const boundaryNode = segment[0];
    const name = boundaryNode.value || null;
    const explicitId = extractExplicitId(boundaryNode);
    const id = explicitId || ctx.idGen.next('BoundaryEvent');
    const boundary = new BpmnFlowNode({ id, tag: 'boundaryEvent', name });
    boundary.bounds = readBounds(boundaryNode);
    boundary.position = boundaryNode.position;
    boundary.attachedToRef = parentTask.id;

    // B-3: определение и «прерывающее» у boundary-события.
    const boundaryType = childValue(boundaryNode, 'тип');
    if (boundaryType !== null) {
      boundary.eventDefinition = EVENT_DEFINITION_MAP[boundaryType] || null;
      if (!boundary.eventDefinition) {
        warn(ctx, boundaryNode, 'неизвестный тип boundary-события «' + boundaryType + '»');
      }
    }

    const cancelling = childValue(boundaryNode, 'прерывающее');
    if (isFlagOff(cancelling)) boundary.cancelActivity = false;
    registerNode(boundary, null, ctx, process, opts);

    const rest = segment.slice(1);
    if (!rest.length) continue;

    const inner = buildChainOfNodes(rest, ctx, process, {
      isFirst: false,
      laneState: opts.laneState,
      container: opts.container,
    });

    if (inner.head) {
      addSequenceFlow(boundary, inner.head, ctx, opts.container || process);
    }

    if (inner.tails.length) {
      for (const t of inner.tails) branches.push(t);
    }
  }

  return branches;
}

/* ------------------------------------------------------------------ *
 *  Шлюз
 * ------------------------------------------------------------------ */

function buildGateway(node, ctx, process, opts) {
  const name       = node.value || null;
  const explicitId = extractExplicitId(node);
  const typeValue  = childValue(node, 'тип');
  const tag        = GATEWAY_TAG_MAP[typeValue] || DEFAULT_GATEWAY_TAG;

  // B-4: `параллельный`, `инклюзивный`, `событийный`; остальное — исключающий.
  if (typeValue !== null && tag === DEFAULT_GATEWAY_TAG) {
    warn(ctx, node, 'неизвестный тип шлюза «' + typeValue + '» — исключающий по умолчанию');
  }

  const id = explicitId || ctx.idGen.next('Gateway');
  const fork = new BpmnFlowNode({ id, tag, name });
  fork.bounds = readBounds(node);
  fork.position = node.position;
  registerNode(fork, name, ctx, process, opts);

  const allChildren = (node.children || []).filter(c => c.nodeType === nodeTypes.MEANING);
  const branchNodes = allChildren.filter(c => c.key === 'ветка');
  const afterNodes  = allChildren.filter(c => c.key !== 'ветка' && isFlowNode(c));

  const branchTails = [];

  for (const branchNode of branchNodes) {
    const branchName = branchNode.value ?? null;
    const branchChildren = (branchNode.children || []).filter(isFlowNode);

    if (!branchChildren.length) {
      branchTails.push({ head: fork, tail: fork, name: branchName });
      continue;
    }

    const inner = buildChainOfNodes(branchChildren, ctx, process, {
      isFirst: false,
      laneState: opts.laneState,
      container: opts.container,
    });

    if (!inner.head) {
      branchTails.push({ head: fork, tail: fork, name: branchName });
      continue;
    }

    const flow = addSequenceFlow(fork, inner.head, ctx, opts.container || process);
    flow.name = branchName;

    // B-4: условие на потоке и поток по умолчанию (`ветка = да .условие …`).
    const condition = childValue(branchNode, 'условие');
    if (condition !== null) flow.condition = String(condition);

    if (isFlagOn(childValue(branchNode, 'по-умолчанию'))) {
      fork.defaultFlowId = flow.id;
    }

    branchTails.push({
      head: inner.head,
      tail: inner.tails.length ? inner.tails[inner.tails.length - 1] : null,
      name: branchName,
    });
  }

  const openTails = branchTails
    .map(bt => bt.tail)
    .filter(t => t && t.tag !== 'endEvent');

  let gatewayTail;
  let branchContinuations = [];

  if (!branchNodes.length) {
    // Шлюз без веток — это точка слияния (или просто пропуск потока): он
    // передаёт управление дальше как обычный узел. Раньше tail был null, и
    // следующий сиблинг оставался без входящего потока (§17.5 №7).
    gatewayTail = fork;
  } else if (openTails.length === 0) {
    gatewayTail = null;
  } else if (openTails.length === 1) {
    gatewayTail = openTails[0];
  } else if (tag === 'eventBasedGateway') {
    // Событийный шлюз не сходится: ветки ведут в разные ловящие события, и
    // продолжение идёт от КАЖДОЙ ветки. Раньше tail был null — следующий
    // сиблинг оставался без входящего потока, то есть ветки обрывались.
    gatewayTail = openTails[openTails.length - 1];
    branchContinuations = openTails.slice(0, -1);
  } else {
    const join = new BpmnFlowNode({
      id: ctx.idGen.next('Gateway'),
      tag,
      name: null,
    });
    join.bounds = readJoinBounds(node);
    join.position = node.position;
    registerNode(join, null, ctx, process, opts);

    for (const tail of openTails) {
      addSequenceFlow(tail, join, ctx, opts.container || process);
    }
    gatewayTail = join;
  }

  if (afterNodes.length) {
    const after = buildChainOfNodes(afterNodes, ctx, process, {
      isFirst: false,
      laneState: opts.laneState,
      container: opts.container,
    });
    if (after.head) {
      // Для событийного шлюза продолжаем от каждой ветки, для остальных —
      // от общей точки слияния.
      const sources = branchContinuations.length ? openTails : [gatewayTail];
      for (const source of sources) {
        if (source) addSequenceFlow(source, after.head, ctx, opts.container || process);
      }
    }
    return {
      head: fork,
      tail: after.tails.length ? after.tails[after.tails.length - 1] : gatewayTail,
      branches: [...branchContinuations, ...after.tails.slice(0, -1)],
    };
  }

  return { head: fork, tail: gatewayTail, branches: branchContinuations };
}

/* ------------------------------------------------------------------ *
 *  Подпроцесс
 * ------------------------------------------------------------------ */

function buildSubProcess(node, ctx, process, opts) {
  const name       = node.value || null;
  const explicitId = extractExplicitId(node);
  const id = explicitId || ctx.idGen.next('Activity');
  const self = new BpmnFlowNode({ id, tag: 'subProcess', name });
  self.bounds = readBounds(node);
  self.position = node.position;
  self.isExpanded = true;
  self.loopCharacteristics = readLoopCharacteristics(node);
  registerNode(self, name, ctx, process, opts);

  const children = (node.children || []).filter(isFlowNode);
  if (!children.length) {
    return { head: self, tail: self, branches: [] };
  }

  buildChainOfNodes(children, ctx, process, {
    isFirst: true,
    laneState: opts.laneState,
    container: self,
  });

  return {
    head: self,
    tail: self,
    branches: [],
  };
}

/* ------------------------------------------------------------------ *
 *  Утилиты
 * ------------------------------------------------------------------ */

function registerNode(node, name, ctx, process, opts) {
  const container = (opts && opts.container) || process;

  // Дубль `.ид` раньше молча перетирал предыдущий узел в карте идентификаторов.
  if (ctx.nodesById.has(node.id)) {
    warn(ctx, node, 'идентификатор «' + node.id + '» уже занят — узел перезаписан');
  }

  if (container === process) {
    process.flowNodes.push(node);
  } else {
    container.children.push(node);
  }

  ctx.nodesById.set(node.id, node);
  if (name) ctx.nodesByName.set(name, node);

  if (container === process) {
    const laneState = opts && opts.laneState;
    if (laneState && laneState.current) {
      node.laneId = laneState.current.id;
      laneState.current.flowNodeRefs.push(node.id);
    }
  }
}

function addSequenceFlow(source, target, ctx, container) {
  const id = ctx.idGen.next('Flow');
  const flow = new BpmnSequenceFlow({
    id,
    sourceRef: source.id,
    targetRef: target.id,
    name: null,
  });

  if (container && container.sequenceFlows) {
    container.sequenceFlows.push(flow);
  }

  source.outgoing.push(id);
  target.incoming.push(id);
  return flow;
}