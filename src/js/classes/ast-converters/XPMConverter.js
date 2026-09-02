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

    // get meaning nodes
    const rootChildren = this.ast.children || [];

    // create empty grid with coords
    const sizeX = Math.max(...rootChildren.map(actor => actor.children.length));
    const sizeY = rootChildren.length;
    this._createGrid(sizeX, sizeY);

    // create tiles, set attrs
    let y = 0;
    rootChildren.forEach(actor => {
      console.log(actor);

      let x = 0;
      actor.children.forEach(tile => {
        console.log(tile);

        let tileRepr = this._getTileByCoords(x, y);
        let props = this._extractProps(tile);
        tileRepr.config = this._getTileConfig(tile.key)(x, y, props);
        x++;
      });

      y++;
    });

    // set implicit arrows
    this.result.forEach(tile => {
      if (tile.config.tileType === 'point') {
        // check incoming arrows at neighbour nodes and decide if
        // implicit arrow needed
        [[-1, 0, 'left', 'right'], [0, -1, 'top', 'down']].forEach(shift => {
          let neighbour = this._getTileByCoords(
            tile.grid.x + shift[0], tile.grid.y + shift[1]);
          if (neighbour && neighbour.config.tileType === 'point') {
            tile.config.arrows[shift[2]] = neighbour.config.arrows[shift[3]];
          }
        })
      }
    });


    return {tiles: this.result};
  };

  _extractProps(tile) {
    switch (tile.key) {
      case YarbpXPMConverter.VOCABULARY.image: return this._extractActorProps(tile)
      case YarbpXPMConverter.VOCABULARY.point: return this._extractPointProps(tile)
      case YarbpXPMConverter.VOCABULARY.lines: return {}
    }
  }

  _extractActorProps(tile) {

  }

  _extractPointProps(tile) {
    console.log(JSON.stringify(tile))

    let title = tile.value;

    let annotations;
    let annotationParent = findChildrenByKeyValue(tile, 'key', 'аннотации')[0];
    if (annotationParent) {
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
    if (arrowsParent) {
      const getArrowConfig = (val) => val ? {
        show: true,
        style: /--/.test(val) ? 'dashed' : /\.\./.test(val) ? 'dotted' : 'solid',
        hasMarker: false,
        hasInMarker: false
      } : {show: false};
      arrows = arrowsParent.children.map(arrValNode => arrValNode.value);
      [rightArrow, downArrow, leftArrow, topArrow] = arrows.map(getArrowConfig);
    }

    return {
      title: title,
      pointStyle: pointStyle,
      bypassEnabled: bypassEnabled,
      listText: annotations,
      arrows: {right: rightArrow, down: downArrow, left: leftArrow, top: topArrow}
    }
  };

  _getTileConfig(tileType) {
    switch (tileType) {
      case YarbpXPMConverter.VOCABULARY.image: return this._getActorImageTileConfig
      case YarbpXPMConverter.VOCABULARY.point: return this._getPointTileConfig
      case YarbpXPMConverter.VOCABULARY.lines: return this._getEmptyTileConfig
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
        right: {show: false}, down: {show: false}, left: {show: false}, top: {show: false}},
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
          grid: {x, y}, config: this._getEmptyTileConfig(x, y)}
        );
      }
    }
  };

  _getTileByCoords(x, y) {
    return this.result.find(
      tile => tile.grid.x === x && tile.grid.y === y) || null;
  };

}