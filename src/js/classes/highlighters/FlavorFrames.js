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
 * Геометрия берётся из DOM (`Range.getBoundingClientRect`), а не считается по
 * ширине символа: рамка обязана совпадать с текстом при любом шрифте, масштабе
 * и желобке номеров строк.
 *
 * Цена: один `querySelectorAll` и по одному замеру на группу (обычно 0–2) за
 * перерисовку слоя. Документ без директив не стоит ничего — работа не
 * начинается. Классы текста (`flavor` и прочие) не меняются, поэтому разметка
 * подсветки остаётся прежней.
 */

const FRAMES_CLASS = 'flavor-frames';
const FRAME_CLASS = 'flavor-frame';
const FLAVOR_SELECTOR = '.flavor';

/** Зазор между текстом и рамкой — как у прежнего `outline-offset: 2px`. */
const FRAME_OFFSET = 2;

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
  const boxRange = doc.createRange();

  const host = doc.createElement('div');
  host.className = FRAMES_CLASS;
  host.setAttribute('aria-hidden', 'true');
  layer.insertBefore(host, layer.firstChild);

  /* Начало координат — начало текста: слой рамок смещён на внутренние отступы
     подсветки и на желобок номеров строк, поэтому при его появлении рамки
     едут вместе с текстом (см. `.flavor-frames` в editor.css). */
  const origin = host.getBoundingClientRect();

  const boxes = [];
  for (const group of groupFlavorSpans(spans, gapRange)) {
    boxRange.setStartBefore(group[0]);
    boxRange.setEndAfter(group[group.length - 1]);

    const box = boxRange.getBoundingClientRect();
    if (!box.width && !box.height) continue;
    boxes.push(box);
  }

  if (!boxes.length) {
    host.remove();
    return 0;
  }

  const fragment = doc.createDocumentFragment();
  for (const box of boxes) {
    const frame = doc.createElement('div');
    frame.className = FRAME_CLASS;
    frame.style.left = `${box.left - origin.left - FRAME_OFFSET}px`;
    frame.style.top = `${box.top - origin.top - FRAME_OFFSET}px`;
    frame.style.width = `${box.width + FRAME_OFFSET * 2}px`;
    frame.style.height = `${box.height + FRAME_OFFSET * 2}px`;
    fragment.appendChild(frame);
  }
  host.appendChild(fragment);

  return boxes.length;
}
