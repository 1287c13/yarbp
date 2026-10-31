export class BpmnDefinitions {
  constructor() {
    this.id            = null;
    this.collaboration = null;
    this.processes     = [];
    this.categories    = [];   // B-7: <bpmn:category> для групп
  }
}

/** B-7: категория со значениями — на неё ссылаются `<bpmn:group>`. */
export class BpmnCategory {
  constructor(id) {
    this.id     = id;
    this.values = [];   // { id, value }
  }
}

export class BpmnCollaboration {
  constructor() {
    this.id              = null;
    this.participants    = [];
    this.messageFlows    = [];
    this.textAnnotations = [];
    this.associations    = [];
  }
}

export class BpmnMessageFlow {
  constructor({ id, sourceRef, targetRef, name }) {
    this.id        = id;
    this.sourceRef = sourceRef;
    this.targetRef = targetRef;
    this.name      = name || null;
    this.waypoints = null;
    this.labelPos  = null;   // ← ИЗМЕНЕНО
  }
}

export class BpmnTextAnnotation {
  constructor({ id, text }) {
    this.id     = id;
    this.text   = text || null;
    this.bounds = null;
  }
}

export class BpmnAssociation {
  constructor({ id, sourceRef, targetRef }) {
    this.id         = id;
    this.sourceRef  = sourceRef;
    this.targetRef  = targetRef;
    this.waypoints  = null;
    this.labelPos   = null;   // ← ИЗМЕНЕНО
  }
}

export class BpmnParticipant {
  constructor(id, name, processRef) {
    this.id         = id;
    this.name       = name || null;
    this.processRef = processRef;
    this.bounds     = null;
  }
}

export class BpmnProcess {
  constructor() {
    this.id             = null;
    this.name           = null;
    this.isExecutable   = false;
    this.poolName       = null;      // B-7: имя пула-участника (по умолчанию = имя процесса)
    this.laneSetId      = null;
    this.lanes          = [];
    this.flowNodes      = [];
    this.sequenceFlows  = [];
    this.dataObjects    = [];
    this.dataObjectRefs = [];
    this.dataStores     = [];
    this.groups         = [];        // B-7: <bpmn:group> задачи
    this.bounds         = null;
  }
}

/** B-7: группа-артефакт вокруг задачи; имя хранится в `<bpmn:categoryValue>`. */
export class BpmnGroup {
  constructor({ id, name, categoryValueId, ownerId }) {
    this.id              = id;
    this.name            = name || null;
    this.categoryValueId = categoryValueId;
    this.ownerId         = ownerId;
    this.bounds          = null;
  }
}

export class BpmnLane {
  constructor(id, name) {
    this.id           = id;
    this.name         = name || null;
    this.flowNodeRefs = [];
    this.bounds       = null;
  }
}

export class BpmnFlowNode {
  constructor({ id, tag, name }) {
    this.id   = id;
    this.tag  = tag;
    this.name = name || null;

    this.incoming = [];
    this.outgoing = [];

    this.attachedToRef       = null;
    this.cancelActivity      = null;   // boundary: false → cancelActivity="false"
    this.eventDefinition     = null;   // message/timer/error/signal/…
    this.calledElement       = null;   // callActivity: id вызываемого процесса
    this.defaultFlowId       = null;   // шлюз: id потока по умолчанию
    this.loopCharacteristics = null;
    this.children            = [];
    this.sequenceFlows       = [];
    this.dataInputAssocs     = [];
    this.dataOutputAssocs    = [];
    this.isExpanded          = null;
    this.laneId              = null;

    this.bounds              = null;
    this.joinBounds          = null;
    this.labelPos            = null;
  }
}

export class BpmnSequenceFlow {
  constructor({ id, sourceRef, targetRef, name }) {
    this.id        = id;
    this.sourceRef = sourceRef;
    this.targetRef = targetRef;
    this.name      = name || null;
    this.condition = null;   // <bpmn:conditionExpression> у ветки
    this.waypoints = null;
    this.labelPos  = null;
  }
}

export class BpmnDataOutputAssociation {
  constructor({ id, targetRef, name }) {
    this.id         = id;
    this.targetRef  = targetRef;
    this.name       = name || null;
    this.waypoints  = null;
  }
}

/**
 * Чтение данных задачей: источник — `dataObjectReference`, приёмник — задача.
 * В XML это `<bpmn:dataInputAssociation><bpmn:sourceRef>…`.
 */
export class BpmnDataInputAssociation {
  constructor({ id, sourceRef, name }) {
    this.id         = id;
    this.sourceRef  = sourceRef;
    this.name       = name || null;
    this.waypoints  = null;
  }
}

export class BpmnDataObjectReference {
  constructor({ id, name, dataObjectRef }) {
    this.id            = id;
    this.name          = name || null;
    this.dataObjectRef = dataObjectRef;
    this.bounds        = null;
    this.labelPos      = null;
  }
}

export class BpmnDataStoreReference {
  constructor({ id, name }) {
    this.id     = id;
    this.name   = name || null;
    this.bounds = null;
  }
}