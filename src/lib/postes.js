import { supabase } from "./supabaseClient";

// ============================================================
// POSTES DU BUREAU ET DROITS
// Pour chaque module, un niveau : aucun < lire < saisir < valider.
// « valider » comprend « saisir », qui comprend « lire ».
// Chaque groupe peut créer ses propres postes en plus des postes
// proposés, et ajuster les droits de chacun.
// ============================================================

export const NIVEAUX = [
  { cle: "aucun", libelle: "Pas d'accès", court: "—", rang: 0 },
  { cle: "lire", libelle: "Consulter", court: "lire", rang: 1 },
  { cle: "saisir", libelle: "Saisir", court: "saisir", rang: 2 },
  { cle: "valider", libelle: "Valider / tout", court: "valider", rang: 3 },
];
export const RANG = Object.fromEntries(NIVEAUX.map((n) => [n.cle, n.rang]));

// vue = écran du menu concerné (null : droit utilisé à l'intérieur d'un écran)
export const MODULES = [
  { cle: "seances", libelle: "Séances", aide: "Présences, compte rendu, amendes de séance", vue: "seances" },
  { cle: "tontine", libelle: "Tontine", aide: "Cotisations, cagnotte, enchères", vue: "tontine" },
  { cle: "banque", libelle: "Banque — cotisations", aide: "Épargnes, règles, versements", vue: "banque" },
  { cle: "credits", libelle: "Banque — crédits", aide: "Saisir = préparer un prêt (en attente) · Valider = l'accorder", vue: null },
  { cle: "caisse", libelle: "Caisse de séance", aide: "Comptage, sommes gardées, dettes", vue: "caisse" },
  { cle: "lectures", libelle: "Lectures", aide: "Saisir = faire une lecture · Valider = valider la saisie", vue: "lectures" },
  { cle: "assurance", libelle: "Assurance", aide: "Cotisations, événements", vue: "assurance" },
  { cle: "fonds", libelle: "Fonds", aide: "Versements aux fonds", vue: "fonds" },
  { cle: "depenses", libelle: "Dépenses et rafraîchissements", aide: "", vue: "depenses" },
  { cle: "depots", libelle: "Dépôt / Retrait externe", aide: "Comptes en banque", vue: "depots" },
  { cle: "bilan", libelle: "Bilan et rapports", aide: "Valider = exporter", vue: "bilan" },
  { cle: "annulations", libelle: "Annuler une erreur de saisie", aide: "Valider = annuler avec motif", vue: null },
  { cle: "clotures", libelle: "Clôture d'épargne / de cycle", aide: "Saisir = préparer le calcul · Valider = clôturer", vue: null },
  { cle: "membres", libelle: "Membres", aide: "Saisir = inviter, modifier · Valider = supprimer, mots de passe", vue: "membres" },
  { cle: "sms", libelle: "SMS et rappels", aide: "", vue: "sms" },
  { cle: "postes", libelle: "Postes et droits", aide: "Valider = attribuer les postes et changer les droits", vue: "postes" },
];

const d = (s) => {
  if (s.length !== MODULES.length) throw new Error(`Droits proposés : ${s.length} lettres pour ${MODULES.length} modules.`);
  return Object.fromEntries(MODULES.map((m, i) => [m.cle, { v: "valider", s: "saisir", l: "lire", "-": "aucun" }[s[i]]]));
};
// Ordre des lettres = ordre de MODULES :
//                                         séa ton ban cré cai lec ass fon dép dpt bil ann clô mem sms pos
export const POSTES_PROPOSES = [
  { modele: "president", nom: "Président", ordre: 1, droits: d("vvvvvvvvvvvvvvvv") },
  { modele: "vice_president", nom: "Vice-président", ordre: 2, droits: d("vvvvvvvvvvv--sv-") },
  { modele: "secretaire", nom: "Secrétaire général", ordre: 3, droits: d("vll-lssll-l--ss-") },
  { modele: "tresorier", nom: "Trésorier", ordre: 4, droits: d("lsssslsssslssls-") },
  { modele: "comptable", nom: "Comptable", ordre: 5, droits: d("llllllllslvslll-") },
  { modele: "commissaire", nom: "Commissaire aux comptes", ordre: 6, droits: d("lllllsllllvvvll-") },
  { modele: "censeur", nom: "Censeur", ordre: 7, droits: d("sl--------l-----") },
];

export const niveauDe = (droits, module) => RANG[droits?.[module] || "aucun"] || 0;
export const peut = (droits, module, niveau = "lire") => niveauDe(droits, module) >= RANG[niveau];
export const TOUS_LES_DROITS = Object.fromEntries(MODULES.map((m) => [m.cle, "valider"]));

// Droits effectifs d'un membre du bureau.
// Président, ou ancien administrateur sans poste : tous les droits.
export function droitsEffectifs(monMembre, postes) {
  if (!monMembre) return {};
  if (monMembre.is_president) return TOUS_LES_DROITS;
  if (!monMembre.poste_id) return monMembre.is_admin ? TOUS_LES_DROITS : {};
  const poste = postes.find((p) => p.id === monMembre.poste_id);
  return poste ? poste.droits : {};
}

const versPoste = (p) => ({ id: p.id, nom: p.nom, droits: { ...Object.fromEntries(MODULES.map((m) => [m.cle, "aucun"])), ...(p.droits || {}) }, ordre: p.ordre ?? 100, modele: p.modele || null, description: p.description || "" });

// Postes du groupe. La première fois, crée les postes proposés ; les
// anciens postes sans droits reçoivent ceux du poste proposé de même nom.
export async function fetchPostes(groupId, { creerSiVide = false } = {}) {
  const { data, error } = await supabase.from("postes_bureau").select("*").eq("group_id", groupId).order("ordre", { ascending: true }).order("nom", { ascending: true });
  if (error) throw error;
  let postes = data || [];
  if (creerSiVide) {
    const manquants = POSTES_PROPOSES.filter((pp) => !postes.some((p) => p.modele === pp.modele || p.nom.toLowerCase() === pp.nom.toLowerCase()));
    const sansDroits = postes.filter((p) => !p.droits || Object.keys(p.droits).length === 0);
    if (postes.length === 0 && manquants.length) {
      const { error: e1 } = await supabase.from("postes_bureau").insert(manquants.map((pp) => ({ group_id: groupId, nom: pp.nom, droits: pp.droits, ordre: pp.ordre, modele: pp.modele })));
      if (e1) throw e1;
    }
    for (const p of sansDroits) {
      const pp = POSTES_PROPOSES.find((x) => x.nom.toLowerCase() === p.nom.toLowerCase());
      const { error: e2 } = await supabase.from("postes_bureau").update({ droits: pp ? pp.droits : Object.fromEntries(MODULES.map((m) => [m.cle, "lire"])), ordre: pp ? pp.ordre : 50, modele: pp ? pp.modele : null }).eq("id", p.id);
      if (e2) throw e2;
    }
    if ((postes.length === 0 && manquants.length) || sansDroits.length) return fetchPostes(groupId);
  }
  return postes.map(versPoste);
}

export async function creerPoste(groupId, { nom, droits, description }) {
  const { data, error } = await supabase.from("postes_bureau").insert({ group_id: groupId, nom: nom.trim(), droits, ordre: 50, description: description || null }).select().single();
  if (error) throw error;
  return versPoste(data);
}

export async function modifierPoste(id, { nom, droits, description }) {
  const champs = {};
  if (nom !== undefined) champs.nom = nom.trim();
  if (droits !== undefined) champs.droits = droits;
  if (description !== undefined) champs.description = description || null;
  const { error } = await supabase.from("postes_bureau").update(champs).eq("id", id);
  if (error) throw error;
}

export async function supprimerPoste(id) {
  const { error } = await supabase.from("postes_bureau").delete().eq("id", id);
  if (error) throw error;
}

// Attribue (ou retire, posteId = null) un poste à un membre. L'accès à
// l'espace bureau suit le poste.
export async function attribuerPoste(groupMemberId, posteId) {
  const { error } = await supabase.rpc("djangui_attribuer_poste", { membre: groupMemberId, poste: posteId || null });
  if (error) {
    if (/djangui_attribuer_poste/.test(error.message || "") && /(not find|does not exist|n'existe)/i.test(error.message || "")) {
      throw new Error("La base n'est pas à jour : exécute le script 2026-11-postes-bureau.sql dans Supabase.");
    }
    throw new Error(error.message);
  }
}
