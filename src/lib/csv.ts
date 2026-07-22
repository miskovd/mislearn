import type { WordEntry, WordPayload } from './words-api';

export type ImportConflictOption = 'keep' | 'replace';
export const IMPORT_OPTIONS_KEY = 'mislearn.importConflictOption';

export interface ImportPlan {
  creates: WordPayload[];
  updates: Array<{ id: number; payload: WordPayload }>;
  skipped: number;
}

export function normalizeWordKey(word: string) {
  return word.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function clampRating(value: number) {
  return Math.max(-3, Math.min(3, Math.trunc(value)));
}

function escape(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function wordsToCsv(words: WordEntry[]) {
  return ['word,translation,context,learnRating', ...words.map((word) =>
    [word.word, word.translation, word.context, word.learnRating].map(escape).join(','))].join('\r\n');
}

export function parseCsv(csv: string): { entries: WordPayload[]; skipped: number } {
  const rows: string[][] = [];
  let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted value.');
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const header = rows.shift()?.map((item) => item.trim());
  if (!header || header.join(',') !== 'word,translation,context,learnRating') throw new Error('CSV must use word, translation, context, learnRating headers.');
  let skipped = 0;
  const seen = new Set<string>();
  const entries: WordPayload[] = [];
  for (const rowValue of rows) {
    const [word = '', translation = '', context = '', rawRating = '0'] = rowValue;
    const key = normalizeWordKey(word);
    const rating = Number(rawRating);
    if (!key || !Number.isInteger(rating) || rating < -3 || rating > 3 || seen.has(key)) { skipped += 1; continue; }
    seen.add(key); entries.push({ word: word.trim(), translation: translation.trim(), context: context.trim(), learnRating: rating });
  }
  return { entries, skipped };
}

export function buildImportPlan(existingWords: WordEntry[], importedEntries: WordPayload[], option: ImportConflictOption): ImportPlan {
  const existingByWord = new Map(existingWords.map((word) => [normalizeWordKey(word.word), word]));
  const plan: ImportPlan = { creates: [], updates: [], skipped: 0 };

  for (const entry of importedEntries) {
    const matching = existingByWord.get(normalizeWordKey(entry.word));
    if (!matching) {
      plan.creates.push(entry);
      continue;
    }
    if (option === 'keep') {
      plan.skipped += 1;
      continue;
    }
    plan.updates.push({ id: matching.id, payload: entry });
  }

  return plan;
}
