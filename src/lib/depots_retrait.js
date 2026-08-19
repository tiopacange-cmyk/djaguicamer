import { supabase } from "./supabaseClient";

// ============================================================
// COMPTES BANCAIRES EXTERNES
// ============================================================

export async function fetchComptesBancaires(groupId) {
  const { data, error } = await supabase
    .from("comptes_bancaires_externes")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((c) => ({
    id: c.id,
    nom: c.nom,
    banque: c.banque,
    agence: c.agence,
    numeroCompte: c.numero_compte,
    type: c.type,
    tauxInteretAnnuel: c.taux_interet_annuel,
    solde: c.solde,
  }));
}

export async function creerCompteBancaire(groupId, { nom, banque, agence, numeroCompte, type, tauxInteretAnnuel }) {
  const { data, error } = await supabase
    .from("comptes_bancaires_externes")
    .insert({
      group_id: groupId,
      nom,
      banque: banque || null,
      agence: agence || null,
      numero_compte: numeroCompte || null,
      type,
      taux_interet_annuel: type === "Épargne" ? (tauxInteretAnnuel || null) : null,
      solde: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================================
// SIGNATAIRES DU COMPTE
// ============================================================

export async function fetchSignataires(groupId) {
  const { data, error } = await supabase
    .from("signataires_compte")
    .select(`
      id, fonction, membre_id,
      membre:group_members ( id, profile:profiles ( nom_complet ) )
    `)
    .eq("group_id", groupId);

  if (error) throw error;
  return data.map((s) => ({
    id: s.id,
    membreId: s.membre_id,
    nom: s.membre?.profile?.nom_complet || "—",
    fonction: s.fonction,
  }));
}

export async function ajouterSignataire(groupId, membreId, fonction) {
  const { data, error } = await supabase
    .from("signataires_compte")
    .insert({ group_id: groupId, membre_id: membreId, fonction: fonction || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================================
// CATÉGORIES DE FRAIS (gérables par le groupe)
// ============================================================

export async function fetchCategoriesFrais(groupId) {
  const { data, error } = await supabase
    .from("categories_frais")
    .select("*")
    .eq("group_id", groupId)
    .order("nom", { ascending: true });
  if (error) throw error;
  return data;
}

export async function creerCategorieFrais(groupId, nom) {
  const { data, error } = await supabase
    .from("categories_frais")
    .insert({ group_id: groupId, nom })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function supprimerCategorieFrais(categorieId) {
  const { error } = await supabase.from("categories_frais").delete().eq("id", categorieId);
  if (error) throw error;
}

// ============================================================
// JOINDRE UN REÇU APRÈS COUP
// ============================================================
// Le signataire revient de la banque après la séance et joint le
// reçu à un mouvement déjà enregistré, SANS modifier aucune autre
// donnée de ce mouvement (montant, type, date, etc. restent intacts).
export async function joindreRecu(mouvementId) {
  const { error } = await supabase
    .from("mouvements_bancaires_externes")
    .update({ statut: "reçu joint" })
    .eq("id", mouvementId);
  if (error) throw error;
}

// ============================================================
// MOUVEMENTS BANCAIRES EXTERNES
// (Dépôt, Retrait, Frais, Intérêt) — tous rattachés à un compte
// ============================================================

// Récupère les mouvements d'UN compte précis, avec le solde
// calculé chronologiquement pour ce compte uniquement.
export async function fetchMouvementsCompte(compteId) {
  const { data, error } = await supabase
    .from("mouvements_bancaires_externes")
    .select(`
      id, type, montant, date_mouvement, motif, categorie_frais, statut, membre_id,
      membre:group_members!mouvements_bancaires_externes_membre_id_fkey ( id, profile:profiles ( nom_complet ) )
    `)
    .eq("compte_id", compteId)
    .order("date_mouvement", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const idsMouvements = data.map((m) => m.id);
  let signatairesLies = [];
  let responsablesFraisLies = [];
  if (idsMouvements.length > 0) {
    const { data: sigData, error: errSig } = await supabase
      .from("mouvement_signataires")
      .select(`
        mouvement_id,
        signataire:signataires_compte ( id, membre:group_members ( profile:profiles ( nom_complet ) ) )
      `)
      .in("mouvement_id", idsMouvements);
    if (errSig) throw errSig;
    signatairesLies = sigData;

    const { data: respData, error: errResp } = await supabase
      .from("mouvement_responsables_frais")
      .select(`
        mouvement_id,
        membre:group_members ( profile:profiles ( nom_complet ) )
      `)
      .in("mouvement_id", idsMouvements);
    if (errResp) throw errResp;
    responsablesFraisLies = respData;
  }

  const signatairesParMouvement = {};
  signatairesLies.forEach((s) => {
    if (!signatairesParMouvement[s.mouvement_id]) signatairesParMouvement[s.mouvement_id] = [];
    signatairesParMouvement[s.mouvement_id].push(s.signataire?.membre?.profile?.nom_complet || "—");
  });

  const responsablesFraisParMouvement = {};
  responsablesFraisLies.forEach((r) => {
    if (!responsablesFraisParMouvement[r.mouvement_id]) responsablesFraisParMouvement[r.mouvement_id] = [];
    responsablesFraisParMouvement[r.mouvement_id].push(r.membre?.profile?.nom_complet || "—");
  });

  // Dépôt et Intérêt augmentent le solde ; Retrait et Frais le diminuent
  let solde = 0;
  const avecSolde = data.map((m) => {
    solde += (m.type === "Dépôt" || m.type === "Intérêt") ? m.montant : -m.montant;
    let signataire = "—";
    if (m.type === "Dépôt" || m.type === "Intérêt") signataire = m.membre?.profile?.nom_complet || "—";
    else if (m.type === "Frais") signataire = (responsablesFraisParMouvement[m.id] || []).join(", ") || "—";
    else signataire = (signatairesParMouvement[m.id] || []).join(", ") || "—";
    return {
      id: m.id,
      date: m.date_mouvement,
      type: m.type,
      montant: m.montant,
      motif: m.motif || "—",
      categorie: m.categorie_frais || "—",
      statut: m.statut,
      signataire,
      solde,
    };
  });

  return avecSolde.reverse(); // du plus récent au plus ancien pour l'affichage
}

// Crée un nouveau mouvement et met à jour le solde du compte concerné.
// - Dépôt : membreId identifie qui a versé. Augmente le solde.
// - Retrait : signatairesIds liste les 2-3 signataires ayant validé. Diminue le solde.
// - Frais : catégorie libre (ex. "SMS", "Tenue de compte"). Diminue le solde.
// - Intérêt : uniquement pour un compte de type Épargne. Augmente le solde.
export async function creerMouvementExterne(groupId, {
  compteId, type, montant, dateMouvement, motif, categorie, membreId, signatairesIds, recuJoint,
}) {
  const { data: compte, error: errCompte } = await supabase
    .from("comptes_bancaires_externes")
    .select("solde")
    .eq("id", compteId)
    .single();
  if (errCompte) throw errCompte;

  const { data: mouvement, error: errMvt } = await supabase
    .from("mouvements_bancaires_externes")
    .insert({
      group_id: groupId,
      compte_id: compteId,
      type,
      montant,
      date_mouvement: dateMouvement,
      motif: type === "Retrait" ? motif : null,
      categorie_frais: type === "Frais" ? categorie : null,
      membre_id: (type === "Dépôt" || type === "Intérêt") ? (membreId || null) : null,
      statut: recuJoint ? "reçu joint" : "en attente du reçu",
    })
    .select()
    .single();
  if (errMvt) throw errMvt;

  if (type === "Retrait" && signatairesIds && signatairesIds.length > 0) {
    const lignes = signatairesIds.map((id) => ({ mouvement_id: mouvement.id, signataire_id: id }));
    const { error: errSig } = await supabase.from("mouvement_signataires").insert(lignes);
    if (errSig) throw errSig;
  }

  if (type === "Frais" && signatairesIds && signatairesIds.length > 0) {
    const lignes = signatairesIds.map((id) => ({ mouvement_id: mouvement.id, membre_id: id }));
    const { error: errResp } = await supabase.from("mouvement_responsables_frais").insert(lignes);
    if (errResp) throw errResp;
  }

  const nouveauSolde = compte.solde + ((type === "Dépôt" || type === "Intérêt") ? montant : -montant);
  const { error: errMaj } = await supabase
    .from("comptes_bancaires_externes")
    .update({ solde: nouveauSolde })
    .eq("id", compteId);
  if (errMaj) throw errMaj;

  return mouvement;
}
