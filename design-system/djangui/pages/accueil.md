# Page — Accueil / Connexion (v3)

Surcharge du MASTER pour `ConnexionScreen`. Le reste de l'application garde l'identité Ndop indigo ;
seul cet écran est allégé en bleu, à la demande du client.

## Structure

1. **Panneau de présentation** (clair, légère lueur or) :
   - logo cauri + « DJANGUI CMR » / « By 3Tsolution Sarl » ;
   - slogan « Votre tontine, *claire et sereine.* » (Unbounded) et une phrase d'introduction ;
   - **illustration « finance moderne »** (`IllustrationFinance`, SVG dessiné pour l'app) :
     téléphone avec l'épargne, graphique en hausse, notification « Cotisation reçue »,
     piles de pièces FCFA, cauris, cercle des 4 membres de la tontine ;
   - trois pastilles : Chaque franc tracé · Confirmation par SMS · Accès selon le rôle.
   - Le motif **Ndop** n'est plus qu'une bande de 26px sur le bord droit (20px en haut sur mobile),
     la **frise Toghu** borde le bas du panneau.
2. **Formulaire** inchangé : carte blanche, bouton or « Se connecter ».

## Tailles d'écran

| Écran | Disposition |
|---|---|
| PC ≥ 901px | Deux colonnes ; l'image est limitée à 44 % de la hauteur d'écran ; sous 820px de haut, la phrase d'introduction disparaît |
| Tablette 601–900px | Panneau au-dessus du formulaire, image ≤ 240px, pastilles remplacées par la liste sous le formulaire |
| Téléphone ≤ 600px | Titre 22px, sans phrase d'introduction, image ≤ 150px : le formulaire apparaît dès le premier écran |

## Règles

- Pas de photo : l'illustration est vectorielle (légère en 3G, nette partout, sans droits d'auteur).
  Une vraie photo pourra la remplacer si le client fournit un fichier dont il a les droits.
- **Mode sombre par défaut** (choix du client). Le bouton en haut à droite propose l'action inverse
  (« Mode clair » en sombre, « Mode sombre » en clair). Le panneau suit les tokens (`--surface`),
  le titre de la carte passe en `--ink`.

## Page de connexion d'un groupe (lien `/slug`)

- Adresse : `djangui.3tsolutioncm.com/<slug>` (ex. `/armens`). Le `.htaccess` renvoie toute adresse
  inconnue vers `index.html` ; `lireSlugAdresse()` lit le premier segment.
- Données lues sans connexion par la fonction Supabase `get_vitrine_groupe(p_slug)` :
  nom, logo et slogan uniquement.
- Changements : logo du groupe (72px, rond) à la place du cauri, nom du groupe et « Espace des
  membres », slogan en titre (après la première virgule en doré), accueil et formulaire au nom du
  groupe, « Propulsé par DJANGUI CMR · By 3Tsolution Sarl » sous les pastilles, nom dans l'onglet.
- Inchangés : illustration et ses textes, les 3 pastilles, formulaire, mode sombre.
- Sans slogan, le titre DJANGUI CMR reste ; sans logo, le cauri reste ; lien inconnu = page normale.
- Réglage : Super Admin → Groupes → Modifier (lien, bouton « Copier le lien », slogan, logo).
  Liens réservés : `api`, `assets`, `index`, `admin`, `connexion`.
