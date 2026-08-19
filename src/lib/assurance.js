import { supabase } from "./supabaseClient";

const SOLDE_MIN_DEFAUT = 80000;
const DELAI_JOURS_DEFAUT = 60;

// ============================================================
// CONFIGURATION ASSURANCE (solde minimum, délai de reconstitution)
// ============================================================

export async function fetchConfigAssurance(groupId) {
  const { data, error } = await supabase
    .from("assurance_config")
    .select("*")
    .eq("group_id", groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { soldeMinimum: SOLDE_MIN_DEFAUT, delaiJours: DELAI_JOURS_DEFAUT, montantPrelevementDefaut: 10000 };
  return {
    soldeMinimum: data.solde_minimum,
    delaiJours: data.delai_reconstitution_jours,
    montantPrelevementDefaut: data.montant_prelevement_defaut || 10000,
  };
}

// Enregistre (crée ou met à jour) la configuration de l'assurance
// pour un groupe donné — chaque groupe fixe son propre montant
// minimum, son propre délai de reconstitution, et le montant
// standard prélevé par membre à chaque événement.
export async function sauvegarderConfigAssurance(groupId, { soldeMinimum, delaiJours, montantPrelevementDefaut }) {
  const { data: existant, error: errLecture } = await supabase
    .from("assurance_config")
    .select("group_id")
    .eq("group_id", groupId)
    .maybeSingle();
  if (errLecture) throw errLecture;

  if (existant) {
    const { error } = await supabase
      .from("assurance_config")
      .update({ solde_minimum: soldeMinimum, delai_reconstitution_jours: delaiJours, montant_prelevement_defaut: montantPrelevementDefaut })
      .eq("group_id", groupId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("assurance_config")
      .insert({ group_id: groupId, solde_minimum: soldeMinimum, delai_reconstitution_jours: delaiJours, montant_prelevement_defaut: montantPrelevementDefaut });
    if (error) throw error;
  }
}

// ============================================================
// SOLDES D'ASSURANCE PAR MEMBRE
// ============================================================

// Récupère les soldes de tous les membres du groupe. Si un membre
// n'a pas encore de ligne (nouveau), on lui attribue le solde
// minimum par défaut, initialisé en base au passage.
export async function fetchSoldesAssurance(groupId, membres, soldeMinimum) {
  const { data, error } = await supabase
    .from("assurance_soldes")
    .select("*")
    .eq("group_id", groupId);
  if (error) throw error;

  const soldesParMembre = Object.fromEntries(data.map((s) => [s.membre_id, s]));
  const manquants = membres.filter((m) => m && m.id && !soldesParMembre[m.id]);

  if (manquants.length > 0) {
    const lignes = manquants.map((m) => ({ group_id: groupId, membre_id: m.id, solde: soldeMinimum }));
    const { data: crees, error: errInsert } = await supabase.from("assurance_soldes").insert(lignes).select();
    if (errInsert) throw errInsert;
    crees.forEach((s) => { soldesParMembre[s.membre_id] = s; });
  }

  return soldesParMembre;
}

// ============================================================
// COTISATIONS (reconstitution du solde)
// ============================================================

export async function enregistrerCotisationsAssurance(groupId, cotisations, soldeMinimum) {
  const lignes = cotisations.filter((c) => c.montant && parseFloat(c.montant) > 0);
  if (lignes.length === 0) return;

  for (const c of lignes) {
    const { data: actuel, error: errLecture } = await supabase
      .from("assurance_soldes")
      .select("*")
      .eq("group_id", groupId)
      .eq("membre_id", c.membreId)
      .single();
    if (errLecture) throw errLecture;

    const nouveauSolde = actuel.solde + parseFloat(c.montant);
    const { error: errMaj } = await supabase
      .from("assurance_soldes")
      .update({
        solde: nouveauSolde,
        delai_expire_le: nouveauSolde >= soldeMinimum ? null : actuel.delai_expire_le,
        updated_at: new Date().toISOString(),
      })
      .eq("id", actuel.id);
    if (errMaj) throw errMaj;

    const { error: errHisto } = await supabase.from("assurance_mouvements").insert({
      group_id: groupId,
      membre_id: c.membreId,
      type: "Cotisation",
      montant: parseFloat(c.montant),
      date_mouvement: c.date || new Date().toISOString().slice(0, 10),
      solde_apres: nouveauSolde,
    });
    if (errHisto) throw errHisto;
  }
}

// Récupère l'historique complet des mouvements d'assurance
// (cotisations et prélèvements), du plus récent au plus ancien.
export async function fetchHistoriqueAssurance(groupId) {
  const { data, error } = await supabase
    .from("assurance_mouvements")
    .select(`
      id, type, montant, date_mouvement, solde_apres,
      membre:group_members!membre_id ( id, profile:profiles ( nom_complet ) )
    `)
    .eq("group_id", groupId)
    .order("date_mouvement", { ascending: false });

  if (error) throw error;
  return data.map((m) => ({
    id: m.id,
    date: m.date_mouvement,
    membre: m.membre?.profile?.nom_complet || "—",
    type: m.type,
    montant: m.montant,
    solde: m.solde_apres,
  }));
}

// ============================================================
// ÉVÉNEMENTS ET TYPES D'ÉVÉNEMENTS
// ============================================================

export async function fetchTypesEvenement(groupId) {
  const { data, error } = await supabase
    .from("assurance_types_evenement")
    .select("*")
    .eq("group_id", groupId)
    .order("nom", { ascending: true });
  if (error) throw error;
  return data;
}

export async function creerTypeEvenement(groupId, nom) {
  const { data, error } = await supabase
    .from("assurance_types_evenement")
    .insert({ group_id: groupId, nom })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchEvenements(groupId) {
  const { data, error } = await supabase
    .from("assurance_evenements")
    .select(`
      id, lien_avec_membre, date_declaration, frais_declaration, date_evenement,
      montant_brut, montant_net, toute_reunion, statut, created_at, type_id,
      type:assurance_types_evenement ( nom ),
      beneficiaire:group_members!assurance_evenements_membre_beneficiaire_id_fkey ( id, profile:profiles ( nom_complet ) )
    `)
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((e) => ({
    id: e.id,
    typeId: e.type_id,
    type: e.type?.nom || "—",
    beneficiaireId: e.beneficiaire?.id || null,
    beneficiaire: e.beneficiaire?.profile?.nom_complet || "—",
    montantBrut: e.montant_brut,
    dateEvenement: e.date_evenement,
    statut: e.statut,
  }));
}

// Déclare un événement : prélève le montant brut au prorata sur le
// solde d'assurance de TOUS les membres du groupe, et enregistre les
// déductions (transport, achats...) et les délégués désignés.
export async function declarerEvenement(groupId, {
  typeId, beneficiaireId, lienAvecMembre, dateDeclaration, fraisDeclaration,
  dateEvenement, montantBrut, touteReunion, deleguesIds, deductions,
  membresGroupe, soldeMinimum, delaiJours,
}) {
  const { data: evenement, error: errEvt } = await supabase
    .from("assurance_evenements")
    .insert({
      group_id: groupId,
      type_id: typeId,
      membre_beneficiaire_id: beneficiaireId,
      lien_avec_membre: lienAvecMembre || null,
      date_declaration: dateDeclaration || null,
      frais_declaration: fraisDeclaration || 0,
      date_evenement: dateEvenement || null,
      montant_brut: montantBrut,
      toute_reunion: touteReunion,
      statut: "déclaré",
    })
    .select()
    .single();
  if (errEvt) throw errEvt;

  if (!touteReunion && deleguesIds && deleguesIds.length > 0) {
    const lignesDelegues = deleguesIds.map((id) => ({ evenement_id: evenement.id, membre_id: id }));
    const { error: errDel } = await supabase.from("assurance_delegues").insert(lignesDelegues);
    if (errDel) throw errDel;
  }

  const deductionsValides = (deductions || []).filter((d) => d.label && d.montant);
  if (deductionsValides.length > 0) {
    const lignesDeductions = deductionsValides.map((d) => ({
      evenement_id: evenement.id,
      label: d.label,
      montant: parseFloat(d.montant),
    }));
    const { error: errDed } = await supabase.from("assurance_deductions").insert(lignesDeductions);
    if (errDed) throw errDed;
  }

  // Prélèvement au prorata sur tous les membres
  const part = montantBrut / membresGroupe.length;
  for (const m of membresGroupe) {
    const { data: actuel, error: errLecture } = await supabase
      .from("assurance_soldes")
      .select("*")
      .eq("group_id", groupId)
      .eq("membre_id", m.id)
      .single();
    if (errLecture) throw errLecture;

    const soldeAvant = actuel.solde;
    const soldeApres = Math.max(0, soldeAvant - part);
    const delaiExpire = soldeApres < soldeMinimum
      ? (actuel.delai_expire_le || new Date(Date.now() + delaiJours * 86400000).toISOString().slice(0, 10))
      : null;

    const { error: errMaj } = await supabase
      .from("assurance_soldes")
      .update({ solde: soldeApres, delai_expire_le: delaiExpire, updated_at: new Date().toISOString() })
      .eq("id", actuel.id);
    if (errMaj) throw errMaj;

    const { error: errPrelevement } = await supabase.from("assurance_prelevements").insert({
      evenement_id: evenement.id,
      membre_id: m.id,
      montant: part,
      solde_avant: soldeAvant,
      solde_apres: soldeApres,
    });
    if (errPrelevement) throw errPrelevement;

    const { error: errHisto } = await supabase.from("assurance_mouvements").insert({
      group_id: groupId,
      membre_id: m.id,
      type: "Prélèvement",
      montant: part,
      date_mouvement: new Date().toISOString().slice(0, 10),
      solde_apres: soldeApres,
      evenement_id: evenement.id,
    });
    if (errHisto) throw errHisto;
  }

  return evenement;
}
