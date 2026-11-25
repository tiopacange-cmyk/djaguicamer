// ============================================================
// CALCULS BANCAIRES — fonctions pures, sans accès à la base.
// Toutes les dates sont des chaînes "aaaa-mm-jj" (ou des Date).
// Tous les montants sont des nombres en FCFA.
// ============================================================

const JOUR_MS = 86400000;

export function versDate(d) {
  if (d instanceof Date) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const [a, m, j] = String(d).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j));
}

export function versISO(d) {
  return versDate(d).toISOString().slice(0, 10);
}

export function joursEntre(debut, fin) {
  return Math.round((versDate(fin) - versDate(debut)) / JOUR_MS);
}

// Ajoute n périodes (jour, semaine ou mois). Les mois suivent le
// calendrier : 31/01 + 1 mois = 28/02 (ou 29/02), jamais le 03/03.
export function ajouterPeriodes(date, n, unite) {
  const d = versDate(date);
  if (unite === "jour") return new Date(d.getTime() + n * JOUR_MS);
  if (unite === "semaine") return new Date(d.getTime() + n * 7 * JOUR_MS);
  const jour = d.getUTCDate();
  const cible = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const dernierJour = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(jour, dernierJour));
  return cible;
}

// Durée moyenne d'une unité en jours (pour le calcul au prorata).
export function joursParUnite(unite) {
  if (unite === "jour") return 1;
  if (unite === "semaine") return 7;
  return 365 / 12;
}

// ------------------------------------------------------------
// RÈGLES
// ------------------------------------------------------------
// taux        : % par période (ex. 10)
// periode     : nombre d'unités par période (ex. 2)
// unite       : "jour" | "semaine" | "mois"
// mode        : "periode" (toute période entamée est due)
//             | "prorata" (au jour près) | "fixe" (une seule fois)
// penaliteValeur, penaliteType ("pourcent" | "fixe"),
// penaliteBase ("reste" = capital restant | "capital" = montant prêté),
// penaliteUnite ("jour" | "semaine" | "mois"), graceJours
export const REGLES_PAR_DEFAUT = {
  taux: 10,
  periode: 2,
  unite: "mois",
  mode: "periode",
  fraisType: "fixe",
  fraisValeur: 0,
  penaliteValeur: 0,
  penaliteType: "pourcent",
  penaliteBase: "reste",
  penaliteUnite: "mois",
  graceJours: 0,
  plafondMultiple: null,
  partage: "nombres",
};

export function normaliserRegles(r = {}) {
  const x = { ...REGLES_PAR_DEFAUT, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined && v !== "")) };
  x.taux = Number(x.taux) || 0;
  x.periode = Math.max(1, Math.round(Number(x.periode) || 1));
  x.fraisValeur = Number(x.fraisValeur) || 0;
  x.penaliteValeur = Number(x.penaliteValeur) || 0;
  x.graceJours = Math.max(0, Math.round(Number(x.graceJours) || 0));
  x.plafondMultiple = r.plafondMultiple === null || r.plafondMultiple === undefined || r.plafondMultiple === "" ? null : Number(r.plafondMultiple);
  return x;
}

export function fraisDeDossier(montant, regles) {
  const r = normaliserRegles(regles);
  if (!r.fraisValeur) return 0;
  return Math.round(r.fraisType === "pourcent" ? montant * r.fraisValeur / 100 : r.fraisValeur);
}

export function libelleRegle(regles) {
  const r = normaliserRegles(regles);
  const unites = { jour: ["jour", "jours"], semaine: ["semaine", "semaines"], mois: ["mois", "mois"] };
  const u = unites[r.unite] || unites.mois;
  const per = r.periode === 1 ? `par ${u[0]}` : `tous les ${r.periode} ${u[1]}`;
  if (r.mode === "fixe") return `${r.taux} % fixe`;
  return `${r.taux} % ${per}${r.mode === "prorata" ? " (au prorata des jours)" : " (période entamée due)"}`;
}

// ------------------------------------------------------------
// PRÊTS
// ------------------------------------------------------------
// pret = { montant, dateDebut, dateFin (échéance), regles }
// remboursements = [{ date, capital, interets, penalites }] (non annulés)

// Capital encore dû juste avant la date donnée (les remboursements
// du jour même ne sont pas encore pris en compte).
function capitalAvant(pret, remboursements, date) {
  const t = versDate(date).getTime();
  const rembourse = remboursements
    .filter((x) => versDate(x.date).getTime() < t)
    .reduce((s, x) => s + (Number(x.capital) || 0), 0);
  return Math.max(0, Number(pret.montant) - rembourse);
}

function capitalJusqua(pret, remboursements, date) {
  const t = versDate(date).getTime();
  const rembourse = remboursements
    .filter((x) => versDate(x.date).getTime() <= t)
    .reduce((s, x) => s + (Number(x.capital) || 0), 0);
  return Math.max(0, Number(pret.montant) - rembourse);
}

// Date à laquelle le capital a été entièrement remboursé (ou null).
export function dateSolde(pret, remboursements) {
  let restant = Number(pret.montant);
  const tri = [...remboursements].sort((a, b) => versDate(a.date) - versDate(b.date));
  for (const x of tri) {
    restant -= Number(x.capital) || 0;
    if (restant <= 0) return versISO(x.date);
  }
  return null;
}

// Intérêts dus pour la période [dateDebut, date].
// Renvoie { total, periodes: [{ numero, debut, fin, base, interet, entamee }] }
export function interetsPret(pret, remboursements, date) {
  const r = normaliserRegles(pret.regles);
  const debut = versDate(pret.dateDebut);
  const fin = versDate(date);
  const periodes = [];
  if (fin < debut || r.taux <= 0) return { total: 0, periodes };
  const taux = r.taux / 100;

  if (r.mode === "fixe") {
    const interet = Math.round(Number(pret.montant) * taux);
    periodes.push({ numero: 1, debut: versISO(debut), fin: versISO(pret.dateFin || fin), base: Number(pret.montant), interet, entamee: false });
    return { total: interet, periodes };
  }

  if (r.mode === "prorata") {
    // Capital × jours, segment par segment entre deux remboursements.
    const dates = [debut, ...remboursements.map((x) => versDate(x.date)).filter((d) => d > debut && d < fin), fin]
      .sort((a, b) => a - b);
    let total = 0;
    for (let i = 0; i < dates.length - 1; i++) {
      const jours = joursEntre(dates[i], dates[i + 1]);
      if (jours <= 0) continue;
      const base = capitalJusqua(pret, remboursements, dates[i]);
      total += base * taux * jours / (r.periode * joursParUnite(r.unite));
    }
    total = Math.round(total);
    periodes.push({ numero: 1, debut: versISO(debut), fin: versISO(fin), base: Number(pret.montant), interet: total, entamee: false });
    return { total, periodes };
  }

  // Par période entamée : chaque période commencée avant (ou à) la
  // date est due, sur le capital restant au début de la période.
  let total = 0;
  for (let k = 0; ; k++) {
    const pDebut = ajouterPeriodes(debut, k * r.periode, r.unite);
    if (k > 0 && pDebut >= fin) break;
    const pFin = ajouterPeriodes(debut, (k + 1) * r.periode, r.unite);
    const base = k === 0 ? Number(pret.montant) : capitalAvant(pret, remboursements, pDebut);
    if (base <= 0) break;
    const interet = Math.round(base * taux);
    total += interet;
    periodes.push({ numero: k + 1, debut: versISO(pDebut), fin: versISO(pFin), base, interet, entamee: pFin > fin });
    if (k > 1000) break;
  }
  return { total, periodes };
}

// Pénalités de retard dues à la date donnée.
export function penalitesPret(pret, remboursements, date) {
  const r = normaliserRegles(pret.regles);
  if (!r.penaliteValeur || !pret.dateFin) return 0;
  const limite = new Date(versDate(pret.dateFin).getTime() + r.graceJours * JOUR_MS);
  const fin = versDate(date);
  if (fin <= limite) return 0;
  const joursRetard = joursEntre(limite, fin);
  const unites = Math.ceil(joursRetard / joursParUnite(r.penaliteUnite) - 1e-9);
  if (unites <= 0) return 0;
  if (r.penaliteType === "fixe") return Math.round(r.penaliteValeur * unites);
  const base = r.penaliteBase === "capital" ? Number(pret.montant) : capitalAvant(pret, remboursements, limite);
  return Math.round(base * r.penaliteValeur / 100 * unites);
}

// Situation complète d'un prêt à une date donnée.
export function situationPret(pret, remboursements, date) {
  const valides = remboursements.filter((x) => !x.annule);
  const solde = dateSolde(pret, valides);
  // Les intérêts s'arrêtent le jour où le capital est entièrement remboursé.
  const dateCalcul = solde && versDate(solde) < versDate(date) ? solde : versISO(date);
  const { total: interetsDus, periodes } = interetsPret(pret, valides, dateCalcul);
  const penalitesDues = penalitesPret(pret, valides, dateCalcul);
  const paye = valides.reduce((s, x) => ({
    capital: s.capital + (Number(x.capital) || 0),
    interets: s.interets + (Number(x.interets) || 0),
    penalites: s.penalites + (Number(x.penalites) || 0),
  }), { capital: 0, interets: 0, penalites: 0 });
  const capitalRestant = Math.max(0, Number(pret.montant) - paye.capital);
  const interetsRestants = Math.max(0, interetsDus - paye.interets);
  const penalitesRestantes = Math.max(0, penalitesDues - paye.penalites);
  const totalDu = capitalRestant + interetsRestants + penalitesRestantes;
  let statut = "en cours";
  if (totalDu === 0) statut = "remboursé";
  else if (pret.dateFin && versDate(date) > versDate(pret.dateFin)) statut = "en retard";
  return { capitalRestant, interetsDus, interetsRestants, penalitesDues, penalitesRestantes, totalDu, paye, periodes, statut };
}

// Répartit un paiement : d'abord les pénalités, puis les intérêts,
// puis le capital. Le surplus éventuel est renvoyé à part.
export function repartirPaiement(montant, situation) {
  let reste = Math.max(0, Math.round(Number(montant) || 0));
  const penalites = Math.min(reste, situation.penalitesRestantes); reste -= penalites;
  const interets = Math.min(reste, situation.interetsRestants); reste -= interets;
  const capital = Math.min(reste, situation.capitalRestant); reste -= capital;
  return { penalites, interets, capital, surplus: reste };
}

// Échéancier en mensualités (capital égal à chaque période, intérêts
// sur le capital restant) — aperçu pour un prêt spécial.
export function echeancier(montant, regles, nombre) {
  const r = normaliserRegles(regles);
  const n = Math.max(1, Math.round(nombre));
  const partCapital = Math.round(montant / n);
  const lignes = [];
  let restant = montant;
  for (let i = 0; i < n; i++) {
    const capital = i === n - 1 ? restant : partCapital;
    const interet = r.mode === "fixe" ? (i === 0 ? Math.round(montant * r.taux / 100) : 0) : Math.round(restant * r.taux / 100);
    lignes.push({ numero: i + 1, capital, interet, total: capital + interet, restantApres: restant - capital });
    restant -= capital;
  }
  return { lignes, totalInterets: lignes.reduce((s, l) => s + l.interet, 0), total: lignes.reduce((s, l) => s + l.total, 0) };
}

// ------------------------------------------------------------
// CLÔTURE — méthode des nombres
// ------------------------------------------------------------
// mouvements = [{ membreId, date, montant (+ versement / − retrait) }]
// (seulement l'épargne des membres : ni prêts ni remboursements)
export function nombresParMembre(mouvements, dateCloture) {
  const parMembre = {};
  for (const m of mouvements) {
    if (versDate(m.date) > versDate(dateCloture)) continue;
    (parMembre[m.membreId] = parMembre[m.membreId] || []).push(m);
  }
  const res = {};
  for (const [id, liste] of Object.entries(parMembre)) {
    liste.sort((a, b) => versDate(a.date) - versDate(b.date));
    let solde = 0;
    let nombres = 0;
    const lignes = [];
    liste.forEach((m, i) => {
      solde += Number(m.montant);
      const suivante = i + 1 < liste.length ? liste[i + 1].date : dateCloture;
      const jours = Math.max(0, joursEntre(m.date, suivante));
      const n = Math.max(0, solde) * jours;
      nombres += n;
      lignes.push({ date: versISO(m.date), montant: Number(m.montant), solde, jours, nombres: n, libelle: m.libelle });
    });
    res[id] = { capital: solde, nombres, lignes };
  }
  return res;
}

// Partage d'une cagnotte entre les membres.
// mode : "nombres" (montant × jours) | "montant" (capital final) | "egal"
// Chaque part est arrondie au franc inférieur ; le reste est renvoyé.
export function partagerCagnotte(cagnotte, situationMembres, mode = "nombres") {
  const ids = Object.keys(situationMembres).filter((id) => situationMembres[id].capital > 0 || situationMembres[id].nombres > 0);
  const poids = Object.fromEntries(ids.map((id) => {
    const s = situationMembres[id];
    const p = mode === "egal" ? 1 : mode === "montant" ? Math.max(0, s.capital) : Math.max(0, s.nombres);
    return [id, p];
  }));
  const totalPoids = Object.values(poids).reduce((a, b) => a + b, 0);
  const parts = {};
  let distribue = 0;
  for (const id of ids) {
    const part = totalPoids > 0 ? Math.floor(cagnotte * poids[id] / totalPoids) : 0;
    parts[id] = { poids: poids[id], pourcentage: totalPoids > 0 ? poids[id] / totalPoids * 100 : 0, part };
    distribue += part;
  }
  return { parts, totalPoids, distribue, reste: Math.max(0, Math.round(cagnotte) - distribue) };
}

// ------------------------------------------------------------
// CAISSE — billetage
// ------------------------------------------------------------
export const COUPURES = [10000, 5000, 2000, 1000, 500, 100, 50, 25, 10, 5];

export function totalBilletage(billetage = {}) {
  return COUPURES.reduce((s, c) => s + c * (Number(billetage[c]) || 0), 0);
}

// Pénalité sur une somme gardée non rapportée.
// regle = { valeur, type: "pourcent" | "fixe", base: "manque" | "garde" }
export function penaliteGarde(montantGarde, montantRapporte, regle = {}) {
  const manque = Math.max(0, Number(montantGarde) - Number(montantRapporte));
  if (manque === 0 || !Number(regle.valeur)) return 0;
  if (regle.type === "fixe") return Math.round(Number(regle.valeur));
  const base = regle.base === "garde" ? Number(montantGarde) : manque;
  return Math.round(base * Number(regle.valeur) / 100);
}
