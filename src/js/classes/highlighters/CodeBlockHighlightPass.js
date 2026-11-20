import { Ticker } from '../../utils/Ticker.js';
import { TokenTypes } from '../../core/YarbpLexer.js';
import { CodeBlockHighlighter } from './CodeBlockHighlighter.js';

// Отложенная подсветка содержимого фрагментов кода.
export const CODE_BLOCK_HIGHLIGHT_DELAY_MS = 150;

export class CodeBlockHighlightPass {
  constructor(highlightDiv, delay = CODE_BLOCK_HIGHLIGHT_DELAY_MS) {
    this.highlightDiv = highlightDiv;
    this.delay = delay;
    this.ticker = new Ticker(delay);
    this.pending = null;
    this.highlighted = new WeakMap();
  }

  schedule(code, tokens) {
    this.pending = { code, tokens };
    this.ticker.schedule(() => this.apply());
  }

  highlightNow() {
    this.ticker.cancel();
    this.apply();
  }

  cancel() {
    this.ticker.cancel();
    this.pending = null;
  }

  apply() {
    const pending = this.pending;
    this.pending = null;

    if (!pending || !this.highlightDiv) return;

    const { code, tokens } = pending;
    const source = String(code ?? '');

    const scrollTop = this.highlightDiv.scrollTop;
    const scrollLeft = this.highlightDiv.scrollLeft;

    for (const token of tokens || []) {
      if (token.type !== TokenTypes.CODE_BLOCK) continue;

      const language = String(token.language ?? '').trim();
      if (!language) continue; /* язык не указан — встроенную подсветку не зовём */

      const contentStart = token.contentStart ?? token.end;
      const contentEnd = token.contentEnd ?? token.end;
      const content = source.slice(contentStart, contentEnd);

      const host = this.highlightDiv.querySelector(
        `.ide-code-codeblock[data-code-block-start="${token.start}"] .ide-code-body`);
      if (!host) continue;

      const previous = this.highlighted.get(host);
      if (previous && previous.language === language && previous.content === content) {
        continue; /* тот же блок и тот же язык: DOM не переписываем */
      }

      try {
        host.innerHTML = new CodeBlockHighlighter(language).highlight(content);
        this.highlighted.set(host, { language, content });
      } catch (error) {
        console.error('[highlight] code block failed:', error);
      }
    }

    this.highlightDiv.scrollTop = scrollTop;
    this.highlightDiv.scrollLeft = scrollLeft;
  }

  destroy() {
    this.cancel();
    this.highlightDiv = null;
  }
}
