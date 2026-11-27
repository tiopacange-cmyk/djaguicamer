import React from "react";
import { X } from "lucide-react";

// Petits éléments partagés par les écrans Banque et Caisse.

export function Fenetre({ titre, onFermer, children, large = false, badge = null }) {
  return (
    <div className="modal-fond">
      <div className={`responsive-modal modal${large ? " modal-large" : ""}`} role="dialog" aria-modal="true" aria-label={titre}>
        <div className="modal-entete">
          <div className="modal-titre-groupe">
            <h2 className="modal-titre">{titre}</h2>
            {badge}
          </div>
          <button type="button" className="modal-fermer" onClick={onFermer} aria-label="Fermer"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="modal-corps">{children}</div>
      </div>
    </div>
  );
}

export function Champ({ label, aide, children, id }) {
  return (
    <div className="bq-champ">
      {label && <label className="adm-label" htmlFor={id}>{label}</label>}
      {children}
      {aide && <div className="adm-aide">{aide}</div>}
    </div>
  );
}

export function Pastille({ ton = "neutre", children }) {
  return <span className={`bq-pastille bq-${ton}`}>{children}</span>;
}

export function Message({ ton = "erreur", children }) {
  if (!children) return null;
  return <div className={`adm-msg adm-msg-${ton}`} role={ton === "erreur" ? "alert" : "status"}>{children}</div>;
}

export function Choix({ options, valeur, onChange, nom }) {
  return (
    <div className="bq-choix" role="radiogroup" aria-label={nom}>
      {options.map((o) => (
        <button key={o.valeur} type="button" role="radio" aria-checked={valeur === o.valeur}
          className={`bq-choix-option${valeur === o.valeur ? " est-actif" : ""}`} onClick={() => onChange(o.valeur)}>
          {o.libelle}
        </button>
      ))}
    </div>
  );
}

// Saisie d'un montant : chiffres seulement, affichage groupé.
export function ChampMontant({ valeur, onChange, id, placeholder = "0", ariaLabel }) {
  const affiche = valeur === "" || valeur === null || valeur === undefined ? "" : Number(String(valeur).replace(/\D/g, "") || 0).toLocaleString("fr-FR");
  return (
    <div className="bq-montant">
      <input id={id} className="adm-input" inputMode="numeric" autoComplete="off" placeholder={placeholder} aria-label={ariaLabel}
        value={affiche} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
      <span className="bq-montant-unite" aria-hidden="true">F</span>
    </div>
  );
}

export const nombre = (v) => Number(String(v ?? "").replace(/\D/g, "")) || 0;
