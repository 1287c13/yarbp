// Реестр конвертеров ЯРБП.

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

function converterKey(name) {
  return String(name ?? '').replaceAll(/[\s\-_()]/g, '').toLowerCase();
}

const FlavorMap = new Map(
  CONVERTER_DEFINITIONS.flatMap(converter =>
    converter.names.map(name => [converterKey(name), converter])
  )
);

export function getConverterById(id) {
  return CONVERTER_DEFINITIONS.find(converter => converter.id === id) || null;
}

export function findConverter(name) {
  return FlavorMap.get(converterKey(name)) || null;
}

// Один import() на конвертер: выбранный рендерер и фоновый prefetch делят результат, поэтому модуль не запрашивается…
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

// Фоновая догрузка остальных конвертеров: по одному, после первого рендера.
// `exclude` — id уже показанного конвертера; его рендерер не загружаем повторно.
export async function prefetchFlavors(options = {}) {
  const exclude = options && options.exclude ? String(options.exclude) : '';
  const dynamicFlavors = CONVERTER_DEFINITIONS
    .filter(converter => typeof converter.loadRenderer === 'function' &&
      converter.id !== exclude);

  const results = [];
  for (const converter of dynamicFlavors) {
    try {
      const value = await loadFlavorRenderer(converter);
      results.push({ status: 'fulfilled', value });
    } catch (reason) {
      results.push({ status: 'rejected', reason });
    }
    // Дадим браузеру кадр между импортами: фон не должен спорить с вводом.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return results;
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

  // Директива выбора конвертера: `! как …` / `! as …`.
  static isFlavorDirective(value) {
    return /^\s*(?:as|как)(?=[\s\-_]|$)/i.test(String(value ?? ''));
  }

  // Директива → «сплющенное» имя конвертера: `! как Форма-ТСД` → `форматсд`.
  normalizeFlavorName(directive) {
    const match = String(directive ?? '').match(
      /^\s*(?:as|как)(?=[\s\-_]|$)\s*(.+)$/i);
    if (!match) return undefined;

    const name = match[1].replaceAll(/[\s\-_()]/g, '').toLowerCase();
    return name || undefined;
  }
}
