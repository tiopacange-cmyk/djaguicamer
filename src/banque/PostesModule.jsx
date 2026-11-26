import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck, UserCog } from "lucide-react";
import { fetchPostes, creerPoste, modifierPoste, supprimerPoste, attribuerPoste, MODULES, NIVEAUX, POSTES_PROPOSES, peut } from "../lib/postes";
import { useConfirmation, fmtF } from "../ui/Confirmation";
import { fetchPretsBanque } from "../lib/banque2";
import { fetchOperationsEnAttente, RUBRIQUES } from "../lib/lectures";
import { versDateFr } from "../ui/ChampDate";
import { Fenetre, Champ, Pastille, Message, Choix } from "./communs";

const TON_NIVEAU = { aucun: "neutre", lire: "bleu", saisir: "vert", valider: "or" };
const COURT = { aucun: "—", lire: "lire", saisir: "saisir", valider: "valider" };

export default function PostesModule({ groupId, membres, droits, onChange }) {
  const { executer } = useConfirmation();
  const gere = peut(droits, "postes", "valider");
  const [postes, setPostes] = useState([]);
  const [erreur, setErreur] = useState("");
  const [edition, setEdition] = useState(null); // poste à modifier, ou { nouveau: true }

  const recharger = async () => {
    try {
      const p = await fetchPostes(groupId, { creerSiVide: gere });
      setPostes(p); setErreur(""); onChange?.(p);
    } catch (e) {
      console.error(e);
      setErreur("Impossible de charger les postes. Vérifie que la mise à jour de la base (script 2026-11-postes-bureau.sql) a bien été faite.");
    }
  };
  useEffect(() => { if (groupId) recharger(); }, [groupId]);

  const actifs = membres.filter((m) => m.statut !== "inactif");
  const titulaires = (p) => actifs.filter((m) => m.posteId === p.id);

  const changerPoste = async (m, posteId) => {
    const poste = postes.find((p) => p.id === posteId);
    const res = await executer({
      titre: posteId ? "Attribuer ce poste ?" : "Retirer ce membre du bureau ?",
      lignes: [["Membre", m.nom], ["Poste", poste ? poste.nom : "Aucun (membre simple)"]],
      alertes: [posteId ? `${m.nom} aura accès à l'espace bureau avec les droits du poste « ${poste?.nom} ».` : `${m.nom} n'aura plus accès à l'espace bureau.`],
      module: "postes", detailSucces: posteId ? `${m.nom} : ${poste?.nom}` : `${m.nom} est membre simple`,
    }, () => attribuerPoste(m.id, posteId));
    if (res) onChange?.(postes, true);
  };

  return (
    <>
      <div className="adm-entete">
        <div>
          <h1 className="adm-titre">Postes et droits du bureau</h1>
          <p className="adm-sous-titre">Chaque poste a un niveau par module : consulter, saisir, ou valider. Vous pouvez créer d'autres postes et ajuster tous les droits.</p>
        </div>
        {gere && <button type="button" className="adm-btn adm-btn-action" onClick={() => setEdition({ nouveau: true })}><Plus size={15} aria-hidden="true" /> Nouveau poste</button>}
      </div>
      <Message>{erreur}</Message>
      {!gere && <Message ton="info">Seul le Président (ou le poste qui a « Postes et droits : valider ») peut modifier cette page.</Message>}

      <div className="bq-table-cadre">
        <table className="bq-table pt-matrice">
          <thead>
            <tr>
              <th>Module</th>
              {postes.map((p) => (
                <th key={p.id} className="pt-col">
                  <div className="pt-poste">{p.nom}</div>
                  <div className="pt-titulaires">{titulaires(p).map((m) => m.nom).join(", ") || "—"}</div>
                  {gere && <button type="button" className="adm-btn-ligne pt-modifier" onClick={() => setEdition(p)} aria-label={`Modifier le poste ${p.nom}`}><Pencil size={13} aria-hidden="true" /> Modifier</button>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((mod) => (
              <tr key={mod.cle}>
                <td><b>{mod.libelle}</b>{mod.aide && <div className="m pt-aide">{mod.aide}</div>}</td>
                {postes.map((p) => <td key={p.id} className="pt-cellule"><Pastille ton={TON_NIVEAU[p.droits[mod.cle]]}>{COURT[p.droits[mod.cle]]}</Pastille></td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {postes.length === 0 && !erreur && <div className="adm-vide">Aucun poste pour l'instant.</div>}
      </div>
      <div className="adm-aide adm-aide-espace">« Valider » comprend « saisir », qui comprend « consulter ». Ce qu'un poste saisit sans pouvoir le valider (un crédit par exemple) attend la validation dans « À valider ».</div>

      <h2 className="bq-section"><UserCog size={14} aria-hidden="true" /> Qui occupe quel poste ?</h2>
      <div className="bq-table-cadre">
        <table className="bq-table">
          <thead><tr><th>Membre</th><th>Poste au bureau</th></tr></thead>
          <tbody>{actifs.map((m) => (
            <tr key={m.id}>
              <td>{m.nom}{m.isPresident && <> <Pastille ton="or">Président (compte)</Pastille></>}{!m.posteId && m.isAdmin && <> <Pastille ton="violet">Accès complet</Pastille></>}</td>
              <td>
                {gere ? (
                  <select className="adm-input" aria-label={`Poste de ${m.nom}`} value={m.posteId || ""} onChange={(e) => changerPoste(m, e.target.value || null)}>
                    <option value="">{!m.posteId && m.isAdmin ? "Accès complet (sans poste)" : "Aucun — membre simple"}</option>
                    {postes.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                ) : (postes.find((p) => p.id === m.posteId)?.nom || (m.isAdmin ? "Accès complet" : "Membre simple"))}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="adm-aide adm-aide-espace"><ShieldCheck size={14} aria-hidden="true" /> « Accès complet » : administrateurs créés avant les postes. Donnez-leur un poste pour limiter leurs droits.</div>

      {edition && <EditionPoste poste={edition.nouveau ? null : edition} postes={postes} groupId={groupId} nbTitulaires={edition.nouveau ? 0 : titulaires(edition).length}
        onFermer={() => setEdition(null)} onFait={() => { setEdition(null); recharger(); }} />}
    </>
  );
}

function EditionPoste({ poste, postes, groupId, nbTitulaires, onFermer, onFait }) {
  const { executer } = useConfirmation();
  const [nom, setNom] = useState(poste?.nom || "");
  const [droits, setDroits] = useState(() => ({ ...(poste?.droits || Object.fromEntries(MODULES.map((m) => [m.cle, "lire"]))) }));
  const [modele, setModele] = useState("");
  const [erreur, setErreur] = useState("");

  const copier = (id) => {
    setModele(id);
    const source = postes.find((p) => p.id === id) || POSTES_PROPOSES.find((p) => p.modele === id);
    if (source) setDroits({ ...source.droits, postes: "aucun" });
  };

  const enregistrer = async () => {
    setErreur("");
    if (!nom.trim()) { setErreur("Donne un nom au poste."); return; }
    if (postes.some((p) => p.id !== poste?.id && p.nom.trim().toLowerCase() === nom.trim().toLowerCase())) { setErreur("Un poste porte déjà ce nom."); return; }
    const res = await executer({
      titre: poste ? `Enregistrer le poste « ${nom.trim()} » ?` : `Créer le poste « ${nom.trim()} » ?`,
      lignes: MODULES.filter((m) => droits[m.cle] !== "aucun").map((m) => [m.libelle, NIVEAUX.find((n) => n.cle === droits[m.cle])?.libelle]),
      alertes: [droits.postes === "valider" ? "Ce poste pourra attribuer les postes et changer tous les droits." : null, poste && nbTitulaires ? `${nbTitulaires} membre(s) occupent ce poste : leurs droits changent tout de suite.` : null],
      module: "postes", detailSucces: poste ? "Poste enregistré" : "Poste créé",
    }, () => poste ? modifierPoste(poste.id, { nom, droits }) : creerPoste(groupId, { nom, droits }));
    if (res) onFait();
  };

  const supprimer = async () => {
    if (nbTitulaires) { setErreur("Ce poste est occupé : attribue d'abord un autre poste à ses membres."); return; }
    const res = await executer({ titre: `Supprimer le poste « ${poste.nom} » ?`, danger: true, libelleConfirmer: "Supprimer", module: "postes", detailSucces: "Poste supprimé" }, () => supprimerPoste(poste.id));
    if (res) onFait();
  };

  return (
    <Fenetre titre={poste ? `Poste — ${poste.nom}` : "Nouveau poste"} onFermer={onFermer} large>
      <div className="bq-deux">
        <Champ label="Nom du poste" id="pt-nom"><input id="pt-nom" className="adm-input" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Trésorier adjoint, Chargé des fêtes" /></Champ>
        <Champ label="Partir des droits de…" id="pt-modele">
          <select id="pt-modele" className="adm-input" value={modele} onChange={(e) => copier(e.target.value)}>
            <option value="">— choisir —</option>
            {postes.filter((p) => p.id !== poste?.id).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </Champ>
      </div>
      <div className="pt-edition">
        {MODULES.map((m) => (
          <div key={m.cle} className="pt-ligne">
            <div><b>{m.libelle}</b>{m.aide && <div className="m pt-aide">{m.aide}</div>}</div>
            <Choix nom={m.libelle} valeur={droits[m.cle] || "aucun"} onChange={(v) => setDroits((x) => ({ ...x, [m.cle]: v }))}
              options={NIVEAUX.map((n) => ({ valeur: n.cle, libelle: n.libelle }))} />
          </div>
        ))}
      </div>
      <Message>{erreur}</Message>
      <div className={poste ? "bq-deux" : ""}>
        {poste && <button type="button" className="adm-btn adm-btn-secondaire bq-plein" onClick={supprimer}><Trash2 size={15} aria-hidden="true" /> Supprimer ce poste</button>}
        <button type="button" className="adm-btn adm-btn-action bq-plein" onClick={enregistrer}>{poste ? "Enregistrer" : "Créer le poste"}</button>
      </div>
    </Fenetre>
  );
}

// ------------------------------------------------------------
// À VALIDER : ce que d'autres postes ont préparé
// ------------------------------------------------------------
export async function compterAValider(groupId) {
  const [prets, ops] = await Promise.all([fetchPretsBanque(groupId), fetchOperationsEnAttente(groupId)]);
  return prets.filter((p) => p.statutBase === "en attente").length + ops.filter((o) => o.statut === "lecture2").length;
}

export function AValider({ groupId, droits, onAller }) {
  const [prets, setPrets] = useState(null);
  const [ops, setOps] = useState([]);
  useEffect(() => {
    fetchPretsBanque(groupId).then((p) => setPrets(p.filter((x) => x.statutBase === "en attente"))).catch(() => setPrets([]));
    fetchOperationsEnAttente(groupId).then((o) => setOps(o.filter((x) => x.statut === "lecture2"))).catch(() => setOps([]));
  }, [groupId]);
  const rien = prets && prets.length === 0 && ops.length === 0;
  return (
    <>
      <div className="adm-entete">
        <div>
          <h1 className="adm-titre">À valider</h1>
          <p className="adm-sous-titre">Ce que les autres postes ont préparé et qui attend votre validation. Rien ne bouge dans les soldes avant.</p>
        </div>
      </div>
      {prets === null && <p className="adm-sous-titre">Chargement…</p>}
      {rien && <div className="adm-vide">Rien à valider pour l'instant.</div>}
      {peut(droits, "credits", "valider") && prets?.length > 0 && (
        <>
          <h2 className="bq-section">Prêts en attente ({prets.length})</h2>
          <div className="av-liste">{prets.map((p) => (
            <div key={p.id} className="av-carte">
              <div className="av-titre">{p.special ? "Prêt spécial" : "Prêt"} de {fmtF(p.montant)} — {p.membre}</div>
              <div className="m">Préparé par {p.saisiPar || "—"} · {p.epargneNom} · {versDateFr(p.dateDebut)}</div>
              <button type="button" className="adm-btn adm-btn-action" onClick={() => onAller("banque", "prets")}>Ouvrir pour valider ou refuser</button>
            </div>
          ))}</div>
        </>
      )}
      {peut(droits, "lectures", "valider") && ops.length > 0 && (
        <>
          <h2 className="bq-section">Saisies relues deux fois ({ops.length})</h2>
          <div className="av-liste">{ops.map((o) => (
            <div key={o.id} className="av-carte">
              <div className="av-titre">{o.titre} — {fmtF(o.total)}</div>
              <div className="m">{RUBRIQUES[o.rubrique]} · saisi par {o.saisiPar || "—"} · lu par {o.lecture1?.par} et {o.lecture2?.par}</div>
              <button type="button" className="adm-btn adm-btn-action" onClick={() => onAller("lectures")}>Ouvrir pour valider</button>
            </div>
          ))}</div>
        </>
      )}
    </>
  );
}
