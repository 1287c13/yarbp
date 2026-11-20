// UI-макет ЯРБП → HTML.

import { UIFormConvertor } from './converter.js';
import { formMarkup } from './markup.js';
import { formStyles } from './styles.js';

export class UIGenerator {
  constructor(isDark = false) {
    this.isDark = !!isDark;
    this.convertor = new UIFormConvertor();
    this.lastIR = null;
  }

  convert(ast) {
    this.lastIR = this.convertor.convert(ast);
    return this.lastIR;
  }

  /** Диагностика последнего разбора: что не распознано и почему. */
  diagnostics() {
    return this.lastIR ? this.lastIR.diagnostics.slice() : [];
  }

  generateHTML(ast) {
    const ir = this.convert(ast);
    return formStyles(this.isDark) + '\n' + formMarkup(ir);
  }
}
