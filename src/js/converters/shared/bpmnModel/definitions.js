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
  participant:    { width: 600, height: 250 },
  lane:           { width: 600, height: 250 },
});

// Ширина задачи подгоняется под подпись: внешний просмотрщик рисует текст с переносами, и на фиксированных 100px…
export const LABEL_CHAR_WIDTH = 6.8;
export const TASK_LABEL_PADDING = 24;

const TASK_TAGS = new Set([
  'task', 'manualTask', 'userTask', 'serviceTask', 'scriptTask',
  'sendTask', 'receiveTask', 'businessRuleTask', 'callActivity',
]);

export function sizeFor(tag, name) {
  if (tag === 'startEvent' || tag === 'endEvent' ||
      tag === 'intermediateThrowEvent' || tag === 'intermediateCatchEvent' ||
      tag === 'boundaryEvent') return SIZES.event;
  if (tag === 'exclusiveGateway' || tag === 'parallelGateway' ||
      tag === 'inclusiveGateway' || tag === 'eventBasedGateway') return SIZES.gateway;
  if (tag === 'subProcess') return SIZES.subProcess;
  if (tag === 'dataObjectReference') return SIZES.dataObjectRef;
  if (tag === 'dataStoreReference') return SIZES.dataStoreRef;
  if (tag === 'textAnnotation') return SIZES.textAnnotation;

  const base = SIZES.task;
  if (!name || !TASK_TAGS.has(tag)) return base;

  const needed = Math.ceil(String(name).length * LABEL_CHAR_WIDTH) + TASK_LABEL_PADDING;
  if (needed <= base.width) return base;
  return { width: needed, height: base.height };
}

export const TASK_TAG_MAP = Object.freeze({
  'сервис':              'serviceTask',
  'скрипт':              'scriptTask',
  'пользователь':        'userTask',
  'отправка-сообщения':  'sendTask',
  'получение-сообщения': 'receiveTask',
  'бизнес-правило':      'businessRuleTask',
  'вызов':               'callActivity',
});
export const DEFAULT_TASK_TAG = 'manualTask';

export const GATEWAY_TAG_MAP = Object.freeze({
  'параллельный': 'parallelGateway',
  'инклюзивный': 'inclusiveGateway',
  'событийный':  'eventBasedGateway',
});
export const DEFAULT_GATEWAY_TAG = 'exclusiveGateway';

// Определения событий BPMN 2.0: `событие = X .тип <вид>`.
export const EVENT_DEFINITION_MAP = Object.freeze({
  'сообщение':   'messageEventDefinition',
  'таймер':      'timerEventDefinition',
  'ошибка':      'errorEventDefinition',
  'сигнал':      'signalEventDefinition',
  'эскалация':   'escalationEventDefinition',
  'условие':     'conditionalEventDefinition',
  'компенсация': 'compensateEventDefinition',
  'завершение':  'terminateEventDefinition',
  'ссылка':      'linkEventDefinition',
});

export const CATCH_EVENT_DEFINITIONS = Object.freeze(new Set([
  'messageEventDefinition',
  'timerEventDefinition',
  'signalEventDefinition',
  'conditionalEventDefinition',
]));

export const EVENT_DIRECTION = Object.freeze({
  CATCH: 'ловящее',
  THROW: 'бросающее',
});

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

export const ARTIFACT_OFFSETS = Object.freeze({
  commentAbove:    32,
  dataObjectAbove: 30,
  dataStoreBelow:  30, // от нижней границы пула
});

export const ATTRIBUTE_KEYS = Object.freeze(new Set([
  'ид',
  'тип',
  'роль',
  'х',
  'у',
  'ш',
  'в',
  'х-закр',
  'у-закр',
  'ш-закр',
  'в-закр',
  'расположение',
  'повторение',
  'направление',
  'прерывающее',
  'условие',
  'по-умолчанию',
  'исполняемый',
  'пул',
  'вызывает',
]));

export const ENTITY_KEYS = Object.freeze(new Set([
  'комментарий',
  'данные',
  'данные-вход',
  'данные-выход',
  'база-данных',
  'группа',
  'связь',
]));

// Всё, что конвертер знает как узел или служебный ключ.
export const KNOWN_NODE_KEYS = Object.freeze(new Set([
  'событие', 'задача', 'шлюз', 'подпроцесс', 'ветка',
  'процесс', 'роли', 'роль',
  ...ATTRIBUTE_KEYS,
  'имя',
  ...ENTITY_KEYS,
]));

export function isFlowNode(node) {
  if (!node || node.nodeType !== 'MEANING') return false;
  if (!node.key) return false;
  if (ATTRIBUTE_KEYS.has(node.key)) return false;
  if (ENTITY_KEYS.has(node.key)) return false;
  return true;
}

export function isArtifact(node) {
  if (!node || node.nodeType !== 'MEANING') return false;
  if (!node.key) return false;
  return ENTITY_KEYS.has(node.key);
}