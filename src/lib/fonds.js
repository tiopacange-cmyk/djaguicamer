import { supabase } from "./supabaseClient";

// ============================================================
// TYPES DE FONDS (rubriques créées par l'admin du groupe)
// L'objectif ("cible") est commun à tous les membres — fixé une
// seule fois sur le type de fonds, pas individuellement.
// ============================================================

export async function fetchTypesFonds(groupId) {
  const { data, error } = await supabase
    .from("types_fonds")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((t) => ({ id: t.id, nom: t.nom, cible: t.cible || 0 }));
}

export async function creerTypeFonds(groupId, nom, cible) {
  const { data, error } = await supabase
    .from("types_fonds")
    .insert({ group_id: groupId, nom, cible: cible || 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Modifie l'objectif commun d'un type de fonds (s'applique à tous
// les membres immédiatement)
export async function fixerCibleTypeFonds(typeFondsId, cible) {
  const { error } = await supabase.from("types_fonds").update({ cible }).eq("id", typeFondsId);
  if (error) throw error;
}

export async function supprimerTypeFonds(typeFondsId) {
  const { error } = await supabase.from("types_fonds").delete().eq("id", typeFondsId);
  if (error) throw error;
}

// ============================================================
// SOLDE PAR MEMBRE (progression vers l'objectif commun)
// ============================================================

// Récupère, pour TOUS les membres du groupe, leur solde sur
// CHAQUE type de fonds — utilisé pour l'affichage du tableau des
// membres et de l'écran Fonds.
export async function fetchFondsTousMembres(groupId) {
  const { data, error } = await supabase
    .from("fonds_membres")
    .select(`
      membre_id, type_fonds_id, solde,
      membre:group_members!inner ( group_id )
    `)
    .eq("membre.group_id", groupId);
  if (error) throw error;
  return data.map((f) => ({
    membreId: f.membre_id,
    typeFondsId: f.type_fonds_id,
    solde: f.solde,
  }));
}

// Enregistre un versement vers un fonds, met à jour le solde, et
// trace le mouvement dans l'historique.
export async function enregistrerVersementFonds(membreId, typeFondsId, montant, date) {
  const { data: existant, error: errLecture } = await supabase
    .from("fonds_membres")
    .select("solde")
    .eq("membre_id", membreId)
    .eq("type_fonds_id", typeFondsId)
    .maybeSingle();
  if (errLecture) throw errLecture;

  const nouveauSolde = (existant?.solde || 0) + montant;

  const { error: errUpsert } = await supabase
    .from("fonds_membres")
    .upsert({ membre_id: membreId, type_fonds_id: typeFondsId, solde: nouveauSolde }, { onConflict: "membre_id,type_fonds_id" });
  if (errUpsert) throw errUpsert;

  const { error: errMouvement } = await supabase.from("fonds_mouvements").insert({
    membre_id: membreId,
    type_fonds_id: typeFondsId,
    montant,
    date_mouvement: date || new Date().toISOString().slice(0, 10),
  });
  if (errMouvement) throw errMouvement;

  return nouveauSolde;
}

// Récupère le détail des fonds d'UN membre (tous types confondus,
// avec l'objectif commun de chacun), utilisé sur son propre
// tableau de bord.
export async function fetchFondsMembre(groupId, membreId) {
  const types = await fetchTypesFonds(groupId);
  const { data, error } = await supabase
    .from("fonds_membres")
    .select("type_fonds_id, solde")
    .eq("membre_id", membreId);
  if (error) throw error;

  const soldeParType = Object.fromEntries(data.map((f) => [f.type_fonds_id, f.solde]));
  return types.map((t) => ({
    typeFondsId: t.id,
    nom: t.nom,
    cible: t.cible,
    solde: soldeParType[t.id] || 0,
  }));
}
