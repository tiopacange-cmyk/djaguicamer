# DJANGUI CMR — mise en ligne chez LWS

Application React (Vite) + Supabase. Le site est fait de fichiers statiques,
plus un petit script PHP (`api/send-sms.php`) qui envoie les SMS via LMT Group
sans jamais exposer la clé API au navigateur.

## 1. Préparer la version à envoyer (sur votre ordinateur)

1. Copiez `.env.example` en `.env` et remplissez vos valeurs Supabase
   (tableau de bord Supabase > Project Settings > API).
2. Dans ce dossier, lancez :
   ```
   npm install
   npm run build
   ```
   Cela crée le dossier `dist/` : c'est **son contenu** qu'on met en ligne.

## 2. Envoyer les fichiers sur l'hébergement LWS

1. Panneau LWS > votre domaine > **Gestionnaire de fichiers** (ou un logiciel FTP
   comme FileZilla, avec les accès FTP indiqués par LWS).
2. Ouvrez le dossier racine du site (`htdocs` ou `www`) et supprimez la page
   d'attente de LWS (`index.html` / `index.php` par défaut) si elle existe.
3. Envoyez **tout le contenu** de `dist/` (pas le dossier lui-même) :
   `index.html`, `assets/`, `api/` et les fichiers `.htaccess`.
   Les fichiers commençant par un point sont cachés : activez « afficher les
   fichiers cachés » dans le gestionnaire de fichiers ou FileZilla.

## 3. Configurer l'envoi des SMS (une seule fois)

1. Sur le serveur, dans le dossier `api/`, dupliquez `config.exemple.php`
   et nommez la copie `config.php`.
2. Modifiez `config.php` : clé API, secret et nom d'expéditeur LMT Group,
   puis l'adresse et la clé anon Supabase (les mêmes que dans `.env`).
3. Ne mettez jamais `config.php` sur GitHub (il est ignoré par git). Le
   fichier `api/.htaccess` empêche aussi de le lire depuis un navigateur.

Lors des mises à jour suivantes, renvoyez le contenu de `dist/` **sans écraser**
`api/config.php` sur le serveur (il n'existe pas dans `dist/`, il ne sera donc
pas remplacé si vous ne supprimez pas tout le dossier `api/`).

## 4. Réglages à vérifier

- **HTTPS** : activez le certificat SSL gratuit (Let's Encrypt) dans le panneau
  LWS. Le `.htaccess` redirige automatiquement vers `https://`.
- **PHP** : version 7.4 ou plus récente, avec l'extension cURL (activée par
  défaut chez LWS).
- **Supabase** : dans Authentication > URL Configuration, mettez l'adresse de
  votre site (ex. `https://votre-domaine.com`) dans « Site URL ».

## En cas de problème

- Page blanche : le contenu de `dist/` n'est pas à la racine du site, ou le
  fichier `.htaccess` n'a pas été envoyé.
- SMS non envoyés : ouvrez la console du navigateur (F12). Le message
  « Configuration SMS absente » signifie que `api/config.php` manque ;
  « Session expirée » qu'il faut se reconnecter ; « Clé API SMS non
  configurée » que les valeurs LMT de `config.php` sont vides.
