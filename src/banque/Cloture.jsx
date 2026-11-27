import React, { useEffect, useState } from "react";
import { Printer, Calculator, CheckCircle2 } from "lucide-react";
import { preparerCloture, cloturerEpargneBanque } from "../lib/banque2";
import { envoyerSMS } from "../lib/sms";
import { ChampDate, versDateISO, versDateFr } from "../ui/ChampDate";
import { useConfirmation, fmtF } from "../ui/Confirmation";
import { Fenetre, Champ, Pastille, Message, Choix, ChampMontant, nombre } from "./communs";
import { useDroits } from "../ui/Droits";

// ============================================================
// CLÔTURE D'UNE ÉPARGNE — méthode des nombres (montant × jours)
// 1. date · 2. prêts non soldés · 3. caisse comptée · 4. partage
// et décisions · 5. relevés imprimables
// ============================================================
export function ClotureEpargne({ epargne, groupId, nomGroupe, utilisateur, version = 0, onRegler, onFermer }) {
  const { executer } = useConfirmation();
  const { peut } = useDroits();
  const [date, setDate] = useState(epargne.dateCloture ? versDateFr(epargne.dateCloture) : "");
  const [calcul, setCalcul] = useState(null);
  const [enCalcul, setEnCalcul] = useState(false);
  const [caisse, setCaisse] = useState("");
  const [motifEcart, setMotifEcart] = useState("");
  const [decisions, setDecisions] = useState({});
  const [nomNouvelle, setNomNouvelle] = useState(`${epargne.nom} ${new Date().getFullYear() + 1}`);
  const [sms, setSms] = useState(true);
  const [fini, setFini] = useState(null);
  const [erreur, setErreur] = useState("");
  const [releve, setReleve] = useState(null);

  const calculer = async () => {
    setErreur("");
    const d = versDateISO(date);
    if (!d) { setErreur("Choisis la date de clôture (jj/mm/aaaa)."); return; }
    setEnCalcul(true);
    try {
      const c = await preparerCloture(groupId, epargne, d);
      setCalcul(c);
      setDecisions((x) => Object.fromEntries(c.membres.map((m) => [m.membreId, x[m.membreId] || "recuperer"])));
    } catch (e) {
      console.error(e);
      setErreur("Calcul impossible : " + (e.message || "erreur inconnue"));
    } finally { setEnCalcul(false); }
  };
  // Après un règlement de prêt fait depuis la clôture, on recalcule.
  useEffect(() => { if (calcul) calculer(); }, [version]);

  const compte = caisse === "" ? null : nombre(caisse);
  const ecart = calcul && compte !== null ? compte - calcul.caisseAttendue : 0;

  const cloturer = async () => {
    setErreur("");
    if (compte === null) { setErreur("Le comptage de la caisse est obligatoire avant de clôturer."); return; }
    if (ecart !== 0 && !motifEcart.trim()) { setErreur("Il y a un écart de caisse : indique le motif."); return; }
    const reconduits = calcul.membres.filter((m) => decisions[m.membreId] === "reconduire").length;
    if ((reconduits > 0 || calcul.pretsOuverts.length > 0) && !nomNouvelle.trim()) { setErreur("Donne un nom au nouveau cycle."); return; }
    const res = await executer({
      module: "clotures", niveau: "valider",
      titre: `Clôturer ${epargne.nom} ?`,
      lignes: [["Date de clôture", versDateFr(calcul.dateCloture)], ["Épargne des membres", fmtF(calcul.capitalMembres)], ["Intérêts à partager", fmtF(calcul.cagnotte)],
        ["Caisse attendue", fmtF(calcul.caisseAttendue)], ["Caisse comptée", fmtF(compte)], ecart ? ["Écart", `${ecart > 0 ? "+" : "−"} ${fmtF(Math.abs(ecart))} — ${motifEcart}`] : null,
        ["Récupèrent", String(calcul.membres.length - reconduits)], ["Reconduisent", String(reconduits)],
        calcul.reste ? ["Reste d'arrondi → compte de la réunion", fmtF(calcul.reste)] : null,
        calcul.pretsOuverts.length ? ["Prêts reportés au nouveau cycle", String(calcul.pretsOuverts.length)] : null].filter(Boolean),
      alertes: ["La clôture est définitive : l'épargne passe en « clôturée »."],
      libelleConfirmer: "Clôturer", detailSucces: `${epargne.nom} clôturée`,
    }, () => cloturerEpargneBanque(groupId, epargne, calcul, { decisions, nomNouvelle: nomNouvelle.trim(), caisseComptee: compte, saisiPar: utilisateur }));
    if (!res) return;
    if (sms) {
      for (const m of calcul.membres) {
        if (!m.telephone || m.total <= 0) continue;
        envoyerSMS({ message: `Bonjour ${m.nom}, clôture ${epargne.nom} du ${versDateFr(calcul.dateCloture)} : épargne ${m.capital.toLocaleString("fr-FR")} + intérêts ${m.interets.toLocaleString("fr-FR")} = ${m.total.toLocaleString("fr-FR")} FCFA (${decisions[m.membreId] === "reconduire" ? "reconduit" : "à récupérer"}).`, numeros: [m.telephone], groupId });
      }
    }
    setFini(res);
  };

  const imprimer = (m) => { setReleve(m); setTimeout(() => window.print(), 50); };

  return (
    <Fenetre titre={`Clôture — ${epargne.nom}`} onFermer={onFermer} large>
      {!fini && (
        <>
          <div className="bq-etape"><span className="bq-num">1</span> Date de clôture</div>
          <div className="bq-ligne-champs">
            <ChampDate aujourdhuiParDefaut={false} ariaLabel="Date de clôture" value={date} onChange={(e) => setDate(e.target.value)} />
            <button type="button" className="adm-btn adm-btn-secondaire" onClick={calculer} disabled={enCalcul}><Calculator size={15} aria-hidden="true" /> {enCalcul ? "Calcul…" : calcul ? "Recalculer" : "Calculer"}</button>
          </div>
          <div className="adm-aide">Chaque franc compte pour le nombre de jours où il est resté dans la caisse jusqu'à cette date (méthode des nombres).</div>
        </>
      )}

      {calcul && !fini && (
        <>
          <div className="bq-etape"><span className="bq-num">2</span> Prêts non soldés</div>
          {calcul.pretsOuverts.length === 0 ? <div className="adm-msg adm-msg-succes">Tous les prêts sont soldés.</div> : (
            <>
              <table className="bq-table">
                <thead><tr><th>Membre</th><th className="d">Reste dû au {versDateFr(calcul.dateCloture)}</th><th></th></tr></thead>
                <tbody>{calcul.pretsOuverts.map((p) => (
                  <tr key={p.id}><td>{p.membre} {p.special && <Pastille ton="violet">Spécial</Pastille>}</td><td className="d num"><b>{fmtF(p.etat.totalDu)}</b></td>
                    <td className="d"><button type="button" className="adm-btn-ligne" onClick={() => onRegler(p)}>Régler maintenant</button></td></tr>
                ))}</tbody>
              </table>
              <Message ton="attente">S'ils ne sont pas réglés, ces prêts sont reportés au nouveau cycle (dette reportée). Leur capital ({fmtF(calcul.capitalPrete)}) n'est pas dans la caisse : il est déduit de la caisse attendue.</Message>
            </>
          )}

          <div className="bq-etape"><span className="bq-num">3</span> Comptage de la caisse (obligatoire)</div>
          <div className="bq-deux">
            <Champ label="Caisse attendue" aide={`Épargne ${fmtF(calcul.capitalMembres)} + intérêts ${fmtF(calcul.cagnotte)} − prêts dehors ${fmtF(calcul.capitalPrete)}`}>
              <div className="bq-valeur-fixe num">{fmtF(calcul.caisseAttendue)}</div>
            </Champ>
            <Champ label="Argent compté" id="cl-caisse"><ChampMontant id="cl-caisse" valeur={caisse} onChange={setCaisse} /></Champ>
          </div>
          {compte !== null && (ecart === 0
            ? <div className="adm-msg adm-msg-succes">La caisse est juste.</div>
            : <>
              <Message ton="erreur">Écart de {ecart > 0 ? "+" : "−"} {fmtF(Math.abs(ecart))} ({ecart > 0 ? "excédent" : "manque"}).</Message>
              <Champ label="Motif de l'écart (obligatoire)"><input className="adm-input" value={motifEcart} onChange={(e) => setMotifEcart(e.target.value)} placeholder="ex. Versement de Marie pas encore saisi" /></Champ>
            </>)}

          <div className="bq-etape"><span className="bq-num">4</span> Partage des intérêts et décisions</div>
          <div className="bq-table-cadre">
            <table className="bq-table">
              <thead><tr><th>Membre</th><th className="d">Épargne</th><th className="d">Nombres</th><th className="d">%</th><th className="d">Intérêts</th><th className="d">Total</th><th>Décision</th><th></th></tr></thead>
              <tbody>{calcul.membres.map((m) => (
                <tr key={m.membreId}>
                  <td>{m.nom}</td><td className="d num">{fmtF(m.capital)}</td><td className="d num m">{Math.round(m.nombres).toLocaleString("fr-FR")}</td>
                  <td className="d num m">{m.pourcentage.toFixed(2)} %</td><td className="d num bq-or">{fmtF(m.interets)}</td><td className="d num"><b>{fmtF(m.total)}</b></td>
                  <td><Choix nom={`Décision ${m.nom}`} valeur={decisions[m.membreId]} onChange={(v) => setDecisions((x) => ({ ...x, [m.membreId]: v }))}
                    options={[{ valeur: "recuperer", libelle: "Récupère" }, { valeur: "reconduire", libelle: "Reconduit" }]} /></td>
                  <td className="d"><button type="button" className="adm-btn-ligne" aria-label={`Relevé de ${m.nom}`} onClick={() => imprimer(m)}><Printer size={14} aria-hidden="true" /></button></td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td><b>Total</b></td><td className="d num"><b>{fmtF(calcul.capitalMembres)}</b></td><td></td><td></td>
                <td className="d num bq-or"><b>{fmtF(calcul.cagnotte - calcul.reste)}</b></td><td className="d num"><b>{fmtF(calcul.membres.reduce((s, m) => s + m.total, 0))}</b></td><td></td><td></td></tr></tfoot>
            </table>
          </div>
          {calcul.reste > 0 && <div className="adm-aide">Les parts sont arrondies au franc inférieur : le reste ({fmtF(calcul.reste)}) va au compte de la réunion.</div>}
          {calcul.cagnotte === 0 && <Message ton="attente">Aucun intérêt encaissé sur cette épargne avant la date choisie : rien à partager.</Message>}
          {(Object.values(decisions).includes("reconduire") || calcul.pretsOuverts.length > 0) && (
            <Champ label="Nom du nouveau cycle"><input className="adm-input" value={nomNouvelle} onChange={(e) => setNomNouvelle(e.target.value)} /></Champ>
          )}
          <label className="bq-case"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> Envoyer à chaque membre son montant par SMS</label>
          <Message>{erreur}</Message>
          {peut("clotures", "valider")
            ? <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={cloturer}>Clôturer l'épargne</button>
            : <Message ton="info">Calcul préparé. La clôture elle-même est faite par le Président (ou le poste qui valide les clôtures).</Message>}
        </>
      )}
      {!calcul && <Message>{erreur}</Message>}

      {fini && (
        <>
          <div className="adm-msg adm-msg-succes"><CheckCircle2 size={16} aria-hidden="true" /> {epargne.nom} est clôturée au {versDateFr(fini.resume.date)}.{fini.nouvelle ? ` Nouveau cycle : ${fini.nouvelle.nom}.` : ""}</div>
          <table className="bq-table">
            <thead><tr><th>Membre</th><th className="d">Total</th><th>Décision</th><th></th></tr></thead>
            <tbody>{calcul.membres.map((m) => (
              <tr key={m.membreId}><td>{m.nom}</td><td className="d num"><b>{fmtF(m.total)}</b></td><td>{decisions[m.membreId] === "reconduire" ? "Reconduit" : "Récupère"}</td>
                <td className="d"><button type="button" className="adm-btn-ligne" onClick={() => imprimer(m)}><Printer size={14} aria-hidden="true" /> Relevé</button></td></tr>
            ))}</tbody>
          </table>
          <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={onFermer}>Terminer</button>
        </>
      )}

      {releve && calcul && <Releve membre={releve} epargne={epargne} calcul={calcul} nomGroupe={nomGroupe} decision={decisions[releve.membreId]} />}
    </Fenetre>
  );
}

// Relevé individuel : visible seulement à l'impression.
function Releve({ membre, epargne, calcul, nomGroupe, decision }) {
  return (
    <div className="bq-releve" aria-hidden="true">
      <h2>{nomGroupe} — Relevé d'épargne</h2>
      <p><b>{membre.nom}</b> · {epargne.nom} · clôture au {versDateFr(calcul.dateCloture)}</p>
      <table>
        <thead><tr><th>Date</th><th>Opération</th><th>Montant</th><th>Solde</th><th>Jours</th><th>Nombres</th></tr></thead>
        <tbody>{(membre.lignes || []).map((l, i) => (
          <tr key={i}><td>{versDateFr(l.date)}</td><td>{l.libelle || (l.montant >= 0 ? "Versement" : "Retrait")}</td><td>{fmtF(l.montant)}</td><td>{fmtF(l.solde)}</td><td>{l.jours}</td><td>{Math.round(l.nombres).toLocaleString("fr-FR")}</td></tr>
        ))}</tbody>
      </table>
      <p>Épargne : <b>{fmtF(membre.capital)}</b> · Nombres : {Math.round(membre.nombres).toLocaleString("fr-FR")} ({membre.pourcentage.toFixed(2)} %)</p>
      <p>Part des intérêts : <b>{fmtF(membre.interets)}</b> (cagnotte totale {fmtF(calcul.cagnotte)})</p>
      <p>Total : <b>{fmtF(membre.total)}</b> — {decision === "reconduire" ? "reconduit dans le nouveau cycle" : "à récupérer"}</p>
      <p className="bq-releve-sign">Signature du membre : ____________ &nbsp;&nbsp; Signature du trésorier : ____________</p>
    </div>
  );
}
