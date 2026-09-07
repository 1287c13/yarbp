export function calcLeadingSpaces(text) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') {
      count++;
    } else { break; } }
  return count;
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
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
