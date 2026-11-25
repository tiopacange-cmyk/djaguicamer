import { supabase } from "./supabaseClient";
import { totalBilletage, penaliteGarde } from "./calculsBancaires";

// ============================================================
// CAISSE DE SÉANCE
// À chaque séance : fond d'ouverture + sommes gardées rapportées
// + toutes les entrées/sorties en espèces du jour = caisse attendue.
// On compte les billets (billetage), on justifie l'écart, puis on
// répartit l'argent : dépôt en banque, trésorier, gardiens.
// ============================================================

const especes = (mode) => !mode || ["especes", "espèces", "Espèces"].includes(mode);
const num = (v) => Number(v || 0);
// Date du jour à l'heure locale (un horodatage UTC peut changer de jour).
const dateLocale = (horodatage) => {
  const d = new Date(horodatage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const REGLE_GARDE_DEFAUT = { valeur: 10, type: "pourcent", base: "manque" };

export async function fetchReglesGroupe(groupId) {
  const { data, error } = await supabase.rpc("djangui_regles_groupe", { gid: groupId });
  if (error) throw error;
  const r = data || {};
  return { ...r, garde: { ...REGLE_GARDE_DEFAUT, ...(r.garde || {}) } };
}

export async function sauverReglesGroupe(groupId, regles) {
  const { error } = await supabase.rpc("djangui_sauver_regles_groupe", { gid: groupId, regles });
  if (error) throw error;
}

// ---------- Séances de caisse ----------
const versSeance = (s) => s && ({
  id: s.id, date: s.date, statut: s.statut, fondOuverture: num(s.fond_ouverture), gardeesRecuperees: num(s.gardees_recuperees),
  theorique: s.theorique === null ? null : num(s.theorique), compte: s.compte === null ? null : num(s.compte), ecart: s.ecart === null ? null : num(s.ecart),
  ecartMotif: s.ecart_motif, ecartValidePar: s.ecart_valide_par, billetage: s.billetage || {}, depotBanque: num(s.depot_banque),
  gardeTresorier: num(s.garde_tresorier), secondComptagePar: s.second_comptage_par, cloturePar: s.cloture_par, clotureLe: s.cloture_le,
  reouvertureMotif: s.reouverture_motif, autres: s.autres || [],
});

export async function fetchSeancesCaisse(groupId) {
  const { data, error } = await supabase.from("caisse_seances").select("*").eq("group_id", groupId).order("date", { ascending: false });
  if (error) throw error;
  return data.map(versSeance);
}

// Ouvre la caisse d'une date. Le fond d'ouverture = ce que le
// trésorier a gardé à la séance précédente.
export async function ouvrirSeanceCaisse(groupId, date, { fondOuverture } = {}) {
  const { data: existante } = await supabase.from("caisse_seances").select("*").eq("group_id", groupId).eq("date", date).maybeSingle();
  if (existante) return versSeance(existante);
  let fond = fondOuverture;
  if (fond === undefined || fond === null) {
    const { data: prec } = await supabase.from("caisse_seances").select("garde_tresorier").eq("group_id", groupId).lt("date", date)
      .order("date", { ascending: false }).limit(1).maybeSingle();
    fond = num(prec?.garde_tresorier);
  }
  const { data, error } = await supabase.from("caisse_seances").insert({ group_id: groupId, date, fond_ouverture: fond }).select().single();
  if (error) throw error;
  return versSeance(data);
}

// Réouverture : les sommes confiées à la clôture sont retirées (elles
// seront ressaisies à la nouvelle clôture). Impossible si l'une a déjà
// été rapportée.
export async function reouvrirSeanceCaisse(seance, { motif, par }) {
  const { data: g, error: e1 } = await supabase.from("sommes_gardees").select("id, statut").eq("caisse_seance_id", seance.id);
  if (e1) throw e1;
  if ((g || []).some((x) => x.statut !== "gardee")) throw new Error("Une somme confiée à cette séance a déjà été rapportée : la caisse ne peut plus être rouverte.");
  if ((g || []).length) {
    const { error: e2 } = await supabase.from("sommes_gardees").delete().eq("caisse_seance_id", seance.id).eq("statut", "gardee");
    if (e2) throw e2;
  }
  await majSeanceCaisse(seance.id, { statut: "ouverte", reouverture_motif: `${motif} (${par || "—"}, ${new Date().toLocaleDateString("fr-FR")})` });
  return { gardesRetirees: (g || []).length };
}

export async function majSeanceCaisse(id, champs) {
  const { error } = await supabase.from("caisse_seances").update(champs).eq("id", id);
  if (error) throw error;
}

// ---------- Mouvements en espèces du jour ----------
// Renvoie [{ origine, libelle, montant (+ entrée / − sortie) }]
export async function fetchMouvementsEspecesDuJour(groupId, date) {
  const lignes = [];
  const push = (origine, libelle, montant) => { if (montant) lignes.push({ origine, libelle, montant: Math.round(montant) }); };

  // Noms des membres
  const { data: mbs } = await supabase.from("group_members").select("id, profile:profiles ( nom_complet )").eq("group_id", groupId);
  const nom = Object.fromEntries((mbs || []).map((m) => [m.id, m.profile?.nom_complet || "—"]));

  // Tontine : cotisations reçues et cagnotte versée
  const { data: tontines } = await supabase.from("tontines").select("id").eq("group_id", groupId);
  const tIds = (tontines || []).map((t) => t.id);
  if (tIds.length) {
    const { data: tours } = await supabase.from("tontine_tours").select("id, numero, montant, montant_enchere, verse_le, beneficiaire_id, tontine_id").in("tontine_id", tIds);
    const tourIds = (tours || []).map((t) => t.id);
    if (tourIds.length) {
      const { data: cot } = await supabase.from("tontine_cotisations").select("montant, membre_id, mode_paiement").in("tour_id", tourIds).eq("date_paiement", date);
      const tot = (cot || []).filter((c) => especes(c.mode_paiement)).reduce((s, c) => s + num(c.montant), 0);
      push("tontine", `Cotisations tontine (${(cot || []).filter((c) => especes(c.mode_paiement)).length})`, tot);
    }
    for (const t of tours || []) {
      if (t.verse_le && dateLocale(t.verse_le) === date) push("tontine", `Tontine versée à ${nom[t.beneficiaire_id] || "—"} (tour ${t.numero})`, -(num(t.montant) - num(t.montant_enchere)));
    }
  }

  // Épargnes
  const { data: eps } = await supabase.from("epargnes").select("id, nom").eq("group_id", groupId);
  const eIds = (eps || []).map((e) => e.id);
  if (eIds.length) {
    const { data: mv } = await supabase.from("epargne_mouvements").select("type, montant, membre_id, pret_id, mode_paiement, annule")
      .in("epargne_id", eIds).eq("date_mouvement", date).eq("annule", false);
    let vers = 0, nbV = 0, retr = 0, nbR = 0;
    for (const m of mv || []) {
      if (!especes(m.mode_paiement)) continue;
      if (m.type === "Versement") { vers += num(m.montant); nbV++; }
      else if (m.type === "Retrait" && !m.pret_id) { retr += num(m.montant); nbR++; }
      else if (m.type === "Prêt") push("pret", `Prêt décaissé — ${nom[m.membre_id] || "—"}`, -num(m.montant));
    }
    push("epargne", `Versements d'épargne (${nbV})`, vers);
    push("epargne", `Retraits d'épargne (${nbR})`, -retr);
  }

  // Remboursements de prêts en espèces
  const { data: remb } = await supabase.from("pret_remboursements").select("montant, source, annule").eq("group_id", groupId).eq("date", date).eq("annule", false);
  push("pret", "Remboursements de prêts (espèces)", (remb || []).filter((r) => r.source === "especes").reduce((s, r) => s + num(r.montant), 0));

  // Compte de la réunion : frais de dossier encaissés, sorties décidées
  const { data: cr } = await supabase.from("compte_reunion_mouvements").select("montant, origine, libelle, mode_paiement, annule").eq("group_id", groupId).eq("date", date).eq("annule", false);
  for (const c of cr || []) {
    if (!especes(c.mode_paiement)) continue;
    if (c.origine === "frais_dossier") push("compte_reunion", "Frais de dossier", num(c.montant));
    else if (c.origine === "depense" || c.origine === "autre") push("compte_reunion", c.libelle || "Compte de la réunion", num(c.montant));
  }

  // Assurance
  const { data: ass } = await supabase.from("assurance_mouvements").select("type, montant, mode_paiement").eq("group_id", groupId).eq("date_mouvement", date);
  push("assurance", "Cotisations assurance", (ass || []).filter((a) => a.type === "Cotisation" && especes(a.mode_paiement)).reduce((s, a) => s + num(a.montant), 0));

  // Fonds
  const { data: tf } = await supabase.from("types_fonds").select("id").eq("group_id", groupId);
  const fIds = (tf || []).map((f) => f.id);
  if (fIds.length) {
    const { data: fm } = await supabase.from("fonds_mouvements").select("montant, mode_paiement").in("type_fonds_id", fIds).eq("date_mouvement", date);
    push("fonds", "Cotisations aux fonds", (fm || []).filter((f) => num(f.montant) > 0 && especes(f.mode_paiement)).reduce((s, f) => s + num(f.montant), 0));
  }

  // Amendes payées en espèces
  const { data: am } = await supabase.from("caisse_amendes_mouvements").select("montant, mode_paiement").eq("group_id", groupId).eq("date_mouvement", date);
  push("amendes", "Amendes payées en espèces", (am || []).filter((a) => especes(a.mode_paiement)).reduce((s, a) => s + num(a.montant), 0));

  // Rafraîchissement : le reliquat reste en caisse
  const { data: rf } = await supabase.from("rafraichissements").select("reliquat").eq("group_id", groupId).eq("date_rafraichissement", date);
  push("rafraichissement", "Reliquat du rafraîchissement", (rf || []).reduce((s, r) => s + num(r.reliquat), 0));

  // Dépenses payées depuis une caisse en espèces
  const { data: dep } = await supabase.from("depenses").select("montant, motif, source_type, mode_paiement").eq("group_id", groupId).eq("date_depense", date);
  for (const d of dep || []) {
    // (une dépense payée sur une épargne est déjà comptée dans les retraits)
    if (["caisse_amendes", "caisse_rafraichissement"].includes(d.source_type) && especes(d.mode_paiement)) {
      push("depense", `Dépense${d.motif ? ` — ${d.motif}` : ""}`, -num(d.montant));
    }
  }

  // Banque externe : un dépôt sort de la caisse, un retrait y entre
  const { data: be } = await supabase.from("mouvements_bancaires_externes").select("type, montant").eq("group_id", groupId).eq("date_mouvement", date);
  push("banque_externe", "Dépôts à la banque", -(be || []).filter((b) => b.type === "Dépôt").reduce((s, b) => s + num(b.montant), 0));
  push("banque_externe", "Retraits de la banque", (be || []).filter((b) => b.type === "Retrait").reduce((s, b) => s + num(b.montant), 0));

  // Dettes remboursées en espèces ce jour
  const { data: dr } = await supabase.from("dettes").select("paiements").eq("group_id", groupId);
  const dettesDuJour = (dr || []).flatMap((d) => d.paiements || []).filter((p) => p.date === date && especes(p.mode));
  push("dettes", "Dettes remboursées", dettesDuJour.reduce((s, p) => s + num(p.montant), 0));

  return lignes;
}

// ---------- Sommes gardées ----------
export async function fetchSommesGardees(groupId, { ouvertesSeulement = false } = {}) {
  let q = supabase.from("sommes_gardees").select("*, membre:group_members ( id, profile:profiles ( nom_complet, telephone ) ), seance:caisse_seances!sommes_gardees_caisse_seance_id_fkey ( date )")
    .eq("group_id", groupId).order("created_at", { ascending: false });
  if (ouvertesSeulement) q = q.eq("statut", "gardee");
  const { data, error } = await q;
  if (error) throw error;
  return data.map((g) => ({
    id: g.id, seanceId: g.caisse_seance_id, dateGarde: g.seance?.date, membreId: g.membre?.id, nom: g.membre?.profile?.nom_complet || "—",
    telephone: g.membre?.profile?.telephone || "", montant: num(g.montant), aRapporterLe: g.a_rapporter_le, rapporte: g.rapporte === null ? null : num(g.rapporte),
    statut: g.statut, traitement: g.traitement, penalite: num(g.penalite), motif: g.motif, recupereLe: g.recupere_le,
  }));
}

// Enregistre le retour d'une somme gardée, avec le traitement du manque.
// traitement : "dette" | "epargne" | "fonds" | "aucun"
export async function recupererSommeGardee(groupId, garde, { rapporte, date, seanceId, motif, traitement, sourceId, regle, saisiPar }) {
  const r = Math.round(num(rapporte));
  const manque = Math.max(0, garde.montant - r);
  const penalite = manque > 0 ? penaliteGarde(garde.montant, r, regle) : 0;
  const statut = manque === 0 ? "rendue" : r === 0 ? "non_rendue" : "partielle";
  const { error } = await supabase.from("sommes_gardees").update({
    rapporte: r, statut, traitement: manque ? traitement : null, penalite, motif: motif || null, recupere_le: date, recupere_dans: seanceId,
  }).eq("id", garde.id);
  if (error) throw error;

  if (manque > 0) {
    if (traitement === "dette") {
      const { error: e } = await supabase.from("dettes").insert({
        group_id: groupId, membre_id: garde.membreId, origine: "garde", ref_id: garde.id, montant: manque + penalite, penalite,
        libelle: `Somme gardée non rapportée (${manque.toLocaleString("fr-FR")} F${penalite ? ` + pénalité ${penalite.toLocaleString("fr-FR")} F` : ""})`,
        motif, saisi_par: saisiPar || null,
      });
      if (e) throw e;
    } else if (traitement === "epargne" || traitement === "fonds") {
      // Le manque est couvert par ses avoirs : on prélève, et la pénalité
      // va au compte de la réunion.
      const total = manque + penalite;
      if (traitement === "epargne") {
        const { data: ep, error: e1 } = await supabase.from("epargnes").select("solde").eq("id", sourceId).single();
        if (e1) throw e1;
        const solde = num(ep.solde) - total;
        const { error: e2 } = await supabase.from("epargne_mouvements").insert({ epargne_id: sourceId, membre_id: garde.membreId, type: "Retrait", montant: total, date_mouvement: date, solde_apres: solde, saisi_par: saisiPar || null, mode_paiement: "prelevement" });
        if (e2) throw e2;
        const { error: e3 } = await supabase.from("epargnes").update({ solde }).eq("id", sourceId);
        if (e3) throw e3;
      } else {
        const { data: f, error: e1 } = await supabase.from("fonds_membres").select("solde").eq("membre_id", garde.membreId).eq("type_fonds_id", sourceId).single();
        if (e1) throw e1;
        if (num(f.solde) < total) throw new Error("Solde du fonds insuffisant.");
        const { error: e2 } = await supabase.from("fonds_membres").update({ solde: num(f.solde) - total }).eq("membre_id", garde.membreId).eq("type_fonds_id", sourceId);
        if (e2) throw e2;
        const { error: e3 } = await supabase.from("fonds_mouvements").insert({ membre_id: garde.membreId, type_fonds_id: sourceId, montant: -total, date_mouvement: date, mode_paiement: "prelevement" });
        if (e3) throw e3;
      }
      if (penalite > 0) {
        const { error: e4 } = await supabase.from("compte_reunion_mouvements").insert({ group_id: groupId, date, montant: penalite, origine: "penalite_garde", libelle: `Pénalité somme gardée — ${garde.nom}`, ref_id: garde.id, saisi_par: saisiPar || null, mode_paiement: "prelevement" });
        if (e4) throw e4;
      }
    }
  }
  return { manque, penalite, statut };
}

// À la fermeture : l'argent restant est confié à des gardiens.
export async function confierSommes(groupId, seanceId, gardiens, aRapporterLe) {
  const lignes = gardiens.filter((g) => g.membreId && num(g.montant) > 0).map((g) => ({
    group_id: groupId, caisse_seance_id: seanceId, membre_id: g.membreId, montant: Math.round(num(g.montant)), a_rapporter_le: aRapporterLe || null,
  }));
  if (!lignes.length) return;
  const { error } = await supabase.from("sommes_gardees").insert(lignes);
  if (error) throw error;
}

// ---------- Dettes ----------
export async function fetchDettes(groupId) {
  const { data, error } = await supabase.from("dettes").select("*, membre:group_members ( id, profile:profiles ( nom_complet, telephone ) )")
    .eq("group_id", groupId).order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((d) => ({
    id: d.id, membreId: d.membre?.id, nom: d.membre?.profile?.nom_complet || "—", telephone: d.membre?.profile?.telephone || "",
    origine: d.origine, libelle: d.libelle, montant: num(d.montant), rembourse: num(d.rembourse), penalite: num(d.penalite),
    reste: Math.max(0, num(d.montant) - num(d.rembourse)), statut: d.statut, motif: d.motif, paiements: d.paiements || [], creeLe: d.created_at,
  }));
}

export async function payerDette(groupId, dette, { montant, date, mode = "especes", saisiPar }) {
  const m = Math.round(num(montant));
  if (!date) throw new Error("Date invalide (jj/mm/aaaa).");
  if (m <= 0 || m > dette.reste) throw new Error(`Montant invalide (reste dû : ${dette.reste.toLocaleString("fr-FR")} F).`);
  const rembourse = dette.rembourse + m;
  const solde = rembourse >= dette.montant;
  const { error } = await supabase.from("dettes").update({
    rembourse, statut: solde ? "soldee" : "ouverte", paiements: [...dette.paiements, { date, montant: m, mode, par: saisiPar || null }],
  }).eq("id", dette.id);
  if (error) throw error;
  // La pénalité rejoint le compte de la réunion une fois la dette soldée.
  if (solde && dette.penalite > 0) {
    const { error: e } = await supabase.from("compte_reunion_mouvements").insert({ group_id: groupId, date, montant: dette.penalite, origine: "penalite_garde", libelle: `Pénalité — ${dette.nom}`, ref_id: dette.id, saisi_par: saisiPar || null });
    if (e) throw e;
  }
}

// ---------- Prêts en retard d'un membre (alerte gardien) ----------
export async function fetchMembresEnRetard(groupId) {
  const { data: eps } = await supabase.from("epargnes").select("id").eq("group_id", groupId);
  const ids = (eps || []).map((e) => e.id);
  if (!ids.length) return new Set();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from("prets").select("membre_id, date_fin, statut").in("epargne_id", ids).eq("statut", "en cours").lt("date_fin", today);
  return new Set((data || []).map((p) => p.membre_id));
}

export { totalBilletage };
