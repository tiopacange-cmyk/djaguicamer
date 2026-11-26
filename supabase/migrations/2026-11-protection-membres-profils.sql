-- ============================================================
-- DJANGUI CMR — Protection des tables « profiles » et « group_members »
-- À exécuter UNE FOIS dans Supabase → SQL Editor, APRÈS les deux
-- scripts précédents. Peut être relancé sans risque.
--
-- Avant : la protection (RLS) de ces deux tables était désactivée :
-- n'importe qui avec la clé publique du site pouvait lire les noms,
-- téléphones et e-mails de tous les groupes, et se déclarer
-- administrateur d'un groupe.
-- Après : chacun ne voit que les membres de SES groupes ; seuls les
-- administrateurs d'un groupe modifient ses membres ; personne ne peut
-- se donner le rôle de super administrateur.
--
-- Les anciennes règles de ces deux tables sont SAUVEGARDÉES dans la
-- table « sauvegarde_regles_securite » avant d'être remplacées.
-- ============================================================

-- ---------- 1. Sauvegarde des règles existantes ----------
create table if not exists public.sauvegarde_regles_securite (
  sauvegarde_le timestamptz not null default now(),
  table_ text, regle text, action text, roles text[], condition_lecture text, condition_ecriture text, permissive text
);
insert into public.sauvegarde_regles_securite (table_, regle, action, roles, condition_lecture, condition_ecriture, permissive)
select tablename, policyname, cmd, roles, qual, with_check, permissive
from pg_policies
where schemaname = 'public' and tablename in ('profiles', 'group_members')
  and policyname not like 'djangui_%';
alter table public.sauvegarde_regles_securite enable row level security;  -- lisible seulement depuis Supabase

-- ---------- 1b. Date de création des profils (utilisée pour l'invitation) ----------
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- ---------- 1c. Fonctions utilisées AVANT la connexion ----------
-- La connexion retrouve l'e-mail d'un identifiant, et la page d'un
-- groupe lit son nom et son logo. Elles doivent garder leurs propres
-- droits, sinon la nouvelle protection les bloquerait (plus personne
-- ne pourrait se connecter).
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('get_email_pour_identifiant', 'get_vitrine_groupe') and not p.prosecdef loop
    execute format('alter function %s security definer set search_path = public', f.signature);
    raise notice 'Fonction % : droits propres activés', f.signature;
  end loop;
end $$;

-- ---------- 2. Fonctions de contrôle (sans boucle) ----------
create or replace function public.djangui_est_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.is_super_admin);
$$;

create or replace function public.djangui_mon_profil() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid() limit 1;
$$;

-- Administrateur (ou président) d'au moins un groupe
create or replace function public.djangui_est_admin_quelque_part() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members gm join profiles p on p.id = gm.profile_id
    where p.auth_user_id = auth.uid() and (gm.is_admin or gm.is_president)
  );
$$;

-- Puis-je voir ce profil ? (le mien ou ceux de mes groupes)
create or replace function public.djangui_profil_visible(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pid = public.djangui_mon_profil()
      or public.djangui_est_super_admin()
      or exists (select 1 from group_members gm where gm.profile_id = pid and public.djangui_est_membre(gm.group_id));
$$;

-- Compte qu'un administrateur vient de créer (invitation en cours) :
-- sans groupe, créé il y a moins d'une heure, jamais un super admin.
-- Reçoit la ligne elle-même (elle n'est pas encore visible ailleurs).
create or replace function public.djangui_profil_nouveau(ligne jsonb) returns boolean
language sql volatile security definer set search_path = public as $$
  select public.djangui_est_admin_quelque_part()
     and not coalesce((ligne ->> 'is_super_admin')::boolean, false)
     and coalesce((ligne ->> 'created_at')::timestamptz > now() - interval '1 hour', false)
     and not exists (select 1 from group_members gm where gm.profile_id = (ligne ->> 'id')::uuid);
$$;

-- Puis-je modifier ce profil ? (le mien, ou un membre d'un groupe que j'administre)
create or replace function public.djangui_profil_modifiable(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pid = public.djangui_mon_profil()
      or public.djangui_est_super_admin()
      or exists (select 1 from group_members gm where gm.profile_id = pid and public.djangui_est_admin(gm.group_id));
$$;

grant execute on function public.djangui_est_super_admin() to authenticated;
grant execute on function public.djangui_mon_profil() to authenticated;
grant execute on function public.djangui_est_admin_quelque_part() to authenticated;
grant execute on function public.djangui_profil_visible(uuid) to authenticated;
grant execute on function public.djangui_profil_nouveau(jsonb) to authenticated;
grant execute on function public.djangui_profil_modifiable(uuid) to authenticated;

-- ---------- 3. Personne ne se donne le rôle de super administrateur ----------
create or replace function public.djangui_garde_super_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Les scripts lancés depuis Supabase (sans utilisateur connecté) restent libres.
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' and coalesce(new.is_super_admin, false) and not public.djangui_est_super_admin() then
    raise exception 'Création d''un super administrateur refusée.';
  end if;
  if tg_op = 'UPDATE' and new.is_super_admin is distinct from old.is_super_admin and not public.djangui_est_super_admin() then
    raise exception 'Modification du rôle super administrateur refusée.';
  end if;
  if tg_op = 'UPDATE' and new.auth_user_id is distinct from old.auth_user_id and not public.djangui_est_super_admin() then
    raise exception 'Modification du compte de connexion refusée.';
  end if;
  return new;
end $$;
drop trigger if exists djangui_garde_super_admin on public.profiles;
create trigger djangui_garde_super_admin before insert or update on public.profiles
  for each row execute function public.djangui_garde_super_admin();

-- ---------- 4. Nouvelles règles ----------
do $$
declare r record;
begin
  -- Remplace toutes les règles de ces deux tables (sauvegardées plus haut)
  for r in select tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('profiles', 'group_members') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles
create policy djangui_profils_lecture on public.profiles for select to authenticated
  using (public.djangui_profil_visible(id) or public.djangui_profil_nouveau(to_jsonb(profiles.*)));
create policy djangui_profils_creation on public.profiles for insert to authenticated
  with check (auth_user_id = auth.uid() or public.djangui_est_super_admin() or public.djangui_est_admin_quelque_part());
create policy djangui_profils_modification on public.profiles for update to authenticated
  using (public.djangui_profil_modifiable(id) or public.djangui_profil_nouveau(to_jsonb(profiles.*)))
  with check (public.djangui_profil_modifiable(id) or public.djangui_profil_nouveau(to_jsonb(profiles.*)));
create policy djangui_profils_suppression on public.profiles for delete to authenticated
  using (public.djangui_est_super_admin());

-- group_members
create policy djangui_membres_lecture on public.group_members for select to authenticated
  using (profile_id = public.djangui_mon_profil() or public.djangui_est_membre(group_id) or public.djangui_est_super_admin());
create policy djangui_membres_creation on public.group_members for insert to authenticated
  with check (public.djangui_est_admin(group_id) or public.djangui_est_super_admin());
create policy djangui_membres_modification on public.group_members for update to authenticated
  using (public.djangui_est_admin(group_id) or public.djangui_est_super_admin())
  with check (public.djangui_est_admin(group_id) or public.djangui_est_super_admin());
create policy djangui_membres_suppression on public.group_members for delete to authenticated
  using (public.djangui_est_admin(group_id) or public.djangui_est_super_admin());

-- ---------- 5. Activation ----------
alter table public.profiles enable row level security;
alter table public.group_members enable row level security;

-- ---------- Vérification ----------
select p.proname as fonction_avant_connexion, case when p.prosecdef then 'ok' else 'À VÉRIFIER' end as etat
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('get_email_pour_identifiant', 'get_vitrine_groupe');

select c.relname as table_, case when c.relrowsecurity then 'oui' else 'NON' end as protection_active,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as nb_regles,
       (select count(*) from public.sauvegarde_regles_securite s where s.table_ = c.relname) as anciennes_regles_sauvegardees
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('profiles', 'group_members');
