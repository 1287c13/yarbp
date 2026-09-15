export const NAMESPACES = Object.freeze({
  xsi:    'http://www.w3.org/2001/XMLSchema-instance',
  bpmn:   'http://www.omg.org/spec/BPMN/20100524/MODEL',
  bpmndi: 'http://www.omg.org/spec/BPMN/20100524/DI',
  dc:     'http://www.omg.org/spec/DD/20100524/DC',
  di:     'http://www.omg.org/spec/DD/20100524/DI',
});

export const TARGET_NAMESPACE = 'http://bpmn.io/schema/bpmn';
export const EXPORTER         = 'yarbp';
export const EXPORTER_VERSION = '2.0';

export const INDENT = '  ';

export const SIZES = Object.freeze({
  task:           { width: 100, height: 80  },
  gateway:        { width: 50,  height: 50  },
  event:          { width: 36,  height: 36  },
  dataObjectRef:  { width: 36,  height: 50  },
  dataStoreRef:   { width: 50,  height: 50  },
  textAnnotation: { width: 100, height: 30  },
  subProcess:     { width: 350, height: 200 },
});

export function sizeFor(tag) {
  if (tag === 'startEvent' || tag === 'endEvent' ||
      tag === 'intermediateThrowEvent' || tag === 'intermediateCatchEvent' ||
      tag === 'boundaryEvent') return SIZES.event;
  if (tag === 'exclusiveGateway' || tag === 'parallelGateway' ||
      tag === 'inclusiveGateway' || tag === 'eventBasedGateway') return SIZES.gateway;
  if (tag === 'subProcess') return SIZES.subProcess;
  return SIZES.task;
}

export const TASK_TAG_MAP = Object.freeze({
  'сервис':              'serviceTask',
  'скрипт':              'scriptTask',
  'пользователь':        'userTask',
  'отправка-сообщения':  'sendTask',
  'получение-сообщения': 'receiveTask',
  'бизнес-правило':      'businessRuleTask',
});
export const DEFAULT_TASK_TAG = 'manualTask';

export const GATEWAY_TAG_MAP = Object.freeze({
  'параллельный': 'parallelGateway',
});
export const DEFAULT_GATEWAY_TAG = 'exclusiveGateway';

export const LOCATION = Object.freeze({
  START:        'начало',
  INTERMEDIATE: 'промежуточное',
  END:          'конец',
});

export const LOOP = Object.freeze({
  PARALLEL:   'параллель',
  SEQUENTIAL: 'последовательно',
  STANDARD:   'цикл',
});