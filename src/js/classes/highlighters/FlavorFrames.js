/**
 * Рамки директив (`! …`) в слое подсветки.
 *
 * Раньше рамку рисовал `outline` на каждом `<span class="flavor">`. Строки в
 * слое идут вплотную, поэтому у соседних директив на стыке оказывались две
 * рамки: линия выглядела двойной, а скругления — надорванными.
 *
 * Здесь рамка — не стиль текста, а отдельные элементы слоя. Соседние
 * строки-директивы образуют одну группу и получают общую рамку; директива
 * через пустую строку или через обычный текст остаётся отдельной.
 *
 * Геометрия — контур подложки, а не её описанный прямоугольник. Раньше группа
 * мерилась одним `getBoundingClientRect` по всему тексту от первой директивы до
 * последней, и рамка получалась прямоугольником: у директивы из двух строк
 * разной длины справа от короткой строки оставалось пустое поле, которого нет
 * у зелёной заливки. Теперь замер берётся с каждого фрагмента подсветки
 * (`getClientRects` у каждого span — по прямоугольнику на строку), а контур
 * строится как обводка объединения этих прямоугольников. Поэтому рамка идёт
 * ровно по краю заливки: ступенькой у строк разной длины и с разрывом там, где
 * внутри директивы стоит чужая подсветка (ссылка, подстановка). Для этого
 * рамка — `<path>` в SVG, а не `<div>`: у многоугольника нет `left/width`.
 *
 * Линия отступает от текста на 2px влево и вправо (подложка начинается ровно с
 * текста, и линия по её краю прилипала к буквам), углы скругляются дугами того
 * же радиуса, что был у прежнего `border-radius`, а толщина обводки тоньше
 * прежней рамки: контур в `<path>` центрируется на линии, и 1px выглядел толще
 * `border`'а.
 *
 * Цена: один `querySelectorAll` и по одному замеру на фрагмент подсветки
 * (обычно 0–4 фрагмента на директиву) за перерисовку слоя. Документ без
 * директив не стоит ничего — работа не начинается. Классы текста (`flavor` и
 * прочие) не меняются, поэтому разметка подсветки остаётся прежней.
 */

const FRAMES_CLASS = 'flavor-frames';
const FRAMES_SVG_CLASS = 'flavor-frame-svg';
const FRAME_CLASS = 'flavor-frame';
const FLAVOR_SELECTOR = '.flavor';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Допуск сравнения координат, взятых из одних и тех же замеров, в px. */
const EPSILON = 0.01;

/**
 * Горизонтальный зазор между текстом и линией рамки, в px. Вертикальных
 * отступов нет: строки директивы идут вплотную, и зазор разорвал бы общий
 * контур на ступеньке.
 */
const FRAME_PADDING_X = 2;

/** Радиус скругления углов — как у прежнего `border-radius: 5px`. */
const CORNER_RADIUS = 5;

/**
 * Текст между двумя фрагментами подсветки. Замеров не делает — только DOM.
 */
function textBetween(first, second, range) {
  range.setStartAfter(first);
  range.setEndBefore(second);
  return range.toString();
}

/**
 * Фрагменты принадлежат одной группе, если между ними нет перевода строки
 * (директива разрезана ссылкой или подстановкой) либо есть ровно один перевод
 * строки и отступ — то есть строки соседние.
 */
function sameGroup(first, second, range) {
  const gap = textBetween(first, second, range);
  const lineBreak = gap.indexOf('\n');

  if (lineBreak === -1) return true;
  if (gap.indexOf('\n', lineBreak + 1) !== -1) return false;
  return gap.trim() === '';
}

/**
 * @param {NodeListOf<Element>|Element[]} spans - фрагменты подсветки по порядку
 * @param {Range} range - переиспользуемый Range: создание объекта на каждую
 *   пару фрагментов дороже самого замера
 * @returns {Element[][]} группы фрагментов, каждая — одна рамка
 */
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

/** Три точки лежат на одной горизонтали или на одной вертикали. */
function aligned(first, second, third) {
  const sameX = Math.abs(first[0] - second[0]) < EPSILON &&
    Math.abs(second[0] - third[0]) < EPSILON;
  const sameY = Math.abs(first[1] - second[1]) < EPSILON &&
    Math.abs(second[1] - third[1]) < EPSILON;
  return sameX || sameY;
}

/**
 * Контуры объединения прямоугольников в координатах слоя.
 *
 * Прямоугольники режутся сеткой из их же границ, поэтому внутренние границы
 * соседних прямоугольников в результат не попадают: у директивы из двух строк
 * получается одна фигура с общей стороной, а не два контура и не общий
 * прямоугольник. У объединения с «дыркой» (чужая подсветка внутри директивы)
 * контуров несколько — они и возвращаются списком.
 *
 * @param {{left:number, right:number, top:number, bottom:number}[]} rects
 * @returns {number[][][]} замкнутые ломаные: контур → точки [x, y]
 */
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

/** Сшивает рёбра в замкнутые ломаные: конец ребра продолжается тем, что с него началось. */
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

/** Длина отрезка между двумя точками контура. */
function length(first, second) {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

/**
 * Команды обхода контура со скруглёнными углами.
 *
 * Каждый угол заменяется дугой: от точки на входящем ребре до точки на
 * выходящем. Радиус прижимается к половине короткого из двух рёбер, иначе у
 * ступеньки с крошечным шагом дуги налезли бы друг на друга и контур пошёл бы
 * петлёй. Скругление повторяет прежний `border-radius: 5px` — прямые углы на
 * ступеньке выглядят грубее и спорят со скруглениями остальных элементов.
 */
function roundedContour(points) {
  const round = value => Math.round(value * 100) / 100;
  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const toPrevious = length(previous, point);
    const toNext = length(point, next);
    const radius = Math.min(CORNER_RADIUS, toPrevious / 2, toNext / 2);
    if (!(radius > EPSILON)) return { entry: point, exit: point, radius: 0 };

    /* Точки входа и выхода стоят на рёбрах по обе стороны угла: radius > 0
       гарантирует, что оба ребра не вырождены. */
    const entry = [
      point[0] + (previous[0] - point[0]) / toPrevious * radius,
      point[1] + (previous[1] - point[1]) / toPrevious * radius,
    ];
    const exit = [
      point[0] + (next[0] - point[0]) / toNext * radius,
      point[1] + (next[1] - point[1]) / toNext * radius,
    ];
    return { entry, exit, radius };
  });

  const commands = [`M${round(corners[0].exit[0])} ${round(corners[0].exit[1])}`];
  const turn = index => {
    const { entry, exit, radius } = corners[index];
    commands.push(`L${round(entry[0])} ${round(entry[1])}`);
    if (radius > EPSILON) {
      commands.push(`A${round(radius)} ${round(radius)} 0 0 1 ` +
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

/** `d` для `<path>`: контуры идут отдельными подпутями одного элемента. */
function pathData(outlines) {
  return outlines.map(roundedContour).join(' ');
}

/**
 * Прямоугольники подложки одной группы в координатах слоя рамок.
 *
 * По горизонтали прямоугольники расширяются на `FRAME_PADDING_X`: подложка
 * начинается ровно с текста, и линия по её краю прилипала бы к буквам.
 */
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

/**
 * Перерисовывает рамки директив в слое подсветки.
 *
 * Сначала снимаются все замеры, и только потом вставляются элементы: вставка
 * узла сбрасывает раскладку, поэтому «замер → вставка → замер» на документе с
 * сотней директив превращался бы в сотню пересчётов layout. Здесь пересчёт
 * один — и он тот же, что нужен браузеру для отрисовки.
 *
 * @param {HTMLElement|null} layer - слой подсветки (`.highlight-layer`)
 * @returns {number} сколько рамок нарисовано
 */
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
    frame.setAttribute('d', pathData(outlines));
    fragment.appendChild(frame);
  }
  svg.appendChild(fragment);
  host.appendChild(svg);

  return frames.length;
}
