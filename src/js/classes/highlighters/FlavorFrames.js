// Рамки директив (`! …`) в слое подсветки.

const FRAMES_CLASS = 'flavor-frames';
const FRAMES_SVG_CLASS = 'flavor-frame-svg';
const FRAME_CLASS = 'flavor-frame';
const FLAVOR_SELECTOR = '.flavor';
const SVG_NS = 'http://www.w3.org/2000/svg';

const EPSILON = 0.01;

// Горизонтальный зазор между текстом и линией рамки, в px.
const FRAME_PADDING_X = 2;

const CORNER_RADIUS = 5;

function textBetween(first, second, range) {
  range.setStartAfter(first);
  range.setEndBefore(second);
  return range.toString();
}

// Фрагменты принадлежат одной группе, если между ними нет перевода строки (директива разрезана ссылкой или…
function sameGroup(first, second, range) {
  const gap = textBetween(first, second, range);
  const lineBreak = gap.indexOf('\n');

  if (lineBreak === -1) return true;
  if (gap.indexOf('\n', lineBreak + 1) !== -1) return false;
  return gap.trim() === '';
}

export function groupFlavorSpans(spans, range) {
  const groups = [];
  let current = null;
  let previous = null;

  for (const span of spans) {
    if (current && sameGroup(previous, span, range)) {
      current.push(span);
    } else {
      current = [span];
      groups.push(current);
    }
    previous = span;
  }

  return groups;
}

/** Уникальные значения по возрастанию: сетка контура из границ прямоугольников. */
function uniqueSorted(values) {
  return values
    .slice()
    .sort((first, second) => first - second)
    .filter((value, index, sorted) =>
      index === 0 || value - sorted[index - 1] > EPSILON);
}

function aligned(first, second, third) {
  const sameX = Math.abs(first[0] - second[0]) < EPSILON &&
    Math.abs(second[0] - third[0]) < EPSILON;
  const sameY = Math.abs(first[1] - second[1]) < EPSILON &&
    Math.abs(second[1] - third[1]) < EPSILON;
  return sameX || sameY;
}

// Контуры объединения прямоугольников в координатах слоя.
export function unionOutlines(rects) {
  const xs = uniqueSorted(rects.flatMap(rect => [rect.left, rect.right]));
  const ys = uniqueSorted(rects.flatMap(rect => [rect.top, rect.bottom]));
  const columns = xs.length - 1;
  const rows = ys.length - 1;
  if (columns < 1 || rows < 1) return [];

  const covered = (column, row) => {
    if (column < 0 || row < 0 || column >= columns || row >= rows) return false;
    const left = xs[column];
    const right = xs[column + 1];
    const top = ys[row];
    const bottom = ys[row + 1];
    return rects.some(rect =>
      rect.left <= left + EPSILON && rect.right >= right - EPSILON &&
      rect.top <= top + EPSILON && rect.bottom >= bottom - EPSILON);
  };

  /* Обход ячеек по часовой стрелке: внутренность остаётся справа, поэтому
     соседние ячейки дают общие рёбра в противоположных направлениях, а на
     границе объединения — одно ребро. */
  const edges = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (!covered(column, row)) continue;
      const left = xs[column];
      const right = xs[column + 1];
      const top = ys[row];
      const bottom = ys[row + 1];
      if (!covered(column, row - 1)) edges.push([left, top, right, top]);
      if (!covered(column + 1, row)) edges.push([right, top, right, bottom]);
      if (!covered(column, row + 1)) edges.push([right, bottom, left, bottom]);
      if (!covered(column - 1, row)) edges.push([left, bottom, left, top]);
    }
  }

  return chainEdges(edges).map(dropCollinearPoints);
}

function pointKey(x, y) {
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

function chainEdges(edges) {
  const byStart = new Map();
  for (let index = 0; index < edges.length; index++) {
    const key = pointKey(edges[index][0], edges[index][1]);
    const list = byStart.get(key);
    if (list) list.push(index);
    else byStart.set(key, [index]);
  }

  const used = new Array(edges.length).fill(false);
  const outlines = [];

  for (let start = 0; start < edges.length; start++) {
    if (used[start]) continue;

    const points = [];
    const firstKey = pointKey(edges[start][0], edges[start][1]);
    let current = start;

    while (current !== -1) {
      used[current] = true;
      const edge = edges[current];
      points.push([edge[0], edge[1]]);

      const nextKey = pointKey(edge[2], edge[3]);
      if (nextKey === firstKey) break;

      const candidates = byStart.get(nextKey) || [];
      current = candidates.find(index => !used[index]) ?? -1;
    }

    if (points.length > 2) outlines.push(points);
  }

  return outlines;
}

/**
 * Убирает точки, лежащие на прямой между соседями: сетка режет сторону на
 * отрезки по каждой чужой границе, а в `d` нужны только повороты.
 */
function dropCollinearPoints(points) {
  const result = [];
  for (const point of points) {
    while (result.length >= 2 &&
           aligned(result[result.length - 2], result[result.length - 1], point)) {
      result.pop();
    }
    result.push(point);
  }

  /* Контур замкнут: последняя точка может лежать на прямой между предпоследней
     и первой — тогда она тоже лишняя. Проверять «первая и последняя на одной
     оси» нельзя: у прямоугольника это как раз соседние по стороне вершины. */
  while (result.length >= 3 &&
         aligned(result[result.length - 2], result[result.length - 1], result[0])) {
    result.pop();
  }

  return result;
}

function length(first, second) {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

// Команды обхода контура со скруглёнными углами.
function roundedContour(points) {
  const round = value => Math.round(value * 100) / 100;
  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const toPrevious = length(previous, point);
    const toNext = length(point, next);
    const radius = Math.min(CORNER_RADIUS, toPrevious / 2, toNext / 2);
    if (!(radius > EPSILON)) return { entry: point, exit: point, radius: 0, sweep: 1 };

    // Точки входа и выхода стоят на рёбрах по обе стороны угла: radius > 0 гарантирует, что оба ребра не вырождены.
    const entry = [
      point[0] + (previous[0] - point[0]) / toPrevious * radius,
      point[1] + (previous[1] - point[1]) / toPrevious * radius,
    ];
    const exit = [
      point[0] + (next[0] - point[0]) / toNext * radius,
      point[1] + (next[1] - point[1]) / toNext * radius,
    ];
    // Поворот направо (выпуклый угол) — `cross > 0`: ось `y` смотрит вниз, и векторное произведение рёбер меняет знак…
    const cross = (point[0] - previous[0]) * (next[1] - point[1]) -
      (point[1] - previous[1]) * (next[0] - point[0]);
    return { entry, exit, radius, sweep: cross > 0 ? 1 : 0 };
  });

  const commands = [`M${round(corners[0].exit[0])} ${round(corners[0].exit[1])}`];
  const turn = index => {
    const { entry, exit, radius, sweep } = corners[index];
    commands.push(`L${round(entry[0])} ${round(entry[1])}`);
    if (radius > EPSILON) {
      commands.push(`A${round(radius)} ${round(radius)} 0 0 ${sweep} ` +
        `${round(exit[0])} ${round(exit[1])}`);
    } else {
      commands.push(`L${round(exit[0])} ${round(exit[1])}`);
    }
  };

  for (let index = 1; index < corners.length; index++) turn(index);
  turn(0);
  commands.push('Z');
  return commands.join(' ');
}

// `d` для `<path>`: контуры идут отдельными подпутями одного элемента.
export function framePath(outlines) {
  return outlines.map(roundedContour).join(' ');
}

// Прямоугольники подложки одной группы в координатах слоя рамок.
function flavorRects(group, origin) {
  const rects = [];
  for (const span of group) {
    for (const rect of Array.from(span.getClientRects())) {
      if (!rect.width && !rect.height) continue;
      rects.push({
        left: rect.left - origin.left - FRAME_PADDING_X,
        right: rect.right - origin.left + FRAME_PADDING_X,
        top: rect.top - origin.top,
        bottom: rect.bottom - origin.top,
      });
    }
  }
  return rects;
}

// Перерисовывает рамки директив в слое подсветки.
export function drawFlavorFrames(layer) {
  if (!layer) return 0;

  for (const node of layer.querySelectorAll('.' + FRAMES_CLASS)) node.remove();

  const spans = layer.querySelectorAll(FLAVOR_SELECTOR);
  if (!spans.length) return 0;

  const doc = layer.ownerDocument;
  const gapRange = doc.createRange();

  const host = doc.createElement('div');
  host.className = FRAMES_CLASS;
  host.setAttribute('aria-hidden', 'true');
  layer.insertBefore(host, layer.firstChild);

  /* Начало координат — начало текста: слой рамок смещён на внутренние отступы
     подсветки и на желобок номеров строк, поэтому при его появлении рамки
     едут вместе с текстом (см. `.flavor-frames` в editor.css). */
  const origin = host.getBoundingClientRect();

  const frames = [];
  for (const group of groupFlavorSpans(spans, gapRange)) {
    const rects = flavorRects(group, origin);
    if (!rects.length) continue;

    const outlines = unionOutlines(rects);
    if (outlines.length) frames.push(outlines);
  }

  if (!frames.length) {
    host.remove();
    return 0;
  }

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', FRAMES_SVG_CLASS);
  svg.setAttribute('aria-hidden', 'true');

  const fragment = doc.createDocumentFragment();
  for (const outlines of frames) {
    const frame = doc.createElementNS(SVG_NS, 'path');
    frame.setAttribute('class', FRAME_CLASS);
    frame.setAttribute('d', framePath(outlines));
    fragment.appendChild(frame);
  }
  svg.appendChild(fragment);
  host.appendChild(svg);

  return frames.length;
}
