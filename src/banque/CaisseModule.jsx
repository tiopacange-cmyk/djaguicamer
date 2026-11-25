import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Lock, Unlock, Printer, AlertTriangle, HandCoins, Wallet } from "lucide-react";
import {
  fetchSeancesCaisse, ouvrirSeanceCaisse, majSeanceCaisse, fetchMouvementsEspecesDuJour, fetchSommesGardees, recupererSommeGardee,
  confierSommes, fetchDettes, payerDette, reouvrirSeanceCaisse, fetchMembresEnRetard, fetchReglesGroupe, sauverReglesGroupe,
} from "../lib/caisse";
import { fetchAvoirsMembre } from "../lib/banque2";
import { RUBRIQUES, LECTURES_DEFAUT } from "../lib/lectures";
import { COUPURES, totalBilletage, penaliteGarde } from "../lib/calculsBancaires";
import { envoyerSMS } from "../lib/sms";
import { ChampDate, versDateISO, versDateFr, dateDuJour } from "../ui/ChampDate";
import { useConfirmation, fmtF } from "../ui/Confirmation";
import { Fenetre, Champ, Pastille, Message, Choix, ChampMontant, nombre } from "./communs";

const TON_STATUT = { ouverte: "or", cloturee: "vert" };

export default function CaisseModule({ groupId, nomGroupe, membres, utilisateur }) {
  const [onglet, setOnglet] = useState("seances");
  const [seances, setSeances] = useState([]);
  const [gardees, setGardees] = useState([]);
  const [dettes, setDettes] = useState([]);
  const [regles, setRegles] = useState(null);
  const [date, setDate] = useState(dateDuJour());
  const [ouverte, setOuverte] = useState(null);
  const [erreur, setErreur] = useState("");
  const [paiementDette, setPaiementDette] = useState(null);
  const { executer } = useConfirmation();

  const recharger = async () => {
    try {
      const [s, g, d, r] = await Promise.all([fetchSeancesCaisse(groupId), fetchSommesGardees(groupId), fetchDettes(groupId), fetchReglesGroupe(groupId)]);
      setSeances(s); setGardees(g); setDettes(d); setRegles(r); setErreur("");
    } catch (e) {
      console.error(e);
      setErreur("Impossible de charger la caisse. Vérifie que la mise à jour de la base (script SQL) a bien été faite.");
    }
  };
  useEffect(() => { if (groupId) recharger(); }, [groupId]);

  const ouvrir = async () => {
    const d = versDateISO(date);
    if (!d) { setErreur("Date invalide (jj/mm/aaaa)."); return; }
    const existe = seances.find((s) => s.date === d);
    if (existe) { setOuverte(existe); return; }
    const res = await executer({ titre: "Ouvrir la caisse de cette séance ?", lignes: [["Date", versDateFr(d)]], libelleConfirmer: "Ouvrir", detailSucces: `Caisse du ${versDateFr(d)} ouverte` },
      () => ouvrirSeanceCaisse(groupId, d));
    if (res) { await recharger(); setOuverte(res); }
  };

  const ecarts = seances.filter((s) => s.statut === "cloturee").slice(0, 4).filter((s) => s.ecart);
  const gardeesOuvertes = gardees.filter((g) => g.statut === "gardee");
  const dettesOuvertes = dettes.filter((d) => d.statut !== "soldee");

  return (
    <>
      <div className="adm-entete">
        <div>
          <h1 className="adm-titre">Caisse de séance</h1>
          <p className="adm-sous-titre">À chaque séance : on récupère les sommes gardées, on compte les billets, on justifie l'écart, puis on confie le reste.</p>
        </div>
      </div>
      <Message>{erreur}</Message>
      {ecarts.length >= 2 && <Message ton="attente"><AlertTriangle size={15} aria-hidden="true" /> {ecarts.length} des 4 dernières séances ont eu un écart de caisse. Vérifiez les saisies et le comptage.</Message>}

      <div className="bq-onglets" role="tablist">
        {[{ k: "seances", l: "Séances" }, { k: "gardees", l: `Sommes gardées (${gardeesOuvertes.length})` }, { k: "dettes", l: `Dettes (${dettesOuvertes.length})` }, { k: "reglages", l: "Réglages" }].map((o) => (
          <button key={o.k} type="button" role="tab" aria-selected={onglet === o.k} className={`bq-onglet${onglet === o.k ? " est-actif" : ""}`} onClick={() => setOnglet(o.k)}>{o.l}</button>
        ))}
      </div>

      {onglet === "seances" && (
        <>
          <div className="bq-resume">
            <div className="bq-ligne-champs bq-sans-marge">
              <ChampDate ariaLabel="Date de la séance" value={date} onChange={(e) => setDate(e.target.value)} />
              <button type="button" className="adm-btn adm-btn-action" onClick={ouvrir}><Wallet size={15} aria-hidden="true" /> Ouvrir la caisse du jour</button>
            </div>
            {gardeesOuvertes.length > 0 && <span><b className="num">{fmtF(gardeesOuvertes.reduce((s, g) => s + g.montant, 0))}</b> gardés par {gardeesOuvertes.length} membre(s) : à récupérer en premier.</span>}
          </div>
          <div className="bq-table-cadre">
            <table className="bq-table">
              <thead><tr><th>Séance</th><th className="d">Attendu</th><th className="d">Compté</th><th className="d">Écart</th><th>Statut</th><th></th></tr></thead>
              <tbody>{seances.map((s) => (
                <tr key={s.id}>
                  <td>{versDateFr(s.date)}</td><td className="d num">{s.theorique !== null ? fmtF(s.theorique) : "—"}</td><td className="d num">{s.compte !== null ? fmtF(s.compte) : "—"}</td>
                  <td className="d num">{s.ecart ? <span className="bq-rouge-texte">{s.ecart > 0 ? "+" : "−"} {fmtF(Math.abs(s.ecart))}</span> : s.compte !== null ? "0 F" : "—"}</td>
                  <td><Pastille ton={TON_STATUT[s.statut]}>{s.statut === "cloturee" ? "Clôturée" : "Ouverte"}</Pastille></td>
                  <td className="d"><button type="button" className="adm-btn-ligne" onClick={() => setOuverte(s)}>{s.statut === "cloturee" ? "Voir le PV" : "Continuer"}</button></td>
                </tr>
              ))}</tbody>
            </table>
            {seances.length === 0 && <div className="adm-vide">Aucune caisse de séance pour l'instant.</div>}
          </div>
        </>
      )}

      {onglet === "gardees" && (
        <div className="bq-table-cadre">
          <table className="bq-table">
            <thead><tr><th>Gardien</th><th>Confié le</th><th className="d">Montant</th><th className="d">Rapporté</th><th>Statut</th><th>Traitement</th></tr></thead>
            <tbody>{gardees.map((g) => (
              <tr key={g.id}>
                <td>{g.nom}</td><td className="m">{g.dateGarde ? versDateFr(g.dateGarde) : "—"}</td><td className="d num">{fmtF(g.montant)}</td>
                <td className="d num">{g.rapporte !== null ? fmtF(g.rapporte) : "—"}</td>
                <td><Pastille ton={{ gardee: "or", rendue: "vert", partielle: "rouge", non_rendue: "rouge" }[g.statut]}>{{ gardee: "Gardée", rendue: "Rendue", partielle: "Partielle", non_rendue: "Non rendue" }[g.statut]}</Pastille></td>
                <td className="m">{g.traitement ? `${{ dette: "Dette", epargne: "Prélevé épargne", fonds: "Prélevé fonds", aucun: "Aucun" }[g.traitement]}${g.penalite ? ` · pénalité ${fmtF(g.penalite)}` : ""}` : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
          {gardees.length === 0 && <div className="adm-vide">Aucune somme gardée.</div>}
        </div>
      )}

      {onglet === "dettes" && (
        <div className="bq-table-cadre">
          <table className="bq-table">
            <thead><tr><th>Membre</th><th>Origine</th><th className="d">Montant</th><th className="d">Reste</th><th>Statut</th><th></th></tr></thead>
            <tbody>{dettes.map((d) => (
              <tr key={d.id}>
                <td>{d.nom}</td><td className="m">{d.libelle || d.origine}</td><td className="d num">{fmtF(d.montant)}</td><td className="d num"><b>{fmtF(d.reste)}</b></td>
                <td><Pastille ton={d.statut === "soldee" ? "vert" : "rouge"}>{d.statut === "soldee" ? "Soldée" : "Ouverte"}</Pastille></td>
                <td className="d">{d.statut !== "soldee" && <button type="button" className="adm-btn-ligne" onClick={() => setPaiementDette(d)}><HandCoins size={14} aria-hidden="true" /> Encaisser</button>}</td>
              </tr>
            ))}</tbody>
          </table>
          {dettes.length === 0 && <div className="adm-vide">Aucune dette.</div>}
        </div>
      )}

      {onglet === "reglages" && regles && <Reglages groupId={groupId} regles={regles} onFait={recharger} />}

      {ouverte && (
        <SeanceCaisse seance={seances.find((s) => s.id === ouverte.id) || ouverte} groupId={groupId} nomGroupe={nomGroupe} membres={membres} utilisateur={utilisateur}
          gardees={gardeesOuvertes.filter((g) => g.seanceId !== ouverte.id)} regles={regles} historique={seances}
          onFermer={() => setOuverte(null)} onMaj={recharger} />
      )}
      {paiementDette && <PaiementDette dette={paiementDette} groupId={groupId} utilisateur={utilisateur} onFermer={() => setPaiementDette(null)} onFait={() => { setPaiementDette(null); recharger(); }} />}
    </>
  );
}

// ------------------------------------------------------------
// RÉGLAGES : pénalité sur une somme gardée non rapportée
// ------------------------------------------------------------
function Reglages({ groupId, regles, onFait }) {
  const { executer } = useConfirmation();
  const [g, setG] = useState(regles.garde);
  const [lectures, setLectures] = useState({ ...LECTURES_DEFAUT, ...(regles.lectures || {}) });
  const exemple = penaliteGarde(200000, 150000, g);
  const enregistrerLectures = async () => {
    const res = await executer({ titre: "Enregistrer le réglage des lectures ?", lignes: Object.entries(RUBRIQUES).map(([k, l]) => [l, lectures[k] ? "deux lectures" : "validation directe"]) },
      () => sauverReglesGroupe(groupId, { ...regles, lectures }));
    if (res) onFait();
  };
  const enregistrer = async () => {
    const res = await executer({ titre: "Enregistrer la règle ?", lignes: [["Pénalité", g.type === "fixe" ? fmtF(g.valeur) : `${g.valeur} % ${g.base === "garde" ? "de la somme confiée" : "du montant manquant"}`], ["Exemple", `200 000 confiés, 150 000 rapportés → ${fmtF(exemple)}`]] },
      () => sauverReglesGroupe(groupId, { ...regles, garde: { ...g, valeur: Number(g.valeur) || 0 } }));
    if (res) onFait();
  };
  return (
    <div className="bq-carte bq-carte-reglage">
      <h3 className="bq-section">Somme gardée non rapportée</h3>
      <div className="bq-trois">
        <Champ label="Pénalité"><input className="adm-input" inputMode="decimal" value={g.valeur} onChange={(e) => setG((x) => ({ ...x, valeur: e.target.value.replace(",", ".") }))} /></Champ>
        <Champ label="Type"><select className="adm-input" value={g.type} onChange={(e) => setG((x) => ({ ...x, type: e.target.value }))}><option value="pourcent">%</option><option value="fixe">F (fixe)</option></select></Champ>
        <Champ label="Calculée sur"><select className="adm-input" value={g.base} disabled={g.type === "fixe"} onChange={(e) => setG((x) => ({ ...x, base: e.target.value }))}><option value="manque">le montant manquant</option><option value="garde">la somme confiée</option></select></Champ>
      </div>
      <div className="adm-msg adm-msg-info">Exemple : 200 000 F confiés, 150 000 F rapportés → manque 50 000 F, pénalité <b>{fmtF(exemple)}</b> (compte de la réunion).</div>
      <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={enregistrer}>Enregistrer</button>

      <h3 className="bq-section">Deux lectures avant validation</h3>
      <div className="adm-aide">Les cotisations cochées restent en attente jusqu'à ce que deux personnes différentes (Commissaire aux comptes, Secrétaire…) les aient relues.</div>
      {Object.entries(RUBRIQUES).map(([k, l]) => (
        <label key={k} className="bq-case"><input type="checkbox" checked={!!lectures[k]} onChange={(e) => setLectures((x) => ({ ...x, [k]: e.target.checked }))} /> {l}</label>
      ))}
      <button type="button" className="adm-btn adm-btn-secondaire bq-plein" onClick={enregistrerLectures}>Enregistrer le réglage des lectures</button>
    </div>
  );
}

// ------------------------------------------------------------
// LA CAISSE D'UNE SÉANCE
// ------------------------------------------------------------
function SeanceCaisse({ seance, groupId, nomGroupe, membres, utilisateur, gardees, regles, historique, onFermer, onMaj }) {
  const { executer } = useConfirmation();
  const close = seance.statut === "cloturee";
  const [lignes, setLignes] = useState(null);
  const [fond, setFond] = useState(String(seance.fondOuverture || ""));
  const [autres, setAutres] = useState(seance.autres || []);
  const [billets, setBillets] = useState(seance.billetage || {});
  const [motif, setMotif] = useState(seance.ecartMotif || "");
  const [validePar, setValidePar] = useState(seance.ecartValidePar || "");
  const [second, setSecond] = useState(seance.secondComptagePar || "");
  const [depot, setDepot] = useState(seance.depotBanque ? String(seance.depotBanque) : "");
  const [tresorier, setTresorier] = useState(seance.gardeTresorier ? String(seance.gardeTresorier) : "");
  const [gardiens, setGardiens] = useState([]);
  const [rapporterLe, setRapporterLe] = useState("");
  const [enRetard, setEnRetard] = useState(new Set());
  const [erreur, setErreur] = useState("");
  const [motifReouverture, setMotifReouverture] = useState("");
  const [rendues, setRendues] = useState([]);

  useEffect(() => {
    fetchMouvementsEspecesDuJour(groupId, seance.date).then(setLignes).catch((e) => { console.error(e); setLignes([]); });
    fetchMembresEnRetard(groupId).then(setEnRetard).catch(() => {});
    fetchSommesGardees(groupId).then((g) => setRendues(g.filter((x) => x.statut !== "gardee" && x.recupereLe === seance.date))).catch(() => {});
  }, [seance.id, seance.statut]);

  const recuperees = rendues.reduce((s, g) => s + (g.rapporte || 0), 0);
  const totalAutres = autres.reduce((s, a) => s + (a.sens === "sortie" ? -1 : 1) * nombre(a.montant), 0);
  const totalJour = (lignes || []).reduce((s, l) => s + l.montant, 0);
  const attendu = nombre(fond) + recuperees + totalJour + totalAutres;
  const compte = totalBilletage(billets);
  const aCompte = Object.values(billets).some((v) => Number(v) > 0);
  const ecart = compte - attendu;
  const totalGardiens = gardiens.reduce((s, g) => s + nombre(g.montant), 0);
  const reparti = nombre(depot) + nombre(tresorier) + totalGardiens;
  const bloque = gardees.length > 0 && !close;

  const enregistrerBrouillon = () => majSeanceCaisse(seance.id, {
    fond_ouverture: nombre(fond), autres: autres.map((a) => ({ libelle: a.libelle, sens: a.sens, montant: nombre(a.montant) })), billetage: billets,
  }).catch((e) => console.error(e));

  const cloturer = async () => {
    setErreur("");
    if (bloque) { setErreur("Récupère d'abord toutes les sommes gardées."); return; }
    if (!aCompte) { setErreur("Le comptage des billets est obligatoire."); return; }
    if (autres.some((a) => !a.libelle.trim() || !nombre(a.montant))) { setErreur("Chaque autre entrée/sortie doit avoir un libellé et un montant."); return; }
    if (!second.trim()) { setErreur("Indique qui a refait le comptage (second comptage)."); return; }
    if (ecart !== 0 && (!motif.trim() || !validePar.trim())) { setErreur("Écart de caisse : le motif et la validation du Président sont obligatoires."); return; }
    if (reparti !== compte) { setErreur(`La répartition (${fmtF(reparti)}) doit être égale à l'argent compté (${fmtF(compte)}).`); return; }
    if (gardiens.some((g) => nombre(g.montant) > 0 && !g.membreId)) { setErreur("Choisis le membre pour chaque somme gardée."); return; }
    const gardiensOk = gardiens.filter((g) => g.membreId && nombre(g.montant) > 0);
    const res = await executer({
      titre: `Clôturer la caisse du ${versDateFr(seance.date)} ?`,
      lignes: [["Caisse attendue", fmtF(attendu)], ["Argent compté", fmtF(compte)], ecart ? ["Écart", `${ecart > 0 ? "+" : "−"} ${fmtF(Math.abs(ecart))} — ${motif}`] : ["Écart", "aucun"],
        ["Second comptage", second], depot ? ["Déposé en banque", fmtF(nombre(depot))] : null, tresorier ? ["Gardé par le trésorier", fmtF(nombre(tresorier))] : null,
        ...gardiensOk.map((g) => [`Confié à ${membres.find((m) => m.id === g.membreId)?.nom}`, fmtF(nombre(g.montant))])].filter(Boolean),
      alertes: [gardiensOk.some((g) => enRetard.has(g.membreId)) ? "Un gardien a un prêt en retard." : null, "Après clôture, la caisse est verrouillée (réouverture avec motif seulement)."],
      libelleConfirmer: "Clôturer la caisse", detailSucces: "Caisse clôturée et verrouillée",
    }, async () => {
      await majSeanceCaisse(seance.id, {
        fond_ouverture: nombre(fond), gardees_recuperees: recuperees, theorique: attendu, compte, ecart, ecart_motif: ecart ? motif.trim() : null,
        ecart_valide_par: ecart ? validePar.trim() : null, billetage: billets, depot_banque: nombre(depot), garde_tresorier: nombre(tresorier),
        second_comptage_par: second.trim(), cloture_par: utilisateur || null, cloture_le: new Date().toISOString(), statut: "cloturee",
        autres: autres.map((a) => ({ libelle: a.libelle, sens: a.sens, montant: nombre(a.montant) })),
      });
      await confierSommes(groupId, seance.id, gardiensOk, versDateISO(rapporterLe));
      for (const g of gardiensOk) {
        const m = membres.find((x) => x.id === g.membreId);
        if (m?.telephone) envoyerSMS({ message: `Bonjour ${m.nom}, ${nomGroupe} vous confie ${nombre(g.montant).toLocaleString("fr-FR")} FCFA (séance du ${versDateFr(seance.date)}). À rapporter${rapporterLe ? ` le ${rapporterLe}` : " à la prochaine séance"}, sans intérêt.`, numeros: [m.telephone], groupId });
      }
    });
    if (res) onMaj();
  };

  const rouvrir = async () => {
    setErreur("");
    if (!motifReouverture.trim()) { setErreur("Le motif de réouverture est obligatoire."); return; }
    const res = await executer({ titre: "Rouvrir cette caisse ?", lignes: [["Séance", versDateFr(seance.date)], ["Motif", motifReouverture]], danger: true, libelleConfirmer: "Rouvrir",
      alertes: ["Les sommes confiées aux gardiens à cette séance seront retirées : il faudra les ressaisir à la nouvelle clôture."] },
      () => reouvrirSeanceCaisse(seance, { motif: motifReouverture.trim(), par: utilisateur }));
    if (res) onMaj();
  };

  return (
    <Fenetre titre={`Caisse — séance du ${versDateFr(seance.date)}`} onFermer={() => { if (!close) enregistrerBrouillon(); onFermer(); }} large
      badge={<Pastille ton={TON_STATUT[seance.statut]}>{close ? "Clôturée" : "Ouverte"}</Pastille>}>
      {seance.reouvertureMotif && <Message ton="attente">Rouverte : {seance.reouvertureMotif}</Message>}

      <div className="bq-etape"><span className="bq-num">1</span> Sommes gardées à récupérer {gardees.length > 0 && <Pastille ton="rouge">obligatoire</Pastille>}</div>
      {gardees.length === 0 && rendues.length === 0 && <div className="adm-aide">Aucune somme gardée en attente.</div>}
      {gardees.map((g) => <RetourGarde key={g.id} garde={g} groupId={groupId} seance={seance} regle={regles?.garde} utilisateur={utilisateur} onFait={() => { onMaj(); fetchSommesGardees(groupId).then((x) => setRendues(x.filter((y) => y.statut !== "gardee" && y.recupereLe === seance.date))); }} />)}
      {rendues.length > 0 && (
        <table className="bq-table"><tbody>{rendues.map((g) => (
          <tr key={g.id}><td>{g.nom}</td><td className="d num">{fmtF(g.rapporte)} / {fmtF(g.montant)}</td><td><Pastille ton={g.statut === "rendue" ? "vert" : "rouge"}>{g.statut === "rendue" ? "Rendue" : "Manque"}</Pastille></td></tr>
        ))}</tbody></table>
      )}

      <fieldset className="bq-fieldset" disabled={bloque || close}>
        {bloque && <Message ton="attente">Récupère d'abord les sommes gardées : aucune autre étape n'est possible avant.</Message>}
        <div className="bq-etape"><span className="bq-num">2</span> Caisse attendue</div>
        <table className="bq-table">
          <tbody>
            <tr><td>Fond d'ouverture (gardé par le trésorier)</td><td className="d"><ChampMontant valeur={fond} onChange={setFond} ariaLabel="Fond d'ouverture" /></td></tr>
            {recuperees > 0 && <tr><td>Sommes gardées rapportées</td><td className="d num">+ {fmtF(recuperees)}</td></tr>}
            {lignes === null && <tr><td colSpan={2} className="m">Calcul des mouvements du jour…</td></tr>}
            {(lignes || []).map((l, i) => <tr key={i}><td>{l.libelle}</td><td className={`d num${l.montant < 0 ? " bq-rouge-texte" : ""}`}>{l.montant >= 0 ? "+" : "−"} {fmtF(Math.abs(l.montant))}</td></tr>)}
            {autres.map((a, i) => (
              <tr key={`a${i}`}>
                <td><div className="bq-ligne-champs bq-sans-marge">
                  <select className="adm-input" aria-label="Sens" value={a.sens} onChange={(e) => setAutres((x) => x.map((y, j) => j === i ? { ...y, sens: e.target.value } : y))}><option value="entree">Entrée</option><option value="sortie">Sortie</option></select>
                  <input className="adm-input" placeholder="Libellé (obligatoire)" aria-label="Libellé" value={a.libelle} onChange={(e) => setAutres((x) => x.map((y, j) => j === i ? { ...y, libelle: e.target.value } : y))} />
                  <button type="button" className="adm-btn-ligne-danger" aria-label="Retirer" onClick={() => setAutres((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden="true" /></button>
                </div></td>
                <td className="d"><ChampMontant valeur={a.montant} onChange={(v) => setAutres((x) => x.map((y, j) => j === i ? { ...y, montant: v } : y))} ariaLabel="Montant" /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td><b>Caisse attendue</b></td><td className="d num"><b>{fmtF(attendu)}</b></td></tr></tfoot>
        </table>
        {!close && <button type="button" className="adm-btn-ligne" onClick={() => setAutres((x) => [...x, { sens: "entree", libelle: "", montant: "" }])}><Plus size={14} aria-hidden="true" /> Autre entrée ou sortie (justifiée)</button>}
        <div className="adm-aide">Seules les opérations payées en espèces comptent. Le Mobile Money et les prélèvements ne passent pas par la caisse.</div>

        <div className="bq-etape"><span className="bq-num">3</span> Comptage des billets (billetage)</div>
        <div className="bq-billetage">
          {COUPURES.map((c) => (
            <label key={c} className="bq-coupure">
              <span className="num">{c.toLocaleString("fr-FR")}</span>
              <input className="adm-input" inputMode="numeric" aria-label={`Nombre de ${c} F`} value={billets[c] || ""} onChange={(e) => setBillets((b) => ({ ...b, [c]: e.target.value.replace(/\D/g, "") }))} />
              <span className="m num">{fmtF(c * (Number(billets[c]) || 0))}</span>
            </label>
          ))}
        </div>
        <div className="bq-kpi bq-kpi-3">
          <div><span>Attendu</span><b className="num">{fmtF(attendu)}</b></div>
          <div><span>Compté</span><b className="num">{fmtF(compte)}</b></div>
          <div className={aCompte && ecart !== 0 ? "bq-kpi-alerte" : ""}><span>Écart</span><b className="num">{aCompte ? `${ecart > 0 ? "+" : ecart < 0 ? "−" : ""} ${fmtF(Math.abs(ecart))}` : "—"}</b></div>
        </div>
        {aCompte && ecart === 0 && <div className="adm-msg adm-msg-succes">La caisse est juste.</div>}
        {aCompte && ecart !== 0 && (
          <div className="bq-deux">
            <Champ label="Motif de l'écart (obligatoire)"><input className="adm-input" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex. Erreur de rendu de monnaie" /></Champ>
            <Champ label="Validé par le Président"><input className="adm-input" value={validePar} onChange={(e) => setValidePar(e.target.value)} placeholder="Nom du Président" /></Champ>
          </div>
        )}
        <Champ label="Second comptage fait par (Commissaire aux comptes)"><input className="adm-input" value={second} onChange={(e) => setSecond(e.target.value)} placeholder="Nom de la personne qui a recompté" /></Champ>

        <div className="bq-etape"><span className="bq-num">4</span> Où va l'argent compté ?</div>
        <div className="bq-deux">
          <Champ label="Déposé à la banque"><ChampMontant valeur={depot} onChange={setDepot} ariaLabel="Déposé à la banque" /></Champ>
          <Champ label="Gardé par le trésorier (fond de la prochaine séance)"><ChampMontant valeur={tresorier} onChange={setTresorier} ariaLabel="Gardé par le trésorier" /></Champ>
        </div>
        {!close && (
          <>
            <div className="adm-label">Confié à des membres (sans intérêt, à rapporter en début de prochaine séance)</div>
            {gardiens.map((g, i) => (
              <div key={i}>
                <div className="bq-ligne-champs">
                  <select className="adm-input" aria-label="Gardien" value={g.membreId} onChange={(e) => setGardiens((x) => x.map((y, j) => j === i ? { ...y, membreId: e.target.value } : y))}>
                    <option value="">Choisir un membre</option>
                    {membres.map((m) => <option key={m.id} value={m.id}>{m.nom}{enRetard.has(m.id) ? " ⚠ prêt en retard" : ""}</option>)}
                  </select>
                  <ChampMontant valeur={g.montant} onChange={(v) => setGardiens((x) => x.map((y, j) => j === i ? { ...y, montant: v } : y))} ariaLabel="Montant confié" />
                  <button type="button" className="adm-btn-ligne-danger" aria-label="Retirer" onClick={() => setGardiens((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden="true" /></button>
                </div>
                {enRetard.has(g.membreId) && <Message ton="attente">Ce membre a un prêt en retard.</Message>}
              </div>
            ))}
            <div className="bq-ligne-champs">
              <button type="button" className="adm-btn-ligne" onClick={() => setGardiens((x) => [...x, { membreId: "", montant: String(Math.max(0, compte - reparti) || "") }])}><Plus size={14} aria-hidden="true" /> Confier à un membre</button>
              {gardiens.length > 0 && <ChampDate aujourdhuiParDefaut={false} ariaLabel="À rapporter le" placeholder="À rapporter le (jj/mm/aaaa)" value={rapporterLe} onChange={(e) => setRapporterLe(e.target.value)} />}
            </div>
          </>
        )}
        {aCompte && <div className={`adm-msg ${reparti === compte ? "adm-msg-succes" : "adm-msg-attente"}`}>Réparti : {fmtF(reparti)} sur {fmtF(compte)}{reparti !== compte ? ` — reste ${fmtF(compte - reparti)} à répartir` : " ✓"}</div>}
      </fieldset>

      <Message>{erreur}</Message>
      {!close && <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={cloturer} disabled={bloque}><Lock size={15} aria-hidden="true" /> Clôturer et verrouiller la caisse</button>}
      {close && (
        <>
          <div className="adm-msg adm-msg-succes">Clôturée par {seance.cloturePar || "—"} le {seance.clotureLe ? new Date(seance.clotureLe).toLocaleString("fr-FR") : "—"} · second comptage : {seance.secondComptagePar || "—"}{seance.ecart ? ` · écart ${fmtF(seance.ecart)} (${seance.ecartMotif}, validé par ${seance.ecartValidePar})` : ""}</div>
          <div className="bq-deux">
            <button type="button" className="adm-btn adm-btn-secondaire" onClick={() => window.print()}><Printer size={15} aria-hidden="true" /> Imprimer le PV</button>
            <div className="bq-ligne-champs bq-sans-marge">
              <input className="adm-input" placeholder="Motif de réouverture" aria-label="Motif de réouverture" value={motifReouverture} onChange={(e) => setMotifReouverture(e.target.value)} />
              <button type="button" className="adm-btn adm-btn-secondaire" onClick={rouvrir}><Unlock size={15} aria-hidden="true" /> Rouvrir</button>
            </div>
          </div>
          <PvCaisse seance={seance} nomGroupe={nomGroupe} lignes={lignes || []} recuperees={recuperees} />
        </>
      )}
    </Fenetre>
  );
}

function RetourGarde({ garde, groupId, seance, regle, utilisateur, onFait }) {
  const { executer } = useConfirmation();
  const [rapporte, setRapporte] = useState(String(garde.montant));
  const [motif, setMotif] = useState("");
  const [traitement, setTraitement] = useState("dette");
  const [avoirs, setAvoirs] = useState(null);
  const [sourceId, setSourceId] = useState("");
  const [erreur, setErreur] = useState("");
  const r = nombre(rapporte);
  const manque = Math.max(0, garde.montant - r);
  const penalite = manque ? penaliteGarde(garde.montant, r, regle) : 0;
  useEffect(() => { if (manque && !avoirs) fetchAvoirsMembre(groupId, garde.membreId).then(setAvoirs).catch(() => setAvoirs({ epargnes: [], fonds: [] })); }, [manque]);
  const sources = traitement === "epargne" ? (avoirs?.epargnes || []) : traitement === "fonds" ? (avoirs?.fonds || []) : [];

  const valider = async () => {
    setErreur("");
    if (r > garde.montant) { setErreur("Le montant rapporté dépasse la somme confiée."); return; }
    if (manque && !motif.trim()) { setErreur("Motif obligatoire quand il manque de l'argent."); return; }
    if (manque && ["epargne", "fonds"].includes(traitement) && !sourceId) { setErreur("Choisis où prélever."); return; }
    const res = await executer({
      titre: "Enregistrer ce retour ?",
      lignes: [["Gardien", garde.nom], ["Confié", fmtF(garde.montant)], ["Rapporté", fmtF(r)], manque ? ["Manque", fmtF(manque)] : null, penalite ? ["Pénalité", fmtF(penalite)] : null,
        manque ? ["Traitement", { dette: "Dette à rembourser", epargne: "Prélevé sur son épargne", fonds: "Prélevé sur son fonds" }[traitement]] : null].filter(Boolean),
      detailSucces: manque ? `Manque de ${fmtF(manque)} traité` : "Somme récupérée",
    }, () => recupererSommeGardee(groupId, garde, { rapporte: r, date: seance.date, seanceId: seance.id, motif: motif.trim(), traitement, sourceId, regle, saisiPar: utilisateur }));
    if (res) onFait();
  };

  return (
    <div className="bq-garde">
      <div className="bq-ligne-champs">
        <span className="bq-garde-nom"><b>{garde.nom}</b> · confié le {garde.dateGarde ? versDateFr(garde.dateGarde) : "—"} : <b className="num">{fmtF(garde.montant)}</b></span>
        <ChampMontant valeur={rapporte} onChange={setRapporte} ariaLabel={`Rapporté par ${garde.nom}`} />
        <button type="button" className="adm-btn adm-btn-action" onClick={valider}>Récupérer</button>
      </div>
      {manque > 0 && (
        <>
          <Message ton="attente">Manque {fmtF(manque)}{penalite ? ` · pénalité ${fmtF(penalite)}` : ""}.</Message>
          <div className="bq-deux">
            <Champ label="Motif (obligatoire)"><input className="adm-input" value={motif} onChange={(e) => setMotif(e.target.value)} /></Champ>
            <Champ label="Traitement"><Choix nom="Traitement" valeur={traitement} onChange={(v) => { setTraitement(v); setSourceId(""); }} options={[{ valeur: "dette", libelle: "Dette" }, { valeur: "epargne", libelle: "Son épargne" }, { valeur: "fonds", libelle: "Son fonds" }]} /></Champ>
          </div>
          {sources.length > 0 && (
            <select className="adm-input" aria-label="Prélever sur" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Prélever sur…</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.nom} ({fmtF(s.solde)})</option>)}
            </select>
          )}
        </>
      )}
      <Message>{erreur}</Message>
    </div>
  );
}

function PaiementDette({ dette, groupId, utilisateur, onFermer, onFait }) {
  const { executer } = useConfirmation();
  const [montant, setMontant] = useState(String(dette.reste));
  const [date, setDate] = useState(dateDuJour());
  const [mode, setMode] = useState("especes");
  const [erreur, setErreur] = useState("");
  const valider = async () => {
    const d = versDateISO(date);
    setErreur("");
    if (!d) { setErreur("Date invalide (jj/mm/aaaa)."); return; }
    if (!nombre(montant) || nombre(montant) > dette.reste) { setErreur(`Montant invalide (reste dû : ${fmtF(dette.reste)}).`); return; }
    const res = await executer({ titre: "Encaisser ce remboursement ?", lignes: [["Membre", dette.nom], ["Montant", fmtF(nombre(montant))], ["Reste après", fmtF(dette.reste - nombre(montant))]] },
      () => payerDette(groupId, dette, { montant: nombre(montant), date: d, mode, saisiPar: utilisateur }));
    if (res) onFait();
  };
  return (
    <Fenetre titre={`Dette — ${dette.nom}`} onFermer={onFermer}>
      <p className="adm-sous-titre">{dette.libelle} · reste dû <b>{fmtF(dette.reste)}</b></p>
      <div className="bq-deux">
        <Champ label="Montant"><ChampMontant valeur={montant} onChange={setMontant} ariaLabel="Montant" /></Champ>
        <Champ label="Date"><ChampDate ariaLabel="Date" value={date} onChange={(e) => setDate(e.target.value)} /></Champ>
      </div>
      <Choix nom="Mode" valeur={mode} onChange={setMode} options={[{ valeur: "especes", libelle: "Espèces" }, { valeur: "momo", libelle: "Mobile Money" }]} />
      <Message>{erreur}</Message>
      <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={valider}>Encaisser</button>
    </Fenetre>
  );
}

function PvCaisse({ seance, nomGroupe, lignes, recuperees }) {
  return (
    <div className="bq-releve" aria-hidden="true">
      <h2>{nomGroupe} — Procès-verbal de caisse</h2>
      <p>Séance du {versDateFr(seance.date)}</p>
      <table><tbody>
        <tr><td>Fond d'ouverture</td><td>{fmtF(seance.fondOuverture)}</td></tr>
        {recuperees > 0 && <tr><td>Sommes gardées rapportées</td><td>{fmtF(recuperees)}</td></tr>}
        {lignes.map((l, i) => <tr key={i}><td>{l.libelle}</td><td>{fmtF(l.montant)}</td></tr>)}
        {(seance.autres || []).map((a, i) => <tr key={`a${i}`}><td>{a.libelle}</td><td>{a.sens === "sortie" ? "−" : ""}{fmtF(a.montant)}</td></tr>)}
        <tr><td><b>Caisse attendue</b></td><td><b>{fmtF(seance.theorique)}</b></td></tr>
        <tr><td><b>Argent compté</b></td><td><b>{fmtF(seance.compte)}</b></td></tr>
        <tr><td>Écart</td><td>{fmtF(seance.ecart)}{seance.ecart ? ` — ${seance.ecartMotif} (validé par ${seance.ecartValidePar})` : ""}</td></tr>
      </tbody></table>
      <table><thead><tr><th>Coupure</th><th>Nombre</th><th>Montant</th></tr></thead><tbody>
        {COUPURES.filter((c) => Number(seance.billetage?.[c])).map((c) => <tr key={c}><td>{c.toLocaleString("fr-FR")}</td><td>{seance.billetage[c]}</td><td>{fmtF(c * Number(seance.billetage[c]))}</td></tr>)}
      </tbody></table>
      <p>Déposé en banque : {fmtF(seance.depotBanque)} · Gardé par le trésorier : {fmtF(seance.gardeTresorier)}</p>
      <p>Clôturé par {seance.cloturePar || "—"} · second comptage : {seance.secondComptagePar || "—"}</p>
      <p className="bq-releve-sign">Trésorier : ____________ &nbsp; Commissaire aux comptes : ____________ &nbsp; Président : ____________</p>
    </div>
  );
}
