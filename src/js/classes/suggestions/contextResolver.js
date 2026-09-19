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
        stack.push({
          key: next?.value ?? null,
          kind: next?.type ?? null,
          start: t.start,
        });
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

    if (isMeaningful && t.start <= cursorOffset && cursorOffset <= t.end) {
      ownerToken = t;
    }

    if ((t.type === TokenTypes.OBJECT
        || t.type === TokenTypes.ARRAY
        || t.type === TokenTypes.PRIMITIVE)
        && t.end < cursorOffset) {
      nearestKeyBefore = t;
    }
  }

  let parentKey = null;
  const top = stack.at(-1);

  const topIsCurrentValueKey = top
    && nearestKeyBefore
    && top.key === nearestKeyBefore.value;

  const isOwnerTop = ownerToken
    && top
    && (ownerToken.type === TokenTypes.OBJECT
        || ownerToken.type === TokenTypes.ARRAY
        || ownerToken.type === TokenTypes.PRIMITIVE)
    && top.key === ownerToken.value;

  const skipTop = isOwnerTop || topIsCurrentValueKey;
  const startFrom = skipTop ? stack.length - 2 : stack.length - 1;
  for (let i = startFrom; i >= 0; i--) {
    if (stack[i].key) { parentKey = stack[i].key; break; }
  }

  if (ownerToken && (
        ownerToken.type === TokenTypes.OBJECT
        || ownerToken.type === TokenTypes.ARRAY
        || ownerToken.type === TokenTypes.PRIMITIVE)) {
    const { from } = currentWord(text, cursorOffset);
    return {
      parentKey,
      childKey: null,
      slot: 'key',
      replaceFrom: from,
      valueStart: cursorOffset,
      rawValue: '',
    };
  }

  if (nearestKeyBefore) {
    const valueStart = nearestKeyBefore.end;
    const rawValue = text.slice(valueStart, cursorOffset).trim();
    const { from } = currentWord(text, cursorOffset);

    const prefix = nearestKeyBefore.prefix || '';
    const childKey = prefix + nearestKeyBefore.value;

    return {
      parentKey,
      childKey,
      slot: 'value',
      replaceFrom: from,
      valueStart,
      rawValue,
    };
  }

  if (!ownerToken || ownerToken.type === TokenTypes.PREFIX) {
    const { from } = currentWord(text, cursorOffset);
    return {
      parentKey,
      childKey: null,
      slot: 'key',
      replaceFrom: from,
      valueStart: cursorOffset,
      rawValue: '',
    };
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