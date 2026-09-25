# Pages — Espace Admin Groupe

Surcharge du MASTER pour `AdminGroupeScreen` : Séances, Tontine, Banque, Assurance, Fonds,
Dépenses, Dépôt / Retrait externe, Bilan, SMS, Membres.
Écran de gestion dense : densité « standard », pas de décor en dehors du menu.

## Mise en page

- **Menu latéral** (240px, vert de marque, filet or en haut) : vrais `<button>`,
  `aria-current="page"` sur la page active, repère or à gauche + fond éclairci.
  Sous 900px, il devient une bande horizontale défilante au-dessus du contenu.
- **Contenu** : fond `--bg`, marges 32px (16px sur mobile).
- **En-tête de page** (`.adm-entete`) : titre 26px (`.adm-titre`), sous-titre `--muted`
  (`.adm-sous-titre`), actions à droite qui passent à la ligne si besoin.

## Composants

| Composant | Règle |
|---|---|
| `btnPrimary` | Vert plein `--primary`, 44px de haut, **plus de dégradé** vert→or |
| `btnSecondary` | Blanc, bordure `--border-strong`, texte vert |
| `.adm-btn-valider` | Bouton de validation pleine largeur dans les modales (48px) |
| `.adm-btn-ligne` | Actions dans les lignes de tableau : neutre par défaut, `-danger` (rouge) pour supprimer/désactiver, `-plein` pour l'action principale. 36px à la souris, 44px sur écran tactile |
| `Table` | Carte blanche, en-tête `--surface-sunken` en petites capitales, lignes 56px, survol, chiffres tabulaires |
| `Badge` | 13px, première lettre en capitale (« En cours », plus « En Cours ») |
| `Modal` | `role="dialog"` nommé par son titre, bouton Fermer 44px avec libellé, fond assombri 55 % |
| `FormField`, `.adm-input` | Libellé 14px relié au champ, champ 44px, bordure `--border-strong` (≥ 3:1), focus vert + halo or |
| `.adm-msg-*` | Erreur (`role="alert"`), succès (`role="status"`), info |
| `StatCard` | Pastille d'icône, valeur 22px non coupée, 4 par ligne max sur ordinateur |

## Couleurs

- Palette `C` alignée sur les tokens ; couleurs par module (`vifBleu`, `vifRose`…) assombries
  pour être lisibles en texte (≥ 4,5:1 sur blanc et sur leur teinte claire).
- « En cours » (tour, prêt, fonds) = or (`vifOr` sur `#FBF1DC`) ; le rouge reste réservé
  aux retards, amendes, erreurs et à l'assurance sous le minimum.
- Plus aucun texte sous 12px ; corps 14–15px.
