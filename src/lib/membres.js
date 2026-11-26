import { supabase } from "./supabaseClient";
import { compresserImage, PROFILS_IMAGE } from "./images";

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
      poste_id, is_admin, is_president,
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
    posteId: m.poste_id || null,
    isAdmin: !!m.is_admin,
    isPresident: !!m.is_president,
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

// Opérations qui gardent la trace d'un membre : tant qu'il en a une,
// il ne peut pas être supprimé (on le rend inactif à la place).
const HISTORIQUE_MEMBRE = [
  ["tontine_cotisations", "membre_id", "des cotisations de tontine"],
  ["tontine_tours", "beneficiaire_id", "un tour de tontine à son nom"],
  ["tontine_amendes", "membre_id", "des amendes de tontine"],
  ["tontine_redistributions", "membre_id", "des redistributions de commission"],
  ["epargne_mouvements", "membre_id", "des mouvements en banque"],
  ["prets", "membre_id", "des prêts"],
  ["avalisations", "avaliste_id", "des prêts dont il est l'avaliste"],
  ["assurance_mouvements", "membre_id", "des cotisations d'assurance"],
  ["assurance_evenements", "membre_beneficiaire_id", "des aides d'assurance"],
  ["assurance_prelevements", "membre_id", "des prélèvements d'assurance"],
  ["assurance_delegues", "membre_id", "des délégations à un événement"],
  ["caisse_amendes_mouvements", "membre_id", "des amendes de séance payées"],
  ["mouvements_bancaires_externes", "membre_id", "des mouvements bancaires"],
  ["mouvement_responsables_frais", "membre_id", "des frais bancaires à sa charge"],
  ["signataires_compte", "membre_id", "un rôle de signataire de compte"],
  ["rafraichissements", "responsable_id", "des achats de rafraîchissement"],
];

export async function supprimerMembre(groupMemberId) {
  const raisons = [];
  for (const [table, colonne, libelle] of HISTORIQUE_MEMBRE) {
    const { data, error } = await supabase.from(table).select("id").eq(colonne, groupMemberId).limit(1);
    if (error) throw error;
    if (data && data.length > 0) raisons.push(libelle);
  }
  if (raisons.length > 0) {
    throw new Error(`Suppression impossible : ce membre a ${raisons.join(", ")}. Utilise « Rendre inactif » pour conserver l'historique financier.`);
  }

  // Lignes créées automatiquement, sans aucune opération réelle :
  // elles disparaissent avec le membre.
  const { error: errSolde } = await supabase.from("assurance_soldes").delete().eq("membre_id", groupMemberId);
  if (errSolde) throw errSolde;

  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("id", groupMemberId);

  if (error) {
    if (error.code === "23503") {
      throw new Error("Suppression impossible : ce membre est encore lié à des opérations du groupe. Utilise « Rendre inactif » à la place.");
    }
    throw error;
  }
}

// ============================================================
// DOCUMENTS DU MEMBRE (photo, CNI, plan de localisation)
// ============================================================

export async function televerserDocumentMembre(groupMemberId, type, fichierOriginal) {
  // Photo réduite à 600 px ; CNI et plan à 1600 px (restent lisibles).
  // Les PDF sont envoyés tels quels.
  const fichier = await compresserImage(fichierOriginal, type === "photo" ? PROFILS_IMAGE.photo : PROFILS_IMAGE.document);
  const extension = fichier.name.split(".").pop();
  const chemin = `${groupMemberId}/${type}-${Date.now()}.${extension}`;

  const { error: errUpload } = await supabase.storage.from("documents-membres").upload(chemin, fichier, { contentType: fichier.type, cacheControl: "31536000" });
  if (errUpload) throw errUpload;

  const { data: urlData } = supabase.storage.from("documents-membres").getPublicUrl(chemin);

  const { error } = await supabase.from("member_documents").insert({
    group_member_id: groupMemberId,
    type,
    fichier_url: urlData.publicUrl,
  });
  if (error) throw error;

  return urlData.publicUrl;
}

export async function fetchDocumentsMembre(groupMemberId) {
  const { data, error } = await supabase
    .from("member_documents")
    .select("type, fichier_url, uploaded_at")
    .eq("group_member_id", groupMemberId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;

  const parType = {};
  data.forEach((d) => {
    if (!parType[d.type]) parType[d.type] = d.fichier_url;
  });
  return parType;
}
