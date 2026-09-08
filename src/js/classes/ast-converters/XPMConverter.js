import { nodeTypes, valueTypes } from '../YarbpParser.js';
import { findChildrenByKeyValue } from "../../utils.js";

export class YarbpXPMConverter {
  constructor(ast) {
    this.ast = ast;
    this.result = null;
  }

  static VOCABULARY = Object.freeze({
    image: 'картинка',
    point: 'точка',
    lines: 'пусто'
  });

  convert() {
    if (!this.ast || this.ast.nodeType !== nodeTypes.ROOT) {
      throw new Error('Invalid AST: root node must be of type ROOT');
    }

    const rootChildren = this.ast.children || [];

    const sizeX = rootChildren.reduce(
      (max, actor) => Math.max(max, (actor.children || []).length),
      0
    );
    const sizeY = rootChildren.length;
    this._createGrid(sizeX, sizeY);

    let y = 0;
    rootChildren.forEach(actor => {
      let x = 0;
      (actor.children || []).forEach(tile => {
        let tileRepr = this._getTileByCoords(x, y);
        let props = this._extractProps(tile);
        tileRepr.config = this._getTileConfig(tile.key)(x, y, props);
        x++;
      });
      y++;
    });

    this._inheritArrows();

    // Создаём глубокую копию конфигураций для обхода кэша
    this.result = this.result.map(tile => ({
      grid: {...tile.grid},
      config: JSON.parse(JSON.stringify(tile.config))
    }));

    return {tiles: this.result};
  }

  _inheritArrows() {
    const tiles = this.result || [];
    const processed = new Set();

    tiles.forEach(tile => {
      if (tile.config && tile.config.tileType === 'point') {
        const {x, y} = tile.grid;
        const arrows = tile.config.arrows || {};

        ['right', 'down', 'left', 'top'].forEach(direction => {
          const arrow = arrows[direction];
          if (!arrow || !arrow.show) return;

          const key = `${x},${y},${direction}`;
          if (processed.has(key)) return;
          processed.add(key);

          const opposite = this._getOppositeDirection(direction);
          const {dx, dy} = this._getDirectionDelta(direction);

          // Прокладываем линию через пустые тайлы
          const result = this._propagateThroughEmptyTiles(x, y, dx, dy, arrow.style);

          if (!result || !result.targetTile || result.targetTile.config.tileType !== 'point') return;

          const targetTile = result.targetTile;
          const targetX = targetTile.grid.x;
          const targetY = targetTile.grid.y;

          const isOutgoing = arrow.hasMarker && !arrow.hasInMarker;
          const isIncoming = arrow.hasInMarker && !arrow.hasMarker;
          const isBidirectional = arrow.hasMarker && arrow.hasInMarker;
          const isPlain = !arrow.hasMarker && !arrow.hasInMarker;

          // Вспомогательная функция для маркера у точки
          const markerAtPoint = (dir) => {
            // Для right/down: hasInMarker = маркер у точки
            // Для left/top: hasMarker = маркер у точки
            if (dir === 'right' || dir === 'down') {
              return {hasMarker: false, hasInMarker: true};
            } else {
              return {hasMarker: true, hasInMarker: false};
            }
          };

          // Вспомогательная функция для линии без маркеров
          const noMarker = () => ({hasMarker: false, hasInMarker: false});

          if (isOutgoing) {
            // Исходящая: маркер у целевой точки
            tile.config.arrows[direction] = {
              show: true,
              style: arrow.style,
              ...noMarker()
            };

            // Маркер у целевой точки на противоположном направлении
            const marker = markerAtPoint(opposite);
            targetTile.config.arrows[opposite] = {
              show: true,
              style: arrow.style,
              ...marker
            };

            processed.add(`${targetX},${targetY},${opposite}`);
          }
          else if (isIncoming) {
            // Входящая: маркер у исходной точки
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
          }
          else if (isBidirectional) {
            // Двусторонняя: маркеры у обеих точек
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
          }
          else if (isPlain) {
            // Без маркеров: просто линия
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

      if (tile.config.tileType === 'point') {
        // Нашли целевую точку
        return {targetTile: tile};
      } else if (tile.config.tileType === 'lines') {
        // Пустой тайл - рисуем линию
        if (dx !== 0) {
          // Горизонтальная линия
          tile.config.horizontalLine = {
            show: true,
            style: style,
            y: 34
          };
        } else {
          // Вертикальная линия
          tile.config.verticalLine = {
            show: true,
            style: style,
            x: 34
          };
        }
        currentX += dx;
        currentY += dy;
      } else {
        // Препятствие (image)
        return null;
      }
    }

    return null;
  }

  _getDirectionDelta(direction) {
    switch (direction) {
      case 'right': return {dx: 1, dy: 0};
      case 'left': return {dx: -1, dy: 0};
      case 'down': return {dx: 0, dy: 1};
      case 'top': return {dx: 0, dy: -1};
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
    const {x, y} = tile.grid;
    const arrows = tile.config.arrows;

    const neighbors = [
      {dx: -1, dy: 1, from: 'left', to: 'down'},
      {dx: 1, dy: 1, from: 'right', to: 'down'},
      {dx: -1, dy: -1, from: 'left', to: 'top'},
      {dx: 1, dy: -1, from: 'right', to: 'top'}
    ];

    neighbors.forEach(({dx, dy, from, to}) => {
      const neighbor = this._getTileByCoords(x + dx, y + dy);

      if (neighbor && neighbor.config && neighbor.config.tileType === 'point') {
        const hasLeftArrow = arrows.left?.show;
        const hasTopArrow = arrows.top?.show;
        const hasRightArrow = arrows.right?.show;
        const hasDownArrow = arrows.down?.show;

        if ((from === 'left' && hasLeftArrow && to === 'down' && neighbor.config.arrows?.down?.show) ||
            (from === 'right' && hasRightArrow && to === 'down' && neighbor.config.arrows?.down?.show) ||
            (from === 'left' && hasLeftArrow && to === 'top' && neighbor.config.arrows?.top?.show) ||
            (from === 'right' && hasRightArrow && to === 'top' && neighbor.config.arrows?.top?.show)) {
          tile.config.bypassEnabled = true;
        }
      }
    });
  }

  _extractProps(tile) {
    switch (tile.key) {
      case YarbpXPMConverter.VOCABULARY.image: return this._extractActorProps(tile)
      case YarbpXPMConverter.VOCABULARY.point: return this._extractPointProps(tile)
      case YarbpXPMConverter.VOCABULARY.lines: return {}
    }
  }

  _extractActorProps(tile) {
    return {};
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
        if (!val) return {show: false};

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

    return {
      title: title,
      pointStyle: pointStyle,
      bypassEnabled: bypassEnabled,
      listText: annotations,
      arrows: {
        right: rightArrow || {show: false},
        down: downArrow || {show: false},
        left: leftArrow || {show: false},
        top: topArrow || {show: false}
      }
    }
  }

  _getTileConfig(tileType) {
    switch (tileType) {
      case YarbpXPMConverter.VOCABULARY.image: return this._getActorImageTileConfig
      case YarbpXPMConverter.VOCABULARY.point: return this._getPointTileConfig
      case YarbpXPMConverter.VOCABULARY.lines: return this._getEmptyTileConfig
      default: return () => {};
    }
  }

  _getPointTileConfig(x, y, props = {}) {
    return {
      tileType: "point",
      pointStyle: "filled",
      bypassEnabled: false,
      title: "",
      listText: "",
      arrows: {
        right: {show: false},
        down: {show: false},
        left: {show: false},
        top: {show: false}
      },
      ...props
    };
  }

  _getEmptyTileConfig(x, y, props = {}) {
    return {
      tileType: "lines",
      horizontalLine: {show: false, style: "solid"},
      verticalLine: {show: false, style: "solid"},
      ...props
    }
  }

  _getActorImageTileConfig(x, y, props = {}) {
    return {
      tileType: "image",
      src: '',
      aspectRatio: 0.7,
      roleName: "",
      ...props
    }
  }

  _createGrid(sizeX, sizeY) {
    this.result = [];

    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        this.result.push({
          grid: {x, y},
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