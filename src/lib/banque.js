import { supabase } from "./supabaseClient";

// ============================================================
// ÉPARGNES (banque scolaire, annuelle, personnalisée)
// ============================================================

export async function fetchEpargnes(groupId) {
  const { data, error } = await supabase
    .from("epargnes")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map((e) => ({
    id: e.id,
    nom: e.nom,
    type: e.type,
    solde: e.solde,
    cotisation: e.cotisation_par_seance,
    tauxInteret: e.taux_interet,
    cloture: e.date_cloture,
    statut: e.statut,
  }));
}

export async function creerEpargne(groupId, { nom, type, cotisationParSeance, tauxInteret, dateCloture }) {
  const { data, error } = await supabase
    .from("epargnes")
    .insert({
      group_id: groupId,
      nom,
      type,
      cotisation_par_seance: cotisationParSeance || null,
      taux_interet: tauxInteret || null,
      date_cloture: dateCloture || null,
      solde: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// MOUVEMENTS D'ÉPARGNE (versements et retraits)
// ============================================================

export async function enregistrerCotisationsEpargne(epargneId, cotisations) {
  const lignes = cotisations.filter((c) => c.montant && parseFloat(c.montant) > 0);
  if (lignes.length === 0) return;

  const { data: epargne, error: errLecture } = await supabase
    .from("epargnes")
    .select("solde")
    .eq("id", epargneId)
    .single();
  if (errLecture) throw errLecture;

  let soldeCourant = epargne.solde;
  for (const c of lignes) {
    soldeCourant += parseFloat(c.montant);
    const { error: errMouvement } = await supabase.from("epargne_mouvements").insert({
      epargne_id: epargneId,
      membre_id: c.membreId,
      type: "Versement",
      montant: parseFloat(c.montant),
      date_mouvement: c.date,
      solde_apres: soldeCourant,
    });
    if (errMouvement) throw errMouvement;
  }

  const { error: errMaj } = await supabase.from("epargnes").update({ solde: soldeCourant }).eq("id", epargneId);
  if (errMaj) throw errMaj;
}

export async function fetchHistoriqueEpargnes(groupId) {
  const { data: epargnes, error: errE } = await supabase
    .from("epargnes")
    .select("id, nom")
    .eq("group_id", groupId);
  if (errE) throw errE;

  const idsEpargnes = epargnes.map((e) => e.id);
  if (idsEpargnes.length === 0) return [];

  const { data, error } = await supabase
    .from("epargne_mouvements")
    .select(`
      id, type, montant, date_mouvement, solde_apres, epargne_id,
      membre:group_members ( id, profile:profiles ( nom_complet ) )
    `)
    .in("epargne_id", idsEpargnes)
    .order("date_mouvement", { ascending: false });

  if (error) throw error;

  const nomParId = Object.fromEntries(epargnes.map((e) => [e.id, e.nom]));
  return data.map((m) => ({
    id: m.id,
    date: m.date_mouvement,
    membre: m.membre?.profile?.nom_complet || "—",
    epargne: nomParId[m.epargne_id] || "—",
    type: m.type,
    montant: m.montant,
    solde: m.solde_apres,
  }));
}

// ============================================================
// PRÊTS
// ============================================================

export async function fetchPrets(groupId) {
  const { data: epargnes, error: errE } = await supabase
    .from("epargnes")
    .select("id")
    .eq("group_id", groupId);
  if (errE) throw errE;

  const idsEpargnes = epargnes.map((e) => e.id);
  if (idsEpargnes.length === 0) return [];

  const { data, error } = await supabase
    .from("prets")
    .select(`
      id, montant, frais_dossier, commission, date_debut, date_fin, penalite_retard, statut, renouvele, epargne_id,
      membre:group_members ( id, profile:profiles ( nom_complet ) ),
      avalisations ( montant_garanti, avaliste:group_members ( id, profile:profiles ( nom_complet ) ) )
    `)
    .in("epargne_id", idsEpargnes)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data.map((p) => ({
    id: p.id,
    membre: p.membre?.profile?.nom_complet || "—",
    montant: p.montant,
    avaliste: p.avalisations?.[0]?.avaliste?.profile?.nom_complet || "—",
    statut: p.statut,
    dateDebut: p.date_debut,
    dateFin: p.date_fin,
  }));
}

export async function mettreEnPlaceCredit(epargneId, { membreId, montant, fraisDossier, commission, dateDebut, dateFin, penaliteRetard, avalisteId, montantGaranti }) {
  const { data: epargne, error: errLecture } = await supabase
    .from("epargnes")
    .select("solde")
    .eq("id", epargneId)
    .single();
  if (errLecture) throw errLecture;

  const { data: pret, error: errPret } = await supabase
    .from("prets")
    .insert({
      epargne_id: epargneId,
      membre_id: membreId,
      montant,
      frais_dossier: fraisDossier || 0,
      commission: commission || 0,
      date_debut: dateDebut,
      date_fin: dateFin,
      penalite_retard: penaliteRetard || null,
      statut: "en cours",
    })
    .select()
    .single();
  if (errPret) throw errPret;

  if (avalisteId) {
    const { error: errAval } = await supabase.from("avalisations").insert({
      pret_id: pret.id,
      avaliste_id: avalisteId,
      montant_garanti: montantGaranti || montant,
    });
    if (errAval) throw errAval;
  }

  const nouveauSolde = epargne.solde - montant;
  const { error: errMouvement } = await supabase.from("epargne_mouvements").insert({
    epargne_id: epargneId,
    membre_id: membreId,
    type: "Retrait",
    montant,
    date_mouvement: dateDebut,
    solde_apres: nouveauSolde,
  });
  if (errMouvement) throw errMouvement;

  const { error: errMaj } = await supabase.from("epargnes").update({ solde: nouveauSolde }).eq("id", epargneId);
  if (errMaj) throw errMaj;

  return pret;
}

// ============================================================
// CLÔTURE DE CYCLE — calcul des intérêts au prorata, puis
// redistribution (reconduite ou récupération) vers chaque membre
// ============================================================

export async function fetchApercuCloture(epargneId) {
  const { data: epargne, error: errEp } = await supabase
    .from("epargnes")
    .select("nom, taux_interet, solde")
    .eq("id", epargneId)
    .single();
  if (errEp) throw errEp;

  const { data: versements, error: errMvt } = await supabase
    .from("epargne_mouvements")
    .select("montant, date_mouvement, membre_id, membre:group_members(profile:profiles(nom_complet, telephone))")
    .eq("epargne_id", epargneId)
    .eq("type", "Versement");
  if (errMvt) throw errMvt;

  const taux = (epargne.taux_interet || 0) / 100;
  const aujourdHui = new Date();

  const parMembre = {};
  versements.forEach((v) => {
    if (!parMembre[v.membre_id]) {
      parMembre[v.membre_id] = {
        membreId: v.membre_id,
        nom: v.membre?.profile?.nom_complet || "—",
        telephone: v.membre?.profile?.telephone || "",
        capital: 0,
        interet: 0,
      };
    }
    const jours = Math.max(0, (aujourdHui - new Date(v.date_mouvement)) / 86400000);
    parMembre[v.membre_id].capital += Number(v.montant);
    parMembre[v.membre_id].interet += Number(v.montant) * taux * (jours / 365);
  });

  return {
    epargneNom: epargne.nom,
    soldeActuel: epargne.solde,
    taux: epargne.taux_interet || 0,
    membres: Object.values(parMembre).map((m) => ({
      ...m,
      interet: Math.round(m.interet),
      total: Math.round(m.capital + m.interet),
    })),
  };
}

export async function cloturerEpargne(epargneId, groupId, membresApercu, decisions, nomNouvelleEpargne) {
  const aReconduire = membresApercu.filter((m) => decisions[m.membreId] === "reconduire");
  const aRecuperer = membresApercu.filter((m) => decisions[m.membreId] === "recuperer");

  let nouvelleEpargne = null;
  if (aReconduire.length > 0) {
    const { data: ep, error: errEp } = await supabase
      .from("epargnes")
      .insert({
        group_id: groupId,
        nom: nomNouvelleEpargne,
        type: "Personnalisée",
        solde: 0,
        statut: "active",
      })
      .select()
      .single();
    if (errEp) throw errEp;
    nouvelleEpargne = ep;
  }

  let soldeNouvelle = 0;
  for (const m of aReconduire) {
    soldeNouvelle += m.total;
    const { error } = await supabase.from("epargne_mouvements").insert({
      epargne_id: nouvelleEpargne.id,
      membre_id: m.membreId,
      type: "Versement",
      montant: m.total,
      date_mouvement: new Date().toISOString().slice(0, 10),
      solde_apres: soldeNouvelle,
    });
    if (error) throw error;
  }
  if (nouvelleEpargne) {
    await supabase.from("epargnes").update({ solde: soldeNouvelle }).eq("id", nouvelleEpargne.id);
  }

  const { data: epargneActuelle } = await supabase.from("epargnes").select("solde").eq("id", epargneId).single();
  let soldeCourant = epargneActuelle.solde;
  for (const m of aRecuperer) {
    soldeCourant -= m.total;
    const { error } = await supabase.from("epargne_mouvements").insert({
      epargne_id: epargneId,
      membre_id: m.membreId,
      type: "Retrait",
      montant: m.total,
      date_mouvement: new Date().toISOString().slice(0, 10),
      solde_apres: soldeCourant,
    });
    if (error) throw error;
  }

  await supabase.from("epargnes").update({ statut: "clôturée", solde: soldeCourant }).eq("id", epargneId);

  return { nouvelleEpargne };
}
