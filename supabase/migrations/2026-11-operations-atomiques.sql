-- ============================================================
-- DJANGUI CMR — Opérations « tout ou rien » et SMS sécurisés
-- À exécuter UNE FOIS dans Supabase → SQL Editor, APRÈS
-- 2026-11-banque-caisse.sql. Ne supprime rien. Peut être relancé.
-- ============================================================

-- ---------- 1. Qui est super administrateur ? ----------
create or replace function public.djangui_est_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.is_super_admin);
$$;

-- ---------- 2. Exécuteur d'opérations ----------
-- Reçoit la liste des étapes d'UNE opération (ex. un remboursement :
-- prélèvement, ligne de remboursement, retour dans l'épargne, pénalité,
-- statut du prêt) et les exécute dans une seule transaction : si une
-- étape échoue, rien n'est enregistré. Les soldes sont modifiés par la
-- base elle-même (solde = solde + montant) : deux saisies simultanées
-- ne peuvent plus s'écraser.
-- Les droits habituels (RLS) s'appliquent : la fonction n'en donne pas
-- plus que ceux de la personne connectée.
create or replace function public.djangui_executer_operations(gid uuid, etapes jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  e jsonb; op text; t text; cols text; cond text; k text; v text; txt text;
  refs jsonb := '{}'::jsonb; soldes jsonb := '{}'::jsonb;
  nouveau numeric; nid uuid; n int; ok boolean;
  tables_inserer text[] := array['prets','avalisations','pret_remboursements','compte_reunion_mouvements','dettes',
                                 'sommes_gardees','tontine_cotisations','epargnes','depenses'];
  tables_modifier text[] := array['prets','pret_remboursements','epargne_mouvements','compte_reunion_mouvements','dettes',
                                  'sommes_gardees','caisse_seances','operations_en_attente','epargnes'];
begin
  if not public.djangui_est_admin(gid) then
    raise exception 'Seul un administrateur du groupe peut enregistrer cette opération.';
  end if;
  if jsonb_typeof(etapes) <> 'array' then raise exception 'Liste d''étapes invalide.'; end if;

  for e in select value from jsonb_array_elements(etapes) loop
    -- Références vers des lignes créées plus haut (ex. "@pret")
    txt := e::text;
    for k, v in select key, value from jsonb_each_text(refs) loop
      txt := replace(txt, '"@' || k || '"', to_jsonb(v)::text);
    end loop;
    e := txt::jsonb;
    op := e->>'op';

    if op = 'epargne' then
      -- Mouvement d'épargne : le solde bouge et la ligne est écrite ensemble.
      update epargnes set solde = coalesce(solde, 0) + (e->>'delta')::numeric
        where id = (e->>'epargne_id')::uuid and group_id = gid
        returning solde into nouveau;
      if not found then raise exception 'Épargne introuvable dans ce groupe.'; end if;
      if coalesce((e->>'interdit_negatif')::boolean, false) and nouveau < 0 then
        raise exception 'Pas assez d''argent dans l''épargne (il manque % F).', -nouveau;
      end if;
      if coalesce((e->>'sans_ligne')::boolean, false) = false then
        insert into epargne_mouvements (epargne_id, membre_id, type, montant, date_mouvement, solde_apres, pret_id, saisi_par, mode_paiement)
        values ((e->>'epargne_id')::uuid, nullif(e->>'membre_id', '')::uuid, e->>'type', (e->>'montant')::numeric,
                (e->>'date')::date, nouveau, nullif(e->>'pret_id', '')::uuid, e->>'saisi_par', coalesce(e->>'mode_paiement', 'especes'));
      end if;

    elsif op = 'assurance' then
      update assurance_soldes set
        solde = solde + (e->>'delta')::numeric,
        delai_expire_le = case when e ? 'solde_minimum' and solde + (e->>'delta')::numeric >= (e->>'solde_minimum')::numeric
                               then null else delai_expire_le end,
        updated_at = now()
        where group_id = gid and membre_id = (e->>'membre_id')::uuid
        returning solde into nouveau;
      if not found then raise exception 'Solde d''assurance introuvable pour ce membre.'; end if;
      if nouveau < 0 then raise exception 'Solde d''assurance insuffisant.'; end if;
      insert into assurance_mouvements (group_id, membre_id, type, montant, date_mouvement, solde_apres, mode_paiement)
      values (gid, (e->>'membre_id')::uuid, e->>'type', abs((e->>'delta')::numeric), (e->>'date')::date, nouveau, coalesce(e->>'mode_paiement', 'especes'));

    elsif op = 'fonds' then
      if not exists (select 1 from types_fonds where id = (e->>'type_fonds_id')::uuid and group_id = gid) then
        raise exception 'Type de fonds introuvable dans ce groupe.';
      end if;
      insert into fonds_membres (membre_id, type_fonds_id, solde)
      values ((e->>'membre_id')::uuid, (e->>'type_fonds_id')::uuid, (e->>'delta')::numeric)
      on conflict (membre_id, type_fonds_id) do update set solde = fonds_membres.solde + excluded.solde
      returning solde into nouveau;
      if nouveau < 0 then raise exception 'Solde du fonds insuffisant.'; end if;
      insert into fonds_mouvements (membre_id, type_fonds_id, montant, date_mouvement, mode_paiement)
      values ((e->>'membre_id')::uuid, (e->>'type_fonds_id')::uuid, (e->>'delta')::numeric, (e->>'date')::date, coalesce(e->>'mode_paiement', 'especes'));

    elsif op = 'inserer' then
      t := e->>'table';
      if not (t = any (tables_inserer)) then raise exception 'Table non autorisée : %', t; end if;
      -- La ligne doit appartenir à ce groupe
      if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'group_id') then
        if (e->'ligne'->>'group_id')::uuid is distinct from gid then raise exception 'Ligne d''un autre groupe refusée.'; end if;
      elsif t = 'prets' then
        if not exists (select 1 from epargnes where id = (e->'ligne'->>'epargne_id')::uuid and group_id = gid) then raise exception 'Épargne d''un autre groupe refusée.'; end if;
      elsif t = 'avalisations' then
        if not exists (select 1 from prets p join epargnes ep on ep.id = p.epargne_id where p.id = (e->'ligne'->>'pret_id')::uuid and ep.group_id = gid) then raise exception 'Prêt d''un autre groupe refusé.'; end if;
      elsif t = 'tontine_cotisations' then
        if not exists (select 1 from tontine_tours tt join tontines tn on tn.id = tt.tontine_id where tt.id = (e->'ligne'->>'tour_id')::uuid and tn.group_id = gid) then raise exception 'Tour d''un autre groupe refusé.'; end if;
      end if;
      select string_agg(quote_ident(key), ', ') into cols from jsonb_object_keys(e->'ligne') as key;
      execute format('insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1) returning id', t, cols, cols, t)
        into nid using e->'ligne';
      if e ? 'ref' then refs := refs || jsonb_build_object(e->>'ref', nid); end if;

    elsif op = 'modifier' or op = 'supprimer' then
      t := e->>'table';
      if op = 'modifier' and not (t = any (tables_modifier)) then raise exception 'Table non autorisée : %', t; end if;
      if op = 'supprimer' and t <> 'sommes_gardees' then raise exception 'Suppression non autorisée : %', t; end if;
      -- Appartenance au groupe
      if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'group_id') then
        cond := format(' and group_id = %L', gid);
      elsif t = 'prets' or t = 'epargne_mouvements' then
        cond := format(' and epargne_id in (select id from epargnes where group_id = %L)', gid);
      else
        raise exception 'Table non autorisée : %', t;
      end if;
      -- Conditions : la ligne doit encore être dans l'état attendu
      -- (évite une double validation, une double annulation…)
      if e ? 'si' then
        for k in select jsonb_object_keys(e->'si') loop
          cond := cond || format(' and %1$I is not distinct from (jsonb_populate_record(null::%2$I, $3)).%1$I', k, t);
        end loop;
      end if;
      if op = 'supprimer' then
        execute format('delete from %I where caisse_seance_id = $2 %s', t, cond) using null::jsonb, (e->>'id')::uuid, e->'si';
      else
        select string_agg(quote_ident(key), ', ') into cols from jsonb_object_keys(e->'champs') as key;
        execute format('update %I set (%s) = (select %s from jsonb_populate_record(null::%I, $1)) where id = $2 %s', t, cols, cols, t, cond)
          using e->'champs', (e->>'id')::uuid, e->'si';
        get diagnostics n = row_count;
        if n = 0 then raise exception '%', coalesce(e->>'message', 'Opération déjà faite par quelqu''un d''autre ou introuvable. Recharge la page.'); end if;
      end if;

    else
      raise exception 'Étape inconnue : %', op;
    end if;

    if e ? 'cle' and nouveau is not null then soldes := soldes || jsonb_build_object(e->>'cle', nouveau); end if;
    nouveau := null;
  end loop;

  return jsonb_build_object('refs', refs, 'soldes', soldes);
end $$;

grant execute on function public.djangui_executer_operations(uuid, jsonb) to authenticated;

-- ---------- 3. SMS : seuls les administrateurs du groupe envoient ----------
-- Appelé par api/send-sms.php avec le jeton de la personne connectée.
create or replace function public.djangui_sms_autoriser(gid uuid, nb int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g record;
begin
  if gid is null then raise exception 'Groupe manquant.'; end if;
  if not (public.djangui_est_admin(gid) or public.djangui_est_super_admin()) then
    raise exception 'Seul un administrateur du groupe peut envoyer des SMS.';
  end if;
  if nb is null or nb < 1 or nb > 500 then raise exception 'Nombre de destinataires invalide.'; end if;
  select sms_credits, sms_bloquer_si_epuise, sms_sender_id into g from groups where id = gid;
  if not found then raise exception 'Groupe introuvable.'; end if;
  if coalesce(g.sms_bloquer_si_epuise, true) and coalesce(g.sms_credits, 0) < nb then
    raise exception 'Crédits SMS insuffisants (% restant(s) pour % SMS).', coalesce(g.sms_credits, 0), nb;
  end if;
  return jsonb_build_object('sender_id', g.sms_sender_id, 'credits', g.sms_credits);
end $$;

create or replace function public.djangui_sms_decompter(gid uuid, nb int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.djangui_est_admin(gid) or public.djangui_est_super_admin()) then
    raise exception 'Non autorisé.';
  end if;
  perform public.decrementer_credits_sms(p_group_id := gid, p_quantite := nb);
end $$;

grant execute on function public.djangui_sms_autoriser(uuid, int) to authenticated;
grant execute on function public.djangui_sms_decompter(uuid, int) to authenticated;

-- ---------- Vérification ----------
select proname as fonction_creee from pg_proc
where proname in ('djangui_executer_operations', 'djangui_sms_autoriser', 'djangui_sms_decompter', 'djangui_est_super_admin')
order by proname;
