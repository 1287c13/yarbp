import { nodeTypes } from '../../YarbpParser.js';
import {
  BpmnDefinitions, BpmnCollaboration, BpmnParticipant,
  BpmnProcess, BpmnLane, BpmnFlowNode, BpmnSequenceFlow,
} from './BpmnModel.js';
import {
  IdGenerator, extractExplicitId, childValue, readBounds,
} from './utils.js';
import {
  TASK_TAG_MAP, DEFAULT_TASK_TAG,
  LOCATION,
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

  if (definitions.processes.length > 1) {
    const collab = new BpmnCollaboration();
    collab.id = ctx.idGen.next('Collaboration');
    for (const proc of definitions.processes) {
      collab.participants.push(
        new BpmnParticipant(ctx.idGen.next('Participant'), proc.name, proc.id)
      );
    }
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

  const children = (node.children || []).filter(c => c.nodeType === nodeTypes.MEANING);

  const rolesNode = children.find(c => c.key === 'роли');
  if (rolesNode) {
    for (const r of rolesNode.children || []) {
      process.lanes.push(new BpmnLane(ctx.idGen.next('Lane'), r.value));
    }
    process.laneSetId = ctx.idGen.next('LaneSet');
  }

  const flowChildren = children.filter(c => c.key !== 'роли');
  buildSequence(flowChildren, ctx, process, true);

  return process;
}

/* ------------------------------------------------------------------ */

function buildSequence(nodes, ctx, process, isFirst) {
  let tails = [];
  let first = isFirst;

  for (const node of nodes) {
    const head = buildFlowElement(node, ctx, process, { isFirst: first });
    if (!head) continue;

    for (const tail of tails) {
      addSequenceFlow(tail, head, ctx, process);
    }

    tails = [head];
    first = false;
  }

  return tails;
}

/* ------------------------------------------------------------------ */

function buildFlowElement(node, ctx, process, opts) {
  switch (node.key) {
    case 'событие': return buildEvent(node, ctx, process, opts);
    case 'задача':  return buildTask(node, ctx, process);
    default:        return null;
  }
}

/* ------------------------------------------------------------------ */

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
  const flowNode = new BpmnFlowNode({ id, tag, name });
  flowNode.bounds = readBounds(node);
  registerNode(flowNode, name, ctx, process);
  return flowNode;
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

/* ------------------------------------------------------------------ */

function buildTask(node, ctx, process) {
  const name       = node.value || null;
  const explicitId = extractExplicitId(node);
  const typeValue  = childValue(node, 'тип');
  const tag        = TASK_TAG_MAP[typeValue] || DEFAULT_TASK_TAG;

  const id = explicitId || ctx.idGen.next('Activity');
  const flowNode = new BpmnFlowNode({ id, tag, name });
  flowNode.bounds = readBounds(node);

  registerNode(flowNode, name, ctx, process);
  return flowNode;
}

/* ------------------------------------------------------------------ */

function registerNode(node, name, ctx, process) {
  process.flowNodes.push(node);
  ctx.nodesById.set(node.id, node);
  if (name) ctx.nodesByName.set(name, node);
}

function addSequenceFlow(source, target, ctx, process) {
  const id = ctx.idGen.next('Flow');
  const flow = new BpmnSequenceFlow({
    id,
    sourceRef: source.id,
    targetRef: target.id,
    name: null,
  });
  process.sequenceFlows.push(flow);
  source.outgoing.push(id);
  target.incoming.push(id);
  return flow;
}