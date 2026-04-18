
## Exécution locale

**Prérequis :** Node.js et une clé `GEMINI_API_KEY` valide.

1. Installer les dépendances :
   `npm install`
2. Définir `GEMINI_API_KEY` dans `.env.local`.
3. Démarrer l’application complète :
   `npm run dev`

Cela lance :
* le frontend Vite sur `http://localhost:3000`
* l’API SQLite sur `http://127.0.0.1:8787`

La liste des mots est stockée dans `data/words.sqlite`.

Une clé Gemini peut aussi être enregistrée localement dans le navigateur via le bouton `API Key`. Si aucune clé n'est stockée dans le navigateur, l'application utilise `GEMINI_API_KEY` quand elle est définie pendant le développement ou le déploiement.

## Déploiement sur VPS

1. Installer les dépendances sur le serveur :
   `npm install`
2. Définir les variables d’environnement :
   `GEMINI_API_KEY`, et éventuellement `PORT` et `SQLITE_DB_PATH`
3. Compiler le frontend :
   `npm run build`
4. Démarrer le backend :
   `npm run start`

`npm run start` sert le frontend compilé depuis `dist/` et expose l’API SQLite dans le même processus. Un seul service suffit donc derrière Nginx ou tout autre reverse proxy.
