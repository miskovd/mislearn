# Mislearn

Mislearn is a live English tutor built with Vue, Vite, Express, SQLite, and Gemini Live audio. It helps you practice speaking, corrects mistakes in real time, and keeps a personal vocabulary notebook on the same server.

## What it does

- Live speaking practice with voice input and audio replies
- Gentle corrections and short explanations during conversation
- Vocabulary practice for saved words in both directions
- A local SQLite notebook for words, translations, and context
- Per-user language settings stored in the browser

## Requirements

- Node.js
- A valid `GEMINI_API_KEY`

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Add your key to `.env.local`:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
3. Start the app:
   ```bash
   npm run dev
   ```

`npm run dev` starts both services:

- Frontend: `http://localhost:3000`
- API server: `http://127.0.0.1:8787`

## PWA

Mislearn now includes a web app manifest and service worker. After you open the production build on `localhost` or over HTTPS, the browser can install it as a PWA from the install button or browser menu.

## How It Works

- The app uses your browser microphone for live practice.
- If you save a Gemini key in the app, that browser-stored key takes priority.
- If no browser key is saved, the app falls back to `GEMINI_API_KEY`.
- Vocabulary entries are stored in `data/words.sqlite`.
- The SQLite database runs in WAL mode and persists across restarts.

## Local Docker

For local testing, stop the previous container, rebuild the image, and start a fresh container:

```bash
docker stop mislearn 2>/dev/null || true
docker build -t mislearn .
docker run -d --name mislearn -p 8787:8787 \
  -e GEMINI_API_KEY=your_api_key_here \
  -v "$(pwd)/data:/app/data" \
  mislearn
```

If you prefer a one-line helper, you can also define:

```bash
alias mislearn-up='docker stop mislearn 2>/dev/null || true; docker build -t mislearn .; docker run -d --name mislearn -p 8787:8787 -e GEMINI_API_KEY=your_api_key_here -v "$(pwd)/data:/app/data" mislearn'
```

## Configuration

| Setting | Where | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | `.env.local` or server environment | Used for Gemini Live access |
| `PORT` | Server environment | Port for the Express app, default `8787` |
| `SQLITE_DB_PATH` | Server environment | Custom path for the SQLite database |

## Supported Native Languages

- French
- Ukrainian
- Russian

You can change the native language from the profile button in the app. That language is used for explanations, translations, and practice prompts.

## Production Deployment

1. Install dependencies on the server:
   ```bash
   npm install
   ```
2. Set the environment variables you need:
   - `GEMINI_API_KEY`
   - Optional: `PORT`
   - Optional: `SQLITE_DB_PATH`
3. Build the frontend:
   ```bash
   npm run build
   ```
4. Start the server:
   ```bash
   npm run start
   ```

`npm run start` serves the compiled frontend from `dist/` and exposes the SQLite API from the same process, so you only need one service behind a reverse proxy such as Nginx.

## Useful Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run the frontend and API together in development |
| `npm run dev:client` | Start only the Vite frontend |
| `npm run dev:server` | Start only the API server |
| `npm run build` | Build the production frontend |
| `npm run start` | Start the production server |
| `npm run preview` | Preview the built frontend |
| `npm run lint` | Type-check the project |

## Data Storage

- Word data lives in `data/words.sqlite`
- SQLite WAL files may appear next to the database during use
- Browser preferences are stored in `localStorage` on the current device
