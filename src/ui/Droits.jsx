import React, { createContext, useContext } from "react";
import { peut as peutDroit } from "../lib/postes";

// Droits du poste de la personne connectée, partagés par tous les écrans.
// Sans fournisseur (tests, anciens écrans) : tout est permis.
const Ctx = createContext(null);

export function DroitsProvider({ droits, children }) {
  return <Ctx.Provider value={droits}>{children}</Ctx.Provider>;
}

export function useDroits() {
  const droits = useContext(Ctx);
  return {
    droits,
    peut: (module, niveau = "lire") => (droits ? peutDroit(droits, module, niveau) : true),
  };
}
