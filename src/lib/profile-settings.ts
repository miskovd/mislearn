export type NativeLanguage = 'fr' | 'uk' | 'ru';

export interface ProfileSettings {
  nativeLanguage: NativeLanguage;
}

const STORAGE_KEY = 'mislearn.profileSettings';

const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  nativeLanguage: 'fr'
};

const LANGUAGE_LABELS: Record<NativeLanguage, string> = {
  fr: 'French',
  uk: 'Ukrainian',
  ru: 'Russian'
};

const LANGUAGE_NATIVE_LABELS: Record<NativeLanguage, string> = {
  fr: 'Français',
  uk: 'Українська',
  ru: 'Русский'
};

function getWindowStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function getDefaultProfileSettings() {
  return { ...DEFAULT_PROFILE_SETTINGS };
}

export function getStoredProfileSettings(): ProfileSettings {
  const storage = getWindowStorage();
  if (!storage) {
    return getDefaultProfileSettings();
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultProfileSettings();
    }

    const parsed = JSON.parse(raw) as Partial<ProfileSettings>;
    if (parsed.nativeLanguage === 'fr' || parsed.nativeLanguage === 'uk' || parsed.nativeLanguage === 'ru') {
      return {
        nativeLanguage: parsed.nativeLanguage
      };
    }
  } catch {
    // fall back to defaults
  }

  return getDefaultProfileSettings();
}

export function setStoredProfileSettings(settings: ProfileSettings) {
  const storage = getWindowStorage();
  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getLanguageLabel(language: NativeLanguage) {
  return LANGUAGE_LABELS[language];
}

export function getLanguageNativeLabel(language: NativeLanguage) {
  return LANGUAGE_NATIVE_LABELS[language];
}

