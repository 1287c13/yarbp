/**
 * Единая точка доступа к `localStorage`.
 *
 * Хранилище — это удобство, а не данные: оно может отсутствовать, бросать при
 * чтении (жёсткая политика приватности) и бросать при записи (квота). Раньше
 * `try/catch` стоял в трёх местах из семи, а чтение настроек на верхнем уровне
 * модуля (`app.js` — тема, `FileManager` — раскрытая папка) при запрете
 * хранилища валило инициализацию всего редактора.
 *
 * Контракт: ни одна функция не бросает исключение.
 *   readStored(key, fallback) — значение или fallback;
 *   writeStored(key, value)   — true, если записалось (false = квота/запрет);
 *   removeStored(key)         — true, если удалилось;
 *   clearStored()             — true, если очистилось.
 *
 * Обращение к `window.localStorage` идёт на каждом вызове намеренно: сам
 * доступ к свойству может бросить, поэтому кэшировать ссылку нельзя, а в
 * тестах хранилище подменяется между вызовами.
 */

function getStore() {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage || null;
  } catch (e) {
    return null;
  }
}

export function readStored(key, fallback = null) {
  const store = getStore();
  if (!store) return fallback;

  try {
    const value = store.getItem(key);
    return value === null ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

export function writeStored(key, value) {
  const store = getStore();
  if (!store) return false;

  try {
    store.setItem(key, String(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function removeStored(key) {
  const store = getStore();
  if (!store) return false;

  try {
    store.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

export function clearStored() {
  const store = getStore();
  if (!store) return false;

  try {
    store.clear();
    return true;
  } catch (e) {
    return false;
  }
}
