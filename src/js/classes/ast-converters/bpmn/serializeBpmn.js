import {
  NAMESPACES, TARGET_NAMESPACE, EXPORTER, EXPORTER_VERSION,
  INDENT, sizeFor,
} from './definitions.js';
import { escapeHtml } from './utils.js';

export function serializeBpmn(definitions) {
  const lines = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  const nsAttrs = [
    `xmlns:xsi="${NAMESPACES.xsi}"`,
    `xmlns:bpmn="${NAMESPACES.bpmn}"`,
    `xmlns:bpmndi="${NAMESPACES.bpmndi}"`,
    `xmlns:dc="${NAMESPACES.dc}"`,
    `xmlns:di="${NAMESPACES.di}"`,
  ].join(' ');

  lines.push(
    `<bpmn:definitions ${nsAttrs} ` +
    `id="${escapeHtml(definitions.id)}" ` +
    `targetNamespace="${TARGET_NAMESPACE}" ` +
    `exporter="${EXPORTER}" exporterVersion="${EXPORTER_VERSION}">`
  );

  if (definitions.collaboration) {
    serializeCollaboration(definitions.collaboration, definitions, lines, 1);
  }

  for (const process of definitions.processes) {
    serializeProcess(process, definitions, lines, 1);
  }

  for (const category of definitions.categories || []) {
    serializeCategory(category, lines, 1);
  }

  serializeDiagram(definitions, lines, 1);

  lines.push('</bpmn:definitions>');
  return lines.join('\n');
}

/** B-7: `<bpmn:category>` со значениями — подписи групп. */
function serializeCategory(category, lines, depth) {
  const ind = INDENT.repeat(depth);
  lines.push(`${ind}<bpmn:category id="${escapeHtml(category.id)}">`);
  for (const value of category.values) {
    lines.push(
      `${ind}${INDENT}<bpmn:categoryValue id="${escapeHtml(value.id)}" ` +
      `value="${escapeHtml(value.value || '')}" />`
    );
  }
  lines.push(`${ind}</bpmn:category>`);
}

/* ------------------------------------------------------------------ */

function serializeCollaboration(collab, definitions, lines, depth) {
  const ind = INDENT.repeat(depth);
  lines.push(`${ind}<bpmn:collaboration id="${escapeHtml(collab.id)}">`);
  for (const p of collab.participants) {
    lines.push(
      `${ind}${INDENT}<bpmn:participant id="${escapeHtml(p.id)}" ` +
      `name="${escapeHtml(p.name || '')}" processRef="${escapeHtml(p.processRef)}" />`
    );
  }
  for (const ta of collab.textAnnotations) {
    lines.push(`${ind}${INDENT}<bpmn:textAnnotation id="${escapeHtml(ta.id)}">`);
    lines.push(`${ind}${INDENT}${INDENT}<bpmn:text>${escapeHtml(ta.text)}</bpmn:text>`);
    lines.push(`${ind}${INDENT}</bpmn:textAnnotation>`);
  }
  for (const a of collab.associations) {
    lines.push(
      `${ind}${INDENT}<bpmn:association id="${escapeHtml(a.id)}" ` +
      `associationDirection="None" ` +
      `sourceRef="${escapeHtml(a.sourceRef)}" targetRef="${escapeHtml(a.targetRef)}" />`
    );
  }
  for (const mf of collab.messageFlows) {
    lines.push(
      `${ind}${INDENT}<bpmn:messageFlow id="${escapeHtml(mf.id)}" ` +
      `sourceRef="${escapeHtml(mf.sourceRef)}" targetRef="${escapeHtml(mf.targetRef)}" />`
    );
  }
  lines.push(`${ind}</bpmn:collaboration>`);
}

function serializeProcess(process, definitions, lines, depth) {
  const ind = INDENT.repeat(depth);
  lines.push(
    `${ind}<bpmn:process id="${escapeHtml(process.id)}" ` +
    `isExecutable="${process.isExecutable}">`
  );

  if (process.lanes.length) {
    serializeLaneSet(process, lines, depth + 1);
  }

  for (const node of process.flowNodes) {
    serializeFlowNode(node, lines, depth + 1);
  }

  for (const ref of process.dataObjectRefs) {
    lines.push(
      `${ind}${INDENT}<bpmn:dataObjectReference id="${escapeHtml(ref.id)}" ` +
      `name="${escapeHtml(ref.name || '')}" dataObjectRef="${escapeHtml(ref.dataObjectRef)}" />`
    );
  }
  for (const obj of process.dataObjects) {
    const name = obj.name ? ` name="${escapeHtml(obj.name)}"` : '';
    lines.push(`${ind}${INDENT}<bpmn:dataObject id="${escapeHtml(obj.id)}"${name} />`);
  }
  for (const ref of process.dataStores) {
    lines.push(
      `${ind}${INDENT}<bpmn:dataStoreReference id="${escapeHtml(ref.id)}" ` +
      `name="${escapeHtml(ref.name || '')}" />`
    );
  }

  // B-7: группы-артефакты процесса
  for (const group of process.groups || []) {
    lines.push(
      `${ind}${INDENT}<bpmn:group id="${escapeHtml(group.id)}" ` +
      `categoryValueRef="${escapeHtml(group.categoryValueId)}" />`
    );
  }

  for (const flow of process.sequenceFlows) {
    serializeSequenceFlow(flow, lines, depth + 1);
  }

  lines.push(`${ind}</bpmn:process>`);
}

function serializeLaneSet(process, lines, depth) {
  const ind = INDENT.repeat(depth);
  lines.push(`${ind}<bpmn:laneSet id="${escapeHtml(process.laneSetId)}">`);
  for (const lane of process.lanes) {
    lines.push(`${ind}${INDENT}<bpmn:lane id="${escapeHtml(lane.id)}" name="${escapeHtml(lane.name || '')}">`);
    for (const ref of lane.flowNodeRefs) {
      lines.push(`${ind}${INDENT}${INDENT}<bpmn:flowNodeRef>${escapeHtml(ref)}</bpmn:flowNodeRef>`);
    }
    lines.push(`${ind}${INDENT}</bpmn:lane>`);
  }
  lines.push(`${ind}</bpmn:laneSet>`);
}

function serializeFlowNode(node, lines, depth) {
  const ind = INDENT.repeat(depth);
  const tag = `bpmn:${node.tag}`;

  const attrs = [`id="${escapeHtml(node.id)}"`];
  if (node.name) attrs.push(`name="${escapeHtml(node.name)}"`);
  if (node.tag === 'boundaryEvent' && node.attachedToRef) {
    attrs.push(`attachedToRef="${escapeHtml(node.attachedToRef)}"`);
  }
  // B-3/B-4: «непрерывающее» boundary и поток по умолчанию у шлюза.
  if (node.cancelActivity === false) attrs.push('cancelActivity="false"');
  if (node.defaultFlowId) attrs.push(`default="${escapeHtml(node.defaultFlowId)}"`);
  // B-7: вызов процесса
  if (node.calledElement) attrs.push(`calledElement="${escapeHtml(node.calledElement)}"`);

  const loopXml = loopCharacteristicsXml(node.loopCharacteristics);
  const hasInner = node.children && node.children.length;
  const inputAssocs  = node.dataInputAssocs  || [];
  const outputAssocs = node.dataOutputAssocs || [];
  const hasAssocs = inputAssocs.length > 0 || outputAssocs.length > 0;
  const ioSpecXml = ioSpecificationXml(node, inputAssocs, outputAssocs, ind + INDENT);

  const hasBody =
    node.incoming.length ||
    node.outgoing.length ||
    node.eventDefinition ||
    loopXml ||
    hasInner ||
    hasAssocs;

  if (!hasBody) {
    lines.push(`${ind}<${tag} ${attrs.join(' ')} />`);
    return;
  }

  lines.push(`${ind}<${tag} ${attrs.join(' ')}>`);

  for (const id of node.incoming) lines.push(`${ind}${INDENT}<bpmn:incoming>${escapeHtml(id)}</bpmn:incoming>`);
  for (const id of node.outgoing) lines.push(`${ind}${INDENT}<bpmn:outgoing>${escapeHtml(id)}</bpmn:outgoing>`);

  if (node.eventDefinition) {
    lines.push(`${ind}${INDENT}<bpmn:${node.eventDefinition} />`);
  }

  if (loopXml) {
    lines.push(`${ind}${INDENT}${loopXml}`);
  }

  if (ioSpecXml) {
    for (const line of ioSpecXml) lines.push(line);
  }

  if (hasAssocs) {
    for (const a of inputAssocs) {
      lines.push(`${ind}${INDENT}<bpmn:dataInputAssociation id="${escapeHtml(a.id)}">`);
      lines.push(`${ind}${INDENT}${INDENT}<bpmn:sourceRef>${escapeHtml(a.sourceRef)}</bpmn:sourceRef>`);
      lines.push(`${ind}${INDENT}</bpmn:dataInputAssociation>`);
    }
    for (const a of outputAssocs) {
      lines.push(`${ind}${INDENT}<bpmn:dataOutputAssociation id="${escapeHtml(a.id)}">`);
      lines.push(`${ind}${INDENT}${INDENT}<bpmn:targetRef>${escapeHtml(a.targetRef)}</bpmn:targetRef>`);
      lines.push(`${ind}${INDENT}</bpmn:dataOutputAssociation>`);
    }
  }

  if (hasInner) {
    for (const child of node.children) {
      serializeFlowNode(child, lines, depth + 1);
    }
    for (const flow of node.sequenceFlows || []) {
      serializeSequenceFlow(flow, lines, depth + 1);
    }
  }

  lines.push(`${ind}</${tag}>`);
}

function loopCharacteristicsXml(kind) {
  if (kind === 'multiInstanceParallel')     return '<bpmn:multiInstanceLoopCharacteristics />';
  if (kind === 'multiInstanceSequential')   return '<bpmn:multiInstanceLoopCharacteristics isSequential="true" />';
  if (kind === 'standardLoop')              return '<bpmn:standardLoopCharacteristics />';
  return null;
}

/**
 * `ioSpecification` задачи: какие данные она принимает и отдаёт.
 *
 * Без него associations ссылаются в пустоту: по BPMN 2.0 у активности должны
 * быть объявлены `dataInput`/`dataOutput` и их наборы. Идентификаторы выводим
 * из id задачи — так они детерминированы и не конфликтуют между задачами.
 */
function ioSpecificationXml(node, inputAssocs, outputAssocs, ind) {
  if (!inputAssocs.length && !outputAssocs.length) return null;

  const outer = ind;
  const level2 = ind + INDENT;
  const level3 = level2 + INDENT;

  const lines = [`${outer}<bpmn:ioSpecification>`];
  const inputs = [];
  const outputs = [];

  inputAssocs.forEach((assoc, index) => {
    const id = `${node.id}_dataInput_${index + 1}`;
    inputs.push(id);
    lines.push(`${level2}<bpmn:dataInput id="${escapeHtml(id)}" name="${escapeHtml(assoc.name || '')}" />`);
  });
  outputAssocs.forEach((assoc, index) => {
    const id = `${node.id}_dataOutput_${index + 1}`;
    outputs.push(id);
    lines.push(`${level2}<bpmn:dataOutput id="${escapeHtml(id)}" name="${escapeHtml(assoc.name || '')}" />`);
  });

  if (inputs.length) {
    lines.push(`${level2}<bpmn:inputSet id="${escapeHtml(node.id)}_inputSet">`);
    for (const id of inputs) {
      lines.push(`${level3}<bpmn:dataInputRefs>${escapeHtml(id)}</bpmn:dataInputRefs>`);
    }
    lines.push(`${level2}</bpmn:inputSet>`);
  }
  if (outputs.length) {
    lines.push(`${level2}<bpmn:outputSet id="${escapeHtml(node.id)}_outputSet">`);
    for (const id of outputs) {
      lines.push(`${level3}<bpmn:dataOutputRefs>${escapeHtml(id)}</bpmn:dataOutputRefs>`);
    }
    lines.push(`${level2}</bpmn:outputSet>`);
  }

  lines.push(`${outer}</bpmn:ioSpecification>`);
  return lines;
}

function serializeSequenceFlow(flow, lines, depth) {
  const ind = INDENT.repeat(depth);
  const attrs = [
    `id="${escapeHtml(flow.id)}"`,
    `sourceRef="${escapeHtml(flow.sourceRef)}"`,
    `targetRef="${escapeHtml(flow.targetRef)}"`,
  ];
  if (flow.name) attrs.splice(1, 0, `name="${escapeHtml(flow.name)}"`);

  // B-4: условие ветки — дочерний conditionExpression, а не атрибут.
  if (!flow.condition) {
    lines.push(`${ind}<bpmn:sequenceFlow ${attrs.join(' ')} />`);
    return;
  }

  lines.push(`${ind}<bpmn:sequenceFlow ${attrs.join(' ')}>`);
  lines.push(`${ind}${INDENT}<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">` +
    escapeHtml(flow.condition) + '</bpmn:conditionExpression>');
  lines.push(`${ind}</bpmn:sequenceFlow>`);
}

/* ------------------------------------------------------------------ */

function serializeDiagram(definitions, lines, depth) {
  const ind = INDENT.repeat(depth);
  const planeRef = definitions.collaboration
    ? definitions.collaboration.id
    : (definitions.processes[0] ? definitions.processes[0].id : '');

  lines.push(`${ind}<bpmndi:BPMNDiagram id="BPMNDiagram_1">`);
  lines.push(`${ind}${INDENT}<bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${escapeHtml(planeRef)}">`);

  if (definitions.collaboration) {
    for (const p of definitions.collaboration.participants) {
      serializeParticipantShape(p, lines, depth + 2);
    }
    for (const ta of definitions.collaboration.textAnnotations) {
      serializeTextAnnotationShape(ta, lines, depth + 2);
    }
    for (const a of definitions.collaboration.associations) {
      serializeEdge(a.id, a.waypoints, lines, depth + 2, false, null);
    }
    for (const mf of definitions.collaboration.messageFlows) {
      serializeEdge(mf.id, mf.waypoints, lines, depth + 2, !!mf.name, mf.labelPos);
    }
  }

  for (const process of definitions.processes) {
    for (const lane of process.lanes) {
      serializeLaneShape(lane, lines, depth + 2);
    }
    serializeFlowNodesShapes(process.flowNodes, lines, depth + 2);
    serializeFlowNodesAssocs(process.flowNodes, lines, depth + 2);

    for (const ref of process.dataObjectRefs) {
      serializeArtifactShape(ref, lines, depth + 2);
    }
    for (const ref of process.dataStores) {
      serializeArtifactShape(ref, lines, depth + 2);
    }
    for (const group of process.groups || []) {
      serializeGroupShape(group, lines, depth + 2);
    }

    for (const flow of process.sequenceFlows) {
      serializeEdge(flow.id, flow.waypoints, lines, depth + 2, !!flow.name, flow.labelPos);
    }
    serializeSubProcessEdges(process.flowNodes, lines, depth + 2);
  }

  lines.push(`${ind}${INDENT}</bpmndi:BPMNPlane>`);
  lines.push(`${ind}</bpmndi:BPMNDiagram>`);
}

function serializeFlowNodesShapes(nodes, lines, depth) {
  for (const node of nodes) {
    serializeNodeShape(node, lines, depth);
    if (node.children && node.children.length) {
      serializeFlowNodesShapes(node.children, lines, depth);
    }
  }
}

function serializeFlowNodesAssocs(nodes, lines, depth) {
  for (const node of nodes) {
    for (const a of node.dataOutputAssocs || []) {
      serializeEdge(a.id, a.waypoints, lines, depth, false, null);
    }
    for (const a of node.dataInputAssocs || []) {
      serializeEdge(a.id, a.waypoints, lines, depth, false, null);
    }
    if (node.children && node.children.length) {
      serializeFlowNodesAssocs(node.children, lines, depth);
    }
  }
}

function serializeSubProcessEdges(nodes, lines, depth) {
  for (const node of nodes) {
    if (node.children && node.children.length) {
      for (const flow of node.sequenceFlows || []) {
        serializeEdge(flow.id, flow.waypoints, lines, depth, !!flow.name, flow.labelPos);
      }
      serializeSubProcessEdges(node.children, lines, depth);
    }
  }
}

function serializeParticipantShape(p, lines, depth) {
  const ind = INDENT.repeat(depth);
  const b = p.bounds || { x: 0, y: 0, width: 600, height: 250 };
  const width  = b.width  !== undefined ? b.width  : 600;
  const height = b.height !== undefined ? b.height : 250;

  lines.push(`${ind}<bpmndi:BPMNShape id="${escapeHtml(p.id)}_di" bpmnElement="${escapeHtml(p.id)}" isHorizontal="true">`);
  lines.push(`${ind}${INDENT}<dc:Bounds x="${b.x}" y="${b.y}" width="${width}" height="${height}" />`);
  lines.push(`${ind}${INDENT}<bpmndi:BPMNLabel />`);
  lines.push(`${ind}</bpmndi:BPMNShape>`);
}

function serializeLaneShape(lane, lines, depth) {
  if (!lane.bounds) return;
  const ind = INDENT.repeat(depth);
  const b = lane.bounds;
  const width  = b.width  !== undefined ? b.width  : 600;
  const height = b.height !== undefined ? b.height : 250;

  lines.push(`${ind}<bpmndi:BPMNShape id="${escapeHtml(lane.id)}_di" bpmnElement="${escapeHtml(lane.id)}" isHorizontal="true">`);
  lines.push(`${ind}${INDENT}<dc:Bounds x="${b.x}" y="${b.y}" width="${width}" height="${height}" />`);
  lines.push(`${ind}${INDENT}<bpmndi:BPMNLabel />`);
  lines.push(`${ind}</bpmndi:BPMNShape>`);
}

function serializeNodeShape(node, lines, depth) {
  const ind = INDENT.repeat(depth);
  const size = sizeFor(node.tag, node.name);
  const b = node.bounds || { x: 0, y: 0 };
  const width  = b.width  !== undefined ? b.width  : size.width;
  const height = b.height !== undefined ? b.height : size.height;
  const isMarkerVisible = node.tag === 'exclusiveGateway';

  const attrs = [
    `id="${escapeHtml(node.id)}_di"`,
    `bpmnElement="${escapeHtml(node.id)}"`,
  ];
  if (isMarkerVisible) attrs.push(`isMarkerVisible="true"`);
  if (node.tag === 'subProcess') attrs.push(`isExpanded="${node.isExpanded !== false}"`);

  lines.push(`${ind}<bpmndi:BPMNShape ${attrs.join(' ')}>`);
  lines.push(`${ind}${INDENT}<dc:Bounds x="${b.x}" y="${b.y}" width="${width}" height="${height}" />`);
  if (node.labelPos) {
    lines.push(`${ind}${INDENT}<bpmndi:BPMNLabel>`);
    lines.push(`${ind}${INDENT}${INDENT}<dc:Bounds x="${node.labelPos.x}" y="${node.labelPos.y}" width="0" height="0" />`);
    lines.push(`${ind}${INDENT}</bpmndi:BPMNLabel>`);
  } else {
    lines.push(`${ind}${INDENT}<bpmndi:BPMNLabel />`);
  }
  lines.push(`${ind}</bpmndi:BPMNShape>`);
}

function serializeTextAnnotationShape(ta, lines, depth) {
  if (!ta.bounds) return;
  const ind = INDENT.repeat(depth);
  const b = ta.bounds;
  const width  = b.width  !== undefined ? b.width  : 100;
  const height = b.height !== undefined ? b.height : 30;

  lines.push(`${ind}<bpmndi:BPMNShape id="${escapeHtml(ta.id)}_di" bpmnElement="${escapeHtml(ta.id)}">`);
  lines.push(`${ind}${INDENT}<dc:Bounds x="${b.x}" y="${b.y}" width="${width}" height="${height}" />`);
  lines.push(`${ind}${INDENT}<bpmndi:BPMNLabel />`);
  lines.push(`${ind}</bpmndi:BPMNShape>`);
}

/** B-7: рамка группы — обычный BPMNShape с bpmnElement группы. */
function serializeGroupShape(group, lines, depth) {
  if (!group.bounds) return;
  const ind = INDENT.repeat(depth);
  const b = group.bounds;

  lines.push(`${ind}<bpmndi:BPMNShape id="${escapeHtml(group.id)}_di" bpmnElement="${escapeHtml(group.id)}">`);
  lines.push(`${ind}${INDENT}<dc:Bounds x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" />`);
  lines.push(`${ind}${INDENT}<bpmndi:BPMNLabel />`);
  lines.push(`${ind}</bpmndi:BPMNShape>`);
}

function serializeArtifactShape(ref, lines, depth) {
  if (!ref.bounds) return;
  const ind = INDENT.repeat(depth);
  const b = ref.bounds;
  const size = sizeFor(
    ref.dataObjectRef ? 'dataObjectReference' : 'dataStoreReference');
  const width  = b.width  !== undefined ? b.width  : size.width;
  const height = b.height !== undefined ? b.height : size.height;

  lines.push(`${ind}<bpmndi:BPMNShape id="${escapeHtml(ref.id)}_di" bpmnElement="${escapeHtml(ref.id)}">`);
  lines.push(`${ind}${INDENT}<dc:Bounds x="${b.x}" y="${b.y}" width="${width}" height="${height}" />`);
  if (ref.labelPos) {
    lines.push(`${ind}${INDENT}<bpmndi:BPMNLabel>`);
    lines.push(`${ind}${INDENT}${INDENT}<dc:Bounds x="${ref.labelPos.x}" y="${ref.labelPos.y}" width="0" height="0" />`);
    lines.push(`${ind}${INDENT}</bpmndi:BPMNLabel>`);
  } else {
    lines.push(`${ind}${INDENT}<bpmndi:BPMNLabel />`);
  }
  lines.push(`${ind}</bpmndi:BPMNShape>`);
}

function serializeEdge(id, waypoints, lines, depth, withLabel, labelPos) {
  const ind = INDENT.repeat(depth);
  const wps = waypoints || [[0, 0], [0, 0]];

  lines.push(`${ind}<bpmndi:BPMNEdge id="${escapeHtml(id)}_di" bpmnElement="${escapeHtml(id)}">`);
  for (const [x, y] of wps) {
    lines.push(`${ind}${INDENT}<di:waypoint x="${x}" y="${y}" />`);
  }
  if (withLabel) {
    const lx = labelPos ? labelPos.x : 0;
    const ly = labelPos ? labelPos.y : 0;
    lines.push(`${ind}${INDENT}<bpmndi:BPMNLabel>`);
    lines.push(`${ind}${INDENT}${INDENT}<dc:Bounds x="${lx}" y="${ly}" width="0" height="0" />`);
    lines.push(`${ind}${INDENT}</bpmndi:BPMNLabel>`);
  }
  lines.push(`${ind}</bpmndi:BPMNEdge>`);
}