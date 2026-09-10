import {nodeTypes} from '../YarbpParser.js';
import {findChildrenByKeyValue} from "../../utils.js";

export class YarbpXPMConverter {
  constructor(ast) {
    this.ast = ast;
    this.result = null;
  }

  static VOCABULARY = Object.freeze({
    participant: 'участник',
    track: 'дорожка',
    divider: 'разделитель',
    event: 'событие',
    image: 'картинка',
    point: 'точка',
    lines: 'пусто',

    'мужчина': 'casual-man',
    'женщина': 'casual-woman',
    'повар': 'chef',
    'производство': 'clean-production',
    'мужчина-в-очках': 'glasses-man',
    'женщина-в-очках': 'glasses-woman',
    'в-каске': 'hard-hat',
    'ии': 'modern-robot',
    'робот': 'retro-robot',
    'мужчина-менеджер': 'suit-man',
    'женщина-менеджер': 'suit-woman',
    'мужчина-яркая-одежда': 'bright-man',
    'женщина-яркая-одежда': 'bright-woman',
    'оператор': 'operator-woman'
  });

  static _normalize(value) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  }

  static _resolve(value, dict) {
    const n = YarbpXPMConverter._normalize(value);
    for (const [k, v] of Object.entries(dict)) {
      if (YarbpXPMConverter._normalize(k) === n) return v;
    }
    return null;
  }

  convert() {
    if (!this.ast || this.ast.nodeType !== nodeTypes.ROOT) {
      throw new Error('Invalid AST: root node must be of type ROOT');
    }

    const rootChildren = this.ast.children || [];

    // Участник резервирует колонку 0 под иконку, остальные дети идут с x = 1.
    // Дорожка и прочие узлы — без резерва, дети с x = 0.
    const sizeX = rootChildren.reduce((max, actor) => {
      if (actor.key === YarbpXPMConverter.VOCABULARY.participant) {
        const tilesWithoutImage = (actor.children || [])
          .filter(child => child.key !== YarbpXPMConverter.VOCABULARY.image)
          .length;
        return Math.max(max, tilesWithoutImage + 1);
      }
      return Math.max(max, (actor.children || []).length);
    }, 0);
    const sizeY = rootChildren.length;

    this._createGrid(sizeX, sizeY);

    let y = 0;
    rootChildren.forEach(actor => {
      if (actor.key === YarbpXPMConverter.VOCABULARY.participant) {
        this._layoutParticipant(actor, y);
      } else {
        this._layoutPlainActor(actor, y);
      }
      y++;
    });

    this._resolveDecisionTableTargets();
    this._inheritArrows();
    this._repositionImages();

    return { tiles: this.result };
  }

  // ---------------------------------------------------------------------------
  // Раскладка строк
  // ---------------------------------------------------------------------------

  _layoutParticipant(actor, y) {
    const roleName = this._extractRoleName(actor);
    const imageNode = this._findImageNode(actor);

    // Иконка всегда создаётся и всегда лежит в x = 0
    const imageTile = this._getTileByCoords(0, y);
    if (imageTile) {
      imageTile.config = this._getActorImageTileConfig(0, y, {
        src: this._resolveImageSrc(imageNode ? imageNode.value : ''),
        roleName: roleName
      });
    }

    // Остальные дети — начиная с x = 1
    let x = 1;
    (actor.children || []).forEach(tile => {
      if (tile.key === YarbpXPMConverter.VOCABULARY.image) return;
      const tileRepr = this._getTileByCoords(x, y);
      if (!tileRepr) return;
      const props = this._extractProps(tile, { roleName });
      tileRepr.config = this._getTileConfig(tile.key)(x, y, props);
      x++;
    });
  }

  _layoutPlainActor(actor, y) {
    let x = 0;
    (actor.children || []).forEach(tile => {
      const tileRepr = this._getTileByCoords(x, y);
      if (!tileRepr) return;
      const props = this._extractProps(tile);
      tileRepr.config = this._getTileConfig(tile.key)(x, y, props);
      x++;
    });
  }

  // ---------------------------------------------------------------------------
  // Иконки
  // ---------------------------------------------------------------------------

  _extractRoleName(actor) {
    if (actor && actor.key === YarbpXPMConverter.VOCABULARY.participant) {
      return (actor.value || '').trim();
    }
    return '';
  }

  _findImageNode(actor) {
    return (actor.children || []).find(
      child => child.key === YarbpXPMConverter.VOCABULARY.image
    ) || null;
  }

  _resolveImageSrc(raw) {
    const trimmed = (raw || '').trim();
    return YarbpXPMConverter._resolve(trimmed, YarbpXPMConverter.VOCABULARY) || trimmed;
  }

  /**
   * Двигает иконку из x = 0 вплотную к первой точке строки.
   * Если точек нет — иконка остаётся в x = 0.
   */
  _repositionImages() {
    const rows = new Map();
    this.result.forEach(tile => {
      if (!rows.has(tile.grid.y)) rows.set(tile.grid.y, []);
      rows.get(tile.grid.y).push(tile);
    });

    rows.forEach(rowTiles => {
      rowTiles.sort((a, b) => a.grid.x - b.grid.x);

      const imageTile = rowTiles.find(t => t.config.tileType === 'image');
      if (!imageTile) return;

      const firstPoint = rowTiles.find(t => t.config.tileType === 'point');
      if (!firstPoint) return; // точек нет — иконка остаётся на месте

      const targetX = firstPoint.grid.x - 1;
      if (targetX < 0 || targetX === imageTile.grid.x) return;

      const targetTile = this._getTileByCoords(targetX, imageTile.grid.y);
      if (!targetTile) return;
      if (targetTile.config.tileType !== 'lines') return;

      const imageConfig = imageTile.config;
      imageTile.config = this._getEmptyTileConfig(imageTile.grid.x, imageTile.grid.y);
      targetTile.config = imageConfig;
    });
  }

  // ---------------------------------------------------------------------------
  // Резолв таблиц решений
  // ---------------------------------------------------------------------------

  _resolveDecisionTableTargets() {
    // Индекс id → grid по всем точкам
    const idIndex = new Map();
    this.result.forEach(tile => {
      if ((tile.config || {}).tileType !== 'point') return;
      const id = tile.config.id;
      if (id) idIndex.set(id, tile.grid);
    });

    // Резолв строк таблиц
    this.result.forEach(tile => {
      if ((tile.config || {}).tileType !== 'point') return;
      const table = tile.config.decisionTable;
      if (!table) return;

      table.rows.forEach(row => {
        if (!row.resultId) {
          row.targetGrid = null;
          return;
        }
        const grid = idIndex.get(row.resultId);
        row.targetGrid = grid ? { x: grid.x, y: grid.y } : null;
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Стрелки
  // ---------------------------------------------------------------------------

  _inheritArrows() {
    const tiles = this.result || [];
    const processed = new Set();

    tiles.forEach(tile => {
      if (tile.config && tile.config.tileType === 'point') {
        const { x, y } = tile.grid;
        const arrows = tile.config.arrows || {};

        ['right', 'down', 'left', 'top'].forEach(direction => {
          const arrow = arrows[direction];
          if (!arrow || !arrow.show) return;

          const key = `${x},${y},${direction}`;
          if (processed.has(key)) return;
          processed.add(key);

          const opposite = this._getOppositeDirection(direction);
          const { dx, dy } = this._getDirectionDelta(direction);

          const result = this._propagateThroughEmptyTiles(x, y, dx, dy, arrow.style);
          if (!result || !result.targetTile || result.targetTile.config.tileType !== 'point') return;

          const targetTile = result.targetTile;
          const targetX = targetTile.grid.x;
          const targetY = targetTile.grid.y;

          const isOutgoing = arrow.hasMarker && !arrow.hasInMarker;
          const isIncoming = arrow.hasInMarker && !arrow.hasMarker;
          const isBidirectional = arrow.hasMarker && arrow.hasInMarker;
          const isPlain = !arrow.hasMarker && !arrow.hasInMarker;

          const markerAtPoint = (dir) => {
            if (dir === 'right' || dir === 'down') {
              return { hasMarker: false, hasInMarker: true };
            } else {
              return { hasMarker: true, hasInMarker: false };
            }
          };

          const noMarker = () => ({ hasMarker: false, hasInMarker: false });

          if (isOutgoing) {
            tile.config.arrows[direction] = {
              show: true,
              style: arrow.style,
              ...noMarker()
            };

            const marker = markerAtPoint(opposite);
            targetTile.config.arrows[opposite] = {
              show: true,
              style: arrow.style,
              ...marker
            };

            processed.add(`${targetX},${targetY},${opposite}`);
          } else if (isIncoming) {
            const marker = markerAtPoint(direction);
            tile.config.arrows[direction] = {
              show: true,
              style: arrow.style,
              ...marker
            };

            targetTile.config.arrows[opposite] = {
              show: true,
              style: arrow.style,
              ...noMarker()
            };

            processed.add(`${targetX},${targetY},${opposite}`);
          } else if (isBidirectional) {
            const sourceMarker = markerAtPoint(direction);
            tile.config.arrows[direction] = {
              show: true,
              style: arrow.style,
              ...sourceMarker
            };

            const targetMarker = markerAtPoint(opposite);
            targetTile.config.arrows[opposite] = {
              show: true,
              style: arrow.style,
              ...targetMarker
            };

            processed.add(`${targetX},${targetY},${opposite}`);
          } else if (isPlain) {
            tile.config.arrows[direction] = {
              show: true,
              style: arrow.style,
              ...noMarker()
            };

            targetTile.config.arrows[opposite] = {
              show: true,
              style: arrow.style,
              ...noMarker()
            };

            processed.add(`${targetX},${targetY},${opposite}`);
          }
        });
      }
    });

    tiles.forEach(tile => {
      if (tile.config && tile.config.tileType === 'point' && tile.config.bypassEnabled) {
        this._handleBypassConnections(tile);
      }
    });
  }

  _propagateThroughEmptyTiles(startX, startY, dx, dy, style) {
    const maxX = Math.max(...this.result.map(t => t.grid.x));
    const maxY = Math.max(...this.result.map(t => t.grid.y));

    let currentX = startX + dx;
    let currentY = startY + dy;

    while (currentX >= 0 && currentX <= maxX && currentY >= 0 && currentY <= maxY) {
      const tile = this._getTileByCoords(currentX, currentY);
      if (!tile) return null;

      if ((tile.config || {}).tileType === 'point') {
        return { targetTile: tile };
      } else if ((tile.config || {}).tileType === 'lines') {
        if (dx !== 0) {
          tile.config.horizontalLine = {
            show: true,
            style: style,
            y: 34
          };
        } else {
          tile.config.verticalLine = {
            show: true,
            style: style,
            x: 34
          };
        }
        currentX += dx;
        currentY += dy;
      } else {
        // Препятствие (image, divider, ...)
        return null;
      }
    }

    return null;
  }

  _getDirectionDelta(direction) {
    switch (direction) {
      case 'right': return { dx: 1, dy: 0 };
      case 'left': return { dx: -1, dy: 0 };
      case 'down': return { dx: 0, dy: 1 };
      case 'top': return { dx: 0, dy: -1 };
    }
  }

  _getOppositeDirection(direction) {
    const opposites = {
      'right': 'left',
      'left': 'right',
      'top': 'down',
      'down': 'top'
    };
    return opposites[direction] || direction;
  }

  _handleBypassConnections(tile) {
    const { x, y } = tile.grid;
    const arrows = tile.config.arrows;

    const neighbors = [
      { dx: -1, dy: 1, from: 'left', to: 'down' },
      { dx: 1, dy: 1, from: 'right', to: 'down' },
      { dx: -1, dy: -1, from: 'left', to: 'top' },
      { dx: 1, dy: -1, from: 'right', to: 'top' }
    ];

    neighbors.forEach(({ dx, dy, from, to }) => {
      const neighbor = this._getTileByCoords(x + dx, y + dy);

      if (neighbor && neighbor.config && neighbor.config.tileType === 'point') {
        const hasLeftArrow = arrows.left?.show;
        const hasRightArrow = arrows.right?.show;

        if ((from === 'left' && hasLeftArrow && to === 'down' && neighbor.config.arrows?.down?.show) ||
            (from === 'right' && hasRightArrow && to === 'down' && neighbor.config.arrows?.down?.show) ||
            (from === 'left' && hasLeftArrow && to === 'top' && neighbor.config.arrows?.top?.show) ||
            (from === 'right' && hasRightArrow && to === 'top' && neighbor.config.arrows?.top?.show)) {
          tile.config.bypassEnabled = true;
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Извлечение свойств
  // ---------------------------------------------------------------------------

  _extractProps(tile, context = {}) {
    switch (tile.key) {
      case YarbpXPMConverter.VOCABULARY.image:
        return this._extractActorProps(tile, context);
      case YarbpXPMConverter.VOCABULARY.point:
        return this._extractPointProps(tile);
      case YarbpXPMConverter.VOCABULARY.event:
        return this._extractEventProps(tile);
      case YarbpXPMConverter.VOCABULARY.divider:
        return { title: (tile.value || '').trim() };
      case YarbpXPMConverter.VOCABULARY.lines:
        return {};
    }
  }

  _extractActorProps(tile, context = {}) {
    return {
      src: this._resolveImageSrc(tile.value),
      roleName: context.roleName || ''
    };
  }

  _extractPointProps(tile) {
    let title = tile.value;

    let annotations;
    let annotationParent = findChildrenByKeyValue(tile, 'key', 'аннотации')[0];
    if (annotationParent && annotationParent.children) {
      annotations = annotationParent.children.reduce(
        (acc, current) => { return acc + current.value.trim() + '\n'; }, '');
    }

    let pointStyle, bypassEnabled;
    let pointTypes = findChildrenByKeyValue(tile, 'key', 'тип');
    if (pointTypes.length) {
      let pointType = pointTypes[0].value;
      pointStyle = [pointType.trim()[1], pointType.trim()[2]].includes('о')
        ? 'hollow' : [pointType.trim()[1], pointType.trim()[2]].includes('<')
        ? 'diamond' : 'filled';
      bypassEnabled = pointType.trim()[1] === '(';
    }

    let arrows, rightArrow, downArrow, leftArrow, topArrow;
    let arrowsParent = findChildrenByKeyValue(tile, 'key', 'связи')[0];
    if (arrowsParent && arrowsParent.children) {
      const getArrowConfig = (val) => {
        if (!val) return { show: false };

        const arrowStr = String(val).trim();

        let style = 'solid';
        if (/--/.test(arrowStr)) style = 'dashed';
        else if (/\.\./.test(arrowStr)) style = 'dotted';

        const hasStartMarker = arrowStr.startsWith('<');
        const hasEndMarker = arrowStr.endsWith('>');

        return {
          show: true,
          style: style,
          hasMarker: hasEndMarker,
          hasInMarker: hasStartMarker
        };
      };

      arrows = arrowsParent.children.map(arrValNode => arrValNode.value);
      [rightArrow, downArrow, leftArrow, topArrow] = arrows.map(getArrowConfig);
    }

    const idNode = findChildrenByKeyValue(tile, 'key', 'ид')[0];
    const id = idNode ? (idNode.value || '').trim() : null;

    const decisionTableNode = findChildrenByKeyValue(tile, 'key', 'таблица-решений')[0];
    const decisionTable = decisionTableNode ? this._extractDecisionTable(decisionTableNode) : null;

    return {
      id,
      decisionTable,
      title: title,
      pointStyle: pointStyle,
      bypassEnabled: bypassEnabled,
      listText: annotations,
      arrows: {
        right: rightArrow || { show: false },
        down: downArrow || { show: false },
        left: leftArrow || { show: false },
        top: topArrow || { show: false }
      }
    };
  }

  _extractDecisionTable(node) {
    const headerNode = findChildrenByKeyValue(node, 'key', 'шапка')[0];
    const rawHeader = (headerNode && headerNode.children)
      ? headerNode.children.map(child => (child.value || '').trim())
      : [];

    const rulesNode = findChildrenByKeyValue(node, 'key', 'правила')[0];
    const rules = (rulesNode && rulesNode.children) ? rulesNode.children : [];

    const rawRows = rules.map(rule => {
      const paramsNode = findChildrenByKeyValue(rule, 'key', 'параметры')[0];
      const params = (paramsNode && paramsNode.children)
        ? paramsNode.children.map(child => (child.value || '').trim())
        : [];

      const resultNode = findChildrenByKeyValue(rule, 'key', 'результат')[0];
      const resultId = resultNode ? (resultNode.value || '').trim() : null;

      return { params, resultId };
    });

    const columnCount = Math.max(
      rawHeader.length,
      ...rawRows.map(r => r.params.length),
      0
    );

    const padTo = (arr, len) => {
      const copy = arr.slice(0, len);
      while (copy.length < len) copy.push('');
      return copy;
    };

    const header = padTo(rawHeader, columnCount);
    const rows = rawRows.map(r => ({
      params: padTo(r.params, columnCount),
      resultId: r.resultId,
      targetGrid: null
    }));

    return { columnCount, header, rows };
  }

  _extractEventProps(tile) {
    return {
      id: null,
      decisionTable: null,
      title: (tile.value || '').trim(),
      pointStyle: 'diamond',
      bypassEnabled: false,
      listText: '',
      arrows: {
        right: { show: false },
        down: {
          show: true,
          style: 'dotted',
          hasMarker: false,
          hasInMarker: false
        },
        left: { show: false },
        top: { show: false }
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Фабрики конфигов
  // ---------------------------------------------------------------------------

  _getTileConfig(tileType) {
    switch (tileType) {
      case YarbpXPMConverter.VOCABULARY.image: return this._getActorImageTileConfig;
      case YarbpXPMConverter.VOCABULARY.point: return this._getPointTileConfig;
      case YarbpXPMConverter.VOCABULARY.event: return this._getPointTileConfig;
      case YarbpXPMConverter.VOCABULARY.divider: return this._getDividerTileConfig;
      case YarbpXPMConverter.VOCABULARY.lines: return this._getEmptyTileConfig;
      default: return () => {};
    }
  }

  _getPointTileConfig(x, y, props = {}) {
    return {
      tileType: "point",
      id: null,
      decisionTable: null,
      pointStyle: "filled",
      bypassEnabled: false,
      title: "",
      listText: "",
      arrows: {
        right: { show: false },
        down: { show: false },
        left: { show: false },
        top: { show: false }
      },
      ...props
    };
  }

  _getDividerTileConfig(x, y, props = {}) {
    return {
      tileType: "divider",
      title: "",
      ...props
    };
  }

  _getEmptyTileConfig(x, y, props = {}) {
    return {
      tileType: "lines",
      horizontalLine: { show: false, style: "solid" },
      verticalLine: { show: false, style: "solid" },
      ...props
    };
  }

  _getActorImageTileConfig(x, y, props = {}) {
    return {
      tileType: "image",
      src: '',
      aspectRatio: 0.7,
      roleName: "",
      ...props
    };
  }

  // ---------------------------------------------------------------------------
  // Сетка
  // ---------------------------------------------------------------------------

  _createGrid(sizeX, sizeY) {
    this.result = [];

    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        this.result.push({
          grid: { x, y },
          config: this._getEmptyTileConfig(x, y)
        });
      }
    }
  }

  _getTileByCoords(x, y) {
    return this.result.find(
      tile => tile.grid.x === x && tile.grid.y === y
    ) || null;
  }
}