import { TokenTypes } from '../YarbpLexer.js';

export function resolveContext(tokens, cursorOffset, text) {
  const stack = [];
  let ownerToken = null;
  let nearestKeyBefore = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t.type === TokenTypes.SCOPE_IN) {
      if (cursorOffset >= t.start) {
        const next = nextMeaningful(tokens, i + 1);
        const indent = next ? lineIndent(text, next.start) : -1;
        stack.push({ key: next?.value ?? null, kind: next?.type ?? null, start: t.start, indent });
      }
      continue;
    }

    if (t.type === TokenTypes.SCOPE_OUT) {
      if (cursorOffset > t.start) stack.pop();
      continue;
    }

    const isMeaningful = t.type === TokenTypes.OBJECT
      || t.type === TokenTypes.ARRAY
      || t.type === TokenTypes.PRIMITIVE
      || t.type === TokenTypes.PREFIX
      || t.type === TokenTypes.DIRECTIVE
      || t.type === TokenTypes.ANY_VALUE;

    if (isMeaningful && t.start <= cursorOffset && cursorOffset <= t.end) ownerToken = t;
    if ((t.type === TokenTypes.OBJECT || t.type === TokenTypes.ARRAY || t.type === TokenTypes.PRIMITIVE)
        && t.end < cursorOffset) nearestKeyBefore = t;
  }

  const cursorIndent = lineIndent(text, cursorOffset);
  const top = stack.at(-1);

  let parentKey = null;

  const isOwnerTop = ownerToken && top
    && (ownerToken.type === TokenTypes.OBJECT || ownerToken.type === TokenTypes.ARRAY || ownerToken.type === TokenTypes.PRIMITIVE)
    && top.key === ownerToken.value;

  const nearestKeyLine = nearestKeyBefore
    ? text.lastIndexOf('\n', nearestKeyBefore.start - 1) + 1
    : -1;
  const cursorLine = text.lastIndexOf('\n', cursorOffset - 1) + 1;
  const onSameLineAsKey = nearestKeyBefore && nearestKeyLine === cursorLine;

  const topIsCurrentValueKey = top && nearestKeyBefore
    && top.key === nearestKeyBefore.value
    && onSameLineAsKey
    && ownerToken
    && ownerToken.value === nearestKeyBefore.value;

  const skipTop = isOwnerTop || topIsCurrentValueKey;
  const startFrom = skipTop ? stack.length - 2 : stack.length - 1;
  for (let i = startFrom; i >= 0; i--) {
    if (stack[i].key) { parentKey = stack[i].key; break; }
  }

  if (top && cursorIndent === top.indent && !skipTop) {
    parentKey = null;
    for (let i = stack.length - 2; i >= 0; i--) {
      if (stack[i].key) { parentKey = stack[i].key; break; }
    }
  }

  if (ownerToken && (ownerToken.type === TokenTypes.OBJECT || ownerToken.type === TokenTypes.ARRAY || ownerToken.type === TokenTypes.PRIMITIVE)) {
    const { from } = currentWord(text, cursorOffset);
    return { parentKey, childKey: null, slot: 'key', replaceFrom: from, valueStart: cursorOffset, rawValue: '' };
  }

  if (nearestKeyBefore && onSameLineAsKey) {
    if (ownerToken && ownerToken.type === TokenTypes.ANY_VALUE
        && top && top.key === nearestKeyBefore.value) {
      const rawSegment = text.slice(nearestKeyBefore.end, cursorOffset);
      const eqIdx = rawSegment.indexOf('=');
      const afterEq = eqIdx >= 0 ? rawSegment.slice(eqIdx + 1) : rawSegment;
      const hasInlineKey = /[ \t]\.{1,2}[^\s]/.test(afterEq);

      if (hasInlineKey) {
        const { from } = currentWord(text, cursorOffset);
        return { parentKey: top.key, childKey: null, slot: 'key', replaceFrom: from, valueStart: cursorOffset, rawValue: '' };
      }
    }
    const valueStart = nearestKeyBefore.end;
    const rawValue = text.slice(valueStart, cursorOffset).trim();
    const { from } = currentWord(text, cursorOffset);
    const prefix = nearestKeyBefore.prefix || '';
    return { parentKey, childKey: prefix + nearestKeyBefore.value, slot: 'value', replaceFrom: from, valueStart, rawValue };
  }

  if (nearestKeyBefore) {
    const { from } = currentWord(text, cursorOffset);
    return { parentKey, childKey: null, slot: 'key', replaceFrom: from, valueStart: cursorOffset, rawValue: '' };
  }

  if (!ownerToken || ownerToken.type === TokenTypes.PREFIX) {
    const { from } = currentWord(text, cursorOffset);
    return { parentKey, childKey: null, slot: 'key', replaceFrom: from, valueStart: cursorOffset, rawValue: '' };
  }

  return null;
}

function nextMeaningful(tokens, from) {
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === TokenTypes.PREFIX
        || t.type === TokenTypes.COMMENT
        || t.type === TokenTypes.COMMENT_TODO
        || t.type === TokenTypes.COMMENT_IMPORTANT
        || t.type === TokenTypes.COMMENT_OUT
        || t.type === TokenTypes.TYPE) continue;
    return t;
  }
  return null;
}

function currentWord(text, cursorOffset) {
  if (!text) return { word: '', from: cursorOffset };
  let start = cursorOffset;
  while (start > 0) {
    const ch = text[start - 1];
    if (ch === ' ' || ch === '\n' || ch === '\t') break;
    start--;
  }
  return { word: text.slice(start, cursorOffset), from: start };
}

function lineIndent(text, pos) {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  let i = lineStart;
  while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
  return i - lineStart;
}