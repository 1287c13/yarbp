import { BpmnLayoutGenerator } from './BpmnLayoutGenerator.js';
import { LAYOUT } from './layoutConfig.js';
import {
  collectAllNodes, collectNodesById, collectNodeIds,
  findAssocOwner, findAssocOwnerAll, simpleWaypoints,
} from './layoutUtils.js';

/**
 * Переиспользование раскладки (B-6).
 *
 * Пока правится имя узла, геометрия не меняется, а `BpmnLayoutGenerator`
 * считался заново целиком (это самый дорогой шаг пересборки). Ключ —
 * «структурная» часть модели: id, теги, связи, артефакты, явные координаты;
 * имена и подписи в него не входят. При совпадении координаты берутся из кэша,
 * а пост-обработка DI (артефакты, границы, укладка пулов) выполняется как
 * обычно — она дешёвая и от имён тоже не зависит.
 */
const LAYOUT_CACHE_LIMIT = 8;
const layoutCache = new Map();
const layoutStats = { runs: 0, hits: 0 };

export function getLayoutStats() {
  return { runs: layoutStats.runs, hits: layoutStats.hits };
}

export function resetLayoutStats() {
  layoutStats.runs = 0;
  layoutStats.hits = 0;
}

function structuralKey(model) {
  const parts = [];

  const collab = model.collaboration;
  parts.push(collab ? [
    collab.participants.map(p => p.id + '>' + p.processRef).join(','),
    collab.associations.map(a => a.id + ':' + a.sourceRef + '>' + a.targetRef).join(','),
    collab.messageFlows.map(m => m.id + ':' + m.sourceRef + '>' + m.targetRef).join(','),
    collab.textAnnotations.map(t => t.id).join(','),
  ].join('|') : '-');

  const boundsKey = (node) => (node.bounds
    ? [node.bounds.x, node.bounds.y, node.bounds.width, node.bounds.height].join(':')
    : '');
  const joinKey = (node) => (node.joinBounds
    ? [node.joinBounds.x, node.joinBounds.y].join(':')
    : '');

  for (const process of model.processes) {
    parts.push('p:' + process.id + ':' +
      process.lanes.map(l => l.id + '[' + l.flowNodeRefs.join(',') + ']').join(','));

    const walk = (nodes) => {
      for (const node of nodes) {
        parts.push([
          node.id, node.tag, node.laneId || '', node.attachedToRef || '',
          node.eventDefinition || '', node.cancelActivity === false ? 'nc' : '',
          node.defaultFlowId || '', node.loopCharacteristics || '',
          (node.dataInputAssocs || []).map(a => a.sourceRef).join(','),
          (node.dataOutputAssocs || []).map(a => a.targetRef).join(','),
          boundsKey(node), joinKey(node),
        ].join('/'));
        if (node.children && node.children.length) {
          parts.push('{');
          walk(node.children);
          parts.push('}');
        }
      }
    };
    walk(process.flowNodes);

    for (const flow of process.sequenceFlows) {
      parts.push(flow.id + '>' + flow.sourceRef + '-' + flow.targetRef + (flow.condition ? '/c' : ''));
    }
    for (const node of collectAllNodes(process.flowNodes)) {
      for (const flow of node.sequenceFlows || []) {
        parts.push(flow.id + '>' + flow.sourceRef + '-' + flow.targetRef + (flow.condition ? '/c' : ''));
      }
    }

    parts.push('d:' + process.dataObjects.map(obj => obj.id).join(','));
    parts.push('r:' + process.dataObjectRefs.map(ref => ref.id + '>' + ref.dataObjectRef).join(','));
    parts.push('s:' + process.dataStores.map(ref => ref.id).join(','));
  }

  return parts.join('|');
}

function snapshotGeometry(model) {
  const copyPoint = (point) => (point ? { ...point } : null);
  const copyWaypoints = (points) => (points ? points.map(([x, y]) => [x, y]) : null);

  const processes = [];
  for (const process of model.processes) {
    const allNodes = collectAllNodes(process.flowNodes);

    const nodes = allNodes.map(node => ({
      id: node.id,
      bounds: copyPoint(node.bounds),
      labelPos: copyPoint(node.labelPos),
    }));

    const flows = [];
    const addFlow = (flow) => flows.push({
      id: flow.id,
      waypoints: copyWaypoints(flow.waypoints),
      labelPos: copyPoint(flow.labelPos),
    });
    for (const flow of process.sequenceFlows) addFlow(flow);
    for (const node of allNodes) {
      for (const flow of node.sequenceFlows || []) addFlow(flow);
    }

    processes.push({
      id: process.id,
      bounds: copyPoint(process.bounds),
      lanes: process.lanes.map(lane => ({ id: lane.id, bounds: copyPoint(lane.bounds) })),
      nodes,
      flows,
    });
  }
  return { processes };
}

function applyGeometry(model, snapshot) {
  const byProcessId = new Map(snapshot.processes.map(item => [item.id, item]));

  for (const process of model.processes) {
    const saved = byProcessId.get(process.id);
    if (!saved) return false;

    process.bounds = saved.bounds ? { ...saved.bounds } : null;

    const laneById = new Map(saved.lanes.map(item => [item.id, item]));
    for (const lane of process.lanes) {
      const laneSnapshot = laneById.get(lane.id);
      if (!laneSnapshot) return false;
      lane.bounds = laneSnapshot.bounds ? { ...laneSnapshot.bounds } : null;
    }

    const nodeById = new Map(saved.nodes.map(item => [item.id, item]));
    const allNodes = collectAllNodes(process.flowNodes);

    for (const node of allNodes) {
      const nodeSnapshot = nodeById.get(node.id);
      if (!nodeSnapshot) return false;
      node.bounds = nodeSnapshot.bounds ? { ...nodeSnapshot.bounds } : null;
      node.labelPos = nodeSnapshot.labelPos ? { ...nodeSnapshot.labelPos } : null;
    }

    const flowById = new Map(saved.flows.map(item => [item.id, item]));
    const restoreFlow = (flow) => {
      const flowSnapshot = flowById.get(flow.id);
      if (!flowSnapshot) return false;
      flow.waypoints = flowSnapshot.waypoints
        ? flowSnapshot.waypoints.map(([x, y]) => [x, y])
        : null;
      flow.labelPos = flowSnapshot.labelPos ? { ...flowSnapshot.labelPos } : null;
      return true;
    };

    for (const flow of process.sequenceFlows) {
      if (!restoreFlow(flow)) return false;
    }
    for (const node of allNodes) {
      for (const flow of node.sequenceFlows || []) {
        if (!restoreFlow(flow)) return false;
      }
    }
  }

  return true;
}

function rememberLayout(key, model) {
  if (layoutCache.has(key)) layoutCache.delete(key);
  layoutCache.set(key, snapshotGeometry(model));
  while (layoutCache.size > LAYOUT_CACHE_LIMIT) {
    layoutCache.delete(layoutCache.keys().next().value);
  }
}

export function recalculateDi(model) {
  const key = structuralKey(model);
  const cached = layoutCache.get(key);

  if (cached && applyGeometry(model, cached)) {
    layoutStats.hits++;
  } else {
    const layout = new BpmnLayoutGenerator(model);
    layout.generate();
    layoutStats.runs++;
    rememberLayout(key, model);
  }

  // сначала артефакты: они могут поднять верхнюю границу пула,
  // и участник должен получить уже итоговые размеры
  for (const process of model.processes) {
    applyArtifactBounds(process);
  }

  syncParticipantBounds(model);

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

  // Несколько артефактов над одной задачей встают в ряд: иначе `.данные Товар`
  // и `.данные Накладная` оказываются в одной точке и вторая рисуется поверх.
  const byOwner = new Map();
  for (const ref of process.dataObjectRefs) {
    const owner = findAssocOwner(process, ref.id);
    if (!owner || !owner.bounds) continue;
    if (!byOwner.has(owner.id)) byOwner.set(owner.id, []);
    byOwner.get(owner.id).push(ref);
  }

  let topMost = Infinity;

  for (const [ownerId, refs] of byOwner) {
    const owner = nodesById.get(ownerId);
    if (!owner || !owner.bounds) continue;

    const width = LAYOUT.dataObjectWidth;
    const gap = LAYOUT.dataObjectGap;
    const rowWidth = refs.length * width + (refs.length - 1) * gap;
    const startX = owner.bounds.x + owner.bounds.width / 2 - rowWidth / 2;
    const top = owner.bounds.y - LAYOUT.dataObjectAbove - LAYOUT.dataObjectHeight;

    refs.forEach((ref, index) => {
      ref.bounds = {
        x: startX + index * (width + gap),
        y: top,
        width,
        height: LAYOUT.dataObjectHeight,
      };
      // подпись не задаём: bpmn-io сам ставит её под объектом данных,
      // а нулевой BPMNLabel рисовался прямо поверх рамки
      nodesById.set(ref.id, { id: ref.id, tag: 'dataObjectReference', bounds: ref.bounds });
      topMost = Math.min(topMost, ref.bounds.y);
    });
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

  // Артефакты стоят над/под задачей, то есть за пределами пула: поднимаем рамку,
  // иначе подпись «Товар» срезается верхней границей. Если дорожки нарисованы,
  // видимая рамка — верхняя дорожка, её и тянем.
  const topLane = process.lanes
    .filter(lane => lane.bounds)
    .sort((a, b) => a.bounds.y - b.bounds.y)[0];

  const frameTop = topLane ? topLane.bounds.y
    : (process.bounds ? process.bounds.y : null);

  if (frameTop !== null && topMost !== Infinity) {
    const neededTop = topMost - LAYOUT.artifactLabelSpace;
    const extra = frameTop - neededTop;
    if (extra > 0) {
      if (process.bounds) {
        process.bounds.y -= extra;
        process.bounds.height += extra;
      }
      if (topLane) {
        topLane.bounds.y -= extra;
        topLane.bounds.height += extra;
      }
    }
  }

  const allNodes = collectAllNodes(process.flowNodes);
  for (const node of allNodes) {
    for (const a of node.dataOutputAssocs || []) {
      const source = nodesById.get(node.id);
      const target = nodesById.get(a.targetRef);
      if (!source || !target) continue;
      a.waypoints = simpleWaypoints(source, target);
    }
    for (const a of node.dataInputAssocs || []) {
      const source = nodesById.get(a.sourceRef);
      const target = nodesById.get(node.id);
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
    for (const a of node.dataInputAssocs || []) {
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
    for (const a of node.dataInputAssocs || []) {
      const source = nodesById.get(a.sourceRef);
      const target = nodesById.get(node.id);
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