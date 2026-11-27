import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

// ============================================================
// SÉCURITÉ DES OPÉRATIONS
// Avant chaque opération : un récapitulatif à confirmer.
// Après : « Opération effectuée avec succès » (ou une erreur claire).
// ============================================================

const Ctx = createContext(null);

export function ConfirmationProvider({ children }) {
  const [demande, setDemande] = useState(null);
  const [toast, setToast] = useState(null);
  const resolveRef = useRef(null);
  const minuterie = useRef(null);
  // Garde des droits : renvoie un message si l'opération n'est pas
  // permise au poste de la personne connectée (sinon null).
  const gardeRef = useRef(null);
  const definirGarde = useCallback((fn) => { gardeRef.current = fn; }, []);

  const confirmer = useCallback((options = {}) => {
    const refus = gardeRef.current?.(options);
    if (refus) {
      montrerRef.current?.({ type: "erreur", message: "Action non autorisée pour votre poste", detail: refus });
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDemande(options);
    });
  }, []);
  const montrerRef = useRef(null);

  const fermer = (valeur) => {
    setDemande(null);
    resolveRef.current?.(valeur);
    resolveRef.current = null;
  };

  const montrer = useCallback((t) => {
    clearTimeout(minuterie.current);
    setToast(t);
    minuterie.current = setTimeout(() => setToast(null), t.type === "erreur" ? 8000 : 4500);
  }, []);

  montrerRef.current = montrer;
  const succes = useCallback((message = "Opération effectuée avec succès", detail = "") => montrer({ type: "succes", message, detail }), [montrer]);
  const echec = useCallback((message, detail = "") => montrer({ type: "erreur", message, detail }), [montrer]);

  // Confirme, exécute, puis affiche le résultat. Renvoie le résultat
  // de l'action, ou null si l'utilisateur a annulé ou si ça a échoué.
  const executer = useCallback(async (options, action) => {
    const ok = await confirmer(options);
    if (!ok) return null;
    try {
      const res = await action();
      succes(options.messageSucces || "Opération effectuée avec succès", typeof options.detailSucces === "function" ? options.detailSucces(res) : (options.detailSucces || ""));
      return res ?? true;
    } catch (e) {
      console.error(e);
      echec("L'opération n'a pas abouti", e?.message || "Erreur inconnue. Rien n'a été validé, réessaie.");
      return null;
    }
  }, [confirmer, succes, echec]);

  useEffect(() => {
    if (!demande) return;
    const clavier = (e) => { if (e.key === "Escape") fermer(false); };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, [demande]);

  return (
    <Ctx.Provider value={{ confirmer, succes, echec, executer, definirGarde }}>
      {children}
      {demande && (
        <div className="modal-fond conf-fond">
          <div className="responsive-modal modal conf-modal" role="alertdialog" aria-modal="true" aria-labelledby="conf-titre">
            <div className="modal-entete">
              <h2 id="conf-titre" className="modal-titre">{demande.titre || "Confirmer l'opération ?"}</h2>
              <button type="button" className="modal-fermer" onClick={() => fermer(false)} aria-label="Annuler"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="modal-corps">
              {demande.texte && <p className="conf-texte">{demande.texte}</p>}
              {demande.lignes?.length > 0 && (
                <dl className="conf-lignes">
                  {demande.lignes.filter(Boolean).map(([l, v], i) => (
                    <div key={i} className={`conf-ligne${i === demande.lignes.length - 1 && demande.totalEnDernier ? " conf-total" : ""}`}><dt>{l}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
              )}
              {demande.alertes?.filter(Boolean).map((a, i) => (
                <div key={i} className="adm-msg adm-msg-attente conf-alerte" role="note"><AlertTriangle size={15} aria-hidden="true" /> {a}</div>
              ))}
              <div className="conf-actions">
                <button type="button" className="adm-btn adm-btn-secondaire" onClick={() => fermer(false)}>Annuler</button>
                <button type="button" className={`adm-btn ${demande.danger ? "adm-btn-danger" : "adm-btn-action"}`} onClick={() => fermer(true)} autoFocus>
                  {demande.libelleConfirmer || "Confirmer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className={`toast toast-${toast.type}`} role="status" aria-live="polite">
          {toast.type === "succes" ? <CheckCircle2 size={22} aria-hidden="true" /> : <AlertTriangle size={22} aria-hidden="true" />}
          <div>
            <div className="toast-titre">{toast.message}</div>
            {toast.detail && <div className="toast-detail">{toast.detail}</div>}
          </div>
          <button type="button" className="toast-fermer" onClick={() => setToast(null)} aria-label="Fermer"><X size={16} aria-hidden="true" /></button>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useConfirmation() {
  const c = useContext(Ctx);
  if (!c) {
    // Hors du fournisseur (tests) : on confirme sans demander.
    return {
      confirmer: async () => true,
      succes: () => {},
      echec: () => {},
      executer: async (_o, action) => action(),
      definirGarde: () => {},
    };
  }
  return c;
}

export const fmtF = (n) => `${Math.round(Number(n) || 0).toLocaleString("fr-FR")} F`;
