import { nodeTypes } from '../../core/YarbpParser.js';
import { buildModel } from '../shared/bpmnModel/buildModel.js';
import { serializeBpmn } from './serializeBpmn.js';
import { recalculateDi, getLayoutStats, resetLayoutStats } from './BpmnDiGenerator.js';

export { getLayoutStats, resetLayoutStats };

export class YarbpBPMNConverter {
  constructor(ast, options = {}) {
    if (!ast || ast.nodeType !== nodeTypes.ROOT) {
      throw new Error('Invalid AST: root node must be of type ROOT');
    }
    this.ast = ast;
    this.options = options;
    this.warnings = [];
  }

  convert() {
    const model = buildModel(this.ast, { source: this.options.source || '' });
    this.warnings = model.warnings || [];
    recalculateDi(model);
    return serializeBpmn(model);
  }
}