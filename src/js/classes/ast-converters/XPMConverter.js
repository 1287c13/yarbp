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

    return {tiles: this.result};
  };

  _inheritArrows() {
    const tiles = this.result || [];

    // Проходим по всем точкам и обрабатываем их стрелки
    tiles.forEach(tile => {
      if (tile.config && tile.config.tileType === 'point') {
        const {x, y} = tile.grid;

        // Проверяем каждое направление
        this._processDirection(tile, x, y, 'right', 1, 0);
        this._processDirection(tile, x, y, 'down', 0, 1);
        this._processDirection(tile, x, y, 'left', -1, 0);
        this._processDirection(tile, x, y, 'top', 0, -1);
      }
    });

    // Обработка обходных дуг
    tiles.forEach(tile => {
      if (tile.config && tile.config.tileType === 'point' && tile.config.bypassEnabled) {
        this._handleBypassConnections(tile);
      }
    });
  }

  _processDirection(tile, x, y, direction, dx, dy) {
    const arrow = tile.config.arrows?.[direction];

    if (!arrow || !arrow.show) return;

    let currentX = x + dx;
    let currentY = y + dy;

    const maxX = Math.max(...this.result.map(t => t.grid.x));
    const maxY = Math.max(...this.result.map(t => t.grid.y));

    while (currentX >= 0 && currentX <= maxX && currentY >= 0 && currentY <= maxY) {
      const nextTile = this._getTileByCoords(currentX, currentY);

      if (!nextTile) break;

      if (nextTile.config && nextTile.config.tileType === 'point') {
        // Нашли точку - добавляем ответную стрелку
        const oppositeDirection = this._getOppositeDirection(direction);

        // Проверяем, есть ли у целевой точки своя стрелка в этом направлении
        const targetArrow = nextTile.config.arrows?.[oppositeDirection];

        if (!targetArrow || !targetArrow.show) {
          // Добавляем ответную стрелку только если у цели нет своей
          // Если исходная стрелка имеет маркер на конце (исходящая),
          // то у цели будет маркер в начале (входящая)
          nextTile.config.arrows[oppositeDirection] = {
            ...arrow,
            show: true,
            hasMarker: false,
            hasInMarker: arrow.hasMarker  // Если исходная исходящая, то для цели входящая
          };
        }
        break;
      } else if (nextTile.config && nextTile.config.tileType === 'lines') {
        // Пустой тайл - рисуем линию
        if (direction === 'right' || direction === 'left') {
          nextTile.config.horizontalLine = {
            ...nextTile.config.horizontalLine,
            show: true,
            style: arrow.style || 'solid',
            y: 34
          };
        } else {
          nextTile.config.verticalLine = {
            ...nextTile.config.verticalLine,
            show: true,
            style: arrow.style || 'solid',
            x: 34
          };
        }
      } else {
        // Встретили непреодолимое препятствие (image)
        break;
      }

      currentX += dx;
      currentY += dy;
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
    // TODO: Implement actor props extraction
    return {};
  }

  _extractPointProps(tile) {
    console.log(JSON.stringify(tile))

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

        // Определяем стиль
        let style = 'solid';
        if (/--/.test(arrowStr)) style = 'dashed';
        else if (/\.\./.test(arrowStr)) style = 'dotted';

        // Определяем маркеры
        const hasStartMarker = arrowStr.startsWith('<');
        const hasEndMarker = arrowStr.endsWith('>');

        return {
          show: true,
          style: style,
          hasMarker: hasEndMarker,      // маркер на конце (исходящая)
          hasInMarker: hasStartMarker   // маркер в начале (входящая)
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
  };

  _getTileConfig(tileType) {
    switch (tileType) {
      case YarbpXPMConverter.VOCABULARY.image: return this._getActorImageTileConfig
      case YarbpXPMConverter.VOCABULARY.point: return this._getPointTileConfig
      case YarbpXPMConverter.VOCABULARY.lines: return this._getEmptyTileConfig
      default: return () => {};
    }
  };

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
  };

  _getActorImageTileConfig(x, y, props = {}) {
    return {
      tileType: "image",
      src: "data:image/svg+xml;utf8,%3Csvg%20width%3D%22800px%22%20height%3D%22800px%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cpath%20d%3D%22M8%207C9.65685%207%2011%205.65685%2011%204C11%202.34315%209.65685%201%208%201C6.34315%201%205%202.34315%205%204C5%205.65685%206.34315%207%208%207Z%22%20fill%3D%22%23000000%22%2F%3E%0A%3Cpath%20d%3D%22M14%2012C14%2010.3431%2012.6569%209%2011%209H5C3.34315%209%202%2010.3431%202%2012V15H14V12Z%22%20fill%3D%22%23000000%22%2F%3E%0A%3C%2Fsvg%3E",
      aspectRatio: 0.7,
      roleName: "",
      ...props
    }
  };

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
  };

  _getTileByCoords(x, y) {
    return this.result.find(
      tile => tile.grid.x === x && tile.grid.y === y
    ) || null;
  };
}