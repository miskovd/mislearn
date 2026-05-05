import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'crypto';
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
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET || 'mislearn-dev-session-secret';
const APP_BASE_URL = process.env.APP_BASE_URL || '';
const SESSION_COOKIE = 'mislearn_session';
const OAUTH_STATE_COOKIE = 'mislearn_oauth_state';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    picture TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    word TEXT NOT NULL,
    translation TEXT NOT NULL DEFAULT '',
    context TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_words_user_created ON words(user_id, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

const wordColumns = db.prepare(`PRAGMA table_info(words)`).all();
if (!wordColumns.some((column) => column.name === 'user_id')) {
  db.exec(`ALTER TABLE words ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_words_user_created ON words(user_id, created_at DESC, id DESC)`);
}

const listWordsStmt = db.prepare(`
  SELECT id, word, translation, context, created_at AS createdAt, updated_at AS updatedAt
  FROM words
  WHERE user_id = ?
  ORDER BY created_at DESC, id DESC
`);

const insertWordStmt = db.prepare(`
  INSERT INTO words (user_id, word, translation, context, created_at, updated_at)
  VALUES (@userId, @word, @translation, @context, COALESCE(@createdAt, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), COALESCE(@updatedAt, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
`);

const getWordStmt = db.prepare(`
  SELECT id, word, translation, context, created_at AS createdAt, updated_at AS updatedAt
  FROM words
  WHERE id = ? AND user_id = ?
`);

const deleteWordStmt = db.prepare(`DELETE FROM words WHERE id = ? AND user_id = ?`);

const getUserBySessionStmt = db.prepare(`
  SELECT users.id, users.email, users.name, users.picture
  FROM sessions
  JOIN users ON users.id = sessions.user_id
  WHERE sessions.id = ? AND sessions.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
`);

const deleteSessionStmt = db.prepare(`DELETE FROM sessions WHERE id = ?`);
const insertSessionStmt = db.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`);
const upsertUserStmt = db.prepare(`
  INSERT INTO users (google_sub, email, name, picture)
  VALUES (@googleSub, @email, @name, @picture)
  ON CONFLICT(google_sub) DO UPDATE SET
    email = excluded.email,
    name = excluded.name,
    picture = excluded.picture,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  RETURNING id, email, name, picture
`);

const app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '64kb' }));

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function encodeSignedCookie(value) {
  return `${base64Url(value)}.${sign(value)}`;
}

function decodeSignedCookie(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }

  const [encoded, signature] = value.split('.');
  if (!encoded || !signature) {
    return '';
  }

  const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  const expected = sign(decoded);
  if (signature.length !== expected.length) {
    return '';
  }

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return '';
  }

  return decoded;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};

  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName) {
      continue;
    }

    cookies[rawName] = decodeURIComponent(rawValue.join('=') || '');
  }

  return cookies;
}

function cookieOptions(req, maxAgeMs) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return [
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

function setSignedCookie(res, req, name, value, maxAgeMs) {
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(encodeSignedCookie(value))}; ${cookieOptions(req, maxAgeMs)}`);
}

function clearCookie(res, name) {
  res.append('Set-Cookie', `${name}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function getOrigin(req) {
  if (APP_BASE_URL) {
    return APP_BASE_URL.replace(/\/$/, '');
  }

  return `${req.protocol}://${req.get('host')}`;
}

function getCurrentUser(req) {
  const sessionId = decodeSignedCookie(parseCookies(req)[SESSION_COOKIE]);
  if (!sessionId) {
    return null;
  }

  return getUserBySessionStmt.get(sessionId) || null;
}

function requireUser(req, res) {
  const user = getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sign in is required.' });
    return null;
  }

  return user;
}

function normalizeWordPayload(body) {
  const word = typeof body?.word === 'string' ? body.word.trim() : '';
  const translation = typeof body?.translation === 'string' ? body.translation.trim() : '';
  const context = typeof body?.context === 'string' ? body.context.trim() : '';
  const createdAt = typeof body?.createdAt === 'string' ? body.createdAt : null;
  const updatedAt = typeof body?.updatedAt === 'string' ? body.updatedAt : createdAt;

  return { word, translation, context, createdAt, updatedAt };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: getCurrentUser(req) });
});

app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.status(503).send('Google sign-in is not configured.');
    return;
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const origin = getOrigin(req);
  const redirectUri = `${origin}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    include_granted_scopes: 'true'
  });

  setSignedCookie(res, req, OAUTH_STATE_COOKIE, state, 1000 * 60 * 10);
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const expectedState = decodeSignedCookie(parseCookies(req)[OAUTH_STATE_COOKIE]);
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';

    if (!expectedState || !state || expectedState !== state || !code) {
      res.status(400).send('Invalid Google sign-in response.');
      return;
    }

    const origin = getOrigin(req);
    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(await tokenResponse.text());
    }

    const tokens = await tokenResponse.json();
    const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    if (!userInfoResponse.ok) {
      throw new Error(await userInfoResponse.text());
    }

    const profile = await userInfoResponse.json();
    if (!profile.sub) {
      throw new Error('Google profile did not include a stable subject.');
    }

    const user = upsertUserStmt.get({
      googleSub: String(profile.sub || ''),
      email: String(profile.email || ''),
      name: String(profile.name || ''),
      picture: String(profile.picture || '')
    });
    const sessionId = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    insertSessionStmt.run(sessionId, user.id, expiresAt);
    setSignedCookie(res, req, SESSION_COOKIE, sessionId, SESSION_TTL_MS);
    clearCookie(res, OAUTH_STATE_COOKIE);
    res.redirect('/');
  } catch (error) {
    console.error('Google sign-in failed:', error);
    res.status(500).send('Google sign-in failed.');
  }
});

app.post('/api/auth/logout', (req, res) => {
  const sessionId = decodeSignedCookie(parseCookies(req)[SESSION_COOKIE]);
  if (sessionId) {
    deleteSessionStmt.run(sessionId);
  }

  clearCookie(res, SESSION_COOKIE);
  res.status(204).send();
});

app.get('/api/words', (req, res) => {
  const user = requireUser(req, res);
  if (!user) {
    return;
  }

  res.json({ words: listWordsStmt.all(user.id) });
});

app.post('/api/words', (req, res) => {
  const user = requireUser(req, res);
  if (!user) {
    return;
  }

  const { word, translation, context, createdAt, updatedAt } = normalizeWordPayload(req.body);

  if (!word) {
    res.status(400).json({ error: 'Word is required.' });
    return;
  }

  const result = insertWordStmt.run({
    userId: user.id,
    word,
    translation,
    context,
    createdAt,
    updatedAt
  });

  const created = getWordStmt.get(result.lastInsertRowid, user.id);

  res.status(201).json({ word: created });
});

app.post('/api/words/sync', (req, res) => {
  const user = requireUser(req, res);
  if (!user) {
    return;
  }

  const words = Array.isArray(req.body?.words) ? req.body.words : [];
  const insertMany = db.transaction((entries) => {
    for (const entry of entries) {
      const payload = normalizeWordPayload(entry);
      if (!payload.word) {
        continue;
      }

      insertWordStmt.run({
        userId: user.id,
        ...payload
      });
    }
  });

  insertMany(words);
  res.json({ words: listWordsStmt.all(user.id) });
});

app.delete('/api/words/:id', (req, res) => {
  const user = requireUser(req, res);
  if (!user) {
    return;
  }

  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid word id.' });
    return;
  }

  const result = deleteWordStmt.run(id, user.id);
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
