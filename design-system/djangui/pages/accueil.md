# Page — Accueil / Connexion

Surcharge du MASTER pour le premier écran de l'application (`ConnexionScreen`).

## Structure

1. **Panneau de marque** (vert `--primary`), à gauche sur ordinateur, bandeau compact en haut sur mobile :
   - logo + « DJANGUI », « par Three T Solutions » ;
   - titre de mission : « Votre tontine, claire et sereine. » ;
   - 3 preuves de confiance, chacune avec une icône Lucide :
     cotisations suivies tour par tour · confirmation SMS à chaque opération · accès sécurisé selon le rôle.
     Sur mobile, les preuves passent sous le formulaire, en liste compacte.
2. **Formulaire** (carte `--surface`) : sur-titre doré, titre, identifiant, mot de passe, lien
   « Mot de passe oublié ? », bouton principal pleine largeur.
3. **Pied de page** : crédit Three T Solutions.

## Règles propres à la page

- Un seul appel à l'action : « Se connecter ».
- Le motif en damier or/vert (clin d'œil au tissu) reste un filet de 4px en haut du panneau, pas plus.
- Bascule clair/sombre : vrai `<button>` avec `aria-pressed`, cible 44px.
- Mise en page : grille 2 colonnes (≥ 900px) → 1 colonne.
