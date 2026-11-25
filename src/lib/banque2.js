import { supabase } from "./supabaseClient";
import {
  normaliserRegles, fraisDeDossier, situationPret, repartirPaiement,
  nombresParMembre, partagerCagnotte, versISO, versDate, joursEntre,
} from "./calculsBancaires";

// ============================================================
// BANQUE — règles libres, prêts, remboursements, compte de la
// réunion, clôture au prorata, annulations.
// Les calculs sont dans calculsBancaires.js (fonctions pures).
// ============================================================

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Types de mouvements d'une épargne :
//  Versement (+) / Retrait (−)         → épargne du membre
//  Prêt (−) / Remboursement (+)        → argent prêté puis rendu (pas l'épargne du membre)
//  Intérêts (info) / Transfert (−)     → clôture
const TYPES_EPARGNE_MEMBRE = { Versement: 1, Retrait: -1, Transfert: -1 };

async function ajusterSoldeEpargne(epargneId, delta) {
  const { data, error } = await supabase.from("epargnes").select("solde").eq("id", epargneId).single();
  if (error) throw error;
  const nouveau = Number(data.solde || 0) + delta;
  const { error: e2 } = await supabase.from("epargnes").update({ solde: nouveau }).eq("id", epargneId);
  if (e2) throw e2;
  return nouveau;
}

async function mouvementEpargne({ epargneId, membreId, type, montant, date, pretId, saisiPar, modePaiement }) {
  const signe = type === "Versement" || type === "Remboursement" ? 1 : type === "Intérêts" ? 0 : -1;
  const soldeApres = await ajusterSoldeEpargne(epargneId, signe * montant);
  const { error } = await supabase.from("epargne_mouvements").insert({
    epargne_id: epargneId, membre_id: membreId, type, montant, date_mouvement: date,
    solde_apres: soldeApres, pret_id: pretId || null, saisi_par: saisiPar || null, mode_paiement: modePaiement || "especes",
  });
  if (error) throw error;
  return soldeApres;
}

// ------------------------------------------------------------
// ÉPARGNES ET RÈGLES
// ------------------------------------------------------------
export async function fetchEpargnesBanque(groupId) {
  const { data, error } = await supabase.from("epargnes").select("*").eq("group_id", groupId).order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((e) => ({
    id: e.id,
    nom: e.nom,
    type: e.type,
    solde: Number(e.solde || 0),
    cotisation: e.cotisation_par_seance,
    dateDebut: e.date_debut,
    dateCloture: e.date_cloture,
    statut: e.statut,
    regles: normaliserRegles(e.regles || (e.taux_interet ? { taux: e.taux_interet } : {})),
    reglesDefinies: !!e.regles,
    cloture: e.cloture,
  }));
}

export async function sauverReglesEpargne(epargneId, { regles, dateDebut, dateCloture }) {
  const { error } = await supabase.from("epargnes").update({
    regles: normaliserRegles(regles),
    date_debut: dateDebut || null,
    date_cloture: dateCloture || null,
  }).eq("id", epargneId);
  if (error) throw error;
}

// ------------------------------------------------------------
// COMPTE DE LA RÉUNION
// ------------------------------------------------------------
export async function fetchCompteReunion(groupId) {
  const { data, error } = await supabase.from("compte_reunion_mouvements").select("*").eq("group_id", groupId).order("date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  const lignes = data.map((m) => ({ id: m.id, date: m.date, montant: Number(m.montant), origine: m.origine, libelle: m.libelle, annule: m.annule, annuleMotif: m.annule_motif, saisiPar: m.saisi_par }));
  const solde = lignes.filter((l) => !l.annule).reduce((s, l) => s + l.montant, 0);
  return { solde, lignes };
}

export async function ecrireCompteReunion(groupId, { date, montant, origine, libelle, refId, saisiPar, modePaiement }) {
  if (!montant) return;
  const { error } = await supabase.from("compte_reunion_mouvements").insert({
    group_id: groupId, date: date || aujourdhui(), montant, origine, libelle: libelle || null,
    ref_id: refId || null, saisi_par: saisiPar || null, mode_paiement: modePaiement || "especes",
  });
  if (error) throw error;
}

// ------------------------------------------------------------
// PRÊTS
// ------------------------------------------------------------
export async function fetchPretsBanque(groupId) {
  const { data: eps, error: e1 } = await supabase.from("epargnes").select("id, nom, regles, taux_interet").eq("group_id", groupId);
  if (e1) throw e1;
  const ids = eps.map((e) => e.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("prets")
    .select(`*, membre:group_members ( id, profile:profiles ( nom_complet, telephone ) ),
             avalisations ( montant_garanti, avaliste:group_members ( id, profile:profiles ( nom_complet ) ) )`)
    .in("epargne_id", ids)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const { data: remb, error: e2 } = await supabase.from("pret_remboursements").select("*").eq("group_id", groupId).order("date", { ascending: true });
  if (e2) throw e2;
  const epParId = Object.fromEntries(eps.map((e) => [e.id, e]));
  return data.map((p) => {
    const ep = epParId[p.epargne_id];
    const reglesEp = normaliserRegles(ep?.regles || (ep?.taux_interet ? { taux: ep.taux_interet } : {}));
    const regles = normaliserRegles(p.regles || (p.commission ? { ...reglesEp, taux: p.commission, mode: "fixe" } : reglesEp));
    const remboursements = remb.filter((r) => r.pret_id === p.id).map((r) => ({
      id: r.id, date: r.date, montant: Number(r.montant), capital: Number(r.capital), interets: Number(r.interets),
      penalites: Number(r.penalites), source: r.source, annule: r.annule, annuleMotif: r.annule_motif, saisiPar: r.saisi_par,
    }));
    return {
      id: p.id,
      epargneId: p.epargne_id,
      epargneNom: ep?.nom || "—",
      membreId: p.membre?.id,
      membre: p.membre?.profile?.nom_complet || "—",
      telephone: p.membre?.profile?.telephone || "",
      montant: Number(p.montant),
      fraisDossier: Number(p.frais_dossier || 0),
      dateDebut: p.date_debut,
      dateFin: p.date_fin,
      statutBase: p.statut,
      special: !!p.special,
      garanties: p.garanties || [],
      decision: p.decision || null,
      modeRemboursement: p.mode_remboursement,
      nbEcheances: p.nb_echeances,
      regles,
      saisiPar: p.saisi_par,
      validePar: p.valide_par,
      refuseMotif: p.refuse_motif,
      avalistes: (p.avalisations || []).map((a) => ({ id: a.avaliste?.id, nom: a.avaliste?.profile?.nom_complet || "—", montant: Number(a.montant_garanti || 0) })),
      remboursements,
    };
  });
}

// Situation à une date (par défaut aujourd'hui), statut d'attente compris.
export function etatPret(pret, date = aujourdhui()) {
  if (pret.statutBase === "en attente" || pret.statutBase === "refusé") {
    return { ...situationPret(pret, [], pret.dateDebut), statut: pret.statutBase, totalDu: 0 };
  }
  return situationPret(pret, pret.remboursements, date);
}

// Crée un prêt (normal ou spécial). Un prêt spécial reste « en
// attente » : rien ne sort de la caisse avant la validation.
export async function creerPret(groupId, {
  epargneId, membreId, montant, dateDebut, dateFin, regles, special = false,
  garanties = [], decision = null, modeRemboursement = null, nbEcheances = null,
  avalistes = [], saisiPar, modePaiement = "especes", frais = null,
}) {
  const reglesN = normaliserRegles(regles);
  const fraisMontant = frais !== null && frais !== undefined && frais !== "" ? Math.round(Number(frais)) : fraisDeDossier(montant, reglesN);
  const { data: pret, error } = await supabase.from("prets").insert({
    epargne_id: epargneId, membre_id: membreId, montant, frais_dossier: fraisMontant,
    date_debut: dateDebut, date_fin: dateFin || null, statut: special ? "en attente" : "en cours",
    regles: reglesN, special, garanties: garanties.length ? garanties : null, decision,
    mode_remboursement: modeRemboursement, nb_echeances: nbEcheances, saisi_par: saisiPar || null,
    mode_paiement: modePaiement,
  }).select().single();
  if (error) throw error;

  for (const a of avalistes.filter((x) => x.id)) {
    const { error: eA } = await supabase.from("avalisations").insert({ pret_id: pret.id, avaliste_id: a.id, montant_garanti: a.montant || montant });
    if (eA) throw eA;
  }

  if (!special) await decaisserPret(groupId, pret.id, { epargneId, membreId, montant, dateDebut, frais: fraisMontant, saisiPar, modePaiement });
  return pret;
}

async function decaisserPret(groupId, pretId, { epargneId, membreId, montant, dateDebut, frais, saisiPar, modePaiement }) {
  await mouvementEpargne({ epargneId, membreId, type: "Prêt", montant, date: dateDebut, pretId, saisiPar, modePaiement });
  if (frais > 0) {
    await ecrireCompteReunion(groupId, { date: dateDebut, montant: frais, origine: "frais_dossier", libelle: "Frais de dossier du prêt", refId: pretId, saisiPar, modePaiement });
  }
}

export async function validerPretSpecial(groupId, pret, { validePar }) {
  const { data: ep, error: e0 } = await supabase.from("epargnes").select("solde, nom").eq("id", pret.epargneId).single();
  if (e0) throw e0;
  if (Number(ep.solde || 0) < pret.montant) {
    throw new Error(`Pas assez d'argent dans ${ep.nom} : ${Number(ep.solde || 0).toLocaleString("fr-FR")} F en caisse pour ${pret.montant.toLocaleString("fr-FR")} F.`);
  }
  // Les intérêts courent à partir du décaissement (la validation), pas de
  // la demande : on décale le début et l'échéance d'autant.
  const auj = aujourdhui();
  const decalage = Math.max(0, joursEntre(pret.dateDebut, auj));
  const dateDebut = decalage > 0 ? auj : pret.dateDebut;
  const dateFin = pret.dateFin && decalage > 0 ? versISO(new Date(versDate(pret.dateFin).getTime() + decalage * 86400000)) : pret.dateFin;
  const { error } = await supabase.from("prets").update({ statut: "en cours", valide_par: validePar, valide_le: new Date().toISOString(), date_debut: dateDebut, date_fin: dateFin }).eq("id", pret.id);
  if (error) throw error;
  await decaisserPret(groupId, pret.id, { epargneId: pret.epargneId, membreId: pret.membreId, montant: pret.montant, dateDebut, frais: pret.fraisDossier, saisiPar: validePar });
  return { dateDebut, dateFin };
}

export async function refuserPretSpecial(pretId, { motif, par }) {
  const { error } = await supabase.from("prets").update({ statut: "refusé", refuse_motif: motif, valide_par: par, valide_le: new Date().toISOString() }).eq("id", pretId);
  if (error) throw error;
}

// Règle un prêt avec une ou plusieurs sources.
// sources = [{ source: "especes"|"momo"|"epargne"|"assurance"|"fonds", montant, refId (épargne ou type de fonds) }]
// Le paiement est réparti : pénalités → intérêts → capital.
export async function reglerPret(groupId, pret, { date, sources, saisiPar }) {
  const total = sources.reduce((s, x) => s + (Math.round(Number(x.montant)) || 0), 0);
  if (total <= 0) throw new Error("Indique au moins un montant.");
  const situation = situationPret(pret, pret.remboursements.filter((r) => !r.annule), date);
  const rep = repartirPaiement(total, situation);
  if (rep.surplus > 0) throw new Error(`Le montant dépasse ce qui est dû (${situation.totalDu.toLocaleString("fr-FR")} F).`);

  // 1. Prélèvements sur les avoirs du membre
  for (const s of sources) {
    const m = Math.round(Number(s.montant)) || 0;
    if (!m) continue;
    if (s.source === "epargne") {
      await mouvementEpargne({ epargneId: s.refId, membreId: pret.membreId, type: "Retrait", montant: m, date, pretId: pret.id, saisiPar });
    } else if (s.source === "assurance") {
      const { data: sol, error } = await supabase.from("assurance_soldes").select("*").eq("group_id", groupId).eq("membre_id", pret.membreId).single();
      if (error) throw error;
      const apres = Number(sol.solde) - m;
      if (apres < 0) throw new Error("Solde d'assurance insuffisant.");
      const { error: e1 } = await supabase.from("assurance_soldes").update({ solde: apres, updated_at: new Date().toISOString() }).eq("id", sol.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("assurance_mouvements").insert({ group_id: groupId, membre_id: pret.membreId, type: "Prélèvement", montant: m, date_mouvement: date, solde_apres: apres });
      if (e2) throw e2;
    } else if (s.source === "fonds") {
      const { data: f, error } = await supabase.from("fonds_membres").select("solde").eq("membre_id", pret.membreId).eq("type_fonds_id", s.refId).single();
      if (error) throw error;
      const apres = Number(f.solde) - m;
      if (apres < 0) throw new Error("Solde du fonds insuffisant.");
      const { error: e1 } = await supabase.from("fonds_membres").update({ solde: apres }).eq("membre_id", pret.membreId).eq("type_fonds_id", s.refId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("fonds_mouvements").insert({ membre_id: pret.membreId, type_fonds_id: s.refId, montant: -m, date_mouvement: date });
      if (e2) throw e2;
    }
  }

  // 2. Le remboursement, ventilé, sur la première source (les
  // autres sources sont enregistrées au prorata de leur montant).
  let restePen = rep.penalites, resteInt = rep.interets, resteCap = rep.capital;
  const lignes = sources.filter((s) => Math.round(Number(s.montant)) > 0);
  for (let i = 0; i < lignes.length; i++) {
    const m = Math.round(Number(lignes[i].montant));
    const pen = Math.min(m, restePen); restePen -= pen;
    const int = Math.min(m - pen, resteInt); resteInt -= int;
    const cap = Math.min(m - pen - int, resteCap); resteCap -= cap;
    const { error } = await supabase.from("pret_remboursements").insert({
      group_id: groupId, pret_id: pret.id, date, montant: m, capital: cap, interets: int, penalites: pen,
      source: lignes[i].source, source_ref: lignes[i].refId || null, saisi_par: saisiPar || null,
    });
    if (error) throw error;
    // Capital et intérêts de CETTE ligne reviennent dans l'épargne qui a
    // prêté (un mouvement par ligne : l'annulation d'une ligne reste juste).
    if (cap + int > 0) await mouvementEpargne({ epargneId: pret.epargneId, membreId: pret.membreId, type: "Remboursement", montant: cap + int, date, pretId: pret.id, saisiPar, modePaiement: ["especes", "momo"].includes(lignes[i].source) ? lignes[i].source : "prelevement" });
  }

  // 3. Les pénalités vont au compte de la réunion.
  if (rep.penalites > 0) await ecrireCompteReunion(groupId, { date, montant: rep.penalites, origine: "penalite_pret", libelle: `Pénalité de retard — ${pret.membre}`, refId: pret.id, saisiPar });

  const apres = situationPret(pret, [...pret.remboursements.filter((r) => !r.annule), { date, capital: rep.capital, interets: rep.interets, penalites: rep.penalites }], date);
  const { error: eS } = await supabase.from("prets").update({ statut: apres.totalDu === 0 ? "remboursé" : "en cours" }).eq("id", pret.id);
  if (eS) throw eS;
  return { repartition: rep, resteDu: apres.totalDu };
}

// ------------------------------------------------------------
// HISTORIQUE ET ANNULATIONS
// ------------------------------------------------------------
export async function fetchMouvementsBanque(groupId) {
  const { data: eps, error: e1 } = await supabase.from("epargnes").select("id, nom").eq("group_id", groupId);
  if (e1) throw e1;
  const ids = eps.map((e) => e.id);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("epargne_mouvements")
    .select("*, membre:group_members ( id, profile:profiles ( nom_complet ) )")
    .in("epargne_id", ids)
    .order("date_mouvement", { ascending: false });
  if (error) throw error;
  const nom = Object.fromEntries(eps.map((e) => [e.id, e.nom]));
  return data.map((m) => ({
    id: m.id, epargneId: m.epargne_id, epargne: nom[m.epargne_id] || "—", membreId: m.membre?.id,
    membre: m.membre?.profile?.nom_complet || "—", type: m.type, montant: Number(m.montant), date: m.date_mouvement,
    solde: m.solde_apres, annule: !!m.annule, annuleMotif: m.annule_motif, annulePar: m.annule_par, annuleLe: m.annule_le,
    saisiPar: m.saisi_par, pretId: m.pret_id,
  }));
}

// Annule un versement ou un retrait saisi par erreur : la ligne reste
// visible (barrée), le solde est corrigé, elle ne compte plus nulle part.
export async function annulerMouvementEpargne(mouvement, { motif, par }) {
  if (!motif || !motif.trim()) throw new Error("Le motif est obligatoire.");
  if (mouvement.annule) throw new Error("Ce mouvement est déjà annulé.");
  if (!["Versement", "Retrait"].includes(mouvement.type) || mouvement.pretId) {
    throw new Error("Seuls les versements et retraits simples s'annulent ici. Pour un prêt, annule le remboursement concerné.");
  }
  const delta = mouvement.type === "Versement" ? -mouvement.montant : mouvement.montant;
  await ajusterSoldeEpargne(mouvement.epargneId, delta);
  const { error } = await supabase.from("epargne_mouvements").update({
    annule: true, annule_motif: motif.trim(), annule_par: par || null, annule_le: new Date().toISOString(),
  }).eq("id", mouvement.id);
  if (error) throw error;
}

// Annule un remboursement de prêt saisi par erreur (en espèces
// uniquement : les prélèvements sur avoirs se corrigent à la main).
export async function annulerRemboursement(groupId, pret, remboursement, { motif, par }) {
  if (!motif || !motif.trim()) throw new Error("Le motif est obligatoire.");
  if (!["especes", "momo"].includes(remboursement.source)) {
    throw new Error("Ce remboursement venait des avoirs du membre : corrige-le avec le trésorier (il faut aussi rendre l'argent prélevé).");
  }
  const annulation = { annule: true, annule_motif: motif.trim(), annule_par: par || null, annule_le: new Date().toISOString() };
  // Lignes à annuler : celle-ci, ou tout le remboursement si son
  // mouvement d'épargne regroupe plusieurs lignes (anciennes saisies).
  let lignes = [remboursement];
  let mouvementId = null;
  const vers = remboursement.capital + remboursement.interets;
  if (vers > 0) {
    const { data: mv, error: e1 } = await supabase.from("epargne_mouvements").select("id, montant")
      .eq("pret_id", pret.id).eq("type", "Remboursement").eq("date_mouvement", remboursement.date).eq("annule", false);
    if (e1) throw e1;
    const exact = (mv || []).find((m) => Number(m.montant) === vers);
    if (exact) mouvementId = exact.id;
    else {
      const soeurs = pret.remboursements.filter((r) => !r.annule && r.date === remboursement.date);
      const totalSoeurs = soeurs.reduce((s, r) => s + r.capital + r.interets, 0);
      const groupe = (mv || []).find((m) => Number(m.montant) === totalSoeurs);
      if (!groupe) throw new Error("Impossible de retrouver le mouvement de ce remboursement dans l'épargne. Corrige-le avec le trésorier.");
      if (soeurs.some((r) => !["especes", "momo"].includes(r.source))) throw new Error("Ce remboursement mélange espèces et prélèvements sur les avoirs : corrige-le avec le trésorier.");
      lignes = soeurs;
      mouvementId = groupe.id;
    }
  }
  const totalVers = lignes.reduce((s, r) => s + r.capital + r.interets, 0);
  const totalPen = lignes.reduce((s, r) => s + r.penalites, 0);
  if (mouvementId) {
    const { error: eM } = await supabase.from("epargne_mouvements").update(annulation).eq("id", mouvementId);
    if (eM) throw eM;
    await ajusterSoldeEpargne(pret.epargneId, -totalVers);
  }
  if (totalPen > 0) {
    await ecrireCompteReunion(groupId, { date: aujourdhui(), montant: -totalPen, origine: "penalite_pret", libelle: `Annulation : ${motif.trim()}`, refId: pret.id, saisiPar: par });
  }
  const { error } = await supabase.from("pret_remboursements").update(annulation).in("id", lignes.map((r) => r.id));
  if (error) throw error;
  const { error: eS } = await supabase.from("prets").update({ statut: "en cours" }).eq("id", pret.id);
  if (eS) throw eS;
}

// ------------------------------------------------------------
// CLÔTURE AU PRORATA
// ------------------------------------------------------------
// Prépare tout le calcul de clôture d'une épargne à une date donnée.
export async function preparerCloture(groupId, epargne, dateCloture) {
  const { data: mvts, error } = await supabase
    .from("epargne_mouvements")
    .select("*, membre:group_members ( id, profile:profiles ( nom_complet, telephone ) )")
    .eq("epargne_id", epargne.id)
    .eq("annule", false);
  if (error) throw error;

  const noms = {};
  const pourNombres = [];
  for (const m of mvts) {
    const signe = TYPES_EPARGNE_MEMBRE[m.type];
    if (!signe || !m.membre?.id) continue;
    noms[m.membre.id] = { nom: m.membre.profile?.nom_complet || "—", telephone: m.membre.profile?.telephone || "" };
    pourNombres.push({ membreId: m.membre.id, date: m.date_mouvement, montant: signe * Number(m.montant), libelle: `${m.type}${m.pret_id ? " (règlement de prêt)" : ""}` });
  }
  const situation = nombresParMembre(pourNombres, dateCloture);

  const prets = (await fetchPretsBanque(groupId)).filter((p) => p.epargneId === epargne.id && !["en attente", "refusé"].includes(p.statutBase));
  // Un prêt reporté d'un cycle précédent a déjà vu ses anciens
  // intérêts partagés : on ne compte que ceux encaissés dans ce cycle.
  const debutCycle = epargne.dateDebut ? versDate(epargne.dateDebut) : null;
  const dansCeCycle = (p, r) => !debutCycle || versDate(p.dateDebut) >= debutCycle || versDate(r.date) > debutCycle;
  const cagnotte = prets.reduce((s, p) => s + p.remboursements
    .filter((r) => !r.annule && versDate(r.date) <= versDate(dateCloture) && dansCeCycle(p, r))
    .reduce((a, r) => a + r.interets, 0), 0);
  const pretsOuverts = prets.map((p) => ({ ...p, etat: situationPret(p, p.remboursements.filter((r) => !r.annule), dateCloture) }))
    .filter((p) => p.etat.totalDu > 0);
  const capitalPrete = pretsOuverts.reduce((s, p) => s + p.etat.capitalRestant, 0);

  const partage = partagerCagnotte(cagnotte, situation, epargne.regles?.partage || "nombres");
  const membres = Object.entries(situation).map(([id, s]) => ({
    membreId: id, ...noms[id], capital: s.capital, nombres: s.nombres, lignes: s.lignes,
    pourcentage: partage.parts[id]?.pourcentage || 0, interets: partage.parts[id]?.part || 0,
    total: s.capital + (partage.parts[id]?.part || 0),
  })).sort((a, b) => a.nom.localeCompare(b.nom));
  const capitalMembres = membres.reduce((s, m) => s + m.capital, 0);

  return {
    dateCloture: versISO(dateCloture), cagnotte, reste: partage.reste, membres, pretsOuverts,
    capitalMembres, capitalPrete, caisseAttendue: capitalMembres + cagnotte - capitalPrete,
    soldeEnregistre: epargne.solde,
  };
}

// Clôture : intérêts versés, puis chaque membre récupère ou reconduit.
// decisions = { membreId: "recuperer" | "reconduire" }
export async function cloturerEpargneBanque(groupId, epargne, calcul, { decisions, nomNouvelle, caisseComptee, saisiPar }) {
  const date = calcul.dateCloture;
  let nouvelle = null;
  // Un nouveau cycle est créé si quelqu'un reconduit ou si un prêt
  // non soldé doit y être reporté.
  if (calcul.membres.some((m) => decisions[m.membreId] === "reconduire") || calcul.pretsOuverts.length > 0) {
    const { data, error } = await supabase.from("epargnes").insert({
      group_id: groupId, nom: nomNouvelle, type: epargne.type || "Personnalisée", solde: 0, statut: "active",
      regles: epargne.regles, cotisation_par_seance: epargne.cotisation || null, date_debut: date,
    }).select().single();
    if (error) throw error;
    nouvelle = data;
  }
  // Prêts non soldés : reportés au nouveau cycle. L'ancienne épargne
  // est remboursée du capital restant, le nouveau cycle le prête.
  for (const p of calcul.pretsOuverts) {
    const capital = p.etat.capitalRestant;
    if (capital > 0) {
      await mouvementEpargne({ epargneId: epargne.id, membreId: p.membreId, type: "Remboursement", montant: capital, date, pretId: p.id, saisiPar });
      await mouvementEpargne({ epargneId: nouvelle.id, membreId: p.membreId, type: "Prêt", montant: capital, date, pretId: p.id, saisiPar });
    }
    const { error: eP } = await supabase.from("prets").update({ epargne_id: nouvelle.id }).eq("id", p.id);
    if (eP) throw eP;
  }
  for (const m of calcul.membres) {
    if (m.interets > 0) await mouvementEpargne({ epargneId: epargne.id, membreId: m.membreId, type: "Intérêts", montant: m.interets, date, saisiPar });
    if (m.total <= 0) continue;
    if (decisions[m.membreId] === "reconduire" && nouvelle) {
      await mouvementEpargne({ epargneId: epargne.id, membreId: m.membreId, type: "Transfert", montant: m.total, date, saisiPar });
      await mouvementEpargne({ epargneId: nouvelle.id, membreId: m.membreId, type: "Versement", montant: m.total, date, saisiPar });
    } else {
      await mouvementEpargne({ epargneId: epargne.id, membreId: m.membreId, type: "Retrait", montant: m.total, date, saisiPar });
    }
  }
  if (calcul.reste > 0) {
    await ajusterSoldeEpargne(epargne.id, -calcul.reste);
    await ecrireCompteReunion(groupId, { date, montant: calcul.reste, origine: "arrondi", libelle: `Reste d'arrondi — clôture de ${epargne.nom}`, refId: epargne.id, saisiPar });
  }
  const resume = {
    date, caisseAttendue: calcul.caisseAttendue, caisseComptee: Number(caisseComptee), cagnotte: calcul.cagnotte, reste: calcul.reste,
    parts: calcul.membres.map((m) => ({ membreId: m.membreId, nom: m.nom, capital: m.capital, nombres: m.nombres, interets: m.interets, total: m.total, decision: decisions[m.membreId] || "recuperer" })),
    pretsOuverts: calcul.pretsOuverts.map((p) => ({ id: p.id, membre: p.membre, du: p.etat.totalDu })),
    cloturePar: saisiPar || null,
  };
  const { error } = await supabase.from("epargnes").update({ statut: "clôturée", date_cloture: date, cloture: resume }).eq("id", epargne.id);
  if (error) throw error;
  return { nouvelle, resume };
}

// ------------------------------------------------------------
// AVOIRS D'UN MEMBRE (pour régler un prêt, vérifier un plafond)
// ------------------------------------------------------------
export async function fetchAvoirsMembre(groupId, membreId) {
  const { data: eps, error: e1 } = await supabase.from("epargnes").select("id, nom, statut").eq("group_id", groupId);
  if (e1) throw e1;
  const ids = eps.map((e) => e.id);
  let epargnes = [];
  if (ids.length) {
    const { data: mv, error: e2 } = await supabase.from("epargne_mouvements").select("epargne_id, type, montant")
      .in("epargne_id", ids).eq("membre_id", membreId).eq("annule", false);
    if (e2) throw e2;
    epargnes = eps.filter((e) => e.statut !== "clôturée").map((e) => ({
      id: e.id, nom: e.nom,
      solde: mv.filter((m) => m.epargne_id === e.id).reduce((s, m) => s + (TYPES_EPARGNE_MEMBRE[m.type] || 0) * Number(m.montant), 0),
    }));
  }
  const { data: ass, error: e3 } = await supabase.from("assurance_soldes").select("solde").eq("group_id", groupId).eq("membre_id", membreId).maybeSingle();
  if (e3) throw e3;
  const { data: fonds, error: e4 } = await supabase.from("fonds_membres").select("type_fonds_id, solde, type:types_fonds ( nom )").eq("membre_id", membreId);
  if (e4) throw e4;
  return {
    epargnes,
    assurance: Number(ass?.solde || 0),
    fonds: (fonds || []).map((f) => ({ id: f.type_fonds_id, nom: f.type?.nom || "Fonds", solde: Number(f.solde || 0) })),
  };
}
