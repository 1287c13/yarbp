export function calcLeadingSpaces(text) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') {
      count++;
    } else { break; } }
  return count;
}

let measureCanvas = null;

/**
 * Ширина символа моноширинного шрифта по вычисленному стилю элемента.
 * @param {CSSStyleDeclaration} style - стиль элемента с нужным шрифтом
 * @param {number} fallback - значение на случай, если измерить не удалось
 */
export function measureCharWidth(style, fallback = 7.2) {
  try {
    if (!measureCanvas) measureCanvas = document.createElement('canvas');
    const context = measureCanvas.getContext('2d');
    if (!context) return fallback;

    const sample = '0000000000';
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const width = context.measureText(sample).width / sample.length;
    return width > 0 ? width : fallback;
  } catch (e) {
    return fallback;
  }
}

export function findChildrenByKeyValue(node, key, value) {
  if (!node || !Array.isArray(node.children)) return [];
  return node.children.filter( child => child[key] === value );
}

export function calcTrailingSpaces(text) {
  let count = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === ' ') {
      count++;
    } else { break; } }
  return count;
}

export function splitWithEscaping(str, escapingSymbols, separator) {
  const result = [];
  let current = '';
  let escaped = false;
  let quoteChar = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escapingSymbols.includes(char) && !escaped) {
      escaped = true;
      quoteChar = char;
      current += char;
    }

    else if (escaped && char === ')' && quoteChar === '(') {
      escaped = false;
      quoteChar = '';
      current += char;
    }

    else if (escaped && char === quoteChar && quoteChar !== '(') {
      escaped = false;
      quoteChar = '';
      current += char;
    } else if (char === separator && !escaped) {
      if (current.length > 0) {
        result.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) { result.push(current); }
  if (escaped) { return []; }
  return result;
}

export function dedentMultilineString(str) {
  const lines = str.split('\n');
  const start = lines[0].trim() === '' ? 1 : 0;
  const firstLine = lines[start];
  const restLines = lines.slice(start + 1);

  if (restLines.length === 0) return firstLine || '';

  const indentSizes = restLines
    .filter(line => line.trim() !== '')
    .map(line => line.match(/^ */)[0].length);

  const minIndent = indentSizes.length > 0 ? Math.min(...indentSizes) : 0;

  const processedRest = restLines.map(line =>
    line.slice(minIndent)
  );

  return [firstLine, ...processedRest].join('\n');
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class IdGenerator {
  constructor() {
    this.counters = Object.create(null);
  }
  next(prefix) {
    this.counters[prefix] = (this.counters[prefix] || 0) + 1;
    return `${prefix}_${this.counters[prefix]}`;
  }
}