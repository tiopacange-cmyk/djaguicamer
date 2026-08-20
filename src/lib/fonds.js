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

export async function fixerCibleFonds(membreId, typeFondsId, cible) {
  const { error } = await supabase
    .from("fonds_membres")
    .upsert({ membre_id: membreId, type_fonds_id: typeFondsId, cible }, { onConflict: "membre_id,type_fonds_id" });
  if (error) throw error;
}

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
    .upsert({ membre_id: membreId, type_fonds_id: typeFondsId, solde: nouveauSolde, cible: existant ? undefined : 0 }, { onConflict: "membre_id,type_fonds_id" });
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

export async function fetchFondsMembre(groupId, membreId) {
  const types = await fetchTypesFonds(groupId);
  const { data, error } = await supabase
    .from("fonds_membres")
    .select("type_fonds_id, cible, solde")
    .eq("membre_id", membreId);
  if (error) throw error;

  const parType = Object.fromEntries(data.map((f) => [f.type_fonds_id, f]));
  return types.map((t) => ({
    typeFondsId: t.id,
    nom: t.nom,
    cible: parType[t.id]?.cible || 0,
    solde: parType[t.id]?.solde || 0,
  }));
}
