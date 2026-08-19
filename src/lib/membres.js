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

// Récupère tous les membres d'un groupe, avec leur nom depuis "profiles"
export async function fetchMembres(groupId) {
  const { data, error } = await supabase
    .from("group_members")
    .select(`
      id,
      type_membre,
      statut,
      caution,
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

// Invite un nouveau membre : crée directement son compte de connexion
// (identifiant + mot de passe temporaire, comme pour un admin), en
// protégeant la session de la personne qui invite (l'admin reste
// connecté à son propre compte pendant et après l'opération).
export async function inviterMembre(groupId, { nom, email, telephone, typeMembre, posteId, caution }) {
  const identifiantBase = genererIdentifiant(nom);
  const identifiant = `${identifiantBase}${Math.floor(10 + Math.random() * 90)}`;
  const motDePasseTemp = genererMotDePasseTemp();

  // 1. Sauvegarde la session actuelle (l'admin), pour la restaurer après
  const { data: { session: sessionAdmin } } = await supabase.auth.getSession();

  // 2. Crée le compte de connexion du nouveau membre
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: motDePasseTemp,
  });
  if (authError) throw authError;
  if (!authData.user) throw new Error("Impossible de créer le compte de ce membre.");

  // 3. Restaure la session de l'admin (signUp peut avoir basculé la
  //    session active vers le nouveau compte selon la config du projet)
  if (sessionAdmin) {
    await supabase.auth.setSession({
      access_token: sessionAdmin.access_token,
      refresh_token: sessionAdmin.refresh_token,
    });
  }

  // 4. Crée le profil du membre, relié à son compte
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({ auth_user_id: authData.user.id, nom_complet: nom, email, telephone, identifiant, doit_changer_mdp: true })
    .select()
    .single();
  if (profileError) throw profileError;

  // 5. Crée son appartenance au groupe, statut "en attente"
  const { data: membre, error: membreError } = await supabase
    .from("group_members")
    .insert({
      group_id: groupId,
      profile_id: profile.id,
      type_membre: typeMembre,
      poste_id: posteId || null,
      caution: caution || 0,
      statut: "en attente",
    })
    .select()
    .single();

  if (membreError) throw membreError;

  return { membre, email, identifiant, motDePasseTemp };
}

// Modifie les informations d'un membre déjà inscrit (jamais son
// mot de passe, qui reste géré uniquement par lui-même)
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

// Le Président valide l'invitation d'un membre
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

// Rend un membre actif ou inactif (suspend/réactive son accès au
// groupe, sans le supprimer — ses données/historique restent intacts)
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

// Récupère les informations d'appartenance au groupe du membre
// actuellement connecté (utilisé sur son propre tableau de bord)
export async function fetchMonCompteMembre(groupId, profileId) {
  const { data, error } = await supabase
    .from("group_members")
    .select(`
      id, type_membre, statut, caution, created_at,
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
    caution: data.caution,
    depuisLe: data.created_at,
  };
}

// Supprime un membre du groupe, uniquement s'il n'a JAMAIS effectué
// de cotisation (tontine ou épargne/banque) — vérifié avant suppression.
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
