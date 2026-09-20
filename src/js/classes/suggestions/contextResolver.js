import { TokenTypes } from '../YarbpLexer.js';

export function resolveContext(tokens, cursorOffset, text) {
  const prev = findLastMeaningful(tokens, cursorOffset);
  const open = findOpenScopes(tokens, cursorOffset);
  const parentScope = findObjectScope(open);
  const outerScope = findObjectScope(open.slice(0, -1));

  const parentKey = parentScope?.key ?? null;
  const outerKey = outerScope?.key ?? null;

  const base = { parentKey, outerKey, childKey: null, slot: 'key', rawValue: '' };

  if (!prev) { return base; }

  if (prev.type === TokenTypes.DIRECTIVE) {
    return { ...base, parentKey: null, outerKey: null, slot: 'directive' };
  }

  if (prev.type === TokenTypes.PREFIX) { return base; }

  if (isKey(prev.type)) {
    if (cursorOffset <= prev.end) {
      const prevIsCurrentScope = parentScope && parentScope.key === prev.value;
      if (prevIsCurrentScope) { return { ...base, parentKey: outerKey }; }
      return base;
    }
    return { ...base, childKey: (prev.prefix || '') + prev.value, slot: 'value' };
  }

  if (prev.type === TokenTypes.ANY_VALUE) {
    const shorthandKey = findPrevKey(tokens, tokens.indexOf(prev));
    const childKey = shorthandKey ? (shorthandKey.prefix || '') + shorthandKey.value : null;

    const isEmptyShorthand = !prev.value || prev.value.trim() === '=';
    const cursorInsideValue = prev.end > cursorOffset;

    if ((isEmptyShorthand || cursorInsideValue) && shorthandKey) {
      return { ...base, parentKey: shorthandKey.value, childKey: shorthandKey.value, slot: 'value' };
    }

    const isShorthand = (prev.value || '').trimStart().startsWith('=');
    if (isShorthand) { return base; }

    const segment = text.slice(prev.end, cursorOffset);
    if (segment.includes('\n')) { return base; }

    return { ...base, childKey, slot: 'value' };
  }

  return base;
}

function isMeaningful(type) {
  return type === TokenTypes.OBJECT
      || type === TokenTypes.ARRAY
      || type === TokenTypes.PRIMITIVE
      || type === TokenTypes.PREFIX
      || type === TokenTypes.DIRECTIVE
      || type === TokenTypes.ANY_VALUE;
}

function isScopeOwner(type) {
  return type === TokenTypes.OBJECT
      || type === TokenTypes.ARRAY;
}

function isKey(type) {
  return type === TokenTypes.OBJECT
      || type === TokenTypes.ARRAY
      || type === TokenTypes.PRIMITIVE;
}

function findLastMeaningful(tokens, cursorOffset) {
  let result = null;
  for (const t of tokens) {
    if (t.start >= cursorOffset) break;
    if (isMeaningful(t.type)) result = t;
  }
  return result;
}

function findOpenScopes(tokens, cursorOffset) {
  const open = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t.start > cursorOffset) break;

    if (t.type === TokenTypes.SCOPE_IN) {
      const next = nextScopeOwner(tokens, i + 1);
      open.push({ key: next?.value ?? null, kind: next?.type ?? null, start: t.start });
    } else if (t.type === TokenTypes.SCOPE_OUT) {
      const willPop = t.start < cursorOffset && open.length > 0;
      if (willPop) open.pop();
    }
  }

  return open;
}

function findObjectScope(open) {
  for (let i = open.length - 1; i >= 0; i--) {
    if (open[i].kind === TokenTypes.OBJECT) return open[i];
  }
  return null;
}

function findPrevKey(tokens, fromIdx) {
  for (let i = fromIdx - 1; i >= 0; i--) {
    if (isKey(tokens[i].type)) return tokens[i];
  }
  return null;
}

function nextScopeOwner(tokens, from) {
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i];
    if (isScopeOwner(t.type)) return t;
    if (t.type === TokenTypes.ANY_VALUE
        || t.type === TokenTypes.SCOPE_OUT
        || t.type === TokenTypes.END) return null;
  }
  return null;
}