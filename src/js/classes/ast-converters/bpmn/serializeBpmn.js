import {
  NAMESPACES, TARGET_NAMESPACE, EXPORTER, EXPORTER_VERSION,
  INDENT, sizeFor,
} from './definitions.js';
import { escapeXml } from './utils.js';

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
    `id="${escapeXml(definitions.id)}" ` +
    `targetNamespace="${TARGET_NAMESPACE}" ` +
    `exporter="${EXPORTER}" exporterVersion="${EXPORTER_VERSION}">`
  );

  if (definitions.collaboration) {
    serializeCollaboration(definitions.collaboration, lines, 1);
  }

  for (const process of definitions.processes) {
    serializeProcess(process, lines, 1);
  }

  serializeDiagram(definitions, lines, 1);

  lines.push('</bpmn:definitions>');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */

function serializeCollaboration(collab, lines, depth) {
  const ind = INDENT.repeat(depth);
  lines.push(`${ind}<bpmn:collaboration id="${escapeXml(collab.id)}">`);
  for (const p of collab.participants) {
    lines.push(
      `${ind}${INDENT}<bpmn:participant id="${escapeXml(p.id)}" ` +
      `name="${escapeXml(p.name || '')}" processRef="${escapeXml(p.processRef)}" />`
    );
  }
  lines.push(`${ind}</bpmn:collaboration>`);
}

function serializeProcess(process, lines, depth) {
  const ind = INDENT.repeat(depth);
  lines.push(
    `${ind}<bpmn:process id="${escapeXml(process.id)}" ` +
    `isExecutable="${process.isExecutable}">`
  );

  if (process.lanes.length) {
    serializeLaneSet(process, lines, depth + 1);
  }

  for (const node of process.flowNodes) {
    serializeFlowNode(node, lines, depth + 1);
  }

  for (const flow of process.sequenceFlows) {
    serializeSequenceFlow(flow, lines, depth + 1);
  }

  lines.push(`${ind}</bpmn:process>`);
}

function serializeLaneSet(process, lines, depth) {
  const ind = INDENT.repeat(depth);
  lines.push(`${ind}<bpmn:laneSet id="${escapeXml(process.laneSetId)}">`);
  for (const lane of process.lanes) {
    lines.push(`${ind}${INDENT}<bpmn:lane id="${escapeXml(lane.id)}" name="${escapeXml(lane.name || '')}">`);
    for (const ref of lane.flowNodeRefs) {
      lines.push(`${ind}${INDENT}${INDENT}<bpmn:flowNodeRef>${escapeXml(ref)}</bpmn:flowNodeRef>`);
    }
    lines.push(`${ind}${INDENT}</bpmn:lane>`);
  }
  lines.push(`${ind}</bpmn:laneSet>`);
}

function serializeFlowNode(node, lines, depth) {
  const ind = INDENT.repeat(depth);
  const tag = `bpmn:${node.tag}`;

  const attrs = [`id="${escapeXml(node.id)}"`];
  if (node.name) attrs.push(`name="${escapeXml(node.name)}"`);
  if (node.tag === 'subProcess') attrs.push(`isExpanded="${node.isExpanded !== false}"`);

  const hasBody =
    node.incoming.length ||
    node.outgoing.length ||
    node.loopCharacteristics ||
    node.dataOutputAssocs.length ||
    node.children.length;

  if (!hasBody) {
    lines.push(`${ind}<${tag} ${attrs.join(' ')} />`);
    return;
  }

  lines.push(`${ind}<${tag} ${attrs.join(' ')}>`);

  for (const id of node.incoming) lines.push(`${ind}${INDENT}<bpmn:incoming>${escapeXml(id)}</bpmn:incoming>`);
  for (const id of node.outgoing) lines.push(`${ind}${INDENT}<bpmn:outgoing>${escapeXml(id)}</bpmn:outgoing>`);

  lines.push(`${ind}</${tag}>`);
}

function serializeSequenceFlow(flow, lines, depth) {
  const ind = INDENT.repeat(depth);
  const attrs = [
    `id="${escapeXml(flow.id)}"`,
    `sourceRef="${escapeXml(flow.sourceRef)}"`,
    `targetRef="${escapeXml(flow.targetRef)}"`,
  ];
  if (flow.name) attrs.splice(1, 0, `name="${escapeXml(flow.name)}"`);
  lines.push(`${ind}<bpmn:sequenceFlow ${attrs.join(' ')} />`);
}

/* ------------------------------------------------------------------ */

function serializeDiagram(definitions, lines, depth) {
  const ind = INDENT.repeat(depth);
  const planeRef = definitions.collaboration
    ? definitions.collaboration.id
    : (definitions.processes[0] ? definitions.processes[0].id : '');

  lines.push(`${ind}<bpmndi:BPMNDiagram id="BPMNDiagram_1">`);
  lines.push(`${ind}${INDENT}<bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${escapeXml(planeRef)}">`);

  if (definitions.collaboration) {
    for (const p of definitions.collaboration.participants) {
      serializeParticipantShape(p, lines, depth + 2);
    }
  }

  for (const process of definitions.processes) {
    for (const node of process.flowNodes) {
      serializeNodeShape(node, lines, depth + 2);
    }
    for (const flow of process.sequenceFlows) {
      serializeFlowEdge(flow, lines, depth + 2);
    }
  }

  lines.push(`${ind}${INDENT}</bpmndi:BPMNPlane>`);
  lines.push(`${ind}</bpmndi:BPMNDiagram>`);
}

function serializeParticipantShape(p, lines, depth) {
  const ind = INDENT.repeat(depth);
  const b = p.bounds || { x: 0, y: 0, width: 600, height: 250 };
  lines.push(`${ind}<bpmndi:BPMNShape id="${escapeXml(p.id)}_di" bpmnElement="${escapeXml(p.id)}" isHorizontal="true">`);
  lines.push(`${ind}${INDENT}<dc:Bounds x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" />`);
  lines.push(`${ind}${INDENT}<bpmndi:BPMNLabel />`);
  lines.push(`${ind}</bpmndi:BPMNShape>`);
}

function serializeNodeShape(node, lines, depth) {
  const ind = INDENT.repeat(depth);
  const size = sizeFor(node.tag);
  const x = node.bounds ? node.bounds.x : 0;
  const y = node.bounds ? node.bounds.y : 0;
  const isMarkerVisible = node.tag === 'exclusiveGateway';

  const attrs = [
    `id="${escapeXml(node.id)}_di"`,
    `bpmnElement="${escapeXml(node.id)}"`,
  ];
  if (isMarkerVisible) attrs.push(`isMarkerVisible="true"`);
  if (node.tag === 'subProcess') attrs.push(`isExpanded="${node.isExpanded !== false}"`);

  lines.push(`${ind}<bpmndi:BPMNShape ${attrs.join(' ')}>`);
  lines.push(`${ind}${INDENT}<dc:Bounds x="${x}" y="${y}" width="${size.width}" height="${size.height}" />`);
  lines.push(`${ind}${INDENT}<bpmndi:BPMNLabel />`);
  lines.push(`${ind}</bpmndi:BPMNShape>`);
}

function serializeFlowEdge(flow, lines, depth) {
  const ind = INDENT.repeat(depth);
  const wps = flow.waypoints || [[0, 0], [0, 0]];

  lines.push(`${ind}<bpmndi:BPMNEdge id="${escapeXml(flow.id)}_di" bpmnElement="${escapeXml(flow.id)}">`);
  for (const [x, y] of wps) {
    lines.push(`${ind}${INDENT}<di:waypoint x="${x}" y="${y}" />`);
  }
  if (flow.name) {
    lines.push(`${ind}${INDENT}<bpmndi:BPMNLabel>`);
    lines.push(`${ind}${INDENT}${INDENT}<dc:Bounds x="0" y="0" width="0" height="0" />`);
    lines.push(`${ind}${INDENT}</bpmndi:BPMNLabel>`);
  }
  lines.push(`${ind}</bpmndi:BPMNEdge>`);
}