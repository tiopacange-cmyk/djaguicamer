# Page — Tableau de bord membre

Surcharge du MASTER pour `MembreScreen` (« Bonjour, [nom] »).
Recherches skill : `"financial dashboard balance summary" --domain product`
(Minimalism & Swiss Style, alertes rouge/vert), `ux` : indicateurs de progression,
chargement qui garde la mise en page, états vides avec message.

## Structure (mobile d'abord, 1 colonne ; contenu limité à 880px)

1. **En-tête vert** : avatar (photo ou initiales sur or), « Bonjour, », nom en h1, groupe,
   logo du groupe ; pastilles rôle + statut (icône + texte).
2. **Carte Tontine** (la seule mise en avant) : montant par tour en grand, n° du tour en cours,
   état de ma cotisation (à jour = vert + coche, non reçue = rouge + alerte), mon tour.
   Elle chevauche le bas de l'en-tête. Le chevauchement n'est activé que si c'est le premier
   élément affiché, sinon un titre gris tomberait sur le vert.
3. **Mes fonds** : grille de cartes (assurance + fonds), barre `role="progressbar"`,
   pourcentage ou « Complet », et le reste à verser écrit en toutes lettres.
4. **Prêts, épargne et services** : liste ; sous 480px, le montant passe sous le libellé.
5. **Historique récent** : icône de sens, libellé, date en français, montant signé.

## États

- Chargement : squelettes aux dimensions des cartes (`aria-busy`), coupés par reduced-motion.
- Vide : carte avec icône et explication, jamais un écran blanc.
- Erreur partielle : bloc repliable « Certaines informations n'ont pas pu être chargées »
  (le détail technique reste accessible sans envahir l'écran).
- Licence expirée / suspendue : carte centrée, `role="alert"`.
