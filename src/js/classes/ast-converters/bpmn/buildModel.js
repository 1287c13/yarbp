import { nodeTypes } from '../../YarbpParser.js';
import {
  BpmnDefinitions, BpmnCollaboration, BpmnParticipant,
  BpmnProcess, BpmnLane, BpmnFlowNode, BpmnSequenceFlow,
  BpmnMessageFlow, BpmnTextAnnotation, BpmnAssociation,
  BpmnDataOutputAssociation, BpmnDataObjectReference, BpmnDataStoreReference,
} from './BpmnModel.js';
import {
  IdGenerator, extractExplicitId, childValue, readBounds, readJoinBounds,
} from './utils.js';
import {
  TASK_TAG_MAP, DEFAULT_TASK_TAG,
  GATEWAY_TAG_MAP, DEFAULT_GATEWAY_TAG,
  LOCATION, LOOP, ARTIFACT_OFFSETS,
  isFlowNode, isArtifact,
} from './definitions.js';

export function buildModel(ast) {
  const ctx = {
    idGen:       new IdGenerator(),
    nodesById:   new Map(),
    nodesByName: new Map(),
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
        ctx.idGen.next('Participant'), proc.name, proc.id);
      collab.participants.push(participant);
    }
    collab.textAnnotations = allTextAnnotations;
    collab.associations    = allAssociations;
    collab.messageFlows    = allMessageFlows;
    definitions.collaboration = collab;
  }

  return definitions;
}

/* ------------------------------------------------------------------ */

function buildProcess(node, ctx) {
  const process = new BpmnProcess();
  process.id = ctx.idGen.next('Process');
  process.name = node.value;
  process.isExecutable = false;
  process.bounds = readBounds(node);
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

  let tag;
  if (location === LOCATION.END) {
    tag = 'endEvent';
  } else if (location === LOCATION.INTERMEDIATE) {
    tag = 'intermediateThrowEvent';
  } else if (opts.isFirst) {
    tag = 'startEvent';
  } else {
    tag = 'intermediateThrowEvent';
  }

  const id = explicitId || ctx.idGen.next(idPrefixForEvent(tag));
  const self = new BpmnFlowNode({ id, tag, name });
  self.bounds = readBounds(node);
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

  const roleValue = childValue(node, 'роль');
  if (roleValue !== null) {
    const lane = process.lanes.find(l => l.name === roleValue);
    if (lane) opts.laneState.current = lane;
  }

  const id = explicitId || ctx.idGen.next('Activity');
  const self = new BpmnFlowNode({ id, tag, name });
  self.bounds = readBounds(node);
  self.loopCharacteristics = readLoopCharacteristics(node);
  registerNode(self, name, ctx, process, opts);

  const branches = buildBoundaryBranches(node, self, ctx, process, opts);
  buildArtifacts(node, self, ctx, process, opts);

  return { head: self, tail: self, branches };
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
    switch (art.key) {
      case 'комментарий':  buildComment(art, task, ctx, process); break;
      case 'данные':       buildDataObject(art, task, ctx, process); break;
      case 'база-данных':  buildDataStore(art, task, ctx, process); break;
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

function buildDataObject(node, task, ctx, process) {
  const name = node.value || null;

  const dataObjectId = ctx.idGen.next('DataObject');
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
  });

  process.dataObjects.push({ id: dataObjectId });
  process.dataObjectRefs.push(ref);
  task.dataOutputAssocs.push(assoc);
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
    boundary.attachedToRef = parentTask.id;
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

  const id = explicitId || ctx.idGen.next('Gateway');
  const fork = new BpmnFlowNode({ id, tag, name });
  fork.bounds = readBounds(node);
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
  if (openTails.length === 0) {
    gatewayTail = null;
  } else if (openTails.length === 1) {
    gatewayTail = openTails[0];
  } else {
    const join = new BpmnFlowNode({
      id: ctx.idGen.next('Gateway'),
      tag,
      name: null,
    });
    join.bounds = readJoinBounds(node);
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
    if (after.head && gatewayTail) {
      addSequenceFlow(gatewayTail, after.head, ctx, opts.container || process);
    }
    return {
      head: fork,
      tail: after.tails.length ? after.tails[after.tails.length - 1] : gatewayTail,
      branches: after.tails.slice(0, -1),
    };
  }

  return { head: fork, tail: gatewayTail, branches: [] };
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