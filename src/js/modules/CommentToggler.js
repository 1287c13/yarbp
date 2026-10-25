import { calcLeadingSpaces } from '../utils.js';

export const COMMENT_PREFIX = '--/';

function getLines(text) {
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
}

/**
 * Индекс строки, содержащей позицию. Позиция на конце строки (перед \n)
 * относится к этой же строке.
 */
function findLineIndex(lines, offset) {
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
}

/**
 * Строки, которые затрагивает выделение. Если выделение заканчивается ровно
 * на начале следующей строки, эта следующая строка не включается.
 */
function getAffectedRange(lines, start, end) {
  const first = findLineIndex(lines, start);
  let last = findLineIndex(lines, end);

  if (last > first && end === lines[last].start) last--;

  return { first, last };
}

/**
 * Массовое комментирование/раскомментирование строк маркером "--/".
 *
 * Маркер ставится после ведущих пробелов, поэтому отступы строки сохраняются.
 * Если все непустые строки диапазона уже закомментированы — маркер снимается.
 * Иначе маркер добавляется только к незакомментированным строкам.
 *
 * @param {HTMLTextAreaElement} textarea - редактируемое поле
 * @param {string} prefix - маркер комментария
 * @returns {boolean} true, если текст был изменён
 */
export function toggleLineComments(textarea, prefix = COMMENT_PREFIX) {
  if (!textarea) return false;

  const value = textarea.value;
  const selectionStart = textarea.selectionStart;
  const selectionEnd = textarea.selectionEnd;
  const lines = getLines(value);
  const { first, last } = getAffectedRange(lines, selectionStart, selectionEnd);

  const targets = [];
  for (let i = first; i <= last; i++) {
    const lineText = lines[i].text;
    const indent = calcLeadingSpaces(lineText);
    const content = lineText.slice(indent);

    if (content.trim() === '') continue;

    targets.push({
      index: i,
      indent,
      content,
      commented: content.startsWith(prefix)
    });
  }

  if (!targets.length) return false;

  const removeMode = targets.every(item => item.commented);
  const changes = new Map();

  for (const item of targets) {
    if (removeMode) {
      let removeLength = prefix.length;
      if (item.content[removeLength] === ' ') removeLength++;

      changes.set(item.index, {
        mode: 'remove',
        indent: item.indent,
        removeLength,
        delta: -removeLength
      });
    } else if (!item.commented) {
      changes.set(item.index, {
        mode: 'add',
        indent: item.indent,
        delta: prefix.length
      });
    }
  }

  if (!changes.size) return false;

  const blockStart = lines[first].start;
  const blockEnd = lines[last].end;
  const blockLines = value.slice(blockStart, blockEnd).split('\n');

  const cumulativeBefore = new Map();
  let cumulative = 0;
  for (let i = first; i <= last; i++) {
    cumulativeBefore.set(i, cumulative);
    cumulative += changes.get(i)?.delta ?? 0;
  }

  for (let i = 0; i < blockLines.length; i++) {
    const lineIndex = first + i;
    const change = changes.get(lineIndex);
    if (!change) continue;

    const indent = change.indent;
    blockLines[i] = change.mode === 'add'
      ? blockLines[i].slice(0, indent) + prefix + blockLines[i].slice(indent)
      : blockLines[i].slice(0, indent) + blockLines[i].slice(indent + change.removeLength);
  }

  const newBlock = blockLines.join('\n');
  if (newBlock === value.slice(blockStart, blockEnd)) return false;

  const mapOffset = (offset) => {
    const lineIndex = findLineIndex(lines, offset);

    if (lineIndex < first) return offset;
    if (lineIndex > last) return offset + cumulative;

    const line = lines[lineIndex];
    const change = changes.get(lineIndex);
    const column = offset - line.start;
    let newColumn = column;

    if (change?.mode === 'add') {
      newColumn = column >= change.indent ? column + prefix.length : column;
    } else if (change?.mode === 'remove') {
      if (column > change.indent) {
        newColumn = Math.max(change.indent, column - change.removeLength);
      }
    }

    return line.start + cumulativeBefore.get(lineIndex) + newColumn;
  };

  const newStart = mapOffset(selectionStart);
  const newEnd = mapOffset(selectionEnd);

  textarea.focus();
  textarea.setSelectionRange(blockStart, blockEnd);

  let applied = false;
  try {
    applied = document.execCommand('insertText', false, newBlock);
  } catch (e) {
    applied = false;
  }

  if (!applied) {
    textarea.setRangeText(newBlock, blockStart, blockEnd, 'end');
  }

  textarea.setSelectionRange(newStart, newEnd);
  return true;
}
