import React, { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";

// Date du jour au format de l'interface (jj/mm/aaaa)
export function dateDuJour() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Champ de date : saisie jj/mm/aaaa (les « / » s'ajoutent seuls), date du
// jour par défaut, et bouton qui ouvre le calendrier de l'appareil.
// La valeur reste au format jj/mm/aaaa, comme dans le reste de l'interface.
export function ChampDate({ label, value, onChange, aujourdhuiParDefaut = true, placeholder = "jj/mm/aaaa", compact = false, id, ariaLabel }) {
  const autoId = React.useId();
  const champId = id || autoId;
  const calendrierRef = useRef(null);
  const [interne, setInterne] = useState("");
  const controle = value !== undefined;
  const valeur = controle ? value : interne;

  const emettre = (v) => {
    if (controle) onChange?.({ target: { value: v } });
    else setInterne(v);
  };

  // Date du jour à l'ouverture du formulaire, si le champ est vide
  useEffect(() => {
    if (aujourdhuiParDefaut && !valeur) emettre(dateDuJour());
  }, []);

  const saisir = (texte) => {
    if (/[^\d/]/.test(texte)) { emettre(texte); return; }
    const c = texte.replace(/\D/g, "").slice(0, 8);
    emettre(c.length <= 2 ? c : c.length <= 4 ? `${c.slice(0, 2)}/${c.slice(2)}` : `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`);
  };

  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valeur || "");
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : "";

  const ouvrirCalendrier = () => {
    const el = calendrierRef.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };

  const champ = (
    <div className={`champ-date${compact ? " champ-date-compact" : ""}`}>
      <input
        id={champId}
        className={`adm-input${compact ? " adm-input-compact" : ""}`}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={label ? undefined : ariaLabel || placeholder}
        value={valeur}
        onChange={(e) => saisir(e.target.value)}
      />
      <button type="button" className="champ-date-btn" onClick={ouvrirCalendrier} aria-label="Choisir une date dans le calendrier">
        <Calendar size={compact ? 16 : 18} aria-hidden="true" />
      </button>
      <input
        ref={calendrierRef}
        type="date"
        className="champ-date-natif"
        tabIndex={-1}
        aria-hidden="true"
        value={iso}
        onChange={(e) => {
          const [a, mo, j] = (e.target.value || "").split("-");
          emettre(a && mo && j ? `${j}/${mo}/${a}` : "");
        }}
      />
    </div>
  );

  if (!label) return champ;
  return (
    <div>
      <label htmlFor={champId} className="adm-label">{label}</label>
      {champ}
    </div>
  );
}


// jj/mm/aaaa → aaaa-mm-jj (null si invalide)
export function versDateISO(str) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((str || "").trim());
  if (!m) return null;
  const [, j, mo, a] = m;
  const d = new Date(Date.UTC(+a, +mo - 1, +j));
  if (d.getUTCDate() !== +j || d.getUTCMonth() !== +mo - 1) return null;
  return `${a}-${mo.padStart(2, "0")}-${j.padStart(2, "0")}`;
}

// aaaa-mm-jj → jj/mm/aaaa
export function versDateFr(iso) {
  if (!iso) return "";
  const [a, m, j] = String(iso).slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}
