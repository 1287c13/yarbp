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
    IMAGE_HEIGHT: 60,

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
          const src = config.src || XPMRenderer._createPinSVGDataURI(XPMRenderer.getColor());
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

  static _createPinSVGDataURI(color) {

    function _getSVGString(color, roleName = 'default') {
      switch (roleName) {
        case 'default': return `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="51" viewBox="0 0 30 51" fill="none"><path d="M20.541 19.251L29.042 26.75L27.7178 28.25L20.5254 21.9033L14.8613 50.6924L12.9043 50.7178L7.48535 26.3398L1.76074 36.9736L0 36.0254L7 23.0254L8.27344 20.6602L8.85645 23.2832L13.8203 45.623L18.8994 19.8076L19.2354 18.0977L20.541 19.251ZM12.3799 0C16.7982 0 20.3799 3.58172 20.3799 8C20.3799 12.4183 16.7982 16 12.3799 16C7.9616 16 4.37988 12.4183 4.37988 8C4.37988 3.58172 7.9616 0 12.3799 0ZM12.3799 2C9.06617 2 6.37988 4.68629 6.37988 8C6.37988 11.3137 9.06617 14 12.3799 14C15.6936 14 18.3799 11.3137 18.3799 8C18.3799 4.68629 15.6936 2 12.3799 2Z" fill="${color}"/></svg>`;
        case 'casual-man': return `<svg xmlns="http://www.w3.org/2000/svg"  width="720.000000pt" height="1280.000000pt" viewBox="0 0 720.000000 1280.000000"  preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none"> <path d="M3705 11819 c-434 -40 -763 -187 -1047 -468 -70 -69 -158 -155 -196 -191 -221 -210 -370 -570 -412 -999 -39 -398 30 -810 211 -1266 51 -128 217 -467 315 -640 37 -66 111 -199 164 -296 l96 -176 -8 -94 c-14 -157 -48 -502 -55 -541 -6 -43 4 -39 -178 -59 -259 -27 -580 -94 -738 -154 -149 -56 -219 -105 -276 -193 -40 -63 -56 -109 -87 -260 -33 -157 -51 -198 -152 -348 -143 -215 -182 -319 -182 -493 0 -84 6 -122 35 -226 5 -16 -11 -34 -70 -85 -168 -143 -328 -346 -404 -513 -190 -414 -257 -916 -281 -2088 -13 -638 3 -1641 36 -2234 5 -103 48 -345 78 -445 l13 -45 72 -3 c39 -2 71 -1 71 2 0 3 -20 87 -45 188 l-46 183 -14 325 c-47 1038 -42 2286 10 2950 15 182 59 535 71 563 9 20 107 94 175 131 115 63 269 83 394 51 79 -20 225 -93 300 -150 304 -230 569 -652 760 -1210 60 -175 76 -212 97 -224 23 -13 29 -13 52 3 15 9 30 24 33 33 14 36 -117 407 -229 645 -118 252 -231 436 -376 606 -243 286 -516 442 -775 442 -109 0 -299 -59 -365 -112 -23 -19 -23 -2 2 84 41 142 112 300 179 398 127 187 352 395 718 663 l93 69 61 -12 c114 -21 291 -74 550 -163 591 -203 884 -291 1225 -366 141 -32 412 -81 442 -81 25 0 58 36 58 63 0 46 -37 65 -166 87 -412 72 -753 164 -1279 345 -665 229 -875 280 -983 240 -60 -23 -88 -44 -102 -75 -6 -14 -34 -41 -63 -60 -28 -19 -75 -54 -104 -77 -29 -24 -57 -43 -62 -43 -16 0 -34 128 -27 190 13 114 62 223 175 389 88 130 122 211 161 385 52 235 89 280 288 347 189 64 523 131 728 145 l97 7 -6 -44 c-8 -61 -46 -221 -55 -236 -5 -7 -59 -19 -127 -28 -139 -18 -261 -49 -290 -73 -78 -64 -72 -143 16 -208 19 -14 126 -77 239 -141 494 -280 794 -463 1185 -728 72 -49 171 -116 220 -149 117 -79 278 -199 335 -249 84 -73 120 -69 174 22 18 31 52 87 76 125 68 111 159 300 192 400 43 131 43 209 1 299 -20 42 -52 87 -84 118 l-52 51 17 114 c18 122 23 144 36 144 16 0 184 -166 232 -230 27 -36 68 -102 91 -148 35 -72 41 -93 45 -165 5 -95 -12 -177 -58 -276 -41 -88 -88 -149 -206 -271 -55 -58 -104 -115 -108 -128 -12 -37 17 -72 59 -72 30 0 47 12 129 91 149 142 244 281 285 414 7 22 14 46 17 53 4 15 110 -53 239 -153 217 -169 401 -434 494 -712 58 -170 79 -310 136 -868 29 -283 74 -661 110 -935 14 -102 32 -239 40 -305 47 -360 411 -2555 441 -2657 4 -15 17 -18 70 -18 63 0 64 1 64 26 0 32 -21 157 -100 599 -57 318 -184 1079 -235 1410 -14 88 -34 219 -45 290 -28 177 -77 512 -89 610 -6 44 -19 150 -30 235 -12 85 -41 342 -65 570 -103 953 -122 1048 -272 1341 -144 280 -342 485 -663 685 l-65 40 -13 78 c-16 97 -46 173 -107 270 -54 87 -204 247 -305 326 -44 35 -70 62 -70 75 -1 25 57 367 63 373 3 2 44 -7 93 -20 74 -19 111 -23 238 -22 133 0 159 3 227 26 94 31 202 101 266 173 58 66 122 183 156 287 69 212 165 686 205 1013 7 50 16 124 21 165 21 164 40 436 46 650 11 402 -26 751 -118 1105 l-31 120 22 87 c46 184 53 418 17 553 -44 162 -135 277 -253 315 -37 13 -151 57 -253 98 -466 188 -538 214 -734 261 -326 80 -621 106 -901 80z m435 -149 c360 -38 674 -127 1095 -312 50 -22 148 -60 220 -84 71 -25 140 -55 153 -67 34 -31 72 -110 93 -192 19 -71 25 -273 10 -339 -6 -28 -7 -27 -30 30 -35 88 -89 181 -114 199 -32 23 -71 18 -139 -16 -84 -42 -224 -76 -349 -84 -134 -8 -335 11 -784 74 -494 71 -465 68 -502 37 -17 -15 -34 -39 -38 -54 -3 -15 1 -115 10 -222 8 -107 15 -232 15 -278 l0 -82 -175 -179 c-100 -102 -182 -194 -190 -215 -20 -48 -44 -257 -53 -465 l-7 -174 -40 59 c-89 131 -184 207 -303 244 -194 60 -411 -32 -510 -217 -71 -134 -80 -351 -22 -543 17 -57 11 -50 -35 48 -94 195 -180 475 -226 729 -26 151 -36 436 -20 592 32 303 119 565 253 764 51 75 355 379 454 452 206 155 488 260 784 294 106 12 338 12 450 1z m182 -945 c469 -67 599 -79 753 -72 135 7 281 40 363 81 l51 26 16 -23 c47 -72 161 -381 209 -567 143 -558 123 -1345 -59 -2295 -61 -317 -128 -531 -201 -641 -141 -212 -421 -261 -779 -138 -201 69 -479 194 -685 308 -47 26 -97 50 -112 53 -38 8 -78 -34 -78 -81 0 -31 6 -39 39 -61 82 -51 422 -217 561 -274 128 -51 145 -61 148 -83 3 -24 -53 -406 -84 -573 -33 -178 -94 -584 -94 -622 0 -51 20 -73 65 -73 48 0 63 28 83 152 9 57 17 105 20 108 7 9 42 -46 57 -91 16 -46 15 -48 -20 -156 -19 -60 -57 -152 -83 -205 -50 -98 -150 -268 -158 -268 -2 0 -55 38 -116 84 -298 221 -912 620 -1308 851 -102 59 -189 111 -193 115 -5 5 10 61 33 126 142 405 194 757 255 1709 l7 100 106 1 c86 0 116 4 154 21 80 36 102 105 46 146 l-28 21 -53 -22 c-211 -88 -465 70 -582 362 -83 205 -86 394 -9 536 69 127 237 175 377 106 69 -33 118 -81 181 -174 27 -40 61 -81 75 -91 70 -50 166 -45 200 10 15 25 19 64 25 252 9 288 25 414 55 453 12 16 90 99 172 185 203 212 199 205 199 301 0 72 -15 335 -24 421 -3 31 -1 37 14 37 11 0 191 -25 402 -55z m-1679 -2252 c45 -61 149 -155 194 -176 22 -10 23 -15 22 -101 0 -50 -3 -99 -7 -108 -5 -12 -33 30 -97 145 -95 173 -171 315 -162 307 3 -3 25 -33 50 -67z m-13 -1957 c0 -15 -46 -146 -54 -154 -3 -2 -201 102 -215 114 -8 7 52 24 127 37 117 20 142 20 142 3z"/> <path d="M5678 4175 c-9 -19 -9 -64 1 -183 43 -564 71 -1065 96 -1717 33 -842 44 -1059 70 -1425 21 -278 64 -778 71 -818 l6 -32 66 0 65 0 -7 73 c-62 652 -105 1310 -131 2007 -32 872 -55 1290 -101 1795 -28 311 -32 325 -89 325 -28 0 -38 -5 -47 -25z"/> <path d="M2427 2690 c-24 -19 -25 -24 -31 -182 -33 -832 -61 -1308 -100 -1720 -16 -168 -21 -260 -15 -286 4 -21 33 -110 63 -198 29 -87 64 -192 77 -232 l23 -72 68 0 68 0 -6 27 c-4 16 -43 136 -86 268 -90 272 -87 238 -54 540 33 305 71 1010 83 1551 l6 291 -24 16 c-30 22 -41 21 -72 -3z"/> </g> </svg> `;
        case 'casual-woman': return `<svg xmlns="http://www.w3.org/2000/svg"  width="720.000000pt" height="1280.000000pt" viewBox="0 0 720.000000 1280.000000"  preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none"> <path d="M3705 11744 c-241 -34 -370 -65 -527 -130 -148 -60 -197 -86 -318 -167 -145 -97 -229 -167 -349 -292 -398 -418 -596 -908 -706 -1745 -22 -162 -61 -385 -85 -480 -33 -131 -109 -339 -182 -500 -138 -306 -181 -441 -200 -630 -10 -99 -9 -129 6 -215 29 -177 120 -326 269 -442 71 -56 206 -137 287 -173 85 -37 84 -43 -10 -36 -102 8 -380 -8 -504 -30 -236 -41 -385 -126 -461 -266 -61 -112 -89 -343 -65 -533 6 -54 16 -109 21 -122 7 -20 -1 -38 -55 -116 -126 -183 -166 -297 -166 -477 0 -157 41 -299 119 -415 l30 -44 -54 -108 c-157 -317 -222 -558 -334 -1228 -81 -488 -161 -1097 -211 -1620 -11 -115 -22 -232 -25 -260 -35 -334 -55 -936 -36 -1074 20 -154 98 -418 173 -593 l20 -48 74 0 c41 0 74 4 74 9 0 5 -15 45 -34 88 -63 148 -126 345 -156 492 -54 255 -5 1012 140 2176 17 132 35 267 40 300 5 33 26 166 45 295 93 608 180 995 271 1213 184 439 400 693 837 986 325 218 496 249 902 164 378 -78 926 -281 1323 -489 67 -35 134 -64 147 -64 58 0 86 77 42 117 -46 43 -481 247 -738 347 -166 64 -398 141 -552 181 -371 97 -596 115 -795 64 -295 -77 -785 -440 -1028 -762 l-43 -58 -30 59 c-42 83 -61 166 -61 267 0 181 53 298 237 524 51 62 96 124 99 138 16 63 -44 103 -98 63 -16 -12 -32 -20 -34 -17 -3 2 -7 49 -11 103 -7 116 9 252 39 332 56 148 202 223 501 253 152 15 622 7 812 -15 136 -15 397 -53 423 -61 17 -6 -4 -47 -55 -105 l-40 -44 -103 33 c-264 85 -545 139 -817 157 -115 7 -153 -2 -171 -42 -14 -29 -1 -68 25 -82 10 -5 74 -12 143 -16 571 -31 1242 -276 1790 -654 275 -190 607 -491 799 -724 62 -76 76 -88 103 -88 17 0 40 8 50 17 19 17 97 245 142 415 55 208 55 378 0 426 -48 41 -94 9 -95 -67 -1 -71 -17 -19 -24 81 -6 72 9 315 20 326 6 6 124 -76 206 -145 243 -200 328 -358 286 -529 -24 -95 -65 -158 -184 -284 -84 -88 -103 -114 -103 -138 0 -40 43 -76 80 -67 29 6 213 192 250 253 14 23 27 42 30 42 3 0 59 -42 125 -92 137 -107 287 -252 362 -353 61 -82 141 -231 176 -331 61 -172 142 -619 217 -1199 23 -176 59 -448 81 -605 22 -157 53 -384 70 -505 92 -683 96 -701 221 -1070 79 -234 81 -243 86 -355 3 -77 -1 -150 -12 -223 -9 -59 -16 -124 -16 -145 0 -20 28 -118 62 -217 33 -99 73 -223 87 -275 l26 -95 73 -3 73 -3 -7 28 c-19 87 -53 199 -111 373 -71 210 -69 196 -43 360 5 36 10 112 10 170 0 129 -17 205 -106 464 -98 288 -109 337 -154 656 -22 162 -58 419 -80 570 -21 151 -57 415 -80 585 -168 1274 -223 1529 -387 1794 -70 114 -129 184 -259 311 -101 97 -280 245 -338 277 -15 8 -15 16 -5 63 28 130 -10 281 -104 412 -75 105 -273 281 -435 386 l-72 47 6 40 c10 65 43 203 72 302 20 68 31 93 43 93 9 0 61 -9 115 -21 156 -33 282 -36 384 -10 130 32 203 73 290 160 115 117 193 278 274 571 127 455 196 965 196 1441 0 249 -7 357 -36 572 l-16 117 30 94 c50 150 65 258 59 426 -8 222 -66 408 -188 612 -194 323 -571 585 -934 649 -33 5 -94 28 -136 49 -105 54 -261 105 -404 131 -96 17 -166 22 -350 24 -126 2 -243 1 -260 -1z m572 -158 c139 -24 257 -62 369 -117 56 -27 128 -54 160 -60 145 -26 299 -84 426 -160 281 -171 498 -451 574 -746 29 -109 44 -350 27 -413 l-10 -35 -21 65 c-111 348 -306 635 -562 824 -126 94 -301 176 -374 176 -42 0 -57 -17 -91 -110 -69 -186 -218 -443 -382 -659 -147 -193 -412 -433 -636 -575 -134 -85 -394 -196 -459 -196 -26 0 -68 -44 -68 -71 0 -63 65 -74 199 -36 44 13 81 20 81 14 0 -31 -131 -277 -148 -277 -5 0 -29 29 -55 64 -167 227 -397 304 -603 202 -120 -60 -202 -168 -240 -316 -23 -90 -15 -277 16 -375 25 -79 88 -208 133 -275 79 -116 244 -253 337 -281 43 -13 42 -8 61 -179 17 -156 6 -560 -20 -723 -33 -202 -100 -450 -129 -479 -20 -20 -428 73 -628 143 -562 197 -758 384 -758 724 1 176 41 326 159 585 189 415 235 582 315 1140 96 668 222 1036 482 1402 288 406 734 686 1186 747 42 6 91 13 107 15 71 10 464 -3 552 -18z m748 -670 c315 -162 565 -521 680 -976 32 -127 72 -369 86 -531 17 -200 6 -692 -20 -899 -89 -685 -226 -1161 -384 -1336 -91 -100 -220 -154 -369 -154 -140 0 -422 76 -661 179 -98 42 -374 187 -432 227 -78 55 -159 -47 -86 -109 70 -58 430 -242 604 -307 48 -18 87 -35 87 -39 0 -3 -7 -28 -16 -56 -108 -355 -164 -757 -134 -966 14 -94 54 -215 91 -273 29 -47 30 -52 19 -90 -24 -86 -63 -211 -67 -218 -2 -4 -86 75 -186 176 -284 286 -548 494 -867 684 -154 92 -504 262 -539 262 -18 0 -14 8 43 88 133 190 215 434 262 782 19 137 25 570 11 736 l-8 91 58 7 c118 14 171 62 139 125 -20 38 -46 43 -122 23 -120 -31 -253 13 -373 125 -108 99 -181 218 -227 368 -28 90 -26 271 4 345 29 72 87 139 148 170 40 20 63 25 124 24 126 -1 204 -50 317 -203 88 -118 101 -131 144 -131 44 0 74 22 134 100 61 80 113 182 164 329 24 66 48 121 54 121 15 0 136 73 247 149 208 143 478 407 600 587 181 266 308 491 341 602 15 50 15 50 134 -12z"/> <path d="M5519 4386 c-51 -25 -49 -48 34 -299 183 -557 260 -839 289 -1062 8 -61 12 -357 14 -920 1 -456 6 -870 11 -920 6 -49 7 -93 4 -97 -10 -11 -175 -43 -367 -72 -318 -48 -1187 -151 -1486 -177 -124 -11 -140 -14 -169 -38 -30 -25 -32 -34 -51 -151 -28 -184 -84 -426 -123 -535 -19 -53 -35 -100 -35 -105 0 -6 33 -10 73 -10 l73 0 22 67 c32 99 49 158 71 248 22 88 61 314 61 351 0 27 -17 24 305 54 368 35 1055 123 1420 181 105 16 199 31 209 32 17 2 21 -9 33 -78 39 -246 63 -437 73 -575 6 -85 13 -183 16 -218 l6 -62 69 0 70 0 -6 98 c-16 246 -38 452 -74 690 -65 422 -65 410 -66 1302 -1 448 -5 853 -9 900 -15 165 -72 414 -162 710 -51 165 -213 653 -222 667 -14 22 -57 32 -83 19z"/> <path d="M2520 3190 c-11 -11 -20 -29 -20 -40 0 -11 -13 -172 -30 -358 -16 -185 -37 -413 -45 -507 -19 -209 -41 -525 -55 -790 -28 -500 -27 -490 -49 -541 -12 -27 -36 -64 -54 -82 -66 -69 -326 -188 -612 -282 -169 -55 -204 -90 -154 -154 12 -16 30 -26 45 -26 46 0 414 133 574 207 l55 25 81 -84 c127 -132 169 -194 184 -275 17 -92 41 -136 118 -216 l65 -67 84 0 c45 0 83 3 83 6 0 13 -49 74 -120 149 -74 78 -77 82 -94 160 -9 44 -29 100 -43 125 -33 57 -117 160 -182 224 l-50 49 44 39 c55 49 101 118 121 183 10 34 23 187 39 490 25 433 37 602 95 1245 46 519 44 487 26 515 -21 32 -77 34 -106 5z"/> </g> </svg>`;
        case 'chef': return `<svg xmlns="http://www.w3.org/2000/svg"  width="720.000000pt" height="1280.000000pt" viewBox="0 0 720.000000 1280.000000"  preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none"> <path d="M4785 11959 c-38 -4 -131 -21 -206 -38 -169 -38 -251 -39 -454 -6 -290 48 -458 44 -704 -16 -208 -51 -366 -118 -526 -224 -140 -93 -243 -192 -422 -405 -88 -105 -182 -195 -338 -324 -164 -136 -370 -345 -429 -435 -96 -147 -136 -266 -136 -407 0 -231 97 -365 395 -545 50 -30 93 -58 96 -62 3 -5 12 -34 19 -65 14 -68 66 -248 122 -426 34 -111 45 -135 79 -168 21 -21 39 -44 39 -49 0 -17 85 -210 145 -329 75 -149 323 -599 352 -638 25 -33 25 -37 19 -135 -4 -56 -14 -158 -22 -227 -8 -69 -19 -165 -24 -214 -6 -50 -12 -90 -13 -91 -1 0 -47 -18 -101 -38 -118 -44 -162 -75 -186 -131 -9 -23 -54 -159 -99 -301 -45 -143 -87 -275 -92 -293 -9 -26 -37 -52 -127 -119 -65 -48 -249 -186 -410 -307 -162 -122 -322 -241 -356 -266 -143 -104 -357 -270 -436 -339 -276 -239 -453 -545 -539 -936 -72 -328 -98 -607 -176 -1883 -16 -255 -40 -977 -52 -1547 -5 -269 -4 -324 11 -415 23 -137 56 -273 107 -442 l42 -138 73 0 c41 0 74 4 74 9 0 5 -12 39 -26 77 -27 73 -93 319 -119 449 -29 140 -33 231 -24 504 5 146 15 491 24 766 13 458 63 1350 100 1805 57 699 129 1005 307 1307 54 92 71 105 198 144 107 33 282 34 390 0 450 -138 837 -618 1050 -1301 77 -249 71 -235 107 -238 24 -2 35 2 47 21 15 21 13 32 -15 143 -97 376 -289 765 -509 1029 -137 165 -332 321 -495 396 -150 70 -350 103 -484 80 -36 -6 -67 -9 -69 -6 -6 6 105 107 188 170 41 32 208 157 370 279 162 122 396 299 520 392 124 93 239 180 257 192 l32 23 70 -53 c104 -80 361 -230 586 -343 467 -236 852 -369 1184 -411 49 -6 53 -8 36 -20 -38 -28 -297 -127 -705 -269 -192 -67 -353 -129 -401 -156 -57 -32 -97 -91 -108 -158 -10 -61 -3 -102 83 -486 82 -373 93 -421 142 -655 192 -915 380 -1900 428 -2240 14 -96 32 -258 41 -360 27 -317 91 -991 101 -1052 l6 -38 54 0 c30 0 54 3 54 6 0 7 -104 1112 -120 1279 -15 157 -27 235 -66 455 -60 334 -135 728 -259 1355 -58 294 -188 901 -316 1480 -45 201 -48 255 -17 292 20 25 109 62 363 153 127 45 258 93 292 106 34 13 65 24 68 24 10 0 183 65 285 107 118 49 292 137 370 187 185 120 301 287 288 416 -2 25 1 40 7 40 15 0 312 -179 395 -238 176 -125 292 -240 406 -406 199 -288 287 -562 339 -1061 9 -82 40 -388 70 -680 30 -291 62 -588 70 -660 8 -71 26 -238 40 -370 14 -132 46 -422 70 -645 24 -223 51 -484 60 -582 8 -97 20 -189 26 -204 33 -88 101 -349 118 -456 26 -156 91 -582 91 -591 0 -4 32 -7 71 -7 l70 0 -6 48 c-13 90 -86 547 -101 632 -20 110 -46 212 -88 347 -22 70 -36 139 -40 198 -4 50 -11 128 -16 175 -5 47 -14 130 -20 185 -59 569 -97 921 -140 1320 -35 317 -42 389 -76 715 -100 982 -132 1156 -269 1446 -97 205 -258 425 -416 567 -80 72 -307 227 -504 342 -82 48 -153 91 -157 94 -4 3 -12 58 -18 121 -6 63 -15 129 -20 145 -6 17 -42 62 -81 100 -70 70 -70 70 -65 115 10 76 64 381 69 386 3 3 31 -2 63 -10 359 -91 669 12 824 273 81 136 151 374 219 741 91 495 131 885 131 1279 0 263 -9 401 -42 634 -17 126 -19 162 -10 178 32 51 -6 237 -104 515 -87 246 -83 211 -43 381 29 127 34 165 33 268 0 104 -4 130 -27 194 -52 145 -134 235 -318 349 -291 182 -463 241 -644 221z m251 -165 c38 -15 118 -54 178 -88 352 -194 435 -300 424 -539 -6 -111 -44 -287 -62 -287 -6 0 -43 13 -81 29 -264 111 -646 156 -995 117 -644 -72 -1334 -344 -1857 -732 -230 -170 -415 -355 -523 -522 -36 -55 -68 -101 -72 -101 -4 -1 -47 26 -97 59 -207 139 -276 273 -237 460 42 199 181 378 511 655 171 143 275 244 380 370 170 205 305 321 480 413 171 90 341 145 534 173 116 16 347 6 486 -22 140 -28 345 -31 450 -5 39 9 106 25 150 36 113 28 237 22 331 -16z m-38 -875 c183 -20 382 -74 512 -139 55 -28 56 -29 93 -122 46 -116 147 -421 147 -443 0 -14 -3 -14 -32 1 -168 87 -516 142 -808 129 -709 -32 -1440 -298 -2014 -731 -92 -69 -83 -64 -166 -102 -88 -42 -142 -90 -206 -186 -29 -45 -82 -116 -118 -158 -35 -43 -67 -83 -69 -90 -10 -25 -23 11 -86 240 -35 125 -69 246 -76 269 -13 40 -12 44 22 100 55 93 110 160 228 278 304 304 821 609 1313 775 259 87 574 159 784 179 125 12 366 12 476 0z m321 -729 c120 -18 256 -56 328 -92 75 -37 72 -30 99 -183 34 -191 45 -330 51 -610 7 -351 -9 -564 -73 -995 -101 -679 -197 -1003 -336 -1136 -105 -100 -231 -140 -415 -132 -162 8 -300 49 -618 187 -125 55 -365 177 -425 218 -44 30 -75 29 -105 -2 -33 -33 -32 -70 4 -103 38 -37 414 -226 586 -297 77 -32 141 -58 142 -59 2 -2 -14 -102 -87 -561 -56 -354 -76 -465 -89 -499 l-11 -28 -36 71 c-42 84 -116 168 -196 222 -32 22 -152 83 -266 135 -409 188 -904 440 -977 498 l-26 21 15 65 c41 178 89 611 111 1007 8 150 15 277 15 283 0 6 30 7 78 3 108 -8 187 10 229 52 37 37 43 77 16 107 -21 24 -51 23 -128 -4 -57 -20 -70 -21 -129 -11 -93 16 -171 57 -247 133 -149 147 -249 431 -220 625 12 84 53 175 98 217 41 39 119 71 178 71 121 1 209 -59 325 -223 47 -66 80 -102 103 -114 77 -36 165 -8 194 61 8 21 21 103 28 183 27 289 64 429 153 563 51 77 59 83 231 144 296 105 603 173 886 197 87 7 437 -3 514 -14z m-2577 -3226 c-5 -26 -7 -27 -33 -13 -22 11 -22 12 -4 25 24 18 41 12 37 -12z m-105 -118 c59 -50 265 -178 426 -265 199 -109 422 -217 722 -353 234 -105 332 -163 384 -228 73 -91 123 -246 125 -389 l1 -76 -35 3 c-284 24 -661 148 -1120 369 -266 128 -692 381 -707 419 -3 9 11 70 31 137 93 303 127 407 136 407 4 0 21 -11 37 -24z m1989 -533 c20 -27 17 -44 -16 -83 -33 -40 -37 -31 -19 50 12 55 15 58 35 33z m55 -195 c0 -7 2 -22 4 -33 1 -11 6 -85 9 -164 6 -140 6 -145 -18 -186 -25 -42 -138 -155 -176 -175 -25 -13 -25 -6 -6 150 24 195 42 244 124 358 45 61 61 74 63 50z"/> <path d="M5810 3890 c-10 -19 -7 -126 20 -695 35 -732 54 -1508 65 -2560 3 -314 8 -585 11 -603 l5 -32 65 0 66 0 -6 272 c-3 150 -8 498 -11 773 -10 890 -33 1555 -80 2320 -30 475 -33 512 -52 531 -21 21 -70 18 -83 -6z"/> <path d="M2546 3161 c-14 -15 -25 -75 -47 -258 -16 -131 -77 -618 -134 -1083 -58 -465 -112 -901 -120 -970 -8 -69 -18 -144 -21 -166 -5 -43 -2 -52 71 -229 21 -49 66 -171 100 -270 l63 -180 71 -3 c39 -2 71 1 71 5 0 32 -142 423 -200 552 l-42 94 21 171 c12 94 33 257 46 361 14 105 39 303 55 440 50 414 79 650 104 850 77 604 81 671 42 697 -21 14 -63 8 -80 -11z"/> </g> </svg> `;
        case 'clean-production': return `<svg xmlns="http://www.w3.org/2000/svg"  width="720.000000pt" height="1280.000000pt" viewBox="0 0 720.000000 1280.000000"  preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none"> <path d="M3995 11825 c-132 -7 -276 -18 -320 -24 -158 -22 -332 -80 -480 -160 -77 -41 -296 -184 -390 -255 -33 -24 -118 -84 -188 -133 -309 -211 -446 -450 -531 -923 -65 -363 -59 -618 24 -956 41 -169 131 -389 187 -455 7 -9 35 -81 62 -160 93 -277 170 -438 362 -764 l112 -189 -7 -91 c-7 -95 -55 -522 -61 -541 -2 -6 -34 -21 -72 -32 -81 -25 -129 -55 -160 -100 -25 -38 -59 -143 -134 -417 l-52 -190 -254 -190 c-543 -405 -905 -713 -1081 -919 -320 -373 -453 -784 -607 -1881 -8 -60 -31 -245 -50 -410 -48 -416 -54 -471 -70 -630 -8 -77 -23 -228 -34 -335 -47 -461 -54 -561 -48 -755 5 -157 10 -209 31 -300 29 -120 127 -412 262 -777 l87 -238 85 0 c76 0 83 2 77 18 -4 9 -24 64 -45 122 -20 58 -84 231 -140 385 -232 633 -238 688 -162 1450 23 231 49 490 57 575 9 85 20 189 25 230 6 41 19 156 30 255 85 738 178 1264 279 1573 111 338 238 538 501 788 159 151 489 422 790 649 73 55 178 135 233 178 56 42 105 77 110 77 5 0 48 -29 96 -64 439 -324 952 -598 1396 -746 l140 -47 36 -124 c20 -68 84 -269 143 -446 120 -362 151 -466 202 -662 116 -446 176 -842 233 -1541 11 -124 62 -950 101 -1610 11 -190 29 -491 40 -670 11 -179 20 -340 20 -357 l0 -33 65 0 65 0 0 63 c0 34 -5 127 -10 207 -5 80 -16 273 -25 430 -24 430 -83 1397 -105 1730 -77 1130 -175 1664 -465 2520 -130 383 -165 533 -165 699 0 124 15 187 63 257 38 57 85 83 206 114 116 30 222 74 302 126 l67 42 -4 -36 c-20 -197 -27 -256 -39 -310 -12 -60 -18 -68 -103 -155 -166 -170 -166 -171 -22 -653 248 -826 349 -1337 410 -2064 10 -123 69 -1103 90 -1495 14 -258 78 -1308 86 -1402 l6 -73 63 0 63 0 -4 58 c-3 31 -18 282 -34 557 -17 275 -48 804 -70 1175 -22 371 -45 752 -50 845 -53 902 -156 1497 -400 2315 -136 455 -148 505 -129 542 6 13 51 64 99 114 95 98 116 130 126 192 11 71 15 71 105 -8 387 -340 537 -499 650 -689 164 -276 221 -565 374 -1906 53 -469 126 -1035 154 -1205 16 -96 59 -312 94 -480 89 -416 107 -530 228 -1423 l12 -87 74 0 73 0 0 39 c0 47 -64 506 -125 901 -46 296 -69 419 -129 680 -62 276 -90 449 -151 940 -53 425 -62 504 -90 755 -101 935 -158 1294 -251 1571 -114 339 -282 554 -739 949 -110 95 -208 182 -218 193 -17 18 -19 38 -18 177 2 144 0 160 -21 202 -25 50 -101 133 -211 229 l-68 59 18 123 c14 101 20 121 33 116 38 -15 193 -43 270 -49 139 -11 294 26 406 96 104 66 205 189 260 318 66 153 163 583 218 961 58 394 80 694 80 1055 -1 292 -6 367 -40 622 -16 119 -16 124 2 165 37 82 15 281 -56 501 -62 192 -111 281 -234 417 -42 47 -119 148 -170 225 -138 207 -329 386 -530 498 -152 85 -179 91 -446 93 -129 1 -343 -4 -475 -11z m741 -153 c192 -67 474 -304 589 -495 47 -79 99 -149 164 -222 132 -148 180 -235 240 -437 42 -141 52 -195 36 -191 -6 2 -47 16 -92 33 -183 66 -426 95 -730 87 -300 -7 -573 -58 -913 -167 -320 -103 -632 -260 -977 -491 -99 -66 -149 -104 -256 -190 -21 -17 -66 -45 -99 -62 -67 -33 -123 -84 -165 -149 -15 -24 -48 -68 -73 -98 -26 -30 -64 -79 -85 -108 -28 -39 -40 -50 -46 -40 -20 30 -80 235 -103 350 -65 321 -55 613 35 978 83 336 192 507 427 664 70 47 170 116 222 155 210 155 424 277 568 325 117 39 213 55 414 66 258 15 296 16 543 18 218 2 221 1 301 -26z m586 -1378 c169 -21 364 -74 382 -103 4 -5 17 -63 30 -128 109 -536 89 -1223 -60 -2038 -68 -374 -125 -587 -190 -717 -115 -228 -354 -319 -654 -248 -210 50 -656 240 -881 376 -67 40 -101 43 -134 9 -35 -34 -33 -76 5 -108 64 -54 471 -254 668 -329 59 -22 60 -24 42 -132 -5 -34 -21 -146 -35 -251 -14 -104 -35 -251 -46 -326 l-21 -136 -54 -12 c-30 -7 -80 -25 -111 -41 -43 -22 -59 -26 -65 -17 -5 7 -16 24 -25 39 -35 57 -108 105 -339 223 -282 144 -475 257 -751 442 -175 116 -202 138 -198 157 38 166 125 1000 125 1206 l0 56 93 -1 c115 0 158 9 197 41 37 32 42 90 10 119 -20 18 -47 18 -148 -6 -144 -33 -338 83 -446 266 -70 121 -108 245 -114 381 -5 123 8 190 56 277 49 92 168 147 272 127 103 -20 170 -72 265 -206 82 -116 111 -137 178 -131 84 7 121 64 137 214 40 368 62 435 209 629 109 145 111 147 361 225 228 72 433 119 620 144 139 19 473 18 622 -1z m-1838 -474 c-67 -138 -84 -214 -110 -497 -3 -40 -10 -73 -14 -73 -4 0 -27 29 -50 65 -72 110 -236 245 -299 245 -11 0 -21 4 -21 9 0 19 494 335 531 340 4 1 -13 -39 -37 -89z m-1009 -955 c13 -52 -4 -21 -28 51 -19 56 -22 75 -14 99 10 28 12 25 23 -45 6 -41 15 -88 19 -105z m215 -449 c25 -27 74 -71 109 -97 l65 -47 -3 -64 c-1 -34 -4 -82 -8 -106 l-5 -43 -80 138 c-82 140 -168 306 -168 320 0 5 11 -5 23 -22 12 -16 42 -52 67 -79z m265 -1717 c352 -236 543 -348 854 -502 201 -99 204 -102 248 -161 30 -41 43 -67 39 -81 -3 -11 -17 -58 -31 -105 -19 -62 -26 -107 -26 -167 0 -65 -3 -83 -14 -83 -29 0 -235 75 -390 142 -281 121 -548 270 -845 468 -110 74 -260 180 -283 200 -4 4 1 40 11 81 27 102 90 324 109 382 l15 48 41 -34 c23 -19 146 -103 272 -188z m1766 -258 l71 -68 -17 -27 c-19 -28 -90 -83 -142 -110 -32 -16 -33 -16 -33 5 0 49 34 269 41 269 5 0 40 -31 80 -69z"/> <path d="M1543 5375 c-27 -19 -31 -66 -7 -90 9 -8 35 -25 58 -37 172 -87 356 -266 490 -476 153 -240 283 -599 331 -917 23 -151 23 -152 41 -170 23 -23 63 -15 87 16 18 25 19 33 8 115 -72 538 -281 1010 -582 1314 -80 82 -161 144 -264 203 -95 55 -131 64 -162 42z"/> <path d="M5640 4323 c-18 -23 -21 -36 -16 -78 39 -339 66 -782 66 -1089 0 -234 -7 -430 -40 -1131 -21 -454 -15 -625 55 -1542 19 -254 35 -467 35 -473 0 -6 30 -10 75 -10 73 0 75 1 75 24 0 14 -16 226 -35 473 -62 804 -67 885 -67 1098 0 116 5 316 11 445 6 129 16 352 22 495 24 551 15 1024 -27 1480 -24 258 -29 287 -59 313 -35 30 -69 28 -95 -5z"/> <path d="M2433 3328 c-24 -27 -53 -221 -223 -1503 -5 -38 -16 -119 -25 -179 -25 -177 -22 -202 42 -397 l56 -174 7 -190 c9 -217 13 -240 85 -425 29 -74 80 -207 114 -294 33 -88 63 -161 65 -163 2 -2 37 -3 79 -1 l75 3 -33 95 c-18 52 -63 172 -100 265 -130 328 -127 315 -135 530 -5 132 -13 207 -25 245 -9 30 -34 110 -56 177 -23 73 -39 142 -39 170 0 26 11 127 25 223 14 96 29 209 35 250 5 41 17 122 25 180 13 92 64 482 125 945 11 83 20 166 20 186 0 68 -74 104 -117 57z"/> </g> </svg>`;
        case 'glasses-man': return `<svg xmlns="http://www.w3.org/2000/svg"  width="720.000000pt" height="1280.000000pt" viewBox="0 0 720.000000 1280.000000"  preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none"> <path d="M3650 11819 c-392 -45 -729 -198 -962 -436 -51 -53 -113 -114 -137 -137 -130 -120 -204 -199 -244 -262 -256 -395 -333 -963 -212 -1551 75 -362 193 -647 506 -1224 70 -130 151 -276 179 -324 l52 -87 -7 -81 c-13 -156 -55 -572 -60 -584 -2 -8 -21 -13 -44 -13 -71 0 -80 -15 -211 -359 -66 -173 -120 -321 -121 -330 0 -9 -55 -59 -122 -111 -185 -144 -526 -424 -617 -505 -25 -22 -90 -78 -145 -125 -227 -195 -455 -402 -536 -488 -158 -166 -262 -346 -345 -597 -68 -208 -100 -398 -139 -825 -20 -227 -25 -563 -25 -1880 0 -1436 0 -1478 19 -1572 22 -105 56 -243 72 -295 l11 -33 78 0 78 0 -43 163 c-23 89 -48 201 -55 247 -9 65 -11 443 -7 1630 4 1597 5 1644 47 1986 66 547 205 874 482 1140 104 100 580 517 792 694 170 142 521 420 527 417 11 -4 596 -565 889 -852 554 -544 533 -525 573 -525 71 0 74 5 180 266 126 310 205 500 237 569 l33 70 18 -42 c19 -41 91 -320 125 -483 22 -105 55 -146 107 -136 45 8 58 28 112 166 27 66 51 119 55 118 5 -2 73 -76 153 -164 80 -89 153 -164 162 -168 9 -3 29 -6 45 -6 33 0 70 40 70 76 0 14 -30 144 -66 289 -37 146 -64 268 -61 271 11 11 206 -153 332 -280 230 -231 351 -445 435 -770 53 -202 83 -430 205 -1516 33 -297 46 -430 130 -1300 54 -552 76 -717 165 -1190 38 -201 81 -434 96 -517 l28 -153 74 0 74 0 -7 58 c-7 60 -26 164 -124 682 -86 455 -109 617 -136 925 -9 99 -27 293 -41 430 -13 138 -33 342 -45 455 -11 113 -26 264 -34 335 -8 72 -22 198 -30 280 -25 238 -93 822 -120 1030 -56 423 -94 586 -194 824 -92 220 -269 458 -466 628 -96 83 -300 246 -371 296 -46 33 -53 43 -69 102 -37 139 -190 396 -313 528 l-26 27 12 88 c16 119 33 237 35 239 1 1 38 -8 82 -19 109 -28 340 -31 435 -5 117 31 218 88 291 164 133 138 187 273 279 701 62 287 90 462 130 820 10 95 22 177 25 182 3 6 13 10 21 10 26 0 113 49 156 88 77 69 137 244 159 469 14 142 9 225 -17 260 -29 40 -127 89 -230 116 -85 23 -89 25 -91 53 -13 155 -64 432 -107 578 l-23 79 23 86 c31 122 48 279 41 391 -12 186 -62 314 -160 414 -57 58 -68 64 -136 80 -41 10 -155 52 -255 93 -537 223 -765 287 -1178 332 -112 13 -389 12 -498 0z m631 -168 c338 -54 527 -112 944 -288 110 -46 233 -93 275 -105 94 -25 110 -35 148 -95 55 -87 77 -180 77 -328 0 -71 -3 -138 -7 -148 -6 -14 -21 8 -64 93 -31 61 -68 119 -82 130 -29 24 -69 26 -98 6 -42 -29 -176 -76 -261 -91 -181 -32 -354 -21 -898 55 -159 22 -329 45 -377 52 -78 10 -92 10 -123 -5 -63 -30 -67 -55 -50 -279 8 -106 15 -230 15 -274 l0 -82 -72 -78 c-40 -44 -118 -126 -174 -184 -56 -58 -109 -119 -117 -137 -17 -32 -37 -171 -37 -255 0 -45 -1 -47 -32 -53 -18 -3 -88 -14 -155 -25 l-122 -20 -63 21 c-191 65 -420 -40 -513 -236 -47 -97 -59 -171 -52 -312 4 -65 9 -134 12 -153 5 -29 0 -23 -26 30 -89 187 -178 485 -215 725 -26 164 -26 545 0 685 63 347 195 626 362 766 33 27 106 98 163 157 240 249 504 380 886 442 130 21 488 14 656 -14z m-64 -911 c548 -79 588 -84 778 -84 201 0 303 17 434 72 l69 29 41 -83 c110 -224 195 -502 236 -773 8 -56 15 -116 15 -135 l0 -33 -60 -6 c-86 -9 -206 -52 -263 -94 -34 -25 -57 -52 -73 -87 l-23 -50 -85 -2 -85 -2 -6 28 c-10 44 -57 103 -111 138 -100 67 -343 122 -534 122 -111 0 -286 -25 -355 -50 -27 -10 -70 -25 -95 -33 -41 -14 -493 -78 -549 -77 -23 0 -24 2 -17 53 3 28 6 71 6 94 0 37 7 51 57 110 32 38 73 84 93 103 107 106 215 229 228 260 15 36 13 182 -4 443 -6 87 -5 97 10 97 9 0 141 -18 293 -40z m513 -1115 c197 -32 299 -77 327 -143 45 -108 -44 -435 -141 -518 -109 -93 -389 -110 -587 -35 -75 28 -124 78 -144 144 -43 138 -61 430 -30 473 51 74 350 115 575 79z m1200 -35 c97 -14 169 -38 197 -66 24 -24 25 -28 18 -122 -15 -209 -62 -381 -118 -428 -62 -53 -113 -68 -224 -69 -97 0 -103 1 -144 30 -52 37 -81 84 -113 185 -48 151 -56 302 -21 369 23 45 109 83 230 101 72 11 102 11 175 0z m-1940 -132 c0 -13 5 -75 11 -138 19 -208 62 -359 120 -420 104 -110 296 -167 533 -157 243 10 361 72 449 238 36 67 81 202 93 277 10 61 31 83 84 88 25 3 51 1 58 -4 8 -5 22 -53 33 -107 53 -274 134 -404 283 -453 37 -12 80 -22 96 -22 29 0 30 -2 30 -43 0 -117 -56 -503 -116 -807 -41 -203 -103 -452 -132 -527 -57 -148 -131 -237 -246 -293 -67 -33 -189 -60 -271 -60 -86 0 -260 38 -391 86 -226 82 -378 152 -646 301 -75 41 -103 52 -123 47 -46 -11 -69 -69 -45 -113 20 -38 397 -235 614 -321 67 -27 122 -54 124 -62 3 -16 -136 -978 -143 -986 -1 -2 -42 20 -91 49 -49 28 -127 73 -174 99 -405 231 -964 607 -1213 816 l-28 24 20 157 c32 240 58 550 72 837 l12 258 56 -5 c70 -7 178 6 223 27 45 21 72 67 63 107 -10 42 -44 57 -98 40 -122 -36 -204 -32 -306 16 -83 40 -197 158 -248 258 -76 151 -109 287 -101 426 18 313 299 438 519 232 28 -26 77 -84 109 -128 32 -45 70 -87 85 -93 14 -7 50 -12 79 -12 45 0 56 4 81 30 27 28 29 37 39 157 l11 127 40 8 c29 6 351 56 428 67 4 1 7 -9 7 -21z m-630 -128 c0 -33 -3 -60 -7 -60 -7 1 -73 84 -81 101 -3 8 26 15 66 18 20 1 22 -3 22 -59z m-637 -956 c28 -25 68 -56 89 -67 l38 -22 -1 -70 c-2 -133 -8 -134 -73 -10 -33 61 -72 134 -88 163 -16 28 -26 52 -22 52 3 0 29 -21 57 -46z m80 -1510 c222 -202 933 -682 1337 -902 41 -23 83 -47 93 -54 19 -14 30 15 -123 -343 -23 -55 -71 -170 -106 -255 -85 -206 -93 -222 -103 -218 -5 2 -78 71 -163 153 -306 300 -888 864 -1041 1009 -86 82 -157 154 -157 161 0 7 16 52 36 101 62 153 144 374 144 390 0 25 21 15 83 -42z m1883 -530 c74 -104 140 -239 177 -364 47 -156 149 -551 144 -556 -2 -3 -33 28 -68 68 -119 138 -151 168 -180 168 -35 0 -58 -32 -90 -122 -13 -38 -27 -68 -30 -68 -9 0 -14 21 -55 224 -19 93 -34 183 -34 200 0 17 16 135 35 261 19 127 35 236 35 243 0 26 20 10 66 -54z"/> <path d="M5785 4195 c-29 -28 -29 -33 -10 -224 47 -463 50 -571 47 -1694 -2 -674 1 -1149 8 -1285 19 -386 50 -906 55 -949 l6 -43 70 0 69 0 0 48 c0 26 -7 151 -15 277 -46 725 -53 1028 -43 1930 9 817 -5 1297 -52 1750 -16 151 -19 165 -45 191 -31 31 -59 30 -90 -1z"/> <path d="M2483 3229 c-46 -17 -49 -35 -87 -499 -20 -245 -52 -618 -71 -830 -19 -212 -43 -495 -55 -630 -48 -572 -40 -526 -105 -626 -32 -49 -45 -79 -45 -106 0 -22 25 -99 64 -195 35 -87 78 -200 96 -250 l33 -93 78 0 c44 0 79 4 79 10 0 15 -73 213 -167 448 l-25 63 47 93 46 93 30 334 c79 891 112 1265 129 1494 11 138 27 335 35 439 18 208 14 237 -33 254 -15 5 -37 6 -49 1z"/> </g> </svg>`;
        case 'glasses-woman': return `<svg xmlns="http://www.w3.org/2000/svg"  width="720.000000pt" height="1280.000000pt" viewBox="0 0 720.000000 1280.000000"  preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none"> <path d="M3625 11775 c-537 -74 -1016 -387 -1317 -860 -239 -376 -363 -833 -433 -1585 -7 -85 -23 -256 -34 -380 -62 -679 -141 -1096 -321 -1705 -39 -132 -91 -307 -116 -390 -81 -274 -139 -531 -170 -756 -20 -145 -25 -511 -7 -571 l11 -37 -177 -178 c-188 -189 -239 -256 -321 -420 -152 -308 -231 -691 -260 -1263 -5 -107 -10 -872 -11 -1700 l-1 -1505 26 -115 c15 -63 39 -158 54 -210 l28 -95 77 -3 c59 -2 76 0 72 10 -2 7 -22 78 -44 158 -76 278 -71 126 -61 1960 7 1366 11 1668 24 1780 45 399 100 643 196 860 61 139 94 194 175 295 122 150 249 266 695 634 91 75 197 166 236 204 39 37 72 67 75 67 2 0 5 -51 6 -114 6 -342 117 -668 321 -942 231 -312 686 -641 994 -720 52 -14 62 -14 75 -2 19 19 17 20 -142 105 -280 150 -436 263 -649 471 -146 144 -251 286 -331 447 -73 148 -104 236 -137 391 -20 94 -23 137 -23 309 1 235 16 347 80 600 23 93 40 175 38 182 -10 26 -43 13 -62 -24 -42 -85 -122 -351 -146 -488 -6 -35 -19 -50 -102 -120 -310 -261 -590 -485 -597 -478 -12 12 -6 310 9 438 31 267 107 591 236 1005 104 331 190 661 242 920 64 316 103 604 147 1085 47 505 67 678 106 885 108 577 294 960 612 1260 138 130 256 214 414 295 363 186 765 231 1096 123 54 -17 77 -19 150 -13 192 17 344 -10 548 -98 358 -154 629 -414 818 -786 62 -123 163 -383 230 -592 72 -227 149 -569 133 -585 -3 -4 -42 3 -86 15 -44 12 -109 24 -144 28 l-64 6 -7 109 c-26 432 -233 922 -474 1123 -37 31 -94 71 -127 90 -61 34 -195 75 -247 75 -45 0 -88 -27 -88 -54 0 -32 16 -43 75 -51 127 -19 277 -103 368 -208 58 -67 131 -175 167 -246 73 -145 153 -392 180 -551 6 -36 13 -75 15 -86 5 -21 2 -21 -59 -17 -79 7 -188 -16 -276 -58 -78 -37 -110 -65 -110 -96 0 -38 26 -38 118 0 48 19 123 43 168 52 71 16 86 16 125 4 41 -13 44 -16 44 -49 l0 -35 -65 -3 c-174 -8 -354 -70 -429 -146 l-41 -42 -130 1 -129 0 -38 37 c-115 112 -417 174 -724 149 -142 -12 -365 -50 -436 -75 -39 -14 -330 -42 -339 -33 -3 3 1 18 9 34 8 15 38 86 67 156 48 117 57 132 106 174 109 94 291 316 434 527 93 139 176 240 273 332 145 138 269 194 428 194 61 0 78 3 83 16 13 33 5 55 -26 75 -29 18 -44 20 -123 16 -247 -14 -466 -181 -720 -552 -206 -300 -419 -535 -620 -686 -159 -119 -420 -270 -570 -329 -83 -33 -164 -115 -194 -195 -57 -153 -33 -342 70 -545 90 -178 211 -302 342 -352 32 -13 64 -32 70 -43 8 -14 12 -132 12 -405 0 -432 -4 -475 -90 -991 -119 -714 -123 -1149 -15 -1596 58 -242 189 -550 300 -703 80 -113 124 -160 146 -160 32 0 30 12 -10 79 -211 353 -337 734 -375 1136 -14 142 -21 375 -12 375 4 0 37 -37 72 -82 110 -142 259 -306 465 -509 494 -487 618 -564 692 -430 11 20 43 110 72 201 97 312 184 570 191 570 8 0 34 -104 93 -371 43 -191 48 -206 86 -227 16 -9 30 -21 30 -25 0 -11 60 -161 124 -309 94 -220 164 -372 299 -643 185 -372 238 -484 291 -618 137 -347 177 -618 221 -1507 15 -301 26 -470 45 -705 32 -391 43 -537 65 -870 14 -203 28 -398 31 -433 l6 -62 64 0 64 0 0 52 c0 72 -46 692 -75 1013 -32 352 -50 614 -75 1085 -38 713 -79 1028 -175 1316 -62 188 -104 283 -325 729 -228 461 -234 473 -330 700 -40 94 -88 205 -106 248 -19 43 -34 90 -34 105 0 26 49 187 55 180 1 -2 51 -64 110 -138 60 -74 126 -156 148 -182 65 -78 124 -87 154 -23 l16 33 49 -80 c71 -117 98 -154 182 -250 111 -126 207 -190 206 -136 0 7 -43 69 -95 138 -147 195 -275 421 -344 608 -16 44 -46 165 -66 269 -41 220 -51 250 -108 330 -53 75 -333 411 -450 541 -20 22 -20 26 -8 125 15 122 35 245 57 345 l16 74 47 -6 c268 -31 420 8 549 143 55 58 76 92 162 266 224 456 309 701 358 1034 l17 114 44 15 c28 9 65 36 105 76 51 50 68 75 94 141 36 94 64 194 88 325 17 91 19 93 26 55 12 -70 9 -336 -7 -470 -29 -247 -75 -434 -206 -835 -173 -530 -228 -772 -248 -1095 -29 -469 81 -961 298 -1334 40 -67 71 -91 71 -54 0 9 -29 102 -65 207 -222 656 -249 1160 -94 1765 31 120 37 140 112 376 110 344 157 494 172 554 165 666 112 1290 -174 2054 -150 400 -300 649 -518 857 -290 279 -734 470 -1038 445 -132 -10 -146 -10 -195 9 -141 55 -415 78 -605 51z m-338 -2177 c-14 -29 -33 -73 -43 -98 -9 -25 -18 -46 -19 -47 -1 -2 -48 -7 -106 -13 -57 -5 -119 -12 -136 -15 -53 -9 -38 7 43 49 41 21 121 71 177 111 56 40 104 71 106 69 1 -1 -8 -27 -22 -56z m1284 -150 c218 -63 261 -139 205 -358 -38 -147 -102 -276 -166 -333 -69 -62 -120 -79 -265 -84 -262 -11 -380 60 -449 267 -52 158 -71 324 -45 401 37 110 135 140 439 135 171 -3 205 -7 281 -28z m1083 -70 c-5 -57 -7 -232 -5 -390 l3 -288 -74 0 c-152 0 -240 54 -303 185 -61 126 -91 321 -65 415 27 97 199 177 384 179 l68 1 -8 -102z m266 76 c25 -10 48 -29 62 -53 58 -93 -1 -441 -98 -583 -24 -34 -100 -96 -107 -87 -5 5 -27 420 -27 490 0 60 7 69 55 69 13 0 58 5 100 11 66 10 75 14 75 33 0 11 -9 36 -20 54 -22 36 -32 37 -125 22 -32 -5 -62 -6 -66 -2 -4 4 -4 22 -2 41 l6 33 53 -6 c30 -3 72 -13 94 -22z m-2257 -137 c49 -21 57 -37 78 -154 77 -430 200 -566 525 -580 282 -13 422 59 528 271 39 79 56 129 106 317 20 75 156 107 180 43 6 -14 10 -38 10 -54 0 -53 51 -225 90 -307 82 -167 207 -243 401 -243 69 0 68 4 44 -130 -45 -255 -122 -473 -301 -854 -109 -232 -138 -280 -206 -340 -154 -139 -448 -124 -868 45 -124 50 -386 178 -488 238 -77 45 -109 41 -127 -17 -10 -35 40 -75 211 -168 189 -102 418 -203 557 -246 104 -32 108 -34 103 -58 -73 -338 -107 -621 -110 -907 0 -95 -3 -172 -6 -170 -14 6 -247 131 -420 225 -324 175 -611 355 -825 515 -154 115 -143 83 -106 304 59 361 79 665 62 973 -6 107 -13 211 -16 230 -5 33 -5 33 6 10 64 -138 158 -316 192 -365 46 -65 86 -83 105 -48 8 14 -6 51 -64 168 -41 83 -97 205 -126 273 -30 72 -59 127 -70 133 -11 6 -33 7 -51 3 -54 -12 -99 -5 -162 26 -137 68 -252 225 -316 430 -33 104 -33 234 -1 305 54 119 143 156 239 100 23 -14 43 -29 43 -34 0 -4 27 -35 60 -69 67 -69 117 -90 167 -72 44 17 107 85 138 150 l28 60 156 3 c86 1 166 4 179 5 12 1 37 -4 55 -11z m-526 -59 c-18 -29 -40 -54 -49 -56 -18 -3 -69 37 -99 79 l-20 29 101 0 101 0 -34 -52z m-43 -2642 c118 -88 352 -241 516 -338 143 -84 496 -278 506 -278 3 0 47 -23 99 -52 59 -32 95 -58 95 -68 0 -8 -14 -51 -31 -95 -44 -113 -151 -438 -208 -632 -12 -40 -25 -73 -30 -73 -41 0 -482 404 -714 654 -149 161 -294 340 -359 442 l-46 71 13 126 c14 128 32 263 41 305 4 20 7 21 22 10 9 -7 53 -40 96 -72z m1631 -452 c169 -200 217 -263 236 -311 11 -29 112 -604 106 -609 -2 -2 -29 30 -60 70 -31 40 -82 101 -113 137 -94 107 -91 90 -39 224 26 64 47 130 47 146 2 56 -42 77 -78 37 -23 -26 -93 -175 -150 -320 -21 -54 -41 -94 -45 -90 -3 4 -23 81 -44 172 -21 91 -44 183 -52 205 -10 29 -13 96 -13 270 1 126 4 242 7 258 7 37 5 39 198 -189z"/> <path d="M3999 9750 c-94 -25 -219 -99 -219 -131 0 -21 30 -19 91 6 105 42 221 58 338 45 100 -11 260 -46 340 -74 54 -20 85 -20 101 -1 31 38 -29 83 -165 123 -182 54 -362 66 -486 32z"/> <path d="M5417 6658 c-3 -13 -11 -88 -17 -167 -27 -342 36 -685 181 -989 62 -132 104 -202 199 -332 100 -137 96 -131 60 -117 -22 8 -33 8 -41 0 -13 -13 -12 -18 40 -195 59 -202 106 -446 151 -783 11 -88 23 -173 26 -190 10 -53 -11 -14 -45 79 -17 49 -59 153 -92 230 -105 246 -115 260 -163 238 -37 -17 -34 -54 13 -165 109 -257 222 -579 270 -772 48 -194 84 -480 126 -1005 23 -288 81 -861 115 -1135 33 -262 56 -399 130 -785 27 -140 61 -318 75 -395 14 -77 28 -148 31 -157 4 -15 17 -18 78 -18 l73 0 -4 28 c-3 15 -24 128 -48 252 -118 611 -173 926 -195 1125 -6 55 -15 138 -21 185 -10 94 -52 560 -69 770 -14 187 -29 357 -40 475 -43 448 -52 531 -110 1030 -68 591 -133 915 -216 1078 -19 38 -30 66 -23 62 21 -14 101 -147 150 -251 27 -57 53 -104 59 -104 16 0 12 60 -10 146 -31 121 -104 260 -255 485 -206 306 -302 521 -359 803 -33 163 -46 288 -46 456 0 128 -9 175 -23 118z"/> <path d="M1395 5210 c-9 -14 -12 -12 70 -55 292 -155 482 -398 690 -885 93 -219 117 -270 128 -270 11 0 2 39 -33 155 -50 163 -100 288 -178 445 -90 182 -182 311 -302 423 -68 64 -103 88 -194 132 -120 58 -170 73 -181 55z"/> <path d="M4440 4709 c0 -30 92 -254 295 -709 185 -416 267 -654 334 -970 54 -256 72 -419 106 -995 42 -703 134 -1926 151 -2008 4 -19 12 -27 26 -27 19 0 20 4 13 142 -7 164 -25 422 -60 893 -14 182 -38 543 -55 803 -30 474 -41 603 -61 762 -76 611 -151 867 -412 1415 -92 194 -240 506 -308 650 -15 33 -28 53 -29 44z"/> <path d="M2464 3250 c-12 -4 -24 -16 -28 -26 -4 -10 -14 -113 -21 -229 -15 -207 -56 -730 -75 -935 -5 -58 -23 -274 -40 -480 -32 -400 -66 -757 -76 -804 -7 -31 -57 -58 -209 -111 -155 -54 -346 -125 -365 -137 -26 -17 -39 -57 -28 -88 19 -51 56 -52 180 -4 180 69 279 104 293 104 22 0 110 -192 190 -415 l43 -120 75 -3 76 -3 -16 53 c-22 78 -148 388 -189 471 -34 66 -35 72 -19 82 75 43 104 90 116 184 72 578 203 2363 178 2428 -7 18 -49 47 -62 42 -1 0 -11 -4 -23 -9z"/> </g> </svg> `;
        case 'hard-hat': return `<svg xmlns="http://www.w3.org/2000/svg"  width="720.000000pt" height="1280.000000pt" viewBox="0 0 720.000000 1280.000000"  preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none"> <path d="M3635 11845 c-145 -20 -235 -41 -370 -86 -234 -78 -428 -191 -608 -353 -215 -195 -337 -351 -446 -571 -136 -275 -196 -522 -208 -845 l-6 -165 -48 -57 c-55 -67 -73 -129 -63 -217 4 -45 1 -65 -15 -101 -28 -61 -29 -185 -2 -238 49 -94 115 -120 199 -78 l50 26 26 -68 c13 -37 55 -148 91 -247 80 -215 106 -268 144 -296 19 -14 32 -34 36 -58 11 -58 71 -198 131 -306 71 -126 150 -233 231 -310 l63 -60 -20 -210 c-71 -747 -109 -947 -225 -1187 -18 -36 -21 -38 -65 -38 -42 0 -63 -12 -288 -160 -422 -278 -747 -524 -1045 -790 -281 -251 -453 -488 -555 -766 -87 -236 -125 -442 -159 -859 -13 -158 -16 -459 -20 -1770 -3 -1144 -1 -1597 7 -1640 6 -33 29 -135 51 -227 l41 -168 74 0 c41 0 74 3 74 7 0 4 -21 91 -48 193 l-47 185 0 1625 c0 1673 2 1751 41 2065 60 476 191 781 465 1077 121 132 482 448 512 448 7 0 56 -26 108 -58 501 -306 896 -864 1059 -1497 163 -633 101 -1190 -173 -1557 -30 -40 -69 -86 -87 -103 l-33 -30 7 100 c4 55 16 217 27 360 29 369 29 382 0 406 -31 25 -54 24 -85 -3 -25 -22 -27 -29 -46 -268 -29 -349 -46 -554 -74 -885 -14 -159 -37 -443 -51 -630 -13 -187 -31 -414 -39 -503 l-15 -164 -44 -56 c-96 -123 -97 -142 -13 -347 32 -77 76 -191 98 -252 l41 -113 78 0 79 0 -26 72 c-42 116 -129 338 -158 400 -33 73 -33 89 5 130 41 44 75 113 83 168 3 25 31 347 61 715 54 652 56 670 78 684 12 8 58 51 103 96 223 228 341 477 389 824 31 226 17 597 -31 824 -134 639 -475 1224 -918 1577 -73 57 -273 194 -300 203 -6 2 -9 6 -6 8 3 3 39 30 80 60 71 53 102 75 292 206 42 29 80 53 85 53 4 0 71 -55 148 -123 538 -472 918 -1117 1134 -1922 36 -138 100 -418 116 -507 3 -21 17 -51 31 -68 24 -27 31 -30 87 -30 130 0 596 42 942 85 224 28 648 101 676 116 50 26 49 75 -6 408 -103 621 -294 1345 -489 1855 -15 38 -25 70 -23 72 5 6 348 -223 374 -249 38 -39 219 -625 312 -1012 64 -267 108 -504 151 -804 l39 -276 25 -785 c15 -432 30 -904 36 -1050 9 -241 31 -894 45 -1340 3 -96 8 -223 11 -283 l6 -107 69 0 69 0 0 38 c0 20 -9 287 -20 592 -11 305 -29 823 -40 1150 -63 1843 -58 1750 -96 2030 -67 498 -203 1100 -351 1553 -16 48 -27 89 -25 91 8 8 131 -141 185 -224 118 -183 193 -367 252 -620 52 -222 57 -262 180 -1410 13 -124 33 -308 44 -410 11 -102 32 -311 46 -465 95 -1025 122 -1217 326 -2272 l10 -53 74 0 74 0 -6 37 c-6 40 -45 255 -119 643 -67 359 -111 624 -123 745 -7 61 -32 319 -57 575 -24 256 -54 551 -65 655 -11 105 -38 361 -59 570 -54 510 -88 825 -100 910 -55 388 -75 497 -119 652 -99 343 -272 623 -525 851 -124 113 -285 225 -756 525 -52 34 -97 62 -99 64 -7 5 102 689 111 699 2 2 44 -6 93 -17 244 -55 446 -27 612 83 171 115 264 291 342 644 90 411 128 819 118 1294 -6 307 -16 446 -48 694 -11 87 -18 160 -16 162 2 2 84 8 183 14 277 16 346 36 387 117 72 138 -71 270 -379 353 l-82 22 -37 116 c-164 515 -470 932 -805 1102 -41 21 -100 57 -130 80 -132 100 -395 200 -634 241 -156 27 -520 35 -671 14z m595 -141 c369 -55 630 -182 800 -392 76 -94 189 -308 230 -435 12 -38 30 -71 40 -77 48 -26 90 0 90 55 0 36 -49 191 -82 263 -12 23 -18 45 -16 48 5 4 95 -102 149 -176 45 -61 146 -233 179 -305 62 -137 146 -363 137 -372 -2 -1 -41 2 -88 8 -215 29 -674 5 -1059 -56 -383 -59 -1026 -221 -1092 -274 -18 -15 -23 -28 -21 -63 l1 -43 -211 -69 c-206 -66 -566 -196 -697 -251 -137 -57 -370 -176 -477 -243 -104 -65 -114 -69 -123 -52 -16 30 -12 91 11 155 16 47 19 72 14 129 -6 74 4 109 36 129 13 8 27 2 63 -30 28 -25 60 -43 82 -46 74 -12 195 28 228 75 9 13 27 59 41 103 26 84 30 92 57 113 27 22 785 272 823 272 10 0 46 -14 81 -32 53 -27 68 -31 91 -22 23 8 29 16 31 45 3 34 0 39 -47 68 -126 77 -162 78 -376 10 -299 -94 -610 -201 -642 -221 -52 -31 -99 -94 -118 -156 -9 -31 -21 -71 -26 -88 -15 -49 -95 -73 -147 -45 -51 27 -55 47 -49 244 10 312 70 556 205 826 128 255 361 500 574 603 226 109 568 99 837 -24 218 -100 408 -292 502 -508 38 -87 64 -120 95 -120 61 0 69 65 22 172 -143 325 -405 550 -748 642 -105 28 -252 49 -317 45 -73 -5 -57 7 54 40 266 77 575 97 863 55z m1545 -1528 c209 -34 403 -103 460 -165 25 -29 12 -40 -67 -59 -54 -13 -229 -16 -1225 -19 -652 -2 -1163 0 -1163 5 0 10 439 121 620 156 153 31 435 71 590 85 63 6 131 13 150 15 87 10 540 -3 635 -18z m-106 -483 c64 -480 78 -1001 36 -1413 -61 -603 -165 -971 -315 -1114 -90 -86 -239 -145 -366 -146 -128 0 -356 63 -591 165 -135 59 -458 223 -507 258 -58 41 -126 15 -126 -48 0 -20 8 -39 23 -52 48 -46 470 -259 655 -333 45 -18 82 -37 82 -42 0 -6 -7 -49 -15 -97 -85 -493 -125 -794 -124 -935 1 -154 11 -215 38 -237 32 -26 66 -24 89 6 18 23 19 36 14 175 -5 164 1 183 37 100 54 -126 48 -326 -14 -455 -110 -229 -337 -266 -742 -119 -257 92 -527 259 -735 451 -86 81 -397 404 -410 427 -6 10 -3 24 6 38 65 103 147 365 180 578 37 233 101 899 112 1155 l7 160 96 0 c161 0 241 37 241 111 0 64 -55 82 -132 43 -33 -17 -55 -20 -112 -17 -180 10 -350 165 -433 396 -121 340 -20 642 217 642 155 0 284 -132 345 -354 20 -73 44 -95 143 -134 90 -35 123 -33 156 11 16 22 21 51 28 164 16 266 66 478 148 636 l41 77 957 0 958 0 13 -97z m-2105 55 c-3 -13 -10 -27 -14 -33 -12 -17 -59 -147 -79 -220 -24 -88 -47 -240 -56 -367 -4 -54 -10 -98 -14 -98 -18 0 -49 50 -65 105 -43 142 -140 274 -248 338 -26 15 -77 35 -113 44 -67 18 -78 26 -47 36 9 3 154 53 322 111 168 57 309 104 313 105 5 1 5 -9 1 -21z m-982 -361 c-37 -41 -80 -132 -96 -204 -17 -77 -20 -230 -7 -302 8 -39 5 -52 -17 -97 -15 -29 -30 -53 -33 -53 -3 -1 -13 16 -23 37 -22 44 -132 356 -151 425 -16 58 -27 49 190 158 145 73 179 82 137 36z m-19 -765 c15 -73 166 -259 260 -319 l38 -24 -2 -122 c-3 -169 -5 -174 -59 -106 -151 191 -288 487 -266 574 8 33 22 32 29 -3z m150 -2558 c313 -348 558 -546 862 -697 348 -173 665 -233 865 -162 145 51 275 198 312 353 6 26 13 54 15 62 6 17 32 -54 99 -270 135 -430 239 -848 313 -1263 33 -185 65 -397 60 -401 -6 -4 -377 -63 -539 -86 -236 -32 -737 -83 -914 -92 l-50 -2 -27 134 c-136 673 -361 1233 -685 1708 -154 225 -372 471 -586 659 -60 52 -108 98 -108 101 1 6 19 19 163 109 49 31 53 32 68 15 8 -9 77 -85 152 -168z"/> </g> </svg>`;
        case 'modern-robot': return `<svg xmlns="http://www.w3.org/2000/svg"  width="720.000000pt" height="1280.000000pt" viewBox="0 0 720.000000 1280.000000"  preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none"> <path d="M3670 11799 c-295 -34 -575 -132 -789 -275 -89 -60 -229 -184 -271 -239 -19 -26 -62 -68 -95 -94 -245 -193 -416 -563 -464 -1003 -16 -141 -14 -417 4 -542 69 -494 227 -892 640 -1611 l137 -240 -6 -80 c-8 -93 -54 -523 -62 -576 -5 -34 -8 -37 -46 -42 -22 -3 -50 -15 -63 -27 -12 -11 -51 -88 -86 -171 -56 -132 -65 -149 -86 -149 -31 0 -72 -22 -99 -52 -40 -45 -276 -418 -297 -471 -20 -48 -42 -71 -217 -222 -107 -93 -215 -187 -240 -209 -54 -48 -120 -106 -330 -286 -282 -242 -386 -348 -483 -495 -171 -260 -271 -586 -311 -1016 -38 -409 -40 -521 -39 -2074 l1 -1520 36 -155 c20 -85 41 -176 48 -202 l11 -48 80 0 c78 0 79 1 73 23 -29 101 -86 346 -95 404 -8 49 -11 496 -11 1390 0 1537 9 1900 55 2263 55 428 188 776 371 967 68 70 71 72 148 88 119 26 249 17 347 -24 237 -99 451 -325 614 -651 92 -183 170 -424 229 -705 46 -220 48 -226 67 -238 29 -18 49 -1 49 40 0 76 -83 437 -143 623 -148 457 -423 830 -722 975 -121 59 -204 78 -329 73 l-98 -4 34 31 c19 16 157 136 308 265 150 129 327 282 393 340 66 58 138 120 159 139 22 18 41 32 43 30 4 -5 304 -735 329 -802 36 -97 32 -95 462 -203 126 -31 231 -58 233 -60 4 -4 -45 -103 -133 -264 -99 -181 -99 -198 -1 -315 63 -75 418 -551 530 -710 262 -372 444 -677 645 -1076 207 -410 354 -785 523 -1330 l95 -305 11 -195 c13 -227 31 -653 31 -721 l0 -48 75 0 75 0 0 53 c0 98 -40 951 -55 1182 -68 1044 -196 1769 -412 2340 -140 370 -372 846 -648 1331 -52 92 -95 169 -95 171 0 3 26 -17 58 -44 158 -136 195 -156 249 -141 23 6 38 19 52 46 10 20 74 207 142 415 68 207 126 374 130 370 4 -5 32 -129 62 -278 49 -242 58 -271 80 -290 l25 -20 -25 -95 -25 -95 80 -270 c183 -615 359 -1328 461 -1865 52 -271 81 -497 106 -820 35 -467 124 -1861 125 -1977 0 -8 14 -13 35 -13 l35 0 0 98 c0 143 -70 1274 -115 1867 -37 482 -77 746 -200 1300 -52 236 -210 874 -256 1035 -16 58 -41 143 -54 190 -13 47 -45 155 -71 240 -71 237 -70 222 -40 322 14 48 32 98 40 110 8 13 27 56 42 96 14 40 28 71 29 70 11 -12 187 -471 241 -628 297 -865 440 -1506 519 -2320 18 -185 95 -1267 130 -1820 14 -217 28 -432 31 -477 l7 -83 75 0 74 0 -6 103 c-24 379 -68 1028 -75 1107 -10 102 -7 135 33 450 111 876 123 1532 40 2165 -34 265 -134 822 -160 891 -11 32 -41 65 -122 137 -59 52 -117 103 -130 114 l-23 18 35 100 c20 55 36 114 36 132 0 23 -19 56 -77 135 -87 115 -159 208 -215 277 -21 24 -36 47 -33 49 8 8 201 -154 290 -243 192 -192 351 -487 420 -778 55 -234 80 -417 175 -1262 80 -723 77 -693 105 -1000 102 -1103 108 -1149 229 -1785 15 -74 44 -234 66 -355 23 -121 43 -228 46 -237 4 -15 18 -18 80 -18 l75 0 -6 33 c-7 38 -71 383 -89 482 -124 650 -147 802 -185 1200 -77 811 -104 1087 -126 1285 -14 124 -48 430 -75 680 -73 664 -123 973 -191 1170 -84 249 -204 453 -378 648 -69 77 -219 207 -406 352 -130 100 -153 124 -288 295 -152 192 -223 280 -241 294 -9 8 -16 25 -16 40 0 36 62 434 69 443 3 4 51 -5 106 -19 145 -37 304 -37 430 1 236 71 389 240 468 516 154 536 271 1467 253 2000 -14 387 -50 639 -137 955 -125 454 -299 746 -603 1008 -327 282 -779 430 -1301 426 -93 -1 -204 -5 -245 -10z m512 -150 c48 -7 85 -15 82 -20 -3 -5 -18 -9 -33 -9 -15 0 -63 -9 -107 -20 -390 -100 -654 -316 -835 -681 l-48 -97 -38 9 c-154 38 -478 38 -682 0 -62 -12 -116 -19 -119 -17 -13 14 73 131 158 214 114 111 88 86 207 208 54 56 126 120 160 143 228 152 527 255 820 281 112 10 307 5 435 -11z m533 -132 c458 -200 752 -530 913 -1028 104 -320 149 -554 173 -899 13 -188 7 -557 -11 -765 -27 -306 -115 -893 -173 -1150 l-23 -100 -39 5 c-22 3 -121 5 -220 5 -198 -1 -281 -16 -377 -70 -91 -51 -179 -159 -255 -314 -25 -53 -47 -97 -48 -98 0 -1 -26 7 -58 19 -56 20 -56 21 -88 97 -17 42 -67 135 -110 206 l-78 130 -20 185 c-11 102 -27 259 -36 350 -22 227 -54 528 -61 569 -6 40 -16 49 -230 233 l-152 129 -6 62 c-3 34 -11 152 -16 262 -6 110 -18 225 -26 256 -20 79 -144 425 -192 537 -93 216 -272 354 -495 381 -40 5 -186 6 -332 1 -244 -7 -370 -22 -479 -56 -16 -5 -17 -2 -11 28 11 47 64 193 78 212 31 42 443 94 652 82 364 -20 669 -229 821 -563 19 -40 51 -126 73 -190 41 -119 55 -141 85 -130 26 10 19 56 -25 184 -78 222 -168 372 -296 494 -83 78 -198 156 -280 190 -29 12 -53 27 -53 33 0 19 86 181 132 249 218 325 614 521 1038 514 114 -2 116 -3 225 -50z m-1594 -1077 c139 -26 298 -145 366 -275 44 -83 210 -541 222 -612 6 -32 15 -146 21 -253 5 -107 13 -221 16 -252 7 -67 10 -70 179 -213 61 -50 132 -112 158 -136 l48 -44 19 -170 c20 -186 39 -370 70 -685 25 -247 31 -274 83 -353 48 -75 137 -239 137 -254 0 -28 -660 282 -791 371 -64 44 -146 138 -173 199 -19 44 -94 232 -212 532 -14 35 -20 61 -14 63 6 2 32 21 59 42 176 139 274 426 241 710 -34 299 -157 498 -370 598 -71 33 -81 36 -181 36 l-107 1 -6 55 c-8 66 -34 113 -78 141 -39 23 -46 23 -338 -23 -107 -16 -214 -32 -237 -35 l-43 -6 0 119 c0 116 8 194 31 320 l11 62 46 10 c26 5 81 18 122 27 41 9 118 20 170 25 144 11 490 11 551 0z m-345 -568 c19 -12 33 -47 39 -98 l7 -50 -57 -29 c-183 -95 -309 -302 -334 -548 -9 -92 0 -273 15 -300 5 -8 4 -9 -4 -2 -19 17 -110 258 -148 388 -19 67 -46 176 -59 242 -22 114 -49 314 -42 321 1 2 63 13 137 24 74 12 185 30 245 40 121 20 184 24 201 12z m302 -222 c72 -17 128 -49 197 -112 54 -50 74 -77 109 -152 68 -141 81 -205 81 -386 -1 -175 -13 -235 -72 -360 -43 -89 -132 -183 -208 -220 -43 -22 -64 -25 -150 -25 -90 0 -106 3 -157 29 -154 78 -272 247 -314 454 -20 94 -14 298 10 387 75 270 290 434 504 385z m-337 -1292 c36 -23 74 -48 84 -53 15 -9 19 -28 23 -118 2 -59 1 -107 -4 -107 -5 0 -21 22 -35 48 -14 26 -53 97 -87 159 -61 110 -69 129 -54 119 4 -2 37 -24 73 -48z m410 -136 c4 -4 25 -59 49 -122 23 -63 62 -164 86 -224 24 -59 44 -113 44 -118 0 -6 -14 -7 -32 -3 -67 15 -272 77 -300 91 l-28 15 0 187 0 187 87 -3 c49 -2 91 -7 94 -10z m-138 -467 c50 -21 306 -85 339 -85 15 0 28 -4 28 -9 0 -5 20 -36 45 -69 56 -74 143 -147 246 -203 89 -49 79 -25 99 -244 29 -318 98 -750 135 -847 5 -11 2 -18 -5 -18 -29 0 -556 321 -643 392 l-29 23 16 61 c29 114 49 279 50 424 1 137 0 147 -22 174 -35 45 -57 57 -192 107 -104 38 -125 49 -123 65 1 10 5 70 9 132 4 61 8 112 9 112 2 0 18 -7 38 -15z m2500 -244 c26 -4 49 -10 52 -13 11 -10 -28 -125 -67 -201 -49 -94 -123 -174 -195 -211 -78 -39 -188 -66 -271 -66 -64 0 -286 41 -301 55 -8 9 61 145 112 222 85 127 168 182 310 208 80 15 286 18 360 6z m-2469 -116 c180 -59 191 -73 182 -228 -13 -201 -54 -434 -75 -425 -4 2 -64 48 -134 103 -126 98 -128 101 -124 135 3 19 15 126 28 238 15 132 27 202 35 202 6 0 46 -11 88 -25z m1018 -204 c92 -44 200 -94 240 -111 40 -16 111 -45 158 -64 l85 -35 -1 -38 c-2 -66 -128 -901 -138 -910 -4 -4 -113 45 -274 124 -111 55 -133 69 -138 92 -3 14 -14 55 -25 91 -23 81 -53 236 -78 405 -23 152 -61 475 -61 523 l0 32 33 -14 c17 -7 107 -50 199 -95z m-1294 -327 c136 -133 471 -371 797 -565 66 -39 136 -82 155 -94 50 -32 313 -169 464 -242 71 -34 131 -64 133 -67 5 -5 -252 -793 -266 -814 -12 -20 -561 466 -626 555 -139 188 -362 467 -640 798 -91 109 -164 203 -162 209 3 6 27 66 53 134 26 67 49 122 51 122 2 0 21 -16 41 -36z m-23 -614 c507 -610 782 -997 1067 -1501 495 -875 731 -1496 852 -2239 31 -190 71 -503 86 -665 6 -66 13 -138 16 -160 8 -61 -4 -37 -51 102 -134 397 -428 1015 -680 1428 -207 338 -356 553 -735 1057 -91 121 -171 228 -178 238 -12 17 -1 44 97 233 124 239 131 265 84 317 -25 27 -51 36 -263 90 -129 33 -278 71 -330 85 l-95 26 -89 222 c-49 122 -97 240 -107 262 -50 110 -179 429 -179 443 0 16 46 92 174 290 57 89 60 92 77 75 9 -10 123 -146 254 -303z m1984 -145 c67 -85 121 -157 121 -161 0 -3 -41 -105 -91 -227 -50 -122 -95 -233 -100 -246 -5 -13 -12 -22 -15 -19 -2 3 -25 111 -50 239 -44 224 -45 237 -34 309 18 119 43 260 46 260 1 0 57 -70 123 -155z m195 -614 c12 -88 20 -161 17 -161 -3 0 -28 42 -54 93 l-49 92 28 73 c14 40 29 71 31 68 2 -2 14 -76 27 -165z m276 -119 c61 -75 113 -147 116 -158 3 -12 -10 -71 -30 -133 -27 -82 -34 -116 -27 -134 10 -25 39 -53 187 -186 l92 -81 31 -162 c53 -280 99 -582 140 -908 25 -204 34 -434 28 -750 -6 -294 -27 -633 -40 -646 -6 -6 -10 27 -32 261 -68 709 -214 1366 -475 2145 -48 146 -104 309 -124 363 -25 69 -31 97 -22 97 7 0 25 9 40 21 23 18 26 28 26 77 0 31 -9 120 -20 197 -11 77 -20 141 -20 143 0 12 34 -26 130 -146z"/> <path d="M2886 9472 c-102 -35 -197 -158 -225 -290 -16 -78 -14 -244 5 -316 35 -134 117 -246 209 -287 69 -31 161 -28 230 5 92 46 151 129 186 263 48 188 4 412 -106 540 -70 82 -200 119 -299 85z m134 -72 c122 -34 210 -199 210 -392 -1 -213 -101 -368 -237 -368 -158 0 -263 156 -264 392 0 106 10 157 48 233 39 78 79 113 153 136 35 10 50 10 90 -1z"/> <path d="M2456 3226 c-19 -18 -25 -38 -30 -97 -4 -41 -20 -234 -36 -429 -17 -195 -46 -533 -65 -750 -19 -217 -48 -559 -65 -760 -17 -201 -35 -382 -41 -403 -16 -58 -13 -57 -524 -248 -27 -10 -58 -28 -67 -40 -26 -31 -23 -75 8 -105 31 -32 28 -32 243 52 90 36 175 67 190 70 24 5 29 -1 78 -98 60 -119 111 -242 144 -345 l23 -73 78 0 c50 0 78 4 78 11 0 24 -135 370 -180 464 l-49 100 49 45 c27 25 56 62 64 82 14 33 39 278 91 883 9 99 24 281 35 405 11 124 27 302 35 395 8 94 20 231 25 305 6 74 17 217 26 317 17 197 14 216 -32 233 -38 15 -53 12 -78 -14z"/> </g> </svg>`;
        case 'retro-robot': return `<svg xmlns="http://www.w3.org/2000/svg"  width="720.000000pt" height="1280.000000pt" viewBox="0 0 720.000000 1280.000000"  preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none"> <path d="M3033 12256 c-127 -41 -213 -157 -213 -287 0 -143 121 -270 273 -287 l62 -7 88 -225 c181 -463 257 -662 257 -674 0 -8 -84 -21 -257 -40 -534 -58 -834 -101 -881 -125 -74 -38 -111 -93 -131 -191 -13 -66 -31 -566 -31 -876 0 -204 -2 -223 -19 -246 -31 -39 -87 -157 -110 -230 -82 -268 -29 -595 131 -806 47 -64 43 -23 53 -522 3 -173 10 -348 15 -388 12 -88 48 -161 101 -203 35 -28 165 -74 388 -140 l83 -24 -6 -63 c-3 -35 -15 -135 -27 -223 l-22 -158 -56 -12 c-114 -23 -141 -41 -294 -203 -79 -83 -152 -164 -162 -179 -10 -15 -20 -53 -24 -85 l-6 -57 -135 -68 c-216 -109 -494 -263 -599 -331 -133 -86 -206 -150 -276 -240 -63 -80 -67 -83 -200 -121 -130 -37 -267 -132 -360 -250 -147 -186 -225 -435 -225 -719 0 -195 41 -387 113 -533 l24 -48 -18 -230 c-22 -281 -62 -877 -110 -1621 l-22 -341 22 -47 c27 -54 78 -98 176 -151 94 -50 95 -51 59 -80 -48 -38 -122 -152 -150 -234 -37 -106 -48 -237 -30 -353 16 -109 41 -180 96 -270 l39 -66 -29 -53 c-38 -69 -55 -144 -46 -203 l7 -46 58 0 59 0 -5 63 c-4 51 -1 71 16 105 12 23 25 42 29 42 4 0 40 -17 80 -37 67 -34 80 -37 155 -36 90 0 150 20 216 72 78 61 159 84 399 111 126 15 171 24 197 40 27 17 36 18 39 8 2 -7 19 -83 37 -168 45 -214 37 -200 105 -200 l56 0 -7 42 c-4 24 -14 67 -21 96 -8 29 -14 67 -14 84 0 17 31 128 70 247 87 272 105 357 96 471 -4 47 -31 257 -61 467 -30 210 -55 415 -55 455 0 79 25 433 64 928 l25 304 28 26 c142 127 234 342 263 610 6 58 19 166 28 240 59 482 -70 936 -344 1214 -104 104 -219 174 -350 212 -65 19 -227 22 -281 5 -125 -37 142 134 507 326 254 134 294 153 301 146 4 -5 28 -109 53 -233 26 -124 51 -244 56 -267 6 -24 22 -100 36 -170 14 -71 32 -138 40 -150 14 -22 86 -47 477 -168 64 -19 117 -38 117 -40 0 -2 -24 -42 -53 -87 -223 -347 -231 -362 -220 -406 3 -15 112 -169 242 -344 130 -174 264 -356 299 -405 171 -239 206 -289 303 -433 127 -189 206 -315 344 -550 176 -299 382 -759 493 -1100 100 -305 90 -201 118 -1272 l6 -248 60 0 60 0 -6 192 c-3 106 -8 326 -11 488 -10 524 -28 807 -71 1155 -67 540 -202 1152 -360 1633 l-34 105 42 75 c72 126 162 183 343 217 102 19 92 23 205 -87 195 -189 352 -471 425 -762 85 -336 131 -740 185 -1606 17 -267 39 -611 50 -765 10 -154 24 -362 31 -462 l12 -183 59 0 c57 0 58 0 58 28 0 16 -11 188 -25 383 -73 1049 -71 945 -30 1864 15 344 25 578 50 1200 9 204 22 498 30 654 21 393 20 428 -7 465 -12 17 -90 96 -175 175 -84 79 -153 147 -153 151 0 4 50 58 110 121 61 63 113 124 116 137 10 37 -3 66 -81 184 -41 62 -71 114 -65 116 5 2 56 -23 112 -55 l103 -58 23 -65 c75 -210 119 -471 141 -845 11 -177 21 -510 46 -1525 16 -632 28 -1064 45 -1560 26 -786 32 -929 40 -1110 5 -107 10 -210 10 -227 l0 -33 61 0 60 0 -6 128 c-16 319 -22 457 -19 463 2 3 32 12 66 19 77 15 145 33 262 68 77 23 97 33 147 79 31 29 59 53 62 53 6 0 20 -52 61 -235 38 -166 110 -466 127 -532 l12 -43 58 0 c56 0 59 1 54 23 -43 187 -115 491 -160 681 -43 180 -55 248 -51 280 4 22 9 88 12 146 5 90 3 118 -16 187 -27 100 -78 189 -149 260 l-54 54 40 42 c23 23 46 52 52 64 22 43 23 35 -115 1008 -74 528 -80 568 -113 819 l-29 219 43 76 c51 88 99 224 116 331 18 106 15 316 -5 429 -77 421 -345 755 -645 801 -56 9 -83 19 -115 43 -23 18 -104 65 -181 106 -77 41 -214 113 -305 161 -91 48 -219 116 -285 150 -96 50 -136 77 -200 139 -44 42 -101 95 -127 116 l-47 40 9 70 c5 39 18 142 30 230 12 88 24 188 27 222 l6 62 41 5 c22 3 111 8 196 11 198 7 572 32 675 46 115 14 174 34 224 74 52 41 86 89 107 148 43 119 144 998 174 1502 5 99 12 212 15 250 26 385 6 1269 -36 1534 -22 141 -93 221 -240 269 -260 86 -882 217 -1137 241 -51 4 -94 10 -96 12 -2 2 20 63 49 134 29 72 94 229 143 349 l90 219 54 2 c108 3 177 37 240 120 91 121 70 290 -51 396 -127 112 -325 81 -428 -68 -38 -55 -38 -56 -38 -152 0 -106 17 -154 75 -210 17 -15 30 -35 30 -44 0 -9 -22 -69 -48 -134 -27 -65 -93 -226 -146 -358 -54 -132 -102 -245 -107 -251 -5 -6 -55 -14 -112 -18 -57 -3 -222 -17 -367 -31 -146 -14 -268 -25 -271 -25 -7 0 -89 203 -239 595 -61 160 -116 302 -121 317 -10 24 -7 30 31 64 156 141 120 387 -72 485 -53 27 -148 34 -205 15z m173 -131 c113 -66 110 -241 -6 -302 -155 -82 -316 75 -239 234 43 88 156 120 245 68z m1736 -121 c166 -86 105 -335 -82 -334 -41 1 -105 35 -131 71 -20 29 -24 46 -24 111 0 71 2 79 30 109 17 17 44 37 60 45 41 18 110 17 147 -2z m-187 -1305 c266 -42 905 -182 905 -198 0 -5 -48 -11 -107 -14 -60 -4 -288 -18 -508 -31 -220 -14 -596 -37 -835 -51 -239 -14 -487 -29 -551 -34 l-115 -10 -440 89 c-241 49 -441 89 -443 89 -66 9 1177 146 1544 171 83 6 170 12 195 14 76 6 218 -4 355 -25z m-2279 -249 c32 -6 268 -52 523 -102 412 -82 464 -95 471 -113 9 -26 26 -662 45 -1700 8 -462 19 -1020 23 -1240 5 -220 8 -401 8 -402 -1 -1 -64 18 -141 42 -996 307 -959 294 -986 339 -11 17 -23 47 -28 66 -10 38 -20 298 -22 570 -2 200 -9 188 91 151 94 -35 255 -26 342 20 127 65 243 221 293 396 116 400 -30 849 -324 998 -125 62 -266 58 -405 -12 l-49 -25 7 384 c7 401 17 583 36 618 12 23 31 24 116 10z m3382 -73 c20 -24 31 -109 49 -382 22 -331 24 -1008 5 -1295 -21 -316 -41 -569 -52 -665 -6 -49 -21 -191 -35 -315 -32 -288 -72 -561 -90 -625 -16 -58 -71 -117 -125 -134 -19 -6 -75 -15 -125 -21 -274 -30 -1669 -99 -1741 -86 -43 9 -71 43 -78 96 -7 58 -14 395 -26 1270 -9 638 -15 896 -36 1751 -5 199 -4 268 5 273 11 7 135 15 786 51 422 24 1042 64 1205 79 199 18 245 19 258 3z m-3135 -1015 c141 -70 243 -237 282 -467 39 -229 -26 -484 -159 -624 -160 -167 -368 -150 -528 42 -167 201 -212 508 -112 773 57 151 176 273 299 305 62 16 149 5 218 -29z m375 -2458 c394 -122 506 -154 579 -164 63 -9 155 -10 395 -1 172 6 334 14 361 17 44 6 47 5 47 -18 0 -57 -22 -194 -33 -205 -36 -36 -398 -55 -619 -32 -288 29 -630 133 -822 249 -49 30 -56 38 -56 66 0 55 12 124 22 124 5 0 62 -16 126 -36z m-120 -267 c107 -67 344 -157 527 -200 296 -70 673 -86 907 -40 26 5 27 4 22 -33 -10 -75 -13 -79 -57 -101 -90 -43 -194 -56 -412 -50 l-200 6 -37 -26 c-24 -16 -43 -40 -53 -67 -8 -22 -30 -146 -49 -274 -18 -128 -36 -236 -40 -240 -12 -11 -162 46 -299 115 l-128 64 -150 226 c-111 167 -149 232 -145 248 4 11 18 104 33 208 15 103 31 187 35 187 5 0 25 -10 46 -23z m-243 -239 c-29 -16 -35 -28 -35 -72 0 -52 24 -97 192 -351 330 -500 535 -871 805 -1460 372 -808 540 -1303 684 -2015 63 -310 128 -741 103 -680 -135 324 -216 498 -337 720 -175 322 -340 583 -611 965 -115 163 -184 257 -431 590 -180 242 -195 264 -195 276 0 14 57 111 169 287 91 144 111 184 111 220 0 54 -23 67 -235 131 -110 33 -245 74 -301 92 l-101 32 -43 211 c-24 116 -61 292 -83 391 -57 260 -56 256 -56 305 -1 44 1 47 142 192 138 143 181 177 222 177 l20 0 -20 -11z m1675 -250 c-8 -80 -69 -530 -72 -534 -3 -3 -39 -17 -79 -31 -63 -22 -97 -27 -222 -31 -140 -4 -307 9 -337 28 -9 6 -9 20 -1 61 6 30 20 124 31 209 28 207 38 257 56 264 8 3 65 1 127 -5 134 -13 282 -6 392 20 81 19 105 23 105 19z m191 -195 c91 -86 157 -172 352 -454 203 -295 297 -439 297 -453 0 -7 -18 -30 -40 -51 -29 -28 -40 -47 -40 -69 0 -31 -6 -25 276 -299 111 -107 111 -108 108 -150 -4 -38 -28 -572 -53 -1147 -6 -124 -16 -391 -23 -595 -7 -203 -15 -356 -19 -340 -4 17 -12 77 -19 135 -68 632 -234 1027 -569 1354 -50 49 -91 94 -91 100 0 26 -84 748 -116 991 -28 222 -85 609 -100 680 -8 40 -28 92 -45 120 l-31 50 12 98 c7 53 16 97 21 97 5 0 41 -30 80 -67z m454 -285 l90 -46 86 -123 c97 -139 189 -282 189 -293 0 -4 -17 -24 -37 -44 -33 -32 -38 -34 -47 -18 -6 9 -91 135 -189 279 -185 272 -205 302 -190 296 4 -3 49 -25 98 -51z m-1580 -150 c139 -51 294 -80 456 -85 221 -8 377 20 482 87 35 22 47 25 51 15 11 -31 78 -526 131 -970 30 -258 59 -495 64 -525 5 -30 7 -58 4 -62 -2 -5 -19 -8 -36 -8 -45 0 -170 -36 -233 -67 -68 -33 -144 -100 -184 -163 l-33 -52 -47 124 c-189 493 -505 1162 -795 1683 -25 44 -45 83 -45 87 0 4 24 -2 53 -14 28 -12 88 -34 132 -50z m-1665 -275 c250 -121 433 -407 506 -788 27 -142 23 -361 -9 -501 -83 -361 -311 -569 -658 -599 l-74 -6 40 33 c152 124 262 318 312 548 28 132 25 420 -6 558 -49 218 -140 403 -264 537 -71 78 -181 158 -260 191 -26 10 -47 22 -47 25 0 6 28 13 160 39 25 5 83 8 130 6 77 -2 94 -6 170 -43z m4169 -33 c198 -140 336 -434 358 -765 20 -308 -113 -623 -321 -757 -75 -48 -86 -48 -86 0 0 30 7 45 31 68 80 76 170 255 205 409 29 123 27 385 -4 524 -29 128 -61 220 -117 331 -40 80 -128 211 -147 218 -11 5 -11 22 0 22 5 0 41 -23 81 -50z m-97 -148 c138 -212 195 -423 185 -692 -7 -186 -39 -308 -112 -420 l-30 -45 -7 135 c-4 74 -12 234 -18 355 -15 288 -55 632 -86 738 -12 39 14 12 68 -71z m-4511 30 c279 -135 459 -487 459 -897 0 -274 -86 -514 -239 -665 -84 -83 -140 -116 -244 -142 -115 -29 -217 -16 -334 43 -271 136 -443 462 -443 839 0 203 31 343 113 508 82 166 202 282 350 339 52 19 77 23 157 20 88 -2 101 -6 181 -45z m4809 -1444 c0 -5 29 -220 49 -368 11 -80 57 -401 101 -715 45 -313 87 -613 94 -665 7 -52 10 -103 7 -112 -10 -28 -127 -107 -194 -133 -70 -26 -245 -70 -252 -64 -5 6 -55 1705 -55 1896 0 28 5 33 38 44 55 17 149 70 174 96 18 19 38 30 38 21z m-3950 -192 c-32 -82 -81 -176 -92 -176 -5 0 -8 29 -8 65 l0 66 58 63 c31 34 60 61 64 59 3 -2 -7 -36 -22 -77z m-1480 18 c59 -60 156 -128 233 -164 234 -109 667 -116 945 -15 40 14 76 24 80 21 4 -2 0 -105 -10 -228 -10 -123 -29 -376 -43 -563 -41 -560 -84 -1108 -91 -1148 -7 -45 -36 -60 -164 -85 -125 -24 -497 -23 -600 2 -41 10 -112 21 -157 25 -74 7 -96 14 -207 70 -148 73 -187 109 -180 168 2 21 13 178 24 348 39 609 61 935 85 1259 14 181 25 335 25 343 0 22 14 15 60 -33z m5509 -2021 c41 -156 42 -162 17 -178 -37 -24 -163 -64 -226 -71 l-60 -7 0 136 0 135 92 22 c51 12 102 26 113 31 37 15 43 9 64 -68z m155 46 c64 -51 119 -164 137 -282 9 -59 8 -85 -5 -141 -15 -63 -71 -175 -88 -176 -5 0 -8 22 -8 48 0 88 -21 265 -47 392 -36 174 -36 180 -25 180 5 0 21 -9 36 -21z m-4409 -343 c28 -198 32 -307 15 -381 -21 -90 -92 -295 -100 -290 -4 2 -10 31 -14 62 -4 32 -13 83 -21 113 -8 30 -15 87 -15 127 0 87 -34 270 -62 335 -22 52 -19 78 9 78 29 1 103 38 123 62 11 13 22 36 25 51 4 16 9 27 11 25 2 -2 15 -84 29 -182z m-998 29 c106 -31 192 -131 237 -273 76 -243 4 -521 -161 -623 -194 -120 -439 106 -460 422 -14 211 88 422 227 469 67 24 92 24 157 5z m5317 -77 c3 -40 7 -124 8 -187 1 -97 -1 -115 -16 -126 -17 -13 -185 -57 -262 -70 l-41 -6 -6 113 c-4 62 -7 148 -7 190 l0 77 38 7 c71 12 157 33 212 52 30 11 58 20 61 21 4 0 9 -32 13 -71z m-4626 -32 c41 -111 52 -179 52 -308 0 -128 -30 -269 -65 -304 -17 -17 -39 -23 -111 -28 -49 -4 -120 -13 -159 -21 -38 -7 -71 -12 -73 -10 -1 1 7 36 18 76 58 202 37 423 -56 599 -19 35 -34 67 -34 70 0 3 90 6 199 7 l200 2 29 -83z"/> <path d="M2440 9173 c-66 -35 -117 -98 -149 -186 -32 -85 -40 -244 -17 -341 66 -280 302 -385 471 -209 72 75 115 256 96 404 -19 142 -77 255 -164 317 -40 29 -59 35 -115 39 -60 4 -73 2 -122 -24z m195 -135 c100 -101 123 -307 53 -469 -37 -88 -125 -124 -191 -80 -91 60 -146 252 -112 397 30 128 85 194 163 194 39 0 50 -5 87 -42z"/> </g> </svg>`;
        case 'suit-man': return `<svg xmlns="http://www.w3.org/2000/svg"  width="720.000000pt" height="1280.000000pt" viewBox="0 0 720.000000 1280.000000"  preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none"> <path d="M3650 11779 c-429 -49 -815 -240 -1037 -511 -30 -38 -59 -68 -63 -68 -19 0 -171 -156 -218 -223 -337 -488 -383 -1254 -116 -1972 103 -278 203 -478 529 -1060 37 -66 72 -126 77 -133 13 -15 5 -142 -28 -437 -13 -121 -24 -227 -24 -237 0 -11 -12 -18 -41 -23 -65 -11 -93 -46 -150 -185 -28 -69 -53 -132 -56 -141 -2 -9 -22 -21 -42 -28 -21 -6 -51 -21 -66 -33 -38 -30 -260 -366 -307 -465 -41 -88 -36 -83 -323 -328 -641 -548 -835 -732 -945 -895 -162 -241 -262 -543 -310 -932 -41 -338 -43 -443 -47 -2058 -4 -1420 -3 -1574 12 -1660 18 -103 45 -216 76 -322 l20 -68 79 0 c44 0 80 2 80 4 0 2 -18 70 -40 151 -86 318 -80 201 -80 1685 1 1556 9 1891 61 2275 49 363 127 600 275 825 98 150 201 254 569 570 127 110 314 271 494 427 58 51 110 88 114 84 8 -8 64 -141 269 -641 49 -120 90 -205 106 -222 30 -30 82 -47 403 -128 114 -29 212 -56 219 -60 9 -6 -16 -62 -90 -208 -93 -183 -102 -205 -97 -242 3 -23 17 -55 31 -73 72 -89 504 -667 575 -770 557 -801 892 -1500 1186 -2473 l64 -211 11 -219 c6 -121 17 -343 23 -494 l12 -275 79 -3 79 -3 -6 148 c-46 1052 -54 1189 -93 1573 -92 928 -185 1380 -395 1925 -138 358 -367 829 -612 1255 -52 91 -93 167 -91 169 2 2 29 -19 61 -46 133 -113 153 -125 207 -120 36 3 54 10 66 27 14 18 168 470 261 765 l13 40 6 -30 c14 -60 61 -283 84 -400 27 -132 48 -165 106 -165 43 0 74 36 106 119 l28 74 28 -63 c16 -35 63 -154 104 -264 190 -502 354 -1047 452 -1496 122 -556 162 -892 232 -1920 11 -162 22 -313 25 -335 7 -52 30 -388 55 -805 11 -184 23 -361 26 -392 l6 -58 74 0 74 0 0 48 c0 26 -11 218 -25 427 -13 209 -32 504 -42 656 l-17 276 32 264 c31 258 58 512 84 794 18 190 17 895 0 1075 -33 338 -114 828 -172 1051 -16 57 -76 76 -124 38 -35 -27 -34 -49 9 -255 79 -375 128 -741 147 -1079 10 -181 9 -283 -1 -518 -11 -245 -35 -557 -40 -522 0 6 -8 84 -16 175 -73 799 -248 1562 -565 2455 -51 145 -67 201 -58 204 31 10 68 60 68 92 0 18 -14 149 -31 292 -16 142 -28 262 -25 264 7 8 201 -146 299 -236 268 -247 423 -528 501 -911 34 -169 80 -490 116 -810 90 -815 104 -946 200 -1935 50 -515 77 -704 155 -1115 67 -348 135 -712 135 -721 0 -5 36 -9 81 -9 l81 0 -7 43 c-4 23 -23 123 -42 222 -45 233 -49 255 -127 680 -60 331 -70 402 -116 880 -116 1197 -213 2088 -266 2455 -64 449 -105 602 -226 845 -124 248 -290 436 -620 698 -108 86 -205 168 -215 182 -10 15 -41 54 -68 88 -28 34 -60 74 -70 88 -11 15 -68 86 -127 157 -60 73 -108 140 -108 152 0 26 61 424 66 429 2 2 50 -6 106 -17 196 -39 324 -35 471 17 134 47 260 155 332 285 124 223 262 897 315 1541 54 655 27 1100 -92 1533 l-32 113 22 87 c36 144 45 233 39 369 -8 195 -53 324 -144 417 -54 54 -82 71 -156 93 -27 8 -167 62 -311 120 -464 188 -708 258 -1029 298 -132 16 -441 18 -567 4z m651 -173 c264 -45 488 -113 829 -251 113 -46 263 -105 334 -132 124 -46 131 -50 162 -96 39 -56 60 -123 75 -234 11 -80 5 -233 -10 -233 -4 0 -25 37 -46 82 -52 106 -87 148 -127 148 -17 0 -69 -16 -117 -35 -247 -98 -420 -102 -993 -21 -593 84 -553 80 -595 59 -67 -32 -68 -41 -54 -289 7 -121 14 -240 16 -267 3 -26 0 -57 -4 -70 -5 -12 -80 -96 -168 -186 -183 -190 -200 -213 -213 -283 -9 -49 -30 -406 -30 -504 0 -24 -3 -44 -7 -44 -5 1 -35 37 -67 81 -217 296 -598 291 -776 -11 -53 -89 -74 -197 -67 -339 3 -58 8 -117 12 -131 11 -45 -46 83 -92 205 -97 262 -152 530 -160 790 -14 406 72 762 245 1025 44 66 101 127 207 221 17 15 58 59 93 97 117 133 342 280 528 346 139 49 321 88 469 100 131 10 413 -4 556 -28z m44 -922 c558 -80 764 -84 993 -18 46 14 96 31 111 39 27 14 28 13 49 -24 74 -131 177 -418 217 -605 65 -300 79 -476 72 -869 -11 -600 -97 -1221 -239 -1717 -44 -155 -90 -244 -162 -316 -169 -168 -423 -186 -781 -56 -206 75 -562 243 -675 319 -68 45 -140 19 -140 -51 0 -19 8 -43 18 -55 37 -44 534 -288 694 -340 33 -11 37 -16 33 -39 -3 -15 -12 -76 -20 -137 -36 -271 -112 -755 -119 -762 -25 -25 -598 280 -937 498 -217 139 -447 305 -551 398 -4 3 2 71 13 151 28 210 56 507 69 725 5 105 13 231 16 281 l6 92 96 0 c161 0 242 38 242 113 0 29 -6 42 -26 58 -33 26 -50 26 -105 1 -82 -37 -202 -21 -304 41 -253 153 -393 565 -277 813 33 69 69 109 125 137 59 30 121 38 188 25 88 -19 147 -64 236 -184 43 -58 90 -110 107 -119 17 -9 54 -16 83 -17 42 0 57 4 78 24 49 45 52 63 64 310 6 129 14 270 17 312 l7 77 72 80 c40 45 117 126 171 181 55 55 110 119 122 143 23 41 24 47 18 212 -3 94 -9 209 -12 256 l-7 87 24 -4 c13 -2 200 -29 414 -60z m-1611 -2334 c31 -27 69 -56 86 -65 30 -15 30 -16 30 -100 0 -47 -4 -85 -8 -85 -4 0 -32 46 -62 103 -29 56 -66 123 -82 150 -15 26 -25 47 -23 47 3 0 29 -22 59 -50z m132 -1566 c70 -58 186 -147 258 -198 294 -208 791 -501 1066 -627 63 -29 116 -54 118 -55 6 -3 -257 -814 -264 -814 -3 0 -71 57 -152 126 -81 70 -202 174 -269 232 -90 77 -143 133 -205 215 -46 60 -103 136 -128 168 -130 166 -172 220 -226 285 -32 39 -86 104 -119 145 -33 40 -100 120 -150 179 -49 58 -107 126 -127 151 l-38 46 52 127 c28 69 53 126 54 126 2 0 60 -48 130 -106z m-184 -456 c588 -701 780 -968 1113 -1553 126 -221 336 -626 411 -791 286 -637 402 -1049 494 -1764 27 -209 61 -511 60 -529 -1 -3 -23 53 -49 124 -124 334 -195 501 -331 782 -285 586 -623 1110 -1176 1823 -28 36 -59 78 -69 93 l-19 29 114 223 c113 221 114 222 102 262 -6 22 -20 47 -29 55 -10 9 -124 44 -253 77 -348 90 -410 107 -421 118 -5 5 -42 88 -81 184 -38 96 -80 199 -93 229 -65 158 -193 478 -199 495 -4 15 15 54 70 140 42 66 93 146 113 177 20 32 39 58 42 58 3 0 94 -105 201 -232z m2042 -225 l118 -146 -30 -76 c-52 -129 -162 -394 -166 -398 -4 -5 -22 74 -66 290 l-33 158 23 160 c13 87 26 159 30 159 3 0 59 -66 124 -147z m205 -723 c1 -18 -12 -2 -44 55 -24 44 -45 85 -45 91 0 6 12 38 27 70 l26 59 18 -125 c10 -69 18 -136 18 -150z"/> <path d="M2473 3258 c-12 -6 -26 -22 -31 -37 -6 -14 -27 -231 -47 -481 -52 -649 -137 -1634 -163 -1880 -7 -64 -8 -66 -53 -96 -26 -17 -105 -52 -175 -78 -324 -118 -365 -137 -380 -172 -17 -40 -6 -76 31 -100 29 -19 24 -20 273 75 74 28 140 51 147 51 35 0 130 -183 210 -402 l50 -138 83 0 c45 0 82 2 82 4 0 31 -172 454 -221 542 l-39 72 30 12 c35 14 77 61 96 105 17 42 52 392 119 1195 96 1153 105 1270 95 1295 -9 24 -46 46 -73 44 -7 0 -22 -5 -34 -11z"/> </g> </svg>`;
        case 'suit-woman': return `<svg xmlns="http://www.w3.org/2000/svg"  width="720.000000pt" height="1280.000000pt" viewBox="0 0 720.000000 1280.000000"  preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,1280.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none"> <path d="M3930 11824 c-354 -27 -662 -105 -923 -235 -617 -305 -999 -871 -1142 -1688 -23 -135 -52 -371 -90 -741 -37 -358 -67 -541 -126 -755 -46 -167 -90 -290 -237 -660 -106 -268 -152 -449 -172 -679 -18 -202 16 -432 89 -607 80 -191 251 -393 409 -479 45 -25 82 -48 82 -52 0 -7 -115 -100 -301 -243 -594 -456 -622 -481 -722 -680 -144 -286 -222 -612 -269 -1125 -7 -80 -12 -452 -13 -1036 -1 -500 -4 -915 -8 -920 -3 -5 -6 -334 -7 -729 -2 -801 -3 -792 67 -1057 l36 -138 74 0 c66 0 74 2 69 18 -24 80 -70 269 -90 369 l-25 122 12 853 c6 469 12 1175 12 1568 1 460 5 774 13 880 38 517 114 854 255 1135 78 156 102 180 492 480 356 274 490 382 580 466 28 26 77 70 111 98 l61 50 87 -247 c48 -136 117 -334 153 -440 36 -106 73 -202 82 -213 13 -16 65 -30 261 -68 135 -27 270 -53 300 -58 30 -4 54 -12 53 -16 0 -5 -69 -94 -152 -199 -126 -159 -151 -195 -151 -223 0 -35 25 -67 200 -250 316 -331 779 -852 1018 -1144 350 -428 574 -740 879 -1225 117 -187 144 -220 162 -201 17 18 -18 114 -99 276 -176 352 -437 734 -825 1210 -267 328 -577 676 -1054 1186 -74 80 -131 148 -128 155 3 7 56 76 117 153 198 248 220 279 220 312 0 16 -8 37 -17 45 -12 10 -142 40 -352 80 l-335 64 -44 130 c-24 71 -94 269 -154 439 -61 171 -117 331 -125 358 l-14 48 68 83 c38 46 76 94 84 106 14 21 18 22 53 10 24 -8 71 -11 128 -8 l90 4 107 -135 c446 -566 760 -1034 1158 -1729 550 -961 725 -1329 950 -1997 143 -425 286 -936 329 -1174 21 -119 29 -509 16 -771 -7 -118 -15 -302 -18 -407 l-7 -193 65 0 66 0 6 168 c4 92 11 270 16 396 17 385 8 740 -20 869 -7 34 -3 49 35 130 127 267 276 721 355 1081 76 344 85 422 84 776 0 268 -3 340 -22 485 -48 364 -132 823 -158 863 -9 13 -78 73 -155 134 -76 60 -139 114 -139 119 0 5 20 50 45 99 25 49 45 101 45 115 0 28 -60 101 -252 307 -78 83 -128 145 -128 157 0 22 14 28 25 11 3 -5 83 -65 178 -132 95 -67 216 -153 269 -191 54 -38 118 -91 143 -119 76 -85 157 -281 200 -488 18 -85 65 -404 64 -435 l0 -20 -9 20 c-9 21 -37 111 -115 375 -55 186 -60 200 -80 200 -20 0 -20 3 15 -200 53 -316 77 -409 227 -890 173 -556 178 -577 177 -795 0 -228 -25 -359 -178 -945 -137 -523 -162 -655 -170 -925 -8 -247 7 -595 39 -905 14 -129 25 -241 25 -247 0 -9 21 -13 69 -13 l70 0 -5 32 c-2 18 -16 157 -30 308 -20 211 -27 356 -31 620 l-5 345 36 185 c33 174 169 737 181 748 3 3 5 -3 5 -14 0 -27 45 -509 70 -749 33 -325 63 -503 191 -1129 38 -187 69 -341 69 -343 0 -2 32 -3 70 -3 60 0 70 2 70 18 0 17 -11 70 -95 467 -99 469 -138 687 -160 898 -8 78 -37 367 -65 642 -27 275 -53 523 -56 551 -4 32 0 86 10 140 57 313 37 523 -84 905 -53 168 -61 210 -85 479 -35 382 -75 661 -121 830 -36 133 -108 300 -162 373 -71 98 -95 117 -442 357 -63 44 -128 90 -144 103 l-30 24 40 13 c185 59 397 237 527 442 113 178 184 398 217 668 5 47 17 247 25 445 30 712 50 835 205 1295 151 447 187 644 177 970 -8 264 -46 467 -134 729 -175 522 -426 866 -751 1031 -69 35 -182 70 -224 70 -17 0 -42 13 -65 33 -180 158 -511 288 -833 326 -99 12 -360 21 -440 15z m530 -164 c206 -36 420 -115 552 -203 26 -18 48 -34 48 -37 0 -3 -25 -18 -56 -35 -31 -16 -60 -38 -66 -49 -14 -26 3 -39 35 -27 14 6 64 15 111 21 73 10 99 9 168 -5 405 -82 732 -507 924 -1204 94 -341 101 -716 19 -1066 -15 -63 -94 -325 -99 -325 -1 0 -2 71 -2 158 -1 176 -21 311 -80 553 -20 79 -42 191 -50 249 -28 207 -96 472 -163 631 -17 40 -29 74 -27 76 2 2 27 -31 55 -72 51 -74 126 -221 150 -297 7 -21 17 -38 22 -38 15 0 10 61 -10 141 -75 288 -267 525 -544 669 -166 87 -359 129 -533 117 -80 -6 -84 -5 -74 13 14 25 121 107 165 126 35 14 47 33 23 35 -72 6 -153 -36 -233 -124 -76 -82 -99 -120 -91 -152 8 -31 29 -34 138 -22 175 20 385 -18 531 -96 128 -68 142 -83 223 -252 119 -246 186 -453 224 -690 27 -164 24 -314 -10 -530 -23 -153 -24 -213 -9 -437 18 -244 -8 -472 -80 -708 -73 -241 -97 -311 -185 -545 -82 -217 -144 -339 -210 -411 -48 -54 -64 -64 -126 -84 -61 -20 -84 -22 -168 -17 -303 18 -706 168 -1092 405 -61 38 -120 19 -120 -38 0 -39 35 -69 163 -144 182 -105 283 -153 532 -253 28 -11 49 -25 47 -32 -75 -345 -131 -757 -148 -1083 l-7 -138 -34 30 c-19 17 -109 80 -200 141 -143 95 -257 173 -457 313 -103 72 -217 155 -282 206 -205 160 -282 221 -312 249 l-33 30 27 43 c195 308 212 804 49 1440 -6 25 -4 27 32 33 102 18 153 49 153 96 0 68 -44 87 -123 54 -152 -63 -366 88 -497 350 -66 132 -90 229 -90 362 0 87 4 113 25 165 43 106 117 161 214 161 77 0 128 -28 231 -127 106 -102 161 -131 235 -123 29 3 67 13 85 22 81 42 168 173 201 304 8 33 21 58 34 66 11 6 58 33 105 60 374 210 707 596 837 970 69 198 87 300 57 329 -37 38 -79 11 -99 -62 -32 -116 -89 -270 -133 -357 -210 -422 -615 -780 -1020 -902 -92 -27 -179 -32 -427 -23 -83 3 -123 0 -161 -12 -155 -49 -243 -130 -296 -273 -19 -52 -22 -80 -22 -205 1 -128 4 -156 28 -235 73 -245 256 -488 438 -581 51 -26 46 -16 83 -161 8 -34 26 -120 40 -191 92 -488 64 -832 -86 -1085 -130 -219 -413 -367 -559 -292 -40 21 -67 55 -100 128 -41 92 -61 181 -69 315 -3 63 -10 113 -16 113 -18 2 -36 -74 -42 -176 -7 -124 13 -233 62 -342 30 -64 33 -79 22 -92 -7 -9 -42 -50 -79 -91 -88 -101 -118 -147 -118 -183 0 -23 -13 -41 -66 -91 -101 -93 -101 -92 -131 -65 -37 35 -79 99 -124 188 -53 106 -66 145 -104 296 -22 91 -36 130 -46 130 -11 0 -14 -23 -13 -125 0 -134 17 -220 60 -319 13 -29 24 -58 24 -64 0 -21 -121 108 -167 178 -140 211 -198 454 -173 721 23 246 70 410 240 834 167 417 230 675 280 1135 11 105 30 273 41 375 46 430 100 711 175 923 44 126 108 271 158 362 311 568 804 888 1521 990 153 21 513 14 675 -15z m-956 -2232 c-55 -110 -98 -148 -167 -148 -40 0 -80 29 -156 112 l-51 55 118 6 c68 3 146 14 187 25 113 31 111 33 69 -50z m2510 -356 c29 -189 19 -436 -25 -642 -49 -227 -59 -282 -73 -395 -21 -166 -34 -346 -46 -645 -12 -315 -17 -386 -36 -525 -28 -201 -76 -355 -156 -500 -42 -75 -86 -136 -72 -100 86 234 113 344 121 496 6 116 1 169 -16 169 -5 0 -15 -33 -21 -72 -15 -89 -52 -236 -86 -343 -63 -194 -238 -493 -324 -555 -50 -36 -140 -70 -185 -69 -30 0 -48 7 -73 30 l-33 30 43 48 c134 149 258 420 258 564 0 60 -19 41 -59 -59 -64 -157 -179 -340 -269 -428 l-40 -38 -41 53 c-23 30 -93 122 -156 204 l-115 150 5 50 c9 83 75 427 84 437 3 4 30 0 60 -8 30 -7 107 -21 170 -30 307 -43 472 38 605 296 142 274 333 846 387 1160 13 77 18 356 9 600 -4 120 11 314 27 360 7 19 38 -106 57 -238z m-2952 -2511 c177 -152 559 -434 875 -647 120 -81 222 -151 227 -155 5 -4 2 -22 -7 -41 -22 -49 -105 -275 -182 -501 l-68 -198 -123 122 c-139 139 -139 138 -275 348 -88 134 -154 228 -281 401 -18 25 -69 95 -114 157 -45 61 -134 177 -198 257 -64 79 -116 147 -116 150 0 2 30 25 68 49 37 25 80 59 96 76 17 17 32 31 35 31 3 0 32 -22 63 -49z m1677 -498 c80 -107 152 -212 162 -232 12 -25 24 -110 39 -279 12 -134 21 -245 19 -247 -3 -2 -35 48 -72 110 l-68 114 30 89 c43 123 39 172 -10 172 -39 0 -109 -138 -215 -423 -51 -138 -60 -155 -69 -135 -15 33 -12 663 3 818 17 167 23 210 31 210 3 0 71 -89 150 -197z m-431 -415 c11 -18 23 -49 27 -68 32 -155 158 -565 218 -710 32 -78 118 -235 142 -259 18 -18 49 -6 42 17 -2 9 -29 99 -60 199 l-55 181 35 99 c81 230 99 275 108 275 30 1 290 -734 416 -1173 189 -663 227 -973 184 -1506 -22 -272 -104 -875 -121 -892 -5 -5 -3 -8 -53 184 -103 394 -262 860 -433 1265 -114 269 -394 806 -651 1250 -124 213 -207 359 -207 363 0 2 15 1 33 -1 23 -3 38 2 51 16 16 19 88 218 223 620 32 94 63 172 69 172 7 0 21 -15 32 -32z m882 -250 c63 -82 116 -154 118 -159 2 -5 -19 -48 -47 -96 -65 -113 -71 -140 -38 -179 14 -17 88 -77 163 -135 76 -57 143 -108 151 -114 21 -16 103 -478 147 -835 37 -292 39 -641 5 -860 -47 -308 -115 -599 -214 -920 -93 -301 -109 -336 -80 -170 73 418 108 777 109 1120 0 275 -9 380 -55 620 -54 277 -198 784 -335 1176 -36 104 -68 196 -71 206 -3 10 3 18 17 23 37 12 41 44 25 228 -8 95 -17 189 -21 210 -3 20 -2 37 3 36 4 0 60 -68 123 -151z"/> <path d="M1350 5203 c0 -5 40 -27 88 -50 288 -140 521 -436 718 -910 19 -47 73 -198 120 -336 86 -256 100 -289 115 -265 10 16 4 61 -27 208 -94 437 -310 876 -548 1116 -114 115 -193 170 -307 214 -72 28 -159 40 -159 23z"/> <path d="M2452 3268 c-5 -7 -17 -78 -27 -158 -9 -80 -43 -356 -75 -615 -32 -258 -66 -537 -74 -620 -41 -399 -115 -1020 -136 -1150 -18 -111 -13 -145 43 -292 29 -76 75 -204 102 -285 l49 -148 77 0 77 0 -25 82 -25 83 22 60 c19 53 39 117 94 310 49 168 91 415 83 488 -4 47 -49 222 -122 482 -14 50 -43 160 -65 245 l-41 154 15 121 c49 387 99 877 112 1091 8 138 1 164 -45 164 -16 0 -33 -6 -39 -12z m-67 -1810 c4 -18 32 -125 62 -238 63 -235 63 -232 13 -474 -27 -128 -97 -373 -104 -364 -9 9 -79 193 -86 222 -4 18 -1 72 6 122 21 135 84 686 84 727 0 46 16 48 25 5z"/> <path d="M4929 1231 c-145 -29 -231 -215 -165 -357 52 -111 170 -161 271 -115 108 48 168 170 145 291 -23 123 -134 203 -251 181z m108 -107 c107 -69 64 -266 -62 -290 -103 -19 -174 96 -130 211 33 89 121 125 192 79z"/> <path d="M1782 602 c-79 -43 -158 -90 -175 -104 -29 -23 -31 -28 -22 -54 17 -47 52 -43 158 15 113 63 227 140 241 164 15 23 -3 51 -35 55 -15 1 -78 -27 -167 -76z"/> </g> </svg> `;
      }
    }

    const svgString = _getSVGString(color);
    const bytes = new TextEncoder().encode(svgString);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    const base64 = btoa(binary);
    return `data:image/svg+xml;base64,${base64}`;
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