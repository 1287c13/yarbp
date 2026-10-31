import { nodeTypes } from '../../YarbpParser.js';
import { buildModel } from './buildModel.js';
import { serializeBpmn } from './serializeBpmn.js';
import { recalculateDi, getLayoutStats, resetLayoutStats } from './BpmnDiGenerator.js';

export { getLayoutStats, resetLayoutStats };

export class YarbpBPMNConverter {
  /**
   * @param {object} ast — корень AST
   * @param {{source?: string}} [options] — исходный текст: нужен только для
   *   номеров строк в предупреждениях сборки (B-1)
   */
  constructor(ast, options = {}) {
    if (!ast || ast.nodeType !== nodeTypes.ROOT) {
      throw new Error('Invalid AST: root node must be of type ROOT');
    }
    this.ast = ast;
    this.options = options;
    /** Предупреждения модели: `{ line, message }[]` — читается после convert(). */
    this.warnings = [];
  }

  convert() {
    const model = buildModel(this.ast, { source: this.options.source || '' });
    this.warnings = model.warnings || [];
    recalculateDi(model);
    return serializeBpmn(model);
  }
}