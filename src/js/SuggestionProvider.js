import { TokenTypes } from './classes/YarbpLexer.js';
import { COMMON_DIRECTIVES } from './classes/suggestions/commonDirectives.js';
import { resolveContext } from './classes/suggestions/contextResolver.js';

const HINT = '▼ Alt';

export class SuggestionProvider {
  update({ tokens, cursorOffset, text, flavor, force = false }) {
    if (!tokens || !tokens.length) return null;

    const directive = this.findDirectiveAt(tokens, cursorOffset);
    if (directive) return this.resolveDirectiveContext(directive, cursorOffset, text, force);

    if (flavor?.flavorData?.suggestions) {
      return this.resolveFlavorContext(tokens, cursorOffset, text, flavor.flavorData.suggestions, force);
    }

    return null;
  }

  findDirectiveAt(tokens, cursorOffset) {
    for (const t of tokens) {
      if (t.type !== TokenTypes.DIRECTIVE) continue;
      const isEmpty = t.start === t.end;
      const inInterval = t.start < cursorOffset && cursorOffset <= t.end;
      if (inInterval || (isEmpty && cursorOffset === t.start + 2)) return t;
    }
    return null;
  }

  offsetInValue(token, cursorOffset) {
    return Math.max(0, Math.min(token.value.length, cursorOffset - token.start - 1));
  }

  resolveDirectiveContext(token, cursorOffset, text, force) {
    const valueUpToCursor = token.value.slice(0, this.offsetInValue(token, cursorOffset));
    const parts = valueUpToCursor.split(' ').filter(Boolean);

    const charBefore = text && cursorOffset > 0 ? text[cursorOffset - 1] : '';
    const endsWithSpace = charBefore === ' ' || charBefore === '\n' || charBefore === '\t';

    const { from } = this.currentWord(text, cursorOffset);

    if (parts.length === 0 || (parts.length === 1 && !endsWithSpace)) {
      const prefix = parts[0] ?? '';
      const sorted = this.sortByPrefix(COMMON_DIRECTIVES.names, prefix);
      if (!sorted.length) return null;
      if (!force && sorted.some(v => v.label === prefix)) return null;
      return { suggestions: sorted, blockDoc: 'Доступные директивы', replaceFrom: from };
    }

    const directiveName = parts[0];
    const entry = COMMON_DIRECTIVES.values[directiveName];
    if (!entry) return null;

    const prefix = parts.length > 1 ? parts[parts.length - 1] : '';
    if (!force && prefix && entry.variants.some(v => v.label === prefix)) return null;

    const sorted = this.sortByPrefix(entry.variants, prefix);
    if (!sorted.length) return null;
    return { suggestions: sorted, blockDoc: entry.blockDoc || '', replaceFrom: from };
  }

  resolveFlavorContext(tokens, cursorOffset, text, config, force) {
    const ctx = resolveContext(tokens, cursorOffset, text);
    if (!ctx) return null;

    const lineStart = text.lastIndexOf('\n', cursorOffset - 1) + 1;
    const lineBeforeCursor = text.slice(lineStart, cursorOffset);
    const isLineStart = !lineBeforeCursor.trim();

    if (!force && isLineStart) {
      return { suggestions: [], hint: HINT, blockDoc: '', replaceFrom: ctx.replaceFrom };
    }

    if (ctx.parentKey === null) {
      const prefix = currentWordValue(text, cursorOffset);
      const filtered = filterAndSort(config.root?.variants ?? [], prefix);
      if (!filtered.length) return null;
      if (!force && prefix && filtered.some(v => v.label === prefix)) return null;
      return { suggestions: filtered, blockDoc: config.root?.blockDoc ?? '', replaceFrom: ctx.replaceFrom };
    }

    if (ctx.parentKey === '') return null;

    const node = config.nodes?.[ctx.parentKey];
    if (!node) return null;

    if (ctx.slot === 'key') {
      const variants = node.variants ?? [];
      const prefix = currentWordValue(text, cursorOffset);
      const filtered = filterAndSort(variants, prefix);
      if (!filtered.length) return null;
      if (!force && prefix && filtered.some(v => v.label === prefix)) return null;
      return { suggestions: filtered, blockDoc: node.blockDoc || '', replaceFrom: ctx.replaceFrom };
    }

    if (ctx.slot === 'value' && ctx.childKey) {
      const valueEntry = node.values?.[ctx.childKey];
      if (!valueEntry) return null;

      if (valueEntry.quantifier) {
        const raw = ctx.rawValue || '';
        const alreadyTyped = raw.split(valueEntry.quantifier.separator).filter(Boolean);
        if (alreadyTyped.length >= valueEntry.quantifier.max) return null;
      }

      const prefix = currentWordValue(text, cursorOffset);
      const filtered = filterAndSort(valueEntry.variants, prefix);
      if (!filtered.length) return null;
      if (!force && prefix && filtered.some(v => v.label === prefix)) return null;
      return { suggestions: filtered, blockDoc: valueEntry.blockDoc || '', replaceFrom: ctx.replaceFrom };
    }

    return null;
  }

  currentWord(text, cursorOffset) {
    if (!text) return { word: '', from: cursorOffset };
    let start = cursorOffset;
    while (start > 0) {
      const ch = text[start - 1];
      if (ch === ' ' || ch === '\n' || ch === '\t') break;
      start--;
    }
    return { word: text.slice(start, cursorOffset), from: start };
  }

  sortByPrefix(variants, prefix) {
    if (!prefix) return variants;
    const p = prefix.toLowerCase();
    return [...variants].sort((a, b) => {
      const aMatch = a.label.toLowerCase().startsWith(p) ? 0 : 1;
      const bMatch = b.label.toLowerCase().startsWith(p) ? 0 : 1;
      return aMatch - bMatch;
    });
  }
}

function currentWordValue(text, cursorOffset) {
  if (!text) return '';
  let start = cursorOffset;
  while (start > 0) {
    const ch = text[start - 1];
    if (ch === ' ' || ch === '\n' || ch === '\t') break;
    start--;
  }
  return text.slice(start, cursorOffset);
}

function filterAndSort(variants, prefix) {
  if (!prefix) return variants;
  const p = prefix.toLowerCase();
  return [...variants].sort((a, b) => {
    const aMatch = a.label.toLowerCase().startsWith(p) ? 0 : 1;
    const bMatch = b.label.toLowerCase().startsWith(p) ? 0 : 1;
    return aMatch - bMatch;
  });
}