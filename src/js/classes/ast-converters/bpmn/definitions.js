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

export function sizeFor(tag) {
  if (tag === 'startEvent' || tag === 'endEvent' ||
      tag === 'intermediateThrowEvent' || tag === 'intermediateCatchEvent' ||
      tag === 'boundaryEvent') return SIZES.event;
  if (tag === 'exclusiveGateway' || tag === 'parallelGateway' ||
      tag === 'inclusiveGateway' || tag === 'eventBasedGateway') return SIZES.gateway;
  if (tag === 'subProcess') return SIZES.subProcess;
  if (tag === 'dataObjectReference') return SIZES.dataObjectRef;
  if (tag === 'dataStoreReference') return SIZES.dataStoreRef;
  if (tag === 'textAnnotation') return SIZES.textAnnotation;
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
  'инклюзивный': 'inclusiveGateway',
  'событийный':  'eventBasedGateway',
});
export const DEFAULT_GATEWAY_TAG = 'exclusiveGateway';

/**
 * Определения событий BPMN 2.0: `событие = X .тип <вид>`.
 *
 * Неизвестный вид — предупреждение сборки, а не молчание.
 */
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

/** Виды, которые ловят событие (для промежуточных — intermediateCatchEvent). */
export const CATCH_EVENT_DEFINITIONS = Object.freeze(new Set([
  'messageEventDefinition',
  'timerEventDefinition',
  'signalEventDefinition',
  'conditionalEventDefinition',
]));

/** `.направление` у промежуточного события. */
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

/** Оступы артефактов относительно родителя (временно, до автораскладки). */
export const ARTIFACT_OFFSETS = Object.freeze({
  commentAbove:    32,
  dataObjectAbove: 30,
  dataStoreBelow:  30, // от нижней границы пула
});

/** Ключи, которые являются атрибутами узла, а не потоковыми детьми. */
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
  /* Спека BPMN (B-3/B-4): определения событий, boundary, потоки. */
  'направление',
  'прерывающее',
  'условие',
  'по-умолчанию',
]));

/** Ключи — дочерние сущности (артефакты и связи). */
export const ENTITY_KEYS = Object.freeze(new Set([
  'комментарий',
  'данные',
  'данные-вход',
  'данные-выход',
  'база-данных',
  'связь',
]));

/**
 * Всё, что конвертер знает как узел или служебный ключ.
 *
 * Нужен только для диагностики (B-1): если в потоковой позиции встретился
 * ключ не из этого набора, конвертер сообщает об этом, а не теряет узел молча.
 * `ветка` уже разбирается в шлюзе отдельно, `имя` читается у дорожек — они
 * здесь, чтобы не давать ложных предупреждений.
 */
export const KNOWN_NODE_KEYS = Object.freeze(new Set([
  /* потоковые узлы */
  'событие', 'задача', 'шлюз', 'подпроцесс', 'ветка',
  /* структура процесса и дорожки */
  'процесс', 'роли', 'роль',
  /* атрибуты узла (читаются через childValue, потоковыми узлами не являются) */
  ...ATTRIBUTE_KEYS,
  'имя',
  /* артефакты */
  ...ENTITY_KEYS,
]));

/** Является ли узел потоковым ребёнком (порождает цепочку). */
export function isFlowNode(node) {
  if (!node || node.nodeType !== 'MEANING') return false;
  if (!node.key) return false;
  if (ATTRIBUTE_KEYS.has(node.key)) return false;
  if (ENTITY_KEYS.has(node.key)) return false;
  return true;
}

/** Является ли узел артефактом (комментарий, данные, база-данных, связь). */
export function isArtifact(node) {
  if (!node || node.nodeType !== 'MEANING') return false;
  if (!node.key) return false;
  return ENTITY_KEYS.has(node.key);
}