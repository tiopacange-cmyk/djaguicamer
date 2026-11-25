-- ============================================================
-- DJANGUI CMR — Banque, caisse de séance, sommes gardées, lectures
-- À exécuter UNE FOIS dans Supabase → SQL Editor.
-- Ne supprime rien : ajoute des colonnes et des tables, et range
-- les anciens prêts (enregistrés comme « Retrait ») en « Prêt ».
-- Peut être relancé sans risque (if not exists partout).
-- ============================================================

-- ---------- 1. Règles et clôture des épargnes ----------
alter table epargnes add column if not exists regles jsonb;        -- taux, période, unité, mode, frais, pénalités, limites, partage
alter table epargnes add column if not exists date_debut date;
alter table epargnes add column if not exists cloture jsonb;       -- résumé figé de la clôture (date, caisse comptée, cagnotte, parts)

-- ---------- 2. Mouvements d'épargne : annulation, auteur, mode ----------
alter table epargne_mouvements add column if not exists annule boolean not null default false;
alter table epargne_mouvements add column if not exists annule_motif text;
alter table epargne_mouvements add column if not exists annule_par text;
alter table epargne_mouvements add column if not exists annule_le timestamptz;
alter table epargne_mouvements add column if not exists saisi_par text;
alter table epargne_mouvements add column if not exists mode_paiement text not null default 'especes';
alter table epargne_mouvements add column if not exists pret_id uuid references prets(id) on delete set null;

-- ---------- 3. Prêts : règles propres, prêt spécial, garanties, décision ----------
alter table prets add column if not exists regles jsonb;
alter table prets add column if not exists special boolean not null default false;
alter table prets add column if not exists garanties jsonb;        -- [{ type, description, valeur }]
alter table prets add column if not exists decision jsonb;         -- { date, comite, motif }
alter table prets add column if not exists mode_remboursement text;
alter table prets add column if not exists nb_echeances int;
alter table prets add column if not exists saisi_par text;
alter table prets add column if not exists valide_par text;
alter table prets add column if not exists valide_le timestamptz;
alter table prets add column if not exists refuse_motif text;
alter table prets add column if not exists mode_paiement text not null default 'especes';

create table if not exists pret_remboursements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  pret_id uuid not null references prets(id) on delete cascade,
  date date not null,
  montant numeric not null,
  capital numeric not null default 0,
  interets numeric not null default 0,
  penalites numeric not null default 0,
  source text not null default 'especes',      -- especes | momo | epargne | assurance | fonds
  source_ref uuid,                             -- épargne ou type de fonds utilisé
  annule boolean not null default false,
  annule_motif text, annule_par text, annule_le timestamptz,
  saisi_par text,
  created_at timestamptz not null default now()
);

-- ---------- 4. Compte de la réunion (frais, pénalités, arrondis…) ----------
create table if not exists compte_reunion_mouvements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  date date not null,
  montant numeric not null,                    -- + entrée / − sortie
  origine text not null,                       -- frais_dossier | penalite_pret | arrondi | penalite_garde | depense | autre
  libelle text,
  ref_id uuid,
  mode_paiement text not null default 'especes',
  annule boolean not null default false,
  annule_motif text, annule_par text, annule_le timestamptz,
  saisi_par text,
  created_at timestamptz not null default now()
);

-- ---------- 5. Dettes (somme gardée non rapportée, reste dû…) ----------
create table if not exists dettes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  membre_id uuid not null references group_members(id) on delete cascade,
  origine text not null,                       -- garde | autre
  ref_id uuid,
  libelle text,
  montant numeric not null,
  rembourse numeric not null default 0,
  echeance date,
  statut text not null default 'ouverte',      -- ouverte | soldee
  motif text,
  saisi_par text,
  created_at timestamptz not null default now()
);
alter table dettes add column if not exists penalite numeric not null default 0;
alter table dettes add column if not exists paiements jsonb;   -- [{ date, montant, mode, par }]

-- ---------- 6. Caisse de séance ----------
create table if not exists caisse_seances (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  date date not null,
  statut text not null default 'ouverte',      -- ouverte | cloturee
  fond_ouverture numeric not null default 0,
  gardees_recuperees numeric not null default 0,
  theorique numeric,
  compte numeric,
  ecart numeric,
  ecart_motif text,
  ecart_valide_par text,
  billetage jsonb,
  depot_banque numeric not null default 0,
  garde_tresorier numeric not null default 0,
  second_comptage_par text,
  cloture_par text,
  cloture_le timestamptz,
  reouverture_motif text,
  autres jsonb,                                -- autres entrées/sorties justifiées [{ libelle, montant }]
  created_at timestamptz not null default now(),
  unique (group_id, date)
);
alter table caisse_seances add column if not exists autres jsonb;

create table if not exists sommes_gardees (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  caisse_seance_id uuid not null references caisse_seances(id) on delete cascade,
  membre_id uuid not null references group_members(id) on delete cascade,
  montant numeric not null,
  a_rapporter_le date,
  rapporte numeric,
  statut text not null default 'gardee',       -- gardee | rendue | partielle | non_rendue
  traitement text,                             -- dette | epargne | fonds | aucun
  penalite numeric not null default 0,
  motif text,
  recupere_le date,
  recupere_dans uuid references caisse_seances(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 7. Deux lectures avant validation ----------
create table if not exists operations_en_attente (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  rubrique text not null,                      -- tontine | epargne | assurance | fonds
  date date not null,
  titre text not null,
  parametres jsonb,                            -- ce qu'il faut pour exécuter l'opération à la validation
  lignes jsonb not null,                       -- [{ membreId, nom, montant, l1, l2, corrige }]
  total numeric not null default 0,
  saisi_par text,
  lecture1_par text, lecture1_le timestamptz, lecture1_total numeric,
  lecture2_par text, lecture2_le timestamptz, lecture2_total numeric,
  statut text not null default 'saisie',       -- saisie | lecture1 | lecture2 | validee | abandonnee
  valide_le timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- 8. Réglages du groupe et mode de paiement ----------
alter table groups add column if not exists regles_groupe jsonb;   -- { garde: {valeur,type,base}, lectures: [...], alerteSpecialPct }
alter table tontine_cotisations add column if not exists mode_paiement text not null default 'especes';
alter table assurance_mouvements add column if not exists mode_paiement text not null default 'especes';
alter table fonds_mouvements add column if not exists mode_paiement text not null default 'especes';
alter table depenses add column if not exists mode_paiement text not null default 'especes';

-- ---------- 9a. Nouvelles valeurs autorisées ----------
-- (Prêt, Remboursement, Intérêts… pour les mouvements ; en attente,
-- refusé, reporté pour les prêts) : on retire les anciennes listes
-- fermées de valeurs si la base en a.
do $$
declare c record;
begin
  for c in
    select con.conname, cl.relname
    from pg_constraint con join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    where con.contype = 'c' and ns.nspname = 'public'
      and ((cl.relname = 'epargne_mouvements' and pg_get_constraintdef(con.oid) ilike '%type%')
        or (cl.relname = 'prets' and pg_get_constraintdef(con.oid) ilike '%statut%'))
  loop
    execute format('alter table %I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;

-- ---------- 9. Anciens prêts : le décaissement n'est plus un « Retrait » ----------
update epargne_mouvements em
set type = 'Prêt', pret_id = p.id
from prets p
where em.type = 'Retrait'
  and em.pret_id is null
  and em.epargne_id = p.epargne_id
  and em.membre_id = p.membre_id
  and em.montant = p.montant
  and em.date_mouvement = p.date_debut;

-- ---------- 10. Sécurité (RLS) des nouvelles tables ----------
create or replace function public.djangui_est_membre(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members gm join profiles p on p.id = gm.profile_id
    where gm.group_id = gid and p.auth_user_id = auth.uid()
  );
$$;

create or replace function public.djangui_est_admin(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members gm join profiles p on p.id = gm.profile_id
    where gm.group_id = gid and p.auth_user_id = auth.uid() and (gm.is_admin or gm.is_president)
  );
$$;

do $$
declare t text;
begin
  foreach t in array array['pret_remboursements','compte_reunion_mouvements','dettes','caisse_seances','sommes_gardees','operations_en_attente'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists djangui_lecture on %I', t);
    execute format('drop policy if exists djangui_ecriture on %I', t);
    execute format('create policy djangui_lecture on %I for select to authenticated using (public.djangui_est_membre(group_id))', t);
    execute format('create policy djangui_ecriture on %I for all to authenticated using (public.djangui_est_admin(group_id)) with check (public.djangui_est_admin(group_id))', t);
  end loop;
end $$;

-- Réglages du groupe (pénalité des sommes gardées, lectures) :
-- lecture pour les membres, écriture pour les administrateurs.
create or replace function public.djangui_regles_groupe(gid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.djangui_est_membre(gid) then (select regles_groupe from groups where id = gid) else null end;
$$;

create or replace function public.djangui_sauver_regles_groupe(gid uuid, regles jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.djangui_est_admin(gid) then
    raise exception 'Seul un administrateur du groupe peut modifier ces réglages.';
  end if;
  update groups set regles_groupe = regles where id = gid;
end $$;

grant execute on function public.djangui_regles_groupe(uuid) to authenticated;
grant execute on function public.djangui_sauver_regles_groupe(uuid, jsonb) to authenticated;

-- ---------- Vérification ----------
select 'pret_remboursements' as table_, count(*) from pret_remboursements
union all select 'compte_reunion_mouvements', count(*) from compte_reunion_mouvements
union all select 'caisse_seances', count(*) from caisse_seances
union all select 'sommes_gardees', count(*) from sommes_gardees
union all select 'operations_en_attente', count(*) from operations_en_attente
union all select 'anciens prêts rangés', count(*) from epargne_mouvements where type = 'Prêt';
