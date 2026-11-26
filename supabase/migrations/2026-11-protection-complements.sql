-- ============================================================
-- DJANGUI CMR — Compléments de sécurité (après lecture des règles)
-- À exécuter UNE FOIS dans Supabase → SQL Editor. Peut être relancé.
-- 1. Les administrateurs peuvent annuler un mouvement d'épargne
--    (avant : aucune règle ne le permettait, l'annulation échouait).
-- 2. Un administrateur ne peut plus s'ajouter des crédits SMS ni
--    changer l'expéditeur, le nom, le lien ou le logo de son groupe :
--    seul le Super Admin le peut. Il peut seulement consommer du crédit.
-- 3. Les documents d'un membre (CNI, plan…) ne sont visibles que par
--    les administrateurs du groupe et par le membre lui-même.
-- ============================================================

-- ---------- 1. Annulation d'un mouvement d'épargne ----------
drop policy if exists djangui_mouvements_annulation on public.epargne_mouvements;
create policy djangui_mouvements_annulation on public.epargne_mouvements for update to authenticated
  using (epargne_id in (select id from public.epargnes where public.djangui_est_admin(group_id)))
  with check (epargne_id in (select id from public.epargnes where public.djangui_est_admin(group_id)));

-- ---------- 2. Ce qu'un administrateur peut changer sur son groupe ----------
create or replace function public.djangui_garde_groupe() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  autorises text[] := array['sms_credits', 'regles_groupe', 'updated_at'];
begin
  -- Scripts lancés depuis Supabase et Super Admin : libres.
  if auth.uid() is null or public.djangui_est_super_admin() then return new; end if;
  -- Les autres ne changent que le crédit SMS (à la baisse) et les réglages.
  if (to_jsonb(new) - autorises) is distinct from (to_jsonb(old) - autorises) then
    raise exception 'Seul le Super Admin peut modifier ces informations du groupe.';
  end if;
  if coalesce(new.sms_credits, 0) > coalesce(old.sms_credits, 0) then
    raise exception 'Seul le Super Admin peut ajouter des crédits SMS.';
  end if;
  return new;
end $$;
drop trigger if exists djangui_garde_groupe on public.groups;
create trigger djangui_garde_groupe before update on public.groups
  for each row execute function public.djangui_garde_groupe();

-- ---------- 3. Documents des membres ----------
do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'member_documents' and cmd = 'SELECT' loop
    insert into public.sauvegarde_regles_securite (table_, regle, action, roles, condition_lecture, condition_ecriture, permissive)
    select tablename, policyname, cmd, roles, qual, with_check, permissive from pg_policies
    where schemaname = 'public' and tablename = 'member_documents' and policyname = r.policyname;
    execute format('drop policy %I on public.member_documents', r.policyname);
  end loop;
end $$;
create policy djangui_documents_lecture on public.member_documents for select to authenticated
  using (group_member_id in (
    select gm.id from public.group_members gm
    where public.djangui_est_admin(gm.group_id) or gm.profile_id = public.djangui_mon_profil()
  ) or public.djangui_est_super_admin());

-- ---------- Vérification ----------
select 'annulation épargne' as controle, count(*) as regles from pg_policies where tablename = 'epargne_mouvements' and cmd = 'UPDATE'
union all select 'garde du groupe', count(*) from pg_trigger where tgname = 'djangui_garde_groupe'
union all select 'documents (lecture)', count(*) from pg_policies where tablename = 'member_documents' and cmd = 'SELECT';
