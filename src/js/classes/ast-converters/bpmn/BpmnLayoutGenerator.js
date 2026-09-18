/**
 * Порт BpmnLayoutGenerator с Python.
 * Раскладка одного процесса: сетка (столбец × ветка × лейн) → координаты → waypoints.
 */

import { LAYOUT } from './layoutConfig.js';
import { sizeFor } from './definitions.js';
import { findAssocOwner } from './layoutUtils.js';

export class BpmnLayoutGenerator {
  constructor(model) {
    this.model = model;

    this.branchCounter = 1;
    this.numOfBrunches = 0;

    this.nodesById       = new Map();
    this.laneIndexById   = new Map();
    this.repr            = new Map();
    this.subprocesses    = [];
    this.elemParams      = new Map();
    this.edgesParams     = new Map();
    this.grid            = { cols: [], rows: [] };
    this.startEventsIds  = [];
    this.nodesToVisitIds = [];
    this.lanesCache      = new Map();
    this.boundaryOwners  = new Set();
    this.artifactsAboveTask = new Map();
  }

  generate() {
    for (const process of this.model.processes) {
      this.generateForProcess(process);
    }
  }

  generateForProcess(process) {
    this.branchCounter = 1;
    this.subprocesses = [];
    this.nodesById = new Map();
    this.laneIndexById = new Map();
    this.elemParams = new Map();
    this.edgesParams = new Map();
    this.grid = { cols: [], rows: [] };
    this.startEventsIds = [];
    this.nodesToVisitIds = [];
    this.lanesCache = new Map();
    this.boundaryOwners = new Set();
    this.artifactsAboveTask = new Map();

    this.collectNodes(process.flowNodes, process);
    this.collectLaneIndexes(process);
    this.repr = this.buildRepr(process.flowNodes, process.sequenceFlows);
    this.collectSubprocesses(process.flowNodes, process);
    this.collectArtifactsAbove(process);

    this.addStructureAttrs(this.repr);
    for (const sp of this.subprocesses) this.addStructureAttrs(sp.repr);

    this.calcGridStructure(this.repr);
    for (const sp of this.subprocesses) this.calcGridStructure(sp.repr);

    this.calcGridSizes(process);

    this.calcElemsCoords(this.repr, this.grid);
    for (const sp of this.subprocesses) {
      this.calcElemsCoords(sp.repr, sp.grid, sp.id);
    }

    this.attachBoundaryParams(this.repr);
    for (const sp of this.subprocesses) this.attachBoundaryParams(sp.repr);

    this.calcEdges(this.repr);
    for (const sp of this.subprocesses) this.calcEdges(sp.repr);

    this.optimizeLayout();
    this.updatePool(process);

    this.applyToModel(process);
    for (const sp of this.subprocesses) this.applyToSubprocess(sp);
  }

  /* ---------------- Сбор данных ---------------- */

  collectNodes(nodes, process) {
    for (const node of nodes) {
      this.nodesById.set(node.id, node);
      if (node.tag === 'boundaryEvent' && node.attachedToRef) {
        this.boundaryOwners.add(node.attachedToRef);
      }
      if (node.children && node.children.length) {
        this.collectNodes(node.children, process);
      }
    }
  }

  collectArtifactsAbove(process) {
    const ARTIFACT_H = LAYOUT.textAnnotationHeight;
    const GAP = LAYOUT.textAnnotationAbove;

    for (const ref of process.dataObjectRefs) {
      const owner = findAssocOwner(process, ref.id);
      if (!owner) continue;
      const cur = this.artifactsAboveTask.get(owner.id) || 0;
      this.artifactsAboveTask.set(owner.id, cur + ARTIFACT_H + GAP);
    }

    const collab = this.model.collaboration;
    if (collab) {
      for (const assoc of collab.associations) {
        const ta = collab.textAnnotations.find(t => t.id === assoc.targetRef);
        if (!ta) continue;
        const owner = this.nodesById.get(assoc.sourceRef);
        if (!owner) continue;
        const cur = this.artifactsAboveTask.get(owner.id) || 0;
        this.artifactsAboveTask.set(owner.id, cur + ARTIFACT_H + GAP);
      }
    }
  }

  collectLaneIndexes(process) {
    let idx = 1;
    for (const lane of process.lanes) this.laneIndexById.set(lane.id, idx++);
  }

  buildRepr(flowNodes, sequenceFlows) {
    const repr = new Map();
    for (const node of flowNodes) {
      repr.set(node.id, {
        id: node.id, tag: node.tag, name: node.name, node,
        incoming: [...node.incoming], outgoing: [...node.outgoing],
      });
    }
    for (const flow of sequenceFlows) {
      repr.set(flow.id, {
        id: flow.id, tag: 'sequenceFlow',
        sourceRef: flow.sourceRef, targetRef: flow.targetRef,
        name: flow.name, flow,
      });
    }
    return repr;
  }

  collectSubprocesses(flowNodes, process) {
    for (const node of flowNodes) {
      if (node.tag === 'subProcess') {
        const sp = {
          id: node.id,
          lane: this.laneIndexById.get(node.laneId) || 1,
          flowNodes: node.children || [],
          sequenceFlows: node.sequenceFlows || [],
          repr: null,
          grid: { cols: [], rows: [] },
          node,
        };
        sp.repr = this.buildRepr(sp.flowNodes, sp.sequenceFlows);
        this.subprocesses.push(sp);
      }
      if (node.children && node.children.length) {
        this.collectSubprocesses(node.children, process);
      }
    }
  }

  /* ---------------- 1. add_structure_attrs ---------------- */

  addStructureAttrs(repr) {
    this.branchCounter = 1;
    this.startEventsIds = this.getStartEventsIds(repr);

    for (const startId of this.startEventsIds) {
      this.traverseAndAssignBranchNumbers(startId, repr);
    }

    for (const [id, elem] of repr) {
      if (elem.tag !== 'boundaryEvent') continue;
      if (elem.branch !== undefined) continue;
      const ownerId = elem.node && elem.node.attachedToRef;
      if (!ownerId) continue;
      const owner = repr.get(ownerId);
      if (owner && owner.branch !== undefined) elem.branch = owner.branch;
    }

    const boundaryNodes = [...repr.entries()]
      .filter(([id, e]) => e.tag === 'boundaryEvent' && e.branch !== undefined);

    for (const [id, boundary] of boundaryNodes) {
      const targetIds = this.getConnectedNodesIds(id, repr, 'target');
      for (const tId of targetIds) {
        const t = repr.get(tId);
        if (!t || t.branch !== undefined) continue;
        const branch = this.branchCounter;
        this.branchCounter++;
        this.assignBranchChain(tId, repr, branch);
      }
    }
  }

  assignBranchChain(startId, repr, branch) {
    const start = repr.get(startId);
    if (!start || start.branch !== undefined) return;
    start.branch = branch;

    let nextId = this.exploreNeighboringNodes(startId, repr, branch);
    while (nextId) {
      nextId = this.exploreNeighboringNodes(nextId, repr, branch);
    }

    let queued = this.nodesToVisitIds.pop();
    while (queued !== undefined) {
      const q = repr.get(queued);
      if (q && q.branch === undefined) {
        const newBranch = this.branchCounter;
        this.branchCounter++;
        this.assignBranchChain(queued, repr, newBranch);
      }
      queued = this.nodesToVisitIds.pop();
    }
  }

  getStartEventsIds(repr) {
    const result = [];
    for (const [id, elem] of repr) if (elem.tag === 'startEvent') result.push(id);
    return result;
  }

  traverseAndAssignBranchNumbers(initialElemId, repr) {
    const elem = repr.get(initialElemId);
    if (!elem || elem.branch !== undefined) return;

    elem.branch = this.branchCounter;
    if (elem.tag === 'subProcess') this.addSubprocessRef(elem.id);

    let nextElemId = this.exploreNeighboringNodes(initialElemId, repr, this.branchCounter);
    while (nextElemId) {
      const nextElem = repr.get(nextElemId);
      if (nextElem && nextElem.tag === 'subProcess') this.addSubprocessRef(nextElemId);
      nextElemId = this.exploreNeighboringNodes(nextElemId, repr, this.branchCounter);
    }

    this.branchCounter++;

    const nextBranchFirstElem = this.nodesToVisitIds.pop();
    if (nextBranchFirstElem !== undefined) {
      this.traverseAndAssignBranchNumbers(nextBranchFirstElem, repr);
    }
  }

  addSubprocessRef(subprocessId) {
    const sp = this.subprocesses.find(s => s.id === subprocessId);
    if (sp && sp.node.laneId) sp.lane = this.laneIndexById.get(sp.node.laneId) || sp.lane;
  }

  exploreNeighboringNodes(parentNodeId, repr, branch) {
    const targetNodesIds = this.getConnectedNodesIds(parentNodeId, repr, 'target');
    if (targetNodesIds.length > 1) this.nodesToVisitIds.push(...targetNodesIds.slice(1));
    if (targetNodesIds.length === 0) return null;
    const first = targetNodesIds[0];
    const elem = repr.get(first);
    if (elem && elem.branch === undefined) elem.branch = branch;
    return first;
  }

  getConnectedNodesIds(parentNodeId, repr, direction) {
    const elem = repr.get(parentNodeId);
    if (!elem) return [];
    const flowIds = direction === 'target' ? elem.outgoing : elem.incoming;
    const result = [];
    for (const flowId of flowIds) {
      const flow = repr.get(flowId);
      if (!flow) continue;
      result.push(direction === 'target' ? flow.targetRef : flow.sourceRef);
    }
    return result;
  }

  /* ---------------- 2. calc_grid_structure ---------------- */

  calcGridStructure(repr) {
    const currentColElemsIds = this.getStartEventsIds(repr);
    const delayedProcessingQueue = new Set();
    const sourceNodesIdsCache = new Map();
    const targetNodesIdsCache = new Map();

    let col = 1;
    while (currentColElemsIds.length) {
      const nextColElemsIds = [];

      for (const id of currentColElemsIds) {
        const elem = repr.get(id);
        if (!elem || elem.col !== undefined) continue;

        targetNodesIdsCache.set(id, this.getConnectedNodesIds(id, repr, 'target'));
        sourceNodesIdsCache.set(id, this.getConnectedNodesIds(id, repr, 'source'));

        const sourceIds = sourceNodesIdsCache.get(id);
        if (sourceIds.length < 2) {
          elem.col = col;
          for (const targId of targetNodesIdsCache.get(id)) nextColElemsIds.push(targId);
        } else {
          delayedProcessingQueue.add(id);
        }
      }

      const toRemove = [];
      for (const id of delayedProcessingQueue) {
        const elem = repr.get(id);
        const sourceIds = sourceNodesIdsCache.get(id);
        const allSourcesHaveCol = sourceIds.every(s => repr.get(s) && repr.get(s).col !== undefined);
        const anySourceInThisCol = sourceIds.some(s => repr.get(s) && repr.get(s).col === col);

        if (allSourcesHaveCol && !anySourceInThisCol) {
          toRemove.push(id);
          if (elem.col === undefined) {
            elem.col = col;
            for (const targId of targetNodesIdsCache.get(id)) nextColElemsIds.push(targId);
          }
        }
      }
      for (const id of toRemove) delayedProcessingQueue.delete(id);

      currentColElemsIds.length = 0;
      currentColElemsIds.push(...nextColElemsIds);
      col++;
    }

    for (const [id, elem] of repr) {
      if (elem.tag !== 'boundaryEvent') continue;
      if (elem.col !== undefined) continue;
      const ownerId = elem.node && elem.node.attachedToRef;
      if (!ownerId) continue;
      const owner = repr.get(ownerId);
      if (owner && owner.col !== undefined) elem.col = owner.col;
    }

    let changed = true;
    let safety = 1000;
    while (changed && safety-- > 0) {
      changed = false;
      for (const [id, elem] of repr) {
        if (elem.tag === 'sequenceFlow') continue;
        if (elem.tag === 'laneSet') continue;
        if (elem.col !== undefined) continue;

        const sourceIds = this.getConnectedNodesIds(id, repr, 'source');
        if (!sourceIds.length) continue;

        const allHaveCol = sourceIds.every(s => {
          const n = repr.get(s);
          return n && n.col !== undefined;
        });

        if (allHaveCol) {
          const maxSrcCol = Math.max(...sourceIds.map(s => repr.get(s).col || 0));
          elem.col = maxSrcCol + 1;
          changed = true;
        }
      }
    }
  }

  /* ---------------- 3. calc_grid_sizes ---------------- */

  calcGridSizes(process) {
    const filtered = [...this.repr.values()].filter(
      x => x.tag !== 'sequenceFlow' && x.tag !== 'laneSet');

    this.numOfBrunches = filtered.reduce(
      (acc, item) => Math.max(acc, item.branch || 0), 0);

    for (let i = this.subprocesses.length - 1; i >= 0; i--) {
      const sp = this.subprocesses[i];
      const paramsList = [];
      for (const [id, elem] of sp.repr) {
        if (elem.tag === 'sequenceFlow' || elem.tag === 'laneSet') continue;
        if (elem.tag === 'incoming' || elem.tag === 'outgoing') continue;
        if (elem.tag === 'boundaryEvent') continue;
        paramsList.push(this.calcElementGridParams(elem, sp.lane, sp.id));
      }
      this.updateGrid(sp.grid, paramsList);
      sp.grid.rows = [LAYOUT.visualIndent, ...sp.grid.rows, LAYOUT.visualIndent];
      for (const v of this.elemParams.values()) {
        if (v.p === sp.id) v.r += 1;
      }
    }

    const paramsList = [];
    for (const [id, elem] of this.repr) {
      if (elem.tag === 'sequenceFlow' || elem.tag === 'laneSet') continue;
      if (elem.tag === 'incoming' || elem.tag === 'outgoing') continue;
      if (elem.tag === 'boundaryEvent') continue;

      let lane;
      if (elem.tag.includes('Event') || elem.tag.includes('Gateway')) {
        const sourceIds = this.getConnectedNodesIds(id, this.repr, 'source');
        if (sourceIds.length && elem.branch === this.repr.get(sourceIds[0])?.branch) {
          lane = this.lanesCache.get(sourceIds[0]) || this.getElemLaneNumber(sourceIds[0]);
          this.lanesCache.set(id, lane);
        } else {
          lane = this.getElemLaneNumber(id);
        }
      } else {
        lane = this.getElemLaneNumber(id);
      }

      paramsList.push(this.calcElementGridParams(elem, lane));
    }

    this.updateGrid(this.grid, paramsList);
  }

  calcElementGridParams(elem, lane, processId) {
    let subprocessWidth = null;
    let subprocessHeight = null;

    if (elem.tag === 'subProcess') {
      const sp = this.subprocesses.find(x => x.id === elem.id);
      if (sp) {
        subprocessWidth  = sp.grid.cols.reduce((a, b) => a + b, 0);
        subprocessHeight = sp.grid.rows.reduce((a, b) => a + b, 0);
      }
    }

    const size = sizeFor(elem.tag);
    const artifactsH = this.artifactsAboveTask.get(elem.id) || 0;

    const realH = subprocessHeight || size.height;

    return {
      id: elem.id,
      c: ((elem.col || 1) - 1) * this.numOfBrunches + (elem.branch || 1),
      r: ((lane || 1) - 1) * this.numOfBrunches + (elem.branch || 1),
      w: subprocessWidth || size.width,
      h: realH + artifactsH,
      realH,
      artifactsH,
      p: processId || null,
      node: elem.node,
    };
  }

  updateGrid(grid, paramsList) {
    for (const p of paramsList) this.elemParams.set(p.id, p);

    if (!paramsList.length) {
      grid.cols = [];
      grid.rows = [];
      return;
    }

    const maxC = Math.max(...paramsList.map(x => x.c));
    const maxR = Math.max(...paramsList.map(x => x.r));

    grid.cols = new Array(maxC).fill(0);
    grid.rows = new Array(maxR).fill(0);

    for (let i = 0; i < grid.cols.length; i++) {
      const inCol = paramsList.filter(y => y.c === i + 1);
      grid.cols[i] = inCol.length ? Math.max(...inCol.map(x => x.w)) + 2 * LAYOUT.visualIndent : 0;
    }
    for (let i = 0; i < grid.rows.length; i++) {
      const inRow = paramsList.filter(y => y.r === i + 1);
      grid.rows[i] = inRow.length ? Math.max(...inRow.map(x => x.h)) + 2 * LAYOUT.visualIndent : 0;
    }
  }

  getElemLaneNumber(elemId) {
    const node = this.nodesById.get(elemId);
    if (!node || !node.laneId) return 1;
    return this.laneIndexById.get(node.laneId) || 1;
  }

  attachBoundaryParams(repr) {
    for (const [id, elem] of repr) {
      if (elem.tag !== 'boundaryEvent') continue;
      const ownerId = elem.node && elem.node.attachedToRef;
      if (!ownerId) continue;
      const owner = this.elemParams.get(ownerId);
      if (!owner) continue;
      const ownerRealH = owner.realH || owner.h;
      this.elemParams.set(id, {
        id,
        x: owner.x + owner.w - LAYOUT.boundarySize - LAYOUT.boundaryRightShift,
        y: owner.y + ownerRealH - LAYOUT.boundaryBottomOffset,
        w: LAYOUT.boundarySize,
        h: LAYOUT.boundarySize,
        realH: LAYOUT.boundarySize,
        c: owner.c, r: owner.r, node: elem.node,
      });
    }
  }

  /* ---------------- 4. calc_elems_coords ---------------- */

  calcElemsCoords(repr, grid, processId) {
    let subprocessShiftLeft = 0;
    let subprocessShiftTop = 0;

    if (processId) {
      const parentParams = this.elemParams.get(processId);
      if (parentParams) {
        subprocessShiftLeft = parentParams.x || 0;
        subprocessShiftTop  = parentParams.y || 0;
      }
    }

    for (const [id, elem] of repr) {
      if (elem.tag === 'sequenceFlow' || elem.tag === 'laneSet') continue;
      if (elem.tag === 'incoming' || elem.tag === 'outgoing') continue;

      const params = this.elemParams.get(id);
      if (!params) continue;

      const cellWidth  = grid.cols[params.c - 1] || 0;
      const cellHeight = grid.rows[params.r - 1] || 0;

      const accumulatedWidth  = grid.cols.slice(0, params.c - 1).reduce((a, b) => a + b, 0);
      const accumulatedHeight = grid.rows.slice(0, params.r - 1).reduce((a, b) => a + b, 0);

      const taskH = params.realH || params.h;

      params.x = accumulatedWidth + (cellWidth - params.w) / 2 + subprocessShiftLeft;
      params.y = accumulatedHeight + (cellHeight - taskH) / 2 + subprocessShiftTop;
    }
  }

  /* ---------------- 5. calc_edges ---------------- */

  calcEdges(repr) {
    for (const [id, elem] of repr) {
      if (elem.tag !== 'sequenceFlow') continue;

      const sourceParams = this.elemParams.get(elem.sourceRef);
      const targetParams = this.elemParams.get(elem.targetRef);
      if (!sourceParams || !targetParams) continue;

      const sourceIsBoundary = sourceParams.node && sourceParams.node.tag === 'boundaryEvent';

      if (sourceIsBoundary) {
        const firstWaypoint = this.getNodeHandleCoords(sourceParams.id, 'b');
        const lastWaypoint  = this.getNodeHandleCoords(targetParams.id, 'l');
        const waypoints = [
          firstWaypoint,
          [firstWaypoint[0], lastWaypoint[1]],
          lastWaypoint,
        ];
        this.edgesParams.set(id, {
          waypoints,
          label: [firstWaypoint[0] + LAYOUT.visualIndent / 2,
                  firstWaypoint[1] + LAYOUT.visualIndent / 2],
        });
        continue;
      }

      const isRightShift = sourceParams.c < targetParams.c;
      const isDownShift  = sourceParams.r < targetParams.r;
      const isUpShift    = sourceParams.r > targetParams.r;

      let arrowType = 'rl';

      const sourceIsGateway = this.isGatewayId(sourceParams.id);
      const targetHasBoundary = this.boundaryOwners.has(targetParams.id);

      if (isRightShift && isDownShift
          && (sourceIsGateway || targetHasBoundary)
          && !this.isUpperBranchOfGateway(sourceParams.id, id)) {
        arrowType = 'bl';
      } else if (isRightShift && isDownShift) {
        arrowType = 'rt';
      } else if (isRightShift && isUpShift
          && this.isGatewayId(targetParams.id)
          && !this.isUpperBranchOfGateway(targetParams.id, id)) {
        arrowType = 'rb';
      } else if (isRightShift && isUpShift) {
        arrowType = 'tl';
      } else if (this.isGatewayId(sourceParams.id)
          && this.isGatewayId(targetParams.id)
          && !this.isUpperBranchOfGateway(sourceParams.id, id)) {
        arrowType = 'bb';
      } else if (!isRightShift) {
        arrowType = 'tt';
      }

      const firstWaypoint = this.getNodeHandleCoords(sourceParams.id, arrowType[0]);
      const lastWaypoint  = this.getNodeHandleCoords(targetParams.id, arrowType[1]);

      let waypoints;
      if (arrowType === 'bl' || arrowType === 'tl') {
        waypoints = [firstWaypoint, [firstWaypoint[0], lastWaypoint[1]], lastWaypoint];
      } else if (arrowType === 'rb' || arrowType === 'rt') {
        waypoints = [firstWaypoint, [lastWaypoint[0], firstWaypoint[1]], lastWaypoint];
      } else if (arrowType === 'bb') {
        const lowerRow = Math.max(sourceParams.r, targetParams.r);
        const elemsOfRow = [...this.elemParams.values()].filter(x => x.r === lowerRow && x.id);
        const elemsOfStructure = elemsOfRow.filter(e => repr.has(e.id));
        const largestElem = elemsOfStructure.reduce(
          (acc, x) => (this.elemParams.get(x.id).h > this.elemParams.get(acc.id).h ? x : acc),
          elemsOfStructure[0]);
        const lep = this.elemParams.get(largestElem.id);
        const y = lep.y + (lep.realH || lep.h) + LAYOUT.visualIndent;
        waypoints = [firstWaypoint, [firstWaypoint[0], y], [lastWaypoint[0], y], lastWaypoint];
      } else {
        waypoints = [firstWaypoint, lastWaypoint];
      }

      this.edgesParams.set(id, {
        waypoints,
        label: [firstWaypoint[0] + LAYOUT.visualIndent / 2,
                firstWaypoint[1] + LAYOUT.visualIndent / 2],
      });
    }
  }

  getNodeHandleCoords(nodeId, handleType) {
    const p = this.elemParams.get(nodeId);
    if (!p) return [0, 0];
    const h = p.realH || p.h;
    if (handleType === 'r') return [p.x + p.w, p.y + h / 2];
    if (handleType === 'l') return [p.x, p.y + h / 2];
    if (handleType === 'b') return [p.x + p.w / 2, p.y + h];
    if (handleType === 't') return [p.x + p.w / 2, p.y];
    return [0, 0];
  }

  isGatewayId(id) { return id.includes('Gateway'); }

  isUpperBranchOfGateway(gatewayId, flowId) {
    const tryIn = (repr) => {
      const gateway = repr.get(gatewayId);
      if (!gateway) return null;
      const outFlows = gateway.outgoing.map(fid => repr.get(fid)).filter(Boolean);
      if (!outFlows.length) return null;
      const withBranch = outFlows.map(f => {
        const t = repr.get(f.targetRef);
        return { flowId: f.id, branch: (t && t.branch !== undefined) ? t.branch : Infinity };
      });
      const minBranch = Math.min(...withBranch.map(x => x.branch));
      const upper = withBranch.find(x => x.branch === minBranch);
      return upper ? upper.flowId : null;
    };

    let res = tryIn(this.repr);
    if (res) return res === flowId;
    for (const sp of this.subprocesses) {
      res = tryIn(sp.repr);
      if (res) return res === flowId;
    }
    return false;
  }

  /* ---------------- 6. optimize_layout ---------------- */

  optimizeLayout() {
    let col = this.grid.cols.length;
    let safety = 1000;
    while (col > 0 && safety-- > 0) {
      const prev = col;
      col = this.shiftElements(col, 'cols');
      if (col === prev) break;
    }
  }

  shiftElements(idx, axis) {
    const otherAxis = axis === 'cols' ? 'rows' : 'cols';
    const elementsToShift = [...this.filterElements(idx, axis, 'end')];
    const restEls         = [...this.filterElements(idx, axis, 'begin')];
    const dim = axis === 'cols' ? 'x' : 'y';

    const distances = [];
    for (let i = 0; i < this.grid[otherAxis].length; i++) {
      let borderShifting = { x: Infinity, y: Infinity };
      const filteredShifting = [...this.filterElements(i + 1, otherAxis, 'exact', elementsToShift)];
      if (filteredShifting.length) {
        borderShifting = filteredShifting.reduce((acc, e) => (e[dim] < acc[dim] ? e : acc));
      }

      let borderStatic = { x: 0, y: 0 };
      const filteredStatic = [...this.filterElements(i + 1, otherAxis, 'exact', restEls)];
      if (filteredStatic.length) {
        borderStatic = filteredStatic.reduce((acc, e) => (e[dim] > acc[dim] ? e : acc));
      }

      let shiftingProj = borderShifting[dim];
      if (borderShifting.add_gap) shiftingProj -= LAYOUT.gatewayGap;
      let staticProj = borderStatic[dim];
      if (borderStatic.add_gap) staticProj += LAYOUT.gatewayGap;

      distances.push(shiftingProj - staticProj);
    }

    if (!distances.length) return Math.max(idx - 1, 0);
    const shiftValue = Math.max(Math.min(...distances) - 2 * LAYOUT.visualIndent, 0);
    if (!shiftValue) return Math.max(idx - 1, 0);

    let closestShiftedDot = Infinity;
    for (const elem of elementsToShift) {
      if (elem.id) {
        elem[dim] -= shiftValue;
        closestShiftedDot = Math.min(elem[dim], closestShiftedDot);
      } else if (!elem.is_label) {
        this.shiftSingleWaypoint(elem, shiftValue, dim);
      }
    }

    if (closestShiftedDot === Infinity) return Math.max(idx - 1, 0);
    const affectedLane = this.getLaneForCoord(closestShiftedDot, axis) + 1;
    return affectedLane >= idx ? Math.max(idx - 1, 0) : Math.max(affectedLane, 0);
  }

  getLaneForCoord(dot, axis) {
    let acc = 0;
    for (let i = 0; i < this.grid[axis].length; i++) {
      acc += this.grid[axis][i];
      if (dot < acc) return i;
    }
    return this.grid[axis].length - 1;
  }

  shiftSingleWaypoint(wpData, shiftValue, dim) {
    const edge = this.edgesParams.get(wpData.parent);
    if (!edge) return;
    const wp = edge.waypoints[wpData.idx];
    if (!wp) return;
    if (dim === 'x') edge.waypoints[wpData.idx] = [wp[0] - shiftValue, wp[1]];
    else edge.waypoints[wpData.idx] = [wp[0], wp[1] - shiftValue];
  }

  getConvertedWaypoints() {
    const result = [];
    for (const [flowId, edge] of this.edgesParams) {
      const waypoints = edge.waypoints;
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        result.push({
          x: wp[0], y: wp[1], idx: i, is_label: false,
          parent: flowId, is_virtual: false, is_intermediate: false, add_gap: false,
        });
      }
      result.push({
        x: edge.label[0], y: edge.label[1], is_label: true, idx: -1,
        parent: flowId, is_virtual: false, is_intermediate: true, add_gap: false,
      });
    }
    return result;
  }

  getVirtualWaypoints(axis) {
    const axisIdx = axis === 'cols' ? 0 : 1;
    const axisXY = axis === 'cols' ? 'x' : 'y';
    const otherXY = axis === 'cols' ? 'y' : 'x';

    const filteredData = new Map();
    for (const [key, val] of this.edgesParams) {
      const wp = val.waypoints;
      const counts = new Map();
      for (const [x, y] of wp) {
        const v = axis === 'cols' ? x : y;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
      const newWp = wp.filter(p => counts.get(axis === 'cols' ? p[0] : p[1]) > 1);
      if (newWp.length) filteredData.set(key, newWp);
    }

    const result = [];
    for (const [key, waypoints] of filteredData) {
      const coords = waypoints.map(p => axis === 'cols' ? p[1] : p[0]);
      const start = Math.min(...coords);
      const end   = Math.max(...coords);
      const constComp = waypoints[0][axisIdx];

      let acc = 0;
      for (const bar of this.grid[axis]) {
        acc += bar;
        if (start < acc && acc < end) {
          result.push({
            is_label: false, parent: key, idx: null, add_gap: true,
            is_virtual: true, [axisXY]: constComp, [otherXY]: (2 * acc + bar) / 2,
          });
        }
      }
    }
    return result;
  }

  filterElements(idx, axis, direction, elsToFilter) {
    if (!this.grid[axis] || !this.grid[axis][idx - 1]) return [];
    const axisXY = axis === 'cols' ? 'x' : 'y';
    const lower = this.grid[axis].slice(0, idx - 1).reduce((a, b) => a + b, 0);
    const upper = lower + this.grid[axis][idx - 1];

    const match = (x) => {
      const v = x[axisXY];
      if (direction === 'begin') return v < lower;
      if (direction === 'end')   return v >= lower;
      return lower <= v && v < upper;
    };

    if (!elsToFilter) {
      const converted = this.getConvertedWaypoints();
      const virtual   = this.getVirtualWaypoints(axis);
      return [
        ...[...this.elemParams.values()].filter(match),
        ...converted.filter(match),
        ...virtual.filter(match),
      ];
    }
    return elsToFilter.filter(match);
  }

  /* ---------------- 7. update_pool ---------------- */

  updatePool(process) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of this.elemParams.values()) {
      if (!p.id) continue;
      if (p.x === undefined || p.y === undefined) continue;
      const h = p.realH || p.h;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + (p.w || 0));
      maxY = Math.max(maxY, p.y + h);
    }
    if (minX === Infinity) {
      minX = 0; minY = 0; maxX = 0; maxY = 0;
    }

    const padding = LAYOUT.visualIndent * 2;

    const shiftX = -minX + padding;
    const shiftY = -minY + padding;

    for (const p of this.elemParams.values()) {
      if (!p.id) continue;
      if (p.x === undefined) continue;
      p.x += shiftX;
      p.y += shiftY;
    }

    for (const [, edge] of this.edgesParams) {
      edge.waypoints = edge.waypoints.map(([x, y]) => [x + shiftX, y + shiftY]);
    }

    const gridW = (maxX - minX) + 2 * padding;
    const gridH = (maxY - minY) + 2 * padding;

    if (process.lanes.length) {
      const lanesCount = process.lanes.length;
      const laneSize = Math.floor(this.grid.rows.length / lanesCount);

      const lanes = [];
      for (let i = 0; i < lanesCount; i++) {
        lanes.push(this.grid.rows.slice(i * laneSize, (i + 1) * laneSize));
      }
      const heights = lanes.map(l => l.reduce((a, b) => a + b, 0));
      const totalH = heights.reduce((a, b) => a + b, 0);

      this.elemParams.set('laneSet', {
        id: 'laneSet',
        x: 0, y: 0,
        w: gridW, h: totalH,
        spec: 'laneSet',
      });

      let yAcc = 0;
      for (let i = 0; i < process.lanes.length; i++) {
        const lane = process.lanes[i];
        const laneH = totalH > 0 ? (heights[i] / totalH) * gridH : 0;
        this.elemParams.set(lane.id, {
          id: lane.id,
          x: 0, y: yAcc,
          w: gridW, h: laneH,
          spec: 'lane',
        });
        yAcc += laneH;
      }
    }

    process.bounds = {
      x: -LAYOUT.poolElemShift,
      y: 0,
      width: gridW + LAYOUT.poolElemShift,
      height: gridH,
    };
  }

  applyToModel(process) {
    for (const node of process.flowNodes) this.applyNodeParams(node);
    for (const flow of process.sequenceFlows) this.applyFlowParams(flow);
    for (const lane of process.lanes) {
      const p = this.elemParams.get(lane.id);
      if (p) lane.bounds = { x: p.x, y: p.y, width: p.w, height: p.h };
    }
  }

  applyToSubprocess(sp) {
    for (const node of sp.flowNodes) this.applyNodeParams(node);
    for (const flow of sp.sequenceFlows) this.applyFlowParams(flow);
    this.applyNodeParams(sp.node);
  }

  applyNodeParams(node) {
    const p = this.elemParams.get(node.id);
    if (!p) return;
    const realH = p.realH || p.h;
    node.bounds = { x: p.x, y: p.y, width: p.w, height: realH };
  }

  applyFlowParams(flow) {
    const e = this.edgesParams.get(flow.id);
    if (e) flow.waypoints = e.waypoints;
  }
}