// Единая точка доступа к `localStorage`.

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

export function storedKeys() {
  const store = getStore();
  if (!store) return [];

  try {
    const keys = [];
    for (let index = 0; index < store.length; index++) {
      const key = store.key(index);
      if (key !== null) keys.push(key);
    }
    return keys;
  } catch (e) {
    return [];
  }
}
