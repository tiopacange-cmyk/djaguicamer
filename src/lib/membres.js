import { supabase } from "./supabaseClient";

function genererIdentifiant(nom) {
  return nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
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

// Invite un nouveau membre : crée son profil (avec un identifiant
// court généré automatiquement, sans compte de connexion pour
// l'instant — il l'activera lui-même plus tard), puis son
// appartenance au groupe avec le statut "en attente".
export async function inviterMembre(groupId, { nom, email, telephone, typeMembre, posteId, caution }) {
  const identifiantBase = genererIdentifiant(nom);
  const identifiant = `${identifiantBase}${Math.floor(10 + Math.random() * 90)}`;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({ nom_complet: nom, email, telephone, identifiant })
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
      caution: caution || 0,
      statut: "en attente",
    })
    .select()
    .single();

  if (membreError) throw membreError;

  return { membre, email, identifiant };
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
