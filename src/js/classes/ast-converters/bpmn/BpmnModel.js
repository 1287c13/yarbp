export class BpmnDefinitions {
  constructor() {
    this.id            = null;
    this.collaboration = null;
    this.processes     = [];
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
    this.laneSetId      = null;
    this.lanes          = [];
    this.flowNodes      = [];
    this.sequenceFlows  = [];
    this.dataObjects    = [];
    this.dataObjectRefs = [];
    this.dataStores     = [];
    this.bounds         = null;
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
    this.loopCharacteristics = null;
    this.children            = [];
    this.sequenceFlows       = [];
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
    this.waypoints = null;
    this.labelPos  = null;
  }
}

export class BpmnDataOutputAssociation {
  constructor({ id, targetRef }) {
    this.id         = id;
    this.targetRef  = targetRef;
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