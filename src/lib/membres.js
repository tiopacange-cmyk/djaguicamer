import { supabase } from "./supabaseClient";

// ============================================================
// MEMBRES DU GROUPE
// ============================================================
// Remplace les anciens appels window.storage.get/set("...:membres")
// par de vraies requêtes Supabase.
//
// NOTE : tant que l'authentification n'est pas branchée, on ne
// connaît pas encore le group_id réel. On le passe en paramètre
// pour l'instant — à remplacer plus tard par le groupe de
// l'utilisateur connecté.
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
      profile:profiles ( nom_complet, telephone )
    `)
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  // On aplatit la structure pour rester compatible avec ce que
  // l'interface attend déjà : { nom, role, statut }
  return data.map((m) => ({
    id: m.id,
    nom: m.profile?.nom_complet || "—",
    role: m.type_membre === "Membre du bureau" ? (m.poste?.nom || "Bureau") : "Membre",
    statut: m.statut,
  }));
}

// Invite un nouveau membre : crée d'abord son profil, puis son
// appartenance au groupe avec le statut "en attente"
export async function inviterMembre(groupId, { nom, telephone, typeMembre, posteId, caution }) {
  // 1. Créer le profil (nécessite un compte auth déjà existant pour
  //    cette personne — dans un vrai flux, on enverrait une invitation
  //    par SMS/email qui crée le compte. Ici on suppose que le profil
  //    existe déjà, identifié par son numéro de téléphone, ou on le
  //    crée manuellement en attendant que la personne active son compte.)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({ nom_complet: nom, telephone })
    .select()
    .single();

  if (profileError) throw profileError;

  // 2. Créer l'appartenance au groupe, statut "en attente"
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

  return membre;
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
