-- ============================================================
-- DJANGUI CMR — Postes du bureau et droits
-- À exécuter UNE FOIS dans Supabase → SQL Editor. Peut être relancé.
-- Ne supprime rien.
-- Chaque groupe a ses postes (Président, Trésorier… et ceux qu'il crée)
-- avec, pour chaque module, un niveau : aucun / lire / saisir / valider.
-- Seul le gestionnaire des postes (le Président, ou un poste qui a le
-- droit « Postes et droits : valider ») attribue les postes et change
-- les droits.
-- ============================================================

-- ---------- 1. Colonnes des postes ----------
alter table public.postes_bureau add column if not exists droits jsonb not null default '{}'::jsonb;
alter table public.postes_bureau add column if not exists ordre int not null default 100;
alter table public.postes_bureau add column if not exists modele text;          -- president | tresorier | … (postes proposés)
alter table public.postes_bureau add column if not exists description text;
alter table public.group_members add column if not exists poste_id uuid references public.postes_bureau(id) on delete set null;

-- ---------- 2. Qui gère les postes de ce groupe ? ----------
-- Le Président, un poste qui a « postes : valider », ou un ancien
-- administrateur sans poste (comptes créés avant les postes).
create or replace function public.djangui_gere_postes(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members gm join profiles p on p.id = gm.profile_id
    left join postes_bureau pb on pb.id = gm.poste_id
    where gm.group_id = gid and p.auth_user_id = auth.uid()
      and (gm.is_president
           or (gm.poste_id is null and gm.is_admin)
           or pb.droits ->> 'postes' = 'valider')
  ) or public.djangui_est_super_admin();
$$;
grant execute on function public.djangui_gere_postes(uuid) to authenticated;

-- ---------- 3. Attribuer un poste (accès bureau compris) ----------
create or replace function public.djangui_attribuer_poste(membre uuid, poste uuid) returns void
language plpgsql security definer set search_path = public as $$
declare gid uuid; pgid uuid; gestionnaires int;
begin
  select group_id into gid from group_members where id = membre;
  if gid is null then raise exception 'Membre introuvable.'; end if;
  if not public.djangui_gere_postes(gid) then raise exception 'Seul le Président (ou le gestionnaire des postes) attribue les postes.'; end if;
  if poste is not null then
    select group_id into pgid from postes_bureau where id = poste;
    if pgid is distinct from gid then raise exception 'Ce poste n''appartient pas à ce groupe.'; end if;
  end if;
  update group_members set
    poste_id = poste,
    type_membre = case when poste is null then 'Membre simple' else 'Membre du bureau' end,
    is_admin = (poste is not null)
  where id = membre;
  -- Il doit toujours rester quelqu'un qui gère les postes du groupe.
  select count(*) into gestionnaires from group_members gm left join postes_bureau pb on pb.id = gm.poste_id
  where gm.group_id = gid and gm.statut = 'actif'
    and (gm.is_president or (gm.poste_id is null and gm.is_admin) or pb.droits ->> 'postes' = 'valider');
  if gestionnaires = 0 then raise exception 'Impossible : plus personne ne pourrait gérer les postes du groupe.'; end if;
end $$;
grant execute on function public.djangui_attribuer_poste(uuid, uuid) to authenticated;

-- ---------- 4. Verrous ----------
-- Postes et droits : modifiables seulement par le gestionnaire des postes.
create or replace function public.djangui_garde_postes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if not public.djangui_gere_postes(coalesce(new.group_id, old.group_id)) then
    raise exception 'Seul le Président (ou le gestionnaire des postes) modifie les postes et leurs droits.';
  end if;
  if tg_op = 'DELETE' and exists (select 1 from group_members where poste_id = old.id) then
    raise exception 'Ce poste est attribué à un membre : retirez-le d''abord.';
  end if;
  -- Il doit rester au moins un poste capable de gérer les postes (ou un Président).
  return coalesce(new, old);
end $$;
drop trigger if exists djangui_garde_postes on public.postes_bureau;
create trigger djangui_garde_postes before insert or update or delete on public.postes_bureau
  for each row execute function public.djangui_garde_postes();

-- Membres : poste, accès bureau et président ne changent que par le
-- gestionnaire des postes (un trésorier ne peut pas se promouvoir).
create or replace function public.djangui_garde_membre_poste() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.djangui_est_super_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if (new.poste_id is not null or coalesce(new.is_admin, false) or coalesce(new.is_president, false))
       and not public.djangui_gere_postes(new.group_id) then
      raise exception 'Seul le Président (ou le gestionnaire des postes) attribue un poste au bureau.';
    end if;
  elsif (new.poste_id is distinct from old.poste_id or new.is_admin is distinct from old.is_admin
         or new.is_president is distinct from old.is_president or new.group_id is distinct from old.group_id)
        and not public.djangui_gere_postes(old.group_id) then
    raise exception 'Seul le Président (ou le gestionnaire des postes) change les postes et les accès du bureau.';
  end if;
  return new;
end $$;
drop trigger if exists djangui_garde_membre_poste on public.group_members;
create trigger djangui_garde_membre_poste before insert or update on public.group_members
  for each row execute function public.djangui_garde_membre_poste();

-- ---------- Vérification ----------
select 'fonctions' as controle, count(*) as nb from pg_proc where proname in ('djangui_gere_postes', 'djangui_attribuer_poste')
union all select 'verrous', count(*) from pg_trigger where tgname in ('djangui_garde_postes', 'djangui_garde_membre_poste');
