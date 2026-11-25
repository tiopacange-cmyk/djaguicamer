import React, { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, Square, CheckCircle2, AlertTriangle, FileCheck2 } from "lucide-react";
import { fetchOperationsEnAttente, enregistrerLecture, validerOperation, abandonnerOperation, controlesLecture, enLettres, RUBRIQUES } from "../lib/lectures";
import { versDateFr } from "../ui/ChampDate";
import { useConfirmation, fmtF } from "../ui/Confirmation";
import { Fenetre, Champ, Pastille, Message, ChampMontant, nombre } from "./communs";

const ETAPE = { saisie: "1re lecture à faire", lecture1: "2e lecture à faire", lecture2: "Prête à valider", validee: "Validée", abandonnee: "Abandonnée" };
const TON = { saisie: "or", lecture1: "or", lecture2: "violet", validee: "vert", abandonnee: "neutre" };

export default function LecturesModule({ groupId, nomGroupe, membres, utilisateur, onChange }) {
  const [ops, setOps] = useState([]);
  const [ouverte, setOuverte] = useState(null);
  const [erreur, setErreur] = useState("");
  const recharger = async () => {
    try { const o = await fetchOperationsEnAttente(groupId); setOps(o); setErreur(""); onChange?.(o.filter((x) => !["validee", "abandonnee"].includes(x.statut)).length); }
    catch (e) { console.error(e); setErreur("Impossible de charger les lectures. Vérifie que la mise à jour de la base (script SQL) a bien été faite."); }
  };
  useEffect(() => { if (groupId) recharger(); }, [groupId]);
  const enCours = ops.filter((o) => !["validee", "abandonnee"].includes(o.statut));
  const finies = ops.filter((o) => ["validee", "abandonnee"].includes(o.statut));

  const ligne = (o) => (
    <tr key={o.id}>
      <td>{versDateFr(o.date)}</td><td>{o.titre}</td><td className="m">{RUBRIQUES[o.rubrique]}</td><td className="d num"><b>{fmtF(o.total)}</b></td>
      <td className="m">{o.saisiPar || "—"}</td><td><Pastille ton={TON[o.statut]}>{ETAPE[o.statut]}</Pastille></td>
      <td className="d"><button type="button" className="adm-btn-ligne" onClick={() => setOuverte(o)}>{["validee", "abandonnee"].includes(o.statut) ? "Voir" : "Ouvrir"}</button></td>
    </tr>
  );

  return (
    <>
      <div className="adm-entete">
        <div>
          <h1 className="adm-titre">Lectures à faire</h1>
          <p className="adm-sous-titre">Chaque saisie de cotisations est relue deux fois par deux personnes différentes avant de toucher aux soldes. Aucun SMS ne part avant la validation.</p>
        </div>
      </div>
      <Message>{erreur}</Message>
      <div className="bq-table-cadre">
        <table className="bq-table">
          <thead><tr><th>Date</th><th>Saisie</th><th>Rubrique</th><th className="d">Total</th><th>Saisi par</th><th>Étape</th><th></th></tr></thead>
          <tbody>{enCours.map(ligne)}</tbody>
        </table>
        {enCours.length === 0 && <div className="adm-vide">Rien à relire pour l'instant.</div>}
      </div>
      {finies.length > 0 && (
        <>
          <h2 className="bq-section">Déjà traitées</h2>
          <div className="bq-table-cadre"><table className="bq-table"><tbody>{finies.slice(0, 20).map(ligne)}</tbody></table></div>
        </>
      )}
      {ouverte && <Lecture op={ops.find((o) => o.id === ouverte.id) || ouverte} groupId={groupId} nomGroupe={nomGroupe} membres={membres} utilisateur={utilisateur}
        onFermer={() => setOuverte(null)} onMaj={recharger} />}
    </>
  );
}

function Lecture({ op, groupId, nomGroupe, membres, utilisateur, onFermer, onMaj }) {
  const { executer } = useConfirmation();
  const totauxEgaux = !!(op.lecture1 && op.lecture2 && op.lecture1.total === op.lecture2.total && op.lecture2.total === op.total);
  // 2e lecture à refaire si les totaux ne correspondent pas
  const numero = op.statut === "saisie" ? 1 : op.statut === "lecture1" || (op.statut === "lecture2" && !totauxEgaux) ? 2 : null;
  const fini = ["validee", "abandonnee"].includes(op.statut);
  const [lecteur, setLecteur] = useState("");
  const [lignes, setLignes] = useState(() => op.lignes.map((l) => ({ ...l, lu: false, corrige: l.corrige || null, montantLu: String(l.montant) })));
  const [voix, setVoix] = useState(-1);
  const [motifAbandon, setMotifAbandon] = useState("");
  const [erreur, setErreur] = useState("");
  const arret = useRef(false);
  const membresActifs = membres.filter((m) => m.statut !== "inactif");
  const controles = useMemo(() => controlesLecture(op, membresActifs), [op.id, membres.length]);
  const totalLu = lignes.reduce((s, l) => s + nombre(l.montantLu), 0);
  const tousLus = lignes.every((l) => l.lu);
  const lecteursPrecedents = numero === 2 && op.lecture1 ? [op.lecture1.par] : [];
  useEffect(() => () => { arret.current = true; window.speechSynthesis?.cancel(); }, []);

  const lireAVoixHaute = async () => {
    if (!("speechSynthesis" in window)) { setErreur("La lecture à voix haute n'est pas disponible sur cet appareil."); return; }
    if (voix >= 0) { arret.current = true; window.speechSynthesis.cancel(); setVoix(-1); return; }
    arret.current = false;
    for (let i = 0; i < lignes.length; i++) {
      if (arret.current) break;
      setVoix(i);
      await new Promise((res) => {
        const u = new SpeechSynthesisUtterance(`${lignes[i].nom}, ${enLettres(nombre(lignes[i].montantLu))} francs.`);
        u.lang = "fr-FR"; u.rate = 0.9; u.onend = res; u.onerror = res;
        window.speechSynthesis.speak(u);
      });
      setLignes((x) => x.map((y, j) => j === i ? { ...y, lu: true } : y));
    }
    if (!arret.current) {
      await new Promise((res) => { const u = new SpeechSynthesisUtterance(`Total : ${enLettres(totalLu)} francs.`); u.lang = "fr-FR"; u.onend = res; u.onerror = res; window.speechSynthesis.speak(u); });
    }
    setVoix(-1);
  };

  const terminer = async () => {
    setErreur("");
    if (!lecteur.trim()) { setErreur("Indique qui fait cette lecture."); return; }
    if (numero === 2 && lecteur.trim() === op.lecture1?.par) { setErreur("La 2e lecture doit être faite par une autre personne que la 1re."); return; }
    if (!tousLus) { setErreur("Coche chaque ligne une fois lue et vérifiée."); return; }
    const corrections = lignes.filter((l) => nombre(l.montantLu) !== l.montant);
    const res = await executer({
      titre: `Terminer la ${numero === 1 ? "1re" : "2e"} lecture ?`,
      lignes: [["Lecteur", lecteur.trim()], ["Lignes vérifiées", String(lignes.length)], ["Total lu", fmtF(totalLu)], ["Total saisi", fmtF(op.total)], corrections.length ? ["Corrections", String(corrections.length)] : null].filter(Boolean),
      alertes: [corrections.length ? `${corrections.length} montant(s) corrigé(s) : la correction reste visible.` : null, numero === 2 && corrections.length ? "Un montant a changé à la 2e lecture : il faudra refaire les deux lectures." : null],
      detailSucces: (r) => r?.relire ? "Montant corrigé : refaire les deux lectures" : numero === 1 ? "1re lecture enregistrée" : "2e lecture enregistrée",
    }, () => enregistrerLecture(op, numero, {
      par: lecteur.trim(),
      lignes: lignes.map((l) => {
        const lu = nombre(l.montantLu);
        const corrige = lu !== l.montant ? { de: l.montant, a: lu, par: lecteur.trim(), lecture: numero } : l.corrige;
        return { membreId: l.membreId, nom: l.nom, telephone: l.telephone, montant: lu, corrige, [`l${numero}`]: true, l1: numero === 1 ? true : l.l1 };
      }),
    }));
    if (res) { onMaj(); onFermer(); }
  };

  const valider = async () => {
    const res = await executer({
      titre: "Valider cette saisie ?",
      lignes: [["Saisie", op.titre], ["Saisi par", op.saisiPar || "—"], ["1re lecture", `${op.lecture1.par} · ${fmtF(op.lecture1.total)}`], ["2e lecture", `${op.lecture2.par} · ${fmtF(op.lecture2.total)}`], ["Total validé", fmtF(op.total)]],
      alertes: ["Les soldes vont être mis à jour et chaque membre recevra son SMS."],
      libelleConfirmer: "Valider", detailSucces: `${fmtF(op.total)} validés`,
    }, () => validerOperation(groupId, op, { nomGroupe }));
    if (res) { onMaj(); onFermer(); }
  };

  const abandonner = async () => {
    if (!motifAbandon.trim()) { setErreur("Le motif d'abandon est obligatoire."); return; }
    const res = await executer({ titre: "Abandonner cette saisie ?", lignes: [["Saisie", op.titre], ["Motif", motifAbandon]], danger: true, libelleConfirmer: "Abandonner", detailSucces: "Saisie abandonnée" },
      () => abandonnerOperation(op, { motif: motifAbandon.trim(), par: utilisateur }));
    if (res) { onMaj(); onFermer(); }
  };

  return (
    <Fenetre titre={op.titre} onFermer={onFermer} large badge={<Pastille ton={TON[op.statut]}>{ETAPE[op.statut]}</Pastille>}>
      <dl className="bq-fiche">
        <div><dt>Saisi par</dt><dd>{op.saisiPar || "—"}</dd></div>
        <div><dt>Le</dt><dd>{new Date(op.creeLe).toLocaleString("fr-FR")}</dd></div>
        <div><dt>1re lecture</dt><dd>{op.lecture1 ? `${op.lecture1.par} · ${fmtF(op.lecture1.total)}` : "—"}</dd></div>
        <div><dt>2e lecture</dt><dd>{op.lecture2 ? `${op.lecture2.par} · ${fmtF(op.lecture2.total)}` : "—"}</dd></div>
        {op.valideLe && <div><dt>Validée le</dt><dd>{new Date(op.valideLe).toLocaleString("fr-FR")}</dd></div>}
      </dl>

      {(controles.oublies.length > 0 || controles.inhabituels.length > 0) && !fini && (
        <div className="bq-controles">
          {controles.oublies.length > 0 && <Message ton="attente"><AlertTriangle size={15} aria-hidden="true" /> Sans montant (oubli ou retard ?) : {controles.oublies.map((m) => m.nom).join(", ")}</Message>}
          {controles.inhabituels.length > 0 && <Message ton="attente"><AlertTriangle size={15} aria-hidden="true" /> Montant inhabituel : {controles.inhabituels.map((l) => `${l.nom} (${fmtF(l.montant)})`).join(", ")} — montant habituel {fmtF(controles.habituel || controles.mediane)}</Message>}
        </div>
      )}

      {numero && (
        <div className="bq-deux">
          <Champ label={`Qui fait la ${numero === 1 ? "1re" : "2e"} lecture ? (Commissaire aux comptes ou Secrétaire)`}>
            <select className="adm-input" value={lecteur} onChange={(e) => setLecteur(e.target.value)}>
              <option value="">Choisir</option>
              {membresActifs.map((m) => <option key={m.id} value={m.nom} disabled={lecteursPrecedents.includes(m.nom)}>{m.nom}{lecteursPrecedents.includes(m.nom) ? " (a déjà lu)" : ""}</option>)}
            </select>
          </Champ>
          <Champ label="Lecture à voix haute"><button type="button" className="adm-btn adm-btn-secondaire" onClick={lireAVoixHaute}>{voix >= 0 ? <><Square size={15} aria-hidden="true" /> Arrêter</> : <><Volume2 size={15} aria-hidden="true" /> Lire chaque ligne à voix haute</>}</button></Champ>
        </div>
      )}

      <div className="bq-table-cadre">
        <table className="bq-table">
          <thead><tr>{numero && <th>Lu</th>}<th>Membre</th><th className="d">Saisi</th><th className="d">{numero ? "Montant lu" : "Montant"}</th><th>Correction</th></tr></thead>
          <tbody>{lignes.map((l, i) => (
            <tr key={l.membreId} className={voix === i ? "est-en-lecture" : ""}>
              {numero && <td><input type="checkbox" className="bq-coche" aria-label={`Ligne ${l.nom} lue`} checked={l.lu} onChange={(e) => setLignes((x) => x.map((y, j) => j === i ? { ...y, lu: e.target.checked } : y))} /></td>}
              <td>{l.nom}</td>
              <td className="d num m">{fmtF(l.montant)}</td>
              <td className="d">{numero ? <ChampMontant valeur={l.montantLu} onChange={(v) => setLignes((x) => x.map((y, j) => j === i ? { ...y, montantLu: v } : y))} ariaLabel={`Montant lu — ${l.nom}`} /> : <b className="num">{fmtF(l.montant)}</b>}</td>
              <td className="m">{nombre(l.montantLu) !== l.montant ? <Pastille ton="rouge">{fmtF(l.montant)} → {fmtF(nombre(l.montantLu))}</Pastille> : l.corrige ? <Pastille ton="or">corrigé ({fmtF(l.corrige.de)} → {fmtF(l.corrige.a)}, {l.corrige.par})</Pastille> : "—"}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr>{numero && <td></td>}<td><b>Total</b></td><td className="d num">{fmtF(op.total)}</td><td className="d num"><b>{fmtF(totalLu)}</b></td><td></td></tr></tfoot>
        </table>
      </div>

      <Message>{erreur}</Message>
      {numero && <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={terminer}><FileCheck2 size={15} aria-hidden="true" /> Terminer la {numero === 1 ? "1re" : "2e"} lecture</button>}
      {op.statut === "lecture2" && (
        totauxEgaux
          ? <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={valider}><CheckCircle2 size={15} aria-hidden="true" /> Valider ({fmtF(op.total)})</button>
          : <Message>Les totaux des deux lectures ne sont pas identiques : refaire la 2e lecture ou abandonner la saisie.</Message>
      )}
      {!fini && (
        <div className="bq-ligne-champs bq-abandon">
          <input className="adm-input" placeholder="Motif pour abandonner cette saisie" aria-label="Motif d'abandon" value={motifAbandon} onChange={(e) => setMotifAbandon(e.target.value)} />
          <button type="button" className="adm-btn adm-btn-secondaire" onClick={abandonner}>Abandonner</button>
        </div>
      )}
      {op.statut === "abandonnee" && op.parametres?.abandon && <Message ton="attente">Abandonnée par {op.parametres.abandon.par || "—"} : {op.parametres.abandon.motif}</Message>}
    </Fenetre>
  );
}
