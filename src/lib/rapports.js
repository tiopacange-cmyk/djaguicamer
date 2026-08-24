import { supabase } from "./supabaseClient";

// Renvoie les bornes [début, fin) d'une journée au format ISO,
// utilisées pour filtrer les colonnes de type timestamp.
function bornesJour(dateISO) {
  const debut = `${dateISO}T00:00:00`;
  const fin = new Date(new Date(dateISO).getTime() + 86400000).toISOString().slice(0, 10) + "T00:00:00";
  return { debut, fin };
}

// ============================================================
// RAPPORT JOURNALIER — tout ce qui s'est passé à une date donnée,
// tous modules confondus.
// ============================================================
export async function fetchRapportJournalier(groupId, dateISO) {
  const { debut, fin } = bornesJour(dateISO);

  // --- TONTINE : cotisations, versements, amendes ---
  const { data: tontines, error: errTontines } = await supabase
    .from("tontines")
    .select("id, nom")
    .eq("group_id", groupId);
  if (errTontines) throw errTontines;
  const idsTontines = tontines.map((t) => t.id);

  let tontineCotisations = [];
  let tontineVersements = [];
  let tontineAmendes = [];

  if (idsTontines.length > 0) {
    const { data: tours, error: errTours } = await supabase
      .from("tontine_tours")
      .select("id, numero, tontine_id, verse_le, beneficiaire:group_members(profile:profiles(nom_complet))")
      .in("tontine_id", idsTontines);
    if (errTours) throw errTours;
    const idsTours = tours.map((t) => t.id);
    const nomTontineParId = Object.fromEntries(tontines.map((t) => [t.id, t.nom]));

    if (idsTours.length > 0) {
      const { data: cotisations, error: errCot } = await supabase
        .from("tontine_cotisations")
        .select("montant, date_paiement, membre:group_members(profile:profiles(nom_complet)), tour_id")
        .in("tour_id", idsTours)
        .eq("date_paiement", dateISO);
      if (errCot) throw errCot;
      const tourParId = Object.fromEntries(tours.map((t) => [t.id, t]));
      tontineCotisations = cotisations.map((c) => ({
        membre: c.membre?.profile?.nom_complet || "—",
        montant: c.montant,
        tontine: nomTontineParId[tourParId[c.tour_id]?.tontine_id] || "—",
        tourNumero: tourParId[c.tour_id]?.numero,
      }));

      const { data: amendes, error: errAm } = await supabase
        .from("tontine_amendes")
        .select("montant_amende, motif, membre:group_members(profile:profiles(nom_complet)), created_at, tour_id")
        .in("tour_id", idsTours)
        .gte("created_at", debut)
        .lt("created_at", fin);
      if (errAm) throw errAm;
      tontineAmendes = amendes.map((a) => ({
        membre: a.membre?.profile?.nom_complet || "—",
        montant: a.montant_amende,
        motif: a.motif,
      }));
    }

    tontineVersements = tours
      .filter((t) => t.verse_le && t.verse_le.slice(0, 10) === dateISO)
      .map((t) => ({
        beneficiaire: t.beneficiaire?.profile?.nom_complet || "—",
        tourNumero: t.numero,
        tontine: nomTontineParId[t.tontine_id] || "—",
      }));
  }

  // --- BANQUE : versements/retraits d'épargne ---
  const { data: epargnes, error: errEp } = await supabase
    .from("epargnes")
    .select("id, nom")
    .eq("group_id", groupId);
  if (errEp) throw errEp;
  const idsEpargnes = epargnes.map((e) => e.id);
  const nomEpargneParId = Object.fromEntries(epargnes.map((e) => [e.id, e.nom]));

  let mouvementsEpargne = [];
  if (idsEpargnes.length > 0) {
    const { data, error } = await supabase
      .from("epargne_mouvements")
      .select("type, montant, epargne_id, membre:group_members(profile:profiles(nom_complet))")
      .in("epargne_id", idsEpargnes)
      .eq("date_mouvement", dateISO);
    if (error) throw error;
    mouvementsEpargne = data.map((m) => ({
      membre: m.membre?.profile?.nom_complet || "—",
      type: m.type,
      montant: m.montant,
      epargne: nomEpargneParId[m.epargne_id] || "—",
    }));
  }

  // --- ASSURANCE : cotisations et prélèvements ---
  const { data: assuranceMouvements, error: errAssur } = await supabase
    .from("assurance_mouvements")
    .select("type, montant, membre:group_members(profile:profiles(nom_complet))")
    .eq("group_id", groupId)
    .eq("date_mouvement", dateISO);
  if (errAssur) throw errAssur;

  // --- DÉPÔTS / RETRAITS EXTERNES ---
  const { data: comptes, error: errComptes } = await supabase
    .from("comptes_bancaires_externes")
    .select("id, nom")
    .eq("group_id", groupId);
  if (errComptes) throw errComptes;
  const idsComptes = comptes.map((c) => c.id);
  const nomCompteParId = Object.fromEntries(comptes.map((c) => [c.id, c.nom]));

  let mouvementsExternes = [];
  if (idsComptes.length > 0) {
    const { data, error } = await supabase
      .from("mouvements_bancaires_externes")
      .select("type, montant, compte_id, categorie_frais, motif")
      .in("compte_id", idsComptes)
      .eq("date_mouvement", dateISO);
    if (error) throw error;
    mouvementsExternes = data.map((m) => ({
      type: m.type,
      montant: m.montant,
      compte: nomCompteParId[m.compte_id] || "—",
      detail: m.categorie_frais || m.motif || "—",
    }));
  }

  // --- FONDS (garantie, solidarité, etc.) ---
  const { data: typesFonds, error: errTypes } = await supabase
    .from("types_fonds")
    .select("id, nom")
    .eq("group_id", groupId);
  if (errTypes) throw errTypes;
  const idsTypesFonds = typesFonds.map((t) => t.id);
  const nomTypeFondsParId = Object.fromEntries(typesFonds.map((t) => [t.id, t.nom]));

  let mouvementsFonds = [];
  if (idsTypesFonds.length > 0) {
    const { data, error } = await supabase
      .from("fonds_mouvements")
      .select("montant, type_fonds_id, membre:group_members(profile:profiles(nom_complet))")
      .in("type_fonds_id", idsTypesFonds)
      .eq("date_mouvement", dateISO);
    if (error) throw error;
    mouvementsFonds = data.map((m) => ({
      membre: m.membre?.profile?.nom_complet || "—",
      montant: m.montant,
      typeFonds: nomTypeFondsParId[m.type_fonds_id] || "—",
    }));
  }

  // --- SÉANCES : amendes déclarées et paiements reçus ce jour ---
  const { data: seancesGroupe } = await supabase.from("seances").select("id").eq("group_id", groupId);
  const idsSeances = (seancesGroupe || []).map((s) => s.id);

  let amendesSeanceDeclarees = [];
  if (idsSeances.length > 0) {
    const { data, error } = await supabase
      .from("seance_amendes")
      .select("montant, membre:group_members(profile:profiles(nom_complet)), type_amende:types_amendes_seance(nom), created_at")
      .in("seance_id", idsSeances)
      .gte("created_at", debut)
      .lt("created_at", fin);
    if (error) throw error;
    amendesSeanceDeclarees = data.map((a) => ({
      membre: a.membre?.profile?.nom_complet || "—",
      montant: a.montant,
      typeAmende: a.type_amende?.nom || "—",
    }));
  }

  const { data: paiementsAmendes, error: errPaie } = await supabase
    .from("caisse_amendes_mouvements")
    .select("montant, mode_paiement, membre:group_members(profile:profiles(nom_complet))")
    .eq("group_id", groupId)
    .eq("date_mouvement", dateISO);
  if (errPaie) throw errPaie;
  const paiementsAmendesJour = (paiementsAmendes || []).map((p) => ({
    membre: p.membre?.profile?.nom_complet || "—",
    montant: p.montant,
    mode: p.mode_paiement,
  }));

  // --- TOTAUX ---
  const totalEncaisse =
    tontineCotisations.reduce((s, c) => s + Number(c.montant), 0) +
    mouvementsEpargne.filter((m) => m.type === "Versement").reduce((s, m) => s + Number(m.montant), 0) +
    assuranceMouvements.filter((m) => m.type === "Cotisation").reduce((s, m) => s + Number(m.montant), 0) +
    mouvementsExternes.filter((m) => m.type === "Dépôt" || m.type === "Intérêt").reduce((s, m) => s + Number(m.montant), 0) +
    mouvementsFonds.reduce((s, m) => s + Number(m.montant), 0) +
    paiementsAmendesJour.reduce((s, p) => s + Number(p.montant), 0);

  const totalDecaisse =
    tontineVersements.length * 0 + // le montant du versement n'est pas systématiquement re-sommé ici, voir tontineVersements pour le détail
    mouvementsEpargne.filter((m) => m.type === "Retrait").reduce((s, m) => s + Number(m.montant), 0) +
    assuranceMouvements.filter((m) => m.type === "Prélèvement").reduce((s, m) => s + Number(m.montant), 0) +
    mouvementsExternes.filter((m) => m.type === "Retrait" || m.type === "Frais").reduce((s, m) => s + Number(m.montant), 0);

  return {
    date: dateISO,
    tontineCotisations,
    tontineVersements,
    tontineAmendes,
    mouvementsEpargne,
    assuranceMouvements: assuranceMouvements.map((m) => ({
      membre: m.membre?.profile?.nom_complet || "—",
      type: m.type,
      montant: m.montant,
    })),
    mouvementsExternes,
    mouvementsFonds,
    amendesSeanceDeclarees,
    paiementsAmendesJour,
    totalEncaisse,
    totalDecaisse,
  };
}

// ============================================================
// RAPPORT MENSUEL — totaux par module + journal chronologique
// complet du mois choisi.
// ============================================================
export async function fetchRapportMensuel(groupId, anneeMoisISO) {
  const debut = `${anneeMoisISO}-01`;
  const dateDebut = new Date(debut);
  const dateFin = new Date(dateDebut.getFullYear(), dateDebut.getMonth() + 1, 1);
  const fin = dateFin.toISOString().slice(0, 10);

  const mouvements = await fetchMouvementsPeriode(groupId, debut, fin);
  return { periode: anneeMoisISO, debut, fin, ...mouvements };
}

// ============================================================
// BILAN ANNUEL — mêmes données, sur toute une année civile.
// ============================================================
export async function fetchBilanAnnuel(groupId, annee) {
  const debut = `${annee}-01-01`;
  const fin = `${Number(annee) + 1}-01-01`;
  const mouvements = await fetchMouvementsPeriode(groupId, debut, fin);
  return { annee, debut, fin, ...mouvements };
}

// Récupère tous les mouvements financiers d'un groupe sur une
// période [debut, fin), tous modules confondus, avec les totaux
// et une liste chronologique complète (utilisée par le rapport
// mensuel et le bilan annuel).
async function fetchMouvementsPeriode(groupId, debut, fin) {
  const liste = [];

  // --- TONTINE ---
  const { data: tontines } = await supabase.from("tontines").select("id, nom").eq("group_id", groupId);
  const idsTontines = (tontines || []).map((t) => t.id);
  const nomTontineParId = Object.fromEntries((tontines || []).map((t) => [t.id, t.nom]));

  if (idsTontines.length > 0) {
    const { data: tours } = await supabase
      .from("tontine_tours")
      .select("id, numero, tontine_id, verse_le, montant, beneficiaire:group_members(profile:profiles(nom_complet))")
      .in("tontine_id", idsTontines);
    const idsTours = (tours || []).map((t) => t.id);
    const tourParId = Object.fromEntries((tours || []).map((t) => [t.id, t]));

    if (idsTours.length > 0) {
      const { data: cotisations } = await supabase
        .from("tontine_cotisations")
        .select("montant, date_paiement, membre:group_members(profile:profiles(nom_complet)), tour_id")
        .in("tour_id", idsTours)
        .gte("date_paiement", debut)
        .lt("date_paiement", fin);
      (cotisations || []).forEach((c) => liste.push({
        module: "Tontine", type: "Cotisation", membre: c.membre?.profile?.nom_complet || "—",
        montant: Number(c.montant), date: c.date_paiement, sens: "encaisse",
        detail: `Tour ${tourParId[c.tour_id]?.numero} — ${nomTontineParId[tourParId[c.tour_id]?.tontine_id]}`,
      }));

      const { data: amendes } = await supabase
        .from("tontine_amendes")
        .select("montant_amende, motif, membre:group_members(profile:profiles(nom_complet)), created_at")
        .in("tour_id", idsTours)
        .gte("created_at", `${debut}T00:00:00`)
        .lt("created_at", `${fin}T00:00:00`);
      (amendes || []).forEach((a) => liste.push({
        module: "Tontine", type: "Amende", membre: a.membre?.profile?.nom_complet || "—",
        montant: Number(a.montant_amende), date: a.created_at.slice(0, 10), sens: "encaisse",
        detail: a.motif || "—",
      }));
    }

    (tours || [])
      .filter((t) => t.verse_le && t.verse_le.slice(0, 10) >= debut && t.verse_le.slice(0, 10) < fin)
      .forEach((t) => liste.push({
        module: "Tontine", type: "Versement", membre: t.beneficiaire?.profile?.nom_complet || "—",
        montant: Number(t.montant || 0), date: t.verse_le.slice(0, 10), sens: "decaisse",
        detail: `Tour ${t.numero} — ${nomTontineParId[t.tontine_id]}`,
      }));
  }

  // --- BANQUE (épargnes) ---
  const { data: epargnes } = await supabase.from("epargnes").select("id, nom").eq("group_id", groupId);
  const idsEpargnes = (epargnes || []).map((e) => e.id);
  const nomEpargneParId = Object.fromEntries((epargnes || []).map((e) => [e.id, e.nom]));

  if (idsEpargnes.length > 0) {
    const { data } = await supabase
      .from("epargne_mouvements")
      .select("type, montant, epargne_id, date_mouvement, membre:group_members(profile:profiles(nom_complet))")
      .in("epargne_id", idsEpargnes)
      .gte("date_mouvement", debut)
      .lt("date_mouvement", fin);
    (data || []).forEach((m) => liste.push({
      module: "Banque", type: m.type, membre: m.membre?.profile?.nom_complet || "—",
      montant: Number(m.montant), date: m.date_mouvement, sens: m.type === "Versement" ? "encaisse" : "decaisse",
      detail: nomEpargneParId[m.epargne_id] || "—",
    }));
  }

  // --- ASSURANCE ---
  const { data: assuranceMvts } = await supabase
    .from("assurance_mouvements")
    .select("type, montant, date_mouvement, membre:group_members(profile:profiles(nom_complet))")
    .eq("group_id", groupId)
    .gte("date_mouvement", debut)
    .lt("date_mouvement", fin);
  (assuranceMvts || []).forEach((m) => liste.push({
    module: "Assurance", type: m.type, membre: m.membre?.profile?.nom_complet || "—",
    montant: Number(m.montant), date: m.date_mouvement, sens: m.type === "Cotisation" ? "encaisse" : "decaisse",
    detail: "—",
  }));

  // --- DÉPÔTS / RETRAITS EXTERNES ---
  const { data: comptes } = await supabase.from("comptes_bancaires_externes").select("id, nom").eq("group_id", groupId);
  const idsComptes = (comptes || []).map((c) => c.id);
  const nomCompteParId = Object.fromEntries((comptes || []).map((c) => [c.id, c.nom]));

  if (idsComptes.length > 0) {
    const { data } = await supabase
      .from("mouvements_bancaires_externes")
      .select("type, montant, compte_id, date_mouvement, categorie_frais, motif")
      .in("compte_id", idsComptes)
      .gte("date_mouvement", debut)
      .lt("date_mouvement", fin);
    (data || []).forEach((m) => liste.push({
      module: "Dépôts/Retraits", type: m.type, membre: "—",
      montant: Number(m.montant), date: m.date_mouvement,
      sens: (m.type === "Dépôt" || m.type === "Intérêt") ? "encaisse" : "decaisse",
      detail: `${nomCompteParId[m.compte_id] || "—"}${m.categorie_frais ? ` (${m.categorie_frais})` : m.motif ? ` (${m.motif})` : ""}`,
    }));
  }

  // --- FONDS ---
  const { data: typesFonds } = await supabase.from("types_fonds").select("id, nom").eq("group_id", groupId);
  const idsTypesFonds = (typesFonds || []).map((t) => t.id);
  const nomTypeFondsParId = Object.fromEntries((typesFonds || []).map((t) => [t.id, t.nom]));

  if (idsTypesFonds.length > 0) {
    const { data } = await supabase
      .from("fonds_mouvements")
      .select("montant, type_fonds_id, date_mouvement, membre:group_members(profile:profiles(nom_complet))")
      .in("type_fonds_id", idsTypesFonds)
      .gte("date_mouvement", debut)
      .lt("date_mouvement", fin);
    (data || []).forEach((m) => liste.push({
      module: "Fonds", type: nomTypeFondsParId[m.type_fonds_id] || "—", membre: m.membre?.profile?.nom_complet || "—",
      montant: Number(m.montant), date: m.date_mouvement, sens: "encaisse",
      detail: "—",
    }));
  }

  // --- SÉANCES (paiements d'amendes reçus dans la caisse) ---
  const { data: paiementsAmendes } = await supabase
    .from("caisse_amendes_mouvements")
    .select("montant, mode_paiement, date_mouvement, membre:group_members(profile:profiles(nom_complet))")
    .eq("group_id", groupId)
    .gte("date_mouvement", debut)
    .lt("date_mouvement", fin);
  (paiementsAmendes || []).forEach((p) => liste.push({
    module: "Séances", type: "Amende payée", membre: p.membre?.profile?.nom_complet || "—",
    montant: Number(p.montant), date: p.date_mouvement, sens: "encaisse",
    detail: p.mode_paiement,
  }));

  liste.sort((a, b) => a.date.localeCompare(b.date));

  const totalEncaisse = liste.filter((l) => l.sens === "encaisse").reduce((s, l) => s + l.montant, 0);
  const totalDecaisse = liste.filter((l) => l.sens === "decaisse").reduce((s, l) => s + l.montant, 0);

  const parModule = {};
  liste.forEach((l) => {
    if (!parModule[l.module]) parModule[l.module] = { encaisse: 0, decaisse: 0, nb: 0 };
    parModule[l.module][l.sens] += l.montant;
    parModule[l.module].nb += 1;
  });

  return { mouvements: liste, totalEncaisse, totalDecaisse, parModule };
}
