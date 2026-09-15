import { sizeFor } from './definitions.js';

export function recalculateDi(model) {
  for (const process of model.processes) {
    applyStubBounds(process.flowNodes);
    applyStubWaypoints(process);
  }
  return model;
}

function applyStubBounds(nodes) {
  for (const node of nodes) {
    if (!node.bounds) node.bounds = { x: 0, y: 0 };
    if (node.children && node.children.length) {
      applyStubBounds(node.children);
    }
  }
}

function applyStubWaypoints(process) {
  const nodesById = new Map();
  collectNodesById(process.flowNodes, nodesById);

  // внутренние потоки подпроцессов
  applyWaypointsToFlows(process.sequenceFlows, nodesById);
  collectSubProcessFlows(process.flowNodes, nodesById);
}

function collectNodesById(nodes, map) {
  for (const node of nodes) {
    map.set(node.id, node);
    if (node.children && node.children.length) {
      collectNodesById(node.children, map);
    }
  }
}

function collectSubProcessFlows(nodes, nodesById) {
  for (const node of nodes) {
    if (node.sequenceFlows && node.sequenceFlows.length) {
      applyWaypointsToFlows(node.sequenceFlows, nodesById);
    }
    if (node.children && node.children.length) {
      collectSubProcessFlows(node.children, nodesById);
    }
  }
}

function applyWaypointsToFlows(flows, nodesById) {
  for (const flow of flows) {
    if (flow.waypoints && flow.waypoints.length) continue;

    const source = nodesById.get(flow.sourceRef);
    const target = nodesById.get(flow.targetRef);
    if (!source || !target) continue;

    flow.waypoints = simpleWaypoints(source, target);
  }
}

function simpleWaypoints(source, target) {
  const s = boundsOf(source);
  const t = boundsOf(target);

  const sx = s.x + s.width  / 2;
  const sy = s.y + s.height / 2;
  const tx = t.x + t.width  / 2;
  const ty = t.y + t.height / 2;

  const dx = tx - sx;
  const dy = ty - sy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) return [[s.x + s.width, sy], [t.x, ty]];
    return [[s.x, sy], [t.x + t.width, ty]];
  } else {
    if (dy >= 0) return [[sx, s.y + s.height], [tx, t.y]];
    return [[sx, s.y], [tx, t.y + t.height]];
  }
}

function boundsOf(node) {
  const size = sizeFor(node.tag);
  const b = node.bounds || { x: 0, y: 0 };
  return {
    x: b.x,
    y: b.y,
    width:  b.width  !== undefined ? b.width  : size.width,
    height: b.height !== undefined ? b.height : size.height,
  };
}