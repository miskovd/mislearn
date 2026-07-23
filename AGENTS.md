# Mislearn contributor guide

## Communication

Reply to the repository owner concisely, informatively, and directly. Focus on the essential outcome and avoid unnecessary detail.

## Commands

- `npm run dev` starts Vite and the Express API.
- `npm run lint` checks TypeScript.
- `npm run build` creates the production client.

## Code and tests

Use TypeScript for browser code and keep server routes scoped to the authenticated user. Prefer small, local-first utilities for browser storage. Run the relevant checks before committing. Add or update focused tests for changes to parsing, persistence, permissions, and rating limits.

## Public repository safety

Never commit secrets, API keys, real OAuth client IDs or secrets, session values, user data, SQLite databases, browser exports, or private local notes. Use placeholders in documentation and `.env.local` for local configuration. Do not create or commit `PROGRESS.md`; track public work in GitHub Issues or Projects and keep private notes outside this repository.
