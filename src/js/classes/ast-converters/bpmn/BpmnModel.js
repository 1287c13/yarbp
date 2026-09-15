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

export class BpmnParticipant {
  constructor(id, name, processRef) {
    this.id         = id;
    this.name       = name || null;
    this.processRef = processRef;
    this.bounds     = null; // { x, y, width, height } | null
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
    this.bounds       = null; // { x, y, width, height } | null
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

    this.bounds              = null; // { x, y, width?, height? } | null
    this.joinBounds          = null; // { x, y } | null — только у fork-шлюзов
  }
}

export class BpmnSequenceFlow {
  constructor({ id, sourceRef, targetRef, name }) {
    this.id        = id;
    this.sourceRef = sourceRef;
    this.targetRef = targetRef;
    this.name      = name || null;
    this.waypoints = null; // [[x, y], [x, y], ...] | null
    this.labelPos  = null;
  }
}