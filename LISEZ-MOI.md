# Tontine Les Bâtisseurs — Prototype à héberger

Ce dossier contient le projet complet, prêt à déployer gratuitement.

## Configuration Supabase (obligatoire avant de lancer le projet)

1. Copie `.env.example` en `.env` et remplis avec tes vraies valeurs Supabase (Project Settings > API dans ton tableau de bord Supabase).
2. Ouvre `src/App.jsx` et remplace la ligne :
   ```js
   const GROUP_ID = "REMPLACE-MOI-PAR-LE-VRAI-GROUP-ID";
   ```
   par l'UUID réel d'un groupe existant dans ta table `groups` (crée d'abord une ligne manuellement dans Supabase si besoin, via Table Editor).
3. Pour l'instant, seul le module **Membres** est branché sur Supabase (voir `src/lib/membres.js`). Les autres modules (Tontine, Banque, Assurance, Dépôts) utilisent encore la sauvegarde locale du navigateur (localStorage) — on les connectera un par un ensuite.

## Option la plus simple — Netlify (glisser-déposer, aucune ligne de commande)

1. Ouvre un terminal dans ce dossier et lance :
   ```
   npm install
   npm run build
   ```
   Cela crée un dossier `dist/`.
2. Va sur https://app.netlify.com/drop
3. Glisse-dépose le dossier `dist/` dans la page.
4. Netlify te donne immédiatement une adresse en ligne (ex. `https://ton-nom.netlify.app`), gratuite, que tu peux partager pour les tests.

## Option Vercel (aussi gratuite, un peu plus technique)

1. Crée un compte gratuit sur https://vercel.com
2. Installe l'outil Vercel : `npm install -g vercel`
3. Dans ce dossier, lance : `vercel`
4. Réponds aux questions (garde les valeurs par défaut), Vercel déploie et te donne un lien.

## Important à savoir

- Les modules pas encore branchés sur Supabase (Tontine, Banque, Assurance, Dépôts) sauvegardent encore **dans le navigateur** (localStorage) : chaque testeur a ses propres données, pas partagées.
- Une fois **Membres** branché et testé avec succès, dis-le à Claude pour qu'on connecte les modules suivants un par un, exactement de la même façon.
- Ce prototype reste un **frontend seul** : pas encore de vrai système de connexion (email/mot de passe), pas de connexion Mobile Money réelle. Ça viendra à l'étape suivante.

