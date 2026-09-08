import {YarbpBasicRenderer} from "../YarbpBasicRenderer.js";
import {YarbpXPMConverter} from "../ast-converters/XPMConverter.js";

export class XPMRenderer extends YarbpBasicRenderer {
  constructor(...args) {
    super(...args);
    this.uiContainer = null;
    this.tileRenderers = this._createTileRenderers();
  }

  static DEFAULTS = Object.freeze({
    SVG_NS: 'http://www.w3.org/2000/svg',

    // Точки
    DOT_RADIUS: 7,
    CONNECTION_RADIUS_MULTIPLIER: 2,
    DOT_BASE_X: 130,
    DOT_BASE_Y: 150,
    DIAMOND_RADIUS_FACTOR: 1.2,

    // Текст
    TEXT_OFFSET_X: 30,
    TEXT_OFFSET_Y: 30,
    TITLE_FONT_SIZE: 18,
    LIST_FONT_SIZE: 14,
    LIST_LINE_HEIGHT: 16,
    TITLE_LINE_SPACING: 18,
    FONT_FAMILY: 'Arial',

    // Стрелки
    SHORT_LINE_LEN: 20,
    IN_ARROW_OFFSET: 8,
    STROKE_WIDTH: 1,

    // Маркеры
    MARKER_WIDTH: 6,
    MARKER_HEIGHT: 6,

    // Стили линий
    DASHED_LINE_PATTERN: '8,4',
    DOTTED_LINE_PATTERN: '2,3',

    // Изображения
    IMAGE_HEIGHT: 80,

    // Тайлы
    DEFAULT_TILE_SIZE: 40,

    // Роли
    ROLE_NAME_FONT_SIZE: 20,
    ROLE_NAME_OFFSET_X: 5,
    ROLE_NAME_MAX_WIDTH: 200,

    // UI
    UI_PADDING: '10px 20px 10px 20px',
    UI_BACKGROUND_LIGHT: '#ffffff',
    UI_BACKGROUND_DARK: '#2d2d2d',
    UI_COLOR_LIGHT: '#111827',
    UI_COLOR_DARK: '#e0e0e0',
    UI_FONT_FAMILY: 'system-ui, sans-serif',

    // Ошибки
    ERROR_FONT_SIZE: 14,
    ERROR_LINE_HEIGHT: 20,
    ERROR_EMOJI_OFFSET: 24,
    ERROR_COMPACT_SIZE: 400,

    // Цвета
    COLOR_MAIN_LIGHT: '#335272',
    COLOR_MAIN_DARK: '#c3cdd0',
    COLOR_WHITE: '#ffffff'
  });

  static getColor(colorType = 'main') {
    const isDark = document.body.classList.contains('dark');
    switch (colorType) {
      case 'main':
        return isDark
          ? XPMRenderer.DEFAULTS.COLOR_MAIN_DARK
          : XPMRenderer.DEFAULTS.COLOR_MAIN_LIGHT;
      case 'ide-code-val':
        return isDark
          ? XPMRenderer.DEFAULTS.COLOR_MAIN_DARK
          : XPMRenderer.DEFAULTS.COLOR_MAIN_LIGHT;
      default:
        return isDark
          ? XPMRenderer.DEFAULTS.COLOR_MAIN_DARK
          : XPMRenderer.DEFAULTS.COLOR_MAIN_LIGHT;
    }
  }

  render() {
    this.AST = this.parser.getAST();

    const isDark = document.body.classList.contains('dark');

    this.renderer = new YarbpXPMConverter(this.AST);
    let markup = this.renderer.convert();
    let svg = this.composeTiles(markup.tiles).svg;

    const HTML = `<div>${new XMLSerializer().serializeToString(svg)}</div>`;

    const renderPane = this.renderTextarea.closest('#render-pane');
    const editorContainer = this.renderHighlightDiv.closest('.editor-container');
    if (editorContainer) editorContainer.style.display = 'none';

    this.uiContainer = renderPane.querySelector('.ui-render-container');
    if (!this.uiContainer) {
      this.uiContainer = document.createElement('div');
      this.uiContainer.className = 'ui-render-container';
      renderPane.appendChild(this.uiContainer);
    }

    this.uiContainer.style.cssText = `
      padding: ${XPMRenderer.DEFAULTS.UI_PADDING};
      overflow-y: auto;
      height: 100%;
      box-sizing: border-box;
      background: ${isDark ? XPMRenderer.DEFAULTS.UI_BACKGROUND_DARK : XPMRenderer.DEFAULTS.UI_BACKGROUND_LIGHT};
      color: ${isDark ? XPMRenderer.DEFAULTS.UI_COLOR_DARK : XPMRenderer.DEFAULTS.UI_COLOR_LIGHT};
      font-family: ${XPMRenderer.DEFAULTS.UI_FONT_FAMILY};
      position: relative;
    `;

    this.uiContainer.innerHTML = HTML;
  }

  /* region утилиты =======================================================*/

  static createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS(XPMRenderer.DEFAULTS.SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value);
    }
    return el;
  }

  static capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /* endregion ============================================================*/

  /* region измеряем и кэшируем SVG =======================================*/

  static measureSvg;

  createHiddenSVGContainer() {
    if (XPMRenderer.measureSvg) return;

    const measureSvg = document.createElementNS(XPMRenderer.DEFAULTS.SVG_NS, 'svg');
    measureSvg.style.position = 'absolute';
    measureSvg.style.visibility = 'hidden';
    measureSvg.style.pointerEvents = 'none';
    measureSvg.setAttribute('width', 0);
    measureSvg.setAttribute('height', 0);
    document.body.appendChild(measureSvg);

    XPMRenderer.measureSvg = measureSvg;
  }

  static measureElements(elements) {
    const tempGroup = XPMRenderer.createSvgElement('g');
    elements.forEach(el => tempGroup.appendChild(el));
    XPMRenderer.measureSvg.appendChild(tempGroup);
    const bbox = tempGroup.getBBox();
    XPMRenderer.measureSvg.removeChild(tempGroup);
    return {
      x: bbox.x,
      y: bbox.y,
      width: Math.ceil(bbox.width),
      height: Math.ceil(bbox.height)
    };
  }

  static staticSizeCache = new Map();

  static canonicalize(obj) {
    if (Array.isArray(obj)) {
      return '[' + obj.map(XPMRenderer.canonicalize).join(',') + ']';
    } else if (obj && typeof obj === 'object') {
      const keys = Object.keys(obj).sort();
      return '{' + keys.map(k => `${JSON.stringify(k)}:${XPMRenderer.canonicalize(obj[k])}`).join(',') + '}';
    } else {
      return JSON.stringify(obj);
    }
  }

  static getCachedSize(config) {
    const key = XPMRenderer.canonicalize(config);
    if (XPMRenderer.staticSizeCache.has(key)) {
      return XPMRenderer.staticSizeCache.get(key);
    }
    return null;
  }

  static setCachedSize(config, size) {
    const key = XPMRenderer.canonicalize(config);
    XPMRenderer.staticSizeCache.set(key, size);
  }

  /* endregion ========================================================== */

  /* region Базовые функции отрисовки SVG =============================== */

  markersDefs = null;

  getMarkersDefs() {
    if (this.markersDefs) return this.markersDefs;
    const defs = XPMRenderer.createSvgElement('defs');
    ['Solid', 'Dashed', 'Dotted'].forEach(type => {
      const markerOut = XPMRenderer.createSvgElement('marker', {
        id: `arrow${type}`,
        viewBox: '0 0 10 10',
        refX: '9',
        refY: '5',
        markerWidth: XPMRenderer.DEFAULTS.MARKER_WIDTH,
        markerHeight: XPMRenderer.DEFAULTS.MARKER_HEIGHT,
        orient: 'auto'
      });
      markerOut.appendChild(XPMRenderer.createSvgElement('path', {
        d: 'M 0 0 L 10 5 L 0 10 z',
        fill: XPMRenderer.getColor()
      }));
      defs.appendChild(markerOut);

      const markerIn = XPMRenderer.createSvgElement('marker', {
        id: `arrow${type}In`,
        viewBox: '0 0 10 10',
        refX: '1',
        refY: '5',
        markerWidth: XPMRenderer.DEFAULTS.MARKER_WIDTH,
        markerHeight: XPMRenderer.DEFAULTS.MARKER_HEIGHT,
        orient: 'auto'
      });
      markerIn.appendChild(XPMRenderer.createSvgElement('path', {
        d: 'M 10 0 L 0 5 L 10 10 z',
        fill: XPMRenderer.getColor()
      }));
      defs.appendChild(markerIn);
    });
    this.markersDefs = defs;
    return defs;
  }

  static drawPoint(style, dotX, dotY, dotRadius) {
    const g = XPMRenderer.createSvgElement('g');
    switch (style) {
      case 'filled':
        g.appendChild(XPMRenderer.createSvgElement('circle', {
          cx: dotX, cy: dotY, r: dotRadius,
          fill: XPMRenderer.getColor(), stroke: 'none'
        }));
        break;
      case 'hollow':
        g.appendChild(XPMRenderer.createSvgElement('circle', {
          cx: dotX,
          cy: dotY,
          r: dotRadius,
          fill: XPMRenderer.DEFAULTS.COLOR_WHITE,
          stroke: XPMRenderer.getColor(),
          'stroke-width': XPMRenderer.DEFAULTS.STROKE_WIDTH
        }));
        break;
      case 'diamond': {
        const half = dotRadius * XPMRenderer.DEFAULTS.DIAMOND_RADIUS_FACTOR;
        const points = `${dotX},${dotY - half} ${dotX + half},${dotY} ${dotX},${dotY + half} ${dotX - half},${dotY}`;
        g.appendChild(XPMRenderer.createSvgElement('polygon', {
          points,
          fill: XPMRenderer.DEFAULTS.COLOR_WHITE,
          stroke: XPMRenderer.getColor(),
          'stroke-width': XPMRenderer.DEFAULTS.STROKE_WIDTH
        }));
        break;
      }
    }
    return g;
  }

  static drawText(title, listText, dotX, dotY) {
    const g = XPMRenderer.createSvgElement('g');
    const titleX = dotX + XPMRenderer.DEFAULTS.TEXT_OFFSET_X;
    const titleY = dotY + XPMRenderer.DEFAULTS.TEXT_OFFSET_Y;

    const titleEl = XPMRenderer.createSvgElement('text', {
      x: titleX,
      y: titleY,
      'font-family': XPMRenderer.DEFAULTS.FONT_FAMILY,
      'font-size': XPMRenderer.DEFAULTS.TITLE_FONT_SIZE,
      'font-weight': 'bold',
      fill: XPMRenderer.getColor()
    });
    titleEl.textContent = title;
    g.appendChild(titleEl);

    let currentY = titleY + XPMRenderer.DEFAULTS.TITLE_LINE_SPACING;
    listText.split('\n').forEach(line => {
      const textEl = XPMRenderer.createSvgElement('text', {
        x: titleX,
        y: currentY,
        'font-family': XPMRenderer.DEFAULTS.FONT_FAMILY,
        'font-size': XPMRenderer.DEFAULTS.LIST_FONT_SIZE,
        fill: XPMRenderer.getColor()
      });
      textEl.textContent = line;
      g.appendChild(textEl);
      currentY += XPMRenderer.DEFAULTS.LIST_LINE_HEIGHT;
    });

    return g;
  }

  static drawArrow(arrowType, arrowCfg, connectionPoints, bypassEnabled, tileWidth, tileHeight) {
  const {
    show = false,
    style = 'solid',
    hasMarker = false,
    hasInMarker = false
  } = arrowCfg || {};

  const pts = connectionPoints;
  const shortLen = XPMRenderer.DEFAULTS.SHORT_LINE_LEN;
  // Всегда используем inOffset = 0 (как у опциональных точек)
  const inOffset = 0;

  let x1, y1, x2, y2;

  switch (arrowType) {
    case 'right':
      x1 = pts.right.x - inOffset;
      y1 = pts.right.y;
      x2 = tileWidth;
      y2 = y1;
      break;
    case 'down':
      x1 = pts.bottom.x;
      y1 = pts.bottom.y - inOffset;
      x2 = x1;
      y2 = tileHeight;
      break;
    case 'left':
      x2 = pts.left.x + inOffset;
      y2 = pts.left.y;
      x1 = x2 - shortLen - inOffset;
      y1 = y2;
      break;
    case 'top':
      x2 = pts.top.x;
      y2 = pts.top.y + inOffset;
      x1 = x2;
      y1 = y2 - shortLen - inOffset;
      break;
  }

  const line = XPMRenderer.createSvgElement('line', {
    x1, y1, x2, y2,
    stroke: XPMRenderer.getColor(),
    'stroke-width': XPMRenderer.DEFAULTS.STROKE_WIDTH,
    opacity: show ? 1 : 0
  });

  if (style === 'dashed') {
    line.setAttribute('stroke-dasharray', XPMRenderer.DEFAULTS.DASHED_LINE_PATTERN);
  } else if (style === 'dotted') {
    line.setAttribute('stroke-dasharray', XPMRenderer.DEFAULTS.DOTTED_LINE_PATTERN);
  }

  if (hasMarker && show) {
    const styleCap = XPMRenderer.capitalize(style);
    line.setAttribute('marker-end', `url(#arrow${styleCap})`);
  }
  if (hasInMarker && show) {
    const styleCap = XPMRenderer.capitalize(style);
    line.setAttribute('marker-start', `url(#arrow${styleCap}In)`);
  }

  return line;
}

  static drawBypassArc(arrows, connectionPoints, style) {
    let start = null;
    let end = null;

    if (arrows['left']?.show && arrows['left'].style !== 'dotted') {
      start = {
        x: connectionPoints.left.x,
        y: connectionPoints.left.y,
        angle: 180
      };
    } else if (arrows['top']?.show && arrows['top'].style !== 'dotted') {
      start = {
        x: connectionPoints.top.x,
        y: connectionPoints.top.y,
        angle: 270
      };
    }

    if (arrows['down']?.show && arrows['down'].style !== 'dotted') {
      end = {
        x: connectionPoints.bottom.x,
        y: connectionPoints.bottom.y,
        angle: 90
      };
    } else if (arrows['right']?.show && arrows['right'].style !== 'dotted') {
      end = {
        x: connectionPoints.right.x,
        y: connectionPoints.right.y,
        angle: 0
      };
    }

    if (!start || !end) return null;

    const delta = (end.angle - start.angle + 360) % 360;
    const largeArc = delta > 180 ? 1 : 0;
    const sweep = 1;

    const path = XPMRenderer.createSvgElement('path', {
      d: `M ${start.x} ${start.y} A ${connectionPoints.radius} ${connectionPoints.radius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`,
      fill: 'none',
      stroke: XPMRenderer.getColor(),
      'stroke-width': XPMRenderer.DEFAULTS.STROKE_WIDTH
    });

    if (style === 'dashed') {
      path.setAttribute('stroke-dasharray', XPMRenderer.DEFAULTS.DASHED_LINE_PATTERN);
    } else if (style === 'dotted') {
      path.setAttribute('stroke-dasharray', XPMRenderer.DEFAULTS.DOTTED_LINE_PATTERN);
    }

    return path;
  }

  drawSimpleLine(x1, y1, x2, y2, style) {
    const line = XPMRenderer.createSvgElement('line', {
      x1, y1, x2, y2,
      stroke: XPMRenderer.getColor(),
      'stroke-width': XPMRenderer.DEFAULTS.STROKE_WIDTH
    });
    if (style === 'dashed') {
      line.setAttribute('stroke-dasharray', XPMRenderer.DEFAULTS.DASHED_LINE_PATTERN);
    } else if (style === 'dotted') {
      line.setAttribute('stroke-dasharray', XPMRenderer.DEFAULTS.DOTTED_LINE_PATTERN);
    }
    return line;
  }

  /* endregion ========================================================== */

  /* region Рендер элементов ============================================ */

  _createTileRenderers() {
    const self = this;

    return {
      point: {
        measure(config) {
          const cached = XPMRenderer.getCachedSize(config);
          if (cached) return cached;

          const elements = this.buildStaticElements(config);
          const bbox = XPMRenderer.measureElements(elements);
          const size = {
            minWidth: bbox.width,
            minHeight: bbox.height,
            minX: bbox.x,
            minY: bbox.y
          };
          XPMRenderer.setCachedSize(config, size);
          return size;
        },

        buildStaticElements(config) {
          const {
            pointStyle = 'filled',
            bypassEnabled = false,
            title = '',
            listText = '',
            arrows = {}
          } = config;

          const dotX = XPMRenderer.DEFAULTS.DOT_BASE_X;
          const dotY = XPMRenderer.DEFAULTS.DOT_BASE_Y;
          const dotRadius = XPMRenderer.DEFAULTS.DOT_RADIUS;
          const connectionRadius = dotRadius * XPMRenderer.DEFAULTS.CONNECTION_RADIUS_MULTIPLIER;

          const connectionPoints = {
            top: {x: dotX, y: dotY - connectionRadius},
            right: {x: dotX + connectionRadius, y: dotY},
            bottom: {x: dotX, y: dotY + connectionRadius},
            left: {x: dotX - connectionRadius, y: dotY},
            radius: connectionRadius
          };

          const elements = [];
          ['left', 'top'].forEach(type => {
            const arrowCfg = arrows[type] || {
              show: false,
              style: 'solid',
              hasMarker: false,
              hasInMarker: false
            };
            elements.push(XPMRenderer.drawArrow(type, arrowCfg, connectionPoints, bypassEnabled, 0, 0));
          });

          elements.push(XPMRenderer.drawPoint(pointStyle, dotX, dotY, dotRadius));
          elements.push(XPMRenderer.drawText(title, listText, dotX, dotY));

          return elements;
        },

        render(config, cellWidth, cellHeight) {
          const staticSize = this.measure(config);
          const effectiveWidth = cellWidth || staticSize.minWidth;
          const effectiveHeight = cellHeight || staticSize.minHeight;

          const offsetX = -staticSize.minX;
          const offsetY = -staticSize.minY;

          const {
            pointStyle = 'filled',
            bypassEnabled = false,
            title = '',
            listText = '',
            arrows = {}
          } = config;

          const dotX = XPMRenderer.DEFAULTS.DOT_BASE_X + offsetX;
          const dotY = XPMRenderer.DEFAULTS.DOT_BASE_Y + offsetY;
          const dotRadius = XPMRenderer.DEFAULTS.DOT_RADIUS;
          const connectionRadius = dotRadius * XPMRenderer.DEFAULTS.CONNECTION_RADIUS_MULTIPLIER;

          const connectionPoints = {
            top: {x: dotX, y: dotY - connectionRadius},
            right: {x: dotX + connectionRadius, y: dotY},
            bottom: {x: dotX, y: dotY + connectionRadius},
            left: {x: dotX - connectionRadius, y: dotY},
            radius: connectionRadius
          };

          const group = XPMRenderer.createSvgElement('g');

          ['right', 'down', 'left', 'top'].forEach(type => {
            const arrowCfg = arrows[type] || {
              show: false,
              style: 'solid',
              hasMarker: false,
              hasInMarker: false
            };
            group.appendChild(XPMRenderer.drawArrow(type, arrowCfg, connectionPoints, bypassEnabled, effectiveWidth, effectiveHeight));
          });

          if (bypassEnabled) {
            const styleForArc = arrows['left']?.show && arrows['left'].style !== 'dotted'
              ? arrows['left'].style
              : (arrows['top']?.show && arrows['top'].style !== 'dotted'
                ? arrows['top'].style
                : 'solid');
            const arc = XPMRenderer.drawBypassArc(arrows, connectionPoints, styleForArc);
            if (arc) group.appendChild(arc);
          }

          group.appendChild(XPMRenderer.drawPoint(pointStyle, dotX, dotY, dotRadius));
          group.appendChild(XPMRenderer.drawText(title, listText, dotX, dotY));

          return {
            group,
            minWidth: staticSize.minWidth,
            minHeight: staticSize.minHeight
          };
        }
      },

      lines: {
        measure() {
          return {
            minWidth: XPMRenderer.DEFAULTS.DEFAULT_TILE_SIZE,
            minHeight: XPMRenderer.DEFAULTS.DEFAULT_TILE_SIZE,
            minX: 0,
            minY: 0
          };
        },
        render(config, cellWidth, cellHeight) {
          const group = XPMRenderer.createSvgElement('g');
          const hLine = config.horizontalLine;
          const vLine = config.verticalLine;

          if (hLine?.show) {
            // Используем DOT_BASE_Y для горизонтальных линий
            const y = hLine.y !== undefined ? hLine.y : XPMRenderer.DEFAULTS.DOT_BASE_Y;
            group.appendChild(
              self.drawSimpleLine(0, y, cellWidth, y, hLine?.style || 'solid')
            );
          }
          if (vLine?.show) {
            // Используем DOT_BASE_X для вертикальных линий
            const x = vLine.x !== undefined ? vLine.x : XPMRenderer.DEFAULTS.DOT_BASE_X;
            group.appendChild(
              self.drawSimpleLine(x, 0, x, cellHeight, vLine?.style || 'solid')
            );
          }

          return {group, minWidth: cellWidth, minHeight: cellHeight};
        }
      },

      image: {
        measure(config) {
          const aspectRatio = config.aspectRatio || 1;
          const imageWidth = XPMRenderer.DEFAULTS.IMAGE_HEIGHT * aspectRatio;
          const roleName = config.roleName || '';

          let roleNameWidth = 0;
          if (roleName) {
            const tempText = XPMRenderer.createSvgElement('text', {
              x: 0,
              y: 0,
              'font-family': XPMRenderer.DEFAULTS.FONT_FAMILY,
              'font-size': XPMRenderer.DEFAULTS.TITLE_FONT_SIZE,
              'font-weight': 'bold',
              fill: XPMRenderer.getColor()
            });
            tempText.textContent = roleName;
            const bbox = XPMRenderer.measureElements([tempText]);
            roleNameWidth = Math.ceil(bbox.width);
          }

          const minWidth = imageWidth + roleNameWidth + XPMRenderer.DEFAULTS.ROLE_NAME_OFFSET_X;
          const minHeight = Math.max(XPMRenderer.DEFAULTS.IMAGE_HEIGHT, XPMRenderer.DEFAULTS.TITLE_FONT_SIZE * 2);

          return {
            minWidth,
            minHeight,
            minX: 0,
            minY: 0
          };
        },
        render(config, cellWidth, cellHeight) {
          const group = XPMRenderer.createSvgElement('g');
          const src = config.src || config.dataUrl || config.externalUrl || '';
          const aspectRatio = config.aspectRatio || 1;
          const imageHeight = XPMRenderer.DEFAULTS.IMAGE_HEIGHT;
          const imageWidth = imageHeight * aspectRatio;
          const roleName = config.roleName || '';

          if (src && cellWidth > 0 && cellHeight >= imageHeight) {
            const x = cellWidth - imageWidth;
            const y = 0;
            group.appendChild(XPMRenderer.createSvgElement('image', {
              x, y,
              width: imageWidth,
              height: imageHeight,
              'preserveAspectRatio': 'xMaxYMid meet',
              'href': src
            }));
          }

          if (roleName) {
            const textX = cellWidth - imageWidth - XPMRenderer.DEFAULTS.ROLE_NAME_OFFSET_X;
            const textY = imageHeight / 2;
            const textEl = XPMRenderer.createSvgElement('text', {
              x: textX,
              y: textY,
              'font-family': XPMRenderer.DEFAULTS.FONT_FAMILY,
              'font-size': XPMRenderer.DEFAULTS.TITLE_FONT_SIZE,
              'font-weight': 'bold',
              fill: XPMRenderer.getColor(),
              'text-anchor': 'end',
              'dominant-baseline': 'middle'
            });
            textEl.textContent = roleName;
            group.appendChild(textEl);
          }

          return {
            group,
            minWidth: this.measure(config).minWidth,
            minHeight: this.measure(config).minHeight
          };
        }
      },

      empty: {
        measure() {
          return {
            minWidth: XPMRenderer.DEFAULTS.DEFAULT_TILE_SIZE,
            minHeight: XPMRenderer.DEFAULTS.DEFAULT_TILE_SIZE,
            minX: 0,
            minY: 0
          };
        },
        render() {
          return {
            group: XPMRenderer.createSvgElement('g'),
            minWidth: XPMRenderer.DEFAULTS.DEFAULT_TILE_SIZE,
            minHeight: XPMRenderer.DEFAULTS.DEFAULT_TILE_SIZE
          };
        }
      }
    };
  }

  createErrorSvg(errorMessage, width = 800, height = 400) {
    const svg = XPMRenderer.createSvgElement('svg', {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`
    });

    const text = XPMRenderer.createSvgElement('text', {
      x: 20,
      y: 20,
      'text-anchor': 'start',
      'dominant-baseline': 'hanging',
      'font-family': XPMRenderer.DEFAULTS.FONT_FAMILY,
      'font-size': XPMRenderer.DEFAULTS.ERROR_FONT_SIZE,
      fill: XPMRenderer.getColor('ide-code-val')
    });

    const lines = errorMessage.split('\n');
    const lineHeight = XPMRenderer.DEFAULTS.ERROR_LINE_HEIGHT;
    const emojiOffset = XPMRenderer.DEFAULTS.ERROR_EMOJI_OFFSET;

    lines.forEach((line, index) => {
      const tspan = XPMRenderer.createSvgElement('tspan', {
        x: index === 0 ? 20 : 20 + emojiOffset,
        dy: index === 0 ? 0 : lineHeight
      });
      tspan.textContent = index === 0 ? `⚠️ ${line}` : line;
      text.appendChild(tspan);
    });

    svg.appendChild(text);
    return svg;
  }

  /* endregion ========================================================== */

  /* region Компоновка ================================================== */

  composeTiles(tiles) {
    if (tiles.some(tile => tile.config === undefined || tile.config === null)) {
      return {
        svg: this.createErrorSvg(
          'Синтаксическая ошибка:\nнеизвестный тэг.',
          XPMRenderer.DEFAULTS.ERROR_COMPACT_SIZE,
          XPMRenderer.DEFAULTS.ERROR_COMPACT_SIZE
        ),
        totalWidth: XPMRenderer.DEFAULTS.ERROR_COMPACT_SIZE,
        totalHeight: XPMRenderer.DEFAULTS.ERROR_COMPACT_SIZE
      };
    }

    this.createHiddenSVGContainer();
    const measured = tiles.map(tile => {
      const renderer = this.tileRenderers[tile.config.tileType || 'lines'];
      const m = renderer.measure(tile.config);
      return {
        ...m, gridX: tile.grid.x, gridY: tile.grid.y, config: tile.config
      };
    });

    const colMaxWidth = {};
    const rowMaxHeight = {};
    measured.forEach(t => {
      colMaxWidth[t.gridX] = Math.max(colMaxWidth[t.gridX] || 0, t.minWidth);
      rowMaxHeight[t.gridY] = Math.max(rowMaxHeight[t.gridY] || 0, t.minHeight);
    });

    const sortedCols = Object.keys(colMaxWidth).map(Number).sort((a, b) => a - b);
    const sortedRows = Object.keys(rowMaxHeight).map(Number).sort((a, b) => a - b);

    const offsetX = {};
    let cumX = 0;
    sortedCols.forEach(col => {
      offsetX[col] = cumX;
      cumX += colMaxWidth[col];
    });

    const offsetY = {};
    let cumY = 0;
    sortedRows.forEach(row => {
      offsetY[row] = cumY;
      cumY += rowMaxHeight[row];
    });

    const totalWidth = cumX;
    const totalHeight = cumY;

    const composedSvg = XPMRenderer.createSvgElement('svg', {
      width: totalWidth,
      height: totalHeight,
      viewBox: `0 0 ${totalWidth} ${totalHeight}`
    });
    composedSvg.appendChild(this.getMarkersDefs().cloneNode(true));

    tiles.forEach(tile => {
      const renderer = this.tileRenderers[tile.config.tileType || 'point'];
      const cellWidth = colMaxWidth[tile.grid.x];
      const cellHeight = rowMaxHeight[tile.grid.y];
      const {
        group, minWidth, minHeight
      } = renderer.render(tile.config, cellWidth, cellHeight);

      group.setAttribute('data-min-width', minWidth);
      group.setAttribute('data-min-height', minHeight);

      const wrapper = XPMRenderer.createSvgElement('g', {
        transform: `translate(${offsetX[tile.grid.x]}, ${offsetY[tile.grid.y]})`
      });
      wrapper.appendChild(group);
      composedSvg.appendChild(wrapper);
    });

    return {svg: composedSvg, totalWidth, totalHeight};
  };

  /* endregion ========================================================== */
}