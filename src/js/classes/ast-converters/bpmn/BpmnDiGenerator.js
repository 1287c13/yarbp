import { BpmnLayoutGenerator } from './BpmnLayoutGenerator.js';
import { LAYOUT } from './layoutConfig.js';
import {
  collectAllNodes, collectNodesById, collectNodeIds,
  findAssocOwner, findAssocOwnerAll, simpleWaypoints,
} from './layoutUtils.js';

export function recalculateDi(model) {
  const layout = new BpmnLayoutGenerator(model);
  layout.generate();

  syncParticipantBounds(model);

  for (const process of model.processes) {
    applyArtifactBounds(process);
  }
  applyCollaborationArtifacts(model);

  for (const process of model.processes) {
    fixBoundaryBounds(process);
  }

  stackProcesses(model);

  snapEndEventsToRightEdge(model);

  for (const process of model.processes) {
    refreshAssocWaypoints(process);
  }
  refreshCollaborationWaypoints(model);

  return model;
}

/* ---------------- участники ---------------- */

function syncParticipantBounds(model) {
  if (!model.collaboration) return;
  for (const process of model.processes) {
    const participant = model.collaboration.participants.find(
      p => p.processRef === process.id);
    if (!participant || !process.bounds) continue;
    participant.bounds = {
      x: process.bounds.x,
      y: process.bounds.y,
      width: process.bounds.width,
      height: process.bounds.height,
    };
  }
}

/* ---------------- артефакты процесса ---------------- */

function applyArtifactBounds(process) {
  const nodesById = new Map();
  collectNodesById(process.flowNodes, nodesById);

  for (const ref of process.dataObjectRefs) {
    const owner = findAssocOwner(process, ref.id);
    if (!owner || !owner.bounds) continue;
    ref.bounds = {
      x: owner.bounds.x + owner.bounds.width / 2 - LAYOUT.dataObjectWidth / 2,
      y: owner.bounds.y - LAYOUT.dataObjectAbove - LAYOUT.dataObjectHeight,
      width: LAYOUT.dataObjectWidth,
      height: LAYOUT.dataObjectHeight,
    };
    // подпись сверху по центру
    ref.labelPos = {
      x: ref.bounds.x + ref.bounds.width / 2,
      y: ref.bounds.y - 4,
    };
    nodesById.set(ref.id, { id: ref.id, tag: 'dataObjectReference', bounds: ref.bounds });
  }

  for (const ref of process.dataStores) {
    const owner = findAssocOwner(process, ref.id);
    if (!owner || !owner.bounds) continue;
    const pool = process.bounds || owner.bounds;
    ref.bounds = {
      x: owner.bounds.x + owner.bounds.width / 2 - LAYOUT.dataStoreWidth / 2,
      y: pool.y + (pool.height || 0) + LAYOUT.dataStoreBelow,
      width: LAYOUT.dataStoreWidth,
      height: LAYOUT.dataStoreHeight,
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

/* ---------------- артефакты collaboration ---------------- */

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
        x: owner.bounds.x + owner.bounds.width / 2 - LAYOUT.textAnnotationWidth / 2,
        y: owner.bounds.y - LAYOUT.textAnnotationAbove - LAYOUT.textAnnotationHeight,
        width: LAYOUT.textAnnotationWidth,
        height: LAYOUT.textAnnotationHeight,
      };
    }
    nodesById.set(ta.id, { id: ta.id, tag: 'textAnnotation', bounds: ta.bounds });
  }

  for (const a of collab.associations) {
    const s = nodesById.get(a.sourceRef);
    const t = nodesById.get(a.targetRef);
    if (!s || !t || !s.bounds || !t.bounds) continue;
    a.waypoints = simpleWaypoints(s, t);
  }

  for (const mf of collab.messageFlows) {
    const s = nodesById.get(mf.sourceRef);
    const t = nodesById.get(mf.targetRef);
    if (!s || !t || !s.bounds || !t.bounds) continue;
    mf.waypoints = simpleWaypoints(s, t);
  }
}

/* ---------------- пограничные события ---------------- */

function fixBoundaryBounds(process) {
  const allNodes = collectAllNodes(process.flowNodes);
  for (const node of allNodes) {
    if (node.tag !== 'boundaryEvent') continue;
    const owner = allNodes.find(n => n.id === node.attachedToRef);
    if (!owner || !owner.bounds) continue;
    const ob = owner.bounds;
    node.bounds = {
      x: ob.x + ob.width - LAYOUT.boundarySize - LAYOUT.boundaryRightShift,
      y: ob.y + ob.height - LAYOUT.boundaryBottomOffset,
      width: LAYOUT.boundarySize,
      height: LAYOUT.boundarySize,
    };
  }
}

/* ---------------- вертикальная укладка пулов ---------------- */

function stackProcesses(model) {
  let y = 0;
  for (const process of model.processes) {
    if (!process.bounds) continue;
    const dy = y - process.bounds.y;
    if (dy !== 0) {
      shiftProcessBy(process, 0, dy);
      if (model.collaboration) {
        for (const p of model.collaboration.participants) {
          if (p.processRef === process.id && p.bounds) {
            p.bounds.y += dy;
          }
        }
        shiftProcessTextAnnotations(model, process, dy);
      }
    }
    y = process.bounds.y + process.bounds.height + LAYOUT.poolStackGap;
  }
}

function shiftProcessTextAnnotations(model, process, dy) {
  const collab = model.collaboration;
  if (!collab || !collab.textAnnotations.length) return;

  const nodeIds = new Set();
  collectNodeIds(process.flowNodes, nodeIds);

  const taIds = new Set();
  for (const a of collab.associations) {
    if (nodeIds.has(a.sourceRef) && collab.textAnnotations.some(t => t.id === a.targetRef)) {
      taIds.add(a.targetRef);
    }
    if (nodeIds.has(a.targetRef) && collab.textAnnotations.some(t => t.id === a.sourceRef)) {
      taIds.add(a.sourceRef);
    }
  }

  for (const ta of collab.textAnnotations) {
    if (taIds.has(ta.id) && ta.bounds) {
      ta.bounds.y += dy;
    }
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
    if (node.labelPos) {
      node.labelPos.x += dx;
      node.labelPos.y += dy;
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
    if (ref.labelPos) { ref.labelPos.x += dx; ref.labelPos.y += dy; }
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

/* ---------------- end-события у правого края пула ---------------- */

function snapEndEventsToRightEdge(model) {
  for (const process of model.processes) {
    if (!process.bounds) { console.log('no bounds', process.id); continue; }
    console.log('process', process.id,
                'pool.x', process.bounds.x,
                'pool.width', process.bounds.width,
                'poolRight', process.bounds.x + process.bounds.width);

    const poolRight = process.bounds.x + process.bounds.width;
    const targetRight = poolRight - LAYOUT.endEventRightMargin;

    for (const node of process.flowNodes) {
      if (node.tag !== 'endEvent') continue;
      console.log('  endEvent', node.id,
                  'bounds', JSON.stringify(node.bounds),
                  'right', node.bounds ? node.bounds.x + node.bounds.width : 'n/a');
      if (!node.bounds) continue;

      const b = node.bounds;
      if (!Number.isFinite(b.x) || !Number.isFinite(b.width)) {
        console.log('    skip: bad x/width');
        continue;
      }

      const dx = targetRight - (b.x + b.width);
      console.log('    targetRight', targetRight, 'dx', dx);
      if (!Number.isFinite(dx) || dx === 0) continue;

      b.x += dx;
      shiftIncomingFlows(process, node.id, dx);
    }
  }
}

function shiftIncomingFlows(process, targetId, dx) {
  const shiftFlow = (flow) => {
    if (flow.targetRef !== targetId) return;
    if (!flow.waypoints || !flow.waypoints.length) return;

    const last = flow.waypoints.length - 1;
    const [lx, ly] = flow.waypoints[last];
    if (!Number.isFinite(lx)) return;

    // сдвигаем только последнюю точку (вход в end-событие)
    flow.waypoints[last] = [lx + dx, ly];
  };

  for (const flow of process.sequenceFlows) shiftFlow(flow);
  for (const node of collectAllNodes(process.flowNodes)) {
    for (const flow of node.sequenceFlows || []) shiftFlow(flow);
  }
}

/* ---------------- пересчёт waypoints ---------------- */

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
      if (!source || !target || !source.bounds || !target.bounds) continue;
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
      nodesById.set(ref.id, { id: ref.id, tag: 'dataObjectReference', bounds: ref.bounds });
    }
    for (const ref of proc.dataStores) {
      nodesById.set(ref.id, { id: ref.id, tag: 'dataStoreReference', bounds: ref.bounds });
    }
  }
  for (const ta of collab.textAnnotations) {
    nodesById.set(ta.id, { id: ta.id, tag: 'textAnnotation', bounds: ta.bounds });
  }

  for (const a of collab.associations) {
    const s = nodesById.get(a.sourceRef);
    const t = nodesById.get(a.targetRef);
    if (!s || !t || !s.bounds || !t.bounds) continue;
    a.waypoints = simpleWaypoints(s, t);
  }

  for (const mf of collab.messageFlows) {
    const s = nodesById.get(mf.sourceRef);
    const t = nodesById.get(mf.targetRef);
    if (!s || !t || !s.bounds || !t.bounds) continue;
    mf.waypoints = simpleWaypoints(s, t);
  }
}