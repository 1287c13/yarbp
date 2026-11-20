// Контракт типового конвертера ЯРБП.

const ID_RE = /^[a-z][a-z0-9-]*$/;

export function defineConverter(definition) {
  const source = definition || {};
  if (!source.id || !ID_RE.test(source.id)) {
    throw new Error('converter: id должен быть kebab-case строкой');
  }
  if (!Array.isArray(source.names) || !source.names.length) {
    throw new Error('converter "' + source.id + '": нужен непустой names[]');
  }
  if (!source.renderer && typeof source.loadRenderer !== 'function') {
    throw new Error('converter "' + source.id + '": нужен renderer или loadRenderer');
  }

  return Object.freeze({
    id: source.id,
    names: Object.freeze(source.names.slice()),
    title: source.title || source.id,
    description: source.description || '',
    renderer: source.renderer || null,
    loadRenderer: typeof source.loadRenderer === 'function'
      ? source.loadRenderer
      : null,
    suggestions: source.suggestions || null,
  });
}
