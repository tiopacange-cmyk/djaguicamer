# Djangui — Design System (MASTER)

> Source de vérité globale. Une page qui a un fichier dans `pages/<page>.md`
> suit ses règles en priorité ; sinon elle suit ce fichier.
>
> Généré avec le skill **UI UX Pro Max**
> (`search.py "fintech community savings tontine mobile trust" --design-system`
> + recherches `color`, `typography`, `product`, `ux`), puis ajusté à la marque
> Djangui existante et vérifié en contraste WCAG.

## 1. Positionnement

| | |
|---|---|
| Produit | Gestion de tontine / djangui : cotisations, tours, épargne, prêts, assurance, séances |
| Public | Membres et bureaux d'associations (Président, Trésorier, Admin), souvent sur mobile Android, réseau variable |
| Ce qu'on doit ressentir | **Confiance, transparence, sérieux**, avec la chaleur d'une communauté |
| Pattern (skill) | *Trust & Authority* : crédibilité d'abord, preuves (SMS, traçabilité), un seul appel à l'action clair |
| Style (skill) | *Minimalism & Swiss Style* : grille propre, beaucoup d'air, contraste fort, peu d'effets |
| Densité / Mouvement | Standard (5/10) / Subtil (3/10) |

### Écarts volontaires par rapport à la sortie brute du skill

- **Accent violet `#8B5CF6` rejeté.** Le skill le propose (palette « Fintech/Crypto ») mais
  classe lui-même les « AI purple/pink gradients » en anti-pattern, et le violet n'a
  aucun ancrage dans la marque. On garde le couple **vert profond + or** déjà en place
  (thème « Vert profond »), qui correspond aux palettes « Navy + premium gold » et
  « Felt green + gold » du skill : l'or signale la valeur, le vert la stabilité.
- **Or décoratif ≠ or texte.** L'or de marque `#C9971D` n'atteint que 2,65:1 sur
  blanc : il sert aux surfaces, filets et icônes, jamais au texte courant sur fond clair.
  Le texte doré utilise `--gold-text`.

## 2. Couleurs (tokens sémantiques)

Déclarées dans `src/index.css` (`:root` et `[data-theme="dark"]`). Les composants
utilisent les tokens, pas des hex bruts.

| Token | Clair | Sombre | Rôle | Contraste vérifié |
|---|---|---|---|---|
| `--bg` | `#F7F5EF` | `#0E1411` | Fond de page (papier chaud) | — |
| `--surface` | `#FFFFFF` | `#161E1A` | Cartes, formulaires | — |
| `--surface-sunken` | `#FBFAF6` | `#111814` | Champs de saisie | — |
| `--ink` | `#14201A` | `#EEF2EC` | Texte principal | 15,4:1 / 16,5:1 |
| `--muted` | `#56645B` | `#A3B1A7` | Texte secondaire, libellés | 6,2:1 / 7,6:1 |
| `--border` | `#E3DED0` | `#2A3530` | Séparateurs décoratifs | — |
| `--border-strong` | `#858F87` | `#66756B` | Bordure des champs (non-texte ≥ 3:1) | 3,35:1 / 3,5:1 |
| `--primary` | `#0F5132` | idem (suit le thème) | Bouton principal, marque | texte blanc 9,4:1 |
| `--on-primary` | `#FFFFFF` | `#FFFFFF` | Texte sur primaire | — |
| `--gold` | `#C9971D` | `#E0B24A` | Or de marque (décor, icônes) | — |
| `--gold-text` | `#8A6410` | `#E0B24A` | Liens / sur-titres dorés | 5,4:1 / 8,6:1 |
| `--danger` / `--danger-bg` | `#A4331F` / `#FBE9E4` | `#F2A08E` / `#2A1712` | Erreurs | 5,8:1 / 8,3:1 |
| `--success` / `--success-bg` | `#0F5132` / `#E4EFE6` | `#8FD1A8` / `#14281D` | Succès, « à jour » | 7,9:1 |
| `--ring` | `#C9971D` | `#E0B24A` | Anneau de focus clavier | — |

Les 3 thèmes Super Admin (vert, bleu, violet) ne remplacent que `--primary`, `--gold`
et `--ring`, via `appliquerThemeCss()` dans `App.jsx`.

**Règles couleur**
- Montants positifs en `--success`, négatifs en `--danger`, **toujours avec le signe `+`/`−`**
  (la couleur ne doit jamais être le seul indicateur).
- Pas de dégradé violet/rose. Un seul dégradé autorisé : vert → or, pour le logo.

## 3. Typographie

| | |
|---|---|
| Police | **IBM Plex Sans** (300–700), pairing « Financial Trust » du skill |
| Chargement | Google Fonts dans `index.html`, `display=swap` |
| Chiffres | `font-variant-numeric: tabular-nums` sur tous les montants (classe `.num`) |
| Base | 16px, interligne 1,5 ; jamais de texte courant < 12px |

| Niveau | Taille / graisse |
|---|---|
| Display (accueil) | 32–40px / 700, interlignage 1,15 |
| Titre de page | 24px / 700 |
| Titre de section | 18px / 600 |
| Corps | 15–16px / 400 |
| Libellé / légende | 13px / 500 |
| Sur-titre | 12px / 600, majuscules, espacement 0,08em |

## 4. Espacement, rayons, ombres

- Échelle 4/8 : `4, 8, 12, 16, 24, 32, 48, 64` (`--space-1` … `--space-8`).
- Rayons : champs et boutons `10px`, cartes `16px`, pastilles `999px`.
- Ombres nettes et discrètes (`--shadow-card`) ; pas de glassmorphism.

## 5. Interaction & accessibilité

- Cibles tactiles ≥ 44×44px (boutons, icône œil, bascule de thème).
- Focus clavier visible partout : `:focus-visible` → anneau `--ring` de 3px.
- Transitions 150–200ms (couleur, ombre), sans décalage de mise en page ;
  `prefers-reduced-motion` coupe les animations.
- Formulaires : `<label for>` réel, `autocomplete` (`username`, `current-password`),
  collage autorisé, erreurs en `role="alert"` au plus près du champ.
- Bouton désactivé pendant l'envoi + libellé de progression (« Connexion… »).
- Icônes Lucide uniquement (trait 2px), `aria-hidden` quand elles sont décoratives.
  Aucun emoji comme icône.

## 6. Anti-patterns (à éviter)

- Design ludique, frais cachés ou montants ambigus.
- Dégradés violet/rose « IA ».
- Or en texte sur fond clair.
- Libellé remplacé par le placeholder seul.
- `div` cliquable à la place d'un `<button>`.

## 7. Checklist avant livraison

- [ ] Contraste texte ≥ 4,5:1 en clair **et** en sombre
- [ ] Focus visible au clavier
- [ ] Cibles ≥ 44px
- [ ] Aucun défilement horizontal à 375px
- [ ] `prefers-reduced-motion` respecté
- [ ] Montants en chiffres tabulaires, avec signe
