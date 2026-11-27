import { supabase } from "./supabaseClient";

// ============================================================
// OPÉRATIONS « TOUT OU RIEN »
// Toutes les étapes d'une opération d'argent partent ensemble vers
// la base (fonction djangui_executer_operations) : soit tout est
// enregistré, soit rien. Les soldes sont modifiés par la base
// (solde = solde + montant), jamais lus puis réécrits par le
// téléphone : deux saisies simultanées ne s'écrasent plus.
// ============================================================

export async function executerOperations(groupId, etapes) {
  const liste = etapes.filter(Boolean);
  if (!liste.length) return { refs: {}, soldes: {} };
  const { data, error } = await supabase.rpc("djangui_executer_operations", { gid: groupId, etapes: liste });
  if (error) {
    if (/djangui_executer_operations/.test(error.message || "") && /(not find|n'existe pas|does not exist)/i.test(error.message || "")) {
      throw new Error("La base n'est pas à jour : exécute le script 2026-11-operations-atomiques.sql dans Supabase.");
    }
    throw new Error(error.message || "L'opération n'a pas abouti. Rien n'a été enregistré.");
  }
  return data || { refs: {}, soldes: {} };
}

// Sens d'un mouvement d'épargne sur le solde de la caisse.
export const signeEpargne = (type) => (type === "Versement" || type === "Remboursement" ? 1 : type === "Intérêts" ? 0 : -1);

// --- Fabriques d'étapes ---
export const etape = {
  // Mouvement d'épargne (solde + ligne d'historique)
  epargne: ({ epargneId, membreId = null, type, montant, date, pretId = null, saisiPar = null, modePaiement = "especes", interditNegatif = false, cle }) => ({
    op: "epargne", epargne_id: epargneId, membre_id: membreId, type, montant: Math.round(Number(montant)), delta: signeEpargne(type) * Math.round(Number(montant)),
    date, pret_id: pretId, saisi_par: saisiPar, mode_paiement: modePaiement, interdit_negatif: interditNegatif, ...(cle ? { cle } : {}),
  }),
  // Ajuste un solde d'épargne sans ligne d'historique (reste d'arrondi)
  soldeEpargne: (epargneId, delta) => ({ op: "epargne", epargne_id: epargneId, delta: Math.round(delta), sans_ligne: true }),
  // Assurance : delta positif (cotisation) ou négatif (prélèvement)
  assurance: ({ membreId, type, delta, date, soldeMinimum, modePaiement = "especes", cle }) => ({
    op: "assurance", membre_id: membreId, type, delta: Math.round(delta), date, mode_paiement: modePaiement,
    ...(soldeMinimum !== undefined && soldeMinimum !== null ? { solde_minimum: soldeMinimum } : {}), ...(cle ? { cle } : {}),
  }),
  // Fonds : delta positif (versement) ou négatif (prélèvement)
  fonds: ({ membreId, typeFondsId, delta, date, modePaiement = "especes", cle }) => ({
    op: "fonds", membre_id: membreId, type_fonds_id: typeFondsId, delta: Math.round(delta), date, mode_paiement: modePaiement, ...(cle ? { cle } : {}),
  }),
  inserer: (table, ligne, ref) => ({ op: "inserer", table, ligne, ...(ref ? { ref } : {}) }),
  // si = l'état attendu de la ligne (sinon l'opération est refusée)
  modifier: (table, id, champs, si, message) => ({ op: "modifier", table, id, champs, ...(si ? { si } : {}), ...(message ? { message } : {}) }),
  supprimerGardees: (seanceId, si) => ({ op: "supprimer", table: "sommes_gardees", id: seanceId, ...(si ? { si } : {}) }),
};

// Date du jour à l'heure locale (Cameroun), au format AAAA-MM-JJ.
export function aujourdhuiLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Étapes d'une saisie de cotisations (une ligne par membre).
// lignes = [{ membreId, montant, date }]
// Montant saisi → nombre entier (« 50 000 », « 50000 » ou 50000).
export const montantEntier = (v) => Math.round(Number(String(v ?? "").replace(/[^\d.]/g, ""))) || 0;

export function etapesCotisations(groupId, rubrique, { tourId, epargneId, typeFondsId, soldeMinimum, saisiPar } = {}, lignesBrutes) {
  const propres = lignesBrutes.map((l) => ({ ...l, montant: montantEntier(l.montant) })).filter((l) => l.montant > 0);
  if (rubrique === "tontine") {
    return propres.map((l) => etape.inserer("tontine_cotisations", { tour_id: tourId, membre_id: l.membreId, montant: l.montant, date_paiement: l.date }));
  }
  if (rubrique === "epargne") {
    return propres.map((l) => etape.epargne({ epargneId, membreId: l.membreId, type: "Versement", montant: l.montant, date: l.date, saisiPar, cle: "solde" }));
  }
  if (rubrique === "assurance") {
    return propres.map((l) => etape.assurance({ membreId: l.membreId, type: "Cotisation", delta: l.montant, date: l.date || aujourdhuiLocal(), soldeMinimum, cle: l.membreId }));
  }
  if (rubrique === "fonds") {
    return propres.map((l) => etape.fonds({ membreId: l.membreId, typeFondsId, delta: l.montant, date: l.date || aujourdhuiLocal(), cle: l.membreId }));
  }
  throw new Error("Rubrique inconnue.");
}
