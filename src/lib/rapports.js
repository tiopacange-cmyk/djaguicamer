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

  // --- TOTAUX ---
  const totalEncaisse =
    tontineCotisations.reduce((s, c) => s + Number(c.montant), 0) +
    mouvementsEpargne.filter((m) => m.type === "Versement").reduce((s, m) => s + Number(m.montant), 0) +
    assuranceMouvements.filter((m) => m.type === "Cotisation").reduce((s, m) => s + Number(m.montant), 0) +
    mouvementsExternes.filter((m) => m.type === "Dépôt" || m.type === "Intérêt").reduce((s, m) => s + Number(m.montant), 0);

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
    totalEncaisse,
    totalDecaisse,
  };
}
