const getLines = (text) => {
  const lines = [];
  let position = 0;

  for (const lineText of text.split('\n')) {
    lines.push({
      start: position,
      end: position + lineText.length,
      text: lineText
    });
    position += lineText.length + 1;
  }

  return lines;
};

/**
 * Индекс строки, содержащей позицию. Позиция на конце строки (перед \n)
 * относится к этой же строке; позиция в начале следующей строки — уже к ней.
 */
const findLineIndex = (lines, offset) => {
  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const line = lines[mid];

    if (offset < line.start) {
      high = mid - 1;
    } else if (offset > line.end) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return Math.max(0, Math.min(low, lines.length - 1));
};

// Строки, которые затрагивает выделение. Если выделение заканчивается ровно
// в начале следующей строки, эту строку не тащим: иначе соседняя строка
// «прилипала» бы к выделенному блоку.
const getAffectedRange = (lines, start, end) => {
  const first = findLineIndex(lines, start);
  let last = findLineIndex(lines, end);

  if (last > first && end === lines[last].start) last--;

  return { first, last };
};

/**
 * Перемещает текущую строку или выделенный блок строк на одну строку
 * вверх/вниз. Возвращает true, если текст изменился (или перемещение
 * выполнено), и false на границе документа.
 *
 * Выделение сохраняется относительно текста блока. Если его конец стоит
 * в начале следующей строки, он схлопывается к концу блока: перенос строки
 * не считается частью выделенного блока.
 */
export function moveLines(textarea, direction) {
  if (!textarea || (direction !== 'up' && direction !== 'down')) return false;

  const value = textarea.value;
  const lines = getLines(value);
  if (!lines.length) return false;

  const selectionStart = Math.min(textarea.selectionStart, textarea.selectionEnd);
  const selectionEnd = Math.max(textarea.selectionStart, textarea.selectionEnd);
  const selectionDirection = textarea.selectionDirection || 'none';
  const { first, last } = getAffectedRange(lines, selectionStart, selectionEnd);

  if (direction === 'up' && first === 0) return false;
  if (direction === 'down' && last === lines.length - 1) return false;

  const blockStart = lines[first].start;
  const blockEnd = lines[last].end;
  const blockLength = blockEnd - blockStart;
  const blockText = lines.slice(first, last + 1).map(line => line.text).join('\n');

  let replaceStart;
  let replaceEnd;
  let replacement;
  let newBlockStart;

  if (direction === 'up') {
    const previousLine = lines[first - 1];
    replaceStart = previousLine.start;
    replaceEnd = blockEnd;
    replacement = blockText + '\n' + previousLine.text;
    newBlockStart = previousLine.start;
  } else {
    const nextLine = lines[last + 1];
    replaceStart = blockStart;
    replaceEnd = nextLine.end;
    replacement = nextLine.text + '\n' + blockText;
    newBlockStart = blockStart + nextLine.text.length + 1;
  }

  const mapOffset = (offset) => newBlockStart +
    Math.max(0, Math.min(blockLength, offset - blockStart));

  const newStart = mapOffset(selectionStart);
  const newEnd = mapOffset(selectionEnd);

  textarea.focus();
  textarea.setSelectionRange(replaceStart, replaceEnd);

  const before = textarea.value;
  let applied = false;
  try {
    applied = document.execCommand('insertText', false, replacement);
  } catch (error) {
    applied = false;
  }

  // execCommand в headless-браузере может молча ничего не сделать.
  // Резервный путь обязателен, как и в CommentToggler.
  if (!applied || textarea.value === before) {
    textarea.setRangeText(replacement, replaceStart, replaceEnd, 'end');
  }

  textarea.setSelectionRange(newStart, newEnd, selectionDirection);
  return true;
}
