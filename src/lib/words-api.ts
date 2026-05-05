export interface WordEntry {
  id: number;
  word: string;
  translation: string;
  context: string;
  createdAt: string;
  updatedAt: string;
}

type WordsResponse = {
  words: WordEntry[];
};

export type WordPayload = {
  word: string;
  translation?: string;
  context?: string;
};

const LOCAL_WORDS_KEY = 'mislearn.localWords';

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    },
    ...init
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function readLocalWords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_WORDS_KEY) || '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isWordEntry).sort(sortWords);
  } catch {
    return [];
  }
}

function writeLocalWords(words: WordEntry[]) {
  localStorage.setItem(LOCAL_WORDS_KEY, JSON.stringify(words.sort(sortWords)));
}

function isWordEntry(value: unknown): value is WordEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const word = value as Partial<WordEntry>;
  return (
    typeof word.id === 'number' &&
    typeof word.word === 'string' &&
    typeof word.translation === 'string' &&
    typeof word.context === 'string' &&
    typeof word.createdAt === 'string' &&
    typeof word.updatedAt === 'string'
  );
}

function sortWords(a: WordEntry, b: WordEntry) {
  return b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
}

export function getLocalWordsCount() {
  return readLocalWords().length;
}

export function clearLocalWords() {
  localStorage.removeItem(LOCAL_WORDS_KEY);
}

export async function fetchLocalWords() {
  return readLocalWords();
}

export async function createLocalWord(payload: WordPayload) {
  const now = new Date().toISOString();
  const word: WordEntry = {
    id: Date.now(),
    word: payload.word.trim(),
    translation: payload.translation?.trim() || '',
    context: payload.context?.trim() || '',
    createdAt: now,
    updatedAt: now
  };

  writeLocalWords([word, ...readLocalWords()]);
  return word;
}

export async function deleteLocalWord(id: number) {
  writeLocalWords(readLocalWords().filter((word) => word.id !== id));
}

export async function fetchRemoteWords() {
  const data = await requestJson<WordsResponse>('/api/words');
  return data.words;
}

export async function createRemoteWord(payload: WordPayload) {
  const data = await requestJson<{ word: WordEntry }>('/api/words', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return data.word;
}

export async function deleteRemoteWord(id: number) {
  await requestJson<void>(`/api/words/${id}`, {
    method: 'DELETE'
  });
}

export async function syncLocalWordsToRemote() {
  const localWords = readLocalWords();
  if (localWords.length === 0) {
    return fetchRemoteWords();
  }

  const data = await requestJson<WordsResponse>('/api/words/sync', {
    method: 'POST',
    body: JSON.stringify({ words: localWords })
  });

  clearLocalWords();
  return data.words;
}
