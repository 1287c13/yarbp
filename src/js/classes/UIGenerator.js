/**
 * UI-макет ЯРБП → HTML.
 *
 * Тонкая обёртка: AST → IR собирает `UIFormConvertor`, IR → HTML —
 * `UIFormMarkup`, стили — `UIFormStyles`. Публичный контракт прежний:
 * `new UIGenerator(isDark).generateHTML(ast)`.
 */

import { UIFormConvertor } from './ui/UIFormConvertor.js';
import { formMarkup } from './ui/UIFormMarkup.js';
import { formStyles } from './ui/UIFormStyles.js';

export class UIGenerator {
  constructor(isDark = false) {
    this.isDark = !!isDark;
    this.convertor = new UIFormConvertor();
    this.lastIR = null;
  }

  /** IR последнего разбора (null, если формы в разметке нет). */
  convert(ast) {
    this.lastIR = this.convertor.convert(ast);
    return this.lastIR;
  }

  /** Диагностика последнего разбора: что не распознано и почему. */
  diagnostics() {
    return this.lastIR ? this.lastIR.diagnostics.slice() : [];
  }

  /** HTML формы вместе со стилями: годится и для предпросмотра, и в выгрузку. */
  generateHTML(ast) {
    const ir = this.convert(ast);
    return formStyles(this.isDark) + '\n' + formMarkup(ir);
  }
}
