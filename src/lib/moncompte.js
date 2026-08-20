import { supabase } from "./supabaseClient";

// Récupère un aperçu complet des données financières du membre
// connecté : sa tontine en cours, son solde d'assurance, les
// épargnes du groupe, et son historique récent (tous modules).
export async function fetchTableauDeBordMembre(groupId, membreId, limite = 20) {
  // --- Tontine active + mon tour ---
  const { data: tontine, error: errTontine } = await supabase
    .from("tontines")
    .select("id, nom, montant_par_tour")
    .eq("group_id", groupId)
    .eq("statut", "en cours")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errTontine) throw errTontine;

  let monTour = null;
  let tourEnCours = null;
  let aCotiseCeTour = false;

  if (tontine) {
    const { data: tours, error: errTours } = await supabase
      .from("tontine_tours")
      .select("id, numero, statut, beneficiaire_id, montant")
      .eq("tontine_id", tontine.id)
      .order("numero", { ascending: true });
    if (errTours) throw errTours;

    tourEnCours = tours.find((t) => t.statut === "en cours") || null;
    monTour = tours.find((t) => t.beneficiaire_id === membreId) || null;

    if (tourEnCours) {
      const { data: mesCotisations, error: errCot } = await supabase
        .from("tontine_cotisations")
        .select("id")
        .eq("tour_id", tourEnCours.id)
        .eq("membre_id", membreId)
        .limit(1);
      if (errCot) throw errCot;
      aCotiseCeTour = mesCotisations.length > 0;
    }
  }

  // --- Assurance ---
  const { data: assurance, error: errAssur } = await supabase
    .from("assurance_soldes")
    .select("solde, delai_expire_le")
    .eq("group_id", groupId)
    .eq("membre_id", membreId)
    .maybeSingle();
  if (errAssur) throw errAssur;

  // --- Épargnes du groupe (informatif) ---
  const { data: epargnes, error: errEp } = await supabase
    .from("epargnes")
    .select("id, nom, solde")
    .eq("group_id", groupId);
  if (errEp) throw errEp;

  // --- Prêt(s) en cours ---
  const idsEpargnes = epargnes.map((e) => e.id);
  let mesPrets = [];
  if (idsEpargnes.length > 0) {
    const { data: prets, error: errPrets } = await supabase
      .from("prets")
      .select("id, montant, statut, date_fin, epargne_id")
      .in("epargne_id", idsEpargnes)
      .eq("membre_id", membreId)
      .eq("statut", "en cours");
    if (errPrets) throw errPrets;
    mesPrets = prets;
  }

  // --- Historique récent (tontine + banque + assurance) ---
  const historique = [];

  const { data: mesCotisationsTontine } = await supabase
    .from("tontine_cotisations")
    .select("montant, date_paiement")
    .eq("membre_id", membreId)
    .order("date_paiement", { ascending: false })
    .limit(limite);
  (mesCotisationsTontine || []).forEach((c) =>
    historique.push({ label: "Cotisation tontine", date: c.date_paiement, montant: -c.montant })
  );

  if (idsEpargnes.length > 0) {
    const { data: mesMouvementsEpargne } = await supabase
      .from("epargne_mouvements")
      .select("montant, type, date_mouvement")
      .eq("membre_id", membreId)
      .in("epargne_id", idsEpargnes)
      .order("date_mouvement", { ascending: false })
      .limit(limite);
    (mesMouvementsEpargne || []).forEach((m) =>
      historique.push({ label: `Banque — ${m.type}`, date: m.date_mouvement, montant: m.type === "Versement" ? -m.montant : m.montant })
    );
  }

  const { data: mesMouvementsAssurance } = await supabase
    .from("assurance_mouvements")
    .select("montant, type, date_mouvement")
    .eq("membre_id", membreId)
    .order("date_mouvement", { ascending: false })
    .limit(limite);
  (mesMouvementsAssurance || []).forEach((m) =>
    historique.push({ label: `Assurance — ${m.type}`, date: m.date_mouvement, montant: m.type === "Cotisation" ? -m.montant : m.montant })
  );

  historique.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return {
    tontine: tontine ? {
      nom: tontine.nom,
      montantParTour: tontine.montant_par_tour,
      monTourNumero: monTour?.numero || null,
      monTourStatut: monTour?.statut || null,
      tourEnCoursNumero: tourEnCours?.numero || null,
      aCotiseCeTour,
    } : null,
    assurance: assurance ? { solde: assurance.solde, delaiExpireLe: assurance.delai_expire_le } : null,
    epargnes: epargnes.map((e) => ({ nom: e.nom, solde: e.solde })),
    mesPrets: mesPrets.map((p) => ({ montant: p.montant, dateFin: p.date_fin })),
    historique: historique.slice(0, limite),
  };
}
