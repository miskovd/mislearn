import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const defaultDbPath = path.join(projectRoot, 'data', 'words.sqlite');

const PORT = Number(process.env.PORT || 8787);
const DB_PATH = process.env.SQLITE_DB_PATH || defaultDbPath;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    translation TEXT NOT NULL DEFAULT '',
    context TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

const listWordsStmt = db.prepare(`
  SELECT id, word, translation, context, created_at AS createdAt, updated_at AS updatedAt
  FROM words
  ORDER BY created_at DESC, id DESC
`);

const insertWordStmt = db.prepare(`
  INSERT INTO words (word, translation, context)
  VALUES (@word, @translation, @context)
`);

const deleteWordStmt = db.prepare(`DELETE FROM words WHERE id = ?`);

const app = express();

app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/words', (_req, res) => {
  res.json({ words: listWordsStmt.all() });
});

app.post('/api/words', (req, res) => {
  const word = typeof req.body?.word === 'string' ? req.body.word.trim() : '';
  const translation = typeof req.body?.translation === 'string' ? req.body.translation.trim() : '';
  const context = typeof req.body?.context === 'string' ? req.body.context.trim() : '';

  if (!word) {
    res.status(400).json({ error: 'Word is required.' });
    return;
  }

  const result = insertWordStmt.run({
    word,
    translation,
    context
  });

  const created = db.prepare(`
    SELECT id, word, translation, context, created_at AS createdAt, updated_at AS updatedAt
    FROM words
    WHERE id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ word: created });
});

app.delete('/api/words/:id', (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid word id.' });
    return;
  }

  const result = deleteWordStmt.run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Word not found.' });
    return;
  }

  res.status(204).send();
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }));

  app.get(/^\/(?!api).*/, (req, res, next) => {
    if (req.accepts('html')) {
      res.sendFile(path.join(distDir, 'index.html'));
      return;
    }
    next();
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SQLite API listening on http://0.0.0.0:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
