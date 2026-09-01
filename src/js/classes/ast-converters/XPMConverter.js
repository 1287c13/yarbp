import { nodeTypes, valueTypes } from '../YarbpParser.js';

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

    // get meaning nodes
    const rootChildren = this.ast.children || [];

    // create empty grid with coords
    const sizeX = Math.max(...rootChildren.map(actor => actor.children.length));
    const sizeY = rootChildren.length;
    this._createGrid(sizeX, sizeY);

    console.log(this.result);

    // create tiles, set attrs
    let y = 0;
    rootChildren.forEach(actor => {
      console.log(actor);
      let x = 0;
      actor.children.forEach(tile => {
        // пока следующее пусто создаем пустые как только следующее не пусто создаем картинку, дальше уже по порядку все
        console.log(tile);
        let tileRepr = this._getTileByCoords(x, y);
        const tileType = tile.key;
        tileRepr.config = this._getTileConfig(tileType)(x, y);
        x++;
      });

      // todo def image tyle
      y++;
    });

    // set arrows


    return {tiles: this.result};
  };

  _getTileConfig(tileType) {
    switch (tileType) {
      case YarbpXPMConverter.VOCABULARY.image: return this._getActorImageTileConfig
      case YarbpXPMConverter.VOCABULARY.point: return this._getPointTileConfig
      case YarbpXPMConverter.VOCABULARY.lines: return this._getEmptyTileConfig
    }
  };

  _getPointTileConfig(x, y) {
    return {
      tileType: "point",
      pointStyle: "filled",
      bypassEnabled: false,
      title: "Заголовок",
      listText: "Аннотации\n- аннотация",
      arrows: {
        right: {show: true, style: "solid", hasMarker: false, hasInMarker: false},
        down: {"show": false}, left: {"show": false}, top: {"show": false}
      }
    };
  }

  _getEmptyTileConfig(x, y) {
    return {
      tileType: "lines",
      horizontalLine: {show: false, style: "solid"},
      verticalLine: {show: false, style: "solid"}
    }
  };

  _getActorImageTileConfig(x, y) {
    return {
        tileType: "image",
        src: "data:image/svg+xml;utf8,%3Csvg%20width%3D%22800px%22%20height%3D%22800px%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cpath%20d%3D%22M8%207C9.65685%207%2011%205.65685%2011%204C11%202.34315%209.65685%201%208%201C6.34315%201%205%202.34315%205%204C5%205.65685%206.34315%207%208%207Z%22%20fill%3D%22%23000000%22%2F%3E%0A%3Cpath%20d%3D%22M14%2012C14%2010.3431%2012.6569%209%2011%209H5C3.34315%209%202%2010.3431%202%2012V15H14V12Z%22%20fill%3D%22%23000000%22%2F%3E%0A%3C%2Fsvg%3E",
        aspectRatio: 0.7,
        roleName: "Участник"
      }
  };

  _createGrid(sizeX, sizeY) {
    this.result = [];

    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        this.result.push({
          grid: {x, y}, config: {}
        });
      }
    }
  };

  _getTileByCoords(x, y) {
    return this.result.find(
      tile => tile.grid.x === x && tile.grid.y === y) || null;
  };

}