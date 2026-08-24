import { supabase } from "./supabaseClient";

// ============================================================
// SÉANCES
// ============================================================

export async function fetchSeances(groupId) {
  const { data, error } = await supabase
    .from("seances")
    .select("*")
    .eq("group_id", groupId)
    .order("date_seance", { ascending: false });
  if (error) throw error;
  return data.map((s) => ({
    id: s.id,
    date: s.date_seance,
    lieu: s.lieu,
    ordreDuJour: s.ordre_du_jour,
    compteRendu: s.compte_rendu,
    statut: s.statut,
  }));
}

export async function creerSeance(groupId, { date, lieu, ordreDuJour }) {
  const { data, error } = await supabase
    .from("seances")
    .insert({ group_id: groupId, date_seance: date, lieu: lieu || null, ordre_du_jour: ordreDuJour || null, statut: "à venir" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function enregistrerCompteRendu(seanceId, compteRendu) {
  const { error } = await supabase.from("seances").update({ compte_rendu: compteRendu, statut: "terminée" }).eq("id", seanceId);
  if (error) throw error;
}

export async function supprimerSeance(seanceId) {
  const { error } = await supabase.from("seances").delete().eq("id", seanceId);
  if (error) throw error;
}

// ============================================================
// PRÉSENCES
// ============================================================

export async function fetchPresences(seanceId) {
  const { data, error } = await supabase
    .from("seance_presences")
    .select("membre_id, statut")
    .eq("seance_id", seanceId);
  if (error) throw error;
  return Object.fromEntries(data.map((p) => [p.membre_id, p.statut]));
}

// Enregistre la présence de tous les membres en une fois
// (present/absent/excusé), pour une séance donnée.
export async function enregistrerPresences(seanceId, presences) {
  const lignes = Object.entries(presences)
    .filter(([, statut]) => statut)
    .map(([membreId, statut]) => ({ seance_id: seanceId, membre_id: membreId, statut }));
  if (lignes.length === 0) return;

  const { error } = await supabase
    .from("seance_presences")
    .upsert(lignes, { onConflict: "seance_id,membre_id" });
  if (error) throw error;
}

// Taux de présence de chaque membre, sur toutes les séances
// "terminée" du groupe — utilisé pour l'historique.
export async function fetchTauxPresence(groupId) {
  const { data: seances, error: errS } = await supabase
    .from("seances")
    .select("id")
    .eq("group_id", groupId)
    .eq("statut", "terminée");
  if (errS) throw errS;
  const idsSeances = seances.map((s) => s.id);
  if (idsSeances.length === 0) return {};

  const { data, error } = await supabase
    .from("seance_presences")
    .select("membre_id, statut")
    .in("seance_id", idsSeances);
  if (error) throw error;

  const parMembre = {};
  data.forEach((p) => {
    if (!parMembre[p.membre_id]) parMembre[p.membre_id] = { present: 0, absent: 0, excuse: 0, total: 0 };
    parMembre[p.membre_id].total += 1;
    if (p.statut === "présent") parMembre[p.membre_id].present += 1;
    else if (p.statut === "absent") parMembre[p.membre_id].absent += 1;
    else if (p.statut === "excusé") parMembre[p.membre_id].excuse += 1;
  });

  return Object.fromEntries(
    Object.entries(parMembre).map(([membreId, s]) => [
      membreId,
      { ...s, tauxPresence: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0 },
    ])
  );
}

// ============================================================
// TYPES D'AMENDES DE SÉANCE (propres à chaque groupe, selon son
// règlement intérieur)
// ============================================================

export async function fetchTypesAmendesSeance(groupId) {
  const { data, error } = await supabase
    .from("types_amendes_seance")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((t) => ({ id: t.id, nom: t.nom, montant: t.montant }));
}

export async function creerTypeAmendeSeance(groupId, nom, montant) {
  const { data, error } = await supabase
    .from("types_amendes_seance")
    .insert({ group_id: groupId, nom, montant: montant || 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function modifierTypeAmendeSeance(typeAmendeId, montant) {
  const { error } = await supabase.from("types_amendes_seance").update({ montant }).eq("id", typeAmendeId);
  if (error) throw error;
}

export async function supprimerTypeAmendeSeance(typeAmendeId) {
  const { error } = await supabase.from("types_amendes_seance").delete().eq("id", typeAmendeId);
  if (error) throw error;
}

// ============================================================
// AMENDES APPLIQUÉES LORS D'UNE SÉANCE
// ============================================================

export async function fetchAmendesSeance(seanceId) {
  const { data, error } = await supabase
    .from("seance_amendes")
    .select("id, membre_id, montant, motif, statut, mode_paiement, date_paiement, type_amende:types_amendes_seance(nom)")
    .eq("seance_id", seanceId);
  if (error) throw error;
  return data.map((a) => ({
    id: a.id,
    membreId: a.membre_id,
    montant: a.montant,
    motif: a.motif,
    typeNom: a.type_amende?.nom || "—",
    statut: a.statut,
    modePaiement: a.mode_paiement,
    datePaiement: a.date_paiement,
  }));
}

export async function appliquerAmendeSeance(seanceId, membreId, typeAmendeId, montant, motif) {
  const { error } = await supabase.from("seance_amendes").insert({
    seance_id: seanceId,
    membre_id: membreId,
    type_amende_id: typeAmendeId || null,
    montant,
    motif: motif || null,
  });
  if (error) throw error;
}

// ============================================================
// CAISSE DES AMENDES — suit le paiement de chaque amende, en
// espèces ou déduit de la banque du membre, dans une caisse
// commune trackée.
// ============================================================

export async function fetchCaisseAmendes(groupId) {
  const { data, error } = await supabase
    .from("caisse_amendes")
    .select("solde")
    .eq("group_id", groupId)
    .maybeSingle();
  if (error) throw error;
  return data?.solde || 0;
}

// Marque une amende comme payée. En espèces, la caisse des amendes
// augmente directement. Déduit de la banque, le montant sort de
// l'épargne choisie du membre ET vient quand même alimenter la
// caisse des amendes (transfert interne, pas de perte).
export async function payerAmendeSeance(groupId, amendeId, membreId, montant, modePaiement, epargneId) {
  if (modePaiement === "déduit banque") {
    if (!epargneId) throw new Error("Choisis l'épargne à débiter.");
    const { data: epargne, error: errLecture } = await supabase
      .from("epargnes")
      .select("solde")
      .eq("id", epargneId)
      .single();
    if (errLecture) throw errLecture;

    const nouveauSolde = epargne.solde - montant;
    const { error: errMouvement } = await supabase.from("epargne_mouvements").insert({
      epargne_id: epargneId,
      membre_id: membreId,
      type: "Retrait",
      montant,
      date_mouvement: new Date().toISOString().slice(0, 10),
      solde_apres: nouveauSolde,
    });
    if (errMouvement) throw errMouvement;

    const { error: errMaj } = await supabase.from("epargnes").update({ solde: nouveauSolde }).eq("id", epargneId);
    if (errMaj) throw errMaj;
  }

  const { data: caisse, error: errCaisse } = await supabase
    .from("caisse_amendes")
    .select("id, solde")
    .eq("group_id", groupId)
    .maybeSingle();
  if (errCaisse) throw errCaisse;

  let nouveauSoldeCaisse;
  if (caisse) {
    nouveauSoldeCaisse = caisse.solde + montant;
    const { error } = await supabase.from("caisse_amendes").update({ solde: nouveauSoldeCaisse }).eq("id", caisse.id);
    if (error) throw error;
  } else {
    nouveauSoldeCaisse = montant;
    const { error } = await supabase.from("caisse_amendes").insert({ group_id: groupId, solde: nouveauSoldeCaisse });
    if (error) throw error;
  }

  const { error: errHisto } = await supabase.from("caisse_amendes_mouvements").insert({
    group_id: groupId,
    seance_amende_id: amendeId,
    membre_id: membreId,
    montant,
    mode_paiement: modePaiement,
    date_mouvement: new Date().toISOString().slice(0, 10),
  });
  if (errHisto) throw errHisto;

  const { error: errAmende } = await supabase
    .from("seance_amendes")
    .update({
      statut: "payée",
      mode_paiement: modePaiement,
      date_paiement: new Date().toISOString().slice(0, 10),
      epargne_id: modePaiement === "déduit banque" ? epargneId : null,
    })
    .eq("id", amendeId);
  if (errAmende) throw errAmende;

  return nouveauSoldeCaisse;
}
