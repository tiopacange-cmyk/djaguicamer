
import { supabase } from "./supabaseClient";

// ============================================================
// TYPES DE FONDS (rubriques créées par l'admin du groupe)
// ============================================================

export async function fetchTypesFonds(groupId) {
  const { data, error } = await supabase
    .from("types_fonds")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function creerTypeFonds(groupId, nom) {
  const { data, error } = await supabase
    .from("types_fonds")
    .insert({ group_id: groupId, nom })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function supprimerTypeFonds(typeFondsId) {
  const { error } = await supabase.from("types_fonds").delete().eq("id", typeFondsId);
  if (error) throw error;
}

// ============================================================
// FONDS PAR MEMBRE (cible + solde, pour chaque type de fonds)
// ============================================================

// Récupère, pour TOUS les membres du groupe, leur progression sur
// CHAQUE type de fonds — utilisé pour l'affichage du tableau des
// membres (une colonne par type de fonds).
export async function fetchFondsTousMembres(groupId) {
  const { data, error } = await supabase
    .from("fonds_membres")
    .select(`
      membre_id, type_fonds_id, cible, solde,
      membre:group_members!inner ( group_id )
    `)
    .eq("membre.group_id", groupId);
  if (error) throw error;
  return data.map((f) => ({
    membreId: f.membre_id,
    typeFondsId: f.type_fonds_id,
    cible: f.cible,
    solde: f.solde,
  }));
}

// Fixe (ou crée) la cible d'un membre pour un type de fonds donné
export async function fixerCibleFonds(membreId, typeFondsId, cible) {
  const { error } = await supabase
    .from("fonds_membres")
    .upsert({ membre_id: membreId, type_fonds_id: typeFondsId, cible }, { onConflict: "membre_id,type_fonds_id" });
  if (error) throw error;
}

// Enregistre un versement vers un fonds, met à jour le solde, et
// trace le mouvement dans l'historique.
export async function enregistrerVersementFonds(membreId, typeFondsId, montant, date) {
  const { data: existant, error: errLecture } = await supabase
    .from("fonds_membres")
