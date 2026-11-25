import { supabase } from "./supabaseClient";
import { enregistrerCotisationsTontine } from "./tontine";
import { enregistrerCotisationsEpargne } from "./banque";
import { enregistrerCotisationsAssurance } from "./assurance";
import { enregistrerVersementFonds } from "./fonds";
import { envoyerSMS } from "./sms";

// ============================================================
// DEUX LECTURES AVANT VALIDATION
// Une saisie de cotisations reste « en attente » : rien ne touche
// aux soldes et aucun SMS ne part. Deux personnes différentes la
// relisent ligne par ligne. On valide seulement quand les deux
// totaux sont identiques. Tout est signé (qui, quand).
// ============================================================

export const RUBRIQUES = { tontine: "Tontine", epargne: "Banque (épargne)", assurance: "Assurance", fonds: "Fonds" };
export const LECTURES_DEFAUT = { tontine: true, epargne: true, assurance: true, fonds: true };

const num = (v) => Math.round(Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0);

const versOp = (o) => ({
  id: o.id, rubrique: o.rubrique, date: o.date, titre: o.titre, parametres: o.parametres || {}, lignes: o.lignes || [], total: Number(o.total || 0),
  saisiPar: o.saisi_par, creeLe: o.created_at, statut: o.statut, valideLe: o.valide_le,
  lecture1: o.lecture1_par ? { par: o.lecture1_par, le: o.lecture1_le, total: Number(o.lecture1_total) } : null,
  lecture2: o.lecture2_par ? { par: o.lecture2_par, le: o.lecture2_le, total: Number(o.lecture2_total) } : null,
});

export async function soumettreOperation(groupId, { rubrique, date, titre, parametres, lignes, saisiPar }) {
  const propres = lignes.map((l) => ({ membreId: l.membreId, nom: l.nom, telephone: l.telephone || "", montant: num(l.montant) })).filter((l) => l.montant > 0);
  if (!propres.length) throw new Error("Saisis au moins un montant.");
  const total = propres.reduce((s, l) => s + l.montant, 0);
  const { data, error } = await supabase.from("operations_en_attente").insert({
    group_id: groupId, rubrique, date, titre, parametres, lignes: propres, total, saisi_par: saisiPar || null, statut: "saisie",
  }).select().single();
  if (error) throw error;
  return versOp(data);
}

export async function fetchOperationsEnAttente(groupId) {
  const { data, error } = await supabase.from("operations_en_attente").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  return data.map(versOp);
}

// numero = 1 ou 2 ; lignes = lignes relues (montant éventuellement corrigé)
export async function enregistrerLecture(op, numero, { par, lignes }) {
  const total = lignes.reduce((s, l) => s + num(l.montant), 0);
  let champs = numero === 1
    ? { lecture1_par: par, lecture1_le: new Date().toISOString(), lecture1_total: total, statut: "lecture1" }
    : { lecture2_par: par, lecture2_le: new Date().toISOString(), lecture2_total: total, statut: "lecture2" };
  // La 2e lecture a corrigé un montant : les totaux ne peuvent plus
  // correspondre, on repart sur une 1re lecture (corrections visibles).
  if (numero === 2 && op.lecture1 && total !== op.lecture1.total) {
    champs = { lecture1_par: null, lecture1_le: null, lecture1_total: null, lecture2_par: null, lecture2_le: null, lecture2_total: null, statut: "saisie" };
  }
  const { error } = await supabase.from("operations_en_attente").update({ ...champs, lignes, total }).eq("id", op.id);
  if (error) throw error;
  return { relire: champs.statut === "saisie" && numero === 2 };
}

export async function abandonnerOperation(op, { motif, par }) {
  const { error } = await supabase.from("operations_en_attente").update({
    statut: "abandonnee", parametres: { ...op.parametres, abandon: { motif, par, le: new Date().toISOString() } },
  }).eq("id", op.id);
  if (error) throw error;
}

// Exécute vraiment l'opération (soldes + SMS) après les deux lectures.
export async function validerOperation(groupId, op, { nomGroupe } = {}) {
  if (!op.lecture1 || !op.lecture2) throw new Error("Les deux lectures sont obligatoires.");
  if (op.lecture1.par === op.lecture2.par) throw new Error("Les deux lectures doivent être faites par deux personnes différentes.");
  const total = op.lignes.reduce((s, l) => s + num(l.montant), 0);
  if (op.lecture1.total !== op.lecture2.total || op.lecture2.total !== total) throw new Error("Les totaux des deux lectures ne sont pas identiques.");

  const lignes = op.lignes.filter((l) => num(l.montant) > 0).map((l) => ({ membreId: l.membreId, montant: num(l.montant), date: op.date }));
  const p = op.parametres || {};
  let soldes = {};
  if (op.rubrique === "tontine") await enregistrerCotisationsTontine(p.tourId, lignes);
  else if (op.rubrique === "epargne") await enregistrerCotisationsEpargne(p.epargneId, lignes);
  else if (op.rubrique === "assurance") soldes = (await enregistrerCotisationsAssurance(groupId, lignes, p.soldeMinimum || 0)) || {};
  else if (op.rubrique === "fonds") {
    for (const l of lignes) soldes[l.membreId] = await enregistrerVersementFonds(l.membreId, p.typeFondsId, l.montant, op.date);
  } else throw new Error("Rubrique inconnue.");

  const { error } = await supabase.from("operations_en_attente").update({ statut: "validee", valide_le: new Date().toISOString() }).eq("id", op.id);
  if (error) throw error;

  // SMS seulement maintenant que c'est validé
  const libelle = p.libelle || RUBRIQUES[op.rubrique];
  for (const l of op.lignes) {
    if (!l.telephone || !num(l.montant)) continue;
    const solde = soldes[l.membreId];
    envoyerSMS({
      message: `Bonjour ${l.nom}, ${nomGroupe ? `${nomGroupe} : ` : ""}${libelle} de ${num(l.montant).toLocaleString("fr-FR")} FCFA enregistrée le ${op.date.split("-").reverse().join("/")}.${solde !== undefined && solde !== null ? ` Solde : ${Number(solde).toLocaleString("fr-FR")} FCFA.` : ""}`,
      numeros: [l.telephone], groupId,
    });
  }
}

// Contrôles : membres oubliés et montants inhabituels.
export function controlesLecture(op, membresActifs) {
  const presents = new Set(op.lignes.map((l) => l.membreId));
  const oublies = membresActifs.filter((m) => !presents.has(m.id));
  const montants = op.lignes.map((l) => num(l.montant)).filter((x) => x > 0).sort((a, b) => a - b);
  const mediane = montants.length ? montants[Math.floor(montants.length / 2)] : 0;
  const frequences = montants.reduce((f, x) => ({ ...f, [x]: (f[x] || 0) + 1 }), {});
  const habituel = Number(Object.entries(frequences).sort((a, b) => b[1] - a[1])[0]?.[0] || 0);
  const inhabituels = op.lignes.filter((l) => {
    const m = num(l.montant);
    if (!m || !mediane) return false;
    return m >= mediane * 3 || m * 3 <= mediane || (habituel && frequences[habituel] >= 3 && m !== habituel && Math.abs(m - habituel) / habituel >= 0.5);
  });
  return { oublies, inhabituels, mediane, habituel };
}

// Nombre en toutes lettres (pour la lecture à voix haute, en français).
export function enLettres(n) {
  n = Math.round(n);
  if (n === 0) return "zéro";
  const u = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
  const dz = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];
  const moinsDeCent = (x) => {
    if (x < 17) return u[x];
    if (x < 20) return "dix-" + u[x - 10];
    const d = Math.floor(x / 10), r = x % 10;
    if (d === 7 || d === 9) return dz[d] + (d === 7 && r === 1 ? " et " : "-") + moinsDeCent(10 + r);
    if (r === 0) return dz[d] + (d === 8 ? "s" : "");
    return dz[d] + (r === 1 && d !== 8 ? " et un" : "-" + u[r]);
  };
  const moinsDeMille = (x) => {
    const c = Math.floor(x / 100), r = x % 100;
    const tete = c === 0 ? "" : c === 1 ? "cent" : u[c] + " cent" + (r === 0 ? "s" : "");
    return [tete, r ? moinsDeCent(r) : ""].filter(Boolean).join(" ");
  };
  const parts = [];
  const millions = Math.floor(n / 1e6), milliers = Math.floor((n % 1e6) / 1000), reste = n % 1000;
  if (millions) parts.push(millions === 1 ? "un million" : moinsDeMille(millions) + " millions");
  if (milliers) parts.push(milliers === 1 ? "mille" : moinsDeMille(milliers).replace(/(cent|vingt)s$/, "$1") + " mille");
  if (reste) parts.push(moinsDeMille(reste));
  return parts.join(" ");
}
