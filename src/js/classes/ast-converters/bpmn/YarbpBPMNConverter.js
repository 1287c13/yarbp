import { nodeTypes } from '../../YarbpParser.js';
import { buildModel } from './buildModel.js';
import { serializeBpmn } from './serializeBpmn.js';
import { recalculateDi } from './BpmnDiGenerator.js';

export class YarbpBPMNConverter {
  constructor(ast) {
    if (!ast || ast.nodeType !== nodeTypes.ROOT) {
      throw new Error('Invalid AST: root node must be of type ROOT');
    }
    this.ast = ast;
  }

convert() {
  const model = buildModel(this.ast);
  recalculateDi(model);
  console.log('[convert] flows:', model.processes[0].sequenceFlows.map(f => ({
    id: f.id,
    wps: f.waypoints,
  })));
  return serializeBpmn(model);
}
}