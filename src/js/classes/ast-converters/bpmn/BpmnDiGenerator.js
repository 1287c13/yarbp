/**
 * BPMN DI generator (STUB).
 *
 * @param {BpmnDefinitions} model
 * @returns {BpmnDefinitions}
 */
export function recalculateDi(model) {
  for (const process of model.processes) {
    applyStubBounds(process.flowNodes);
  }
  return model;
}

function applyStubBounds(nodes) {
  for (const node of nodes) {
    if (!node.bounds) node.bounds = { x: 0, y: 0 };
    if (node.children && node.children.length) {
      applyStubBounds(node.children);
    }
  }
}