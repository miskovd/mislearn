import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import Database from 'better-sqlite3';

const sessionSecret = 'test-session-secret';

function signedSessionCookie(sessionId: string) {
  const encoded = Buffer.from(sessionId).toString('base64url');
  const signature = createHmac('sha256', sessionSecret).update(sessionId).digest('base64url');
  return `mislearn_session=${encodeURIComponent(`${encoded}.${signature}`)}`;
}

async function waitForHealth(baseUrl: string, getServerError: () => string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not become ready: ${getServerError() || String(lastError || 'unknown error')}`);
}

test('SQLite migration defaults learn rating and word APIs stay scoped to their signed-in owner', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mislearn-words-'));
  const databasePath = join(directory, 'legacy.sqlite');
  const legacy = new Database(databasePath);
  legacy.exec(`CREATE TABLE words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    translation TEXT NOT NULL DEFAULT '',
    context TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
  INSERT INTO words (word, translation, context, created_at, updated_at)
  VALUES ('legacy', 'ancien', '', '2020-01-01', '2020-01-01');`);
  legacy.close();

  const port = 41000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), SQLITE_DB_PATH: databasePath, SESSION_SECRET: sessionSecret },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let serverError = '';
  child.stderr.on('data', (chunk) => { serverError += String(chunk); });

  try {
    await waitForHealth(baseUrl, () => serverError);
    const db = new Database(databasePath);
    const migrated = db.prepare('SELECT learn_rating AS learnRating FROM words WHERE word = ?').get('legacy') as { learnRating: number };
    assert.equal(migrated.learnRating, 0);

    const firstUser = db.prepare("INSERT INTO users (google_sub, email) VALUES (?, ?) RETURNING id").get('user-a', 'a@example.test') as { id: number };
    const secondUser = db.prepare("INSERT INTO users (google_sub, email) VALUES (?, ?) RETURNING id").get('user-b', 'b@example.test') as { id: number };
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run('session-a', firstUser.id, expiresAt);
    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run('session-b', secondUser.id, expiresAt);
    db.close();

    const ownerHeaders = { Cookie: signedSessionCookie('session-a'), 'Content-Type': 'application/json' };
    const otherHeaders = { Cookie: signedSessionCookie('session-b'), 'Content-Type': 'application/json' };
    const createdResponse = await fetch(`${baseUrl}/api/words`, {
      method: 'POST', headers: ownerHeaders,
      body: JSON.stringify({ word: 'work', translation: 'travail', context: 'I work.', learnRating: 2 })
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { word: { id: number; learnRating: number } };
    assert.equal(created.word.learnRating, 2);

    const otherList = await fetch(`${baseUrl}/api/words`, { headers: otherHeaders });
    assert.deepEqual(await otherList.json(), { words: [] });
    for (const [method, suffix, body] of [
      ['PATCH', `/api/words/${created.word.id}/rating`, JSON.stringify({ learnRating: -3 })],
      ['PATCH', `/api/words/${created.word.id}`, JSON.stringify({ word: 'changed', learnRating: -3 })],
      ['DELETE', `/api/words/${created.word.id}`, undefined]
    ] as const) {
      const response = await fetch(`${baseUrl}${suffix}`, { method, headers: otherHeaders, body });
      assert.equal(response.status, 404);
    }

    const ownerList = await fetch(`${baseUrl}/api/words`, { headers: ownerHeaders });
    const ownerData = await ownerList.json() as { words: Array<{ word: string; learnRating: number }> };
    assert.deepEqual(ownerData.words.map(({ word, learnRating }) => ({ word, learnRating })), [{ word: 'work', learnRating: 2 }]);
  } finally {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 1_000))]);
    await rm(directory, { recursive: true, force: true });
  }
});
