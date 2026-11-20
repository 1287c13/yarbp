/**
 * Реестр конвертеров ЯРБП.
 *
 * Каждый конвертер описывает себя в `./<id>/index.js` через
 * `defineConverter` (см. `contract.js`). Реестр только:
 *  - строит карту «имя директивы → описание»;
 *  - выбирает конвертер по `! как …`;
 *  - лениво загружает тяжёлые рендереры и кэширует `import()`.
 *
 * Публичный API (`YarbpFlavor`, `prefetchFlavors`) сохранён: им пользуются
 * `app.js` и тесты. Новые конвертеры не должны импортировать чужие каталоги —
 * только `shared/` и `core/`.
 */

import { lexerConverter } from './lexer/index.js';
import { astConverter } from './ast/index.js';
import { jsonConverter } from './json/index.js';
import { xmlConverter } from './xml/index.js';
import { protobufConverter } from './protobuf/index.js';
import { uiConverter } from './ui/index.js';
import { xpmConverter } from './xpm/index.js';
import { bpmnConverter } from './bpmn/index.js';
import { openapiConverter } from './openapi/index.js';
import { jsonSchemaConverter } from './json-schema/index.js';
import { mermaidConverter } from './mermaid/index.js';
import { flexFormsConverter } from './flexforms/index.js';

/** Все зарегистрированные конвертеры в порядке приоритета. */
export const CONVERTER_DEFINITIONS = Object.freeze([
  lexerConverter,
  astConverter,
  jsonConverter,
  xmlConverter,
  protobufConverter,
  uiConverter,
  xpmConverter,
  bpmnConverter,
  openapiConverter,
  jsonSchemaConverter,
  mermaidConverter,
  flexFormsConverter,
]);

/** Ключ карты: `! как Форма-ТСД` → `форматсд`. */
function converterKey(name) {
  return String(name ?? '').replaceAll(/[\s\-_()]/g, '').toLowerCase();
}

const FlavorMap = new Map(
  CONVERTER_DEFINITIONS.flatMap(converter =>
    converter.names.map(name => [converterKey(name), converter])
  )
);

/** Конвертер по id (`json`, `json-schema`, …). */
export function getConverterById(id) {
  return CONVERTER_DEFINITIONS.find(converter => converter.id === id) || null;
}

/** Конвертер по имени директивы (`форматсд`, `json`, …). */
export function findConverter(name) {
  return FlavorMap.get(converterKey(name)) || null;
}

/* Один import() на конвертер: выбранный рендерер и фоновый prefetch делят
   результат, поэтому модуль не запрашивается дважды. */
const RendererPromises = new WeakMap();

function loadFlavorRenderer(flavorData) {
  if (!flavorData) return Promise.resolve(null);
  if (flavorData.renderer) return Promise.resolve(flavorData.renderer);
  if (typeof flavorData.loadRenderer !== 'function') return Promise.resolve(null);

  let pending = RendererPromises.get(flavorData);
  if (!pending) {
    pending = flavorData.loadRenderer().catch(error => {
      RendererPromises.delete(flavorData);
      throw error;
    });
    RendererPromises.set(flavorData, pending);
  }
  return pending;
}

/**
 * Фоновая догрузка тяжёлых конвертеров. Вызывается после первого рендера
 * выбранного конвертера: интерфейс уже готов, остальные рендереры догружаются
 * в фоне и при переключении не ждут сеть.
 */
export function prefetchFlavors() {
  const dynamicFlavors = CONVERTER_DEFINITIONS
    .filter(converter => typeof converter.loadRenderer === 'function');
  return Promise.allSettled(dynamicFlavors.map(loadFlavorRenderer));
}

export class YarbpFlavor {
  constructor(flavorDirective) {
    this.flavorName = this.normalizeFlavorName(flavorDirective);
    this.flavorData = FlavorMap.get(this.flavorName);
  }

  /**
   * Класс рендерера: статический для лёгких конвертеров, динамический импорт —
   * для тяжёлых. Выбранный конвертер загружается первым; остальные догружаются
   * в фоне (см. `prefetchFlavors`).
   */
  async loadRenderer() {
    return loadFlavorRenderer(this.flavorData);
  }

  /**
   * Директива выбора конвертера: `! как …` / `! as …`.
   *
   * Нужна, чтобы языковые директивы (`! импорт`, `! разбор-сахара`)
   * можно было ставить выше `! как`: редактор ищет первую именно
   * флейворную директиву, а не просто первую `DIRECTIVE`.
   */
  static isFlavorDirective(value) {
    return /^\s*(?:as|как)(?=[\s\-_]|$)/i.test(String(value ?? ''));
  }

  /**
   * Директива → «сплющенное» имя конвертера: `! как Форма-ТСД` → `форматсд`.
   *
   * Директива не чувствительна к регистру, лишним пробелам, дефисам и
   * подчёркиваниям: `! AS json`, `! as-json`, `! как  JSON` — одно и то же.
   * Без ведущего `as`/`как` директива конвертером не считается (undefined).
   *
   * Граница после `as`/`как` проверяется lookahead-ом, а не `\b`: в JS `\b`
   * опирается на ASCII-`\w`, поэтому для «как» он не срабатывает.
   */
  normalizeFlavorName(directive) {
    const match = String(directive ?? '').match(
      /^\s*(?:as|как)(?=[\s\-_]|$)\s*(.+)$/i);
    if (!match) return undefined;

    const name = match[1].replaceAll(/[\s\-_()]/g, '').toLowerCase();
    return name || undefined;
  }
}
