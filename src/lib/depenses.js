import { supabase } from "./supabaseClient";

// ============================================================
// RAFRAÎCHISSEMENT — boissons de séance, avec caisse "reliquat
// boisson" qui peut aller en débit (négatif) temporairement.
// ============================================================

export async function fetchCaisseRafraichissement(groupId) {
  const { data, error } = await supabase
    .from("caisse_rafraichissement")
    .select("solde")
    .eq("group_id", groupId)
    .maybeSingle();
  if (error) throw error;
  return data?.solde || 0;
}

export async function fetchRafraichissements(groupId) {
  const { data, error } = await supabase
    .from("rafraichissements")
    .select("*, responsable:group_members(profile:profiles(nom_complet))")
    .eq("group_id", groupId)
    .order("date_rafraichissement", { ascending: false });
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    date: r.date_rafraichissement,
    montantParMembre: r.montant_par_membre,
    montantCollecte: r.montant_collecte,
    montantFacture: r.montant_facture,
    reliquat: r.reliquat,
    responsable: r.responsable?.profile?.nom_complet || "—",
  }));
}

// Enregistre un rafraîchissement : la collecte des participants,
// la facture réelle, calcule le reliquat (positif ou négatif) et
// met à jour la caisse en conséquence — elle peut passer en débit
// si la facture dépasse la collecte, en attendant de se rééquilibrer.
export async function creerRafraichissement(groupId, { seanceId, montantParMembre, participants, montantFacture, responsableId, date }) {
  const montantCollecte = participants.reduce((s, p) => s + p.montant, 0);
  const reliquat = montantCollecte - montantFacture;

  const { data: rafraichissement, error: errR } = await supabase
    .from("rafraichissements")
    .insert({
      group_id: groupId,
      seance_id: seanceId || null,
      date_rafraichissement: date,
      montant_par_membre: montantParMembre,
      montant_collecte: montantCollecte,
      montant_facture: montantFacture,
      reliquat,
      responsable_id: responsableId || null,
    })
    .select()
    .single();
  if (errR) throw errR;

  if (participants.length > 0) {
    const lignes = participants.map((p) => ({
      rafraichissement_id: rafraichissement.id,
      membre_id: p.membreId,
      montant: p.montant,
    }));
    const { error: errP } = await supabase.from("rafraichissement_participants").insert(lignes);
    if (errP) throw errP;
  }

  const { data: caisse, error: errCaisse } = await supabase
    .from("caisse_rafraichissement")
    .select("id, solde")
    .eq("group_id", groupId)
    .maybeSingle();
  if (errCaisse) throw errCaisse;

  let nouveauSolde;
  if (caisse) {
    nouveauSolde = caisse.solde + reliquat;
    const { error } = await supabase.from("caisse_rafraichissement").update({ solde: nouveauSolde }).eq("id", caisse.id);
    if (error) throw error;
  } else {
    nouveauSolde = reliquat;
    const { error } = await supabase.from("caisse_rafraichissement").insert({ group_id: groupId, solde: nouveauSolde });
    if (error) throw error;
  }

  return { rafraichissement, reliquat, nouveauSolde };
}

// ============================================================
// TYPES DE DÉPENSES (catégories propres à chaque groupe)
// ============================================================

export async function fetchTypesDepenses(groupId) {
  const { data, error } = await supabase
    .from("types_depenses")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((t) => ({ id: t.id, nom: t.nom }));
}

export async function creerTypeDepense(groupId, nom) {
  const { data, error } = await supabase
    .from("types_depenses")
    .insert({ group_id: groupId, nom })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function supprimerTypeDepense(typeDepenseId) {
  const { error } = await supabase.from("types_depenses").delete().eq("id", typeDepenseId);
  if (error) throw error;
}

// ============================================================
// DÉPENSES — la source choisie (épargne, compte externe, caisse
// des amendes, ou caisse rafraîchissement) est débitée du montant.
// ============================================================

export async function fetchDepenses(groupId) {
  const { data, error } = await supabase
    .from("depenses")
    .select("*, type_depense:types_depenses(nom)")
    .eq("group_id", groupId)
    .order("date_depense", { ascending: false });
  if (error) throw error;
  return data.map((d) => ({
    id: d.id,
    typeNom: d.type_depense?.nom || "—",
    montant: d.montant,
    date: d.date_depense,
    motif: d.motif,
    sourceType: d.source_type,
    sourceId: d.source_id,
  }));
}

const LIBELLES_SOURCE = {
  epargne: "Épargne",
  compte_externe: "Compte bancaire externe",
  caisse_amendes: "Caisse des amendes",
  caisse_rafraichissement: "Caisse reliquat boisson",
};

export function libelleSourceDepense(sourceType) {
  return LIBELLES_SOURCE[sourceType] || sourceType;
}

export async function creerDepense(groupId, { typeDepenseId, montant, date, motif, sourceType, sourceId }) {
  // Débite la source choisie
  if (sourceType === "epargne") {
    const { data: ep, error: errLecture } = await supabase.from("epargnes").select("solde").eq("id", sourceId).single();
    if (errLecture) throw errLecture;
    const nouveauSolde = ep.solde - montant;
    const { error: errMvt } = await supabase.from("epargne_mouvements").insert({
      epargne_id: sourceId, membre_id: null, type: "Retrait", montant, date_mouvement: date, solde_apres: nouveauSolde,
    });
    if (errMvt) throw errMvt;
    const { error: errMaj } = await supabase.from("epargnes").update({ solde: nouveauSolde }).eq("id", sourceId);
    if (errMaj) throw errMaj;
  } else if (sourceType === "compte_externe") {
    const { data: compte, error: errLecture } = await supabase.from("comptes_bancaires_externes").select("solde").eq("id", sourceId).single();
    if (errLecture) throw errLecture;
    const nouveauSolde = compte.solde - montant;
    const { error: errMvt } = await supabase.from("mouvements_bancaires_externes").insert({
      group_id: groupId, compte_id: sourceId, type: "Frais", montant, date_mouvement: date, motif: motif || null, statut: "en attente du reçu",
    });
    if (errMvt) throw errMvt;
    const { error: errMaj } = await supabase.from("comptes_bancaires_externes").update({ solde: nouveauSolde }).eq("id", sourceId);
    if (errMaj) throw errMaj;
  } else if (sourceType === "caisse_amendes") {
    const { data: caisse, error: errLecture } = await supabase.from("caisse_amendes").select("id, solde").eq("group_id", groupId).maybeSingle();
    if (errLecture) throw errLecture;
    const nouveauSolde = (caisse?.solde || 0) - montant;
    if (caisse) {
      const { error } = await supabase.from("caisse_amendes").update({ solde: nouveauSolde }).eq("id", caisse.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("caisse_amendes").insert({ group_id: groupId, solde: nouveauSolde });
      if (error) throw error;
    }
  } else if (sourceType === "caisse_rafraichissement") {
    const { data: caisse, error: errLecture } = await supabase.from("caisse_rafraichissement").select("id, solde").eq("group_id", groupId).maybeSingle();
    if (errLecture) throw errLecture;
    const nouveauSolde = (caisse?.solde || 0) - montant;
    if (caisse) {
      const { error } = await supabase.from("caisse_rafraichissement").update({ solde: nouveauSolde }).eq("id", caisse.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("caisse_rafraichissement").insert({ group_id: groupId, solde: nouveauSolde });
      if (error) throw error;
    }
  }

  const { error } = await supabase.from("depenses").insert({
    group_id: groupId,
    type_depense_id: typeDepenseId || null,
    montant,
    date_depense: date,
    motif: motif || null,
    source_type: sourceType,
    source_id: sourceId || null,
  });
  if (error) throw error;
}
