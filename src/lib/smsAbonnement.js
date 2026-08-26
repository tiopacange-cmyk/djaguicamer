import { supabase } from "./supabaseClient";

// ============================================================
// CONFIGURATION (tarif fixé par l'admin du groupe)
// ============================================================

export async function fetchConfigAbonnementSms(groupId) {
  const { data, error } = await supabase
    .from("groups")
    .select("sms_abonnement_prix_mensuel, sms_abonnement_credits")
    .eq("id", groupId)
    .single();
  if (error) throw error;
  return { prixMensuel: data.sms_abonnement_prix_mensuel || 0, credits: data.sms_abonnement_credits || 0 };
}

export async function definirConfigAbonnementSms(groupId, prixMensuel, credits) {
  const { error } = await supabase
    .from("groups")
    .update({ sms_abonnement_prix_mensuel: prixMensuel, sms_abonnement_credits: credits })
    .eq("id", groupId);
  if (error) throw error;
}

// ============================================================
// CHOIX D'ABONNEMENT DU MEMBRE (opt-in)
// ============================================================

export async function fetchMonAbonnementSms(membreId) {
  const { data, error } = await supabase
    .from("sms_abonnements_membres")
    .select("actif")
    .eq("membre_id", membreId)
    .maybeSingle();
  if (error) throw error;
  return data?.actif || false;
}

export async function toggleAbonnementSms(membreId, actif) {
  const { error } = await supabase
    .from("sms_abonnements_membres")
    .upsert({ membre_id: membreId, actif }, { onConflict: "membre_id" });
  if (error) throw error;
}

// Liste tous les membres du groupe abonnés (actif = true)
export async function fetchAbonnesSms(groupId) {
  const { data, error } = await supabase
    .from("sms_abonnements_membres")
    .select("membre_id, actif, membre:group_members!inner(group_id)")
    .eq("actif", true)
    .eq("membre.group_id", groupId);
  if (error) throw error;
  return data.map((a) => a.membre_id);
}

// ============================================================
// PRÉLÈVEMENTS MENSUELS
// ============================================================

// Liste les membres déjà prélevés pour un mois donné (format "YYYY-MM")
export async function fetchDejaPreleves(groupId, mois) {
  const { data, error } = await supabase
    .from("sms_prelevements")
    .select("membre_id")
    .eq("group_id", groupId)
    .eq("mois", mois);
  if (error) throw error;
  return data.map((p) => p.membre_id);
}

// Effectue le prélèvement d'un membre pour le mois donné : ajoute
// les crédits SMS correspondants au pool du groupe, et débite
// l'épargne du membre si le mode choisi est "déduit banque".
export async function effectuerPrelevementSms(groupId, membreId, mois, montant, credits, modePaiement, epargneId) {
  if (modePaiement === "déduit banque") {
    if (!epargneId) throw new Error("Choisis l'épargne à débiter.");
    const { data: ep, error: errLecture } = await supabase.from("epargnes").select("solde").eq("id", epargneId).single();
    if (errLecture) throw errLecture;
    const nouveauSolde = ep.solde - montant;
    const { error: errMvt } = await supabase.from("epargne_mouvements").insert({
      epargne_id: epargneId, membre_id: membreId, type: "Retrait", montant, date_mouvement: new Date().toISOString().slice(0, 10), solde_apres: nouveauSolde,
    });
    if (errMvt) throw errMvt;
    const { error: errMaj } = await supabase.from("epargnes").update({ solde: nouveauSolde }).eq("id", epargneId);
    if (errMaj) throw errMaj;
  }

  const { error: errPrelevement } = await supabase.from("sms_prelevements").insert({
    group_id: groupId,
    membre_id: membreId,
    mois,
    montant,
    mode_paiement: modePaiement,
    epargne_id: modePaiement === "déduit banque" ? epargneId : null,
  });
  if (errPrelevement) throw errPrelevement;

  // L'argent atterrit réellement dans la caisse SMS, quel que soit
  // le mode de paiement (comme la caisse des amendes).
  const { data: caisse, error: errCaisse } = await supabase
    .from("caisse_sms")
    .select("id, solde")
    .eq("group_id", groupId)
    .maybeSingle();
  if (errCaisse) throw errCaisse;

  if (caisse) {
    const { error } = await supabase.from("caisse_sms").update({ solde: caisse.solde + montant }).eq("id", caisse.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("caisse_sms").insert({ group_id: groupId, solde: montant });
    if (error) throw error;
  }

  const { data: groupe, error: errLectureGroupe } = await supabase.from("groups").select("sms_credits").eq("id", groupId).single();
  if (errLectureGroupe) throw errLectureGroupe;
  const { error: errCredits } = await supabase.from("groups").update({ sms_credits: groupe.sms_credits - credits }).eq("id", groupId);
  if (errCredits) throw errCredits;
}

export async function fetchCaisseSms(groupId) {
  const { data, error } = await supabase.from("caisse_sms").select("solde").eq("group_id", groupId).maybeSingle();
  if (error) throw error;
  return data?.solde || 0;
}
