import React, { useEffect, useMemo, useState } from "react";
import { Plus, PiggyBank, Settings2, Lock, Landmark, Star, Undo2, Wallet, ShieldCheck, Trash2 } from "lucide-react";
import {
  fetchEpargnesBanque, fetchPretsBanque, fetchMouvementsBanque, fetchCompteReunion, etatPret,
  sauverReglesEpargne, creerPret, validerPretSpecial, refuserPretSpecial, reglerPret,
  annulerMouvementEpargne, annulerRemboursement, fetchAvoirsMembre, ecrireCompteReunion,
} from "../lib/banque2";
import { normaliserRegles, libelleRegle, fraisDeDossier, interetsPret, ajouterPeriodes, versISO, echeancier, situationPret, repartirPaiement } from "../lib/calculsBancaires";
import { envoyerSMS } from "../lib/sms";
import { ChampDate, versDateISO, versDateFr, dateDuJour } from "../ui/ChampDate";
import { useConfirmation, fmtF } from "../ui/Confirmation";
import { Fenetre, Champ, Pastille, Message, Choix, ChampMontant, nombre } from "./communs";
import { ClotureEpargne } from "./Cloture";

const UNITES = [{ valeur: "jour", libelle: "jour(s)" }, { valeur: "semaine", libelle: "semaine(s)" }, { valeur: "mois", libelle: "mois" }];
const MODES = [{ valeur: "periode", libelle: "Par période entamée" }, { valeur: "prorata", libelle: "Au prorata des jours" }, { valeur: "fixe", libelle: "Fixe, une seule fois" }];
const PARTAGES = [{ valeur: "nombres", libelle: "Au prorata montant × jours" }, { valeur: "montant", libelle: "Au prorata du montant" }, { valeur: "egal", libelle: "Parts égales" }];

const TON_STATUT = { "en cours": "or", "en retard": "rouge", "remboursé": "vert", "en attente": "violet", "refusé": "neutre" };

const aujourdhuiISO = () => new Date().toISOString().slice(0, 10);

export default function BanqueModule({ groupId, nomGroupe, membres, utilisateur, onCotisation, onCreerEpargne, rafraichir = 0 }) {
  const [onglet, setOnglet] = useState("epargnes");
  const [epargnes, setEpargnes] = useState([]);
  const [prets, setPrets] = useState([]);
  const [mouvements, setMouvements] = useState([]);
  const [compte, setCompte] = useState({ solde: 0, lignes: [] });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const [reglesPour, setReglesPour] = useState(null);
  const [nouveauPret, setNouveauPret] = useState(null); // "normal" | "special"
  const [fiche, setFiche] = useState(null);
  const [reglement, setReglement] = useState(null);
  const [annulation, setAnnulation] = useState(null);
  const [cloture, setCloture] = useState(null);
  const [ecritureCompte, setEcritureCompte] = useState(false);
  const [version, setVersion] = useState(0);

  const recharger = async () => {
    try {
      const [e, p, m, c] = await Promise.all([fetchEpargnesBanque(groupId), fetchPretsBanque(groupId), fetchMouvementsBanque(groupId), fetchCompteReunion(groupId)]);
      setEpargnes(e); setPrets(p); setMouvements(m); setCompte(c); setErreur(""); setVersion((v) => v + 1);
    } catch (err) {
      console.error("Erreur de chargement de la banque", err);
      setErreur("Impossible de charger la banque. Vérifie que la mise à jour de la base (script SQL) a bien été faite.");
    } finally {
      setChargement(false);
    }
  };
  useEffect(() => { if (groupId) recharger(); }, [groupId, rafraichir]);

  const membresActifs = useMemo(() => membres.filter((m) => m.statut !== "inactif"), [membres]);
  const epargnesOuvertes = epargnes.filter((e) => e.statut !== "clôturée");
  const pretsAvecEtat = useMemo(() => prets.map((p) => ({ ...p, etat: etatPret(p) })), [prets]);
  const enAttente = pretsAvecEtat.filter((p) => p.statutBase === "en attente");
  const totalPrete = pretsAvecEtat.filter((p) => !["en attente", "refusé"].includes(p.statutBase)).reduce((s, p) => s + p.etat.capitalRestant, 0);

  return (
    <>
      <div className="adm-entete">
        <div>
          <h1 className="adm-titre">Banque du groupe</h1>
          <p className="adm-sous-titre">Épargnes, prêts, remboursements et compte de la réunion. Chaque réunion fixe ses propres règles.</p>
        </div>
        <div className="bq-actions">
          <button type="button" className="adm-btn adm-btn-secondaire" onClick={onCotisation}><Plus size={15} aria-hidden="true" /> Enregistrer une cotisation</button>
          <button type="button" className="adm-btn adm-btn-secondaire" onClick={() => setNouveauPret("special")}><Star size={15} aria-hidden="true" /> Prêt spécial</button>
          <button type="button" className="adm-btn adm-btn-secondaire" onClick={() => setNouveauPret("normal")}><Plus size={15} aria-hidden="true" /> Nouveau prêt</button>
          <button type="button" className="adm-btn adm-btn-action" onClick={onCreerEpargne}><Plus size={15} aria-hidden="true" /> Créer une épargne</button>
        </div>
      </div>

      <Message>{erreur}</Message>

      {enAttente.length > 0 && (
        <div className="bq-attente" role="status">
          <Star size={16} aria-hidden="true" />
          <span><b>{enAttente.length} prêt(s) spécial(aux)</b> en attente de la validation du Président.</span>
          <button type="button" className="adm-btn-ligne" onClick={() => { setOnglet("prets"); setFiche(enAttente[0]); }}>Voir</button>
        </div>
      )}

      <div className="bq-onglets" role="tablist">
        {[
          { k: "epargnes", l: "Épargnes" },
          { k: "prets", l: `Prêts (${pretsAvecEtat.filter((p) => p.etat.totalDu > 0 || p.statutBase === "en attente").length})` },
          { k: "historique", l: "Historique" },
          { k: "compte", l: "Compte de la réunion" },
        ].map((o) => (
          <button key={o.k} type="button" role="tab" aria-selected={onglet === o.k} className={`bq-onglet${onglet === o.k ? " est-actif" : ""}`} onClick={() => setOnglet(o.k)}>{o.l}</button>
        ))}
      </div>

      {chargement && <p className="adm-sous-titre">Chargement…</p>}

      {!chargement && onglet === "epargnes" && (
        <>
          <div className="bq-grille">
            {epargnes.map((ep) => (
              <div key={ep.id} className={`bq-carte${ep.statut === "clôturée" ? " est-close" : ""}`}>
                <div className="bq-carte-tete">
                  <span className="bq-carte-nom"><PiggyBank size={16} aria-hidden="true" /> {ep.nom}</span>
                  {ep.statut === "clôturée" ? <Pastille>Clôturée</Pastille> : !ep.reglesDefinies && <Pastille ton="or">Règles à définir</Pastille>}
                </div>
                <div className="bq-carte-valeur num">{fmtF(ep.solde)}</div>
                <div className="bq-carte-sub">En caisse · prêts : {libelleRegle(ep.regles)}</div>
                {(ep.dateDebut || ep.dateCloture) && <div className="bq-carte-sub">Cycle : {ep.dateDebut ? versDateFr(ep.dateDebut) : "—"} → {ep.dateCloture ? versDateFr(ep.dateCloture) : "—"}</div>}
                {ep.statut !== "clôturée" ? (
                  <div className="bq-carte-actions">
                    <button type="button" className="adm-btn-ligne" onClick={() => setReglesPour(ep)}><Settings2 size={14} aria-hidden="true" /> Règles</button>
                    <button type="button" className="adm-btn-ligne" onClick={() => setCloture(ep)}><Lock size={14} aria-hidden="true" /> Clôturer</button>
                  </div>
                ) : ep.cloture && (
                  <div className="bq-carte-sub">Clôturée le {versDateFr(ep.cloture.date)} · intérêts partagés {fmtF(ep.cloture.cagnotte)}</div>
                )}
              </div>
            ))}
            <div className="bq-carte bq-carte-compte">
              <div className="bq-carte-tete"><span className="bq-carte-nom"><Landmark size={16} aria-hidden="true" /> Compte de la réunion</span></div>
              <div className="bq-carte-valeur num">{fmtF(compte.solde)}</div>
              <div className="bq-carte-sub">Frais de dossier, pénalités, arrondis. Ne se partage pas à la clôture.</div>
              <div className="bq-carte-actions"><button type="button" className="adm-btn-ligne" onClick={() => setOnglet("compte")}>Voir le détail</button></div>
            </div>
          </div>
          {epargnes.length === 0 && <div className="adm-vide">Aucune épargne. Crée la première avec « Créer une épargne », puis définis ses règles.</div>}
          <div className="bq-resume">
            <span>Prêté et pas encore rendu : <b className="num">{fmtF(totalPrete)}</b></span>
            <span>Prêts en retard : <b>{pretsAvecEtat.filter((p) => p.etat.statut === "en retard").length}</b></span>
          </div>
        </>
      )}

      {!chargement && onglet === "prets" && (
        <ListePrets prets={pretsAvecEtat} onOuvrir={setFiche} />
      )}

      {!chargement && onglet === "historique" && (
        <Historique mouvements={mouvements} onAnnuler={(m) => setAnnulation({ type: "mouvement", objet: m })} />
      )}

      {!chargement && onglet === "compte" && (
        <CompteReunion compte={compte} onEcrire={() => setEcritureCompte(true)} />
      )}

      {reglesPour && <ReglesEpargne epargne={reglesPour} onFermer={() => setReglesPour(null)} onFait={() => { setReglesPour(null); recharger(); }} />}
      {nouveauPret && (
        <NouveauPret type={nouveauPret} groupId={groupId} epargnes={epargnesOuvertes} membres={membresActifs} utilisateur={utilisateur} nomGroupe={nomGroupe}
          prets={pretsAvecEtat} onFermer={() => setNouveauPret(null)} onFait={() => { setNouveauPret(null); recharger(); setOnglet("prets"); }} />
      )}
      {fiche && (
        <FichePret pret={pretsAvecEtat.find((p) => p.id === fiche.id) || fiche} groupId={groupId} membres={membresActifs} utilisateur={utilisateur} nomGroupe={nomGroupe}
          onFermer={() => setFiche(null)} onRegler={(p) => setReglement(p)} onAnnulerRemb={(p, r) => setAnnulation({ type: "remboursement", objet: r, pret: p })} onFait={recharger} />
      )}
      {cloture && (
        <ClotureEpargne epargne={cloture} groupId={groupId} nomGroupe={nomGroupe} utilisateur={utilisateur} version={version}
          onRegler={(p) => setReglement(p)} onFermer={() => { setCloture(null); recharger(); }} />
      )}
      {reglement && (
        <ReglementPret pret={reglement} groupId={groupId} utilisateur={utilisateur} nomGroupe={nomGroupe}
          onFermer={() => setReglement(null)} onFait={() => { setReglement(null); recharger(); }} />
      )}
      {annulation && (
        <Annulation demande={annulation} groupId={groupId} utilisateur={utilisateur}
          onFermer={() => setAnnulation(null)} onFait={() => { setAnnulation(null); recharger(); }} />
      )}
      {ecritureCompte && <EcritureCompte groupId={groupId} utilisateur={utilisateur} onFermer={() => setEcritureCompte(false)} onFait={() => { setEcritureCompte(false); recharger(); }} />}
    </>
  );
}

// ------------------------------------------------------------
// RÈGLES D'UNE ÉPARGNE
// ------------------------------------------------------------
function ReglesEpargne({ epargne, onFermer, onFait }) {
  const { executer } = useConfirmation();
  const [r, setR] = useState(() => ({ ...epargne.regles }));
  const [debut, setDebut] = useState(epargne.dateDebut ? versDateFr(epargne.dateDebut) : "");
  const [fin, setFin] = useState(epargne.dateCloture ? versDateFr(epargne.dateCloture) : "");
  const [erreur, setErreur] = useState("");
  const maj = (k, v) => setR((x) => ({ ...x, [k]: v }));

  const apercu = useMemo(() => {
    const regles = normaliserRegles(r);
    const montant = 100000;
    const d0 = "2026-01-01";
    const fin3 = versISO(ajouterPeriodes(d0, regles.periode * 1.5 > 1 ? Math.ceil(regles.periode * 1.5) : 2, regles.unite));
    const int = interetsPret({ montant, dateDebut: d0, regles }, [], fin3).total;
    return { montant, int, frais: fraisDeDossier(montant, regles), duree: `${Math.ceil(regles.periode * 1.5)} ${regles.unite === "mois" ? "mois" : regles.unite + "s"}` };
  }, [r]);

  const enregistrer = async () => {
    setErreur("");
    if (!(Number(r.taux) >= 0)) { setErreur("Le taux est obligatoire."); return; }
    const dDebut = debut ? versDateISO(debut) : null;
    const dFin = fin ? versDateISO(fin) : null;
    if ((debut && !dDebut) || (fin && !dFin)) { setErreur("Date invalide (jj/mm/aaaa)."); return; }
    const res = await executer({
      titre: "Enregistrer les règles ?",
      lignes: [["Épargne", epargne.nom], ["Intérêt des prêts", libelleRegle(r)], ["Frais de dossier", r.fraisValeur ? (r.fraisType === "pourcent" ? `${r.fraisValeur} %` : fmtF(r.fraisValeur)) : "aucun"],
        ["Pénalité de retard", r.penaliteValeur ? `${r.penaliteType === "pourcent" ? r.penaliteValeur + " %" : fmtF(r.penaliteValeur)} par ${r.penaliteUnite} (grâce ${r.graceJours || 0} j)` : "aucune"],
        ["Partage à la clôture", PARTAGES.find((p) => p.valeur === r.partage)?.libelle]],
      alertes: ["Les nouvelles règles s'appliquent aux prochains prêts. Les prêts déjà accordés gardent leurs conditions."],
      detailSucces: `Règles de ${epargne.nom} enregistrées`,
    }, () => sauverReglesEpargne(epargne.id, { regles: r, dateDebut: dDebut, dateCloture: dFin }));
    if (res) onFait();
  };

  return (
    <Fenetre titre={`Règles — ${epargne.nom}`} onFermer={onFermer} large>
      <div className="bq-deux">
        <Champ label="Début du cycle"><ChampDate aujourdhuiParDefaut={false} ariaLabel="Début du cycle" value={debut} onChange={(e) => setDebut(e.target.value)} /></Champ>
        <Champ label="Fin du cycle (prévue)"><ChampDate aujourdhuiParDefaut={false} ariaLabel="Fin du cycle" value={fin} onChange={(e) => setFin(e.target.value)} /></Champ>
      </div>

      <h3 className="bq-section">Intérêt des prêts → cagnotte des épargnants</h3>
      <div className="bq-trois">
        <Champ label="Taux (%)" id="rg-taux"><input id="rg-taux" className="adm-input" inputMode="decimal" value={r.taux} onChange={(e) => maj("taux", e.target.value.replace(",", "."))} /></Champ>
        <Champ label="Tous les" id="rg-per"><input id="rg-per" className="adm-input" inputMode="numeric" value={r.periode} onChange={(e) => maj("periode", e.target.value.replace(/\D/g, ""))} /></Champ>
        <Champ label="Unité" id="rg-unite"><select id="rg-unite" className="adm-input" value={r.unite} onChange={(e) => maj("unite", e.target.value)}>{UNITES.map((u) => <option key={u.valeur} value={u.valeur}>{u.libelle}</option>)}</select></Champ>
      </div>
      <Choix nom="Mode de calcul" options={MODES} valeur={r.mode} onChange={(v) => maj("mode", v)} />
      <div className="adm-aide">Exemples : 10 % tous les 2 mois · 5 % par mois · 2 % par semaine · 15 % fixe.</div>

      <h3 className="bq-section">Frais et pénalités → compte de la réunion</h3>
      <div className="bq-deux">
        <Champ label="Frais de dossier">
          <div className="bq-ligne-champs">
            <input className="adm-input" inputMode="decimal" aria-label="Valeur des frais" value={r.fraisValeur} onChange={(e) => maj("fraisValeur", e.target.value.replace(",", "."))} />
            <select className="adm-input" aria-label="Type de frais" value={r.fraisType} onChange={(e) => maj("fraisType", e.target.value)}><option value="fixe">F (montant fixe)</option><option value="pourcent">% du prêt</option></select>
          </div>
        </Champ>
        <Champ label="Délai de grâce après l'échéance (jours)" id="rg-grace"><input id="rg-grace" className="adm-input" inputMode="numeric" value={r.graceJours} onChange={(e) => maj("graceJours", e.target.value.replace(/\D/g, ""))} /></Champ>
      </div>
      <Champ label="Pénalité de retard">
        <div className="bq-ligne-champs">
          <input className="adm-input" inputMode="decimal" aria-label="Valeur de la pénalité" value={r.penaliteValeur} onChange={(e) => maj("penaliteValeur", e.target.value.replace(",", "."))} />
          <select className="adm-input" aria-label="Type de pénalité" value={r.penaliteType} onChange={(e) => maj("penaliteType", e.target.value)}><option value="pourcent">%</option><option value="fixe">F (fixe)</option></select>
          <select className="adm-input" aria-label="Base de la pénalité" value={r.penaliteBase} onChange={(e) => maj("penaliteBase", e.target.value)} disabled={r.penaliteType === "fixe"}><option value="reste">du reste dû</option><option value="capital">du montant prêté</option></select>
          <select className="adm-input" aria-label="Unité de retard" value={r.penaliteUnite} onChange={(e) => maj("penaliteUnite", e.target.value)}><option value="jour">par jour</option><option value="semaine">par semaine</option><option value="mois">par mois</option></select>
        </div>
      </Champ>

      <h3 className="bq-section">Limites et partage</h3>
      <div className="bq-deux">
        <Champ label="Prêt maximum (× l'épargne du membre)" aide="Vide = pas de limite. Au-delà, seul un prêt spécial est possible.">
          <input className="adm-input" inputMode="decimal" placeholder="ex. 3" value={r.plafondMultiple ?? ""} onChange={(e) => maj("plafondMultiple", e.target.value.replace(",", ".") || null)} />
        </Champ>
        <Champ label="Partage de la cagnotte à la clôture">
          <select className="adm-input" value={r.partage} onChange={(e) => maj("partage", e.target.value)}>{PARTAGES.map((p) => <option key={p.valeur} value={p.valeur}>{p.libelle}</option>)}</select>
        </Champ>
      </div>

      <div className="adm-msg adm-msg-succes">
        Aperçu : un prêt de {fmtF(apercu.montant)} rendu après {apercu.duree} → <b>{fmtF(apercu.int)}</b> d'intérêts (cagnotte){apercu.frais ? <> + {fmtF(apercu.frais)} de frais (compte de la réunion)</> : null}.
      </div>
      <Message>{erreur}</Message>
      <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={enregistrer}>Enregistrer les règles</button>
    </Fenetre>
  );
}

// ------------------------------------------------------------
// LISTE DES PRÊTS
// ------------------------------------------------------------
function ListePrets({ prets, onOuvrir }) {
  const [filtre, setFiltre] = useState("ouverts");
  const liste = prets.filter((p) => filtre === "tous" ? true : filtre === "speciaux" ? p.special : p.etat.totalDu > 0 || p.statutBase === "en attente");
  return (
    <>
      <Choix nom="Filtre" valeur={filtre} onChange={setFiltre} options={[{ valeur: "ouverts", libelle: "En cours" }, { valeur: "speciaux", libelle: "Prêts spéciaux" }, { valeur: "tous", libelle: "Tous" }]} />
      <div className="bq-table-cadre">
        <table className="bq-table">
          <thead><tr><th>Membre</th><th>Épargne</th><th className="d">Prêté</th><th>Échéance</th><th className="d">Reste dû</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {liste.map((p) => (
              <tr key={p.id}>
                <td>{p.membre} {p.special && <Pastille ton="violet">Spécial</Pastille>}</td>
                <td className="m">{p.epargneNom}</td>
                <td className="d num">{fmtF(p.montant)}</td>
                <td className="m">{p.dateFin ? versDateFr(p.dateFin) : "—"}</td>
                <td className="d num"><b>{fmtF(p.etat.totalDu)}</b></td>
                <td><Pastille ton={TON_STATUT[p.etat.statut] || "neutre"}>{p.etat.statut}</Pastille></td>
                <td className="d"><button type="button" className="adm-btn-ligne" onClick={() => onOuvrir(p)}>Ouvrir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {liste.length === 0 && <div className="adm-vide">Aucun prêt dans cette liste.</div>}
      </div>
    </>
  );
}

// ------------------------------------------------------------
// NOUVEAU PRÊT (normal ou spécial)
// ------------------------------------------------------------
function NouveauPret({ type, groupId, epargnes, membres, utilisateur, nomGroupe, prets, onFermer, onFait }) {
  const special = type === "special";
  const { executer } = useConfirmation();
  const [epargneId, setEpargneId] = useState(epargnes[0]?.id || "");
  const ep = epargnes.find((e) => e.id === epargneId);
  const [membreId, setMembreId] = useState("");
  const [montant, setMontant] = useState("");
  const [debut, setDebut] = useState(dateDuJour());
  const [conditions, setConditions] = useState(() => ({ ...(ep?.regles || normaliserRegles({})) }));
  const [echeanceManuelle, setEcheanceManuelle] = useState("");
  const [frais, setFrais] = useState("");
  const [modeRemb, setModeRemb] = useState(special ? "mensualites" : "une_fois");
  const [nbEch, setNbEch] = useState("6");
  const [avalistes, setAvalistes] = useState([{ id: "", montant: "" }]);
  const [garanties, setGaranties] = useState(special ? [{ type: "Titre foncier", description: "", valeur: "" }] : []);
  const [decisionDate, setDecisionDate] = useState(dateDuJour());
  const [comite, setComite] = useState("");
  const [motif, setMotif] = useState("");
  const [avoirs, setAvoirs] = useState(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => { if (!special && ep) setConditions({ ...ep.regles }); }, [epargneId]);
  useEffect(() => {
    setAvoirs(null);
    if (membreId) fetchAvoirsMembre(groupId, membreId).then(setAvoirs).catch((e) => console.error(e));
  }, [membreId]);

  const regles = normaliserRegles(special ? conditions : ep?.regles || {});
  const m = nombre(montant);
  const dDebut = versDateISO(debut);
  const echeanceAuto = dDebut ? versISO(ajouterPeriodes(dDebut, special && modeRemb === "mensualites" ? Number(nbEch) || 1 : regles.periode, special && modeRemb === "mensualites" ? "mois" : regles.unite)) : null;
  const dFin = echeanceManuelle ? versDateISO(echeanceManuelle) : echeanceAuto;
  const fraisCalc = frais !== "" ? nombre(frais) : fraisDeDossier(m, regles);
  const epargneMembre = avoirs?.epargnes.find((e) => e.id === epargneId)?.solde || 0;
  const plafond = regles.plafondMultiple ? regles.plafondMultiple * epargneMembre : null;
  const depasse = plafond !== null && m > plafond;
  const dejaEnCours = prets.filter((p) => p.membreId === membreId && p.etat.totalDu > 0);
  // Alerte : plus de 30 % de l'épargne prêtée en prêts spéciaux.
  const pretsEp = prets.filter((p) => p.epargneId === epargneId && !["en attente", "refusé"].includes(p.statutBase));
  const dehorsEp = pretsEp.reduce((s, p) => s + p.etat.capitalRestant, 0);
  const specialDehors = pretsEp.filter((p) => p.special).reduce((s, p) => s + p.etat.capitalRestant, 0);
  const baseEp = (ep?.solde || 0) + dehorsEp;
  const partSpeciale = baseEp > 0 ? Math.round((specialDehors + (special ? m : 0)) / baseEp * 100) : 0;
  const apercu = m && dDebut && dFin ? (special && modeRemb === "mensualites" ? echeancier(m, { ...regles, periode: 1, unite: "mois" }, Number(nbEch) || 1) : null) : null;
  const interetPrevu = m && dDebut && dFin && !apercu ? interetsPret({ montant: m, dateDebut: dDebut, regles }, [], dFin).total : apercu?.totalInterets || 0;

  const valider = async () => {
    setErreur("");
    if (!epargneId || !membreId || !m) { setErreur("Choisis l'épargne, le membre et le montant."); return; }
    if (!dDebut || !dFin) { setErreur("Dates invalides (jj/mm/aaaa)."); return; }
    if (m > (ep?.solde || 0) && !special) { setErreur(`Pas assez d'argent dans ${ep?.nom} (${fmtF(ep?.solde)} en caisse).`); return; }
    if (!special && depasse) { setErreur(`Ce montant dépasse le plafond (${fmtF(plafond)}). Utilise un prêt spécial.`); return; }
    if (special && !motif.trim()) { setErreur("Le motif ou procès-verbal de la décision est obligatoire."); return; }
    const membre = membres.find((x) => x.id === membreId);
    const av = avalistes.filter((a) => a.id).map((a) => ({ id: a.id, montant: nombre(a.montant) || m }));
    const gar = garanties.filter((g) => g.description.trim() || g.type).map((g) => ({ ...g, valeur: nombre(g.valeur) }));
    const res = await executer({
      titre: special ? "Soumettre ce prêt spécial ?" : "Accorder ce prêt ?",
      lignes: [["Membre", membre?.nom], ["Épargne", ep?.nom], ["Montant", fmtF(m)], ["Décaissé le", versDateFr(dDebut)], ["Échéance", versDateFr(dFin)],
        ["Conditions", libelleRegle(regles)], ["Intérêts prévus", fmtF(interetPrevu)], fraisCalc ? ["Frais de dossier (compte de la réunion)", fmtF(fraisCalc)] : null,
        av.length ? ["Avaliste(s)", av.map((a) => membres.find((x) => x.id === a.id)?.nom).join(", ")] : null].filter(Boolean),
      alertes: [
        dejaEnCours.length ? `${membre?.nom} a déjà ${dejaEnCours.length} prêt(s) en cours.` : null,
        special && depasse ? `Hors règles : dépasse son plafond normal (${fmtF(plafond)}).` : null,
        special && partSpeciale > 30 ? `Attention : ${partSpeciale} % de ${ep?.nom} serait prêté en prêts spéciaux (seuil d'alerte 30 %).` : null,
        special ? "Le prêt restera en attente : rien ne sort de la caisse avant la validation du Président." : null,
      ],
      libelleConfirmer: special ? "Soumettre au Président" : "Accorder le prêt",
      detailSucces: special ? "Prêt spécial en attente de validation" : `${fmtF(m)} prêtés à ${membre?.nom}`,
    }, async () => {
      await creerPret(groupId, {
        epargneId, membreId, montant: m, dateDebut: dDebut, dateFin: dFin, regles: special ? { ...regles, ...(modeRemb === "mensualites" ? { periode: 1, unite: "mois" } : {}) } : regles,
        special, garanties: gar, decision: special ? { date: versDateISO(decisionDate), comite, motif: motif.trim() } : null,
        modeRemboursement: modeRemb, nbEcheances: modeRemb === "mensualites" ? Number(nbEch) || 1 : null, avalistes: av, saisiPar: utilisateur, frais: fraisCalc,
      });
      if (!special && membre?.telephone) {
        envoyerSMS({ message: `Bonjour ${membre.nom}, prêt de ${m.toLocaleString("fr-FR")} FCFA accordé le ${versDateFr(dDebut)}. Échéance : ${versDateFr(dFin)}.`, numeros: [membre.telephone], groupId });
      }
    });
    if (res) onFait();
  };

  const majGar = (i, k, v) => setGaranties((g) => g.map((x, j) => j === i ? { ...x, [k]: v } : x));

  return (
    <Fenetre titre={special ? "Mettre en place un prêt spécial" : "Nouveau prêt"} onFermer={onFermer} large badge={special ? <Pastille ton="violet">Prêt spécial</Pastille> : null}>
      <div className="bq-deux">
        <Champ label="Membre emprunteur" id="np-membre">
          <select id="np-membre" className="adm-input" value={membreId} onChange={(e) => setMembreId(e.target.value)}>
            <option value="">Sélectionner un membre</option>
            {membres.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
          </select>
        </Champ>
        <Champ label="Épargne qui prête" id="np-ep" aide={ep ? `En caisse : ${fmtF(ep.solde)}` : null}>
          <select id="np-ep" className="adm-input" value={epargneId} onChange={(e) => setEpargneId(e.target.value)}>
            {epargnes.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
          </select>
        </Champ>
      </div>
      <div className="bq-deux">
        <Champ label="Montant" id="np-montant" aide={avoirs ? `Son épargne ici : ${fmtF(epargneMembre)}${plafond !== null ? ` · plafond normal : ${fmtF(plafond)}` : ""}` : null}>
          <ChampMontant id="np-montant" valeur={montant} onChange={setMontant} />
        </Champ>
        <Champ label="Date de décaissement"><ChampDate ariaLabel="Date de décaissement" value={debut} onChange={(e) => setDebut(e.target.value)} /></Champ>
      </div>
      {special && m > 0 && partSpeciale > 30 && <Message ton="attente">{partSpeciale} % de {ep?.nom} serait prêté en prêts spéciaux (seuil d'alerte : 30 %).</Message>}
      {depasse && <Message ton={special ? "attente" : "erreur"}>{special ? `Hors règles : ${fmtF(m)} dépasse son plafond normal (${fmtF(plafond)}). Autorisé en prêt spécial.` : `Dépasse le plafond (${fmtF(plafond)}) : utilise un prêt spécial.`}</Message>}

      {special ? (
        <>
          <h3 className="bq-section">Conditions propres à ce prêt</h3>
          <div className="bq-trois">
            <Champ label="Taux (%)"><input className="adm-input" inputMode="decimal" value={conditions.taux} onChange={(e) => setConditions((c) => ({ ...c, taux: e.target.value.replace(",", ".") }))} /></Champ>
            <Champ label="Tous les"><input className="adm-input" inputMode="numeric" value={conditions.periode} onChange={(e) => setConditions((c) => ({ ...c, periode: e.target.value.replace(/\D/g, "") }))} /></Champ>
            <Champ label="Unité"><select className="adm-input" value={conditions.unite} onChange={(e) => setConditions((c) => ({ ...c, unite: e.target.value }))}>{UNITES.map((u) => <option key={u.valeur} value={u.valeur}>{u.libelle}</option>)}</select></Champ>
          </div>
          <Choix nom="Mode de calcul" options={MODES} valeur={conditions.mode} onChange={(v) => setConditions((c) => ({ ...c, mode: v }))} />
          <Champ label="Remboursement"><Choix nom="Remboursement" valeur={modeRemb} onChange={setModeRemb} options={[{ valeur: "une_fois", libelle: "En une fois" }, { valeur: "mensualites", libelle: "Mensualités" }, { valeur: "libre", libelle: "Libre" }]} /></Champ>
          <div className="bq-trois">
            {modeRemb === "mensualites" && <Champ label="Nombre de mensualités"><input className="adm-input" inputMode="numeric" value={nbEch} onChange={(e) => setNbEch(e.target.value.replace(/\D/g, ""))} /></Champ>}
            <Champ label="Échéance"><ChampDate aujourdhuiParDefaut={false} ariaLabel="Échéance" placeholder={echeanceAuto ? versDateFr(echeanceAuto) : "jj/mm/aaaa"} value={echeanceManuelle} onChange={(e) => setEcheanceManuelle(e.target.value)} /></Champ>
            <Champ label="Frais de dossier"><ChampMontant valeur={frais === "" ? String(fraisCalc || "") : frais} onChange={setFrais} ariaLabel="Frais de dossier" /></Champ>
          </div>
          {apercu && <div className="adm-msg adm-msg-succes">Aperçu : {apercu.lignes.length} mensualités · intérêts {fmtF(apercu.totalInterets)} · total à rembourser {fmtF(apercu.total)}.</div>}

          <h3 className="bq-section">Garanties apportées</h3>
          {garanties.map((g, i) => (
            <div key={i} className="bq-garantie">
              <select className="adm-input" aria-label="Type de garantie" value={g.type} onChange={(e) => majGar(i, "type", e.target.value)}>
                {["Titre foncier", "Véhicule", "Salaire", "Document", "Épargne bloquée", "Autre"].map((t) => <option key={t}>{t}</option>)}
              </select>
              <input className="adm-input" placeholder="Description (ex. terrain à Bafoussam, original remis au Président)" aria-label="Description de la garantie" value={g.description} onChange={(e) => majGar(i, "description", e.target.value)} />
              <ChampMontant valeur={g.valeur} onChange={(v) => majGar(i, "valeur", v)} ariaLabel="Valeur estimée" placeholder="Valeur estimée" />
              <button type="button" className="adm-btn-ligne-danger" aria-label="Retirer cette garantie" onClick={() => setGaranties((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
          ))}
          <button type="button" className="adm-btn-ligne" onClick={() => setGaranties((x) => [...x, { type: "Autre", description: "", valeur: "" }])}><Plus size={14} aria-hidden="true" /> Ajouter une garantie</button>
        </>
      ) : (
        <>
          <div className="bq-deux">
            <Champ label="Échéance" aide={echeanceAuto ? `Selon les règles : ${versDateFr(echeanceAuto)}` : null}>
              <ChampDate aujourdhuiParDefaut={false} ariaLabel="Échéance" placeholder={echeanceAuto ? versDateFr(echeanceAuto) : "jj/mm/aaaa"} value={echeanceManuelle} onChange={(e) => setEcheanceManuelle(e.target.value)} />
            </Champ>
            <Champ label="Frais de dossier (compte de la réunion)"><ChampMontant valeur={frais === "" ? String(fraisCalc || "") : frais} onChange={setFrais} ariaLabel="Frais de dossier" /></Champ>
          </div>
          <div className="adm-msg adm-msg-info">Règle de {ep?.nom || "l'épargne"} : {libelleRegle(regles)}. {m && dFin ? <>Intérêts à l'échéance : <b>{fmtF(interetPrevu)}</b>.</> : null}</div>
        </>
      )}

      <h3 className="bq-section">Avaliste(s)</h3>
      {avalistes.map((a, i) => (
        <div key={i} className="bq-ligne-champs">
          <select className="adm-input" aria-label="Avaliste" value={a.id} onChange={(e) => setAvalistes((x) => x.map((y, j) => j === i ? { ...y, id: e.target.value } : y))}>
            <option value="">— Aucun —</option>
            {membres.filter((x) => x.id !== membreId).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
          </select>
          <ChampMontant valeur={a.montant} onChange={(v) => setAvalistes((x) => x.map((y, j) => j === i ? { ...y, montant: v } : y))} ariaLabel="Montant garanti" placeholder="Montant garanti" />
        </div>
      ))}
      <button type="button" className="adm-btn-ligne" onClick={() => setAvalistes((x) => [...x, { id: "", montant: "" }])}><Plus size={14} aria-hidden="true" /> Ajouter un avaliste</button>

      {special && (
        <>
          <h3 className="bq-section">Décision du bureau</h3>
          <div className="bq-deux">
            <Champ label="Décidé en réunion du"><ChampDate ariaLabel="Date de la décision" value={decisionDate} onChange={(e) => setDecisionDate(e.target.value)} /></Champ>
            <Champ label="Membres du comité présents"><input className="adm-input" placeholder="ex. Président, Trésorier, Commissaire" value={comite} onChange={(e) => setComite(e.target.value)} /></Champ>
          </div>
          <Champ label="Motif / procès-verbal (obligatoire)"><textarea className="adm-input" rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex. Achat d'un taxi. Garanties jugées suffisantes à l'unanimité." /></Champ>
        </>
      )}
      <Message>{erreur}</Message>
      <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={valider}>{special ? "Soumettre au Président" : "Accorder le prêt"}</button>
    </Fenetre>
  );
}

// ------------------------------------------------------------
// FICHE D'UN PRÊT
// ------------------------------------------------------------
function FichePret({ pret, groupId, membres, utilisateur, nomGroupe, onFermer, onRegler, onAnnulerRemb, onFait }) {
  const { executer } = useConfirmation();
  const [president, setPresident] = useState("");
  const [motifRefus, setMotifRefus] = useState("");
  const [erreur, setErreur] = useState("");
  const e = pret.etat;

  const valider = async () => {
    setErreur("");
    if (!president.trim()) { setErreur("Indique le nom du Président qui valide."); return; }
    const res = await executer({
      titre: "Valider ce prêt spécial ?",
      lignes: [["Membre", pret.membre], ["Montant", fmtF(pret.montant)], ["Conditions", libelleRegle(pret.regles)], ["Validé par", president]],
      alertes: [`${fmtF(pret.montant)} vont sortir de ${pret.epargneNom}.`],
      libelleConfirmer: "Valider et décaisser",
      detailSucces: `Prêt spécial décaissé pour ${pret.membre}`,
    }, async () => {
      await validerPretSpecial(groupId, pret, { validePar: president.trim() });
      if (pret.telephone) envoyerSMS({ message: `Bonjour ${pret.membre}, votre prêt spécial de ${pret.montant.toLocaleString("fr-FR")} FCFA est accordé. Échéance : ${versDateFr(pret.dateFin)}.`, numeros: [pret.telephone], groupId });
    });
    if (res) onFait();
  };
  const refuser = async () => {
    setErreur("");
    if (!motifRefus.trim() || !president.trim()) { setErreur("Indique le nom du Président et le motif du refus."); return; }
    const res = await executer({ titre: "Refuser ce prêt spécial ?", lignes: [["Membre", pret.membre], ["Montant", fmtF(pret.montant)], ["Motif", motifRefus]], danger: true, libelleConfirmer: "Refuser", detailSucces: "Prêt spécial refusé" },
      () => refuserPretSpecial(pret.id, { motif: motifRefus.trim(), par: president.trim() }));
    if (res) onFait();
  };

  return (
    <Fenetre titre={`Prêt — ${pret.membre}`} onFermer={onFermer} large badge={<>{pret.special && <Pastille ton="violet">Spécial</Pastille>} <Pastille ton={TON_STATUT[e.statut] || "neutre"}>{e.statut}</Pastille></>}>
      <dl className="bq-fiche">
        <div><dt>Montant prêté</dt><dd className="num">{fmtF(pret.montant)}</dd></div>
        <div><dt>Épargne</dt><dd>{pret.epargneNom}</dd></div>
        <div><dt>Décaissé le</dt><dd>{versDateFr(pret.dateDebut)}</dd></div>
        <div><dt>Échéance</dt><dd>{pret.dateFin ? versDateFr(pret.dateFin) : "—"}</dd></div>
        <div><dt>Conditions</dt><dd>{libelleRegle(pret.regles)}</dd></div>
        {pret.fraisDossier > 0 && <div><dt>Frais de dossier</dt><dd className="num">{fmtF(pret.fraisDossier)}</dd></div>}
        {pret.avalistes.length > 0 && <div><dt>Avaliste(s)</dt><dd>{pret.avalistes.map((a) => `${a.nom}${a.montant ? ` (${fmtF(a.montant)})` : ""}`).join(", ")}</dd></div>}
        {pret.saisiPar && <div><dt>Saisi par</dt><dd>{pret.saisiPar}</dd></div>}
        {pret.validePar && <div><dt>{pret.statutBase === "refusé" ? "Refusé par" : "Validé par"}</dt><dd>{pret.validePar}{pret.refuseMotif ? ` — ${pret.refuseMotif}` : ""}</dd></div>}
      </dl>

      {pret.special && (pret.garanties.length > 0 || pret.decision) && (
        <>
          <h3 className="bq-section">Garanties et décision</h3>
          <ul className="bq-liste">
            {pret.garanties.map((g, i) => <li key={i}><b>{g.type}</b> — {g.description || "—"}{g.valeur ? ` · valeur estimée ${fmtF(g.valeur)}` : ""}</li>)}
            {pret.decision && <li>Décidé le {pret.decision.date ? versDateFr(pret.decision.date) : "—"}{pret.decision.comite ? ` · ${pret.decision.comite}` : ""} — {pret.decision.motif}</li>}
          </ul>
        </>
      )}

      {pret.statutBase !== "en attente" && pret.statutBase !== "refusé" && (
        <>
          <div className="bq-kpi">
            <div><span>Capital restant</span><b className="num">{fmtF(e.capitalRestant)}</b></div>
            <div><span>Intérêts dus</span><b className="num bq-or">{fmtF(e.interetsRestants)}</b></div>
            <div><span>Pénalités</span><b className="num">{fmtF(e.penalitesRestantes)}</b></div>
            <div><span>Total à régler</span><b className="num">{fmtF(e.totalDu)}</b></div>
          </div>
          {e.periodes.length > 0 && pret.regles.mode === "periode" && (
            <>
              <h3 className="bq-section">Périodes d'intérêts</h3>
              <table className="bq-table">
                <thead><tr><th>Période</th><th>Du → au</th><th className="d">Sur</th><th className="d">Intérêt</th></tr></thead>
                <tbody>{e.periodes.map((p) => (
                  <tr key={p.numero}><td>{p.numero} {p.entamee && <Pastille ton="or">entamée</Pastille>}</td><td className="m">{versDateFr(p.debut)} → {versDateFr(p.fin)}</td><td className="d num">{fmtF(p.base)}</td><td className="d num bq-or">{fmtF(p.interet)}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
          <h3 className="bq-section">Remboursements</h3>
          {pret.remboursements.length === 0 ? <div className="adm-vide">Aucun remboursement pour l'instant.</div> : (
            <table className="bq-table">
              <thead><tr><th>Date</th><th>Source</th><th className="d">Reçu</th><th className="d">Pénalités</th><th className="d">Intérêts</th><th className="d">Capital</th><th></th></tr></thead>
              <tbody>{pret.remboursements.map((r) => (
                <tr key={r.id} className={r.annule ? "est-annule" : ""}>
                  <td>{versDateFr(r.date)}</td><td className="m">{LIBELLE_SOURCE[r.source] || r.source}</td>
                  <td className="d num">{fmtF(r.montant)}</td><td className="d num">{fmtF(r.penalites)}</td><td className="d num bq-or">{fmtF(r.interets)}</td><td className="d num">{fmtF(r.capital)}</td>
                  <td className="d">{r.annule ? <Pastille ton="rouge" title={r.annuleMotif}>Annulé</Pastille> : <button type="button" className="adm-btn-ligne" onClick={() => onAnnulerRemb(pret, r)} aria-label="Annuler ce remboursement"><Undo2 size={14} aria-hidden="true" /></button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {e.totalDu > 0 && <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={() => onRegler(pret)}>Enregistrer un remboursement</button>}
        </>
      )}

      {pret.statutBase === "en attente" && (
        <>
          <h3 className="bq-section">Validation du Président</h3>
          <Champ label="Nom du Président qui décide"><input className="adm-input" value={president} onChange={(ev) => setPresident(ev.target.value)} placeholder="ex. Paul Ewane" /></Champ>
          <Champ label="Motif en cas de refus"><input className="adm-input" value={motifRefus} onChange={(ev) => setMotifRefus(ev.target.value)} /></Champ>
          <Message>{erreur}</Message>
          <div className="bq-deux">
            <button type="button" className="adm-btn adm-btn-secondaire" onClick={refuser}>Refuser</button>
            <button type="button" className="adm-btn adm-btn-action" onClick={valider}>Valider et décaisser</button>
          </div>
        </>
      )}
    </Fenetre>
  );
}

const LIBELLE_SOURCE = { especes: "Espèces", momo: "Mobile Money", epargne: "Son épargne", assurance: "Son assurance", fonds: "Son fonds" };

// ------------------------------------------------------------
// RÉGLER UN PRÊT (une ou plusieurs sources)
// ------------------------------------------------------------
function ReglementPret({ pret, groupId, utilisateur, onFermer, onFait }) {
  const { executer } = useConfirmation();
  const [date, setDate] = useState(dateDuJour());
  const [avoirs, setAvoirs] = useState(null);
  const [lignes, setLignes] = useState({ especes: "", momo: "" });
  const [erreur, setErreur] = useState("");
  useEffect(() => { fetchAvoirsMembre(groupId, pret.membreId).then(setAvoirs).catch((e) => { console.error(e); setAvoirs({ epargnes: [], assurance: 0, fonds: [] }); }); }, [pret.membreId]);

  const dISO = versDateISO(date) || aujourdhuiISO();
  const situation = situationPret(pret, pret.remboursements.filter((r) => !r.annule), dISO);
  const sources = [
    { cle: "especes", libelle: "Espèces (remises au trésorier)", source: "especes" },
    { cle: "momo", libelle: "Mobile Money", source: "momo" },
    ...(avoirs?.epargnes || []).filter((e) => e.solde > 0).map((e) => ({ cle: `ep-${e.id}`, libelle: `Son épargne — ${e.nom}`, source: "epargne", refId: e.id, dispo: e.solde })),
    ...(avoirs && avoirs.assurance > 0 ? [{ cle: "assurance", libelle: "Son assurance", source: "assurance", dispo: avoirs.assurance }] : []),
    ...(avoirs?.fonds || []).filter((f) => f.solde > 0).map((f) => ({ cle: `fd-${f.id}`, libelle: `Son fonds — ${f.nom}`, source: "fonds", refId: f.id, dispo: f.solde })),
  ];
  const total = sources.reduce((s, x) => s + nombre(lignes[x.cle]), 0);
  const rep = repartirPaiement(total, situation);
  const reste = Math.max(0, situation.totalDu - total);

  const enregistrer = async () => {
    setErreur("");
    if (!versDateISO(date)) { setErreur("Date invalide (jj/mm/aaaa)."); return; }
    if (total <= 0) { setErreur("Indique au moins un montant."); return; }
    if (total > situation.totalDu) { setErreur(`Le total dépasse ce qui est dû (${fmtF(situation.totalDu)}).`); return; }
    for (const s of sources) if (s.dispo !== undefined && nombre(lignes[s.cle]) > s.dispo) { setErreur(`${s.libelle} : seulement ${fmtF(s.dispo)} disponible.`); return; }
    const choisies = sources.filter((s) => nombre(lignes[s.cle]) > 0).map((s) => ({ source: s.source, refId: s.refId, montant: nombre(lignes[s.cle]) }));
    const res = await executer({
      titre: "Enregistrer ce remboursement ?",
      lignes: [["Membre", pret.membre], ["Date", versDateFr(dISO)], ...choisies.map((c) => [sources.find((s) => s.source === c.source && s.refId === c.refId)?.libelle, fmtF(c.montant)]),
        ["Pénalités (compte de la réunion)", fmtF(rep.penalites)], ["Intérêts (cagnotte)", fmtF(rep.interets)], ["Capital", fmtF(rep.capital)], ["Reste dû après", fmtF(reste)]],
      alertes: [reste > 0 ? `Il restera ${fmtF(reste)} à rembourser : le prêt reste ouvert (dette reportée).` : null],
      detailSucces: reste === 0 ? "Prêt soldé" : `Reste dû : ${fmtF(reste)}`,
    }, async () => {
      const r = await reglerPret(groupId, pret, { date: dISO, sources: choisies, saisiPar: utilisateur });
      if (pret.telephone) envoyerSMS({ message: `Bonjour ${pret.membre}, remboursement reçu : ${total.toLocaleString("fr-FR")} FCFA. ${r.resteDu === 0 ? "Prêt soldé." : `Reste dû : ${r.resteDu.toLocaleString("fr-FR")} FCFA.`}`, numeros: [pret.telephone], groupId });
      return r;
    });
    if (res) onFait();
  };

  return (
    <Fenetre titre={`Régler le prêt — ${pret.membre}`} onFermer={onFermer} large>
      <Champ label="Date du remboursement"><ChampDate ariaLabel="Date du remboursement" value={date} onChange={(e) => setDate(e.target.value)} /></Champ>
      <dl className="bq-fiche">
        <div><dt>Capital restant</dt><dd className="num">{fmtF(situation.capitalRestant)}</dd></div>
        <div><dt>Intérêts dus</dt><dd className="num bq-or">{fmtF(situation.interetsRestants)}</dd></div>
        <div><dt>Pénalités</dt><dd className="num">{fmtF(situation.penalitesRestantes)}</dd></div>
        <div><dt><b>Total à régler</b></dt><dd className="num"><b>{fmtF(situation.totalDu)}</b></dd></div>
      </dl>
      <h3 className="bq-section">Payer avec</h3>
      {!avoirs && <p className="adm-sous-titre">Chargement de ses avoirs…</p>}
      <table className="bq-table">
        <thead><tr><th>Source</th><th className="d">Disponible</th><th className="d">Utilisé</th></tr></thead>
        <tbody>{sources.map((s) => (
          <tr key={s.cle}><td>{s.libelle}</td><td className="d num m">{s.dispo !== undefined ? fmtF(s.dispo) : "—"}</td>
            <td className="d"><ChampMontant valeur={lignes[s.cle] || ""} onChange={(v) => setLignes((x) => ({ ...x, [s.cle]: v }))} ariaLabel={`Montant — ${s.libelle}`} /></td></tr>
        ))}</tbody>
        <tfoot><tr><td><b>Total réglé</b></td><td></td><td className="d num"><b>{fmtF(total)}</b></td></tr></tfoot>
      </table>
      {total > 0 && <div className="adm-msg adm-msg-info">Répartition : pénalités {fmtF(rep.penalites)} → intérêts {fmtF(rep.interets)} → capital {fmtF(rep.capital)}.{reste > 0 ? <> Il restera <b>{fmtF(reste)}</b> (dette reportée).</> : <> <b>Prêt soldé.</b></>}</div>}
      <Message>{erreur}</Message>
      <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={enregistrer}>Valider le règlement</button>
    </Fenetre>
  );
}

// ------------------------------------------------------------
// HISTORIQUE DES MOUVEMENTS
// ------------------------------------------------------------
const TON_TYPE = { Versement: "vert", Retrait: "rouge", "Prêt": "violet", Remboursement: "vert", "Intérêts": "or", Transfert: "neutre" };
function Historique({ mouvements, onAnnuler }) {
  return (
    <>
      <div className="bq-table-cadre">
        <table className="bq-table">
          <thead><tr><th>Date</th><th>Membre</th><th>Épargne</th><th>Type</th><th className="d">Montant</th><th className="d">Solde après</th><th></th></tr></thead>
          <tbody>{mouvements.map((m) => (
            <tr key={m.id} className={m.annule ? "est-annule" : ""}>
              <td className="m">{versDateFr(m.date)}</td><td>{m.membre}</td><td className="m">{m.epargne}</td>
              <td><Pastille ton={TON_TYPE[m.type] || "neutre"}>{m.type}{m.pretId && m.type === "Retrait" ? " (prêt)" : ""}</Pastille></td>
              <td className="d num"><b>{fmtF(m.montant)}</b></td><td className="d num m">{m.solde !== null && m.solde !== undefined ? fmtF(m.solde) : "—"}</td>
              <td className="d">{m.annule
                ? <span className="bq-annule-info" title={`${m.annuleMotif || ""} — ${m.annulePar || ""}`}><Pastille ton="rouge">Annulé</Pastille></span>
                : ["Versement", "Retrait"].includes(m.type) && !m.pretId && <button type="button" className="adm-btn-ligne" onClick={() => onAnnuler(m)}><Undo2 size={14} aria-hidden="true" /> Annuler</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {mouvements.length === 0 && <div className="adm-vide">Aucun mouvement pour l'instant.</div>}
      </div>
      <div className="adm-aide adm-aide-espace">Une erreur de saisie ne s'efface jamais : elle est <b>annulée</b> avec un motif. La ligne reste visible, barrée, et ne compte plus nulle part. Ressaisis ensuite le bon montant avec la bonne date.</div>
    </>
  );
}

function Annulation({ demande, groupId, utilisateur, onFermer, onFait }) {
  const { executer } = useConfirmation();
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState("");
  const o = demande.objet;
  const valider = async () => {
    setErreur("");
    if (!motif.trim()) { setErreur("Le motif est obligatoire."); return; }
    const res = await executer({
      titre: "Annuler cette opération ?",
      lignes: [["Opération", demande.type === "remboursement" ? `Remboursement — ${demande.pret.membre}` : `${o.type} — ${o.membre}`], ["Date", versDateFr(o.date)], ["Montant", fmtF(o.montant)], ["Motif", motif]],
      alertes: ["La ligne restera visible, barrée, avec ce motif et ton nom."],
      danger: true, libelleConfirmer: "Annuler l'opération", detailSucces: "Opération annulée",
    }, () => demande.type === "remboursement"
      ? annulerRemboursement(groupId, demande.pret, o, { motif, par: utilisateur })
      : annulerMouvementEpargne(o, { motif, par: utilisateur }));
    if (res) onFait();
  };
  return (
    <Fenetre titre="Annuler une erreur de saisie" onFermer={onFermer}>
      <p className="adm-sous-titre">{demande.type === "remboursement" ? `Remboursement de ${demande.pret.membre}` : `${o.type} de ${o.membre}`} du {versDateFr(o.date)} : <b>{fmtF(o.montant)}</b></p>
      <Champ label="Motif (obligatoire)"><input className="adm-input" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex. Erreur de saisie : 39 000 et non 139 000" autoFocus /></Champ>
      <Message>{erreur}</Message>
      <button type="button" className="adm-btn adm-btn-danger bq-plein" onClick={valider}>Annuler l'opération</button>
    </Fenetre>
  );
}

// ------------------------------------------------------------
// COMPTE DE LA RÉUNION
// ------------------------------------------------------------
const LIBELLE_ORIGINE = { frais_dossier: "Frais de dossier", penalite_pret: "Pénalité de prêt", arrondi: "Reste d'arrondi", penalite_garde: "Pénalité somme gardée", depense: "Dépense", autre: "Autre" };
function CompteReunion({ compte, onEcrire }) {
  return (
    <>
      <div className="bq-resume">
        <span>Solde du compte de la réunion : <b className="num">{fmtF(compte.solde)}</b></span>
        <button type="button" className="adm-btn-ligne" onClick={onEcrire}><Wallet size={14} aria-hidden="true" /> Ajouter une entrée ou une sortie</button>
      </div>
      <div className="bq-table-cadre">
        <table className="bq-table">
          <thead><tr><th>Date</th><th>Origine</th><th>Libellé</th><th className="d">Montant</th></tr></thead>
          <tbody>{compte.lignes.map((l) => (
            <tr key={l.id} className={l.annule ? "est-annule" : ""}>
              <td className="m">{versDateFr(l.date)}</td><td><Pastille ton={l.montant >= 0 ? "vert" : "rouge"}>{LIBELLE_ORIGINE[l.origine] || l.origine}</Pastille></td>
              <td>{l.libelle || "—"}{l.saisiPar ? <span className="m"> · {l.saisiPar}</span> : null}</td>
              <td className="d num"><b>{l.montant >= 0 ? "+" : "−"} {fmtF(Math.abs(l.montant))}</b></td>
            </tr>
          ))}</tbody>
        </table>
        {compte.lignes.length === 0 && <div className="adm-vide">Rien pour l'instant. Les frais de dossier, pénalités et arrondis arrivent ici automatiquement.</div>}
      </div>
      <div className="adm-aide adm-aide-espace"><ShieldCheck size={14} aria-hidden="true" /> Ce compte appartient à la réunion et ne se partage pas à la clôture. Il sert selon les décisions du groupe (dépense, aide, fête…).</div>
    </>
  );
}

function EcritureCompte({ groupId, utilisateur, onFermer, onFait }) {
  const { executer } = useConfirmation();
  const [sens, setSens] = useState("sortie");
  const [montant, setMontant] = useState("");
  const [date, setDate] = useState(dateDuJour());
  const [libelle, setLibelle] = useState("");
  const [erreur, setErreur] = useState("");
  const valider = async () => {
    setErreur("");
    const m = nombre(montant);
    const d = versDateISO(date);
    if (!m || !d || !libelle.trim()) { setErreur("Montant, date et motif sont obligatoires."); return; }
    const res = await executer({ titre: sens === "sortie" ? "Enregistrer cette sortie ?" : "Enregistrer cette entrée ?", lignes: [["Date", versDateFr(d)], ["Motif", libelle], ["Montant", `${sens === "sortie" ? "−" : "+"} ${fmtF(m)}`]] },
      () => ecrireCompteReunion(groupId, { date: d, montant: sens === "sortie" ? -m : m, origine: sens === "sortie" ? "depense" : "autre", libelle: libelle.trim(), saisiPar: utilisateur }));
    if (res) onFait();
  };
  return (
    <Fenetre titre="Compte de la réunion" onFermer={onFermer}>
      <Choix nom="Sens" valeur={sens} onChange={setSens} options={[{ valeur: "sortie", libelle: "Sortie (décision du groupe)" }, { valeur: "entree", libelle: "Entrée (autre frais)" }]} />
      <div className="bq-deux">
        <Champ label="Montant"><ChampMontant valeur={montant} onChange={setMontant} ariaLabel="Montant" /></Champ>
        <Champ label="Date"><ChampDate ariaLabel="Date" value={date} onChange={(e) => setDate(e.target.value)} /></Champ>
      </div>
      <Champ label="Motif / décision"><input className="adm-input" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="ex. Aide décidée en séance du 25/10" /></Champ>
      <Message>{erreur}</Message>
      <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={valider}>Enregistrer</button>
    </Fenetre>
  );
}

