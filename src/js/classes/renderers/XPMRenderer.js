import { YarbpBasicRenderer } from "../YarbpBasicRenderer.js";
import { YarbpXPMConverter } from "../ast-converters/XPMConverter.js";

export class XPMRenderer extends YarbpBasicRenderer {
  constructor(...args) {
    super(...args);
    this.uiContainer = null;
  }

  static DEFAULTS = Object.freeze({
    SVG_NS: 'http://www.w3.org/2000/svg',
    DOT_RADIUS: 10,
    CONNECTION_RADIUS_MULTIPLIER: 1.5,
    DOT_BASE_X: 130,
    DOT_BASE_Y: 150,
    TEXT_OFFSET_X: 30,
    TEXT_OFFSET_Y: 30,
    TITLE_FONT_SIZE: 16,
    LIST_FONT_SIZE: 12,
    LIST_LINE_HEIGHT: 16,
    TITLE_LINE_SPACING: 18,
    SHORT_LINE_LEN: 20,
    IN_ARROW_OFFSET: 8,
    LINE_Y: 42.5,
    VERTICAL_LINE_X_OFFSET: 40,
    IMAGE_HEIGHT: 80,
    DEFAULT_TILE_SIZE: 40,
    DIAMOND_RADIUS_FACTOR: 1.2,
    STROKE_WIDTH: 2,
    FONT_FAMILY: 'Arial',
    ROLE_NAME_FONT_SIZE: 12,
    ROLE_NAME_OFFSET_X: 5,
    ROLE_NAME_MAX_WIDTH: 200
  });

  static getColor(colorType='main') {
    const isDark = document.body.classList.contains('dark');
    switch (colorType) {
      case 'main': return isDark ? '#dbe5e7' : '#335272';
      case 'ide-code-val': return isDark ? '#c3cdd0' : '#335272';
    }

  }

  render() {
    this.AST = this.parser.getAST();

    const isDark = document.body.classList.contains('dark');

    this.renderer = new YarbpXPMConverter(this.AST);
    let markup = this.renderer.convert();
    let svg = this.composeTiles(markup.tiles).svg;

    const HTML = `<div>${new XMLSerializer().serializeToString(svg)}</div>`

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
      padding: 10px 20px 10px 20px;
      overflow-y: auto;
      height: 100%;
      box-sizing: border-box;
      background: ${isDark ? '#2d2d2d' : '#ffffff'};
      color: ${isDark ? '#e0e0e0' : '#111827'};
      font-family: system-ui, sans-serif;
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
        markerWidth: '6',
        markerHeight: '6',
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
        markerWidth: '6',
        markerHeight: '6',
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
          fill: 'white',
          stroke: XPMRenderer.getColor(),
          'stroke-width': XPMRenderer.DEFAULTS.STROKE_WIDTH
        }));
        break;
      case 'diamond': {
        const half = dotRadius * XPMRenderer.DEFAULTS.DIAMOND_RADIUS_FACTOR;
        const points = `${dotX},${dotY - half} ${dotX + half},${dotY} ${dotX},${dotY + half} ${dotX - half},${dotY}`;
        g.appendChild(XPMRenderer.createSvgElement('polygon', {
          points,
          fill: 'white',
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
    const inOffset = XPMRenderer.DEFAULTS.IN_ARROW_OFFSET;

    let x1, y1, x2, y2;

    switch (arrowType) {
      case 'right':
        x1 = pts.right.x - (bypassEnabled ? 0 : inOffset);
        y1 = pts.right.y;
        x2 = tileWidth;
        y2 = y1;
        break;
      case 'down':
        x1 = pts.bottom.x;
        y1 = pts.bottom.y - (bypassEnabled ? 0 : inOffset);
        x2 = x1;
        y2 = tileHeight;
        break;
      case 'left':
        x2 = pts.left.x + (bypassEnabled ? 0 : inOffset);
        y2 = pts.left.y;
        x1 = x2 - shortLen - (bypassEnabled ? 0 : inOffset);
        y1 = y2;
        break;
      case 'top':
        x2 = pts.top.x;
        y2 = pts.top.y + (bypassEnabled ? 0 : inOffset);
        x1 = x2;
        y1 = y2 - shortLen - (bypassEnabled ? 0 : inOffset);
        break;
    }

    const line = XPMRenderer.createSvgElement('line', {
      x1, y1, x2, y2,
      stroke: XPMRenderer.getColor(),
      'stroke-width': XPMRenderer.DEFAULTS.STROKE_WIDTH,
      opacity: show ? 1 : 0
    });

    if (style === 'dashed') {
      line.setAttribute('stroke-dasharray', '8,4');
    } else if (style === 'dotted') {
      line.setAttribute('stroke-dasharray', '2,3');
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
      path.setAttribute('stroke-dasharray', '8,4');
    } else if (style === 'dotted') {
      path.setAttribute('stroke-dasharray', '2,3');
    }

    return path;
  }

  drawSimpleLine(x1, y1, x2, y2, style) {
    const line = XPMRenderer.createSvgElement('line', {
      x1, y1, x2, y2,
      stroke: XPMRenderer.getColor(),
      'stroke-width': XPMRenderer.DEFAULTS.STROKE_WIDTH
    });
    if (style === 'dashed') line.setAttribute('stroke-dasharray', '8,4');
    else if (style === 'dotted') line.setAttribute('stroke-dasharray', '2,3');
    return line;
  }

  /* endregion ========================================================== */

  /* region Рендер элементов ============================================ */

  tileRenderers = {
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
        // Возвращает только статические элементы (без right/down)
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
        // Статические стрелки: left, top
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

        // Все четыре стрелки
        ['right', 'down', 'left', 'top'].forEach(type => {
          const arrowCfg = arrows[type] || {
            show: false,
            style: 'solid',
            hasMarker: false,
            hasInMarker: false
          };
          group.appendChild(XPMRenderer.drawArrow(type, arrowCfg, connectionPoints, bypassEnabled, effectiveWidth, effectiveHeight));
        });

        // Обходная дуга
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

        if (hLine?.show !== false) {
          group.appendChild(
            this.drawSimpleLine(
              0, XPMRenderer.DEFAULTS.LINE_Y, cellWidth, XPMRenderer.DEFAULTS.LINE_Y, hLine?.style || 'solid'));
        }
        if (vLine?.show !== false) {
          const x = cellWidth - XPMRenderer.DEFAULTS.VERTICAL_LINE_X_OFFSET;
          group.appendChild(this.drawSimpleLine(x, 0, x, cellHeight, vLine?.style || 'solid'));
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

    /**
   * Создаёт SVG с сообщением об ошибке
   * @param {string} errorMessage - Текст ошибки
   * @param {number} width - Ширина SVG
   * @param {number} height - Высота SVG
   * @returns {SVGSVGElement} SVG элемент с ошибкой
   */
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
      'font-size': 14,
      fill: XPMRenderer.getColor('ide-code-val')
    });

    const lines = errorMessage.split('\n');
    const lineHeight = 20;
    const emojiOffset = 24; // ширина эмодзи + пробел

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
      return {svg: this.createErrorSvg(
        `Синтаксическая ошибка:\nнеизвестный тэг.`, 400, 400),
        totalWidth: 400, totalHeight: 400};
    }

    // 1. Измеряем все тайлы
    this.createHiddenSVGContainer();
    const measured = tiles.map(tile => {
      const renderer = this.tileRenderers[tile.config.tileType || 'lines'];
      const m = renderer.measure(tile.config);
      return {
        ...m, gridX: tile.grid.x, gridY: tile.grid.y, config: tile.config
      };
    });

    // 2. Вычисляем максимальные размеры по колонкам и строкам
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

    // 3. Создаём итоговый SVG с маркерами
    const composedSvg = XPMRenderer.createSvgElement('svg', {
      width: totalWidth,
      height: totalHeight,
      viewBox: `0 0 ${totalWidth} ${totalHeight}`
    });
    composedSvg.appendChild(this.getMarkersDefs().cloneNode(true));

    // 4. Рендерим каждый тайл и помещаем в общий SVG
    tiles.forEach(tile => {
      const renderer = this.tileRenderers[tile.config.tileType || 'point'];
      const cellWidth = colMaxWidth[tile.grid.x];
      const cellHeight = rowMaxHeight[tile.grid.y];
      const {
        group, minWidth, minHeight
      } = renderer.render(tile.config, cellWidth, cellHeight);

      // Добавляем информацию о минимальных размерах (для отладки)
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