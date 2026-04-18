const STORAGE_KEY = 'mislearn.geminiApiKey';

function getWindowStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function getStoredGeminiApiKey() {
  const storage = getWindowStorage();
  if (!storage) {
    return '';
  }

  return storage.getItem(STORAGE_KEY)?.trim() || '';
}

export function setStoredGeminiApiKey(value: string) {
  const storage = getWindowStorage();
  if (!storage) {
    return;
  }

  const normalized = value.trim();
  if (!normalized) {
    storage.removeItem(STORAGE_KEY);
    return;
  }

  storage.setItem(STORAGE_KEY, normalized);
}

export function clearStoredGeminiApiKey() {
  const storage = getWindowStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(STORAGE_KEY);
}

export function getEffectiveGeminiApiKey() {
  return getStoredGeminiApiKey() || (process.env.GEMINI_API_KEY || '').trim();
}

