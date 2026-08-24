import { supabase } from "./supabaseClient";

// ============================================================
// TONTINE
// ============================================================

// Récupère la tontine active du groupe (statut "en cours"), avec
// tous ses tours et le nom du bénéficiaire de chacun.
export async function fetchTontineActive(groupId) {
  const { data: tontine, error: errTontine } = await supabase
    .from("tontines")
    .select("*")
    .eq("group_id", groupId)
    .eq("statut", "en cours")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errTontine) throw errTontine;
  if (!tontine) return null;

  const { data: tours, error: errTours } = await supabase
    .from("tontine_tours")
    .select(`
      id, numero, montant, mode, statut, montant_enchere, commission_enchere,
      beneficiaire:group_members ( id, profile:profiles ( nom_complet ) )
    `)
    .eq("tontine_id", tontine.id)
    .order("numero", { ascending: true });

  if (errTours) throw errTours;

  return {
    id: tontine.id,
    nom: tontine.nom,
    montantParTour: tontine.montant_par_tour,
    tours: tours.map((t) => ({
      id: t.id,
      numero: t.numero,
      beneficiaireId: t.beneficiaire?.id || null,
      beneficiaireNom: t.beneficiaire?.profile?.nom_complet || "À désigner",
      montant: t.montant,
      mode: t.mode,
      statut: t.statut,
      commissionEncheres: t.commission_enchere || 0,
    })),
  };
}

export async function creerTontine(groupId, { nom, montantParTour, seances, membresActifs, dateDebut }) {
  const { data: tontine, error: errTontine } = await supabase
    .from("tontines")
    .insert({ group_id: groupId, nom, montant_par_tour: montantParTour, statut: "en cours", date_debut: dateDebut || null })
    .select()
    .single();
  if (errTontine) throw errTontine;

  const tours = [];
  for (let i = 0; i < seances.length; i++) {
    const s = seances[i];

    const { data: seance, error: errSeance } = await supabase
      .from("tontine_seances")
      .insert({ tontine_id: tontine.id, date_seance: s.date, mode: s.mode })
      .select()
      .single();
    if (errSeance) throw errSeance;

    const beneficiaire = s.mode === "Enchères"
      ? null
      : (membresActifs.length ? membresActifs[i % membresActifs.length].id : null);

    const { data: tour, error: errTour } = await supabase
      .from("tontine_tours")
      .insert({
        tontine_id: tontine.id,
        seance_id: seance.id,
        numero: i + 1,
        beneficiaire_id: beneficiaire,
        montant: i === 0 ? montantParTour : null,
        mode: s.mode,
        statut: i === 0 ? "en cours" : "à venir",
      })
      .select()
      .single();
    if (errTour) throw errTour;
    tours.push(tour);
  }

  return { tontine, tours };
}

export async function verserTour(tontineId, tourId, numeroActuel) {
  const { error: errCloture } = await supabase
    .from("tontine_tours")
    .update({ statut: "clôturé", verse_le: new Date().toISOString() })
    .eq("id", tourId);
  if (errCloture) throw errCloture;

  const { error: errSuivant } = await supabase
    .from("tontine_tours")
    .update({ statut: "en cours" })
    .eq("tontine_id", tontineId)
    .eq("numero", numeroActuel + 1);
  if (errSuivant) throw errSuivant;
}

export async function enregistrerCotisationsTontine(tourId, cotisations) {
  const lignes = cotisations
    .filter((c) => c.montant && parseFloat(c.montant) > 0)
    .map((c) => ({
      tour_id: tourId,
      membre_id: c.membreId,
      montant: parseFloat(c.montant),
      date_paiement: c.date,
    }));

  if (lignes.length === 0) return;

  const { error } = await supabase.from("tontine_cotisations").insert(lignes);
  if (error) throw error;
}

export async function ajouterMembreAuCycle(tontineId, membreId, montantRappel, toursClotures) {
  if (toursClotures.length > 0 && montantRappel > 0) {
    const parTour = montantRappel / toursClotures.length;
    const lignes = toursClotures.map((t) => ({
      tour_id: t.id,
      membre_id: membreId,
      montant: parTour,
      date_paiement: new Date().toISOString().slice(0, 10),
    }));
    const { error } = await supabase.from("tontine_cotisations").insert(lignes);
    if (error) throw error;
  }
}

export async function enregistrerEnchere(tourId, beneficiaireId, montantEnchere, cagnotteTotale) {
  const montantNet = cagnotteTotale - montantEnchere;
  const { error } = await supabase
    .from("tontine_tours")
    .update({
      beneficiaire_id: beneficiaireId,
      montant_enchere: montantEnchere,
      commission_enchere: montantEnchere,
      montant: montantNet,
    })
    .eq("id", tourId);
  if (error) throw error;
}

export async function fetchCotisationsTour(tourId) {
  const { data, error } = await supabase
    .from("tontine_cotisations")
    .select("membre_id")
    .eq("tour_id", tourId);

  if (error) throw error;
  return data.map((c) => c.membre_id);
}

export async function appliquerAmendeTontine(tourId, membreId, { joursRetard, montant, motif }) {
  const { error } = await supabase.from("tontine_amendes").insert({
    tour_id: tourId,
    membre_id: membreId,
    jours_retard: joursRetard || null,
    montant_amende: montant,
    motif: motif || null,
  });
  if (error) throw error;
}

// ============================================================
// REDISTRIBUTION DE LA COMMISSION D'ENCHÈRES (fin de cycle)
// ============================================================

export async function fetchApercuRedistribution(tontineId) {
  const { data: tours, error: errTours } = await supabase
    .from("tontine_tours")
    .select("id, commission_enchere")
    .eq("tontine_id", tontineId);
  if (errTours) throw errTours;

  const commissionTotale = tours.reduce((s, t) => s + Number(t.commission_enchere || 0), 0);
  const idsTours = tours.map((t) => t.id);

  if (idsTours.length === 0 || commissionTotale === 0) {
    return { commissionTotale: 0, membres: [] };
  }

  const { data: cotisations, error: errCot } = await supabase
    .from("tontine_cotisations")
    .select("membre_id, membre:group_members(profile:profiles(nom_complet, telephone))")
    .in("tour_id", idsTours);
  if (errCot) throw errCot;

  const totalCotisations = cotisations.length;
  const parMembre = {};
  cotisations.forEach((c) => {
    if (!parMembre[c.membre_id]) {
      parMembre[c.membre_id] = {
        membreId: c.membre_id,
        nom: c.membre?.profile?.nom_complet || "—",
        telephone: c.membre?.profile?.telephone || "",
        nbCotisations: 0,
      };
    }
    parMembre[c.membre_id].nbCotisations += 1;
  });

  return {
    commissionTotale,
    totalCotisations,
    membres: Object.values(parMembre).map((m) => ({
      ...m,
      part: Math.round(commissionTotale * (m.nbCotisations / totalCotisations)),
    })),
  };
}

export async function redistribuerCommission(tontineId, membresApercu) {
  const lignes = membresApercu
    .filter((m) => m.part > 0)
    .map((m) => ({
      tontine_id: tontineId,
      membre_id: m.membreId,
      montant: m.part,
      mode: "pondéré",
    }));
  if (lignes.length === 0) return;

  const { error } = await supabase.from("tontine_redistributions").insert(lignes);
  if (error) throw error;
}

// Total des commissions d'enchères déjà redistribuées aux membres,
// toutes tontines du groupe confondues — utilisé dans le Bilan.
export async function fetchTotalRedistributions(groupId) {
  const { data: tontines, error: errTontines } = await supabase
    .from("tontines")
    .select("id")
    .eq("group_id", groupId);
  if (errTontines) throw errTontines;
  const idsTontines = tontines.map((t) => t.id);
  if (idsTontines.length === 0) return 0;

  const { data, error } = await supabase
    .from("tontine_redistributions")
    .select("montant")
    .in("tontine_id", idsTontines);
  if (error) throw error;

  return data.reduce((s, r) => s + Number(r.montant), 0);
}
