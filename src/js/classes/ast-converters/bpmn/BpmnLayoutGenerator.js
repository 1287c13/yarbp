/**
 * Порт BpmnLayoutGenerator с Python.
 *
 * Идея:
 *  - элементы раскладываются по сетке (cols × rows);
 *  - большая ячейка (col, lane) раздувается на num_of_brunches × num_of_brunches
 *    подъячеек; элемент с branch=b попадает в подъячейку (b, b) — «диагональ»;
 *  - это гарантирует, что стрелки не пересекают элементы;
 *  - размеры строк/колонок — по максимуму содержимого;
 *  - optimize_layout сжимает «пустоты» справа налево.
 *
 * Отличия от Python:
 *  - вход — наша модель (BpmnProcess + flowNodes + sequenceFlows), не XML;
 *  - subProcess обходится рекурсивно через node.children;
 *  - артефакты (комментарий, данные) — визуальные атрибуты родителя,
 *    увеличивают визуальную высоту ячейки вверх, сами не участвуют в раскладке;
 *  - база-данных (dataStore) рисуется под пулом, в сетке не участвует;
 *  - связь (messageFlow) — только waypoints, в сетке не участвует.
 */

const VISUAL_INDENT = 12.5;
const POOL_ELEM_SHIFT = 30.0;
const GATEWAY_GAP = 25.0;

export class BpmnLayoutGenerator {
  constructor(model) {
    this.model = model;

    this.branchCounter = 1;
    this.numOfBrunches = 0;
    this.visualIndent = VISUAL_INDENT;
    this.poolElemShift = POOL_ELEM_SHIFT;
    this.gatewayGap = GATEWAY_GAP;

    this.changeEventLanes = true;
    this.changeClosingGatewaysLanes = true;

    // карты
    this.nodesById       = new Map();  // id -> node-модель
    this.flowsById       = new Map();  // id -> sequenceFlow
    this.laneIndexById   = new Map();  // id -> номер дорожки (1-based)
    this.repr            = new Map();  // плоское представление для процесса
    this.subprocesses    = [];         // [{ id, lane, flowNodes, sequenceFlows, repr, grid }]
    this.elemParams      = new Map();  // id -> { id, c, r, w, h, x, y, p, ... }
    this.edgesParams     = new Map();  // flowId -> { waypoints, label }
    this.grid            = { cols: [], rows: [] };
    this.startEventsIds  = [];
    this.nodesToVisitIds = [];
    this.lanesCache      = new Map();
  }

  /* ================================================================== *
   *  Точка входа
   * ================================================================== */

  generate() {
    for (const process of this.model.processes) {
      this.generateForProcess(process);
    }
  }

  generateForProcess(process) {
    const t0 = performance.now();
    console.log('[layout] start', process.name);

    // сбрасываем состояние
    this.branchCounter = 1;
    this.subprocesses = [];
    this.nodesById = new Map();
    this.flowsById = new Map();
    this.laneIndexById = new Map();
    this.elemParams = new Map();
    this.edgesParams = new Map();
    this.grid = { cols: [], rows: [] };
    this.startEventsIds = [];
    this.nodesToVisitIds = [];
    this.lanesCache = new Map();

    // собираем плоские карты
    this.collectNodes(process.flowNodes, process);
    this.collectLaneIndexes(process);
    this.repr = this.buildRepr(process.flowNodes, process.sequenceFlows);
    this.collectSubprocesses(process.flowNodes, process);
    console.log('[layout] collected. nodes=', this.nodesById.size,
      'flows=', this.flowsById.size,
      'subprocesses=', this.subprocesses.length,
      'time=', performance.now() - t0);

    // ---- шаги алгоритма ----
    this.addStructureAttrs(this.repr);
    for (const sp of this.subprocesses) {
      this.addStructureAttrs(sp.repr);
    }
    console.log('[layout] addStructureAttrs done. time=', performance.now() - t0);

    this.calcGridStructure(this.repr);
    for (const sp of this.subprocesses) {
      this.calcGridStructure(sp.repr);
    }
    console.log('[layout] calcGridStructure done. time=', performance.now() - t0);

    this.calcGridSizes(process);
    console.log('[layout] calcGridSizes done. time=', performance.now() - t0);

    this.calcElemsCoords(this.repr, this.grid);
    for (const sp of this.subprocesses) {
      this.calcElemsCoords(sp.repr, sp.grid, sp.id);
    }
    console.log('[layout] calcElemsCoords done. time=', performance.now() - t0);

    this.calcEdges(this.repr);
    for (const sp of this.subprocesses) {
      this.calcEdges(sp.repr);
    }
    console.log('[layout] calcEdges done. time=', performance.now() - t0);

    //this.optimizeLayout();
    console.log('[layout] optimizeLayout done. time=', performance.now() - t0);

    this.updatePool(process);
    console.log('[layout] updatePool done. time=', performance.now() - t0);

    // записываем результат в модель
    this.applyToModel(process);
    for (const sp of this.subprocesses) {
      this.applyToSubprocess(sp);
    }
    console.log('[layout] applyToModel done. time=', performance.now() - t0);
  }

  /* ================================================================== *
   *  Сбор данных из модели
   * ================================================================== */

  collectNodes(nodes, process) {
    for (const node of nodes) {
      this.nodesById.set(node.id, node);
      if (node.children && node.children.length) {
        this.collectNodes(node.children, process);
      }
    }
  }

  collectLaneIndexes(process) {
    let idx = 1;
    for (const lane of process.lanes) {
      this.laneIndexById.set(lane.id, idx++);
    }
  }

  buildRepr(flowNodes, sequenceFlows) {
    const repr = new Map();

    for (const node of flowNodes) {
      repr.set(node.id, {
        id:     node.id,
        tag:    node.tag,
        name:   node.name,
        node:   node,          // ссылка на модель
        incoming: [...node.incoming],
        outgoing: [...node.outgoing],
      });
    }

    for (const flow of sequenceFlows) {
      this.flowsById.set(flow.id, flow);
      repr.set(flow.id, {
        id:        flow.id,
        tag:       'sequenceFlow',
        sourceRef: flow.sourceRef,
        targetRef: flow.targetRef,
        name:      flow.name,
        flow:      flow,
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
          node: node,
        };
        sp.repr = this.buildRepr(sp.flowNodes, sp.sequenceFlows);
        this.subprocesses.push(sp);
      }
      if (node.children && node.children.length) {
        this.collectSubprocesses(node.children, process);
      }
    }
  }

  /* ================================================================== *
   *  1. add_structure_attrs — нумерация веток
   * ================================================================== */

  addStructureAttrs(repr) {
    this.branchCounter = 1;
    this.startEventsIds = this.getStartEventsIds(repr);

    for (const startId of this.startEventsIds) {
      this.traverseAndAssignBranchNumbers(startId, repr);
    }

    // постобработка: boundaryEvent получает branch владельца
    for (const [id, elem] of repr) {
      if (elem.tag !== 'boundaryEvent') continue;
      if (elem.branch !== undefined) continue;
      const ownerId = elem.node && elem.node.attachedToRef;
      if (!ownerId) continue;
      const owner = repr.get(ownerId);
      if (owner && owner.branch !== undefined) {
        elem.branch = owner.branch;
      }
    }
  }

  getStartEventsIds(repr) {
    const result = [];
    for (const [id, elem] of repr) {
      if (elem.tag === 'startEvent') result.push(id);
    }
    return result;
  }

  traverseAndAssignBranchNumbers(initialElemId, repr) {
    const elem = repr.get(initialElemId);
    if (!elem || elem.branch !== undefined) return;

    elem.branch = this.branchCounter;
    if (elem.tag === 'subProcess') {
      this.addSubprocessRef(elem.id);
    }

    let nextElemId = this.exploreNeighboringNodes(initialElemId, repr);
    while (nextElemId) {
      const nextElem = repr.get(nextElemId);
      if (nextElem && nextElem.tag === 'subProcess') {
        this.addSubprocessRef(nextElemId);
      }
      nextElemId = this.exploreNeighboringNodes(nextElemId, repr);
    }

    this.branchCounter++;

    // обрабатываем отложенные ветки (LIFO как в python pop())
    const nextBranchFirstElem = this.nodesToVisitIds.pop();
    if (nextBranchFirstElem !== undefined) {
      this.traverseAndAssignBranchNumbers(nextBranchFirstElem, repr);
    }
  }

  addSubprocessRef(subprocessId) {
    // подпроцесс уже собран в this.subprocesses с lane
    // дополнительно уточним lane, если он есть в модели
    const sp = this.subprocesses.find(s => s.id === subprocessId);
    if (sp && sp.node.laneId) {
      sp.lane = this.laneIndexById.get(sp.node.laneId) || sp.lane;
    }
  }

  exploreNeighboringNodes(parentNodeId, repr) {
    const targetNodesIds = this.getConnectedNodesIds(parentNodeId, repr, 'target');
    if (targetNodesIds.length > 1) {
      this.nodesToVisitIds.push(...targetNodesIds.slice(1));
    }
    if (targetNodesIds.length === 0) return null;

    const first = targetNodesIds[0];
    const elem = repr.get(first);
    if (elem && elem.branch === undefined) {
      elem.branch = this.branchCounter;
    }
    return first;
  }

  getConnectedNodesIds(parentNodeId, repr, direction) {
    // direction: 'source' | 'target'
    // 'source' = входящие (кого считаем входящим в parentNodeId)
    // 'target' = исходящие
    const elem = repr.get(parentNodeId);
    if (!elem) return [];

    const flowIds = direction === 'target' ? elem.outgoing : elem.incoming;
    const result = [];
    for (const flowId of flowIds) {
      const flow = repr.get(flowId);
      if (!flow) continue;
      const nodeId = direction === 'target' ? flow.targetRef : flow.sourceRef;
      result.push(nodeId);
    }
    return result;
  }

  /* ================================================================== *
   *  2. calc_grid_structure — нумерация колонок
   * ================================================================== */

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
          for (const targId of targetNodesIdsCache.get(id)) {
            nextColElemsIds.push(targId);
          }
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
            for (const targId of targetNodesIdsCache.get(id)) {
              nextColElemsIds.push(targId);
            }
          }
        }
      }
      for (const id of toRemove) delayedProcessingQueue.delete(id);

      currentColElemsIds.length = 0;
      currentColElemsIds.push(...nextColElemsIds);
      col++;
    }

    // --- постобработка 1: boundaryEvent получает col владельца ---
    for (const [id, elem] of repr) {
      if (elem.tag !== 'boundaryEvent') continue;
      if (elem.col !== undefined) continue;
      const ownerId = elem.node && elem.node.attachedToRef;
      if (!ownerId) continue;
      const owner = repr.get(ownerId);
      if (owner && owner.col !== undefined) {
        elem.col = owner.col;
      }
    }

    // --- постобработка 2: узлы, ставшие достижимыми через boundary ---
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

    console.log('[calcGridStructure] result:',
      [...repr.entries()]
        .filter(([id, e]) => e.tag !== 'sequenceFlow')
        .map(([id, e]) => `${id}: col=${e.col}`)
        .join(', ')
    );
  }

  /* ================================================================== *
   *  3. calc_grid_sizes — размеры сетки
   * ================================================================== */

  calcGridSizes(process) {
    const filtered = [...this.repr.values()].filter(
      x => x.tag !== 'sequenceFlow' && x.tag !== 'laneSet');

    this.numOfBrunches = filtered.reduce(
      (acc, item) => Math.max(acc, item.branch || 0), 0);

    // подпроцессы: сначала внутренние сетки
    for (let i = this.subprocesses.length - 1; i >= 0; i--) {
      const sp = this.subprocesses[i];
      const paramsList = [];
      for (const [id, elem] of sp.repr) {
        if (elem.tag === 'sequenceFlow' || elem.tag === 'laneSet') continue;
        if (elem.tag === 'incoming' || elem.tag === 'outgoing') continue;
        paramsList.push(this.calcElementGridParams(elem, sp.lane, sp.id));
      }
      this.updateGrid(sp.grid, paramsList);
      sp.grid.rows = [this.visualIndent, ...sp.grid.rows, this.visualIndent];
      for (const v of this.elemParams.values()) {
        if (v.p === sp.id) v.r += 1;
      }
    }

    // основная сетка
    const paramsList = [];
    for (const [id, elem] of this.repr) {
      if (elem.tag === 'sequenceFlow' || elem.tag === 'laneSet') continue;
      if (elem.tag === 'incoming' || elem.tag === 'outgoing') continue;
      if (elem.tag === 'boundaryEvent') continue;

      let lane;
      if ((this.changeEventLanes && elem.tag.includes('Event')) ||
          (this.changeClosingGatewaysLanes && elem.tag.includes('Gateway'))) {
        const sourceIds = this.getConnectedNodesIds(id, this.repr, 'source');
        if (sourceIds.length && elem.branch === this.repr.get(sourceIds[0])?.branch) {
          lane = this.lanesCache.get(sourceIds[0])
            || this.getElemLaneNumber(sourceIds[0]);
          this.lanesCache.set(id, lane);
        } else {
          lane = this.getElemLaneNumber(id);
        }
      } else {
        lane = this.getElemLaneNumber(id);
      }

      paramsList.push(this.calcElementGridParams(elem, lane));
    }

    console.log('[calcGridSizes] numOfBrunches=', this.numOfBrunches);
    console.log('[calcGridSizes] elemParams:',
      [...this.elemParams.entries()]
        .map(([id, p]) => `${id}: c=${p.c} r=${p.r} x=${p.x} y=${p.y}`)
        .join('\n')
    );

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

    const size = this.getSizeFor(elem);

    return {
      id: elem.id,
      c: ((elem.col || 1) - 1) * this.numOfBrunches + (elem.branch || 1),
      r: ((lane || 1) - 1) * this.numOfBrunches + (elem.branch || 1),
      w: subprocessWidth || size.width,
      h: subprocessHeight || size.height,
      p: processId || null,
      node: elem.node,
    };
  }

  updateGrid(grid, paramsList) {
    for (const p of paramsList) {
      this.elemParams.set(p.id, p);
    }

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
      grid.cols[i] = inCol.length
        ? Math.max(...inCol.map(x => x.w)) + 2 * this.visualIndent
        : 0;
    }

    for (let i = 0; i < grid.rows.length; i++) {
      const inRow = paramsList.filter(y => y.r === i + 1);
      grid.rows[i] = inRow.length
        ? Math.max(...inRow.map(x => x.h)) + 2 * this.visualIndent
        : 0;
    }
  }

  getElemLaneNumber(elemId) {
    const node = this.nodesById.get(elemId);
    if (!node || !node.laneId) return 1;
    return this.laneIndexById.get(node.laneId) || 1;
  }

  getSizeFor(elem) {
    // дефолтные размеры по тегу
    const tag = elem.tag;
    if (tag === 'startEvent' || tag === 'endEvent' ||
        tag === 'intermediateThrowEvent' || tag === 'boundaryEvent') {
      return { width: 36, height: 36 };
    }
    if (tag.includes('Gateway')) return { width: 50, height: 50 };
    if (tag === 'subProcess') return { width: 350, height: 200 };
    return { width: 100, height: 80 };
  }

  /* ================================================================== *
   *  4. calc_elems_coords — реальные координаты
   * ================================================================== */

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

      params.x = accumulatedWidth
        + (cellWidth - params.w) / 2
        + subprocessShiftLeft;

      params.y = accumulatedHeight
        + (cellHeight - params.h) / 2
        + subprocessShiftTop;
    }
  }

  /* ================================================================== *
   *  5. calc_edges — waypoints стрелок
   * ================================================================== */

  calcEdges(repr) {
    for (const [id, elem] of repr) {
      if (elem.tag !== 'sequenceFlow') continue;

      const sourceParams = this.elemParams.get(elem.sourceRef);
      const targetParams = this.elemParams.get(elem.targetRef);
      if (!sourceParams || !targetParams) continue;

      const isRightShift = sourceParams.c < targetParams.c;
      const isDownShift  = sourceParams.r < targetParams.r;
      const isUpShift    = sourceParams.r > targetParams.r;

      let arrowType = 'rl';

      if (isRightShift && isDownShift
          && this.isGatewayId(sourceParams.id)
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
        waypoints = [
          firstWaypoint,
          [firstWaypoint[0], lastWaypoint[1]],
          lastWaypoint,
        ];
      } else if (arrowType === 'rb' || arrowType === 'rt') {
        waypoints = [
          firstWaypoint,
          [lastWaypoint[0], firstWaypoint[1]],
          lastWaypoint,
        ];
      } else if (arrowType === 'bb') {
        const lowerRow = Math.max(sourceParams.r, targetParams.r);
        const elemsOfRow = [...this.elemParams.values()].filter(x => x.r === lowerRow && x.id);
        const elemsOfStructure = elemsOfRow.filter(
          e => repr.has(e.id));
        const largestElem = elemsOfStructure.reduce(
          (acc, x) => (this.elemParams.get(x.id).h > this.elemParams.get(acc.id).h ? x : acc),
          elemsOfStructure[0]);
        const lep = this.elemParams.get(largestElem.id);
        const y = lep.y + lep.h + this.visualIndent;
        waypoints = [
          firstWaypoint,
          [firstWaypoint[0], y],
          [lastWaypoint[0], y],
          lastWaypoint,
        ];
      } else {
        waypoints = [firstWaypoint, lastWaypoint];
      }

      this.edgesParams.set(id, {
        waypoints,
        label: [firstWaypoint[0] + this.visualIndent / 2,
                firstWaypoint[1] + this.visualIndent / 2],
      });
    }
  }

  getNodeHandleCoords(nodeId, handleType) {
    const p = this.elemParams.get(nodeId);
    if (!p) return [0, 0];
    if (handleType === 'r') return [p.x + p.w, p.y + p.h / 2];
    if (handleType === 'l') return [p.x, p.y + p.h / 2];
    if (handleType === 'b') return [p.x + p.w / 2, p.y + p.h];
    if (handleType === 't') return [p.x + p.w / 2, p.y];
    return [0, 0];
  }

  isGatewayId(id) {
    return id.includes('Gateway');
  }

  isUpperBranchOfGateway(gatewayId, flowId) {
    const tryIn = (repr) => {
      const gateway = repr.get(gatewayId);
      if (!gateway) return null;

      const outFlows = gateway.outgoing
        .map(fid => repr.get(fid))
        .filter(Boolean);
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

  /* ================================================================== *
   *  6. optimize_layout — сжатие по X
   * ================================================================== */

  optimizeLayout() {
    let col = this.grid.cols.length;
    let safety = 1000;
    while (col > 0 && safety-- > 0) {
      const prev = col;
      col = this.shiftElements(col, 'cols');
      if (col === prev) {
        console.warn('[layout] optimizeLayout: no progress at col=', col);
        break;
      }
    }
    if (safety <= 0) console.warn('[layout] optimizeLayout: safety limit reached');
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
        borderShifting = filteredShifting.reduce(
          (acc, e) => (e[dim] < acc[dim] ? e : acc)
        );
      }

      let borderStatic = { x: 0, y: 0 };
      const filteredStatic = [...this.filterElements(i + 1, otherAxis, 'exact', restEls)];
      if (filteredStatic.length) {
        borderStatic = filteredStatic.reduce(
          (acc, e) => (e[dim] > acc[dim] ? e : acc)
        );
      }

      let shiftingProj = borderShifting[dim];
      if (borderShifting.add_gap) shiftingProj -= this.gatewayGap;

      let staticProj = borderStatic[dim];
      if (borderStatic.add_gap) staticProj += this.gatewayGap;

      distances.push(shiftingProj - staticProj);
    }

    if (!distances.length) return Math.max(idx - 1, 0);

    const shiftValue = Math.max(Math.min(...distances) - 2 * this.visualIndent, 0);
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
          parent: flowId, is_virtual: false, is_intermediate: false,
          add_gap: false,
        });
      }
      result.push({
        x: edge.label[0], y: edge.label[1], is_label: true, idx: -1,
        parent: flowId, is_virtual: false, is_intermediate: true,
        add_gap: false,
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
    let acc = 0;
    for (const [key, waypoints] of filteredData) {
      const coords = waypoints.map(p => axis === 'cols' ? p[1] : p[0]);
      const start = Math.min(...coords);
      const end   = Math.max(...coords);
      const constComp = waypoints[0][axisIdx];

      acc = 0;
      for (const bar of this.grid[axis]) {
        acc += bar;
        if (start < acc && acc < end) {
          result.push({
            is_label: false, parent: key, idx: null, add_gap: true,
            is_virtual: true,
            [axisXY]: constComp,
            [otherXY]: (2 * acc + bar) / 2,
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

  /* ================================================================== *
   *  7. update_pool — размеры пула и дорожек
   * ================================================================== */

  updatePool(process) {
    if (!process.lanes.length) return;

    const laneSetId = process.laneSetId;
    const lanesCount = process.lanes.length;
    const laneSize = Math.floor(this.grid.rows.length / lanesCount);

    const lanes = [];
    for (let i = 0; i < lanesCount; i++) {
      lanes.push(this.grid.rows.slice(i * laneSize, (i + 1) * laneSize));
    }
    const heights = lanes.map(l => l.reduce((a, b) => a + b, 0));
    const width = this.grid.cols.reduce((a, b) => a + b, 0);

    this.elemParams.set('laneSet', {
      id: 'laneSet',
      x: -this.poolElemShift, y: 0,
      w: width + this.poolElemShift,
      h: heights.reduce((a, b) => a + b, 0),
      spec: 'laneSet',
    });

    let yAcc = 0;
    for (let i = 0; i < process.lanes.length; i++) {
      const lane = process.lanes[i];
      this.elemParams.set(lane.id, {
        id: lane.id,
        x: 0, y: yAcc,
        w: width, h: heights[i],
        spec: 'lane',
      });
      yAcc += heights[i];
    }
  }

  /* ================================================================== *
   *  Запись результата в модель
   * ================================================================== */

  applyToModel(process) {
    for (const node of process.flowNodes) {
      this.applyNodeParams(node);
    }
    for (const flow of process.sequenceFlows) {
      this.applyFlowParams(flow);
    }
    for (const lane of process.lanes) {
      const p = this.elemParams.get(lane.id);
      if (p) lane.bounds = { x: p.x, y: p.y, width: p.w, height: p.h };
    }
    const laneSetParams = this.elemParams.get('laneSet');
    if (laneSetParams && process.lanes.length) {
      // bound процесса — границы laneSet + сдвиг на poolElemShift
      const lb = laneSetParams;
      process.bounds = {
        x: lb.x - this.poolElemShift,
        y: lb.y,
        width: lb.w + this.poolElemShift,
        height: lb.h,
      };
    }
  }

  applyToSubprocess(sp) {
    for (const node of sp.flowNodes) {
      this.applyNodeParams(node);
    }
    for (const flow of sp.sequenceFlows) {
      this.applyFlowParams(flow);
    }
    this.applyNodeParams(sp.node);
  }

  applyNodeParams(node) {
    const p = this.elemParams.get(node.id);
    if (!p) return;
    node.bounds = { x: p.x, y: p.y, width: p.w, height: p.h };
  }

  applyFlowParams(flow) {
    const e = this.edgesParams.get(flow.id);
    if (e) flow.waypoints = e.waypoints;
  }

  /* ================================================================== *
   *  Артефакты — после раскладки
   * ================================================================== */

  applyArtifacts(process) {
    // пробегаем по всем задачам; у кого есть комментарий / данные — сдвигаем их над задачей
    const handleNode = (node) => {
      if (!node.bounds) return;

      // комментарии и данные уже лежат в process._pendingArtifacts (после buildModel)
      // но там уже bounds посчитаны по старым правилам. Пересчитаем:
    };

    // по факту артефакты уже созданы в buildModel с bounds по старым правилам.
    // Пересчитаем здесь с учётом новых bounds задачи.
    for (const ta of (process._pendingArtifacts?.textAnnotations || [])) {
      // ... уже не тут
    }
  }

  applyDataStoresUnderPool(process) {
    // пересчёт базы-данных под новым пулом
    for (const ref of process.dataStores) {
      const owner = this.findDataStoreOwner(process, ref);
      if (!owner || !owner.bounds) continue;
      const p = process.bounds || { x: 0, y: 0, width: 0, height: 0 };
      ref.bounds = {
        x: owner.bounds.x + owner.bounds.width / 2 - 25,
        y: p.y + p.height + 30,
        width: 50,
        height: 50,
      };
    }
  }

  findDataStoreOwner(process, ref) {
    // ищем задачу, у которой в dataOutputAssocs есть ссылка на ref
    const collect = (nodes) => {
      for (const n of nodes) {
        for (const a of n.dataOutputAssocs || []) {
          if (a.targetRef === ref.id) return n;
        }
        if (n.children && n.children.length) {
          const r = collect(n.children);
          if (r) return r;
        }
      }
      return null;
    };
    return collect(process.flowNodes);
  }

  applyMessageFlows(process) {
    // waypoints для messageFlow пересчитываются в BpmnDiGenerator
    // (там мы делаем второй проход) — оставляем как есть
  }
}