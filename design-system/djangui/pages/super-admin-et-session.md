# Pages — Super Admin, barre de session, écrans centrés

Complète `admin-groupe.md` : l'écran Super Admin (Tableau de bord, Groupes, SMS, Tarifs,
Journal d'audit, Thème) utilise les mêmes composants et classes `adm-*`.

## Barre de session (`.barre-session`)

- Bande sombre `#0E1411`, 56px : avatar à initiales (or), « Connecté : **Nom** »,
  pastille « Super Admin », alerte d'abonnement en or avec icône horloge.
- Boutons 40px (44px sur mobile) : « Mon espace personnel » (`aria-pressed`, or quand actif)
  et « Déconnexion ».
- Sous 640px : le nom est masqué visuellement mais reste lu par les lecteurs d'écran ;
  les libellés longs deviennent « Mon espace » / « Administration ».

## Écrans centrés (`.page-centree`)

- Changement de mot de passe : même carte que la connexion (`.carte-auth`, `.champ`,
  `.btn-principal`), `autocomplete="new-password"`, erreur en `role="alert"` reliée aux champs.
- Chargement : texte seul, `role="status"`.
- « Aucun rôle actif » : carte avec icône, titre et explication.

## Tableaux sur petit écran

Chaque tableau reçoit une largeur minimale de 105px par colonne : il défile dans son cadre
plutôt que de couper les mots (`overflow-wrap: break-word`, jamais `anywhere`).

## Statuts

« Prévue » (séance) passe en or, comme tous les états « en cours » ; le rouge reste
réservé aux retards, erreurs et suspensions.
