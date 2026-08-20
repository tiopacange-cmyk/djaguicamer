import { supabase } from "./supabaseClient";

function genererIdentifiant(nom) {
  return nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function genererMotDePasseTemp() {
  const nombre = Math.floor(1000 + Math.random() * 9000);
  return `Tontine-${nombre}`;
}

// ============================================================
// MEMBRES DU GROUPE
// ============================================================

export async function fetchMembres(groupId) {
  const { data, error } = await supabase
    .from("group_members")
    .select(`
      id,
      type_membre,
      statut,
      created_at,
      poste:postes_bureau ( nom ),
      profile:profiles ( id, nom_complet, telephone, email, identifiant, auth_user_id )
    `)
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data.map((m) => ({
    id: m.id,
    profileId: m.profile?.id,
    nom: m.profile?.nom_complet || "—",
    telephone: m.profile?.telephone || "",
    email: m.profile?.email || "",
    identifiant: m.profile?.identifiant || "",
    role: m.type_membre === "Membre du bureau" ? (m.poste?.nom || "Bureau") : "Membre",
    statut: m.statut,
    compteActive: !!m.profile?.auth_user_id,
  }));
}

export async function inviterMembre(groupId, { nom, email, telephone, typeMembre, posteId }) {
  const identifiantBase = genererIdentifiant(nom);
  const identifiant = `${identifiantBase}${Math.floor(10 + Math.random() * 90)}`;
  const motDePasseTemp = genererMotDePasseTemp();

  const { data: { session: sessionAdmin } } = await supabase.auth.getSession();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: motDePasseTemp,
  });
  if (authError) throw authError;
  if (!authData.user) throw new Error("Impossible de créer le compte de ce membre.");

  if (sessionAdmin) {
    await supabase.auth.setSession({
      access_token: sessionAdmin.access_token,
      refresh_token: sessionAdmin.refresh_token,
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({ auth_user_id: authData.user.id, nom_complet: nom, email, telephone, identifiant, doit_changer_mdp: true })
    .select()
    .single();
  if (profileError) throw profileError;

  const { data: membre, error: membreError } = await supabase
    .from("group_members")
    .insert({
      group_id: groupId,
      profile_id: profile.id,
      type_membre: typeMembre,
      poste_id: posteId || null,
      statut: "en attente",
    })
    .select()
    .single();

  if (membreError) throw membreError;

  return { membre, email, identifiant, motDePasseTemp };
}

export async function modifierMembre(profileId, { nom, email, telephone, profession, quartier }) {
  const champs = {};
  if (nom !== undefined) champs.nom_complet = nom;
  if (email !== undefined) champs.email = email;
  if (telephone !== undefined) champs.telephone = telephone;
  if (profession !== undefined) champs.profession = profession;
  if (quartier !== undefined) champs.quartier = quartier;

  const { data, error } = await supabase
    .from("profiles")
    .update(champs)
    .eq("id", profileId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function validerMembre(groupMemberId, validateurId) {
  const { data, error } = await supabase
    .from("group_members")
    .update({ statut: "actif", valide_par: validateurId, valide_le: new Date().toISOString() })
    .eq("id", groupMemberId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function toggleActifMembre(groupMemberId, nouveauStatut) {
  const { data, error } = await supabase
    .from("group_members")
    .update({ statut: nouveauStatut })
    .eq("id", groupMemberId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchMonCompteMembre(groupId, profileId) {
  const { data, error } = await supabase
    .from("group_members")
    .select(`
      id, type_membre, statut, created_at,
      poste:postes_bureau ( nom )
    `)
    .eq("group_id", groupId)
    .eq("profile_id", profileId)
    .single();

  if (error) throw error;
  return {
    id: data.id,
    role: data.type_membre === "Membre du bureau" ? (data.poste?.nom || "Bureau") : "Membre",
    statut: data.statut,
    depuisLe: data.created_at,
  };
}

export async function reinitialiserMotDePasseMembre(email) {
  const nombre = Math.floor(1000 + Math.random() * 9000);
  const motDePasseTemp = `Tontine-${nombre}`;

  const { error } = await supabase.rpc("reset_password_admin_groupe", {
    p_email: email,
    p_nouveau_mdp: motDePasseTemp,
  });
  if (error) throw error;

  return motDePasseTemp;
}

export async function supprimerMembre(groupMemberId) {
  const { data: cotisationsTontine, error: errTontine } = await supabase
    .from("tontine_cotisations")
    .select("id")
    .eq("membre_id", groupMemberId)
    .limit(1);
  if (errTontine) throw errTontine;

  const { data: mouvementsBanque, error: errBanque } = await supabase
    .from("epargne_mouvements")
    .select("id")
    .eq("membre_id", groupMemberId)
    .eq("type", "Versement")
    .limit(1);
  if (errBanque) throw errBanque;

  if ((cotisationsTontine && cotisationsTontine.length > 0) || (mouvementsBanque && mouvementsBanque.length > 0)) {
    throw new Error("Ce membre a déjà effectué au moins une cotisation — suppression impossible.");
  }

  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("id", groupMemberId);

  if (error) throw error;
}
