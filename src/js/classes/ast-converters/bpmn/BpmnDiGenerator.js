import { BpmnLayoutGenerator } from './BpmnLayoutGenerator.js';
import { sizeFor } from './definitions.js';

export function recalculateDi(model) {
  const layout = new BpmnLayoutGenerator(model);
  layout.generate();

  // 1. артефакты — bounds и waypoints по новым координатам задач
  for (const process of model.processes) {
    applyArtifactBounds(process);
  }
  applyCollaborationArtifacts(model);

  // 2. boundary — на границу владельца
  for (const process of model.processes) {
    fixBoundaryBounds(process);
  }

  // 3. процессы стопкой друг под другом
  stackProcesses(model);

  // 4. после сдвига — пересчитать waypoints ассоциаций (они привязаны к артефактам и задачам)
  for (const process of model.processes) {
    refreshAssocWaypoints(process);
  }
  refreshCollaborationWaypoints(model);

  return model;
}

/* ------------------------------------------------------------------ *
 *  Артефакты
 * ------------------------------------------------------------------ */

function applyArtifactBounds(process) {
  const nodesById = new Map();
  collectNodesById(process.flowNodes, nodesById);

  for (const ref of process.dataObjectRefs) {
    const owner = findAssocOwner(process, ref.id);
    if (!owner || !owner.bounds) continue;
    ref.bounds = {
      x: owner.bounds.x + owner.bounds.width / 2 - 18,
      y: owner.bounds.y - 30 - 50,
      width: 36, height: 50,
    };
    nodesById.set(ref.id, { id: ref.id, tag: 'dataObjectReference', bounds: ref.bounds });
  }

  for (const ref of process.dataStores) {
    const owner = findAssocOwner(process, ref.id);
    if (!owner || !owner.bounds) continue;
    const pool = process.bounds || owner.bounds;
    ref.bounds = {
      x: owner.bounds.x + owner.bounds.width / 2 - 25,
      y: pool.y + (pool.height || 0) + 30,
      width: 50, height: 50,
    };
    nodesById.set(ref.id, { id: ref.id, tag: 'dataStoreReference', bounds: ref.bounds });
  }

  const allNodes = collectAllNodes(process.flowNodes);
  for (const node of allNodes) {
    for (const a of node.dataOutputAssocs || []) {
      const source = nodesById.get(node.id);
      const target = nodesById.get(a.targetRef);
      if (!source || !target) continue;
      a.waypoints = simpleWaypoints(source, target);
    }
  }
}

function applyCollaborationArtifacts(model) {
  const collab = model.collaboration;
  if (!collab) return;

  const nodesById = new Map();
  for (const proc of model.processes) {
    collectNodesById(proc.flowNodes, nodesById);
    for (const ref of proc.dataObjectRefs) {
      nodesById.set(ref.id, { id: ref.id, tag: 'dataObjectReference', bounds: ref.bounds });
    }
    for (const ref of proc.dataStores) {
      nodesById.set(ref.id, { id: ref.id, tag: 'dataStoreReference', bounds: ref.bounds });
    }
  }
  for (const ta of collab.textAnnotations) {
    const owner = findAssocOwnerAll(model, ta.id);
    if (owner && owner.bounds) {
      ta.bounds = {
        x: owner.bounds.x + owner.bounds.width / 2 - 50,
        y: owner.bounds.y - 32 - 30,
        width: 100, height: 30,
      };
    }
    nodesById.set(ta.id, { id: ta.id, tag: 'textAnnotation', bounds: ta.bounds });
  }

  for (const a of collab.associations) {
    const s = nodesById.get(a.sourceRef);
    const t = nodesById.get(a.targetRef);
    if (!s || !t) continue;
    a.waypoints = simpleWaypoints(s, t);
  }

  for (const mf of collab.messageFlows) {
    const s = nodesById.get(mf.sourceRef);
    const t = nodesById.get(mf.targetRef);
    if (!s || !t) continue;
    mf.waypoints = simpleWaypoints(s, t);
  }
}

/* ------------------------------------------------------------------ *
 *  Boundary — на границу владельца
 * ------------------------------------------------------------------ */

function fixBoundaryBounds(process) {
  const allNodes = collectAllNodes(process.flowNodes);
  for (const node of allNodes) {
    if (node.tag !== 'boundaryEvent') continue;
    const owner = allNodes.find(n => n.id === node.attachedToRef);
    if (!owner || !owner.bounds) continue;
    const ob = owner.bounds;
    node.bounds = {
      x: ob.x + ob.width / 2 - 18,
      y: ob.y + ob.height - 18,
      width: 36, height: 36,
    };
  }
}

/* ------------------------------------------------------------------ *
 *  Процессы стопкой
 * ------------------------------------------------------------------ */

function stackProcesses(model) {
  let y = 0;
  for (const process of model.processes) {
    if (!process.bounds) continue;
    const dy = y - process.bounds.y;
    if (dy !== 0) {
      shiftProcessBy(process, 0, dy);
    }
    y = process.bounds.y + process.bounds.height + 50;
  }
}

function shiftProcessBy(process, dx, dy) {
  if (process.bounds) {
    process.bounds.x += dx;
    process.bounds.y += dy;
  }
  for (const lane of process.lanes) {
    if (lane.bounds) {
      lane.bounds.x += dx;
      lane.bounds.y += dy;
    }
  }
  const allNodes = collectAllNodes(process.flowNodes);
  for (const node of allNodes) {
    if (node.bounds) {
      node.bounds.x += dx;
      node.bounds.y += dy;
    }
  }
  for (const flow of process.sequenceFlows) {
    if (flow.waypoints) {
      flow.waypoints = flow.waypoints.map(([x, y2]) => [x + dx, y2 + dy]);
    }
  }
  for (const node of allNodes) {
    for (const flow of node.sequenceFlows || []) {
      if (flow.waypoints) {
        flow.waypoints = flow.waypoints.map(([x, y2]) => [x + dx, y2 + dy]);
      }
    }
  }
  for (const ref of process.dataObjectRefs) {
    if (ref.bounds) { ref.bounds.x += dx; ref.bounds.y += dy; }
  }
  for (const ref of process.dataStores) {
    if (ref.bounds) { ref.bounds.x += dx; ref.bounds.y += dy; }
  }
  for (const node of allNodes) {
    for (const a of node.dataOutputAssocs || []) {
      if (a.waypoints) {
        a.waypoints = a.waypoints.map(([x, y2]) => [x + dx, y2 + dy]);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Пересчёт waypoints после сдвига
 * ------------------------------------------------------------------ */

function refreshAssocWaypoints(process) {
  const nodesById = new Map();
  collectNodesById(process.flowNodes, nodesById);
  for (const ref of process.dataObjectRefs) {
    nodesById.set(ref.id, { id: ref.id, tag: 'dataObjectReference', bounds: ref.bounds });
  }
  for (const ref of process.dataStores) {
    nodesById.set(ref.id, { id: ref.id, tag: 'dataStoreReference', bounds: ref.bounds });
  }
  const allNodes = collectAllNodes(process.flowNodes);
  for (const node of allNodes) {
    for (const a of node.dataOutputAssocs || []) {
      const source = nodesById.get(node.id);
      const target = nodesById.get(a.targetRef);
      if (!source || !target) continue;
      a.waypoints = simpleWaypoints(source, target);
    }
  }
}

function refreshCollaborationWaypoints(model) {
  const collab = model.collaboration;
  if (!collab) return;

  const nodesById = new Map();
  for (const proc of model.processes) {
    collectNodesById(proc.flowNodes, nodesById);
    for (const ref of proc.dataObjectRefs) {
      nodesById.set(ref.id, { ref, tag: 'dataObjectReference', bounds: ref.bounds });
    }
    for (const ref of proc.dataStores) {
      nodesById.set(ref.id, { ref, tag: 'dataStoreReference', bounds: ref.bounds });
    }
  }
  for (const ta of collab.textAnnotations) {
    nodesById.set(ta.id, { id: ta.id, tag: 'textAnnotation', bounds: ta.bounds });
  }

  for (const a of collab.associations) {
    const s = nodesById.get(a.sourceRef);
    const t = nodesById.get(a.targetRef);
    if (!s || !t) continue;
    a.waypoints = simpleWaypoints(s, t);
  }

  for (const mf of collab.messageFlows) {
    const s = nodesById.get(mf.sourceRef);
    const t = nodesById.get(mf.targetRef);
    if (!s || !t) continue;
    mf.waypoints = simpleWaypoints(s, t);
  }
}

/* ------------------------------------------------------------------ *
 *  Утилиты
 * ------------------------------------------------------------------ */

function collectNodesById(nodes, map) {
  for (const node of nodes) {
    map.set(node.id, node);
    if (node.children && node.children.length) {
      collectNodesById(node.children, map);
    }
  }
}

function collectAllNodes(nodes) {
  const result = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children && node.children.length) {
      result.push(...collectAllNodes(node.children));
    }
  }
  return result;
}

function findAssocOwner(process, targetRef) {
  const check = (nodes) => {
    for (const n of nodes) {
      for (const a of n.dataOutputAssocs || []) {
        if (a.targetRef === targetRef) return n;
      }
      if (n.children && n.children.length) {
        const r = check(n.children);
        if (r) return r;
      }
    }
    return null;
  };
  return check(process.flowNodes);
}

function findAssocOwnerAll(model, targetRef) {
  for (const proc of model.processes) {
    const owner = findAssocOwner(proc, targetRef);
    if (owner) return owner;
  }
  const collab = model.collaboration;
  if (collab) {
    for (const a of collab.associations) {
      if (a.targetRef === targetRef) {
        for (const proc of model.processes) {
          const found = findNodeById(proc.flowNodes, a.sourceRef);
          if (found) return found;
        }
      }
    }
  }
  return null;
}

function findNodeById(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children && n.children.length) {
      const r = findNodeById(n.children, id);
      if (r) return r;
    }
  }
  return null;
}

function simpleWaypoints(source, target) {
  const s = boundsOf(source);
  const t = boundsOf(target);

  const sx = s.x + s.width / 2;
  const sy = s.y + s.height / 2;
  const tx = t.x + t.width / 2;
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
    x: b.x, y: b.y,
    width:  b.width  !== undefined ? b.width  : size.width,
    height: b.height !== undefined ? b.height : size.height,
  };
}