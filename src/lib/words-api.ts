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

type WordPayload = {
  word: string;
  translation?: string;
  context?: string;
};

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

export async function fetchWords() {
  const data = await requestJson<WordsResponse>('/api/words');
  return data.words;
}

export async function createWord(payload: WordPayload) {
  const data = await requestJson<{ word: WordEntry }>('/api/words', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return data.word;
}

export async function deleteWord(id: number) {
  await requestJson<void>(`/api/words/${id}`, {
    method: 'DELETE'
  });
}
