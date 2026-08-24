import React, { useState, useEffect, useRef } from "react";
import { fetchMembres, inviterMembre, validerMembre, modifierMembre, toggleActifMembre, fetchMonCompteMembre, supprimerMembre, reinitialiserMotDePasseMembre, televerserDocumentMembre, fetchDocumentsMembre } from "./lib/membres";
import { fetchTypesFonds, creerTypeFonds, supprimerTypeFonds, fetchFondsTousMembres, fixerCibleTypeFonds, enregistrerVersementFonds, fetchFondsMembre } from "./lib/fonds";
import { signIn, signOut, getSession, getMonProfil, getMesGroupes, onAuthStateChange, demanderReinitialisationMotDePasse } from "./lib/auth";
import { fetchGroupes, creerGroupeAvecAdmin, fetchAdminsDesGroupes, reinitialiserMotDePasseDirect, changerMotDePasse, fetchAuditLog, fetchPlansTarifaires, modifierPlanTarifaire, fetchStatutAbonnement, renouvelerAbonnement, televerserLogoGroupe, fetchLogoGroupe, modifierGroupe, suspendreGroupe, reactiverGroupe, fetchStatsPlateforme, fetchSoldeSms, vendreCreditsSms, definirBlocageSms, fetchHistoriqueSms } from "./lib/groups";
import { fetchTontineActive, creerTontine, verserTour, enregistrerCotisationsTontine, fetchCotisationsTour, appliquerAmendeTontine, ajouterMembreAuCycle, enregistrerEnchere, fetchApercuRedistribution, redistribuerCommission, fetchTotalRedistributions } from "./lib/tontine";
import { fetchEpargnes, creerEpargne, enregistrerCotisationsEpargne, fetchHistoriqueEpargnes, fetchPrets, mettreEnPlaceCredit, fetchApercuCloture, cloturerEpargne } from "./lib/banque";
import { fetchConfigAssurance, sauvegarderConfigAssurance, fetchSoldesAssurance, enregistrerCotisationsAssurance, fetchTypesEvenement, creerTypeEvenement, fetchEvenements, declarerEvenement, fetchHistoriqueAssurance } from "./lib/assurance";
import { fetchComptesBancaires, creerCompteBancaire, fetchSignataires, ajouterSignataire, fetchMouvementsCompte, creerMouvementExterne, fetchCategoriesFrais, creerCategorieFrais, supprimerCategorieFrais, joindreRecu } from "./lib/depots_retrait";
import { fetchThemeActuel, definirTheme } from "./lib/theme";
import { fetchRapportJournalier, fetchRapportMensuel, fetchBilanAnnuel } from "./lib/rapports";
import { fetchSeances, creerSeance, enregistrerCompteRendu, supprimerSeance, fetchPresences, enregistrerPresences, fetchTauxPresence, fetchTypesAmendesSeance, creerTypeAmendeSeance, modifierTypeAmendeSeance, supprimerTypeAmendeSeance, fetchAmendesSeance, appliquerAmendeSeance, fetchCaisseAmendes, payerAmendeSeance } from "./lib/seances";
import { fetchCaisseRafraichissement, fetchRafraichissements, creerRafraichissement, fetchTypesDepenses, creerTypeDepense, supprimerTypeDepense, fetchDepenses, creerDepense, libelleSourceDepense } from "./lib/depenses";
import { envoyerSMS } from "./lib/sms";
import { fetchTableauDeBordMembre } from "./lib/moncompte";

// Polyfill : en dehors de Claude.ai, window.storage n'existe pas.
// On simule la même API avec localStorage, pour que l'app fonctionne
// telle quelle une fois déployée (Vercel, Netlify, etc.)
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      const raw = localStorage.getItem(key);
      if (raw === null) throw new Error("not found");
      return { key, value: raw, shared: false };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return { key, value, shared: false };
    },
    async delete(key) {
      localStorage.removeItem(key);
      return { key, deleted: true, shared: false };
    },
    async list(prefix) {
      const keys = Object.keys(localStorage).filter((k) => !prefix || k.startsWith(prefix));
      return { keys, prefix, shared: false };
    },
  };
}
import {
  Users, Plus, KeyRound, Search, ShieldAlert, ChevronRight, Building2, X,
  CreditCard, ScrollText, LayoutDashboard, Wallet, Shield, FileBarChart,
  Gavel, Bell, LogOut, Moon, Sun, Lock, ChevronLeft, CheckCircle2, Clock,
  Banknote, PiggyBank, HeartHandshake, UserCog, Calendar, Repeat, Eye, EyeOff, AlertTriangle, ShoppingCart, Palette,
} from "lucide-react";

// ---------- Palette partagée ----------
// Format uniforme pour tous les SMS de confirmation de mouvement
// financier : "Bonjour X, opération réussie : [opération] de
// [montant]. Solde : [solde]." — le solde et les détails sont
// facultatifs, certaines opérations (amende, prêt...) n'ont pas
// de solde personnel à afficher.
function msgOperation(nom, operation, montant, solde, details) {
  const fmt = (n) => `${Math.round(n || 0).toLocaleString("fr-FR")} FCFA`;
  let msg = `Bonjour ${nom}, opération réussie : ${operation} de ${fmt(montant)}.`;
  if (details) msg += ` ${details}.`;
  if (solde !== undefined && solde !== null) msg += ` Solde : ${fmt(solde)}.`;
  return msg;
}

const C = {
  ink: "#1B2420", sub: "#5B6B5F", accent: "#B8860F", accent2: "#1B4332",
  border: "#E5DFCE", bg: "#FAF6ED", panel: "#FFFFFF", purple: "#6B5FA6",
  warn: "#A44A1F", warnBg: "#F9E4D8", ok: "#E4EFE6",
  // Couleurs vives par module, pour distinguer les formulaires d'un coup d'œil
  vifOr: "#E8A317", vifVert: "#16A34A", vifBleu: "#2563EB", vifRose: "#DB2777", vifViolet: "#7C3AED", vifCorail: "#EA580C",
};

// Les 3 thèmes disponibles ne changent que les couleurs de marque
// (accent, accent2, purple) — les couleurs neutres et sémantiques
// (texte, fond, succès, alerte) restent identiques pour garder une
// bonne lisibilité quel que soit le thème choisi.
const THEMES = {
  vert: { nom: "Vert profond", accent: "#C9971D", accent2: "#0F5132", purple: "#6B5FA6" },
  bleu: { nom: "Bleu dynamique", accent: "#F59E0B", accent2: "#1E40AF", purple: "#6B5FA6" },
  violet: { nom: "Violet moderne", accent: "#D97706", accent2: "#5B21B6", purple: "#9333EA" },
};

export default function AppPrototype() {
  const [chargementSession, setChargementSession] = useState(true);
  const [connecte, setConnecte] = useState(false);
  const [monProfil, setMonProfil] = useState(null);
  const [mesGroupes, setMesGroupes] = useState([]);
  const [modeRecuperation, setModeRecuperation] = useState(false);
  const [vueEspacePersonnel, setVueEspacePersonnel] = useState(false);
  const [statutAbonnement, setStatutAbonnement] = useState(null);

  const chargerSessionEtRole = async () => {
    setChargementSession(true);
    try {
      // Applique le thème choisi par le Super Admin AVANT le tout
      // premier affichage — jamais de bascule en direct pendant que
      // l'application tourne, donc aucun risque lié aux couleurs.
      try {
        const theme = await fetchThemeActuel();
        Object.assign(C, THEMES[theme] || THEMES.vert);
      } catch (eTheme) {
        console.error("Erreur de chargement du thème", eTheme);
      }

      const session = await getSession();
      if (!session) {
        setConnecte(false);
        setMonProfil(null);
        setMesGroupes([]);
        return;
      }
      setConnecte(true);
      const [profil, groupes] = await Promise.all([getMonProfil(), getMesGroupes()]);
      setMonProfil(profil);
      setMesGroupes(groupes);
    } catch (e) {
      console.error("Erreur de chargement de session", e);
      setConnecte(false);
    } finally {
      setChargementSession(false);
    }
  };

  useEffect(() => {
    chargerSessionEtRole();
    const sub = onAuthStateChange((_session, event) => {
      if (event === "PASSWORD_RECOVERY") {
        setModeRecuperation(true);
        setChargementSession(false);
        return;
      }
      // On ne recharge tout que lors d'une vraie connexion/déconnexion —
      // pas à chaque rafraîchissement automatique du jeton en arrière-plan,
      // qui ne change rien au profil ni aux groupes de la personne.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        chargerSessionEtRole();
      }
    });
    return () => sub?.unsubscribe?.();
  }, []);

  // Détermine quel écran afficher selon le rôle réel de la personne connectée.
  const estSuperAdmin = monProfil?.is_super_admin === true;
  const groupeAdmin = mesGroupes.find((g) => g.is_admin || g.is_president);
  const groupeMembreSimple = mesGroupes.find((g) => !g.is_admin && !g.is_president);

  const handleDeconnexion = async () => {
    await signOut();
    setConnecte(false);
    setMonProfil(null);
    setMesGroupes([]);
  };

  if (chargementSession) {
    return (
      <div style={{ minHeight: "680px", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, fontFamily: "'Sora','Segoe UI',sans-serif" }}>
        Chargement...
      </div>
    );
  }

  if (modeRecuperation) {
    return (
      <div style={{ fontFamily: "'Sora','Segoe UI',sans-serif" }}>
        <ChangerMotDePasseScreen onDone={async () => { setModeRecuperation(false); await chargerSessionEtRole(); }} />
      </div>
    );
  }

  if (!connecte) {
    return (
      <div style={{ fontFamily: "'Sora','Segoe UI',sans-serif" }}>
        <ConnexionScreen onLoggedIn={chargerSessionEtRole} />
      </div>
    );
  }

  if (monProfil?.doit_changer_mdp) {
    return (
      <div style={{ fontFamily: "'Sora','Segoe UI',sans-serif" }}>
        <ChangerMotDePasseScreen onDone={chargerSessionEtRole} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Sora','Segoe UI',sans-serif", background: "#0E1210" }}>
      {/* Barre de session — visible sur tous les écrans une fois connecté */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "#0E1210" }}>
        <span style={{ fontSize: "12px", color: "#9AA69C" }}>
          Connecté : {monProfil?.nom_complet || "—"} {estSuperAdmin ? "(Super Admin)" : ""}
          {!estSuperAdmin && statutAbonnement && !statutAbonnement.expire && statutAbonnement.joursRestants <= 7 && (
            <span style={{ color: C.accent, marginLeft: "10px" }}>
              — {statutAbonnement.joursRestants} jour(s) restant(s) sur l'abonnement
            </span>
          )}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {groupeAdmin && !estSuperAdmin && (
            <button
              onClick={() => setVueEspacePersonnel(!vueEspacePersonnel)}
              style={{ display: "flex", alignItems: "center", gap: "6px", background: vueEspacePersonnel ? C.accent : "#1D2420", color: vueEspacePersonnel ? "#1B2420" : "#9AA69C", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              <Users size={13} /> {vueEspacePersonnel ? "Retour à l'administration" : "Mon espace personnel"}
            </button>
          )}
          <button
            onClick={handleDeconnexion}
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "#1D2420", color: "#9AA69C", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
          >
            <LogOut size={13} /> Déconnexion
          </button>
        </div>
      </div>

      <div style={{ minHeight: "680px" }}>
        {estSuperAdmin ? (
          <SuperAdminScreen />
        ) : groupeAdmin && vueEspacePersonnel ? (
          <MembreScreen groupId={groupeAdmin.group?.id} nomGroupe={groupeAdmin.group?.nom} profileId={monProfil?.id} nomComplet={monProfil?.nom_complet} />
        ) : groupeAdmin ? (
          <AdminGroupeScreen groupId={groupeAdmin.group?.id} nomGroupe={groupeAdmin.group?.nom} />
        ) : groupeMembreSimple ? (
          <MembreScreen groupId={groupeMembreSimple.group?.id} nomGroupe={groupeMembreSimple.group?.nom} profileId={monProfil?.id} nomComplet={monProfil?.nom_complet} />
        ) : (
          <div style={{ minHeight: "680px", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, padding: "20px", textAlign: "center" }}>
            Ton compte est connecté, mais tu n'as pas encore de rôle actif dans un groupe.
            <br />Contacte l'admin de ton groupe ou le Super Admin.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ÉCRAN 1 — CONNEXION
// ============================================================
function ConnexionScreen({ onLoggedIn }) {
  const [dark, setDark] = useState(false);
  const [identifiant, setIdentifiant] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const [modeOubli, setModeOubli] = useState(false);
  const [identifiantOubli, setIdentifiantOubli] = useState("");
  const [oubliErreur, setOubliErreur] = useState("");
  const [oubliSuccess, setOubliSuccess] = useState(false);
  const [oubliChargement, setOubliChargement] = useState(false);
  const bg = dark ? "#14181A" : C.bg;
  const panelBg = dark ? "#1E2427" : C.panel;
  const ink = dark ? "#F2EEE3" : C.ink;
  const sub = dark ? "#9AA69C" : C.sub;
  const border = dark ? "#2B3336" : C.border;

  const handleLogin = async () => {
    if (!identifiant.trim() || !password.trim()) {
      setErreur("Renseigne ton identifiant et ton mot de passe.");
      return;
    }
    setChargement(true);
    setErreur("");
    try {
      await signIn({ identifiant: identifiant.trim(), password });
      onLoggedIn();
    } catch (e) {
      console.error("Erreur de connexion", e);
      setErreur("Identifiant ou mot de passe incorrect.");
    } finally {
      setChargement(false);
    }
  };

  const handleDemandeReinitialisation = async () => {
    if (!identifiantOubli.trim()) {
      setOubliErreur("Renseigne ton identifiant.");
      return;
    }
    setOubliChargement(true);
    setOubliErreur("");
    try {
      await demanderReinitialisationMotDePasse(identifiantOubli.trim());
      setOubliSuccess(true);
    } catch (e) {
      console.error("Erreur de demande de réinitialisation", e);
      setOubliErreur("Identifiant introuvable, ou erreur lors de l'envoi.");
    } finally {
      setOubliChargement(false);
    }
  };

  return (
    <div style={{ minHeight: "680px", background: bg, display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ height: "6px", background: `repeating-linear-gradient(90deg, ${C.accent} 0px, ${C.accent} 24px, ${C.accent2} 24px, ${C.accent2} 48px)` }} />
      <button onClick={() => setDark(!dark)} style={{ position: "absolute", top: "24px", right: "24px", background: "transparent", border: `1px solid ${border}`, borderRadius: "999px", padding: "8px 14px", display: "flex", alignItems: "center", gap: "6px", color: sub, fontSize: "13px", cursor: "pointer" }}>
        {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? "Clair" : "Sombre"}
      </button>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{ width: "100%", maxWidth: "380px", background: panelBg, borderRadius: "18px", border: `1px solid ${border}`, padding: "40px 32px", boxShadow: dark ? "0 20px 60px rgba(0,0,0,0.4)" : "0 20px 50px rgba(27,67,50,0.08)" }}>
          {!modeOubli ? (
            <>
              <div style={{ textAlign: "center", marginBottom: "28px" }}>
                <div style={{ width: "56px", height: "56px", margin: "0 auto 16px", borderRadius: "14px", background: `linear-gradient(135deg, ${C.accent2}, ${C.accent})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Users size={26} color="#FAF6ED" />
                </div>
                <div style={{ fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: C.accent, fontWeight: 600, marginBottom: "6px" }}>Connexion</div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, color: ink, margin: 0 }}>DJANGUI</h1>
                <div style={{ fontSize: "10.5px", color: sub, marginTop: "4px", letterSpacing: "0.04em" }}>By 3TSOLUTION</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: sub, marginBottom: "6px", display: "block" }}>Identifiant</label>
                  <input
                    type="text"
                    value={identifiant}
                    onChange={(e) => setIdentifiant(e.target.value)}
                    placeholder="Ex. jeanmballa42"
                    style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: "10px", border: `1px solid ${border}`, background: dark ? "#171C1E" : "#FBFAF6", color: ink, fontSize: "14px", outline: "none" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: sub, marginBottom: "6px", display: "block" }}>Mot de passe</label>
                  <div style={{ position: "relative" }}>
                    <Lock size={15} color={sub} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      placeholder="••••••••"
                      style={{ width: "100%", boxSizing: "border-box", padding: "12px 38px 12px 38px", borderRadius: "10px", border: `1px solid ${border}`, background: dark ? "#171C1E" : "#FBFAF6", color: ink, fontSize: "14px", outline: "none" }}
                    />
                    <div
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", display: "flex" }}
                    >
                      {showPassword ? <EyeOff size={15} color={sub} /> : <Eye size={15} color={sub} />}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", marginTop: "6px" }}>
                    <span
                      onClick={() => { setModeOubli(true); setIdentifiantOubli(identifiant); setOubliErreur(""); setOubliSuccess(false); }}
                      style={{ fontSize: "12px", color: C.accent, cursor: "pointer", fontWeight: 600 }}
                    >
                      Mot de passe oublié ?
                    </span>
                  </div>
                </div>

                {erreur && (
                  <div style={{ fontSize: "12px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
                    {erreur}
                  </div>
                )}

                <button
                  onClick={handleLogin}
                  disabled={chargement}
                  style={{ marginTop: "10px", width: "100%", padding: "13px", borderRadius: "10px", border: "none", background: C.accent2, color: "#FAF6ED", fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: chargement ? "default" : "pointer", opacity: chargement ? 0.7 : 1 }}
                >
                  {chargement ? "Connexion..." : "Se connecter"} <ChevronRight size={16} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ textAlign: "center", marginBottom: "24px" }}>
                <div style={{ width: "56px", height: "56px", margin: "0 auto 16px", borderRadius: "14px", background: `linear-gradient(135deg, ${C.accent2}, ${C.accent})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <KeyRound size={26} color="#FAF6ED" />
                </div>
                <h1 style={{ fontSize: "19px", fontWeight: 700, color: ink, margin: 0 }}>Mot de passe oublié</h1>
                <p style={{ fontSize: "12.5px", color: sub, marginTop: "8px" }}>
                  Indique ton identifiant, on t'envoie un lien par email pour choisir un nouveau mot de passe.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: sub, marginBottom: "6px", display: "block" }}>Identifiant</label>
                  <input
                    type="text"
                    value={identifiantOubli}
                    onChange={(e) => setIdentifiantOubli(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleDemandeReinitialisation()}
                    placeholder="Ex. jeanmballa42"
                    style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: "10px", border: `1px solid ${border}`, background: dark ? "#171C1E" : "#FBFAF6", color: ink, fontSize: "14px", outline: "none" }}
                  />
                </div>

                {oubliErreur && (
                  <div style={{ fontSize: "12px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
                    {oubliErreur}
                  </div>
                )}
                {oubliSuccess && (
                  <div style={{ fontSize: "12px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px" }}>
                    Email envoyé ! Vérifie ta boîte mail et clique sur le lien reçu pour choisir un nouveau mot de passe.
                  </div>
                )}

                <button
                  onClick={handleDemandeReinitialisation}
                  disabled={oubliChargement || oubliSuccess}
                  style={{ marginTop: "6px", width: "100%", padding: "13px", borderRadius: "10px", border: "none", background: C.accent2, color: "#FAF6ED", fontSize: "14px", fontWeight: 600, cursor: (oubliChargement || oubliSuccess) ? "default" : "pointer", opacity: (oubliChargement || oubliSuccess) ? 0.7 : 1 }}
                >
                  {oubliChargement ? "Envoi..." : "Envoyer le lien de réinitialisation"}
                </button>

                <button
                  onClick={() => { setModeOubli(false); setOubliErreur(""); setOubliSuccess(false); }}
                  style={{ background: "transparent", border: "none", color: sub, fontSize: "12.5px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}
                >
                  <ChevronLeft size={14} /> Retour à la connexion
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div style={{ textAlign: "center", padding: "18px", fontSize: "12px", color: sub }}>
        Application créée par <span style={{ color: C.accent, fontWeight: 600 }}>Three T Solutions</span> — 2026
      </div>
    </div>
  );
}

function Field({ label, placeholder, border, dark, sub, ink }) {
  return (
    <div>
      <label style={{ fontSize: "12px", color: sub, marginBottom: "6px", display: "block" }}>{label}</label>
      <input placeholder={placeholder} style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: "10px", border: `1px solid ${border}`, background: dark ? "#171C1E" : "#FBFAF6", color: ink, fontSize: "14px", outline: "none" }} />
    </div>
  );
}

// ============================================================
// ÉCRAN — CHANGEMENT DE MOT DE PASSE OBLIGATOIRE
// (après une réinitialisation d'urgence par le Super Admin)
// ============================================================
function ChangerMotDePasseScreen({ onDone }) {
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  const handleValider = async () => {
    if (!motDePasse.trim() || motDePasse.length < 6) {
      setErreur("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setChargement(true);
    setErreur("");
    try {
      await changerMotDePasse(motDePasse);
      await onDone();
    } catch (e) {
      console.error("Erreur de changement de mot de passe", e);
      setErreur("Erreur lors du changement de mot de passe.");
    } finally {
      setChargement(false);
    }
  };

  return (
    <div style={{ minHeight: "680px", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "380px", background: C.panel, borderRadius: "18px", border: `1px solid ${C.border}`, padding: "40px 32px", boxShadow: "0 20px 50px rgba(27,67,50,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ width: "56px", height: "56px", margin: "0 auto 16px", borderRadius: "14px", background: `linear-gradient(135deg, ${C.accent2}, ${C.accent})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <KeyRound size={26} color="#FAF6ED" />
          </div>
          <h1 style={{ fontSize: "19px", fontWeight: 700, color: C.ink, margin: 0 }}>Choisis ton nouveau mot de passe</h1>
          <p style={{ fontSize: "12.5px", color: C.sub, marginTop: "8px" }}>
            Ton mot de passe a été réinitialisé. Choisis-en un nouveau pour continuer.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Nouveau mot de passe</label>
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              placeholder="Au moins 6 caractères"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: "10px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "14px", outline: "none" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Confirme le mot de passe</label>
            <input
              type="password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleValider()}
              placeholder="Retape le même mot de passe"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: "10px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "14px", outline: "none" }}
            />
          </div>
          {erreur && (
            <div style={{ fontSize: "12px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {erreur}
            </div>
          )}
          <button
            onClick={handleValider}
            disabled={chargement}
            style={{ marginTop: "8px", width: "100%", padding: "13px", borderRadius: "10px", border: "none", background: C.accent2, color: "#FAF6ED", fontSize: "14px", fontWeight: 600, cursor: chargement ? "default" : "pointer", opacity: chargement ? 0.7 : 1 }}
          >
            {chargement ? "Enregistrement..." : "Valider et continuer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ÉCRAN 2 — SUPER ADMIN
// ============================================================
function SuperAdminScreen() {
  const [view, setView] = useState("dashboard");
  const [groupes, setGroupes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [themeEnCours, setThemeEnCours] = useState("");
  const [statsPlateforme, setStatsPlateforme] = useState(null);
  const [chargementStats, setChargementStats] = useState(true);
  const [showGererSms, setShowGererSms] = useState(null);
  const [smsSoldeActuel, setSmsSoldeActuel] = useState(null);
  const [smsHistorique, setSmsHistorique] = useState([]);
  const [smsVenteQuantite, setSmsVenteQuantite] = useState("");
  const [smsVentePrix, setSmsVentePrix] = useState("");
  const [smsVenteMode, setSmsVenteMode] = useState("Espèces");
  const [smsVenteNote, setSmsVenteNote] = useState("");
  const [smsVenteErreur, setSmsVenteErreur] = useState("");
  const [smsVenteEnCours, setSmsVenteEnCours] = useState(false);

  useEffect(() => {
    if (view !== "dashboard") return;
    setChargementStats(true);
    fetchStatsPlateforme()
      .then(setStatsPlateforme)
      .catch((e) => console.error("Erreur de chargement des statistiques", e))
      .finally(() => setChargementStats(false));
  }, [view]);

  const [showCreateGroupe, setShowCreateGroupe] = useState(false);
  const [nomGroupe, setNomGroupe] = useState("");
  const [adminNom, setAdminNom] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [creationFormule, setCreationFormule] = useState("Essai");
  const [creationCreditSms, setCreationCreditSms] = useState("");
  const [creationPeriodicite, setCreationPeriodicite] = useState("Mensuel");
  const [showRenouveler, setShowRenouveler] = useState(null);
  const [showModifierGroupe, setShowModifierGroupe] = useState(null);
  const [modifierGroupeNom, setModifierGroupeNom] = useState("");
  const [modifierGroupeErreur, setModifierGroupeErreur] = useState("");
  const [modifierGroupeEnCours, setModifierGroupeEnCours] = useState(false);
  const [modifierGroupeLogo, setModifierGroupeLogo] = useState("");
  const [modifierLogoEnCours, setModifierLogoEnCours] = useState(false);
  const modifierLogoInputRef = useRef(null);
  const [suspensionEnCours, setSuspensionEnCours] = useState("");
  const [renouvelerFormule, setRenouvelerFormule] = useState("Basic");
  const [renouvelerPeriodicite, setRenouvelerPeriodicite] = useState("Mensuel");
  const [renouvelerErreur, setRenouvelerErreur] = useState("");
  const [renouvelerSuccess, setRenouvelerSuccess] = useState(false);
  const [renouvelerEnCours, setRenouvelerEnCours] = useState(false);
  const [creationErreur, setCreationErreur] = useState("");
  const [resultatCreation, setResultatCreation] = useState(null);
  const [logoGroupeUrl, setLogoGroupeUrl] = useState("");
  const [logoEnCours, setLogoEnCours] = useState(false);
  const logoInputRef = useRef(null);

  // Accès d'urgence
  const [showResetAccess, setShowResetAccess] = useState(false);
  const [adminsList, setAdminsList] = useState([]);
  const [chargementAdmins, setChargementAdmins] = useState(false);
  const [resetSelection, setResetSelection] = useState("");
  const [resetEnCours, setResetEnCours] = useState(false);
  const [resetErreur, setResetErreur] = useState("");
  const [resetMotDePasseTemp, setResetMotDePasseTemp] = useState("");

  // Journal d'audit
  const [auditLog, setAuditLog] = useState([]);
  const [chargementAudit, setChargementAudit] = useState(true);
  const [erreurAudit, setErreurAudit] = useState("");

  // Tarifs
  const [plans, setPlans] = useState([]);
  const [chargementPlans, setChargementPlans] = useState(true);
  const [editPlanId, setEditPlanId] = useState(null);
  const [editPrixMensuel, setEditPrixMensuel] = useState("");
  const [editPrixAnnuel, setEditPrixAnnuel] = useState("");
  const [editLimiteMembres, setEditLimiteMembres] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);

  const chargerGroupes = async () => {
    setChargement(true);
    try {
      const data = await fetchGroupes();
      setGroupes(data);
      setErreur("");
      try {
        const admins = await fetchAdminsDesGroupes();
        setAdminsList(admins);
      } catch (e2) {
        console.error("Erreur de chargement des admins", e2);
      }
    } catch (e) {
      console.error("Erreur de chargement des groupes", e);
      setErreur("Impossible de charger les groupes — vérifie que ton compte est bien marqué Super Admin.");
    } finally {
      setChargement(false);
    }
  };

  const chargerAudit = async () => {
    setChargementAudit(true);
    try {
      const data = await fetchAuditLog();
      setAuditLog(data);
      setErreurAudit("");
    } catch (e) {
      console.error("Erreur de chargement du journal d'audit", e);
      setErreurAudit("Impossible de charger le journal d'audit.");
    } finally {
      setChargementAudit(false);
    }
  };

  const chargerPlans = async () => {
    setChargementPlans(true);
    try {
      const data = await fetchPlansTarifaires();
      setPlans(data);
    } catch (e) {
      console.error("Erreur de chargement des tarifs", e);
    } finally {
      setChargementPlans(false);
    }
  };

  useEffect(() => {
    chargerGroupes();
    chargerAudit();
    chargerPlans();
  }, []);

  const planColor = { Basic: C.sub, Standard: C.accent2, Pro: C.accent, Essai: C.purple };
  const statusStyle = { actif: { bg: C.ok, fg: C.accent2 }, "en retard": { bg: C.warnBg, fg: C.warn }, essai: { bg: "#EBE6F5", fg: C.purple } };
  const typeStyle = { urgence: { bg: "#FBF1DC", fg: C.accent }, "création": { bg: C.ok, fg: C.accent2 }, abonnement: { bg: "#EBE6F5", fg: C.purple } };

  return (
    <div className="app-layout" style={{ minHeight: "680px", background: C.bg, display: "flex", color: C.ink }}>
      <Sidebar
        role="Super Admin" sub="Plateforme"
        items={[
          { icon: <LayoutDashboard size={16} />, label: "Tableau de bord", key: "dashboard" },
          { icon: <Building2 size={16} />, label: "Groupes", key: "groupes" },
          { icon: <CreditCard size={16} />, label: "Tarifs", key: "tarifs" },
          { icon: <ScrollText size={16} />, label: "Journal d'audit", key: "audit" },
          { icon: <Palette size={16} />, label: "Thème", key: "theme" },
        ]}
        active={view} onSelect={setView}
      />
      <div className="app-main" style={{ flex: 1, padding: "32px 40px", minWidth: 0 }}>
        {view === "dashboard" && (
          <>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Tableau de bord</h1>
            <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 22px" }}>Vue d'ensemble de toute la plateforme, tous groupes confondus.</p>

            {chargementStats ? (
              <div style={{ fontSize: "13px", color: C.sub, textAlign: "center", padding: "30px 0" }}>Chargement...</div>
            ) : !statsPlateforme ? (
              <div style={{ fontSize: "12.5px", color: C.warn }}>Erreur de chargement des statistiques.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
                  <StatCard label="Groupes" value={statsPlateforme.totalGroupes} icon={<Building2 size={16} />} />
                  <StatCard label="Membres actifs" value={statsPlateforme.totalMembres} icon={<Users size={16} />} />
                  <StatCard label="Abonnements actifs" value={statsPlateforme.actifs} icon={<CheckCircle2 size={16} />} />
                  <StatCard label="En période d'essai" value={statsPlateforme.essais} icon={<Calendar size={16} />} />
                  <StatCard label="Expirés" value={statsPlateforme.expires} icon={<AlertTriangle size={16} />} />
                  <StatCard label="Suspendus" value={statsPlateforme.suspendus} icon={<ShieldAlert size={16} />} />
                </div>

                <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "26px 0 10px" }}>Répartition par formule</h2>
                <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
                  {Object.entries(statsPlateforme.parFormule).map(([formule, nb]) => (
                    <StatCard key={formule} label={formule} value={nb} icon={<CreditCard size={16} />} />
                  ))}
                  {Object.keys(statsPlateforme.parFormule).length === 0 && (
                    <div style={{ fontSize: "12.5px", color: C.sub }}>Aucun groupe pour l'instant.</div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginTop: "26px" }}>
                  <div style={{ flex: "1 1 320px" }}>
                    <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 10px" }}>Expirent bientôt (7 jours)</h2>
                    {statsPlateforme.expirentBientot.length === 0 ? (
                      <div style={{ fontSize: "12.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "14px", textAlign: "center" }}>
                        Aucun groupe n'expire dans les 7 prochains jours.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {statsPlateforme.expirentBientot.map((g, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", background: C.warnBg, border: `1px solid ${C.warn}33`, borderRadius: "8px", padding: "8px 12px", fontSize: "12.5px" }}>
                            <span><b>{g.nom}</b> — {g.formule}</span>
                            <span style={{ color: C.warn, fontWeight: 600 }}>{new Date(g.dateExpiration).toLocaleDateString("fr-FR")}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: "1 1 320px" }}>
                    <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 10px" }}>Groupes récents</h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {statsPlateforme.groupesRecents.map((g, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", fontSize: "12.5px" }}>
                          <span>{g.nom}</span>
                          <span style={{ color: C.sub }}>{new Date(g.date).toLocaleDateString("fr-FR")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {view === "groupes" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Groupes enregistrés</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>
                  {chargement ? "Chargement..." : `${groupes.length} groupe(s).`} Création + abonnement uniquement — aucune visibilité sur les données internes.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  style={btnSecondary}
                  onClick={async () => {
                    setResetSelection(""); setResetErreur(""); setResetMotDePasseTemp("");
                    setShowResetAccess(true);
                    setChargementAdmins(true);
                    try {
                      const data = await fetchAdminsDesGroupes();
                      setAdminsList(data);
                    } catch (e) {
                      console.error("Erreur de chargement des admins", e);
                    } finally {
                      setChargementAdmins(false);
                    }
                  }}
                >
                  <KeyRound size={15} /> Accès d'urgence
                </button>
                <button
                  style={btnPrimary}
                  onClick={() => {
                    setNomGroupe(""); setAdminNom(""); setAdminEmail("");
                    setCreationFormule("Essai"); setCreationPeriodicite("Mensuel");
                    setCreationErreur(""); setResultatCreation(null); setLogoGroupeUrl("");
                    setShowCreateGroupe(true);
                  }}
                >
                  <Plus size={15} /> Nouveau groupe
                </button>
              </div>
            </div>

            {erreur && (
              <div style={{ marginTop: "16px", fontSize: "12.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "10px 12px" }}>
                {erreur}
              </div>
            )}

            <div style={{ marginTop: "22px" }} />
            <Table
              cols={["Groupe", "Admin", "Formule", "Échéance", "SMS", "Statut", ""]}
              widths="1.3fr 1.3fr 0.9fr 1fr 0.7fr 0.9fr 1.1fr"
              rows={groupes.map((g) => {
                const abo = g.subscriptions?.[0];
                const admin = adminsList.find((a) => a.groupId === g.id);
                return [
                  <b>{g.nom}</b>,
                  admin ? (
                    <div>
                      <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{admin.nom}</div>
                      <div style={{ fontSize: "11px", color: C.sub }}>{admin.identifiant} · {admin.role}</div>
                    </div>
                  ) : <span style={{ color: C.sub, fontSize: 12 }}>—</span>,
                  abo ? (
                    <span><span style={{ color: planColor[abo.formule] || C.sub, fontWeight: 700 }}>{abo.formule}</span> {abo.periodicite && <span style={{ color: C.sub, fontSize: 11 }}>· {abo.periodicite}</span>}</span>
                  ) : "—",
                  abo?.date_expiration ? <span style={{ color: C.sub, fontSize: 12 }}>{new Date(abo.date_expiration).toLocaleDateString("fr-FR")}</span> : "—",
                  <span
                    onClick={async () => {
                      setShowGererSms(g);
                      setSmsVenteQuantite(""); setSmsVentePrix(""); setSmsVenteMode("Espèces"); setSmsVenteNote(""); setSmsVenteErreur("");
                      try {
                        const [solde, histo] = await Promise.all([fetchSoldeSms(g.id), fetchHistoriqueSms(g.id)]);
                        setSmsSoldeActuel(solde);
                        setSmsHistorique(histo);
                      } catch (e) {
                        console.error("Erreur de chargement des crédits SMS", e);
                      }
                    }}
                    style={{ fontWeight: 700, color: C.vifBleu, cursor: "pointer", textDecoration: "underline", fontSize: "12px" }}
                  >
                    {g.sms_credits ?? 0}
                  </span>,
                  abo ? <Badge bg={(statusStyle[abo.statut] || statusStyle.actif).bg} fg={(statusStyle[abo.statut] || statusStyle.actif).fg}>{abo.statut}</Badge> : "—",
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        setShowRenouveler(g);
                        setRenouvelerFormule(abo?.formule || "Basic");
                        setRenouvelerPeriodicite(abo?.periodicite || "Mensuel");
                        setRenouvelerErreur("");
                        setRenouvelerSuccess(false);
                      }}
                      style={{ background: "transparent", color: C.vifVert, border: `1px solid ${C.vifVert}66`, borderRadius: "7px", padding: "5px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                    >
                      Renouveler
                    </button>
                    <button
                      onClick={async () => {
                        setShowModifierGroupe(g);
                        setModifierGroupeNom(g.nom);
                        setModifierGroupeErreur("");
                        setModifierGroupeLogo("");
                        try {
                          const logo = await fetchLogoGroupe(g.id);
                          setModifierGroupeLogo(logo);
                        } catch (e) {
                          console.error("Erreur de chargement du logo", e);
                        }
                      }}
                      style={{ background: "transparent", color: C.vifBleu, border: `1px solid ${C.vifBleu}66`, borderRadius: "7px", padding: "5px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={async () => {
                        setSuspensionEnCours(g.id);
                        try {
                          if (abo?.statut === "suspendu") await reactiverGroupe(g.id);
                          else await suspendreGroupe(g.id);
                          await chargerGroupes();
                        } catch (e) {
                          console.error("Erreur de suspension/réactivation", e);
                        } finally {
                          setSuspensionEnCours("");
                        }
                      }}
                      disabled={suspensionEnCours === g.id}
                      style={{ background: "transparent", color: abo?.statut === "suspendu" ? C.accent2 : C.warn, border: `1px solid ${abo?.statut === "suspendu" ? C.accent2 : C.warn}66`, borderRadius: "7px", padding: "5px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                    >
                      {suspensionEnCours === g.id ? "..." : abo?.statut === "suspendu" ? "Réactiver" : "Suspendre"}
                    </button>
                  </div>,
                ];
              })}
            />
          </>
        )}

        {view === "tarifs" && (
          <>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Politique tarifaire</h1>
            <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 22px" }}>
              {chargementPlans ? "Chargement..." : "Modifie les prix et limites de chaque formule — appliqué immédiatement aux nouvelles souscriptions."}
            </p>

            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
              {plans.map((p) => (
                <div key={p.id} style={{ flex: "1 1 220px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontWeight: 700, fontSize: "15px", color: planColor[p.formule] || C.ink }}>{p.formule}</span>
                    {editPlanId !== p.id && (
                      <button
                        onClick={() => {
                          setEditPlanId(p.id);
                          setEditPrixMensuel(String(p.prix_mensuel ?? ""));
                          setEditPrixAnnuel(String(p.prix_annuel ?? ""));
                          setEditLimiteMembres(p.limite_membres != null ? String(p.limite_membres) : "");
                          setEditDescription(p.description || "");
                        }}
                        style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "5px 10px", fontSize: "11px", fontWeight: 600, color: C.accent2, cursor: "pointer" }}
                      >
                        Modifier
                      </button>
                    )}
                  </div>

                  {editPlanId === p.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div>
                        <label style={{ fontSize: "10.5px", color: C.sub, display: "block", marginBottom: "3px" }}>Prix mensuel (FCFA)</label>
                        <input value={editPrixMensuel} onChange={(e) => setEditPrixMensuel(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: "6px", border: `1px solid ${C.border}`, fontSize: "12px", outline: "none" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: "10.5px", color: C.sub, display: "block", marginBottom: "3px" }}>Prix annuel (FCFA)</label>
                        <input value={editPrixAnnuel} onChange={(e) => setEditPrixAnnuel(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: "6px", border: `1px solid ${C.border}`, fontSize: "12px", outline: "none" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: "10.5px", color: C.sub, display: "block", marginBottom: "3px" }}>Limite de membres (vide = illimité)</label>
                        <input value={editLimiteMembres} onChange={(e) => setEditLimiteMembres(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: "6px", border: `1px solid ${C.border}`, fontSize: "12px", outline: "none" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: "10.5px", color: C.sub, display: "block", marginBottom: "3px" }}>Description</label>
                        <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: "6px", border: `1px solid ${C.border}`, fontSize: "12px", outline: "none" }} />
                      </div>
                      <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                        <button
                          disabled={savingPlan}
                          onClick={async () => {
                            setSavingPlan(true);
                            try {
                              await modifierPlanTarifaire(p.id, {
                                prixMensuel: parseFloat(editPrixMensuel) || 0,
                                prixAnnuel: parseFloat(editPrixAnnuel) || 0,
                                limiteMembres: editLimiteMembres.trim() === "" ? null : parseInt(editLimiteMembres, 10),
                                description: editDescription,
                              });
                              await chargerPlans();
                              setEditPlanId(null);
                            } catch (e) {
                              console.error("Erreur de modification du tarif", e);
                            } finally {
                              setSavingPlan(false);
                            }
                          }}
                          style={{ flex: 1, background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "7px", padding: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                        >
                          {savingPlan ? "..." : "Enregistrer"}
                        </button>
                        <button
                          onClick={() => setEditPlanId(null)}
                          style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "8px 10px", fontSize: "12px", fontWeight: 600, color: C.sub, cursor: "pointer" }}
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: "20px", fontWeight: 700 }}>
                        {Number(p.prix_mensuel).toLocaleString("fr-FR")} <span style={{ fontSize: "12px", fontWeight: 500, color: C.sub }}>FCFA / mois</span>
                      </div>
                      <div style={{ fontSize: "11.5px", color: C.sub, marginTop: "2px" }}>
                        ou {Number(p.prix_annuel).toLocaleString("fr-FR")} FCFA / an
                      </div>
                      <div style={{ fontSize: "11.5px", color: C.sub, marginTop: "10px" }}>
                        {p.limite_membres ? `Jusqu'à ${p.limite_membres} membres` : "Membres illimités"}
                      </div>
                      <div style={{ fontSize: "11.5px", color: C.sub, marginTop: "4px" }}>{p.description}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {view === "audit" && (
          <>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Journal d'audit</h1>
            <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 22px" }}>
              Historique en lecture seule des actions Super Admin.
            </p>
            {erreurAudit && (
              <div style={{ fontSize: "12.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "10px 12px", marginBottom: "16px" }}>
                {erreurAudit}
              </div>
            )}
            <Table
              cols={["Date", "Action", "Détail", "Type"]}
              widths="1.2fr 1.4fr 1.8fr 1fr"
              rows={
                chargementAudit
                  ? []
                  : auditLog.map((e) => [
                      <span style={{ color: C.sub, fontSize: 12 }}>{new Date(e.created_at).toLocaleString("fr-FR")}</span>,
                      <b>{e.action}</b>,
                      <span style={{ color: C.sub, fontSize: 12 }}>{e.detail}</span>,
                      e.type ? <Badge bg={(typeStyle[e.type] || typeStyle["création"]).bg} fg={(typeStyle[e.type] || typeStyle["création"]).fg}>{e.type}</Badge> : "—",
                    ])
              }
            />
            {!chargementAudit && auditLog.length === 0 && (
              <div style={{ fontSize: "12.5px", color: C.sub, marginTop: "12px" }}>Aucune action enregistrée pour l'instant.</div>
            )}
          </>
        )}

        {view === "theme" && (
          <>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Thème de la plateforme</h1>
            <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 22px" }}>
              S'applique à toute l'application, pour tous les groupes. La page se recharge après le choix pour appliquer le nouveau thème.
            </p>

            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {Object.entries(THEMES).map(([key, t]) => (
                <div
                  key={key}
                  onClick={async () => {
                    if (themeEnCours) return;
                    setThemeEnCours(key);
                    try {
                      await definirTheme(key);
                      window.location.reload();
                    } catch (e) {
                      console.error("Erreur de changement de thème", e);
                      setThemeEnCours("");
                    }
                  }}
                  style={{ width: "180px", borderRadius: "14px", border: `2px solid ${C.border}`, overflow: "hidden", cursor: themeEnCours ? "default" : "pointer", background: C.panel, opacity: themeEnCours && themeEnCours !== key ? 0.5 : 1 }}
                >
                  <div style={{ height: "70px", background: `linear-gradient(135deg, ${t.accent2}, ${t.accent})` }} />
                  <div style={{ padding: "12px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: C.ink }}>{t.nom}</div>
                    <div style={{ fontSize: "11px", color: C.sub, marginTop: "4px" }}>
                      {themeEnCours === key ? "Application..." : "Cliquer pour appliquer"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showRenouveler && (
        <Modal onClose={() => setShowRenouveler(null)} title={`Renouveler — ${showRenouveler.nom}`} icon={<CreditCard />} accentColor={C.vifVert}>
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Formule</label>
            <select
              value={renouvelerFormule}
              onChange={(e) => setRenouvelerFormule(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              {plans.filter((p) => p.formule !== "Essai").map((p) => <option key={p.id} value={p.formule}>{p.formule}</option>)}
              {plans.length === 0 && <><option>Basic</option><option>Standard</option><option>Pro</option></>}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Périodicité</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {["Mensuel", "Annuel"].map((p) => (
                <div
                  key={p}
                  onClick={() => setRenouvelerPeriodicite(p)}
                  style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: "8px", border: `1px solid ${renouvelerPeriodicite === p ? C.vifVert : C.border}`, background: renouvelerPeriodicite === p ? `${C.vifVert}14` : "#FBFAF6", fontSize: "12px", fontWeight: 600, color: renouvelerPeriodicite === p ? C.vifVert : C.sub, cursor: "pointer" }}
                >
                  {p}
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: "11px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Prolonge l'accès de {renouvelerPeriodicite === "Annuel" ? "365 jours" : "30 jours"}, à partir d'aujourd'hui (ou de la date d'expiration actuelle si elle n'est pas encore dépassée).
          </div>

          {renouvelerErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {renouvelerErreur}
            </div>
          )}
          {renouvelerSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Abonnement renouvelé.
            </div>
          )}

          {!renouvelerSuccess && (
            <button
              disabled={renouvelerEnCours}
              style={{ marginTop: "6px", background: C.vifVert, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: renouvelerEnCours ? "default" : "pointer" }}
              onClick={async () => {
                setRenouvelerEnCours(true);
                setRenouvelerErreur("");
                try {
                  await renouvelerAbonnement(showRenouveler.id, renouvelerFormule, renouvelerPeriodicite);
                  await chargerGroupes();
                  setRenouvelerSuccess(true);
                } catch (e) {
                  console.error("Erreur de renouvellement", e);
                  setRenouvelerErreur(e.message || "Erreur lors du renouvellement.");
                } finally {
                  setRenouvelerEnCours(false);
                }
              }}
            >
              {renouvelerEnCours ? "Renouvellement..." : "Renouveler l'abonnement"}
            </button>
          )}
        </Modal>
      )}

      {showGererSms && (
        <Modal onClose={() => setShowGererSms(null)} title={`Crédits SMS — ${showGererSms.nom}`} icon={<Repeat />} accentColor={C.vifBleu}>
          <div style={{ background: C.ok, borderRadius: "10px", padding: "12px" }}>
            <div style={{ fontSize: "10.5px", color: C.accent2 }}>Solde actuel</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: C.accent2 }}>{smsSoldeActuel?.solde ?? 0} SMS</div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: C.sub, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={smsSoldeActuel?.bloquerSiEpuise ?? true}
              onChange={async (e) => {
                try {
                  await definirBlocageSms(showGererSms.id, e.target.checked);
                  setSmsSoldeActuel({ ...smsSoldeActuel, bloquerSiEpuise: e.target.checked });
                } catch (err) {
                  console.error("Erreur de mise à jour du blocage SMS", err);
                }
              }}
            />
            Bloquer l'envoi de SMS quand le solde est épuisé (sinon, laisse passer en avertissant seulement)
          </label>

          <div style={{ fontSize: "11px", fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: "6px" }}>Vendre des crédits</div>
          <FormField label="Quantité de SMS" placeholder="Ex. 100" value={smsVenteQuantite} onChange={(e) => setSmsVenteQuantite(e.target.value)} />
          <FormField label="Prix payé (FCFA, optionnel)" placeholder="Ex. 5 000" value={smsVentePrix} onChange={(e) => setSmsVentePrix(e.target.value)} />
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Mode de paiement</label>
            <div style={{ display: "flex", gap: "6px" }}>
              {["Espèces", "Mobile Money", "Virement"].map((mode) => (
                <div
                  key={mode}
                  onClick={() => setSmsVenteMode(mode)}
                  style={{ flex: 1, textAlign: "center", padding: "7px 4px", borderRadius: "7px", border: `1px solid ${smsVenteMode === mode ? C.vifBleu : C.border}`, background: smsVenteMode === mode ? `${C.vifBleu}14` : "#FBFAF6", fontSize: "10.5px", fontWeight: 600, color: smsVenteMode === mode ? C.vifBleu : C.sub, cursor: "pointer" }}
                >
                  {mode}
                </div>
              ))}
            </div>
          </div>
          <FormField label="Note (optionnel)" placeholder="Ex. Payé par le président" value={smsVenteNote} onChange={(e) => setSmsVenteNote(e.target.value)} />

          {smsVenteErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {smsVenteErreur}
            </div>
          )}

          <button
            disabled={smsVenteEnCours}
            style={{ background: C.vifBleu, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: smsVenteEnCours ? "default" : "pointer" }}
            onClick={async () => {
              const quantite = parseInt(smsVenteQuantite.replace(/[^\d]/g, ""), 10);
              if (!quantite || quantite <= 0) { setSmsVenteErreur("Saisis une quantité valide."); return; }
              setSmsVenteEnCours(true);
              setSmsVenteErreur("");
              try {
                const prix = parseInt(smsVentePrix.replace(/[^\d]/g, ""), 10) || null;
                const nouveauSolde = await vendreCreditsSms(showGererSms.id, quantite, prix, smsVenteMode, smsVenteNote.trim());
                setSmsSoldeActuel({ ...smsSoldeActuel, solde: nouveauSolde });
                const histo = await fetchHistoriqueSms(showGererSms.id);
                setSmsHistorique(histo);
                await chargerGroupes();
                setSmsVenteQuantite(""); setSmsVentePrix(""); setSmsVenteNote("");
              } catch (e) {
                console.error("Erreur de vente de crédits SMS", e);
                setSmsVenteErreur(e.message || "Erreur lors de la vente.");
              } finally {
                setSmsVenteEnCours(false);
              }
            }}
          >
            {smsVenteEnCours ? "Enregistrement..." : "Vendre ces crédits"}
          </button>

          {smsHistorique.length > 0 && (
            <>
              <div style={{ fontSize: "11px", fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: "6px" }}>Historique</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "180px", overflowY: "auto" }}>
                {smsHistorique.map((h) => (
                  <div key={h.id} style={{ display: "flex", justifyContent: "space-between", background: "#FBFAF6", borderRadius: "7px", padding: "6px 10px", fontSize: "11.5px" }}>
                    <span>{h.type === "achat" ? `Achat${h.mode_paiement ? ` (${h.mode_paiement})` : ""}` : "Envoi SMS"}</span>
                    <b style={{ color: h.quantite >= 0 ? C.accent2 : C.warn }}>{h.quantite >= 0 ? "+" : ""}{h.quantite}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}

      {showModifierGroupe && (
        <Modal onClose={() => setShowModifierGroupe(null)} title="Modifier le groupe" icon={<Building2 />} accentColor={C.vifBleu}>
          <FormField label="Nom du groupe" placeholder="Ex. Tontine Les Bâtisseurs" value={modifierGroupeNom} onChange={(e) => setModifierGroupeNom(e.target.value)} />

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Logo du groupe</label>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {modifierGroupeLogo ? (
                <img src={modifierGroupeLogo} alt="Logo" style={{ width: "44px", height: "44px", borderRadius: "9px", objectFit: "cover", border: `1px solid ${C.border}` }} />
              ) : (
                <div style={{ width: "44px", height: "44px", borderRadius: "9px", background: "#FBFAF6", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Building2 size={18} color={C.sub} />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                ref={modifierLogoInputRef}
                style={{ display: "none" }}
                onChange={async (e) => {
                  const fichier = e.target.files[0];
                  if (!fichier || !showModifierGroupe) return;
                  setModifierLogoEnCours(true);
                  try {
                    const url = await televerserLogoGroupe(showModifierGroupe.id, fichier);
                    setModifierGroupeLogo(url);
                  } catch (err) {
                    console.error("Erreur de téléversement du logo", err);
                  } finally {
                    setModifierLogoEnCours(false);
                    e.target.value = "";
                  }
                }}
              />
              <button
                disabled={modifierLogoEnCours}
                onClick={() => modifierLogoInputRef.current?.click()}
                style={{ background: "transparent", color: C.vifBleu, border: `1px solid ${C.vifBleu}55`, borderRadius: "7px", padding: "7px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
              >
                {modifierLogoEnCours ? "Envoi..." : modifierGroupeLogo ? "Remplacer" : "Ajouter"}
              </button>
            </div>
          </div>

          {modifierGroupeErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {modifierGroupeErreur}
            </div>
          )}

          <button
            disabled={modifierGroupeEnCours}
            style={{ marginTop: "6px", background: C.vifBleu, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: modifierGroupeEnCours ? "default" : "pointer" }}
            onClick={async () => {
              if (!modifierGroupeNom.trim()) { setModifierGroupeErreur("Le nom du groupe est obligatoire."); return; }
              setModifierGroupeEnCours(true);
              try {
                await modifierGroupe(showModifierGroupe.id, modifierGroupeNom.trim());
                await chargerGroupes();
                setShowModifierGroupe(null);
              } catch (e) {
                console.error("Erreur de modification du groupe", e);
                setModifierGroupeErreur(e.message || "Erreur lors de la modification.");
              } finally {
                setModifierGroupeEnCours(false);
              }
            }}
          >
            Enregistrer
          </button>
        </Modal>
      )}

      {showCreateGroupe && (
        <Modal onClose={() => setShowCreateGroupe(false)} title="Créer un nouveau groupe">
          {!resultatCreation ? (
            <>
              <FormField label="Nom du groupe" placeholder="Ex. Tontine Les Bâtisseurs" value={nomGroupe} onChange={(e) => setNomGroupe(e.target.value)} />
              <FormField label="Nom de l'administrateur" placeholder="Ex. Jean Mballa" value={adminNom} onChange={(e) => setAdminNom(e.target.value)} />
              <FormField label="Email de l'administrateur" placeholder="Ex. jean.mballa@exemple.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />

              <div>
                <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Formule</label>
                <select
                  value={creationFormule}
                  onChange={(e) => setCreationFormule(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
                >
                  {plans.length === 0 && <option value="Essai">Essai</option>}
                  {plans.map((p) => <option key={p.id} value={p.formule}>{p.formule} ({Number(p.prix_mensuel).toLocaleString("fr-FR")} FCFA/mois)</option>)}
                </select>
              </div>

              {creationFormule !== "Essai" && (
                <div>
                  <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Périodicité</label>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {["Mensuel", "Annuel"].map((p) => (
                      <div
                        key={p}
                        onClick={() => setCreationPeriodicite(p)}
                        style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: "8px", border: `1px solid ${creationPeriodicite === p ? C.accent2 : C.border}`, background: creationPeriodicite === p ? C.ok : "#FBFAF6", fontSize: "12px", fontWeight: 600, color: creationPeriodicite === p ? C.accent2 : C.sub, cursor: "pointer" }}
                      >
                        {p}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontSize: "11px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
                {creationFormule === "Essai"
                  ? "Accès gratuit pendant 14 jours."
                  : `Accès activé pour ${creationPeriodicite === "Annuel" ? "365 jours (1 an)" : "30 jours (1 mois)"} à partir d'aujourd'hui.`}
              </div>

              <FormField label="Crédit SMS offert au départ (optionnel)" placeholder="Ex. 20 — laisse vide pour 0" value={creationCreditSms} onChange={(e) => setCreationCreditSms(e.target.value)} />

              {creationErreur && (
                <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
                  {creationErreur}
                </div>
              )}

              <button
                disabled={creationEnCours}
                style={{ marginTop: "8px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: creationEnCours ? "default" : "pointer", opacity: creationEnCours ? 0.7 : 1 }}
                onClick={async () => {
                  if (!nomGroupe.trim() || !adminNom.trim() || !adminEmail.trim()) {
                    setCreationErreur("Tous les champs sont obligatoires.");
                    return;
                  }
                  setCreationEnCours(true);
                  setCreationErreur("");
                  try {
                    const resultat = await creerGroupeAvecAdmin({
                      nomGroupe: nomGroupe.trim(),
                      adminNom: adminNom.trim(),
                      adminEmail: adminEmail.trim(),
                      formule: creationFormule,
                      periodicite: creationPeriodicite,
                      creditSms: parseInt(creationCreditSms.replace(/[^\d]/g, ""), 10) || 0,
                    });
                    setResultatCreation(resultat);
                    await chargerGroupes();
                    await chargerAudit();
                  } catch (e) {
                    console.error("Erreur de création du groupe", e);
                    setCreationErreur(e.message || "Erreur lors de la création du groupe.");
                  } finally {
                    setCreationEnCours(false);
                  }
                }}
              >
                {creationEnCours ? "Création en cours..." : "Créer le groupe et l'admin"}
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: "12.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "10px 12px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  Groupe <b>{resultatCreation.groupe.nom}</b> créé avec succès.
                </div>
              </div>
              <div style={{ fontSize: "12px", background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px" }}>
                <div style={{ marginBottom: "6px" }}>Identifiants de l'administrateur à lui communiquer :</div>
                <div><b>Identifiant de connexion :</b> {resultatCreation.identifiant}</div>
                <div><b>Mot de passe temporaire :</b> {resultatCreation.motDePasseTemp}</div>
                <div style={{ color: C.sub, fontSize: "11px", marginTop: "4px" }}>(Email associé : {resultatCreation.adminEmail})</div>
              </div>
              <div style={{ fontSize: "12px", background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px" }}>
                <div style={{ marginBottom: "8px" }}>Logo du groupe (optionnel)</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {logoGroupeUrl && (
                    <img src={logoGroupeUrl} alt="Logo" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover" }} />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    ref={logoInputRef}
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const fichier = e.target.files[0];
                      if (!fichier) return;
                      setLogoEnCours(true);
                      try {
                        const url = await televerserLogoGroupe(resultatCreation.groupe.id, fichier);
                        setLogoGroupeUrl(url);
                      } catch (err) {
                        console.error("Erreur de téléversement du logo", err);
                      } finally {
                        setLogoEnCours(false);
                        e.target.value = "";
                      }
                    }}
                  />
                  <button
                    disabled={logoEnCours}
                    onClick={() => logoInputRef.current?.click()}
                    style={{ background: "transparent", color: C.vifBleu, border: `1px solid ${C.vifBleu}55`, borderRadius: "7px", padding: "7px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  >
                    {logoEnCours ? "Envoi..." : logoGroupeUrl ? "Remplacer" : "Ajouter un logo"}
                  </button>
                </div>
              </div>
              <button
                style={{ marginTop: "8px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                onClick={() => setShowCreateGroupe(false)}
              >
                Terminer
              </button>
            </>
          )}
        </Modal>
      )}

      {showResetAccess && (
        <Modal onClose={() => setShowResetAccess(false)} title="Accès d'urgence — réinitialiser un mot de passe">
          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Réservé aux cas d'urgence (compte bloqué, admin/président injoignable). Un nouveau mot de passe temporaire est généré immédiatement, et la personne devra en choisir un nouveau à sa prochaine connexion. Action tracée dans le journal d'audit.
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Admin / Président à réinitialiser</label>
            <select
              value={resetSelection}
              onChange={(e) => setResetSelection(e.target.value)}
              disabled={chargementAdmins}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">{chargementAdmins ? "Chargement..." : "Sélectionner une personne"}</option>
              {adminsList.map((a, i) => (
                <option key={i} value={i}>{a.nom} ({a.identifiant}) — {a.role} — {a.groupNom}</option>
              ))}
            </select>
            {!chargementAdmins && adminsList.length === 0 && (
              <div style={{ fontSize: "11px", color: C.sub, marginTop: "5px" }}>Aucun admin/président trouvé.</div>
            )}
          </div>

          {resetErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {resetErreur}
            </div>
          )}
          {resetMotDePasseTemp && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <CheckCircle2 size={14} /> Mot de passe réinitialisé.
              </div>
              <div>Nouveau mot de passe temporaire : <b>{resetMotDePasseTemp}</b></div>
              <div style={{ color: C.sub, fontSize: "10.5px", marginTop: "4px" }}>
                À sa prochaine connexion, la personne devra choisir un nouveau mot de passe définitif.
              </div>
            </div>
          )}

          <button
            disabled={resetEnCours}
            style={{ marginTop: "6px", background: C.warn, color: "#FFF6EE", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: resetEnCours ? "default" : "pointer", opacity: resetEnCours ? 0.7 : 1 }}
            onClick={async () => {
              if (resetSelection === "") {
                setResetErreur("Sélectionne une personne à réinitialiser.");
                setResetMotDePasseTemp("");
                return;
              }
              setResetEnCours(true);
              setResetErreur("");
              try {
                const admin = adminsList[parseInt(resetSelection, 10)];
                const nouveauMdp = await reinitialiserMotDePasseDirect(admin.email, admin.groupId, admin.groupNom);
                setResetMotDePasseTemp(nouveauMdp);
                await chargerAudit();
              } catch (e) {
                console.error("Erreur de réinitialisation", e);
                setResetErreur(e.message || "Erreur lors de la réinitialisation.");
                setResetMotDePasseTemp("");
              } finally {
                setResetEnCours(false);
              }
            }}
          >
            {resetEnCours ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
          </button>
        </Modal>
      )}
    </div>
  );
}


// ============================================================
// ÉCRAN 3 — ADMIN DE GROUPE (modules Tontine / Banque / Assurance / Bilan / Membres)
// ============================================================
function AdminGroupeScreen({ groupId, nomGroupe }) {
  const fmtFCFA = (n) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

  // Vérifie le statut de la licence du groupe (bloque l'accès si
  // expirée). Placé tout en haut, avant tout autre Hook, et le
  // "return" plus bas reste unique — jamais de retour anticipé
  // entre deux Hooks, pour rester conforme aux règles de React.
  const [statutAbonnement, setStatutAbonnement] = useState(null);
  useEffect(() => {
    if (!groupId) return;
    fetchStatutAbonnement(groupId)
      .then(setStatutAbonnement)
      .catch((e) => console.error("Erreur de vérification de la licence", e));
  }, [groupId]);
  const licenceExpiree = statutAbonnement?.expire === true || statutAbonnement?.statut === "suspendu";

  const [logoGroupeUrlSidebar, setLogoGroupeUrlSidebar] = useState("");
  const [smsSolde, setSmsSolde] = useState(0);
  useEffect(() => {
    if (!groupId) return;
    fetchLogoGroupe(groupId)
      .then(setLogoGroupeUrlSidebar)
      .catch((e) => console.error("Erreur de chargement du logo", e));
  }, [groupId]);

  // Convertit une date saisie au format jj/mm/aaaa (celui utilisé
  // dans toute l'interface) vers le format aaaa-mm-jj attendu par
  // la base de données. Retourne null si le format est invalide.
  const versDateISO = (str) => {
    if (!str || !str.trim()) return null;
    const parts = str.trim().split("/");
    if (parts.length !== 3) return null;
    const [j, m, a] = parts;
    if (!j || !m || !a) return null;
    return `${a.padStart(4, "0")}-${m.padStart(2, "0")}-${j.padStart(2, "0")}`;
  };
  const [view, setView] = useState("tontine");
  const [showCreateTontine, setShowCreateTontine] = useState(false);
  const [tontineNom, setTontineNom] = useState("");
  const [tontineMontant, setTontineMontant] = useState("");
  const [tontineDateDebut, setTontineDateDebut] = useState("");
  const [partsParMembre, setPartsParMembre] = useState({});
  const [showPartsDetail, setShowPartsDetail] = useState(false);

  const ajusterParts = (membreId, delta) => {
    setPartsParMembre((prev) => {
      const actuel = prev[membreId] || 1;
      const nouveau = Math.max(1, Math.min(6, actuel + delta));
      return { ...prev, [membreId]: nouveau };
    });
  };

  // Construit la liste de rotation en tenant compte des parts :
  // chaque membre apparaît autant de fois que ses parts, mais réparti
  // en "manches" successives plutôt que collé (round 1 = tout le monde
  // une fois, round 2 = ceux qui ont ≥2 parts, etc.)
  const construireRotationAvecParts = (membresActifs) => {
    const maxParts = Math.max(1, ...membresActifs.map((m) => partsParMembre[m.id] || 1));
    const rotation = [];
    for (let manche = 0; manche < maxParts; manche++) {
      membresActifs.forEach((m) => {
        if ((partsParMembre[m.id] || 1) > manche) rotation.push(m);
      });
    }
    return rotation;
  };
  const [tontineError, setTontineError] = useState("");
  const [tontineSuccess, setTontineSuccess] = useState(false);
  const [showPayout, setShowPayout] = useState(null);
  const [rappelEnCours, setRappelEnCours] = useState(false);
  const [rappelMessage, setRappelMessage] = useState("");
  const [showRedistribution, setShowRedistribution] = useState(false);
  const [totalRedistributions, setTotalRedistributions] = useState(0);
  useEffect(() => {
    if (groupId && view === "bilan") {
      fetchTotalRedistributions(groupId).then(setTotalRedistributions).catch((e) => console.error("Erreur de chargement des redistributions", e));
    }
  }, [groupId, view]);
  const [redistributionApercu, setRedistributionApercu] = useState(null);
  const [redistributionErreur, setRedistributionErreur] = useState("");
  const [redistributionChargement, setRedistributionChargement] = useState(false);
  const [redistributionEnCours, setRedistributionEnCours] = useState(false);
  const [redistributionSuccess, setRedistributionSuccess] = useState(false);
  const [showEnchere, setShowEnchere] = useState(false);
  const [enchereTour, setEnchereTour] = useState(null);
  const [enchereBeneficiaire, setEnchereBeneficiaire] = useState("");
  const [enchereMontant, setEnchereMontant] = useState("");
  const [enchereErreur, setEnchereErreur] = useState("");
  const [seances, setSeances] = useState([]);
  const [newDate, setNewDate] = useState("");
  const [modeSaisie, setModeSaisie] = useState("manuel"); // "manuel" | "auto"
  const [autoDateDebut, setAutoDateDebut] = useState("");
  const [autoDateFin, setAutoDateFin] = useState("");
  const [autoJourSemaine, setAutoJourSemaine] = useState("0");
  const [autoFrequence, setAutoFrequence] = useState("chaque_semaine");
  const [autoOccurrences, setAutoOccurrences] = useState([]);
  const [autoErreur, setAutoErreur] = useState("");

  const JOURS_SEMAINE = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

  const parseJJMMAAAA = (str) => {
    const [j, m, a] = str.split("/").map((n) => parseInt(n, 10));
    if (!j || !m || !a) return null;
    return new Date(a, m - 1, j);
  };
  const formatJJMMAAAA = (d) => {
    const j = String(d.getDate()).padStart(2, "0");
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${j}/${m}/${d.getFullYear()}`;
  };

  const toggleOccurrence = (val) => {
    setAutoOccurrences((prev) => (prev.includes(val) ? prev.filter((o) => o !== val) : [...prev, val]));
  };

  const genererDatesAuto = () => {
    setAutoErreur("");
    const debut = parseJJMMAAAA(autoDateDebut);
    const fin = parseJJMMAAAA(autoDateFin);
    if (!debut || !fin) { setAutoErreur("Renseigne une date de début et de fin valides (jj/mm/aaaa)."); return; }
    if (fin < debut) { setAutoErreur("La date de fin doit être après la date de début."); return; }
    const jourCible = parseInt(autoJourSemaine, 10);
    const dates = [];

    if (autoFrequence === "mensuel_occurrences") {
      if (autoOccurrences.length === 0) { setAutoErreur("Sélectionne au moins une occurrence (ex. 2e, 4e, dernier)."); return; }
      let d = new Date(debut.getFullYear(), debut.getMonth(), 1);
      while (d <= fin) {
        const annee = d.getFullYear(), mois = d.getMonth();
        const joursDuMois = new Date(annee, mois + 1, 0).getDate();
        const joursCorrespondants = [];
        for (let j = 1; j <= joursDuMois; j++) {
          const dt = new Date(annee, mois, j);
          if (dt.getDay() === jourCible) joursCorrespondants.push(dt);
        }
        autoOccurrences.forEach((occ) => {
          const choisi = occ === "dernier" ? joursCorrespondants[joursCorrespondants.length - 1] : joursCorrespondants[parseInt(occ, 10) - 1];
          if (choisi && choisi >= debut && choisi <= fin) dates.push(new Date(choisi));
        });
        d = new Date(annee, mois + 1, 1);
      }
    } else {
      let d = new Date(debut);
      while (d.getDay() !== jourCible) d.setDate(d.getDate() + 1);
      const pas = autoFrequence === "toutes_2_semaines" ? 14 : 7;
      while (d <= fin) {
        dates.push(new Date(d));
        d.setDate(d.getDate() + pas);
      }
    }

    if (dates.length === 0) { setAutoErreur("Aucune date trouvée dans cette période avec ces critères."); return; }
    dates.sort((a, b) => a - b);
    const nouvellesSeances = dates.map((d) => ({ date: formatJJMMAAAA(d), mode: newMode }));
    // Fusionne avec l'existant, retire les doublons de date, puis trie chronologiquement
    const fusion = [...seances, ...nouvellesSeances];
    const datesVues = new Set();
    const sansDoublons = fusion.filter((s) => {
      if (datesVues.has(s.date)) return false;
      datesVues.add(s.date);
      return true;
    });
    sansDoublons.sort((a, b) => (parseJJMMAAAA(a.date) || 0) - (parseJJMMAAAA(b.date) || 0));
    setSeances(sansDoublons);
  };

  const [newMode, setNewMode] = useState("Ordre fixe");

  const addSeance = () => {
    if (!newDate.trim()) return;
    if (seances.some((s) => s.date === newDate.trim())) {
      setNewDate("");
      return; // cette date existe déjà, on ne l'ajoute pas en double
    }
    const fusion = [...seances, { date: newDate.trim(), mode: newMode }];
    fusion.sort((a, b) => (parseJJMMAAAA(a.date) || 0) - (parseJJMMAAAA(b.date) || 0));
    setSeances(fusion);
    setNewDate("");
  };

  const removeSeance = (idx) => {
    setSeances(seances.filter((_, i) => i !== idx));
  };

  const DEFAULT_MEMBRES = [
    { nom: "Jean Mballa", role: "Président", statut: "actif" },
    { nom: "Sylvie Etoundi", role: "Secrétaire générale", statut: "actif" },
    { nom: "Paul Ngono", role: "Membre", statut: "en attente" },
    { nom: "Rachel Biya", role: "Trésorière", statut: "actif" },
  ];
  const [membres, setMembres] = useState(DEFAULT_MEMBRES);
  const [loadingData, setLoadingData] = useState(true);
  const [membresErreurChargement, setMembresErreurChargement] = useState("");

  const rechargerMembres = async () => {
    try {
      const data = await fetchMembres(groupId);
      setMembres(data);
      setMembresErreurChargement("");
    } catch (e) {
      console.error("Erreur de chargement des membres", e);
      setMembresErreurChargement("Impossible de charger les membres depuis Supabase — vérifie ta connexion.");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (groupId) rechargerMembres();
  }, [groupId]);

  const [typesFonds, setTypesFonds] = useState([]);
  const [fondsParMembre, setFondsParMembre] = useState({});

  const rechargerFonds = async () => {
    if (!groupId) return;
    try {
      const types = await fetchTypesFonds(groupId);
      setTypesFonds(types);
      const tousFonds = await fetchFondsTousMembres(groupId);
      const parMembre = {};
      tousFonds.forEach((f) => {
        if (!parMembre[f.membreId]) parMembre[f.membreId] = [];
        const type = types.find((t) => t.id === f.typeFondsId);
        parMembre[f.membreId].push({ typeFondsId: f.typeFondsId, nom: type?.nom || "—", cible: type?.cible || 0, solde: f.solde });
      });
      setFondsParMembre(parMembre);
    } catch (e) {
      console.error("Erreur de chargement des fonds", e);
    }
  };

  useEffect(() => {
    if (groupId) rechargerFonds();
  }, [groupId]);

  // Trouve rapidement le fonds "Fonds de garantie" d'un membre
  // (utilisé pour l'éligibilité aux crédits)
  const fondsGarantieDe = (membreId) =>
    (fondsParMembre[membreId] || []).find((f) => f.nom === "Fonds de garantie");

  const [tontineActive, setTontineActive] = useState(null);
  const [chargementTontine, setChargementTontine] = useState(true);
  const [erreurTontine, setErreurTontine] = useState("");
  const [cotisationsTourEnCours, setCotisationsTourEnCours] = useState([]);

  const rechargerTontine = async () => {
    if (!groupId) return;
    setChargementTontine(true);
    try {
      const data = await fetchTontineActive(groupId);
      setTontineActive(data);
      setErreurTontine("");

      const tourEnCours = data?.tours.find((t) => t.statut === "en cours");
      if (tourEnCours) {
        const ids = await fetchCotisationsTour(tourEnCours.id);
        setCotisationsTourEnCours(ids);
      } else {
        setCotisationsTourEnCours([]);
      }
    } catch (e) {
      console.error("Erreur de chargement de la tontine", e);
      setErreurTontine("Impossible de charger la tontine.");
    } finally {
      setChargementTontine(false);
    }
  };

  useEffect(() => {
    rechargerTontine();
  }, [groupId]);

  // Vue simplifiée compatible avec l'affichage existant
  const tours = tontineActive
    ? tontineActive.tours.map((t) => ({
        id: t.id,
        tour: t.numero,
        beneficiaire: t.beneficiaireNom,
        beneficiaireId: t.beneficiaireId,
        montant: t.montant ? fmtFCFA(t.montant) : "—",
        mode: t.mode,
        statut: t.statut,
        commissionEncheres: t.commissionEncheres,
      }))
    : [];

  const tourEnCours = tontineActive?.tours.find((t) => t.statut === "en cours") || null;

  const [prets, setPrets] = useState([]);
  const [chargementPrets, setChargementPrets] = useState(true);

  const rechargerPrets = async () => {
    if (!groupId) return;
    try {
      const data = await fetchPrets(groupId);
      setPrets(data.map((p) => ({
        id: p.id,
        membre: p.membre,
        montant: fmtFCFA(p.montant),
        avaliste: p.avaliste,
        statut: p.statut,
        echeance: p.dateFin,
      })));
    } catch (e) {
      console.error("Erreur de chargement des prêts", e);
    } finally {
      setChargementPrets(false);
    }
  };

  useEffect(() => { if (view === "banque" || view === "bilan") rechargerPrets(); }, [groupId, view]);

  const tourStatus = { "clôturé": { bg: C.ok, fg: C.accent2 }, "en cours": { bg: "#FBF1DC", fg: C.accent }, "à venir": { bg: "#EEE", fg: C.sub } };

  const [showAmende, setShowAmende] = useState(null);
  const [amendeMontant, setAmendeMontant] = useState("");
  const [amendeMotif, setAmendeMotif] = useState("");
  const [amendeError, setAmendeError] = useState("");
  const [showNouveauDepot, setShowNouveauDepot] = useState(false);
  const [depotDate, setDepotDate] = useState("");
  const [depotMontant, setDepotMontant] = useState("");
  const [depotMotif, setDepotMotif] = useState("");
  const [depotCategorie, setDepotCategorie] = useState("");
  const [categoriesFrais, setCategoriesFrais] = useState([]);
  const [showNewCategorieFrais, setShowNewCategorieFrais] = useState(false);
  const [newCategorieFraisNom, setNewCategorieFraisNom] = useState("");
  const [responsablesFrais, setResponsablesFrais] = useState([]);
  const [joindreRecuEnCours, setJoindreRecuEnCours] = useState(null);
  const inputsFichierRecu = useRef({});
  const [depotBanque, setDepotBanque] = useState("");
  const [depotMembreSimple, setDepotMembreSimple] = useState("");
  const [depotError, setDepotError] = useState("");
  const [depotSuccess, setDepotSuccess] = useState(false);
  const [recuJoint, setRecuJoint] = useState(false);
  const [typeMouvementBanque, setTypeMouvementBanque] = useState("Dépôt");

  const [showCreerCompte, setShowCreerCompte] = useState(false);
  const [showAjouterSignataire, setShowAjouterSignataire] = useState(false);
  const [sigMembreId, setSigMembreId] = useState("");
  const [sigFonction, setSigFonction] = useState("");
  const [sigError, setSigError] = useState("");
  const [sigSuccess, setSigSuccess] = useState(false);
  const [compteNom, setCompteNom] = useState("");
  const [compteBanque, setCompteBanque] = useState("");
  const [compteNumero, setCompteNumero] = useState("");
  const [compteType, setCompteType] = useState("Courant");
  const [compteTauxInteret, setCompteTauxInteret] = useState("");
  const [compteError, setCompteError] = useState("");
  const [compteSuccess, setCompteSuccess] = useState(false);
  const [signataires, setSignataires] = useState([]);
  const [signatairesChoisis, setSignatairesChoisis] = useState([]);
  const toggleSignataire = (id) => {
    setSignatairesChoisis((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]));
  };

  const [comptesBancaires, setComptesBancaires] = useState([]);
  const [compteActifId, setCompteActifId] = useState("");
  const [depots, setDepots] = useState([]);
  const [chargementDepots, setChargementDepots] = useState(true);

  const rechargerComptes = async () => {
    if (!groupId) return;
    try {
      const sigs = await fetchSignataires(groupId);
      setSignataires(sigs);
      const comptes = await fetchComptesBancaires(groupId);
      setComptesBancaires(comptes);
      if (comptes.length > 0 && !compteActifId) setCompteActifId(comptes[0].id);
      const cats = await fetchCategoriesFrais(groupId);
      setCategoriesFrais(cats);
    } catch (e) {
      console.error("Erreur de chargement des comptes bancaires", e);
    } finally {
      setChargementDepots(false);
    }
  };

  useEffect(() => { if (view === "depots" || view === "bilan") rechargerComptes(); }, [groupId, view]);

  const rechargerDepots = async () => {
    if (!compteActifId) { setDepots([]); return; }
    try {
      const mvts = await fetchMouvementsCompte(compteActifId);
      setDepots(mvts.map((d) => ({
        ...d,
        montant: fmtFCFA(d.montant),
        solde: fmtFCFA(d.solde),
      })));
    } catch (e) {
      console.error("Erreur de chargement des mouvements", e);
    }
  };

  useEffect(() => { if (view === "depots") rechargerDepots(); }, [compteActifId, view]);

  const compteActif = comptesBancaires.find((c) => c.id === compteActifId) || null;
  const soldeCompteActuel = depots.length ? depots[0].solde : fmtFCFA(0);
  const [filtreDateDebut, setFiltreDateDebut] = useState("");
  const [filtreDateFin, setFiltreDateFin] = useState("");
  const [bankTab, setBankTab] = useState("apercu");
  const [historiqueBanque, setHistoriqueBanque] = useState([]);
  const [chargementHistoriqueBanque, setChargementHistoriqueBanque] = useState(true);

  const rechargerHistoriqueBanque = async () => {
    if (!groupId) return;
    try {
      const data = await fetchHistoriqueEpargnes(groupId);
      setHistoriqueBanque(data.map((m) => ({
        date: m.date,
        membre: m.membre,
        epargne: m.epargne,
        type: m.type,
        montant: `${m.type === "Versement" ? "+" : "-"}${fmtFCFA(m.montant)}`,
        solde: fmtFCFA(m.solde),
      })));
    } catch (e) {
      console.error("Erreur de chargement de l'historique", e);
    } finally {
      setChargementHistoriqueBanque(false);
    }
  };

  useEffect(() => { if (view === "depots") rechargerHistoriqueBanque(); }, [groupId, view]);
  const [showInviteMember, setShowInviteMember] = useState(false);
  const [inviteNom, setInviteNom] = useState("");
  const [inviteTelephone, setInviteTelephone] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCaution, setInviteCaution] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const [showEditMembre, setShowEditMembre] = useState(false);
  const [editDocuments, setEditDocuments] = useState({});
  const [documentEnCours, setDocumentEnCours] = useState("");
  const inputsDocumentsRef = useRef({});
  const [showHistoriqueMembre, setShowHistoriqueMembre] = useState(null);
  const [showCotisationFonds, setShowCotisationFonds] = useState(false);
  const [cotisationFondsTypeId, setCotisationFondsTypeId] = useState("");
  const [cotisationFondsDate, setCotisationFondsDate] = useState("");
  const [cotisationFondsMontants, setCotisationFondsMontants] = useState({});
  const [cotisationFondsErreur, setCotisationFondsErreur] = useState("");
  const [cotisationFondsEnCours, setCotisationFondsEnCours] = useState(false);
  const [showGererTypesFonds, setShowGererTypesFonds] = useState(false);
  const [newTypeFondsNom, setNewTypeFondsNom] = useState("");
  const [newTypeFondsCible, setNewTypeFondsCible] = useState("");
  const [cibleTypeInputs, setCibleTypeInputs] = useState({});
  const [cibleTypeEnCours, setCibleTypeEnCours] = useState("");
  const [inviteVersementInitial, setInviteVersementInitial] = useState("");
  const [historiqueMembreData, setHistoriqueMembreData] = useState(null);
  const [chargementHistoriqueMembre, setChargementHistoriqueMembre] = useState(false);
  const [showDeleteMembre, setShowDeleteMembre] = useState(null);
  const [showResetMembre, setShowResetMembre] = useState(false);
  const [resetMembreId, setResetMembreId] = useState("");
  const [resetMembreEnCours, setResetMembreEnCours] = useState(false);
  const [resetMembreErreur, setResetMembreErreur] = useState("");
  const [resetMembreMotDePasse, setResetMembreMotDePasse] = useState("");
  const [deleteEnCours, setDeleteEnCours] = useState(false);
  const [deleteErreur, setDeleteErreur] = useState("");
  const [editMembre, setEditMembre] = useState(null);
  const [editNom, setEditNom] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTelephone, setEditTelephone] = useState("");
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState(false);
  const [inviteIdentifiant, setInviteIdentifiant] = useState("");
  const [inviteMotDePasseTemp, setInviteMotDePasseTemp] = useState("");
  const [showRapportJournalier, setShowRapportJournalier] = useState(false);
  const [rapportJourDate, setRapportJourDate] = useState("");
  const [rapportJour, setRapportJour] = useState(null);
  const [rapportJourChargement, setRapportJourChargement] = useState(false);
  const [rapportJourErreur, setRapportJourErreur] = useState("");
  const [showRapportMensuel, setShowRapportMensuel] = useState(false);
  const [rapportMoisSelection, setRapportMoisSelection] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [rapportAnneeSelection, setRapportAnneeSelection] = useState(String(new Date().getFullYear()));
  const [rapportMois, setRapportMois] = useState(null);
  const [rapportMoisChargement, setRapportMoisChargement] = useState(false);
  const [rapportMoisErreur, setRapportMoisErreur] = useState("");
  const [exportAnnee, setExportAnnee] = useState(String(new Date().getFullYear()));
  const [exportEnCours, setExportEnCours] = useState(false);
  const [exportErreur, setExportErreur] = useState("");
  const [exportSuccess, setExportSuccess] = useState(false);
  const [showExportBilan, setShowExportBilan] = useState(false);
  const [logementType, setLogementType] = useState("Locataire");
  const [parrain, setParrain] = useState("");
  const [roleType, setRoleType] = useState("Membre simple");
  const [postes, setPostes] = useState(["Président", "Secrétaire général", "Trésorier", "Comptable", "Commissaire aux comptes", "Censeur"]);
  const [posteChoisi, setPosteChoisi] = useState("Président");
  const [showNewPoste, setShowNewPoste] = useState(false);
  const [newPosteName, setNewPosteName] = useState("");
  const addPoste = () => {
    if (!newPosteName.trim()) return;
    setPostes([...postes, newPosteName.trim()]);
    setPosteChoisi(newPosteName.trim());
    setNewPosteName("");
    setShowNewPoste(false);
  };
  const [showCreateEpargne, setShowCreateEpargne] = useState(false);
  const [showCloture, setShowCloture] = useState(null);
  const [clotureEtape, setClotureEtape] = useState(1);
  const [clotureApercu, setClotureApercu] = useState(null);
  const [clotureDecisions, setClotureDecisions] = useState({});
  const [clotureNouveauNom, setClotureNouveauNom] = useState("");
  const [clotureErreur, setClotureErreur] = useState("");
  const [clotureChargement, setClotureChargement] = useState(false);
  const [clotureEnCours, setClotureEnCours] = useState(false);
  const [epargneType, setEpargneType] = useState("Personnalisée");
  const [epargneNom, setEpargneNom] = useState("");
  const [epargneCotisation, setEpargneCotisation] = useState("");
  const [epargneTaux, setEpargneTaux] = useState("");
  const [epargneCloture, setEpargneCloture] = useState("");
  const [epargneError, setEpargneError] = useState("");
  const [epargneSuccess, setEpargneSuccess] = useState(false);
  const [epargnes, setEpargnes] = useState([]);
  const [chargementEpargnes, setChargementEpargnes] = useState(true);

  const rechargerEpargnes = async () => {
    if (!groupId) return;
    try {
      const data = await fetchEpargnes(groupId);
      setEpargnes(data);
    } catch (e) {
      console.error("Erreur de chargement des épargnes", e);
    } finally {
      setChargementEpargnes(false);
    }
  };

  useEffect(() => { if (view === "banque" || view === "bilan" || view === "seances") rechargerEpargnes(); }, [groupId, view]);
  const [showCotisationBanque, setShowCotisationBanque] = useState(false);
  const [showCreditForm, setShowCreditForm] = useState(false);
  const CAUTION_DEFAUT = 100000;
  const [creditEpargneId, setCreditEpargneId] = useState("");
  const [creditMembreId, setCreditMembreId] = useState("");
  const [creditMontant, setCreditMontant] = useState("");
  const [creditFraisDossier, setCreditFraisDossier] = useState("");
  const [creditCommission, setCreditCommission] = useState("");
  const [creditPenalite, setCreditPenalite] = useState("");
  const [creditDebut, setCreditDebut] = useState("");
  const [creditFin, setCreditFin] = useState("");
  const [creditAvalisteId, setCreditAvalisteId] = useState("");
  const [creditError, setCreditError] = useState("");
  const [creditSuccess, setCreditSuccess] = useState(false);
  const [creditDepasseCaution, setCreditDepasseCaution] = useState(false);
  const [cotisationEpargneId, setCotisationEpargneId] = useState("");
  const [cotisationBanqueErreur, setCotisationBanqueErreur] = useState("");
  const [cotisationDate, setCotisationDate] = useState("");
  const [cotisationMontants, setCotisationMontants] = useState({});

  const setMontantMembre = (nom, val) => {
    setCotisationMontants((prev) => ({ ...prev, [nom]: val }));
  };

  const [showCotisationTontine, setShowCotisationTontine] = useState(false);
  const [cotisationTontineDate, setCotisationTontineDate] = useState("");
  const [cotisationTontineMontants, setCotisationTontineMontants] = useState({});
  const [cotisationTontineError, setCotisationTontineError] = useState("");
  const [showAjouterMembreCycle, setShowAjouterMembreCycle] = useState(false);
  const [ajoutMembreId, setAjoutMembreId] = useState("");
  const [ajoutMontantRappel, setAjoutMontantRappel] = useState("");
  const [ajoutErreur, setAjoutErreur] = useState("");
  const [ajoutSuccess, setAjoutSuccess] = useState(false);
  const setMontantTontineMembre = (nom, val) => {
    setCotisationTontineMontants((prev) => ({ ...prev, [nom]: val }));
  };

  const [showCotisationAssurance, setShowCotisationAssurance] = useState(false);
  const [showDeclarerEvenement, setShowDeclarerEvenement] = useState(false);
  const [evenementBeneficiaire, setEvenementBeneficiaire] = useState("");
  const [evenementMontant, setEvenementMontant] = useState("");
  const [evenementError, setEvenementError] = useState("");
  const [evenementSuccess, setEvenementSuccess] = useState(false);
  const [soldeMinimum, setSoldeMinimum] = useState(80000);
  const [delaiJoursAssurance, setDelaiJoursAssurance] = useState(60);
  const [montantPrelevementDefaut, setMontantPrelevementDefaut] = useState(10000);
  const [assuranceSoldes, setAssuranceSoldes] = useState({});
  const [evenements, setEvenements] = useState([]);
  const [chargementAssurance, setChargementAssurance] = useState(true);
  const [showConfigAssurance, setShowConfigAssurance] = useState(false);
  const [configSoldeMinimum, setConfigSoldeMinimum] = useState("");
  const [configDelaiJours, setConfigDelaiJours] = useState("");
  const [configMontantPrelevement, setConfigMontantPrelevement] = useState("");
  const [configAssuranceErreur, setConfigAssuranceErreur] = useState("");
  const [configAssuranceSuccess, setConfigAssuranceSuccess] = useState(false);
  const [historiqueAssurance, setHistoriqueAssurance] = useState([]);
  const [assuranceTab, setAssuranceTab] = useState("apercu");

  const rechargerAssurance = async () => {
    if (!groupId || membres.length === 0) return;
    try {
      const config = await fetchConfigAssurance(groupId);
      setSoldeMinimum(config.soldeMinimum);
      setDelaiJoursAssurance(config.delaiJours);
      setMontantPrelevementDefaut(config.montantPrelevementDefaut);
      const soldes = await fetchSoldesAssurance(groupId, membres, config.soldeMinimum);
      setAssuranceSoldes(soldes);
      const evts = await fetchEvenements(groupId);
      setEvenements(evts);
      const histo = await fetchHistoriqueAssurance(groupId);
      setHistoriqueAssurance(histo);
    } catch (e) {
      console.error("Erreur de chargement de l'assurance", e);
    } finally {
      setChargementAssurance(false);
    }
  };

  useEffect(() => { if (view === "assurance" || view === "bilan") rechargerAssurance(); }, [groupId, membres.length, view]);
  const [eventTypes, setEventTypes] = useState([]);
  const [typeEvenementId, setTypeEvenementId] = useState("");
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  const rechargerTypesEvenement = async () => {
    if (!groupId) return;
    try {
      let types = await fetchTypesEvenement(groupId);
      if (types.length === 0) {
        // Première utilisation : on crée les types classiques par défaut
        for (const nom of ["Décès", "Mariage", "Cérémonie", "Autre"]) {
          await creerTypeEvenement(groupId, nom);
        }
        types = await fetchTypesEvenement(groupId);
      }
      setEventTypes(types);
      if (types.length > 0 && !typeEvenementId) setTypeEvenementId(types[0].id);
    } catch (e) {
      console.error("Erreur de chargement des types d'événement", e);
    }
  };
  useEffect(() => { if (view === "assurance") rechargerTypesEvenement(); }, [groupId, view]);

  const [seancesList, setSeancesList] = useState([]);
  const [showTypesAmendesSeance, setShowTypesAmendesSeance] = useState(false);
  const [newTypeAmendeNom, setNewTypeAmendeNom] = useState("");
  const [newTypeAmendeMontant, setNewTypeAmendeMontant] = useState("");
  const [montantAmendeInputs, setMontantAmendeInputs] = useState({});
  const [showCreerSeance, setShowCreerSeance] = useState(false);
  const [seanceDate, setSeanceDate] = useState("");
  const [seanceLieu, setSeanceLieu] = useState("");
  const [seanceOrdreDuJour, setSeanceOrdreDuJour] = useState("");
  const [seanceCreationErreur, setSeanceCreationErreur] = useState("");
  const [showDetailSeance, setShowDetailSeance] = useState(null);
  const [presencesSeance, setPresencesSeance] = useState({});
  const [amendesSeanceList, setAmendesSeanceList] = useState([]);
  const [seanceCompteRendu, setSeanceCompteRendu] = useState("");
  const [amendeSeanceMembreId, setAmendeSeanceMembreId] = useState("");
  const [amendeSeanceTypeId, setAmendeSeanceTypeId] = useState("");
  const [amendeSeanceMontant, setAmendeSeanceMontant] = useState("");
  const [paiementAmendeId, setPaiementAmendeId] = useState(null);
  const [paiementMode, setPaiementMode] = useState("espèces");
  const [paiementEpargneId, setPaiementEpargneId] = useState("");
  const [paiementEnCours, setPaiementEnCours] = useState(false);
  const [typesAmendesSeance, setTypesAmendesSeance] = useState([]);
  const [tauxPresence, setTauxPresence] = useState({});
  const [soldeCaisseAmendes, setSoldeCaisseAmendes] = useState(0);

  const rechargerSeances = async () => {
    if (!groupId) return;
    try {
      const [s, t, tp, caisse] = await Promise.all([
        fetchSeances(groupId),
        fetchTypesAmendesSeance(groupId),
        fetchTauxPresence(groupId),
        fetchCaisseAmendes(groupId),
      ]);
      setSeancesList(s);
      setTypesAmendesSeance(t);
      setTauxPresence(tp);
      setSoldeCaisseAmendes(caisse);
    } catch (e) {
      console.error("Erreur de chargement des séances", e);
    }
  };
  useEffect(() => { if (view === "seances" || view === "bilan" || view === "depenses") rechargerSeances(); }, [groupId, view]);

  const [rafraichissementsList, setRafraichissementsList] = useState([]);
  const [soldeCaisseRafraichissement, setSoldeCaisseRafraichissement] = useState(0);
  const [showCreerRafraichissement, setShowCreerRafraichissement] = useState(false);
  const [rafraDate, setRafraDate] = useState("");
  const [rafraSeanceId, setRafraSeanceId] = useState("");
  const [rafraMontantParMembre, setRafraMontantParMembre] = useState("1000");
  const [rafraParticipants, setRafraParticipants] = useState({});
  const [rafraFacture, setRafraFacture] = useState("");
  const [rafraResponsableId, setRafraResponsableId] = useState("");
  const [rafraErreur, setRafraErreur] = useState("");
  const [rafraEnCours, setRafraEnCours] = useState(false);
  const [typesDepenses, setTypesDepenses] = useState([]);
  const [depensesList, setDepensesList] = useState([]);
  const [showTypesDepenses, setShowTypesDepenses] = useState(false);
  const [newTypeDepenseNom, setNewTypeDepenseNom] = useState("");
  const [showCreerDepense, setShowCreerDepense] = useState(false);
  const [depenseTypeId, setDepenseTypeId] = useState("");
  const [depenseMontant, setDepenseMontant] = useState("");
  const [depenseDate, setDepenseDate] = useState("");
  const [depenseMotif, setDepenseMotif] = useState("");
  const [depenseSourceType, setDepenseSourceType] = useState("");
  const [depenseSourceId, setDepenseSourceId] = useState("");
  const [depenseErreur, setDepenseErreur] = useState("");
  const [depenseEnCours, setDepenseEnCours] = useState(false);

  const rechargerDepenses = async () => {
    if (!groupId) return;
    try {
      const [r, caisse, types, dep] = await Promise.all([
        fetchRafraichissements(groupId),
        fetchCaisseRafraichissement(groupId),
        fetchTypesDepenses(groupId),
        fetchDepenses(groupId),
      ]);
      setRafraichissementsList(r);
      setSoldeCaisseRafraichissement(caisse);
      setTypesDepenses(types);
      setDepensesList(dep);
    } catch (e) {
      console.error("Erreur de chargement des dépenses", e);
    }
  };
  useEffect(() => { if (view === "depenses" || view === "bilan") rechargerDepenses(); }, [groupId, view]);

  const addEventType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const nouveau = await creerTypeEvenement(groupId, newTypeName.trim());
      setEventTypes([...eventTypes, nouveau]);
      setTypeEvenementId(nouveau.id);
      setNewTypeName("");
      setShowNewType(false);
    } catch (e) {
      console.error("Erreur de création du type d'événement", e);
    }
  };

  const [delegues, setDelegues] = useState([]);
  const [touteReunion, setTouteReunion] = useState(false);
  const toggleDelegue = (id) => {
    setDelegues((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]));
  };

  const [deductions, setDeductions] = useState([{ label: "Transport des délégués", montant: "" }]);
  const addDeduction = () => setDeductions([...deductions, { label: "", montant: "" }]);
  const updateDeduction = (idx, field, val) => {
    setDeductions((prev) => prev.map((d, i) => (i === idx ? { ...d, [field]: val } : d)));
  };
  const removeDeduction = (idx) => setDeductions((prev) => prev.filter((_, i) => i !== idx));
  const [cotisationAssuranceDate, setCotisationAssuranceDate] = useState("");
  const [cotisationAssuranceErreur, setCotisationAssuranceErreur] = useState("");
  const [cotisationAssuranceMontants, setCotisationAssuranceMontants] = useState({});
  const setMontantAssuranceMembre = (nom, val) => {
    setCotisationAssuranceMontants((prev) => ({ ...prev, [nom]: val }));
  };

  return licenceExpiree ? (
    <div style={{ minHeight: "680px", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "30px", textAlign: "center" }}>
      <div style={{ maxWidth: "360px" }}>
        <div style={{ width: "56px", height: "56px", margin: "0 auto 16px", borderRadius: "14px", background: C.warnBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ShieldAlert size={26} color={C.warn} />
        </div>
        <h1 style={{ fontSize: "18px", fontWeight: 700, color: C.ink, margin: "0 0 8px" }}>Licence expirée</h1>
        <p style={{ fontSize: "13px", color: C.sub, margin: 0 }}>
          {statutAbonnement?.statut === "suspendu"
            ? "L'accès à ce groupe a été suspendu par le Super Admin de la plateforme."
            : `L'abonnement de ce groupe a expiré${statutAbonnement?.dateExpiration ? ` le ${new Date(statutAbonnement.dateExpiration).toLocaleDateString("fr-FR")}` : ""}.`}
          {" "}Contacte le Super Admin de la plateforme pour le renouveler.
        </p>
      </div>
    </div>
  ) : (
    <div className="app-layout" style={{ minHeight: "680px", background: C.bg, display: "flex", color: C.ink }}>
      <Sidebar
        role="Admin Groupe" sub={nomGroupe || "—"} logoUrl={logoGroupeUrlSidebar}
        items={[
          { icon: <Calendar size={16} />, label: "Séances", key: "seances" },
          { icon: <Banknote size={16} />, label: "Tontine", key: "tontine" },
          { icon: <PiggyBank size={16} />, label: "Banque", key: "banque" },
          { icon: <HeartHandshake size={16} />, label: "Assurance", key: "assurance" },
          { icon: <Wallet size={16} />, label: "Fonds", key: "fonds" },
          { icon: <ShoppingCart size={16} />, label: "Dépenses", key: "depenses" },
          { icon: <Building2 size={16} />, label: "Dépôt / Retrait externe", key: "depots" },
          { icon: <FileBarChart size={16} />, label: "Bilan", key: "bilan" },
          { icon: <UserCog size={16} />, label: "Membres", key: "membres" },
        ]}
        active={view} onSelect={setView}
      />
      <div className="app-main" style={{ flex: 1, padding: "32px 40px", minWidth: 0 }}>
        {view === "tontine" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
                  {tontineActive ? tontineActive.nom : "Aucune tontine active"}
                </h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>
                  {chargementTontine
                    ? "Chargement..."
                    : tontineActive
                    ? `Cotisation ${fmtFCFA(tontineActive.montantParTour)}/tour · ${tontineActive.tours.length} tour(s)`
                    : "Crée une tontine pour démarrer un cycle."}
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {tontineActive && (
                  <button style={btnSecondary} onClick={() => setShowCotisationTontine(true)}><Plus size={15} /> Enregistrer une cotisation</button>
                )}
                {tontineActive && tourEnCours && (
                  <button
                    style={btnSecondary}
                    disabled={rappelEnCours}
                    onClick={async () => {
                      setRappelEnCours(true);
                      try {
                        const actifs = membres.filter((m) => m.statut === "actif" && m.telephone);
                        const message = `Rappel : séance de tontine "${tontineActive.nom}" (Tour ${tourEnCours.numero}) prochainement. Merci de préparer votre cotisation.`;
                        const numeros = actifs.map((m) => m.telephone);
                        await envoyerSMS({ message, numeros, groupId });
                        setRappelMessage(`Rappel envoyé à ${actifs.length} membre(s).`);
                      } catch (e) {
                        console.error("Erreur d'envoi du rappel", e);
                      } finally {
                        setRappelEnCours(false);
                        setTimeout(() => setRappelMessage(""), 3000);
                      }
                    }}
                  >
                    <Bell size={15} /> {rappelEnCours ? "Envoi..." : "Envoyer un rappel"}
                  </button>
                )}
                {tontineActive && !tourEnCours && (
                  <button
                    style={{ ...btnSecondary, borderColor: `${C.vifRose}66`, color: C.vifRose }}
                    onClick={async () => {
                      setShowRedistribution(true);
                      setRedistributionApercu(null);
                      setRedistributionErreur("");
                      setRedistributionSuccess(false);
                      setRedistributionChargement(true);
                      try {
                        const apercu = await fetchApercuRedistribution(tontineActive.id);
                        setRedistributionApercu(apercu);
                      } catch (e) {
                        console.error("Erreur de chargement de la redistribution", e);
                        setRedistributionErreur("Erreur lors du chargement.");
                      } finally {
                        setRedistributionChargement(false);
                      }
                    }}
                  >
                    <Gavel size={15} /> Redistribuer la commission
                  </button>
                )}
                {tontineActive && (
                  <button
                    style={btnSecondary}
                    onClick={() => { setAjoutMembreId(""); setAjoutMontantRappel(""); setAjoutErreur(""); setAjoutSuccess(false); setShowAjouterMembreCycle(true); }}
                  >
                    <Plus size={15} /> Ajouter un membre au cycle
                  </button>
                )}
                <button style={btnPrimary} onClick={() => { setTontineNom(""); setTontineMontant(""); setTontineDateDebut(""); setTontineError(""); setTontineSuccess(false); setSeances([]); setModeSaisie("manuel"); setPartsParMembre({}); setShowPartsDetail(false); setShowCreateTontine(true); }}><Plus size={15} /> Créer une tontine</button>
              </div>
            </div>
            {rappelMessage && (
              <div style={{ marginTop: "10px", fontSize: "12px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px" }}>
                {rappelMessage}
              </div>
            )}

            {erreurTontine && (
              <div style={{ marginTop: "16px", fontSize: "12.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "10px 12px" }}>
                {erreurTontine}
              </div>
            )}

            {tontineActive && (
              <>
                <div style={{ marginTop: "26px" }} />
                <Table cols={["Tour", "Bénéficiaire", "Montant", "Mode", "Statut", ""]} widths="0.5fr 1.4fr 1.1fr 1fr 0.9fr 1.1fr"
                  rows={tours.map((t) => [
                    t.tour, t.beneficiaire, t.montant, t.mode,
                    <Badge bg={tourStatus[t.statut].bg} fg={tourStatus[t.statut].fg}>{t.statut}</Badge>,
                    t.statut === "en cours" ? (
                      t.mode === "Enchères" && !t.beneficiaireId ? (
                        <button
                          onClick={() => { setEnchereTour(t); setEnchereBeneficiaire(""); setEnchereMontant(""); setEnchereErreur(""); setShowEnchere(true); }}
                          style={{ background: C.vifViolet, color: "#FFFFFF", border: "none", borderRadius: "7px", padding: "6px 12px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
                        >
                          <Gavel size={13} /> Enregistrer l'enchère
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowPayout(t)}
                          style={{ background: "#2E7D46", color: "#FAF6ED", border: "none", borderRadius: "7px", padding: "6px 12px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
                        >
                          <Banknote size={13} /> Bénéficiaire
                        </button>
                      )
                    ) : null,
                  ])} />

                {tourEnCours && tourEnCours.mode === "Enchères" && (
                  <div style={{ marginTop: "18px", background: "#EBE6F5", border: `1px solid ${C.purple}44`, borderRadius: "12px", padding: "14px 18px", fontSize: "12.5px", color: C.purple, display: "flex", gap: "8px", alignItems: "center" }}>
                    <Gavel size={16} /> Commission d'enchères de ce tour : <b>{fmtFCFA(tourEnCours.commissionEncheres || 0)}</b> — redistribuée aux membres à la clôture.
                  </div>
                )}

                {tourEnCours && membres.filter((m) => m.statut === "actif" && !cotisationsTourEnCours.includes(m.id)).length > 0 && (
                  <div style={{ marginTop: "22px" }}>
                    <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 10px" }}>Cotisations non encore reçues — Tour {tourEnCours.numero}</h2>
                    {membres.filter((m) => m.statut === "actif" && !cotisationsTourEnCours.includes(m.id)).map((m, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "10px", padding: "12px 16px", marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <Clock size={16} color={C.warn} />
                          <div style={{ fontWeight: 600, fontSize: "13px" }}>{m.nom}</div>
                        </div>
                        <button
                          onClick={() => setShowAmende({ membre: m.nom, membreId: m.id, tour: tourEnCours.numero, tourId: tourEnCours.id })}
                          style={{ background: C.warn, color: "#FFF6EE", border: "none", borderRadius: "7px", padding: "7px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                        >
                          Appliquer une amende
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {view === "banque" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Banques du groupe</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>Banque scolaire, banque annuelle, et épargnes personnalisées.</p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button style={btnSecondary} onClick={() => { setCotisationEpargneId(""); setCotisationDate(""); setCotisationMontants({}); setCotisationBanqueErreur(""); setShowCotisationBanque(true); }}><Plus size={15} /> Enregistrer une cotisation</button>
                <button style={btnPrimary} onClick={() => { setEpargneNom(""); setEpargneCotisation(""); setEpargneTaux(""); setEpargneCloture(""); setEpargneType("Personnalisée"); setEpargneError(""); setEpargneSuccess(false); setShowCreateEpargne(true); }}><Plus size={15} /> Créer une épargne</button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "6px", margin: "18px 0 4px", flexWrap: "wrap" }}>
              {[
                { key: "apercu", label: "Vue d'ensemble" },
                { key: "historique", label: "Historique des mouvements" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setBankTab(t.key)}
                  style={{
                    padding: "8px 14px", borderRadius: "8px", border: `1px solid ${bankTab === t.key ? C.accent2 : C.border}`,
                    background: bankTab === t.key ? C.ok : "transparent", color: bankTab === t.key ? C.accent2 : C.sub,
                    fontSize: "12.5px", fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {bankTab === "apercu" && (
              <>
                <div style={{ display: "flex", gap: "14px", margin: "18px 0", flexWrap: "wrap" }}>
                  {epargnes.map((ep) => (
                    <div key={ep.nom} style={{ flex: 1, minWidth: "220px" }}>
                      <StatCard label={ep.nom} value={fmtFCFA(ep.solde)} sub={`Clôture ${ep.cloture}`} icon={<PiggyBank size={16} />} />
                      {ep.statut !== "clôturée" && (
                        <button
                          onClick={async () => {
                            setShowCloture(ep);
                            setClotureEtape(1);
                            setClotureApercu(null);
                            setClotureDecisions({});
                            setClotureNouveauNom(`${ep.nom} — cycle suivant`);
                            setClotureErreur("");
                            setClotureChargement(true);
                            try {
                              const apercu = await fetchApercuCloture(ep.id);
                              setClotureApercu(apercu);
                              const decisionsInit = {};
                              apercu.membres.forEach((m) => { decisionsInit[m.membreId] = "recuperer"; });
                              setClotureDecisions(decisionsInit);
                            } catch (e) {
                              console.error("Erreur de chargement de l'aperçu de clôture", e);
                              setClotureErreur("Erreur lors du chargement.");
                            } finally {
                              setClotureChargement(false);
                            }
                          }}
                          style={{ width: "100%", marginTop: "6px", background: "transparent", color: C.vifRose, border: `1px solid ${C.vifRose}66`, borderRadius: "8px", padding: "7px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer" }}
                        >
                          Clôturer le cycle
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>Prêts en cours — Banque scolaire</h2>
                  <button style={btnSecondary} onClick={() => { setCreditEpargneId(""); setCreditMembreId(""); setCreditMontant(""); setCreditFraisDossier(""); setCreditCommission(""); setCreditPenalite(""); setCreditDebut(""); setCreditFin(""); setCreditDepasseCaution(false); setCreditAvalisteId(""); setCreditError(""); setCreditSuccess(false); setShowCreditForm(true); }}><Plus size={14} /> Mettre en place un crédit</button>
                </div>
                <Table cols={["Membre", "Montant", "Avaliste", "Statut", "Échéance"]} widths="1.4fr 1fr 1.2fr 1fr 1fr"
                  rows={prets.map((p) => [p.membre, p.montant, p.avaliste, <Badge bg={p.statut === "remboursé" ? C.ok : "#FBF1DC"} fg={p.statut === "remboursé" ? C.accent2 : C.accent}>{p.statut}</Badge>, p.echeance])} />
              </>
            )}

            {bankTab === "historique" && (
              <div style={{ marginTop: "18px" }}>
                <Table cols={["Date", "Membre", "Épargne", "Type", "Montant", "Solde après"]} widths="1fr 1.3fr 1.4fr 1fr 1.1fr 1.2fr"
                  rows={historiqueBanque.map((h) => [
                    <span style={{ color: C.sub, fontSize: 12 }}>{h.date}</span>,
                    h.membre,
                    <span style={{ color: C.sub, fontSize: 12 }}>{h.epargne}</span>,
                    <Badge bg={h.type === "Versement" ? C.ok : C.warnBg} fg={h.type === "Versement" ? C.accent2 : C.warn}>{h.type}</Badge>,
                    <span style={{ fontWeight: 700, color: h.type === "Versement" ? C.accent2 : C.warn }}>{h.montant}</span>,
                    <span style={{ color: C.sub, fontSize: 12 }}>{h.solde}</span>,
                  ])}
                />
                <div style={{ fontSize: "11px", color: C.sub, marginTop: "10px" }}>
                  Chaque cotisation apparaît comme un <b>versement</b>, chaque prêt octroyé comme un <b>retrait</b> — ce sont les deux seuls types de mouvement de la banque.
                </div>
              </div>
            )}
          </>
        )}

        {view === "fonds" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Fonds</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>
                  Fonds de garantie, fonds de solidarité, ou toute autre rubrique — chaque membre cotise progressivement vers un objectif commun.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  style={btnSecondary}
                  onClick={() => { setShowGererTypesFonds(true); setNewTypeFondsNom(""); setNewTypeFondsCible(""); }}
                >
                  <Plus size={15} /> Types de fonds
                </button>
                <button
                  style={btnPrimary}
                  disabled={typesFonds.length === 0}
                  onClick={() => {
                    setCotisationFondsTypeId(typesFonds[0]?.id || "");
                    setCotisationFondsDate("");
                    setCotisationFondsMontants({});
                    setCotisationFondsErreur("");
                    setShowCotisationFonds(true);
                  }}
                >
                  <Plus size={15} /> Enregistrer fonds
                </button>
              </div>
            </div>

            {typesFonds.length === 0 ? (
              <div style={{ marginTop: "22px", fontSize: "13px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px", textAlign: "center" }}>
                Aucun type de fonds créé pour l'instant — clique "Types de fonds" pour en ajouter un (ex. Fonds de garantie).
              </div>
            ) : (
              typesFonds.map((t) => (
                <div key={t.id} style={{ marginTop: "26px" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 10px" }}>{t.nom} <span style={{ color: C.sub, fontWeight: 400, fontSize: "12px" }}>— objectif {fmtFCFA(t.cible)}</span></h2>
                  <Table cols={["Membre", "Progression", "Statut"]} widths="1.5fr 1.6fr 1.1fr"
                    rows={membres.map((m) => {
                      const f = (fondsParMembre[m.id] || []).find((x) => x.typeFondsId === t.id) || { cible: 0, solde: 0 };
                      const atteint = f.cible > 0 && f.solde >= f.cible;
                      return [
                        m.nom,
                        <div>
                          <div style={{ fontSize: "11.5px", fontWeight: 600 }}>{fmtFCFA(f.solde)} / {fmtFCFA(f.cible)}</div>
                          {f.cible > 0 && (
                            <div style={{ width: "100%", height: "5px", background: "#EEE", borderRadius: "3px", marginTop: "4px", overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, (f.solde / f.cible) * 100)}%`, height: "100%", background: atteint ? C.accent2 : C.warn }} />
                            </div>
                          )}
                        </div>,
                        f.cible > 0 ? (
                          <Badge bg={atteint ? C.ok : C.warnBg} fg={atteint ? C.accent2 : C.warn}>{atteint ? "objectif atteint" : "en cours"}</Badge>
                        ) : (
                          <span style={{ color: C.sub, fontSize: 11.5 }}>pas d'objectif</span>
                        ),
                      ];
                    })}
                  />
                </div>
              ))
            )}
          </>
        )}

        {view === "seances" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Séances</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>
                  Réunions générales de l'association — présence, amendes internes, procès-verbal.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  style={btnSecondary}
                  onClick={() => { setShowTypesAmendesSeance(true); setNewTypeAmendeNom(""); setNewTypeAmendeMontant(""); }}
                >
                  <Plus size={15} /> Types d'amendes
                </button>
                <button
                  style={btnPrimary}
                  onClick={() => { setSeanceDate(""); setSeanceLieu(""); setSeanceOrdreDuJour(""); setSeanceCreationErreur(""); setShowCreerSeance(true); }}
                >
                  <Plus size={15} /> Créer une séance
                </button>
              </div>
            </div>

            <div style={{ margin: "18px 0", maxWidth: "260px" }}>
              <StatCard label="Caisse des amendes" value={fmtFCFA(soldeCaisseAmendes)} icon={<AlertTriangle size={16} />} />
            </div>

            {seancesList.length === 0 ? (
              <div style={{ marginTop: "22px", fontSize: "13px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px", textAlign: "center" }}>
                Aucune séance créée pour l'instant.
              </div>
            ) : (
              <>
                <div style={{ marginTop: "22px" }} />
                <Table cols={["Date", "Lieu", "Ordre du jour", "Statut", ""]} widths="1fr 1.1fr 1.6fr 1fr 1fr"
                  rows={seancesList.map((s) => [
                    s.date,
                    s.lieu || "—",
                    <span style={{ color: C.sub, fontSize: 12 }}>{s.ordreDuJour || "—"}</span>,
                    <Badge bg={s.statut === "terminée" ? C.ok : C.warnBg} fg={s.statut === "terminée" ? C.accent2 : C.warn}>{s.statut}</Badge>,
                    <button
                      onClick={async () => {
                        setShowDetailSeance(s);
                        setSeanceCompteRendu(s.compteRendu || "");
                        try {
                          const [pres, amendes] = await Promise.all([fetchPresences(s.id), fetchAmendesSeance(s.id)]);
                          setPresencesSeance(pres);
                          setAmendesSeanceList(amendes);
                        } catch (e) {
                          console.error("Erreur de chargement du détail de la séance", e);
                        }
                      }}
                      style={{ background: "transparent", color: C.vifBleu, border: `1px solid ${C.vifBleu}66`, borderRadius: "7px", padding: "5px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                    >
                      Gestion de séance
                    </button>,
                  ])}
                />

                <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "26px 0 10px" }}>Taux de présence par membre</h2>
                <Table cols={["Membre", "Présent(e)s", "Absent(e)s", "Excusé(e)s", "Taux"]} widths="1.5fr 1fr 1fr 1fr 1fr"
                  rows={membres.map((m) => {
                    const t = tauxPresence[m.id] || { present: 0, absent: 0, excuse: 0, tauxPresence: 0 };
                    return [
                      m.nom,
                      t.present,
                      t.absent,
                      t.excuse,
                      <Badge bg={t.tauxPresence >= 75 ? C.ok : C.warnBg} fg={t.tauxPresence >= 75 ? C.accent2 : C.warn}>{t.tauxPresence}%</Badge>,
                    ];
                  })}
                />
              </>
            )}
          </>
        )}

        {view === "depenses" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Dépenses</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>
                  Rafraîchissement de séance — collecte, facture, reliquat conservé dans la caisse.
                </p>
              </div>
              <button
                style={btnPrimary}
                onClick={() => {
                  setRafraDate(""); setRafraSeanceId(""); setRafraMontantParMembre("1000");
                  setRafraParticipants({}); setRafraFacture(""); setRafraResponsableId(""); setRafraErreur("");
                  setShowCreerRafraichissement(true);
                }}
              >
                <Plus size={15} /> Enregistrer un rafraîchissement
              </button>
            </div>

            <div style={{ margin: "18px 0", maxWidth: "280px" }}>
              <StatCard
                label="Caisse — Reliquat boisson"
                value={fmtFCFA(soldeCaisseRafraichissement)}
                sub={soldeCaisseRafraichissement < 0 ? "En débit — à rééquilibrer" : undefined}
                icon={<ShoppingCart size={16} />}
              />
            </div>

            {rafraichissementsList.length === 0 ? (
              <div style={{ fontSize: "13px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px", textAlign: "center" }}>
                Aucun rafraîchissement enregistré pour l'instant.
              </div>
            ) : (
              <Table cols={["Date", "Responsable", "Collecté", "Facture", "Reliquat"]} widths="1fr 1.2fr 1fr 1fr 1fr"
                rows={rafraichissementsList.map((r) => [
                  r.date,
                  r.responsable,
                  fmtFCFA(r.montantCollecte),
                  fmtFCFA(r.montantFacture),
                  <span style={{ fontWeight: 700, color: r.reliquat >= 0 ? C.accent2 : C.warn }}>{r.reliquat >= 0 ? "+" : ""}{fmtFCFA(r.reliquat)}</span>,
                ])}
              />
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginTop: "34px" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0 }}>Autres dépenses</h2>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  style={btnSecondary}
                  onClick={() => { setShowTypesDepenses(true); setNewTypeDepenseNom(""); }}
                >
                  <Plus size={15} /> Types de dépenses
                </button>
                <button
                  style={btnPrimary}
                  onClick={() => {
                    setDepenseTypeId(""); setDepenseMontant(""); setDepenseDate(""); setDepenseMotif("");
                    setDepenseSourceType(""); setDepenseSourceId(""); setDepenseErreur("");
                    setShowCreerDepense(true);
                  }}
                >
                  <Plus size={15} /> Enregistrer une dépense
                </button>
              </div>
            </div>

            {depensesList.length === 0 ? (
              <div style={{ marginTop: "14px", fontSize: "13px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px", textAlign: "center" }}>
                Aucune dépense enregistrée pour l'instant.
              </div>
            ) : (
              <div style={{ marginTop: "14px" }}>
                <Table cols={["Date", "Catégorie", "Motif", "Source débitée", "Montant"]} widths="0.9fr 1fr 1.3fr 1.3fr 0.9fr"
                  rows={depensesList.map((d) => [
                    d.date,
                    d.typeNom,
                    <span style={{ color: C.sub, fontSize: 12 }}>{d.motif || "—"}</span>,
                    libelleSourceDepense(d.sourceType),
                    <b style={{ color: C.warn }}>− {fmtFCFA(d.montant)}</b>,
                  ])}
                />
              </div>
            )}
          </>
        )}

        {view === "depots" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Dépôt et retrait externe</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>
                  Versement des fonds du groupe dans une banque externe, après chaque séance, par un signataire du compte.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  style={btnSecondary}
                  onClick={() => { setCompteNom(""); setCompteBanque(""); setCompteNumero(""); setCompteType("Courant"); setCompteTauxInteret(""); setCompteError(""); setCompteSuccess(false); setShowCreerCompte(true); }}
                >
                  <Plus size={15} /> Créer un compte
                </button>
                <button
                  style={btnSecondary}
                  onClick={() => { setSigMembreId(""); setSigFonction(""); setSigError(""); setSigSuccess(false); setShowAjouterSignataire(true); }}
                >
                  <UserCog size={15} /> Ajouter un signataire
                </button>
                <button
                  style={btnPrimary}
                  disabled={!compteActifId}
                  onClick={() => { setDepotDate(""); setDepotMontant(""); setDepotMotif(""); setDepotCategorie(""); setDepotMembreSimple(""); setSignatairesChoisis([]); setRecuJoint(false); setDepotError(""); setDepotSuccess(false); setTypeMouvementBanque("Dépôt"); setShowNouveauDepot(true); }}
                >
                  <Plus size={15} /> Enregistrer un mouvement
                </button>
              </div>
            </div>

            {comptesBancaires.length === 0 ? (
              <div style={{ marginTop: "22px", fontSize: "12.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px" }}>
                Aucun compte bancaire enregistré pour ce groupe. Clique "Créer un compte" pour ajouter ton premier compte (courant ou épargne).
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: "8px", marginTop: "18px", flexWrap: "wrap" }}>
                  {comptesBancaires.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCompteActifId(c.id)}
                      style={{
                        padding: "8px 14px", borderRadius: "8px", border: `1px solid ${compteActifId === c.id ? C.vifBleu : C.border}`,
                        background: compteActifId === c.id ? `${C.vifBleu}14` : "transparent", color: compteActifId === c.id ? C.vifBleu : C.sub,
                        fontSize: "12.5px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                      }}
                    >
                      {c.type === "Épargne" ? <PiggyBank size={13} /> : <Building2 size={13} />} {c.nom}
                      <span style={{ fontSize: "10px", opacity: 0.7 }}>({c.type})</span>
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: "18px" }}>
                  <StatCard
                    label={`Solde actuel — ${compteActif?.nom || ""}`}
                    value={soldeCompteActuel}
                    sub={`${compteActif?.banque || "—"}${compteActif?.numeroCompte ? " · " + compteActif.numeroCompte : ""}${compteActif?.type === "Épargne" && compteActif?.tauxInteretAnnuel ? ` · Taux annuel ${compteActif.tauxInteretAnnuel}%` : ""}`}
                    icon={compteActif?.type === "Épargne" ? <PiggyBank size={16} /> : <Building2 size={16} />}
                  />
                </div>
              </>
            )}

            <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", marginTop: "22px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 16px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: "11px", color: C.sub, marginBottom: "5px", display: "block" }}>Du</label>
                <input
                  value={filtreDateDebut}
                  onChange={(e) => setFiltreDateDebut(e.target.value)}
                  placeholder="jj/mm/aaaa"
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: "11px", color: C.sub, marginBottom: "5px", display: "block" }}>Au</label>
                <input
                  value={filtreDateFin}
                  onChange={(e) => setFiltreDateFin(e.target.value)}
                  placeholder="jj/mm/aaaa"
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none" }}
                />
              </div>
              <button
                style={{ background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "8px", padding: "9px 16px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Search size={14} /> Rechercher
              </button>
              {(filtreDateDebut || filtreDateFin) && (
                <button
                  onClick={() => { setFiltreDateDebut(""); setFiltreDateFin(""); }}
                  style={{ background: "transparent", color: C.sub, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 12px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}
                >
                  Réinitialiser
                </button>
              )}
            </div>
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "6px" }}>
              Laissez "Au" vide pour rechercher une date précise, ou renseignez les deux champs pour une période.
            </div>

            <div style={{ marginTop: "16px" }} />
            <Table cols={["Date", "Type", "Montant", "Signataire", "Motif / Catégorie", "Solde du compte", "Statut"]} widths="0.7fr 0.7fr 0.85fr 0.9fr 1.1fr 1fr 1.3fr"
              rows={depots.map((d) => {
                const typeStyle = {
                  "Dépôt": { bg: C.ok, fg: C.accent2 },
                  "Retrait": { bg: "#EBE6F5", fg: C.purple },
                  "Frais": { bg: C.warnBg, fg: C.warn },
                  "Intérêt": { bg: `${C.vifVert}1A`, fg: C.vifVert },
                };
                const style = typeStyle[d.type] || typeStyle["Dépôt"];
                return [
                  <span style={{ color: C.sub, fontSize: 12 }}>{d.date}</span>,
                  <Badge bg={style.bg} fg={style.fg}>{d.type}</Badge>,
                  <b>{d.montant}</b>,
                  d.signataire,
                  <span style={{ color: C.sub, fontSize: 12 }}>{d.type === "Frais" ? d.categorie : d.motif}</span>,
                  <b style={{ fontSize: 12.5 }}>{d.solde}</b>,
                  d.statut === "reçu joint" ? (
                    d.recuUrl ? (
                      <a href={d.recuUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                        <Badge bg={C.ok} fg={C.accent2}>Voir le reçu</Badge>
                      </a>
                    ) : (
                      <Badge bg={C.ok} fg={C.accent2}>reçu joint</Badge>
                    )
                  ) : (
                    <>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        ref={(el) => { inputsFichierRecu.current[d.id] = el; }}
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const fichier = e.target.files[0];
                          if (!fichier) return;
                          setJoindreRecuEnCours(d.id);
                          try {
                            await joindreRecu(d.id, groupId, fichier);
                            await rechargerDepots();
                          } catch (err) {
                            console.error("Erreur lors de la jointure du reçu", err);
                          } finally {
                            setJoindreRecuEnCours(null);
                            e.target.value = "";
                          }
                        }}
                      />
                      <button
                        disabled={joindreRecuEnCours === d.id}
                        onClick={() => inputsFichierRecu.current[d.id]?.click()}
                        style={{ background: C.warnBg, color: C.warn, border: `1px solid ${C.warn}44`, borderRadius: "7px", padding: "5px 10px", fontSize: "11px", fontWeight: 600, cursor: joindreRecuEnCours === d.id ? "default" : "pointer" }}
                      >
                        {joindreRecuEnCours === d.id ? "Envoi..." : "Joindre le reçu"}
                      </button>
                    </>
                  ),
                ];
              })} />
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "10px" }}>
              Le mouvement peut être enregistré tout de suite, et le reçu joint plus tard au retour de la banque — sans jamais modifier les autres données déjà enregistrées.
            </div>
          </>
        )}

        {view === "assurance" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Assurance mutuelle</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>Solde minimum requis : {fmtFCFA(soldeMinimum)} par membre · délai de reconstitution : {delaiJoursAssurance} jours.</p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  style={btnSecondary}
                  onClick={() => {
                    setConfigSoldeMinimum(String(soldeMinimum));
                    setConfigDelaiJours(String(delaiJoursAssurance));
                    setConfigMontantPrelevement(String(montantPrelevementDefaut));
                    setConfigAssuranceErreur(""); setConfigAssuranceSuccess(false);
                    setShowConfigAssurance(true);
                  }}
                >
                  <UserCog size={15} /> Configurer
                </button>
                <button style={btnSecondary} onClick={() => setShowCotisationAssurance(true)}><Plus size={15} /> Enregistrer une cotisation</button>
              </div>
            </div>
            <div style={{ marginTop: "22px" }} />

            <div style={{ display: "flex", gap: "6px", marginBottom: "18px", flexWrap: "wrap" }}>
              {[{ key: "apercu", label: "Vue d'ensemble" }, { key: "historique", label: "Historique des mouvements" }].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setAssuranceTab(t.key)}
                  style={{
                    padding: "8px 14px", borderRadius: "8px", border: `1px solid ${assuranceTab === t.key ? C.vifRose : C.border}`,
                    background: assuranceTab === t.key ? `${C.vifRose}14` : "transparent", color: assuranceTab === t.key ? C.vifRose : C.sub,
                    fontSize: "12.5px", fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {assuranceTab === "apercu" && (
              <>
                <Table cols={["Membre", "Solde assurance", "Progression", "Statut", "Délai restant"]} widths="1.4fr 1.1fr 1.3fr 0.9fr 1.1fr"
                  rows={membres.map((m) => {
                    const info = assuranceSoldes[m.id] || { solde: 0, delai_expire_le: null };
                    const aJour = info.solde >= soldeMinimum;
                    return [
                      m.nom,
                      fmtFCFA(info.solde),
                      <div style={{ width: "100%", height: "5px", background: "#EEE", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, soldeMinimum > 0 ? (info.solde / soldeMinimum) * 100 : 100)}%`, height: "100%", background: aJour ? C.accent2 : C.warn }} />
                      </div>,
                      aJour
                        ? <Badge bg={C.ok} fg={C.accent2}>à jour</Badge>
                        : <Badge bg={C.warnBg} fg={C.warn}>en reconstitution</Badge>,
                      aJour ? "—" : (info.delai_expire_le || "à définir"),
                    ];
                  })}
                />
                <button style={{ ...btnPrimary, marginTop: "18px" }} onClick={() => { setEvenementBeneficiaire(""); setEvenementMontant(""); setEvenementError(""); setEvenementSuccess(false); setShowDeclarerEvenement(true); }}><HeartHandshake size={15} /> Déclarer un événement</button>
              </>
            )}

            {assuranceTab === "historique" && (
              <>
                <Table cols={["Date", "Membre", "Type", "Montant", "Solde après"]} widths="1fr 1.4fr 1fr 1.1fr 1.2fr"
                  rows={historiqueAssurance.map((h) => [
                    <span style={{ color: C.sub, fontSize: 12 }}>{h.date}</span>,
                    h.membre,
                    <Badge bg={h.type === "Cotisation" ? C.ok : "#FBE8E8"} fg={h.type === "Cotisation" ? C.accent2 : C.warn}>{h.type}</Badge>,
                    <span style={{ fontWeight: 700, color: h.type === "Cotisation" ? C.accent2 : C.warn }}>{h.type === "Cotisation" ? "+" : "-"}{fmtFCFA(h.montant)}</span>,
                    <span style={{ color: C.sub, fontSize: 12 }}>{fmtFCFA(h.solde)}</span>,
                  ])}
                />
                {historiqueAssurance.length === 0 && (
                  <div style={{ fontSize: "12.5px", color: C.sub, marginTop: "12px" }}>Aucun mouvement enregistré pour l'instant.</div>
                )}
              </>
            )}
          </>
        )}

        {view === "bilan" && (
          <>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Bilan général</h1>
            <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 22px" }}>
              À présenter à l'assemblée générale. Calculé en direct à partir des données enregistrées dans l'application.
            </p>
            <div style={{ display: "flex", gap: "14px", marginBottom: "22px", flexWrap: "wrap" }}>
              <StatCard label="Total en épargnes" value={fmtFCFA(epargnes.reduce((s, ep) => s + ep.solde, 0))} icon={<Wallet size={16} />} />
              <StatCard label="Total comptes bancaires" value={fmtFCFA(comptesBancaires.reduce((s, c) => s + (c.solde || 0), 0))} icon={<Building2 size={16} />} />
              <StatCard label="Solde assurance cumulé" value={fmtFCFA(Object.values(assuranceSoldes).reduce((s, a) => s + (a.solde || 0), 0))} icon={<HeartHandshake size={16} />} />
              <StatCard label="Total en fonds" value={fmtFCFA(Object.values(fondsParMembre).flat().reduce((s, f) => s + (f.solde || 0), 0))} icon={<PiggyBank size={16} />} />
              <StatCard label="Caisse des amendes" value={fmtFCFA(soldeCaisseAmendes)} icon={<AlertTriangle size={16} />} />
              <StatCard label="Caisse reliquat boisson" value={fmtFCFA(soldeCaisseRafraichissement)} icon={<ShoppingCart size={16} />} />
              <StatCard label="Crédits SMS restants" value={`${smsSolde} SMS`} icon={<Repeat size={16} />} />
              <StatCard label="Tours effectués" value={`${tours.filter((t) => t.statut === "clôturé").length} / ${tours.length}`} icon={<CheckCircle2 size={16} />} />
              <StatCard label="Membres" value={`${membres.filter((m) => m.statut === "actif").length} actif(s)`} icon={<Users size={16} />} />
            </div>

            <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 10px" }}>Répartition par module</h2>
            <Table cols={["Module", "Solde actuel", "Détail"]} widths="1.4fr 1.2fr 2fr"
              rows={[
                ...epargnes.map((ep) => [
                  ep.nom, fmtFCFA(ep.solde),
                  <span style={{ color: C.sub, fontSize: 12 }}>Clôture {ep.cloture} · taux {ep.tauxInteret}</span>,
                ]),
                ...comptesBancaires.map((c) => [
                  c.nom, fmtFCFA(c.solde),
                  <span style={{ color: C.sub, fontSize: 12 }}>{c.type} · {c.banque || "—"}</span>,
                ]),
                [
                  "Tontine",
                  `${tours.filter((t) => t.statut === "clôturé").length} tour(s) clôturé(s)`,
                  <span style={{ color: C.sub, fontSize: 12 }}>{tours.length} tour(s) au total, {tours.filter((t) => t.statut === "en cours").length} en cours</span>,
                ],
                ...(totalRedistributions > 0 ? [[
                  "Commissions redistribuées",
                  fmtFCFA(totalRedistributions),
                  <span style={{ color: C.sub, fontSize: 12 }}>Commissions d'enchères déjà reversées aux membres</span>,
                ]] : []),
                [
                  "Assurance",
                  fmtFCFA(Object.values(assuranceSoldes).reduce((s, a) => s + (a.solde || 0), 0)),
                  <span style={{ color: C.sub, fontSize: 12 }}>{evenements.length} événement(s) déclaré(s) cette année</span>,
                ],
                ...typesFonds.map((t) => [
                  t.nom,
                  fmtFCFA(Object.values(fondsParMembre).flat().filter((f) => f.typeFondsId === t.id).reduce((s, f) => s + (f.solde || 0), 0)),
                  <span style={{ color: C.sub, fontSize: 12 }}>Objectif {fmtFCFA(t.cible)} par membre</span>,
                ]),
                [
                  "Prêts en cours",
                  `${prets.filter((p) => p.statut === "en cours").length} prêt(s)`,
                  <span style={{ color: C.sub, fontSize: 12 }}>{prets.filter((p) => p.statut === "remboursé").length} remboursé(s)</span>,
                ],
                [
                  "Membres",
                  `${membres.filter((m) => m.statut === "actif").length} actif(s)`,
                  <span style={{ color: C.sub, fontSize: 12 }}>{membres.filter((m) => m.statut === "en attente").length} en attente de validation</span>,
                ],
                [
                  "Caisse des amendes",
                  fmtFCFA(soldeCaisseAmendes),
                  <span style={{ color: C.sub, fontSize: 12 }}>Amendes de séance payées (espèces ou déduit banque)</span>,
                ],
                [
                  "Caisse reliquat boisson",
                  fmtFCFA(soldeCaisseRafraichissement),
                  <span style={{ color: soldeCaisseRafraichissement < 0 ? C.warn : C.sub, fontSize: 12 }}>{soldeCaisseRafraichissement < 0 ? "En débit — à rééquilibrer" : `${rafraichissementsList.length} rafraîchissement(s) enregistré(s)`}</span>,
                ],
                [
                  "Séances",
                  `${seancesList.filter((s) => s.statut === "terminée").length} terminée(s)`,
                  <span style={{ color: C.sub, fontSize: 12 }}>{seancesList.length} séance(s) au total</span>,
                ],
                [
                  "Dépenses",
                  fmtFCFA(depensesList.reduce((s, d) => s + Number(d.montant), 0)),
                  <span style={{ color: C.sub, fontSize: 12 }}>{depensesList.length} dépense(s) enregistrée(s)</span>,
                ],
              ]}
            />

            <div style={{ display: "flex", gap: "10px", marginTop: "22px" }}>
              <button style={btnSecondary} onClick={() => { setRapportJour(null); setRapportJourDate(""); setRapportJourErreur(""); setShowRapportJournalier(true); }}>Rapport journalier</button>
              <button style={btnSecondary} onClick={() => { setRapportMois(null); setRapportMoisErreur(""); setShowRapportMensuel(true); }}>Rapport mensuel</button>
              <button style={btnPrimary} onClick={() => setShowExportBilan(true)}>Exporter le bilan annuel</button>
            </div>
          </>
        )}

        {view === "membres" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Membres</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>
                  Invitation soumise à validation du Président. {loadingData ? "Chargement..." : `${membres.length} membre(s) enregistré(s).`}
                </p>
                {membresErreurChargement && (
                  <p style={{ fontSize: "12px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px", marginTop: "8px" }}>
                    {membresErreurChargement}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  style={btnSecondary}
                  onClick={() => { setShowGererTypesFonds(true); setNewTypeFondsNom(""); }}
                >
                  <PiggyBank size={15} /> Types de fonds
                </button>
                <button
                  style={btnSecondary}
                  onClick={() => { setResetMembreId(""); setResetMembreErreur(""); setResetMembreMotDePasse(""); setShowResetMembre(true); }}
                >
                  <KeyRound size={15} /> Accès d'urgence
                </button>
                <button style={btnPrimary} onClick={() => { setInviteNom(""); setInviteTelephone(""); setInviteEmail(""); setInviteCaution(""); setInviteVersementInitial(""); setInviteError(""); setInviteSuccess(false); setInviteIdentifiant(""); setInviteMotDePasseTemp(""); setShowInviteMember(true); }}><Plus size={15} /> Inviter un membre</button>
              </div>
            </div>
            <div style={{ marginTop: "22px" }} />
            <Table cols={["Nom", "Identifiant", "Rôle", "Statut", "Fonds de garantie", ""]} widths="1.1fr 1fr 0.8fr 0.8fr 1.3fr 1.7fr"
              rows={membres.map((m, i) => {
                const fg = fondsGarantieDe(m.id);
                return [
                m.nom,
                <span style={{ color: C.sub, fontSize: 12 }}>{m.identifiant || "—"}</span>,
                m.role,
                <Badge bg={m.statut === "actif" ? C.ok : C.warnBg} fg={m.statut === "actif" ? C.accent2 : C.warn}>{m.statut}</Badge>,
                <div>
                  <div style={{ fontSize: "11.5px", fontWeight: 600, color: fg && fg.solde >= fg.cible && fg.cible > 0 ? C.accent2 : C.ink }}>
                    {fmtFCFA(fg?.solde || 0)} / {fmtFCFA(fg?.cible || 0)}
                  </div>
                  {fg && fg.cible > 0 && (
                    <div style={{ width: "100%", height: "5px", background: "#EEE", borderRadius: "3px", marginTop: "4px", overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, (fg.solde / fg.cible) * 100)}%`, height: "100%", background: fg.solde >= fg.cible ? C.accent2 : C.warn }} />
                    </div>
                  )}
                </div>,
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => { setShowGererFondsMembre(m); }}
                    style={{ background: "transparent", color: C.vifOr, border: `1px solid ${C.vifOr}66`, borderRadius: "7px", padding: "6px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Gérer les fonds
                  </button>
                  {m.statut === "en attente" && (
                    <button
                      onClick={async () => {
                        try {
                          // ⚠️ validateurId : à remplacer par l'id du membre connecté (Président)
                          await validerMembre(m.id, m.id);
                          await rechargerMembres();
                        } catch (e) {
                          console.error("Erreur de validation du membre", e);
                        }
                      }}
                      style={{ background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "7px", padding: "6px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                    >
                      Valider
                    </button>
                  )}
                  {(m.statut === "actif" || m.statut === "inactif") && (
                    <button
                      onClick={async () => {
                        try {
                          const nouveauStatut = m.statut === "actif" ? "inactif" : "actif";
                          await toggleActifMembre(m.id, nouveauStatut);
                          await rechargerMembres();
                        } catch (e) {
                          console.error("Erreur de changement de statut du membre", e);
                        }
                      }}
                      style={{
                        background: m.statut === "actif" ? "transparent" : C.accent2,
                        color: m.statut === "actif" ? C.warn : "#FAF6ED",
                        border: m.statut === "actif" ? `1px solid ${C.warn}66` : "none",
                        borderRadius: "7px", padding: "6px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      {m.statut === "actif" ? "Rendre inactif" : "Réactiver"}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      setShowHistoriqueMembre(m);
                      setChargementHistoriqueMembre(true);
                      try {
                        const tdb = await fetchTableauDeBordMembre(groupId, m.id, 30);
                        setHistoriqueMembreData(tdb);
                      } catch (e) {
                        console.error("Erreur de chargement de l'historique du membre", e);
                        setHistoriqueMembreData(null);
                      } finally {
                        setChargementHistoriqueMembre(false);
                      }
                    }}
                    style={{ background: "transparent", color: C.vifBleu, border: `1px solid ${C.vifBleu}55`, borderRadius: "7px", padding: "6px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Historique
                  </button>
                  <button
                    onClick={async () => {
                      setEditMembre(m);
                      setEditNom(m.nom);
                      setEditEmail(m.email || "");
                      setEditTelephone(m.telephone || "");
                      setEditError("");
                      setEditSuccess(false);
                      setEditDocuments({});
                      setShowEditMembre(true);
                      try {
                        const docs = await fetchDocumentsMembre(m.id);
                        setEditDocuments(docs);
                      } catch (e) {
                        console.error("Erreur de chargement des documents", e);
                      }
                    }}
                    style={{ background: "transparent", color: C.accent2, border: `1px solid ${C.border}`, borderRadius: "7px", padding: "6px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => { setShowDeleteMembre(m); setDeleteErreur(""); }}
                    style={{ background: "transparent", color: C.warn, border: `1px solid ${C.warn}55`, borderRadius: "7px", padding: "6px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Supprimer
                  </button>
                </div>,
              ];
              })} />
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "10px" }}>
              Les membres invités sont sauvegardés automatiquement. "Compte non activé" signifie que le membre n'a pas encore créé son mot de passe de connexion.
            </div>
          </>
        )}
      </div>

      {showCotisationTontine && (
        <Modal onClose={() => setShowCotisationTontine(false)} title="Enregistrer une cotisation — Tontine">
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Date de la séance</label>
            <input
              value={cotisationTontineDate}
              onChange={(e) => setCotisationTontineDate(e.target.value)}
              placeholder="jj/mm/aaaa"
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            />
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "5px" }}>
              Une seule date pour toute la séance — elle s'applique à chaque montant saisi ci-dessous.
            </div>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Montant par membre</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {membres.map((m) => (
                <div key={m.nom} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ flex: 1, fontSize: "13px", fontWeight: 600 }}>{m.nom}</div>
                  <input
                    value={cotisationTontineMontants[m.nom] || ""}
                    onChange={(e) => setMontantTontineMembre(m.nom, e.target.value)}
                    placeholder="0 FCFA"
                    style={{ width: "130px", boxSizing: "border-box", padding: "9px 11px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none", textAlign: "right" }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: "11px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Laissez vide un membre qui n'a pas cotisé — il apparaîtra automatiquement dans les cotisations en attente.
          </div>
          {cotisationTontineError && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {cotisationTontineError}
            </div>
          )}
          <button
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onClick={async () => {
              if (!cotisationTontineDate.trim()) { setCotisationTontineError("La date de séance est obligatoire."); return; }
              if (!tourEnCours) { setCotisationTontineError("Aucun tour en cours."); return; }
              try {
                const cotisations = membres
                  .filter((m) => cotisationTontineMontants[m.nom])
                  .map((m) => ({ membreId: m.id, montant: cotisationTontineMontants[m.nom], date: versDateISO(cotisationTontineDate) }));
                await enregistrerCotisationsTontine(tourEnCours.id, cotisations);
                await rechargerTontine();

                // Notifie chaque membre par SMS de sa cotisation enregistrée
                cotisations.forEach((c) => {
                  const membre = membres.find((m) => m.id === c.membreId);
                  if (membre?.telephone) {
                    envoyerSMS({
                      message: msgOperation(membre.nom, "cotisation tontine", c.montant),
                      numeros: [membre.telephone],
                      groupId,
                      });
                  }
                });

                setCotisationTontineError("");
                setCotisationTontineDate("");
                setCotisationTontineMontants({});
                setShowCotisationTontine(false);
              } catch (e) {
                console.error("Erreur d'enregistrement des cotisations", e);
                setCotisationTontineError(e.message || "Erreur lors de l'enregistrement.");
              }
            }}
          >
            Enregistrer les cotisations
          </button>
        </Modal>
      )}

      {showConfigAssurance && (
        <Modal onClose={() => setShowConfigAssurance(false)} title="Configurer l'assurance" icon={<HeartHandshake />} accentColor={C.vifRose}>
          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Chaque groupe fixe son propre montant minimum, son propre délai de reconstitution, et le montant standard prélevé par membre à chaque événement.
          </div>
          <FormField label="Solde minimum requis par membre (FCFA)" placeholder="Ex. 80 000" value={configSoldeMinimum} onChange={(e) => setConfigSoldeMinimum(e.target.value)} />
          <FormField label="Délai de reconstitution (en jours)" placeholder="Ex. 60" value={configDelaiJours} onChange={(e) => setConfigDelaiJours(e.target.value)} />
          <FormField label="Montant standard prélevé par membre (FCFA)" placeholder="Ex. 10 000" value={configMontantPrelevement} onChange={(e) => setConfigMontantPrelevement(e.target.value)} />

          {configAssuranceErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {configAssuranceErreur}
            </div>
          )}
          {configAssuranceSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Configuration enregistrée.
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: C.vifRose, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
            onClick={async () => {
              const soldeNum = parseInt(configSoldeMinimum.replace(/[^\d]/g, ""), 10);
              const delaiNum = parseInt(configDelaiJours.replace(/[^\d]/g, ""), 10);
              const montantNum = parseInt(configMontantPrelevement.replace(/[^\d]/g, ""), 10);
              if (!soldeNum || soldeNum <= 0) { setConfigAssuranceErreur("Saisis un solde minimum valide."); return; }
              if (!delaiNum || delaiNum <= 0) { setConfigAssuranceErreur("Saisis un délai valide (en jours)."); return; }
              if (!montantNum || montantNum <= 0) { setConfigAssuranceErreur("Saisis un montant de prélèvement valide."); return; }
              try {
                await sauvegarderConfigAssurance(groupId, { soldeMinimum: soldeNum, delaiJours: delaiNum, montantPrelevementDefaut: montantNum });
                await rechargerAssurance();
                setConfigAssuranceErreur("");
                setConfigAssuranceSuccess(true);
                setTimeout(() => {
                  setShowConfigAssurance(false);
                  setConfigAssuranceSuccess(false);
                }, 1200);
              } catch (e) {
                console.error("Erreur de sauvegarde de la configuration", e);
                setConfigAssuranceErreur(e.message || "Erreur lors de l'enregistrement.");
              }
            }}
          >
            Enregistrer la configuration
          </button>
        </Modal>
      )}

      {showDeclarerEvenement && (
        <Modal onClose={() => setShowDeclarerEvenement(false)} title="Déclarer un événement">
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Type d'événement</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <select
                value={typeEvenementId}
                onChange={(e) => setTypeEvenementId(e.target.value)}
                style={{ flex: 1, boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
              >
                {eventTypes.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
              </select>
              <button
                onClick={() => setShowNewType(!showNewType)}
                style={{ background: C.ok, color: C.accent2, border: `1px solid ${C.accent2}33`, borderRadius: "9px", padding: "0 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
              >
                <Plus size={14} />
              </button>
            </div>
            {showNewType && (
              <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                <input
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="Ex. Naissance, Maladie..."
                  style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none" }}
                />
                <button onClick={addEventType} style={{ background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "8px", padding: "0 12px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>
                  Ajouter
                </button>
              </div>
            )}
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "5px" }}>
              L'admin peut ajouter de nouveaux types d'événements propres au groupe.
            </div>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Membre bénéficiaire</label>
            <select
              value={evenementBeneficiaire}
              onChange={(e) => setEvenementBeneficiaire(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner un membre</option>
              {membres.filter((m) => m.statut === "actif").map((m) => {
                const info = assuranceSoldes[m.id] || { solde: 0 };
                const aJour = info.solde >= soldeMinimum;
                return (
                  <option key={m.id} value={m.id} disabled={!aJour}>
                    {m.nom} — {aJour ? "à jour" : "en reconstitution (non éligible)"}
                  </option>
                );
              })}
            </select>
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "5px" }}>
              Seuls les membres à jour de leur assurance peuvent bénéficier de l'aide.
            </div>
          </div>

          <FormField label="Lien avec le membre" placeholder="Ex. Père du membre, membre lui-même..." />

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <FormField label="Date de déclaration" placeholder="jj/mm/aaaa" />
            </div>
            <div style={{ flex: 1 }}>
              <FormField label="Frais de déclaration" placeholder="Ex. 2 000 FCFA" />
            </div>
          </div>
          <div style={{ fontSize: "11px", color: C.sub, marginTop: "-6px" }}>
            Le membre doit déclarer l'événement à l'avance (ex. une semaine avant) ; l'aide est décaissée une semaine avant la date de l'événement.
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Membres délégués (représentation à l'événement)</label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", marginBottom: "8px", cursor: "pointer" }}>
              <input type="checkbox" checked={touteReunion} onChange={(e) => setTouteReunion(e.target.checked)} />
              Toute la réunion se déplace
            </label>
            {!touteReunion && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {membres.filter((m) => m.statut === "actif").map((m) => (
                  <label key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", cursor: "pointer" }}>
                    <input type="checkbox" checked={delegues.includes(m.id)} onChange={() => toggleDelegue(m.id)} />
                    {m.nom}
                  </label>
                ))}
              </div>
            )}
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "5px" }}>
              Choisissez 2 personnes, plus, ou toute la réunion selon le cas.
            </div>
          </div>

          <FormField label="Montant brut de l'aide" placeholder="Ex. 50 000 FCFA" value={evenementMontant} onChange={(e) => setEvenementMontant(e.target.value)} />
          <div style={{ fontSize: "11px", color: C.sub, marginTop: "-6px" }}>
            Montant standard configuré pour ce groupe : <b>{fmtFCFA(montantPrelevementDefaut)}</b> par membre — soit {fmtFCFA(montantPrelevementDefaut * membres.filter((m) => m.statut === "actif").length)} au total pour {membres.filter((m) => m.statut === "actif").length} membre(s) actif(s).{" "}
            <button
              onClick={() => setEvenementMontant(String(montantPrelevementDefaut * membres.filter((m) => m.statut === "actif").length))}
              style={{ background: "none", border: "none", color: C.vifRose, fontWeight: 700, cursor: "pointer", padding: 0, fontSize: "11px" }}
            >
              Utiliser ce montant
            </button>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Déductions (transport, achats, etc.)</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {deductions.map((d, i) => (
                <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input
                    value={d.label}
                    onChange={(e) => updateDeduction(i, "label", e.target.value)}
                    placeholder="Ex. Achat de couronne"
                    style={{ flex: 1.4, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none" }}
                  />
                  <input
                    value={d.montant}
                    onChange={(e) => updateDeduction(i, "montant", e.target.value)}
                    placeholder="Montant"
                    style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none", textAlign: "right" }}
                  />
                  <X size={14} color={C.sub} style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => removeDeduction(i)} />
                </div>
              ))}
            </div>
            <button
              onClick={addDeduction}
              style={{ marginTop: "8px", background: "transparent", border: `1px dashed ${C.border}`, borderRadius: "8px", padding: "7px 10px", fontSize: "11.5px", fontWeight: 600, color: C.sub, cursor: "pointer", width: "100%" }}
            >
              + Ajouter une déduction
            </button>
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "6px" }}>
              Ces frais sont déduits selon le règlement propre au groupe (transport des délégués, achats, etc.), avant versement du reste au bénéficiaire.
            </div>
          </div>

          <FormField label="Date de l'événement" placeholder="jj/mm/aaaa" />

          <div style={{ fontSize: "11px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Le montant brut sera prélevé au prorata sur le solde d'assurance de <b>tous les membres</b>, et non depuis une caisse déjà constituée.
          </div>
          <div style={{ fontSize: "11px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
            Chaque membre débité aura un délai de reconstitution (défini par le groupe) pour ramener son solde au minimum requis.
          </div>

          {evenementError && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {evenementError}
            </div>
          )}
          {evenementSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Événement déclaré — les soldes d'assurance de tous les membres ont été mis à jour.
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onClick={async () => {
              const montantBrut = parseInt(evenementMontant.replace(/[^\d]/g, ""), 10);
              if (!evenementBeneficiaire) { setEvenementError("Sélectionnez un membre bénéficiaire à jour."); setEvenementSuccess(false); return; }
              if (!montantBrut || montantBrut <= 0) { setEvenementError("Saisissez un montant brut valide."); setEvenementSuccess(false); return; }
              if (!touteReunion && delegues.length === 0) { setEvenementError("Sélectionnez au moins un délégué, ou coche 'Toute la réunion'."); setEvenementSuccess(false); return; }
              const dejaBeneficie = evenements.some((e) => e.beneficiaireId === evenementBeneficiaire && e.typeId === typeEvenementId);
              if (dejaBeneficie) {
                setEvenementError("Ce membre a déjà bénéficié d'une aide de cette catégorie — il n'est pas éligible une seconde fois.");
                setEvenementSuccess(false);
                return;
              }
              try {
                const { soldesApres, part } = await declarerEvenement(groupId, {
                  typeId: typeEvenementId,
                  beneficiaireId: evenementBeneficiaire,
                  lienAvecMembre: null,
                  dateDeclaration: null,
                  fraisDeclaration: 0,
                  dateEvenement: null,
                  montantBrut,
                  touteReunion,
                  deleguesIds: delegues,
                  deductions,
                  membresGroupe: membres.filter((m) => m.statut === "actif"),
                  soldeMinimum,
                  delaiJours: delaiJoursAssurance,
                });
                await rechargerAssurance();

                const membresActifs = membres.filter((m) => m.statut === "actif");
                const beneficiaire = membresActifs.find((m) => m.id === evenementBeneficiaire);
                if (beneficiaire?.telephone) {
                  envoyerSMS({
                    message: msgOperation(beneficiaire.nom, "aide assurance", montantBrut, undefined, "Décaissement à venir prochainement"),
                    numeros: [beneficiaire.telephone],
                    groupId,
                    });
                }
                membresActifs
                  .filter((m) => m.id !== evenementBeneficiaire && m.telephone)
                  .forEach((m) => {
                    envoyerSMS({
                      message: msgOperation(m.nom, "prélèvement assurance (aide d'un membre)", part, soldesApres?.[m.id]),
                      numeros: [m.telephone],
                      groupId,
                      });
                  });

                setEvenementError("");
                setEvenementSuccess(true);
                setTimeout(() => {
                  setShowDeclarerEvenement(false);
                  setEvenementSuccess(false);
                  setEvenementBeneficiaire(""); setEvenementMontant("");
                  setDelegues([]); setTouteReunion(false);
                  setDeductions([{ label: "Transport des délégués", montant: "" }]);
                }, 1400);
              } catch (e) {
                console.error("Erreur de déclaration de l'événement", e);
                setEvenementError(e.message || "Erreur lors de la déclaration.");
                setEvenementSuccess(false);
              }
            }}
          >
            Déclarer l'événement et prélever l'aide
          </button>
        </Modal>
      )}

      {showCotisationAssurance && (
        <Modal onClose={() => setShowCotisationAssurance(false)} title="Enregistrer une cotisation — Assurance">
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Date de la séance</label>
            <input
              value={cotisationAssuranceDate}
              onChange={(e) => setCotisationAssuranceDate(e.target.value)}
              placeholder="jj/mm/aaaa"
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Montant versé par membre</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {membres.map((m) => (
                <div key={m.nom} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ flex: 1, fontSize: "13px", fontWeight: 600 }}>{m.nom}</div>
                  <input
                    value={cotisationAssuranceMontants[m.nom] || ""}
                    onChange={(e) => setMontantAssuranceMembre(m.nom, e.target.value)}
                    placeholder="0 FCFA"
                    style={{ width: "130px", boxSizing: "border-box", padding: "9px 11px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none", textAlign: "right" }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: "11px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Ces montants viennent reconstituer le solde d'assurance de chaque membre vers le minimum requis.
          </div>
          {cotisationAssuranceErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {cotisationAssuranceErreur}
            </div>
          )}
          <button
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onClick={async () => {
              try {
                const cotisations = membres
                  .filter((m) => cotisationAssuranceMontants[m.nom])
                  .map((m) => ({ membreId: m.id, montant: cotisationAssuranceMontants[m.nom] }));
                const soldesApres = await enregistrerCotisationsAssurance(groupId, cotisations, soldeMinimum);
                await rechargerAssurance();

                cotisations.forEach((c) => {
                  const membre = membres.find((m) => m.id === c.membreId);
                  if (membre?.telephone) {
                    envoyerSMS({
                      message: msgOperation(membre.nom, "cotisation assurance", c.montant, soldesApres?.[c.membreId]),
                      numeros: [membre.telephone],
                      groupId,
                      });
                  }
                });

                setCotisationAssuranceErreur("");
                setCotisationAssuranceDate("");
                setCotisationAssuranceMontants({});
                setShowCotisationAssurance(false);
              } catch (e) {
                console.error("Erreur d'enregistrement des cotisations assurance", e);
                setCotisationAssuranceErreur(e.message || "Erreur lors de l'enregistrement.");
              }
            }}
          >
            Enregistrer les cotisations
          </button>
        </Modal>
      )}

      {showCloture && (
        <Modal onClose={() => setShowCloture(null)} title={`Clôturer — ${showCloture.nom}`} icon={<PiggyBank />} accentColor={C.vifRose}>
          {clotureChargement ? (
            <div style={{ fontSize: "13px", color: C.sub, textAlign: "center", padding: "20px 0" }}>Calcul en cours...</div>
          ) : !clotureApercu ? (
            <div style={{ fontSize: "12px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "10px 12px" }}>{clotureErreur || "Erreur de chargement."}</div>
          ) : clotureEtape === 1 ? (
            <>
              <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
                Taux annuel : <b>{clotureApercu.taux}%</b> — intérêt calculé au prorata du montant et de la durée de chaque dépôt.
              </div>

              {clotureApercu.membres.length === 0 ? (
                <div style={{ fontSize: "12.5px", color: C.sub, textAlign: "center", padding: "10px 0" }}>Aucune cotisation enregistrée sur cette épargne.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {clotureApercu.membres.map((m) => (
                    <div key={m.membreId} style={{ background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px", fontSize: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <b>{m.nom}</b>
                        <b style={{ color: C.accent2 }}>{fmtFCFA(m.total)}</b>
                      </div>
                      <div style={{ color: C.sub, fontSize: "11px" }}>Capital {fmtFCFA(m.capital)} + intérêt {fmtFCFA(m.interet)}</div>
                    </div>
                  ))}
                </div>
              )}

              <button
                disabled={clotureApercu.membres.length === 0}
                style={{ marginTop: "6px", background: C.vifRose, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: clotureApercu.membres.length === 0 ? "default" : "pointer", opacity: clotureApercu.membres.length === 0 ? 0.6 : 1 }}
                onClick={() => setClotureEtape(2)}
              >
                Continuer
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
                Pour chaque membre, choisis s'il récupère son montant (sort de la caisse) ou le reconduit (reversé dans une nouvelle épargne).
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {clotureApercu.membres.map((m) => (
                  <div key={m.membreId} style={{ background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                      <b>{m.nom}</b>
                      <b style={{ color: C.accent2 }}>{fmtFCFA(m.total)}</b>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {["recuperer", "reconduire"].map((opt) => (
                        <div
                          key={opt}
                          onClick={() => setClotureDecisions({ ...clotureDecisions, [m.membreId]: opt })}
                          style={{ flex: 1, textAlign: "center", padding: "6px 4px", borderRadius: "7px", border: `1px solid ${clotureDecisions[m.membreId] === opt ? C.vifRose : C.border}`, background: clotureDecisions[m.membreId] === opt ? `${C.vifRose}14` : "#FFFFFF", fontSize: "11px", fontWeight: 600, color: clotureDecisions[m.membreId] === opt ? C.vifRose : C.sub, cursor: "pointer" }}
                        >
                          {opt === "recuperer" ? "Récupérer" : "Reconduire"}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {Object.values(clotureDecisions).includes("reconduire") && (
                <FormField label="Nom de la nouvelle épargne (cycle suivant)" placeholder="Ex. Banque scolaire — cycle suivant" value={clotureNouveauNom} onChange={(e) => setClotureNouveauNom(e.target.value)} />
              )}

              {clotureErreur && (
                <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
                  {clotureErreur}
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button onClick={() => setClotureEtape(1)} style={{ flex: 1, background: "transparent", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, color: C.sub, cursor: "pointer" }}>
                  Retour
                </button>
                <button
                  disabled={clotureEnCours}
                  style={{ flex: 2, background: C.vifRose, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: clotureEnCours ? "default" : "pointer" }}
                  onClick={async () => {
                    setClotureEnCours(true);
                    setClotureErreur("");
                    try {
                      await cloturerEpargne(showCloture.id, groupId, clotureApercu.membres, clotureDecisions, clotureNouveauNom.trim());
                      clotureApercu.membres.forEach((m) => {
                        if (m.telephone) {
                          const decision = clotureDecisions[m.membreId];
                          envoyerSMS({
                            message: `Bonjour ${m.nom}, votre cycle "${clotureApercu.epargneNom}" est clôturé. Capital ${fmtFCFA(m.capital)} + intérêt ${fmtFCFA(m.interet)} = ${fmtFCFA(m.total)}, ${decision === "recuperer" ? "à récupérer" : "reconduit pour le cycle suivant"}.`,
                            numeros: [m.telephone],
                            groupId,
                            });
                        }
                      });
                      await rechargerEpargnes();
                      await rechargerHistoriqueBanque();
                      setShowCloture(null);
                    } catch (e) {
                      console.error("Erreur de clôture", e);
                      setClotureErreur(e.message || "Erreur lors de la clôture.");
                    } finally {
                      setClotureEnCours(false);
                    }
                  }}
                >
                  {clotureEnCours ? "Clôture en cours..." : "Valider la clôture"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {showCreateEpargne && (
        <Modal onClose={() => setShowCreateEpargne(false)} title="Créer une épargne">
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Type</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {["Banque scolaire", "Banque annuelle", "Personnalisée"].map((m) => (
                <div
                  key={m}
                  onClick={() => setEpargneType(m)}
                  style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: "8px", border: `1px solid ${epargneType === m ? C.accent2 : C.border}`, background: epargneType === m ? C.ok : "#FBFAF6", fontSize: "11px", fontWeight: 600, color: epargneType === m ? C.accent2 : C.sub, cursor: "pointer" }}
                >
                  {m}
                </div>
              ))}
            </div>
          </div>
          <FormField label="Nom de l'épargne" placeholder="Ex. Épargne Achat de terrain" value={epargneNom} onChange={(e) => setEpargneNom(e.target.value)} />
          <FormField label="Cotisation par séance" placeholder="Ex. 20 000 FCFA" value={epargneCotisation} onChange={(e) => setEpargneCotisation(e.target.value)} />
          <FormField label="Taux d'intérêt sur les prêts" placeholder="Ex. 5 %" value={epargneTaux} onChange={(e) => setEpargneTaux(e.target.value)} />
          <FormField label="Date de clôture du cycle" placeholder="jj/mm/aaaa" value={epargneCloture} onChange={(e) => setEpargneCloture(e.target.value)} />

          {epargneError && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {epargneError}
            </div>
          )}
          {epargneSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Épargne créée — elle apparaît maintenant dans la vue d'ensemble de la Banque.
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onClick={async () => {
              if (!epargneNom.trim()) { setEpargneError("Le nom de l'épargne est obligatoire."); setEpargneSuccess(false); return; }
              if (epargnes.some((ep) => ep.nom.toLowerCase() === epargneNom.trim().toLowerCase())) {
                setEpargneError("Une épargne porte déjà ce nom.");
                setEpargneSuccess(false);
                return;
              }
              try {
                await creerEpargne(groupId, {
                  nom: epargneNom.trim(),
                  type: epargneType,
                  cotisationParSeance: epargneCotisation.trim() || null,
                  tauxInteret: epargneTaux.trim() || null,
                  dateCloture: versDateISO(epargneCloture),
                });
                await rechargerEpargnes();
                setEpargneError("");
                setEpargneSuccess(true);
                setTimeout(() => {
                  setShowCreateEpargne(false);
                  setEpargneSuccess(false);
                  setEpargneNom(""); setEpargneCotisation(""); setEpargneTaux(""); setEpargneCloture(""); setEpargneType("Personnalisée");
                }, 1200);
              } catch (e) {
                console.error("Erreur de création de l'épargne", e);
                setEpargneError(e.message || "Erreur lors de la création.");
                setEpargneSuccess(false);
              }
            }}
          >
            Créer l'épargne
          </button>
        </Modal>
      )}

      {showCotisationBanque && (
        <Modal onClose={() => setShowCotisationBanque(false)} title="Enregistrer une cotisation">
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Épargne concernée</label>
            <select
              value={cotisationEpargneId}
              onChange={(e) => setCotisationEpargneId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner une épargne</option>
              {epargnes.map((ep) => (
                <option key={ep.id} value={ep.id}>{ep.nom}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Date du dépôt (séance)</label>
            <input
              value={cotisationDate}
              onChange={(e) => setCotisationDate(e.target.value)}
              placeholder="jj/mm/aaaa"
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            />
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "5px" }}>
              Une seule date pour toute la séance — elle s'applique à chaque montant saisi ci-dessous.
            </div>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Montant par membre</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {membres.map((m) => (
                <div key={m.nom} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ flex: 1, fontSize: "13px", fontWeight: 600 }}>{m.nom}</div>
                  <input
                    value={cotisationMontants[m.nom] || ""}
                    onChange={(e) => setMontantMembre(m.nom, e.target.value)}
                    placeholder="0 FCFA"
                    style={{ width: "130px", boxSizing: "border-box", padding: "9px 11px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none", textAlign: "right" }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: "11px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            La date du dépôt sert au calcul des intérêts au prorata à la clôture du cycle. Laissez vide un membre qui n'a pas cotisé.
          </div>
          {cotisationBanqueErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {cotisationBanqueErreur}
            </div>
          )}
          <button
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onClick={async () => {
              if (!cotisationEpargneId) { setCotisationBanqueErreur("Sélectionne une épargne."); return; }
              if (!cotisationDate.trim()) { setCotisationBanqueErreur("La date du dépôt est obligatoire."); return; }
              try {
                const cotisations = membres
                  .filter((m) => cotisationMontants[m.nom])
                  .map((m) => ({ membreId: m.id, montant: cotisationMontants[m.nom], date: versDateISO(cotisationDate) }));
                const resultatCotisation = await enregistrerCotisationsEpargne(cotisationEpargneId, cotisations);
                await rechargerEpargnes();
                await rechargerHistoriqueBanque();

                const epargneNom = epargnes.find((ep) => ep.id === cotisationEpargneId)?.nom || "épargne";
                cotisations.forEach((c) => {
                  const membre = membres.find((m) => m.id === c.membreId);
                  if (membre?.telephone) {
                    envoyerSMS({
                      message: msgOperation(membre.nom, `versement "${epargneNom}"`, c.montant, resultatCotisation?.soldeFinal),
                      numeros: [membre.telephone],
                      groupId,
                      });
                  }
                });

                setCotisationBanqueErreur("");
                setCotisationDate("");
                setCotisationMontants({});
                setShowCotisationBanque(false);
              } catch (e) {
                console.error("Erreur d'enregistrement des cotisations banque", e);
                setCotisationBanqueErreur(e.message || "Erreur lors de l'enregistrement.");
              }
            }}
          >
            Enregistrer les cotisations
          </button>
        </Modal>
      )}

      {showCreditForm && (
        <Modal onClose={() => setShowCreditForm(false)} title="Mettre en place un crédit">
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Épargne concernée</label>
            <select
              value={creditEpargneId}
              onChange={(e) => setCreditEpargneId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner une épargne</option>
              {epargnes.map((ep) => <option key={ep.id} value={ep.id}>{ep.nom} ({fmtFCFA(ep.solde)} disponible)</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Membre emprunteur</label>
            <select
              value={creditMembreId}
              onChange={(e) => setCreditMembreId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner un membre</option>
              {membres.filter((m) => m.statut === "actif").map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </div>
          <FormField label="Montant du prêt" placeholder="Ex. 150 000 FCFA" value={creditMontant} onChange={(e) => setCreditMontant(e.target.value)} />
          <FormField label="Frais de dossier" placeholder="Ex. 5 000 FCFA" value={creditFraisDossier} onChange={(e) => setCreditFraisDossier(e.target.value)} />
          <FormField label="Commission du prêt" placeholder="Ex. 2 %" value={creditCommission} onChange={(e) => setCreditCommission(e.target.value)} />

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <FormField label="Date de début du crédit" placeholder="jj/mm/aaaa" value={creditDebut} onChange={(e) => setCreditDebut(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <FormField label="Date de fin du crédit" placeholder="jj/mm/aaaa" value={creditFin} onChange={(e) => setCreditFin(e.target.value)} />
            </div>
          </div>

          <FormField label="Pénalité en cas de non-remboursement" placeholder="Ex. 3 % du solde dû par mois de retard" value={creditPenalite} onChange={(e) => setCreditPenalite(e.target.value)} />

          <div style={{ fontSize: "11px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Le taux ou montant de pénalité est fixé par l'admin du groupe et s'applique automatiquement dès l'échéance dépassée.
          </div>

          <div style={{ fontSize: "11.5px", color: C.sub, background: "#EBE6F5", border: `1px solid ${C.purple}44`, borderRadius: "8px", padding: "9px 11px" }}>
            <b style={{ color: C.purple }}>Renouvellement</b> — ce membre a droit à un renouvellement unique de ce crédit, sous réserve du paiement des frais de mise en place à chaque renouvellement.
          </div>

          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 11px" }}>
            Fonds de garantie du membre : <b>{fmtFCFA(fondsGarantieDe(creditMembreId)?.solde || 0)}</b>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: C.sub, cursor: "pointer" }}>
            <input type="checkbox" checked={creditDepasseCaution} onChange={(e) => setCreditDepasseCaution(e.target.checked)} />
            Le montant demandé dépasse le fonds de garantie du membre
          </label>

          {creditDepasseCaution && (
            <div>
              <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Avaliste (garant)</label>
              <select
                value={creditAvalisteId}
                onChange={(e) => setCreditAvalisteId(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
              >
                <option value="">Sélectionner un avaliste</option>
                {membres.filter((m) => m.statut === "actif" && m.id !== creditMembreId).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
              <div style={{ fontSize: "11px", color: C.sub, marginTop: "6px" }}>
                Un avaliste peut garantir plusieurs membres tant que la somme des montants garantis ne dépasse pas ses avoirs.
              </div>
            </div>
          )}

          {creditError && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {creditError}
            </div>
          )}
          {creditSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Crédit mis en place — il apparaît maintenant dans la liste des prêts en cours.
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onClick={async () => {
              const montantNum = parseInt(creditMontant.replace(/[^\d]/g, ""), 10);
              if (!creditEpargneId) { setCreditError("Sélectionnez l'épargne concernée."); setCreditSuccess(false); return; }
              if (!creditMembreId) { setCreditError("Sélectionnez le membre emprunteur."); setCreditSuccess(false); return; }
              if (!montantNum || montantNum <= 0) { setCreditError("Saisissez un montant de prêt valide."); setCreditSuccess(false); return; }
              if (!creditDebut.trim() || !creditFin.trim()) { setCreditError("Les dates de début et de fin sont obligatoires."); setCreditSuccess(false); return; }
              const fondsGarantieMembre = fondsGarantieDe(creditMembreId)?.solde || 0;
              if (montantNum > fondsGarantieMembre && !creditDepasseCaution) {
                setCreditError("Ce montant dépasse le fonds de garantie du membre — cochez la case et désignez un avaliste.");
                setCreditSuccess(false);
                return;
              }
              if (creditDepasseCaution && !creditAvalisteId) {
                setCreditError("Sélectionnez un avaliste pour ce crédit.");
                setCreditSuccess(false);
                return;
              }
              const epargneChoisie = epargnes.find((ep) => ep.id === creditEpargneId);
              if (epargneChoisie && montantNum > epargneChoisie.solde) {
                setCreditError(`Le montant dépasse le solde disponible de cette épargne (${fmtFCFA(epargneChoisie.solde)}).`);
                setCreditSuccess(false);
                return;
              }
              try {
                await mettreEnPlaceCredit(creditEpargneId, {
                  membreId: creditMembreId,
                  montant: montantNum,
                  fraisDossier: parseInt(creditFraisDossier.replace(/[^\d]/g, ""), 10) || 0,
                  commission: creditCommission.trim() || null,
                  dateDebut: versDateISO(creditDebut),
                  dateFin: versDateISO(creditFin),
                  penaliteRetard: creditPenalite.trim() || null,
                  avalisteId: creditDepasseCaution ? creditAvalisteId : null,
                  montantGaranti: montantNum,
                });
                await rechargerPrets();
                await rechargerEpargnes();
                await rechargerHistoriqueBanque();

                const emprunteur = membres.find((m) => m.id === creditMembreId);
                if (emprunteur?.telephone) {
                  envoyerSMS({
                    message: msgOperation(emprunteur.nom, "crédit", montantNum, undefined, `Échéance : ${creditFin}`),
                    numeros: [emprunteur.telephone],
                    groupId,
                    });
                }

                setCreditError("");
                setCreditSuccess(true);
                setTimeout(() => {
                  setShowCreditForm(false);
                  setCreditSuccess(false);
                  setCreditEpargneId(""); setCreditMembreId(""); setCreditMontant(""); setCreditFraisDossier(""); setCreditCommission(""); setCreditPenalite("");
                  setCreditDebut(""); setCreditFin("");
                  setCreditDepasseCaution(false); setCreditAvalisteId("");
                }, 1400);
              } catch (e) {
                console.error("Erreur de mise en place du crédit", e);
                setCreditError(e.message || "Erreur lors de la mise en place du crédit.");
                setCreditSuccess(false);
              }
            }}
          >
            Valider le crédit
          </button>
        </Modal>
      )}

      {showRapportJournalier && (
        <Modal onClose={() => setShowRapportJournalier(false)} title="Rapport journalier" icon={<FileBarChart />} accentColor={C.vifBleu}>
          {!rapportJour ? (
            <>
              <FormField label="Date de la séance" placeholder="jj/mm/aaaa" value={rapportJourDate} onChange={(e) => setRapportJourDate(e.target.value)} />
              <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 11px" }}>
                Le rapport reprend toutes les cotisations, versements, amendes, mouvements bancaires et événements d'assurance enregistrés à cette date, tous modules confondus.
              </div>
              {rapportJourErreur && (
                <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
                  {rapportJourErreur}
                </div>
              )}
              <button
                disabled={rapportJourChargement}
                style={{ marginTop: "6px", background: C.vifBleu, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: rapportJourChargement ? "default" : "pointer" }}
                onClick={async () => {
                  const iso = versDateISO(rapportJourDate);
                  if (!iso) { setRapportJourErreur("Saisis une date valide (jj/mm/aaaa)."); return; }
                  setRapportJourChargement(true);
                  setRapportJourErreur("");
                  try {
                    const data = await fetchRapportJournalier(groupId, iso);
                    setRapportJour(data);
                  } catch (e) {
                    console.error("Erreur de génération du rapport journalier", e);
                    setRapportJourErreur("Erreur lors de la génération du rapport.");
                  } finally {
                    setRapportJourChargement(false);
                  }
                }}
              >
                {rapportJourChargement ? "Génération..." : "Générer le rapport"}
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>{rapportJourDate}</div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, background: C.ok, borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "10.5px", color: C.accent2 }}>Total encaissé</div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: C.accent2 }}>{fmtFCFA(rapportJour.totalEncaisse)}</div>
                </div>
                <div style={{ flex: 1, background: C.warnBg, borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "10.5px", color: C.warn }}>Total décaissé</div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: C.warn }}>{fmtFCFA(rapportJour.totalDecaisse)}</div>
                </div>
              </div>

              {rapportJour.tontineCotisations.length === 0 && rapportJour.tontineVersements.length === 0 && rapportJour.tontineAmendes.length === 0 &&
               rapportJour.mouvementsEpargne.length === 0 && rapportJour.assuranceMouvements.length === 0 && rapportJour.mouvementsExternes.length === 0 &&
               (!rapportJour.mouvementsFonds || rapportJour.mouvementsFonds.length === 0) &&
               (!rapportJour.amendesSeanceDeclarees || rapportJour.amendesSeanceDeclarees.length === 0) &&
               (!rapportJour.paiementsAmendesJour || rapportJour.paiementsAmendesJour.length === 0) && (
                <div style={{ fontSize: "12.5px", color: C.sub, textAlign: "center", padding: "10px 0" }}>Aucune activité enregistrée à cette date.</div>
              )}

              {rapportJour.tontineCotisations.length > 0 && (
                <RapportSection titre="Tontine — Cotisations">
                  {rapportJour.tontineCotisations.map((c, i) => (
                    <RapportLigne key={i} gauche={`${c.membre} — Tour ${c.tourNumero} (${c.tontine})`} droite={fmtFCFA(c.montant)} positif />
                  ))}
                </RapportSection>
              )}
              {rapportJour.tontineVersements.length > 0 && (
                <RapportSection titre="Tontine — Bénéficiaires versés">
                  {rapportJour.tontineVersements.map((v, i) => (
                    <RapportLigne key={i} gauche={`${v.beneficiaire} — Tour ${v.tourNumero} (${v.tontine})`} droite="Versé" />
                  ))}
                </RapportSection>
              )}
              {rapportJour.tontineAmendes.length > 0 && (
                <RapportSection titre="Tontine — Amendes">
                  {rapportJour.tontineAmendes.map((a, i) => (
                    <RapportLigne key={i} gauche={`${a.membre}${a.motif ? ` — ${a.motif}` : ""}`} droite={fmtFCFA(a.montant)} />
                  ))}
                </RapportSection>
              )}
              {rapportJour.mouvementsEpargne.length > 0 && (
                <RapportSection titre="Banque — Mouvements">
                  {rapportJour.mouvementsEpargne.map((m, i) => (
                    <RapportLigne key={i} gauche={`${m.membre} — ${m.epargne}`} droite={fmtFCFA(m.montant)} positif={m.type === "Versement"} />
                  ))}
                </RapportSection>
              )}
              {rapportJour.assuranceMouvements.length > 0 && (
                <RapportSection titre="Assurance">
                  {rapportJour.assuranceMouvements.map((m, i) => (
                    <RapportLigne key={i} gauche={`${m.membre} — ${m.type}`} droite={fmtFCFA(m.montant)} positif={m.type === "Cotisation"} />
                  ))}
                </RapportSection>
              )}
              {rapportJour.mouvementsExternes.length > 0 && (
                <RapportSection titre="Dépôts / Retraits externes">
                  {rapportJour.mouvementsExternes.map((m, i) => (
                    <RapportLigne key={i} gauche={`${m.compte} — ${m.type}${m.detail !== "—" ? ` (${m.detail})` : ""}`} droite={fmtFCFA(m.montant)} positif={m.type === "Dépôt" || m.type === "Intérêt"} />
                  ))}
                </RapportSection>
              )}
              {rapportJour.mouvementsFonds?.length > 0 && (
                <RapportSection titre="Fonds">
                  {rapportJour.mouvementsFonds.map((m, i) => (
                    <RapportLigne key={i} gauche={`${m.membre} — ${m.typeFonds}`} droite={fmtFCFA(m.montant)} positif />
                  ))}
                </RapportSection>
              )}
              {rapportJour.amendesSeanceDeclarees?.length > 0 && (
                <RapportSection titre="Séances — Amendes déclarées">
                  {rapportJour.amendesSeanceDeclarees.map((a, i) => (
                    <RapportLigne key={i} gauche={`${a.membre} — ${a.typeAmende}`} droite={fmtFCFA(a.montant)} />
                  ))}
                </RapportSection>
              )}
              {rapportJour.paiementsAmendesJour?.length > 0 && (
                <RapportSection titre="Séances — Amendes payées (caisse)">
                  {rapportJour.paiementsAmendesJour.map((p, i) => (
                    <RapportLigne key={i} gauche={`${p.membre} — ${p.mode}`} droite={fmtFCFA(p.montant)} positif />
                  ))}
                </RapportSection>
              )}

              <button
                onClick={() => { setRapportJour(null); setRapportJourDate(""); }}
                style={{ marginTop: "6px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, color: C.sub, cursor: "pointer" }}
              >
                Choisir une autre date
              </button>
            </>
          )}
        </Modal>
      )}

      {showRapportMensuel && (
        <Modal onClose={() => setShowRapportMensuel(false)} title="Rapport mensuel" icon={<FileBarChart />} accentColor={C.vifBleu}>
          {!rapportMois ? (
            <>
              <div style={{ display: "flex", gap: "8px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Mois</label>
                  <select value={rapportMoisSelection} onChange={(e) => setRapportMoisSelection(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}>
                    {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m, i) => (
                      <option key={m} value={m}>{["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"][i]}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Année</label>
                  <input value={rapportAnneeSelection} onChange={(e) => setRapportAnneeSelection(e.target.value.replace(/[^\d]/g, ""))} maxLength={4} style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }} />
                </div>
              </div>
              <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 11px" }}>
                Synthèse de toutes les activités du mois sélectionné, tous modules confondus.
              </div>
              {rapportMoisErreur && (
                <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
                  {rapportMoisErreur}
                </div>
              )}
              <button
                disabled={rapportMoisChargement}
                style={{ marginTop: "6px", background: C.vifBleu, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: rapportMoisChargement ? "default" : "pointer" }}
                onClick={async () => {
                  setRapportMoisChargement(true);
                  setRapportMoisErreur("");
                  try {
                    const data = await fetchRapportMensuel(groupId, `${rapportAnneeSelection}-${rapportMoisSelection}`);
                    setRapportMois(data);
                  } catch (e) {
                    console.error("Erreur de génération du rapport mensuel", e);
                    setRapportMoisErreur("Erreur lors de la génération du rapport.");
                  } finally {
                    setRapportMoisChargement(false);
                  }
                }}
              >
                {rapportMoisChargement ? "Génération..." : "Générer le rapport"}
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>
                {["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"][parseInt(rapportMois.periode.slice(5, 7), 10) - 1]} {rapportMois.periode.slice(0, 4)}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <div style={{ flex: 1, background: C.ok, borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "10.5px", color: C.accent2 }}>Total encaissé</div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: C.accent2 }}>{fmtFCFA(rapportMois.totalEncaisse)}</div>
                </div>
                <div style={{ flex: 1, background: C.warnBg, borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "10.5px", color: C.warn }}>Total décaissé</div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: C.warn }}>{fmtFCFA(rapportMois.totalDecaisse)}</div>
                </div>
              </div>

              {Object.keys(rapportMois.parModule).length === 0 ? (
                <div style={{ fontSize: "12.5px", color: C.sub, textAlign: "center", padding: "10px 0" }}>Aucune activité enregistrée ce mois-ci.</div>
              ) : (
                <RapportSection titre="Par module">
                  {Object.entries(rapportMois.parModule).map(([module, t]) => (
                    <div key={module} style={{ background: "#FBFAF6", borderRadius: "7px", padding: "8px 10px", fontSize: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <b>{module}</b>
                        <span style={{ color: C.sub }}>{t.nb} mouvement(s)</span>
                      </div>
                      <div style={{ color: C.accent2 }}>+ {fmtFCFA(t.encaisse)} {t.decaisse > 0 && <span style={{ color: C.warn }}>· − {fmtFCFA(t.decaisse)}</span>}</div>
                    </div>
                  ))}
                </RapportSection>
              )}

              {rapportMois.mouvements.length > 0 && (
                <RapportSection titre={`Journal du mois (${rapportMois.mouvements.length})`}>
                  <div style={{ maxHeight: "260px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {rapportMois.mouvements.map((m, i) => (
                      <RapportLigne key={i} gauche={`${m.date} — ${m.module} : ${m.type}${m.membre !== "—" ? ` (${m.membre})` : ""}`} droite={fmtFCFA(m.montant)} positif={m.sens === "encaisse"} />
                    ))}
                  </div>
                </RapportSection>
              )}

              <button
                onClick={() => setRapportMois(null)}
                style={{ marginTop: "6px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, color: C.sub, cursor: "pointer" }}
              >
                Choisir un autre mois
              </button>
            </>
          )}
        </Modal>
      )}

      {showExportBilan && (
        <Modal onClose={() => setShowExportBilan(false)} title="Exporter le bilan annuel" icon={<FileBarChart />} accentColor={C.vifBleu}>
          <div style={{ fontSize: "12.5px", color: C.sub }}>
            Génère un fichier <b>.csv</b> (s'ouvre directement dans Excel) avec tous les mouvements de l'année, tous modules confondus, prêt pour l'assemblée générale.
          </div>
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Année</label>
            <input value={exportAnnee} onChange={(e) => setExportAnnee(e.target.value.replace(/[^\d]/g, ""))} maxLength={4} style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }} />
          </div>

          {exportErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {exportErreur}
            </div>
          )}
          {exportSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Fichier téléchargé.
            </div>
          )}

          <button
            disabled={exportEnCours}
            style={{ marginTop: "6px", background: C.vifBleu, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: exportEnCours ? "default" : "pointer" }}
            onClick={async () => {
              setExportEnCours(true);
              setExportErreur("");
              setExportSuccess(false);
              try {
                const data = await fetchBilanAnnuel(groupId, exportAnnee);

                const lignes = [];
                lignes.push(["BILAN ANNUEL", exportAnnee, nomGroupe || ""]);
                lignes.push([]);
                lignes.push(["Total encaissé", fmtFCFA(data.totalEncaisse)]);
                lignes.push(["Total décaissé", fmtFCFA(data.totalDecaisse)]);
                lignes.push([]);
                lignes.push(["RÉPARTITION PAR MODULE"]);
                lignes.push(["Module", "Encaissé", "Décaissé", "Nb mouvements"]);
                Object.entries(data.parModule).forEach(([module, t]) => {
                  lignes.push([module, fmtFCFA(t.encaisse), fmtFCFA(t.decaisse), t.nb]);
                });
                lignes.push([]);
                lignes.push(["JOURNAL COMPLET DE L'ANNÉE"]);
                lignes.push(["Date", "Module", "Type", "Membre", "Montant", "Sens", "Détail"]);
                data.mouvements.forEach((m) => {
                  lignes.push([m.date, m.module, m.type, m.membre, m.montant, m.sens === "encaisse" ? "Encaissé" : "Décaissé", m.detail]);
                });

                const csv = lignes.map((ligne) => ligne.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
                const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `bilan-annuel-${exportAnnee}-${(nomGroupe || "groupe").replace(/[^a-z0-9]/gi, "-")}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                setExportSuccess(true);
              } catch (e) {
                console.error("Erreur d'export du bilan annuel", e);
                setExportErreur(e.message || "Erreur lors de la génération du fichier.");
              } finally {
                setExportEnCours(false);
              }
            }}
          >
            {exportEnCours ? "Génération..." : "Télécharger le bilan (.csv)"}
          </button>
        </Modal>
      )}

      {showInviteMember && (
        <Modal onClose={() => setShowInviteMember(false)} title="Inviter un membre">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "4px" }}>
            <div
              style={{
                width: "88px", height: "88px", borderRadius: "10px",
                border: `2px dashed ${C.border}`, background: "#FBFAF6",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: "4px", cursor: "pointer",
              }}
            >
              <Users size={20} color={C.sub} />
              <span style={{ fontSize: "9.5px", color: C.sub, textAlign: "center" }}>Photo 4×4</span>
            </div>
          </div>

          <FormField label="Nom complet" placeholder="Ex. André Fotso" value={inviteNom} onChange={(e) => setInviteNom(e.target.value)} />
          <FormField label="Email" placeholder="Ex. andre.fotso@exemple.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <FormField label="Téléphone" placeholder="Ex. 6XX XXX XXX" value={inviteTelephone} onChange={(e) => setInviteTelephone(e.target.value)} />
          <FormField label="Profession" placeholder="Ex. Enseignant, commerçant..." />
          <FormField label="Quartier / Milieu d'habitation" placeholder="Ex. Nkolbisson, Yaoundé" />

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Statut de logement</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {["Locataire", "Propriétaire"].map((t) => (
                <div
                  key={t}
                  onClick={() => setLogementType(t)}
                  style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: "8px", border: `1px solid ${logementType === t ? C.accent2 : C.border}`, background: logementType === t ? C.ok : "#FBFAF6", fontSize: "12px", fontWeight: 600, color: logementType === t ? C.accent2 : C.sub, cursor: "pointer" }}
                >
                  {t}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Carte Nationale d'Identité (CNI)</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <input placeholder="Numéro CNI" style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }} />
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <input placeholder="Date de délivrance" style={{ flex: 1, boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }} />
                <input placeholder="Lieu de délivrance" style={{ flex: 1, boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }} />
              </div>
            </div>
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "6px" }}>
              Ces informations aident le groupe à garantir la fiabilité des fonds confiés au membre.
            </div>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Parrain (membre déjà dans le groupe)</label>
            <select
              value={parrain}
              onChange={(e) => setParrain(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner un parrain</option>
              {membres.map((m) => <option key={m.nom} value={m.nom}>{m.nom}</option>)}
            </select>
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "5px" }}>
              Le parrain doit obligatoirement être un membre déjà présent dans la tontine.
            </div>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Pièces jointes</label>
            <div
              style={{
                border: `1.5px dashed ${C.border}`, borderRadius: "10px", padding: "16px",
                textAlign: "center", background: "#FBFAF6", cursor: "pointer",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 600, color: C.accent2 }}>+ Joindre des fichiers</div>
              <div style={{ fontSize: "10.5px", color: C.sub, marginTop: "4px" }}>
                CNI, plan de localisation, et autres justificatifs
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
              {[
                { nom: "CNI_recto_verso.pdf" },
                { nom: "Plan_localisation.jpg" },
              ].map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FFFFFF", fontSize: "12px" }}>
                  <span>{f.nom}</span>
                  <X size={13} color={C.sub} style={{ cursor: "pointer" }} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Type de membre</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {["Membre simple", "Membre du bureau"].map((t) => (
                <div
                  key={t}
                  onClick={() => setRoleType(t)}
                  style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: "8px", border: `1px solid ${roleType === t ? C.accent2 : C.border}`, background: roleType === t ? C.ok : "#FBFAF6", fontSize: "12px", fontWeight: 600, color: roleType === t ? C.accent2 : C.sub, cursor: "pointer" }}
                >
                  {t}
                </div>
              ))}
            </div>
          </div>

          {roleType === "Membre du bureau" && (
            <div>
              <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Poste</label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <select
                  value={posteChoisi}
                  onChange={(e) => setPosteChoisi(e.target.value)}
                  style={{ flex: 1, boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
                >
                  {postes.map((p) => <option key={p}>{p}</option>)}
                </select>
                <button
                  onClick={() => setShowNewPoste(!showNewPoste)}
                  style={{ background: C.ok, color: C.accent2, border: `1px solid ${C.accent2}33`, borderRadius: "9px", padding: "0 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  <Plus size={14} />
                </button>
              </div>
              {showNewPoste && (
                <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                  <input
                    value={newPosteName}
                    onChange={(e) => setNewPosteName(e.target.value)}
                    placeholder="Ex. Chargé des sanctions"
                    style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none" }}
                  />
                  <button onClick={addPoste} style={{ background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "8px", padding: "0 12px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>
                    Ajouter
                  </button>
                </div>
              )}
              <div style={{ fontSize: "11px", color: C.sub, marginTop: "5px" }}>
                Les membres du bureau ont des accès plus avancés que les membres simples.
              </div>
            </div>
          )}

          <FormField label="Versement immédiat au fonds de garantie (optionnel)" placeholder="Ex. 20 000 FCFA — si prêt à verser tout de suite" value={inviteVersementInitial} onChange={(e) => setInviteVersementInitial(e.target.value)} />
          <div style={{ fontSize: "11px", color: C.sub, marginTop: "-6px" }}>
            L'objectif du fonds est commun à tout le groupe (voir l'écran "Fonds"). Si le membre n'est pas prêt à verser maintenant, laisse ce champ vide — il cotisera plus tard.
          </div>

          <div style={{ fontSize: "11px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            L'invitation est envoyée au membre, puis soumise à la <b>validation du Président</b> avant qu'il ne rejoigne officiellement le groupe.
          </div>

          {inviteError && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {inviteError}
            </div>
          )}
          {inviteSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <CheckCircle2 size={14} /> Membre créé — {inviteNom} apparaît maintenant "en attente".
              </div>
              <div>Identifiant : <b>{inviteIdentifiant}</b></div>
              <div>Mot de passe temporaire : <b>{inviteMotDePasseTemp}</b></div>
              <div style={{ color: C.sub, fontSize: "10.5px", marginTop: "4px" }}>
                Il pourra changer ce mot de passe une fois connecté à son compte.
              </div>
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onClick={async () => {
              if (!inviteNom.trim() || !inviteEmail.trim()) {
                setInviteError("Le nom complet et l'email sont obligatoires.");
                setInviteSuccess(false);
                return;
              }
              try {
                const resultat = await inviterMembre(groupId, {
                  nom: inviteNom.trim(),
                  email: inviteEmail.trim(),
                  telephone: inviteTelephone.trim(),
                  typeMembre: roleType,
                  posteId: null, // ⚠️ à relier au vrai id du poste choisi (table postes_bureau) une fois les postes créés en base
                });

                // Enregistre un éventuel versement immédiat vers le
                // "Fonds de garantie" (l'objectif, lui, est commun à
                // tous les membres et se fixe une fois pour toutes
                // dans l'écran Fonds → Types de fonds).
                const versementNum = parseInt(inviteVersementInitial.replace(/[^\d]/g, ""), 10) || 0;
                if (versementNum > 0) {
                  let typeGarantie = typesFonds.find((t) => t.nom === "Fonds de garantie");
                  if (!typeGarantie) typeGarantie = await creerTypeFonds(groupId, "Fonds de garantie", 0);
                  await enregistrerVersementFonds(resultat.membre.id, typeGarantie.id, versementNum);
                  await rechargerFonds();
                }

                await rechargerMembres();
                setInviteError("");
                setInviteSuccess(true);
                setInviteIdentifiant(resultat.identifiant);
                setInviteMotDePasseTemp(resultat.motDePasseTemp);
                setInviteNom("");
                setInviteTelephone("");
                setInviteEmail("");
                setInviteCaution("");
                setInviteVersementInitial("");
                setTimeout(() => {
                  setShowInviteMember(false);
                  setInviteSuccess(false);
                  setInviteIdentifiant("");
                  setInviteMotDePasseTemp("");
                }, 5000);
              } catch (e) {
                console.error("Erreur d'invitation", e);
                setInviteError(e.message || "Erreur lors de l'envoi de l'invitation.");
                setInviteSuccess(false);
              }
            }}
          >
            Envoyer l'invitation
          </button>
        </Modal>
      )}

      {showGererTypesFonds && (
        <Modal onClose={() => setShowGererTypesFonds(false)} title="Types de fonds" icon={<PiggyBank />} accentColor={C.vifOr}>
          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Crée les rubriques de fonds propres à ton groupe (Fonds de garantie, Fonds de solidarité, etc.). L'objectif fixé s'applique à tous les membres.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {typesFonds.map((t) => (
              <div key={t.id} style={{ padding: "10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>{t.nom}</span>
                  <X
                    size={14}
                    color={C.sub}
                    style={{ cursor: "pointer" }}
                    onClick={async () => {
                      try {
                        await supprimerTypeFonds(t.id);
                        await rechargerFonds();
                      } catch (e) {
                        console.error("Erreur de suppression du type de fonds", e);
                      }
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    value={cibleTypeInputs[t.id] ?? String(t.cible || "")}
                    onChange={(e) => setCibleTypeInputs({ ...cibleTypeInputs, [t.id]: e.target.value })}
                    placeholder="Objectif commun (FCFA)"
                    style={{ flex: 1, boxSizing: "border-box", padding: "8px 9px", borderRadius: "7px", border: `1px solid ${C.border}`, background: "#FFFFFF", fontSize: "12px", outline: "none" }}
                  />
                  <button
                    disabled={cibleTypeEnCours === t.id}
                    onClick={async () => {
                      const val = parseInt((cibleTypeInputs[t.id] || "").replace(/[^\d]/g, ""), 10) || 0;
                      setCibleTypeEnCours(t.id);
                      try {
                        await fixerCibleTypeFonds(t.id, val);
                        await rechargerFonds();
                      } catch (e) {
                        console.error("Erreur de mise à jour de l'objectif", e);
                      } finally {
                        setCibleTypeEnCours("");
                      }
                    }}
                    style={{ background: "transparent", border: `1px solid ${C.vifOr}66`, borderRadius: "7px", padding: "0 12px", fontSize: "11.5px", fontWeight: 600, color: C.vifOr, cursor: "pointer" }}
                  >
                    {cibleTypeEnCours === t.id ? "..." : "Fixer"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em" }}>Nouveau type de fonds</div>
          <FormField label="Nom" placeholder="Ex. Fonds de solidarité" value={newTypeFondsNom} onChange={(e) => setNewTypeFondsNom(e.target.value)} />
          <FormField label="Objectif commun (FCFA)" placeholder="Ex. 50 000 FCFA" value={newTypeFondsCible} onChange={(e) => setNewTypeFondsCible(e.target.value)} />
          <button
            onClick={async () => {
              if (!newTypeFondsNom.trim()) return;
              try {
                await creerTypeFonds(groupId, newTypeFondsNom.trim(), parseInt(newTypeFondsCible.replace(/[^\d]/g, ""), 10) || 0);
                setNewTypeFondsNom("");
                setNewTypeFondsCible("");
                await rechargerFonds();
              } catch (e) {
                console.error("Erreur de création du type de fonds", e);
              }
            }}
            style={{ background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "8px", padding: "10px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}
          >
            Ajouter ce type de fonds
          </button>
        </Modal>
      )}

      {showCotisationFonds && (
        <Modal onClose={() => setShowCotisationFonds(false)} title="Enregistrer fonds" icon={<Wallet />} accentColor={C.vifOr}>
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Type de fonds concerné</label>
            <select
              value={cotisationFondsTypeId}
              onChange={(e) => setCotisationFondsTypeId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner un type de fonds</option>
              {typesFonds.map((t) => (
                <option key={t.id} value={t.id}>{t.nom} — objectif {fmtFCFA(t.cible)}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Date du versement</label>
            <input
              value={cotisationFondsDate}
              onChange={(e) => setCotisationFondsDate(e.target.value)}
              placeholder="jj/mm/aaaa"
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Montant par membre</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {membres.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ flex: 1, fontSize: "13px", fontWeight: 600 }}>{m.nom}</div>
                  <input
                    value={cotisationFondsMontants[m.id] || ""}
                    onChange={(e) => setCotisationFondsMontants({ ...cotisationFondsMontants, [m.id]: e.target.value })}
                    placeholder="0 FCFA"
                    style={{ width: "130px", boxSizing: "border-box", padding: "9px 11px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none", textAlign: "right" }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: "11px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Laisse vide un membre qui n'a pas versé ce jour-là.
          </div>

          {cotisationFondsErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {cotisationFondsErreur}
            </div>
          )}

          <button
            disabled={cotisationFondsEnCours}
            style={{ marginTop: "6px", background: C.vifOr, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: cotisationFondsEnCours ? "default" : "pointer" }}
            onClick={async () => {
              if (!cotisationFondsTypeId) { setCotisationFondsErreur("Sélectionne un type de fonds."); return; }
              if (!cotisationFondsDate.trim()) { setCotisationFondsErreur("La date du versement est obligatoire."); return; }
              const dateISO = versDateISO(cotisationFondsDate);
              if (!dateISO) { setCotisationFondsErreur("Date invalide (jj/mm/aaaa)."); return; }

              const aVerser = membres.filter((m) => cotisationFondsMontants[m.id] && parseInt(cotisationFondsMontants[m.id].replace(/[^\d]/g, ""), 10) > 0);
              if (aVerser.length === 0) { setCotisationFondsErreur("Saisis au moins un montant."); return; }

              setCotisationFondsEnCours(true);
              setCotisationFondsErreur("");
              try {
                const typeChoisi = typesFonds.find((t) => t.id === cotisationFondsTypeId);
                for (const m of aVerser) {
                  const montant = parseInt(cotisationFondsMontants[m.id].replace(/[^\d]/g, ""), 10);
                  const nouveauSolde = await enregistrerVersementFonds(m.id, cotisationFondsTypeId, montant, dateISO);
                  if (m.telephone) {
                    envoyerSMS({
                      message: msgOperation(m.nom, `versement "${typeChoisi?.nom}"`, montant, nouveauSolde),
                      numeros: [m.telephone],
                      groupId,
                      });
                  }
                }
                await rechargerFonds();
                setShowCotisationFonds(false);
              } catch (e) {
                console.error("Erreur d'enregistrement des versements", e);
                setCotisationFondsErreur(e.message || "Erreur lors de l'enregistrement.");
              } finally {
                setCotisationFondsEnCours(false);
              }
            }}
          >
            {cotisationFondsEnCours ? "Enregistrement..." : "Enregistrer les versements"}
          </button>
        </Modal>
      )}

      {showHistoriqueMembre && (
        <Modal onClose={() => { setShowHistoriqueMembre(null); setHistoriqueMembreData(null); }} title={`Historique — ${showHistoriqueMembre.nom}`} icon={<FileBarChart />} accentColor={C.vifBleu}>
          {chargementHistoriqueMembre ? (
            <div style={{ fontSize: "13px", color: C.sub, textAlign: "center", padding: "20px 0" }}>Chargement...</div>
          ) : !historiqueMembreData ? (
            <div style={{ fontSize: "12px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "10px 12px" }}>Impossible de charger l'historique.</div>
          ) : (
            <>
              {historiqueMembreData.tontine && (
                <div style={{ background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px" }}>
                  <b>{historiqueMembreData.tontine.nom}</b> — {fmtFCFA(historiqueMembreData.tontine.montantParTour)}/tour
                  {historiqueMembreData.tontine.tourEnCoursNumero && (
                    <div style={{ color: C.sub, fontSize: "11px", marginTop: "3px" }}>
                      Tour {historiqueMembreData.tontine.tourEnCoursNumero} en cours — {historiqueMembreData.tontine.aCotiseCeTour ? "cotisation à jour" : "cotisation non reçue"}
                    </div>
                  )}
                </div>
              )}
              {historiqueMembreData.assurance && (
                <div style={{ background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px" }}>
                  Solde assurance : <b>{fmtFCFA(historiqueMembreData.assurance.solde)}</b>
                  {historiqueMembreData.assurance.delaiExpireLe && (
                    <span style={{ color: C.warn }}> — à reconstituer avant le {historiqueMembreData.assurance.delaiExpireLe}</span>
                  )}
                </div>
              )}

              <div style={{ fontSize: "11px", fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em", margin: "4px 0 2px" }}>
                Mouvements ({historiqueMembreData.historique.length})
              </div>
              {historiqueMembreData.historique.length === 0 ? (
                <div style={{ fontSize: "12px", color: C.sub, textAlign: "center", padding: "10px 0" }}>Aucun mouvement enregistré.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "280px", overflowY: "auto" }}>
                  {historiqueMembreData.historique.map((h, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "8px 10px", background: "#FBFAF6", borderRadius: "8px", fontSize: "12px" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{h.label}</div>
                        <div style={{ color: C.sub, fontSize: "10.5px" }}>{h.date}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: h.montant < 0 ? C.warn : C.accent2, whiteSpace: "nowrap" }}>
                        {h.montant < 0 ? "-" : "+"}{fmtFCFA(Math.abs(h.montant))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {showEditMembre && editMembre && (
        <Modal onClose={() => setShowEditMembre(false)} title="Modifier un membre">
          <FormField label="Nom complet" placeholder="Ex. André Fotso" value={editNom} onChange={(e) => setEditNom(e.target.value)} />
          <FormField label="Email" placeholder="Ex. andre.fotso@exemple.com" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
          <FormField label="Téléphone" placeholder="Ex. 6XX XXX XXX" value={editTelephone} onChange={(e) => setEditTelephone(e.target.value)} />

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "8px", display: "block" }}>Documents</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { type: "photo", label: "Photo 4×4", accept: "image/*" },
                { type: "cni", label: "CNI (recto/verso)", accept: "image/*,.pdf" },
                { type: "plan_localisation", label: "Plan de localisation", accept: "image/*,.pdf" },
              ].map((doc) => (
                <div key={doc.type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
                  <span style={{ fontSize: "12px" }}>{doc.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {editDocuments[doc.type] && (
                      <a href={editDocuments[doc.type]} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: C.accent2, fontWeight: 600 }}>
                        Voir
                      </a>
                    )}
                    <input
                      type="file"
                      accept={doc.accept}
                      ref={(el) => { inputsDocumentsRef.current[doc.type] = el; }}
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const fichier = e.target.files[0];
                        if (!fichier || !editMembre) return;
                        setDocumentEnCours(doc.type);
                        try {
                          const url = await televerserDocumentMembre(editMembre.id, doc.type, fichier);
                          setEditDocuments((prev) => ({ ...prev, [doc.type]: url }));
                        } catch (err) {
                          console.error("Erreur de téléversement", err);
                        } finally {
                          setDocumentEnCours("");
                          e.target.value = "";
                        }
                      }}
                    />
                    <button
                      disabled={documentEnCours === doc.type}
                      onClick={() => inputsDocumentsRef.current[doc.type]?.click()}
                      style={{ background: "transparent", color: C.vifBleu, border: `1px solid ${C.vifBleu}55`, borderRadius: "7px", padding: "5px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                    >
                      {documentEnCours === doc.type ? "Envoi..." : editDocuments[doc.type] ? "Remplacer" : "Ajouter"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: "11px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Le mot de passe de connexion n'est jamais modifiable ici — seul le membre lui-même peut le changer, une fois son compte activé.
          </div>

          {editError && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {editError}
            </div>
          )}
          {editSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Informations mises à jour.
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onClick={async () => {
              if (!editNom.trim()) {
                setEditError("Le nom complet est obligatoire.");
                setEditSuccess(false);
                return;
              }
              try {
                await modifierMembre(editMembre.profileId, {
                  nom: editNom.trim(),
                  email: editEmail.trim(),
                  telephone: editTelephone.trim(),
                });
                await rechargerMembres();
                setEditError("");
                setEditSuccess(true);
                setTimeout(() => {
                  setShowEditMembre(false);
                  setEditSuccess(false);
                }, 1200);
              } catch (e) {
                console.error("Erreur de modification du membre", e);
                setEditError(e.message || "Erreur lors de la modification.");
                setEditSuccess(false);
              }
            }}
          >
            Enregistrer les modifications
          </button>
        </Modal>
      )}

      {showResetMembre && (
        <Modal onClose={() => setShowResetMembre(false)} title="Accès d'urgence — réinitialiser un mot de passe" icon={<KeyRound />} accentColor={C.vifViolet}>
          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Réservé aux cas d'urgence (membre bloqué, mot de passe oublié sans accès email). Un nouveau mot de passe temporaire est généré immédiatement, et la personne devra en choisir un nouveau à sa prochaine connexion.
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Membre à réinitialiser</label>
            <select
              value={resetMembreId}
              onChange={(e) => setResetMembreId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner un membre</option>
              {membres.filter((m) => m.compteActive).map((m) => <option key={m.id} value={m.id}>{m.nom} — {m.role}</option>)}
            </select>
            {membres.filter((m) => m.compteActive).length === 0 && (
              <div style={{ fontSize: "11px", color: C.sub, marginTop: "5px" }}>Aucun membre avec un compte activé pour l'instant.</div>
            )}
          </div>

          {resetMembreErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {resetMembreErreur}
            </div>
          )}
          {resetMembreMotDePasse && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <CheckCircle2 size={14} /> Mot de passe réinitialisé.
              </div>
              <div>Nouveau mot de passe temporaire : <b>{resetMembreMotDePasse}</b></div>
              <div style={{ color: C.sub, fontSize: "10.5px", marginTop: "4px" }}>
                À communiquer au membre — il devra le changer dès sa prochaine connexion.
              </div>
            </div>
          )}

          {!resetMembreMotDePasse && (
            <button
              disabled={resetMembreEnCours}
              style={{ marginTop: "6px", background: C.vifViolet, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: resetMembreEnCours ? "default" : "pointer" }}
              onClick={async () => {
                if (!resetMembreId) { setResetMembreErreur("Sélectionne un membre."); return; }
                setResetMembreEnCours(true);
                setResetMembreErreur("");
                try {
                  const membreChoisi = membres.find((m) => m.id === resetMembreId);
                  const nouveauMdp = await reinitialiserMotDePasseMembre(membreChoisi.email);
                  setResetMembreMotDePasse(nouveauMdp);
                } catch (e) {
                  console.error("Erreur de réinitialisation", e);
                  setResetMembreErreur(e.message || "Erreur lors de la réinitialisation.");
                } finally {
                  setResetMembreEnCours(false);
                }
              }}
            >
              {resetMembreEnCours ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
            </button>
          )}
        </Modal>
      )}

      {showDeleteMembre && (
        <Modal onClose={() => setShowDeleteMembre(null)} title="Supprimer ce membre">
          <div style={{ fontSize: "12.5px", color: C.sub }}>
            Es-tu sûr de vouloir supprimer <b>{showDeleteMembre.nom}</b> du groupe ? Cette action est impossible s'il a déjà effectué une cotisation (tontine ou banque), pour préserver l'historique financier.
          </div>

          {deleteErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {deleteErreur}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
            <button
              onClick={() => setShowDeleteMembre(null)}
              style={{ flex: 1, background: "transparent", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, color: C.sub, cursor: "pointer" }}
            >
              Annuler
            </button>
            <button
              disabled={deleteEnCours}
              onClick={async () => {
                setDeleteEnCours(true);
                setDeleteErreur("");
                try {
                  await supprimerMembre(showDeleteMembre.id);
                  await rechargerMembres();
                  setShowDeleteMembre(null);
                } catch (e) {
                  console.error("Erreur de suppression du membre", e);
                  setDeleteErreur(e.message || "Erreur lors de la suppression.");
                } finally {
                  setDeleteEnCours(false);
                }
              }}
              style={{ flex: 1, background: C.warn, color: "#FFF6EE", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: deleteEnCours ? "default" : "pointer", opacity: deleteEnCours ? 0.7 : 1 }}
            >
              {deleteEnCours ? "Suppression..." : "Supprimer définitivement"}
            </button>
          </div>
        </Modal>
      )}

      {showAjouterSignataire && (
        <Modal onClose={() => setShowAjouterSignataire(false)} title="Ajouter un signataire" icon={<UserCog />} accentColor={C.vifBleu}>
          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Les signataires sont les personnes habilitées à valider un retrait (2 à 3 requis par opération).
          </div>
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Membre</label>
            <select
              value={sigMembreId}
              onChange={(e) => setSigMembreId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner un membre</option>
              {membres.filter((m) => m.statut === "actif" && !signataires.some((s) => s.membreId === m.id)).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </div>
          <FormField label="Fonction (optionnel)" placeholder="Ex. Président, Trésorière..." value={sigFonction} onChange={(e) => setSigFonction(e.target.value)} />

          {sigError && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {sigError}
            </div>
          )}
          {sigSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Signataire ajouté.
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: C.vifBleu, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
            onClick={async () => {
              if (!sigMembreId) { setSigError("Sélectionnez un membre."); return; }
              try {
                await ajouterSignataire(groupId, sigMembreId, sigFonction.trim());
                await rechargerComptes();
                setSigError("");
                setSigSuccess(true);
                setTimeout(() => {
                  setShowAjouterSignataire(false);
                  setSigSuccess(false);
                }, 1200);
              } catch (e) {
                console.error("Erreur d'ajout du signataire", e);
                setSigError(e.message || "Erreur lors de l'ajout.");
              }
            }}
          >
            Ajouter le signataire
          </button>
        </Modal>
      )}

      {showCreerCompte && (
        <Modal onClose={() => setShowCreerCompte(false)} title="Créer un compte bancaire" icon={<Building2 />} accentColor={C.vifBleu}>
          <FormField label="Nom du compte" placeholder="Ex. Compte principal, Épargne terrain..." value={compteNom} onChange={(e) => setCompteNom(e.target.value)} />
          <FormField label="Banque" placeholder="Ex. Afriland First Bank" value={compteBanque} onChange={(e) => setCompteBanque(e.target.value)} />
          <FormField label="Numéro de compte (optionnel)" placeholder="Ex. 0123456789" value={compteNumero} onChange={(e) => setCompteNumero(e.target.value)} />

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Type de compte</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {["Courant", "Épargne"].map((t) => (
                <div
                  key={t}
                  onClick={() => setCompteType(t)}
                  style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: "8px", border: `1px solid ${compteType === t ? C.vifBleu : C.border}`, background: compteType === t ? `${C.vifBleu}14` : "#FBFAF6", fontSize: "12px", fontWeight: 600, color: compteType === t ? C.vifBleu : C.sub, cursor: "pointer" }}
                >
                  {t}
                </div>
              ))}
            </div>
          </div>

          {compteType === "Épargne" && (
            <FormField label="Taux d'intérêt annuel (%)" placeholder="Ex. 3.5" value={compteTauxInteret} onChange={(e) => setCompteTauxInteret(e.target.value)} />
          )}

          {compteError && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {compteError}
            </div>
          )}
          {compteSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Compte créé.
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: C.vifBleu, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
            onClick={async () => {
              if (!compteNom.trim()) { setCompteError("Le nom du compte est obligatoire."); return; }
              try {
                await creerCompteBancaire(groupId, {
                  nom: compteNom.trim(),
                  banque: compteBanque.trim(),
                  numeroCompte: compteNumero.trim(),
                  type: compteType,
                  tauxInteretAnnuel: compteType === "Épargne" ? parseFloat(compteTauxInteret) || null : null,
                });
                await rechargerComptes();
                setCompteError("");
                setCompteSuccess(true);
                setTimeout(() => {
                  setShowCreerCompte(false);
                  setCompteSuccess(false);
                }, 1200);
              } catch (e) {
                console.error("Erreur de création du compte", e);
                setCompteError(e.message || "Erreur lors de la création.");
              }
            }}
          >
            Créer le compte
          </button>
        </Modal>
      )}

      {showNouveauDepot && (
        <Modal onClose={() => setShowNouveauDepot(false)} title="Enregistrer un mouvement bancaire" icon={<Building2 />} accentColor={C.vifBleu}>
          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Compte concerné : <b>{compteActif?.nom || "—"}</b>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Type de mouvement</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {["Dépôt", "Retrait", "Frais", ...(compteActif?.type === "Épargne" ? ["Intérêt"] : [])].map((t) => (
                <div
                  key={t}
                  onClick={() => setTypeMouvementBanque(t)}
                  style={{ flex: "1 1 auto", textAlign: "center", padding: "9px 4px", borderRadius: "8px", border: `1px solid ${typeMouvementBanque === t ? C.accent2 : C.border}`, background: typeMouvementBanque === t ? C.ok : "#FBFAF6", fontSize: "12px", fontWeight: 600, color: typeMouvementBanque === t ? C.accent2 : C.sub, cursor: "pointer" }}
                >
                  {t}
                </div>
              ))}
            </div>
            {compteActif?.type !== "Épargne" && (
              <div style={{ fontSize: "10.5px", color: C.sub, marginTop: "5px" }}>
                "Intérêt" n'est disponible que pour un compte de type Épargne.
              </div>
            )}
          </div>

          <FormField label="Date de la séance" placeholder="jj/mm/aaaa" value={depotDate} onChange={(e) => setDepotDate(e.target.value)} />
          <FormField label="Montant" placeholder="Ex. 1 000 000 FCFA" value={depotMontant} onChange={(e) => setDepotMontant(e.target.value)} />

          {typeMouvementBanque === "Retrait" && (
            <FormField label="Motif du retrait" placeholder="Ex. Décaissement de prêt, versement de cagnotte..." value={depotMotif} onChange={(e) => setDepotMotif(e.target.value)} />
          )}

          {typeMouvementBanque === "Frais" && (
            <div>
              <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Catégorie de frais</label>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <select
                  value={depotCategorie}
                  onChange={(e) => setDepotCategorie(e.target.value)}
                  style={{ flex: 1, boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
                >
                  <option value="">Sélectionner une catégorie</option>
                  {categoriesFrais.map((c) => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                </select>
                <button
                  onClick={() => setShowNewCategorieFrais(!showNewCategorieFrais)}
                  style={{ background: C.ok, color: C.accent2, border: `1px solid ${C.accent2}33`, borderRadius: "9px", padding: "0 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  <Plus size={14} />
                </button>
              </div>
              {showNewCategorieFrais && (
                <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                  <input
                    value={newCategorieFraisNom}
                    onChange={(e) => setNewCategorieFraisNom(e.target.value)}
                    placeholder="Ex. Frais de dossier"
                    style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none" }}
                  />
                  <button
                    onClick={async () => {
                      if (!newCategorieFraisNom.trim()) return;
                      try {
                        const nouvelle = await creerCategorieFrais(groupId, newCategorieFraisNom.trim());
                        setCategoriesFrais([...categoriesFrais, nouvelle]);
                        setDepotCategorie(nouvelle.nom);
                        setNewCategorieFraisNom("");
                        setShowNewCategorieFrais(false);
                      } catch (e) {
                        console.error("Erreur de création de la catégorie", e);
                      }
                    }}
                    style={{ background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "8px", padding: "0 12px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Ajouter
                  </button>
                </div>
              )}
              {categoriesFrais.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                  {categoriesFrais.map((c) => (
                    <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "999px", padding: "3px 8px 3px 10px", fontSize: "11px", color: C.sub }}>
                      {c.nom}
                      <X
                        size={11}
                        style={{ cursor: "pointer" }}
                        onClick={async () => {
                          try {
                            await supprimerCategorieFrais(c.id);
                            setCategoriesFrais(categoriesFrais.filter((cat) => cat.id !== c.id));
                            if (depotCategorie === c.nom) setDepotCategorie("");
                          } catch (e) {
                            console.error("Erreur de suppression de la catégorie", e);
                          }
                        }}
                      />
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {typeMouvementBanque === "Frais" && (
            <div>
              <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Responsable(s) — 1 à 2 personnes</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {membres.filter((m) => m.statut === "actif").map((m) => (
                  <label key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={responsablesFrais.includes(m.id)}
                      onChange={() => {
                        setResponsablesFrais((prev) => {
                          if (prev.includes(m.id)) return prev.filter((id) => id !== m.id);
                          if (prev.length >= 2) return prev; // max 2
                          return [...prev, m.id];
                        });
                      }}
                    />
                    {m.nom}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: "11px", color: C.sub, marginTop: "6px" }}>
                Pas besoin de plusieurs signataires officiels pour un frais — une ou deux personnes suffisent.
              </div>
            </div>
          )}

          {(typeMouvementBanque === "Dépôt" || typeMouvementBanque === "Intérêt") ? (
            <div>
              <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>
                {typeMouvementBanque === "Intérêt" ? "Enregistré par" : "Membre effectuant le versement"}
              </label>
              <select
                value={depotMembreSimple}
                onChange={(e) => setDepotMembreSimple(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
              >
                <option value="">Sélectionner un membre</option>
                {membres.filter((m) => m.statut === "actif").map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
              {typeMouvementBanque === "Dépôt" && (
                <div style={{ fontSize: "11px", color: C.sub, marginTop: "5px" }}>
                  Pour un versement, n'importe quel membre du groupe peut être désigné.
                </div>
              )}
            </div>
          ) : typeMouvementBanque === "Retrait" ? (
            <div>
              <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Signataires (2 à 3 requis)</label>
              {signataires.length === 0 ? (
                <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
                  Aucun signataire enregistré pour ce groupe — ajoutes-en depuis les paramètres avant de faire un retrait.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {signataires.map((s) => (
                    <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", cursor: "pointer" }}>
                      <input type="checkbox" checked={signatairesChoisis.includes(s.id)} onChange={() => toggleSignataire(s.id)} />
                      {s.nom}{s.fonction ? ` — ${s.fonction}` : ""}
                    </label>
                  ))}
                </div>
              )}
              <div style={{ fontSize: "11px", color: signatairesChoisis.length >= 2 && signatairesChoisis.length <= 3 ? C.sub : C.warn, marginTop: "6px" }}>
                {signatairesChoisis.length < 2
                  ? "Sélectionnez au moins 2 signataires officiels du compte."
                  : signatairesChoisis.length > 3
                  ? "Maximum 3 signataires pour cette opération."
                  : `${signatairesChoisis.length} signataire(s) sélectionné(s).`}
              </div>
              <div style={{ fontSize: "11px", color: C.sub, marginTop: "4px" }}>
                Un retrait exige la validation de 2 à 3 signataires officiels.
              </div>
            </div>
          ) : null}

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>
              {typeMouvementBanque === "Retrait" ? "Reçu retrait" : "Reçu / justificatif"}
            </label>
            {!recuJoint ? (
              <div
                onClick={() => setRecuJoint(true)}
                style={{ border: `1.5px dashed ${C.border}`, borderRadius: "10px", padding: "16px", textAlign: "center", background: "#FBFAF6", cursor: "pointer" }}
              >
                <div style={{ fontSize: "12px", fontWeight: 600, color: C.accent2 }}>
                  + Joindre le justificatif
                </div>
                <div style={{ fontSize: "10.5px", color: C.sub, marginTop: "4px" }}>Photo ou scan remis au retour de la séance</div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "8px", border: `1px solid ${C.accent2}44`, background: C.ok, fontSize: "12.5px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", color: C.accent2, fontWeight: 600 }}><CheckCircle2 size={14} /> Reçu joint</span>
                <X size={13} color={C.sub} style={{ cursor: "pointer" }} onClick={() => setRecuJoint(false)} />
              </div>
            )}
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "6px" }}>
              Le mouvement reste "en attente du reçu" tant qu'aucun justificatif n'est joint à la ligne.
            </div>
          </div>

          {depotError && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {depotError}
            </div>
          )}
          {depotSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Mouvement enregistré — le solde du compte a été mis à jour.
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onClick={async () => {
              if (!compteActifId) { setDepotError("Sélectionnez d'abord un compte."); setDepotSuccess(false); return; }
              const montantNum = parseInt(depotMontant.replace(/[^\d]/g, ""), 10);
              if (!depotDate.trim()) { setDepotError("La date de la séance est obligatoire."); setDepotSuccess(false); return; }
              if (!montantNum || montantNum <= 0) { setDepotError("Saisissez un montant valide."); setDepotSuccess(false); return; }
              if (typeMouvementBanque === "Retrait" && !depotMotif.trim()) { setDepotError("Le motif est obligatoire pour un retrait."); setDepotSuccess(false); return; }
              if (typeMouvementBanque === "Frais" && !depotCategorie) { setDepotError("Sélectionnez une catégorie de frais."); setDepotSuccess(false); return; }
              if (typeMouvementBanque === "Frais" && responsablesFrais.length === 0) { setDepotError("Sélectionnez au moins un responsable pour ce frais."); setDepotSuccess(false); return; }
              if ((typeMouvementBanque === "Dépôt" || typeMouvementBanque === "Intérêt") && !depotMembreSimple) { setDepotError("Sélectionnez un membre."); setDepotSuccess(false); return; }
              if (typeMouvementBanque === "Retrait" && (signatairesChoisis.length < 2 || signatairesChoisis.length > 3)) {
                setDepotError("Sélectionnez entre 2 et 3 signataires.");
                setDepotSuccess(false);
                return;
              }
              const soldeActuelNum = depots.length ? parseInt(depots[0].solde.replace(/[^\d]/g, ""), 10) : 0;
              if ((typeMouvementBanque === "Retrait" || typeMouvementBanque === "Frais") && montantNum > soldeActuelNum) {
                setDepotError("Ce montant dépasse le solde actuel du compte.");
                setDepotSuccess(false);
                return;
              }
              try {
                await creerMouvementExterne(groupId, {
                  compteId: compteActifId,
                  type: typeMouvementBanque,
                  montant: montantNum,
                  dateMouvement: versDateISO(depotDate),
                  motif: depotMotif.trim(),
                  categorie: depotCategorie,
                  membreId: depotMembreSimple || null,
                  signatairesIds: typeMouvementBanque === "Frais" ? responsablesFrais : signatairesChoisis,
                  recuJoint,
                });
                await rechargerDepots();
                await rechargerComptes();
                setDepotError("");
                setDepotSuccess(true);
                setTimeout(() => {
                  setShowNouveauDepot(false);
                  setDepotSuccess(false);
                  setDepotDate(""); setDepotMontant(""); setDepotMotif(""); setDepotCategorie(""); setDepotMembreSimple("");
                  setSignatairesChoisis([]); setResponsablesFrais([]); setRecuJoint(false);
                }, 1200);
              } catch (e) {
                console.error("Erreur d'enregistrement du mouvement", e);
                setDepotError(e.message || "Erreur lors de l'enregistrement.");
                setDepotSuccess(false);
              }
            }}
          >
            Enregistrer le mouvement
          </button>
        </Modal>
      )}

      {showAmende && (
        <Modal onClose={() => setShowAmende(null)} title="Appliquer une amende de retard">
          <div style={{ background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 12px", fontSize: "12.5px" }}>
            <b>{showAmende.membre}</b> — Tour {showAmende.tour}<br />
            <span style={{ color: C.warn }}>Cotisation pas encore reçue</span>
          </div>
          <FormField label="Montant de l'amende" placeholder="Ex. 5 000 FCFA" value={amendeMontant} onChange={(e) => setAmendeMontant(e.target.value)} />
          <FormField label="Motif (optionnel)" placeholder="Ex. Cotisation non versée à la séance" value={amendeMotif} onChange={(e) => setAmendeMotif(e.target.value)} />
          {amendeError && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {amendeError}
            </div>
          )}
          <button
            onClick={async () => {
              const montantNum = parseInt(amendeMontant.replace(/[^\d]/g, ""), 10);
              if (!montantNum || montantNum <= 0) { setAmendeError("Montant invalide."); return; }
              try {
                await appliquerAmendeTontine(showAmende.tourId, showAmende.membreId, { montant: montantNum, motif: amendeMotif.trim() });

                const membre = membres.find((m) => m.id === showAmende.membreId);
                if (membre?.telephone) {
                  envoyerSMS({
                    message: msgOperation(membre.nom, "amende de retard", montantNum, undefined, amendeMotif.trim() ? `Motif : ${amendeMotif.trim()}` : undefined),
                    numeros: [membre.telephone],
                    groupId,
                    });
                }

                setAmendeMontant(""); setAmendeMotif(""); setAmendeError("");
                setShowAmende(null);
              } catch (e) {
                console.error("Erreur d'application de l'amende", e);
                setAmendeError(e.message || "Erreur lors de l'application de l'amende.");
              }
            }}
            style={{ marginTop: "6px", background: C.warn, color: "#FFF6EE", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            Appliquer l'amende
          </button>
        </Modal>
      )}

      {showEnchere && enchereTour && tontineActive && (
        <Modal onClose={() => setShowEnchere(false)} title="Enregistrer l'enchère" icon={<Gavel />} accentColor={C.vifViolet}>
          <div style={{ fontSize: "12px", color: C.sub }}>
            Tour {enchereTour.tour} — mode Enchères. Indique qui a remporté l'enchère et pour quel montant.
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Gagnant de l'enchère</label>
            <select
              value={enchereBeneficiaire}
              onChange={(e) => setEnchereBeneficiaire(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner un membre</option>
              {membres.filter((m) => m.statut === "actif").map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </div>

          <FormField label="Montant de l'enchère (commission)" placeholder="Ex. 22 500 FCFA" value={enchereMontant} onChange={(e) => setEnchereMontant(e.target.value)} />

          {(() => {
            const cagnotte = tontineActive.montantParTour * membres.filter((m) => m.statut === "actif").length;
            const montantNum = parseInt(enchereMontant.replace(/[^\d]/g, ""), 10) || 0;
            return (
              <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 11px" }}>
                Cagnotte totale estimée : <b>{fmtFCFA(cagnotte)}</b> ({fmtFCFA(tontineActive.montantParTour)} × {membres.filter((m) => m.statut === "actif").length} membres)<br />
                Montant net versé au bénéficiaire : <b style={{ color: C.vifVert }}>{fmtFCFA(Math.max(0, cagnotte - montantNum))}</b>
              </div>
            );
          })()}

          <div style={{ fontSize: "11px", color: C.vifViolet, background: `${C.vifViolet}0D`, border: `1px solid ${C.vifViolet}33`, borderRadius: "8px", padding: "8px 10px" }}>
            Ce montant d'enchère est mis de côté comme commission, redistribuée à tous les membres à la clôture du cycle.
          </div>

          {enchereErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {enchereErreur}
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: C.vifViolet, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
            onClick={async () => {
              const montantNum = parseInt(enchereMontant.replace(/[^\d]/g, ""), 10);
              if (!enchereBeneficiaire) { setEnchereErreur("Sélectionne le gagnant de l'enchère."); return; }
              if (!montantNum || montantNum <= 0) { setEnchereErreur("Saisis un montant d'enchère valide."); return; }
              const cagnotte = tontineActive.montantParTour * membres.filter((m) => m.statut === "actif").length;
              if (montantNum >= cagnotte) { setEnchereErreur("Le montant de l'enchère ne peut pas dépasser la cagnotte totale."); return; }
              try {
                await enregistrerEnchere(enchereTour.id, enchereBeneficiaire, montantNum, cagnotte);
                await rechargerTontine();
                setShowEnchere(false);
              } catch (e) {
                console.error("Erreur d'enregistrement de l'enchère", e);
                setEnchereErreur(e.message || "Erreur lors de l'enregistrement.");
              }
            }}
          >
            Enregistrer l'enchère
          </button>
        </Modal>
      )}

      {showPayout && (
        <Modal onClose={() => setShowPayout(null)} title="Verser la cagnotte">
          <div style={{ textAlign: "center", padding: "6px 0 4px" }}>
            <div style={{ width: "48px", height: "48px", margin: "0 auto 12px", borderRadius: "12px", background: C.ok, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Banknote size={22} color={C.accent2} />
            </div>
            <div style={{ fontSize: "13px", color: C.sub }}>Tour {showPayout.tour} — Bénéficiaire</div>
            <div style={{ fontSize: "17px", fontWeight: 700, margin: "2px 0 6px" }}>{showPayout.beneficiaire}</div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: C.accent2 }}>{showPayout.montant}</div>
          </div>
          <div style={{ fontSize: "12px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 12px" }}>
            Mode de ce tour : <b>{showPayout.mode}</b>. Confirmez que la cagnotte a bien été remise au bénéficiaire (espèces ou Mobile Money) pour clôturer ce tour.
          </div>
          <button
            onClick={async () => {
              try {
                await verserTour(tontineActive.id, showPayout.id, showPayout.tour);
                await rechargerTontine();

                const beneficiaire = membres.find((m) => m.id === showPayout.beneficiaireId);
                if (beneficiaire?.telephone) {
                  envoyerSMS({
                    message: `Félicitations ${beneficiaire.nom} ! Votre cagnotte tontine du tour ${showPayout.tour} (${showPayout.montant}) vous a été versée.`,
                    numeros: [beneficiaire.telephone],
                    groupId,
                    });
                }

                setShowPayout(null);
              } catch (e) {
                console.error("Erreur lors du versement", e);
              }
            }}
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            Confirmer le versement
          </button>
        </Modal>
      )}

      {showAjouterMembreCycle && tontineActive && (
        <Modal onClose={() => setShowAjouterMembreCycle(false)} title="Ajouter un membre au cycle">
          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Le mode de distribution des tours déjà planifiés ne change pas. Si des tours sont déjà clôturés, le nouveau membre rattrape les cotisations passées avec un montant de rappel.
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Membre à ajouter</label>
            <select
              value={ajoutMembreId}
              onChange={(e) => setAjoutMembreId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner un membre</option>
              {membres.filter((m) => m.statut === "actif").map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </div>

          {tours.filter((t) => t.statut === "clôturé").length > 0 ? (
            <>
              <FormField label={`Montant de rappel (${tours.filter((t) => t.statut === "clôturé").length} tour(s) déjà clôturé(s))`} placeholder="Ex. 150 000 FCFA" value={ajoutMontantRappel} onChange={(e) => setAjoutMontantRappel(e.target.value)} />
              <div style={{ fontSize: "11px", color: C.sub, marginTop: "-6px" }}>
                Ce montant sera réparti automatiquement sur les {tours.filter((t) => t.statut === "clôturé").length} tour(s) déjà clôturé(s).
              </div>
            </>
          ) : (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px" }}>
              Aucun tour clôturé pour l'instant — le membre rejoint directement, sans rappel à verser.
            </div>
          )}

          {ajoutErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {ajoutErreur}
            </div>
          )}
          {ajoutSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Membre ajouté au cycle.
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onClick={async () => {
              if (!ajoutMembreId) { setAjoutErreur("Sélectionne un membre."); setAjoutSuccess(false); return; }
              const toursClotures = tours.filter((t) => t.statut === "clôturé");
              const montantNum = parseFloat(ajoutMontantRappel.replace(/[^\d.]/g, "")) || 0;
              if (toursClotures.length > 0 && montantNum <= 0) {
                setAjoutErreur("Un montant de rappel est requis puisque des tours sont déjà clôturés.");
                setAjoutSuccess(false);
                return;
              }
              try {
                await ajouterMembreAuCycle(tontineActive.id, ajoutMembreId, montantNum, toursClotures.map((t) => ({ id: t.id })));
                await rechargerTontine();
                setAjoutSuccess(true);
                setAjoutErreur("");
                setTimeout(() => {
                  setShowAjouterMembreCycle(false);
                  setAjoutSuccess(false);
                }, 1400);
              } catch (e) {
                console.error("Erreur d'ajout du membre au cycle", e);
                setAjoutErreur(e.message || "Erreur lors de l'ajout.");
                setAjoutSuccess(false);
              }
            }}
          >
            Ajouter au cycle
          </button>
        </Modal>
      )}

      {showRedistribution && (
        <Modal onClose={() => setShowRedistribution(false)} title="Redistribuer la commission d'enchères" icon={<Gavel />} accentColor={C.vifRose}>
          {redistributionChargement ? (
            <div style={{ fontSize: "13px", color: C.sub, textAlign: "center", padding: "20px 0" }}>Calcul en cours...</div>
          ) : !redistributionApercu ? (
            <div style={{ fontSize: "12px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "10px 12px" }}>{redistributionErreur || "Erreur de chargement."}</div>
          ) : redistributionApercu.commissionTotale === 0 ? (
            <div style={{ fontSize: "12.5px", color: C.sub, textAlign: "center", padding: "10px 0" }}>Aucune commission d'enchères à redistribuer sur ce cycle.</div>
          ) : (
            <>
              <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
                Commission totale : <b>{fmtFCFA(redistributionApercu.commissionTotale)}</b> — répartie proportionnellement au nombre de tours où chaque membre a cotisé ({redistributionApercu.totalCotisations} cotisation(s) au total sur ce cycle).
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {redistributionApercu.membres.map((m) => (
                  <div key={m.membreId} style={{ display: "flex", justifyContent: "space-between", background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px", fontSize: "12px" }}>
                    <div>
                      <b>{m.nom}</b>
                      <div style={{ color: C.sub, fontSize: "11px" }}>{m.nbCotisations} cotisation(s) sur ce cycle</div>
                    </div>
                    <b style={{ color: C.accent2 }}>{fmtFCFA(m.part)}</b>
                  </div>
                ))}
              </div>

              {redistributionErreur && (
                <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
                  {redistributionErreur}
                </div>
              )}
              {redistributionSuccess && (
                <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <CheckCircle2 size={14} /> Commission redistribuée avec succès.
                </div>
              )}

              {!redistributionSuccess && (
                <button
                  disabled={redistributionEnCours}
                  style={{ marginTop: "6px", background: C.vifRose, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: redistributionEnCours ? "default" : "pointer" }}
                  onClick={async () => {
                    setRedistributionEnCours(true);
                    setRedistributionErreur("");
                    try {
                      await redistribuerCommission(tontineActive.id, redistributionApercu.membres);
                      redistributionApercu.membres.forEach((m) => {
                        if (m.telephone && m.part > 0) {
                          envoyerSMS({
                            message: `Bonjour ${m.nom}, votre part de la commission d'enchères "${tontineActive.nom}" est de ${fmtFCFA(m.part)} (${m.nbCotisations} tour(s) cotisé(s)).`,
                            numeros: [m.telephone],
                            groupId,
                            });
                        }
                      });
                      setRedistributionSuccess(true);
                    } catch (e) {
                      console.error("Erreur de redistribution", e);
                      setRedistributionErreur(e.message || "Erreur lors de la redistribution.");
                    } finally {
                      setRedistributionEnCours(false);
                    }
                  }}
                >
                  {redistributionEnCours ? "Redistribution..." : "Valider la redistribution"}
                </button>
              )}
            </>
          )}
        </Modal>
      )}

      {showTypesAmendesSeance && (
        <Modal onClose={() => setShowTypesAmendesSeance(false)} title="Types d'amendes de séance" icon={<AlertTriangle />} accentColor={C.warn}>
          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Chaque groupe fixe ses propres amendes selon son règlement intérieur (ex. Absence non excusée, Retard).
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {typesAmendesSeance.map((t) => (
              <div key={t.id} style={{ padding: "10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>{t.nom}</span>
                  <X
                    size={14}
                    color={C.sub}
                    style={{ cursor: "pointer" }}
                    onClick={async () => {
                      try {
                        await supprimerTypeAmendeSeance(t.id);
                        await rechargerSeances();
                      } catch (e) {
                        console.error("Erreur de suppression du type d'amende", e);
                      }
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    value={montantAmendeInputs[t.id] ?? String(t.montant || "")}
                    onChange={(e) => setMontantAmendeInputs({ ...montantAmendeInputs, [t.id]: e.target.value })}
                    placeholder="Montant (FCFA)"
                    style={{ flex: 1, boxSizing: "border-box", padding: "8px 9px", borderRadius: "7px", border: `1px solid ${C.border}`, background: "#FFFFFF", fontSize: "12px", outline: "none" }}
                  />
                  <button
                    onClick={async () => {
                      const val = parseInt((montantAmendeInputs[t.id] || "").replace(/[^\d]/g, ""), 10) || 0;
                      try {
                        await modifierTypeAmendeSeance(t.id, val);
                        await rechargerSeances();
                      } catch (e) {
                        console.error("Erreur de mise à jour du montant", e);
                      }
                    }}
                    style={{ background: "transparent", border: `1px solid ${C.warn}66`, borderRadius: "7px", padding: "0 12px", fontSize: "11.5px", fontWeight: 600, color: C.warn, cursor: "pointer" }}
                  >
                    Fixer
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em" }}>Nouveau type d'amende</div>
          <FormField label="Nom" placeholder="Ex. Absence non excusée" value={newTypeAmendeNom} onChange={(e) => setNewTypeAmendeNom(e.target.value)} />
          <FormField label="Montant par défaut (FCFA)" placeholder="Ex. 1 000 FCFA" value={newTypeAmendeMontant} onChange={(e) => setNewTypeAmendeMontant(e.target.value)} />
          <button
            onClick={async () => {
              if (!newTypeAmendeNom.trim()) return;
              try {
                await creerTypeAmendeSeance(groupId, newTypeAmendeNom.trim(), parseInt(newTypeAmendeMontant.replace(/[^\d]/g, ""), 10) || 0);
                setNewTypeAmendeNom("");
                setNewTypeAmendeMontant("");
                await rechargerSeances();
              } catch (e) {
                console.error("Erreur de création du type d'amende", e);
              }
            }}
            style={{ background: C.warn, color: "#FFFFFF", border: "none", borderRadius: "8px", padding: "10px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}
          >
            Ajouter ce type d'amende
          </button>
        </Modal>
      )}

      {showCreerSeance && (
        <Modal onClose={() => setShowCreerSeance(false)} title="Créer une séance" icon={<Calendar />} accentColor={C.vifBleu}>
          <FormField label="Date de la séance" placeholder="jj/mm/aaaa" value={seanceDate} onChange={(e) => setSeanceDate(e.target.value)} />
          <FormField label="Lieu" placeholder="Ex. Domicile du président" value={seanceLieu} onChange={(e) => setSeanceLieu(e.target.value)} />
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Ordre du jour</label>
            <textarea
              value={seanceOrdreDuJour}
              onChange={(e) => setSeanceOrdreDuJour(e.target.value)}
              placeholder="Ex. Cotisations du mois, point sur les prêts en cours, questions diverses..."
              rows={3}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none", resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
          {seanceCreationErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {seanceCreationErreur}
            </div>
          )}
          <button
            style={{ marginTop: "6px", background: C.vifBleu, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
            onClick={async () => {
              const dateISO = versDateISO(seanceDate);
              if (!dateISO) { setSeanceCreationErreur("Date invalide (jj/mm/aaaa)."); return; }
              try {
                await creerSeance(groupId, { date: dateISO, lieu: seanceLieu.trim(), ordreDuJour: seanceOrdreDuJour.trim() });
                await rechargerSeances();
                setShowCreerSeance(false);
              } catch (e) {
                console.error("Erreur de création de la séance", e);
                setSeanceCreationErreur(e.message || "Erreur lors de la création.");
              }
            }}
          >
            Créer la séance
          </button>
        </Modal>
      )}

      {showDetailSeance && (
        <Modal onClose={() => { setShowDetailSeance(null); setPresencesSeance({}); setAmendesSeanceList([]); }} title={`Séance du ${showDetailSeance.date}`} icon={<Calendar />} accentColor={C.vifBleu}>
          {showDetailSeance.lieu && (
            <div style={{ fontSize: "12px", color: C.sub }}>Lieu : {showDetailSeance.lieu}</div>
          )}
          {showDetailSeance.ordreDuJour && (
            <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
              <b>Ordre du jour :</b> {showDetailSeance.ordreDuJour}
            </div>
          )}

          <div style={{ fontSize: "11px", fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em" }}>Présence</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {membres.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600 }}>{m.nom}</span>
                <div style={{ display: "flex", gap: "4px" }}>
                  {["présent", "absent", "excusé"].map((opt) => (
                    <div
                      key={opt}
                      onClick={() => setPresencesSeance({ ...presencesSeance, [m.id]: opt })}
                      style={{ padding: "5px 9px", borderRadius: "6px", border: `1px solid ${presencesSeance[m.id] === opt ? C.vifBleu : C.border}`, background: presencesSeance[m.id] === opt ? `${C.vifBleu}14` : "#FBFAF6", fontSize: "10.5px", fontWeight: 600, color: presencesSeance[m.id] === opt ? C.vifBleu : C.sub, cursor: "pointer" }}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={async () => {
              try {
                await enregistrerPresences(showDetailSeance.id, presencesSeance);
                await rechargerSeances();
              } catch (e) {
                console.error("Erreur d'enregistrement des présences", e);
              }
            }}
            style={{ background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "8px", padding: "9px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}
          >
            Enregistrer la présence
          </button>

          <div style={{ fontSize: "11px", fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: "6px" }}>Amendes</div>
          {amendesSeanceList.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {amendesSeanceList.map((a) => {
                const membre = membres.find((m) => m.id === a.membreId);
                const enPaiement = paiementAmendeId === a.id;
                return (
                  <div key={a.id} style={{ background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                      <span>{membre?.nom || "—"} — {a.typeNom}</span>
                      <b>{fmtFCFA(a.montant)}</b>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                      {a.statut === "payée" ? (
                        <Badge bg={C.ok} fg={C.accent2}>Payée ({a.modePaiement}, {a.datePaiement})</Badge>
                      ) : (
                        <>
                          <Badge bg={C.warnBg} fg={C.warn}>Non payée</Badge>
                          {!enPaiement && (
                            <button
                              onClick={() => { setPaiementAmendeId(a.id); setPaiementMode("espèces"); setPaiementEpargneId(""); }}
                              style={{ background: "transparent", color: C.accent2, border: `1px solid ${C.accent2}66`, borderRadius: "6px", padding: "4px 8px", fontSize: "10.5px", fontWeight: 600, cursor: "pointer" }}
                            >
                              Marquer payée
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {enPaiement && (
                      <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {["espèces", "déduit banque"].map((mode) => (
                            <div
                              key={mode}
                              onClick={() => setPaiementMode(mode)}
                              style={{ flex: 1, textAlign: "center", padding: "6px 4px", borderRadius: "6px", border: `1px solid ${paiementMode === mode ? C.accent2 : C.border}`, background: paiementMode === mode ? C.ok : "#FFFFFF", fontSize: "10.5px", fontWeight: 600, color: paiementMode === mode ? C.accent2 : C.sub, cursor: "pointer" }}
                            >
                              {mode === "espèces" ? "Espèces" : "Déduit banque"}
                            </div>
                          ))}
                        </div>
                        {paiementMode === "déduit banque" && (
                          <select
                            value={paiementEpargneId}
                            onChange={(e) => setPaiementEpargneId(e.target.value)}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: "6px", border: `1px solid ${C.border}`, background: "#FFFFFF", fontSize: "11px", outline: "none" }}
                          >
                            <option value="">Sélectionner l'épargne à débiter</option>
                            {epargnes.map((ep) => <option key={ep.id} value={ep.id}>{ep.nom} ({fmtFCFA(ep.solde)})</option>)}
                          </select>
                        )}
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() => setPaiementAmendeId(null)}
                            style={{ flex: 1, background: "transparent", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px", fontSize: "11px", fontWeight: 600, color: C.sub, cursor: "pointer" }}
                          >
                            Annuler
                          </button>
                          <button
                            disabled={paiementEnCours}
                            onClick={async () => {
                              if (paiementMode === "déduit banque" && !paiementEpargneId) return;
                              setPaiementEnCours(true);
                              try {
                                await payerAmendeSeance(groupId, a.id, a.membreId, a.montant, paiementMode, paiementEpargneId || null);
                                const amendes = await fetchAmendesSeance(showDetailSeance.id);
                                setAmendesSeanceList(amendes);
                                await rechargerSeances();
                                if (paiementMode === "déduit banque") await rechargerEpargnes();
                                if (membre?.telephone) {
                                  envoyerSMS({
                                    message: msgOperation(membre.nom, "paiement d'amende", a.montant, undefined, paiementMode === "espèces" ? "Réglé en espèces" : "Déduit de votre épargne"),
                                    numeros: [membre.telephone],
                                    groupId,
                                    });
                                }
                                setPaiementAmendeId(null);
                              } catch (e) {
                                console.error("Erreur d'enregistrement du paiement", e);
                              } finally {
                                setPaiementEnCours(false);
                              }
                            }}
                            style={{ flex: 1, background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "6px", padding: "7px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                          >
                            {paiementEnCours ? "..." : "Confirmer"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <select
              value={amendeSeanceMembreId}
              onChange={(e) => setAmendeSeanceMembreId(e.target.value)}
              style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12px", outline: "none" }}
            >
              <option value="">Membre</option>
              {membres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
            <select
              value={amendeSeanceTypeId}
              onChange={(e) => {
                setAmendeSeanceTypeId(e.target.value);
                const type = typesAmendesSeance.find((t) => t.id === e.target.value);
                if (type) setAmendeSeanceMontant(String(type.montant));
              }}
              style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12px", outline: "none" }}
            >
              <option value="">Type d'amende</option>
              {typesAmendesSeance.map((t) => <option key={t.id} value={t.id}>{t.nom} ({fmtFCFA(t.montant)})</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              value={amendeSeanceMontant}
              onChange={(e) => setAmendeSeanceMontant(e.target.value)}
              placeholder="Montant"
              style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12px", outline: "none" }}
            />
            <button
              onClick={async () => {
                const montant = parseInt(amendeSeanceMontant.replace(/[^\d]/g, ""), 10);
                if (!amendeSeanceMembreId || !montant) return;
                try {
                  await appliquerAmendeSeance(showDetailSeance.id, amendeSeanceMembreId, amendeSeanceTypeId || null, montant);
                  const amendes = await fetchAmendesSeance(showDetailSeance.id);
                  setAmendesSeanceList(amendes);
                  const membre = membres.find((m) => m.id === amendeSeanceMembreId);
                  if (membre?.telephone) {
                    envoyerSMS({
                      message: msgOperation(membre.nom, "amende de séance", montant, undefined, typesAmendesSeance.find((t) => t.id === amendeSeanceTypeId)?.nom),
                      numeros: [membre.telephone],
                      groupId,
                      });
                  }
                  setAmendeSeanceMembreId(""); setAmendeSeanceTypeId(""); setAmendeSeanceMontant("");
                } catch (e) {
                  console.error("Erreur d'application de l'amende", e);
                }
              }}
              style={{ background: C.warn, color: "#FFFFFF", border: "none", borderRadius: "8px", padding: "0 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              Appliquer
            </button>
          </div>

          <div style={{ fontSize: "11px", fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: "6px" }}>Procès-verbal / compte-rendu</div>
          <textarea
            value={seanceCompteRendu}
            onChange={(e) => setSeanceCompteRendu(e.target.value)}
            placeholder="Résumé des décisions prises, points discutés..."
            rows={4}
            style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none", resize: "vertical", fontFamily: "inherit" }}
          />
          <button
            onClick={async () => {
              try {
                await enregistrerCompteRendu(showDetailSeance.id, seanceCompteRendu.trim());
                await rechargerSeances();
                setShowDetailSeance(null);
              } catch (e) {
                console.error("Erreur d'enregistrement du compte-rendu", e);
              }
            }}
            style={{ background: C.vifBleu, color: "#FFFFFF", border: "none", borderRadius: "8px", padding: "10px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}
          >
            Enregistrer et clôturer la séance
          </button>
        </Modal>
      )}

      {showCreerRafraichissement && (
        <Modal onClose={() => setShowCreerRafraichissement(false)} title="Enregistrer un rafraîchissement" icon={<ShoppingCart />} accentColor={C.vifOr}>
          <FormField label="Date" placeholder="jj/mm/aaaa" value={rafraDate} onChange={(e) => setRafraDate(e.target.value)} />

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Séance liée (optionnel)</label>
            <select
              value={rafraSeanceId}
              onChange={(e) => setRafraSeanceId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Aucune</option>
              {seancesList.map((s) => <option key={s.id} value={s.id}>{s.date}{s.lieu ? ` — ${s.lieu}` : ""}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Responsable de l'achat</label>
            <select
              value={rafraResponsableId}
              onChange={(e) => setRafraResponsableId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner un membre</option>
              {membres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </div>

          <FormField label="Montant par membre participant (FCFA)" placeholder="Ex. 1 000" value={rafraMontantParMembre} onChange={(e) => setRafraMontantParMembre(e.target.value)} />

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Membres participants</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "180px", overflowY: "auto" }}>
              {membres.filter((m) => m.statut === "actif").map((m) => (
                <label key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!rafraParticipants[m.id]}
                    onChange={(e) => {
                      const val = parseInt(rafraMontantParMembre.replace(/[^\d]/g, ""), 10) || 0;
                      setRafraParticipants((prev) => {
                        const copie = { ...prev };
                        if (e.target.checked) copie[m.id] = val;
                        else delete copie[m.id];
                        return copie;
                      });
                    }}
                  />
                  {m.nom}
                </label>
              ))}
            </div>
          </div>

          <FormField label="Montant de la facture réelle (FCFA)" placeholder="Ex. 8 500" value={rafraFacture} onChange={(e) => setRafraFacture(e.target.value)} />

          {(() => {
            const collecte = Object.values(rafraParticipants).reduce((s, v) => s + v, 0);
            const facture = parseInt(rafraFacture.replace(/[^\d]/g, ""), 10) || 0;
            const reliquat = collecte - facture;
            return (
              <div style={{ fontSize: "12px", background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Collecté</span><b>{fmtFCFA(collecte)}</b></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Facture</span><b>{fmtFCFA(facture)}</b></div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", paddingTop: "4px", borderTop: `1px solid ${C.border}` }}>
                  <span>Reliquat {reliquat < 0 ? "(caisse en débit)" : "(vers la caisse)"}</span>
                  <b style={{ color: reliquat >= 0 ? C.accent2 : C.warn }}>{reliquat >= 0 ? "+" : ""}{fmtFCFA(reliquat)}</b>
                </div>
              </div>
            );
          })()}

          {rafraErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {rafraErreur}
            </div>
          )}

          <button
            disabled={rafraEnCours}
            style={{ marginTop: "6px", background: C.vifOr, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: rafraEnCours ? "default" : "pointer" }}
            onClick={async () => {
              const dateISO = versDateISO(rafraDate);
              if (!dateISO) { setRafraErreur("Date invalide (jj/mm/aaaa)."); return; }
              const participants = Object.entries(rafraParticipants).map(([membreId, montant]) => ({ membreId, montant }));
              if (participants.length === 0) { setRafraErreur("Sélectionne au moins un participant."); return; }
              const facture = parseInt(rafraFacture.replace(/[^\d]/g, ""), 10);
              if (!facture) { setRafraErreur("Saisis le montant de la facture."); return; }

              setRafraEnCours(true);
              setRafraErreur("");
              try {
                await creerRafraichissement(groupId, {
                  seanceId: rafraSeanceId || null,
                  montantParMembre: parseInt(rafraMontantParMembre.replace(/[^\d]/g, ""), 10) || 1000,
                  participants,
                  montantFacture: facture,
                  responsableId: rafraResponsableId || null,
                  date: dateISO,
                });
                await rechargerDepenses();
                setShowCreerRafraichissement(false);
              } catch (e) {
                console.error("Erreur d'enregistrement du rafraîchissement", e);
                setRafraErreur(e.message || "Erreur lors de l'enregistrement.");
              } finally {
                setRafraEnCours(false);
              }
            }}
          >
            {rafraEnCours ? "Enregistrement..." : "Enregistrer"}
          </button>
        </Modal>
      )}

      {showTypesDepenses && (
        <Modal onClose={() => setShowTypesDepenses(false)} title="Types de dépenses" icon={<ShoppingCart />} accentColor={C.vifBleu}>
          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Crée les catégories de dépenses propres à ton groupe (ex. Fournitures, Transport, Communication).
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {typesDepenses.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6" }}>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>{t.nom}</span>
                <X
                  size={14}
                  color={C.sub}
                  style={{ cursor: "pointer" }}
                  onClick={async () => {
                    try {
                      await supprimerTypeDepense(t.id);
                      await rechargerDepenses();
                    } catch (e) {
                      console.error("Erreur de suppression du type de dépense", e);
                    }
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              value={newTypeDepenseNom}
              onChange={(e) => setNewTypeDepenseNom(e.target.value)}
              placeholder="Ex. Fournitures de bureau"
              style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none" }}
            />
            <button
              onClick={async () => {
                if (!newTypeDepenseNom.trim()) return;
                try {
                  await creerTypeDepense(groupId, newTypeDepenseNom.trim());
                  setNewTypeDepenseNom("");
                  await rechargerDepenses();
                } catch (e) {
                  console.error("Erreur de création du type de dépense", e);
                }
              }}
              style={{ background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "8px", padding: "0 14px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}
            >
              Ajouter
            </button>
          </div>
        </Modal>
      )}

      {showCreerDepense && (
        <Modal onClose={() => setShowCreerDepense(false)} title="Enregistrer une dépense" icon={<ShoppingCart />} accentColor={C.warn}>
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Catégorie</label>
            <select
              value={depenseTypeId}
              onChange={(e) => setDepenseTypeId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner une catégorie</option>
              {typesDepenses.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
            </select>
          </div>

          <FormField label="Montant (FCFA)" placeholder="Ex. 5 000" value={depenseMontant} onChange={(e) => setDepenseMontant(e.target.value)} />
          <FormField label="Date" placeholder="jj/mm/aaaa" value={depenseDate} onChange={(e) => setDepenseDate(e.target.value)} />
          <FormField label="Motif" placeholder="Ex. Achat de cahiers de compte" value={depenseMotif} onChange={(e) => setDepenseMotif(e.target.value)} />

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Source à débiter</label>
            <select
              value={depenseSourceType}
              onChange={(e) => { setDepenseSourceType(e.target.value); setDepenseSourceId(""); }}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner une source</option>
              <option value="epargne">Épargne (banque)</option>
              <option value="compte_externe">Compte bancaire externe</option>
              <option value="caisse_amendes">Caisse des amendes ({fmtFCFA(soldeCaisseAmendes)})</option>
              <option value="caisse_rafraichissement">Caisse reliquat boisson ({fmtFCFA(soldeCaisseRafraichissement)})</option>
            </select>
          </div>

          {depenseSourceType === "epargne" && (
            <select
              value={depenseSourceId}
              onChange={(e) => setDepenseSourceId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner l'épargne</option>
              {epargnes.map((ep) => <option key={ep.id} value={ep.id}>{ep.nom} ({fmtFCFA(ep.solde)})</option>)}
            </select>
          )}
          {depenseSourceType === "compte_externe" && (
            <select
              value={depenseSourceId}
              onChange={(e) => setDepenseSourceId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner le compte</option>
              {comptesBancaires.map((c) => <option key={c.id} value={c.id}>{c.nom} ({fmtFCFA(c.solde)})</option>)}
            </select>
          )}

          {depenseErreur && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {depenseErreur}
            </div>
          )}

          <button
            disabled={depenseEnCours}
            style={{ marginTop: "6px", background: C.warn, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: depenseEnCours ? "default" : "pointer" }}
            onClick={async () => {
              const montant = parseInt(depenseMontant.replace(/[^\d]/g, ""), 10);
              const dateISO = versDateISO(depenseDate);
              if (!montant) { setDepenseErreur("Saisis un montant valide."); return; }
              if (!dateISO) { setDepenseErreur("Date invalide (jj/mm/aaaa)."); return; }
              if (!depenseSourceType) { setDepenseErreur("Sélectionne la source à débiter."); return; }
              if ((depenseSourceType === "epargne" || depenseSourceType === "compte_externe") && !depenseSourceId) {
                setDepenseErreur("Sélectionne le compte précis à débiter.");
                return;
              }
              setDepenseEnCours(true);
              setDepenseErreur("");
              try {
                await creerDepense(groupId, {
                  typeDepenseId: depenseTypeId || null,
                  montant,
                  date: dateISO,
                  motif: depenseMotif.trim(),
                  sourceType: depenseSourceType,
                  sourceId: depenseSourceId || null,
                });
                await rechargerDepenses();
                if (depenseSourceType === "epargne") await rechargerEpargnes();
                if (depenseSourceType === "compte_externe") await rechargerComptes();
                setShowCreerDepense(false);
              } catch (e) {
                console.error("Erreur d'enregistrement de la dépense", e);
                setDepenseErreur(e.message || "Erreur lors de l'enregistrement.");
              } finally {
                setDepenseEnCours(false);
              }
            }}
          >
            {depenseEnCours ? "Enregistrement..." : "Enregistrer la dépense"}
          </button>
        </Modal>
      )}

      {showCreateTontine && (
        <Modal onClose={() => setShowCreateTontine(false)} title="Créer une tontine" icon={<Banknote />} accentColor={C.vifOr}>
          <FormField label="Nom de la tontine" placeholder="Ex. Tontine des Bâtisseurs — Cycle 2" value={tontineNom} onChange={(e) => setTontineNom(e.target.value)} />
          <FormField label="Montant cotisé par tour" placeholder="Ex. 75 000 FCFA" value={tontineMontant} onChange={(e) => setTontineMontant(e.target.value)} />
          <div style={{ fontSize: "11px", color: C.vifVert, marginTop: "-4px", display: "flex", alignItems: "center", gap: "5px", fontWeight: 600 }}>
            <Users size={13} /> {membres.filter((m) => m.statut === "actif").length} membre(s) actif(s) participent automatiquement, désignés par rotation.
          </div>

          <div>
            <button
              onClick={() => setShowPartsDetail(!showPartsDetail)}
              style={{ background: "transparent", border: "none", padding: 0, fontSize: "11.5px", color: C.vifBleu, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
            >
              <Repeat size={12} /> {showPartsDetail ? "Masquer" : "Un membre prend plusieurs parts ?"}
            </button>
            {showPartsDetail && (
              <div style={{ marginTop: "8px", background: `${C.vifBleu}0D`, border: `1px solid ${C.vifBleu}33`, borderRadius: "10px", padding: "10px" }}>
                <div style={{ fontSize: "10.5px", color: C.sub, marginBottom: "8px" }}>
                  Un membre avec plusieurs parts cotise et reçoit plusieurs fois dans ce même cycle.
                </div>
                {membres.filter((m) => m.statut === "actif").map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                    <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{m.nom}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button onClick={() => ajusterParts(m.id, -1)} style={{ width: "22px", height: "22px", borderRadius: "6px", border: `1px solid ${C.border}`, background: "#FFFFFF", cursor: "pointer", fontSize: "13px", lineHeight: 1 }}>−</button>
                      <span style={{ fontSize: "12.5px", fontWeight: 700, color: C.vifBleu, minWidth: "14px", textAlign: "center" }}>{partsParMembre[m.id] || 1}</span>
                      <button onClick={() => ajusterParts(m.id, 1)} style={{ width: "22px", height: "22px", borderRadius: "6px", border: `1px solid ${C.border}`, background: "#FFFFFF", cursor: "pointer", fontSize: "13px", lineHeight: 1 }}>+</button>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: "10.5px", color: C.sub, marginTop: "6px" }}>
                  Total des parts : <b>{membres.filter((m) => m.statut === "actif").reduce((s, m) => s + (partsParMembre[m.id] || 1), 0)}</b> — idéalement égal au nombre de séances ci-dessous, pour que chaque part reçoive un tour.
                </div>
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
              <Repeat size={13} color={C.vifViolet} /> Mode de distribution actuel
            </label>
            <select
              value={newMode}
              onChange={(e) => setNewMode(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "8px", border: `1.5px solid ${C.vifViolet}`, background: `${C.vifViolet}14`, fontSize: "13px", outline: "none", color: C.vifViolet, fontWeight: 700 }}
            >
              <option>Ordre fixe</option>
              <option>Désignation</option>
              <option>Enchères</option>
            </select>
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "5px" }}>
              S'applique automatiquement à chaque date ajoutée ci-dessous, jusqu'à ce que tu le changes.
            </div>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
              <Calendar size={13} color={C.vifOr} /> Dates de séance
            </label>

            <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
              {[{ key: "manuel", label: "Ajout manuel" }, { key: "auto", label: "Génération automatique" }].map((o) => (
                <div
                  key={o.key}
                  onClick={() => setModeSaisie(o.key)}
                  style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: "8px", border: `1px solid ${modeSaisie === o.key ? C.accent2 : C.border}`, background: modeSaisie === o.key ? C.ok : "#FBFAF6", fontSize: "11.5px", fontWeight: 600, color: modeSaisie === o.key ? C.accent2 : C.sub, cursor: "pointer" }}
                >
                  {o.label}
                </div>
              ))}
            </div>

            {modeSaisie === "auto" && (
              <div style={{ background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px", marginBottom: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <input value={autoDateDebut} onChange={(e) => setAutoDateDebut(e.target.value)} placeholder="Début jj/mm/aaaa" style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FFFFFF", fontSize: "12.5px", outline: "none" }} />
                  <input value={autoDateFin} onChange={(e) => setAutoDateFin(e.target.value)} placeholder="Fin jj/mm/aaaa" style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FFFFFF", fontSize: "12.5px", outline: "none" }} />
                </div>

                <select value={autoJourSemaine} onChange={(e) => setAutoJourSemaine(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FFFFFF", fontSize: "12.5px", outline: "none" }}>
                  {JOURS_SEMAINE.map((j, idx) => <option key={idx} value={idx}>{j}</option>)}
                </select>

                <select value={autoFrequence} onChange={(e) => setAutoFrequence(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FFFFFF", fontSize: "12.5px", outline: "none" }}>
                  <option value="chaque_semaine">Chaque semaine</option>
                  <option value="toutes_2_semaines">Toutes les 2 semaines</option>
                  <option value="mensuel_occurrences">Occurrences précises du mois</option>
                </select>

                {autoFrequence === "mensuel_occurrences" && (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {[{ v: "1", l: "1re" }, { v: "2", l: "2e" }, { v: "3", l: "3e" }, { v: "4", l: "4e" }, { v: "dernier", l: "Dernier" }].map((o) => (
                      <div
                        key={o.v}
                        onClick={() => toggleOccurrence(o.v)}
                        style={{ padding: "6px 10px", borderRadius: "7px", border: `1px solid ${autoOccurrences.includes(o.v) ? C.accent2 : C.border}`, background: autoOccurrences.includes(o.v) ? C.ok : "#FFFFFF", fontSize: "11.5px", fontWeight: 600, color: autoOccurrences.includes(o.v) ? C.accent2 : C.sub, cursor: "pointer" }}
                      >
                        {o.l}
                      </div>
                    ))}
                  </div>
                )}

                {autoErreur && (
                  <div style={{ fontSize: "11px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "7px 9px" }}>
                    {autoErreur}
                  </div>
                )}

                <button
                  onClick={genererDatesAuto}
                  style={{ background: C.vifOr, color: "#FFFFFF", border: "none", borderRadius: "8px", padding: "9px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  <Calendar size={14} /> Générer les dates avec le mode "{newMode}"
                </button>
              </div>
            )}

            {seances.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", marginBottom: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px" }}>
                  <span style={{ fontWeight: 600 }}>{s.date}</span>
                  <Badge bg={`${C.vifViolet}1A`} fg={C.vifViolet}>{s.mode}</Badge>
                </div>
                <X size={14} color={C.sub} style={{ cursor: "pointer" }} onClick={() => removeSeance(i)} />
              </div>
            ))}

            {modeSaisie === "manuel" && (
            <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
              <input
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                placeholder="jj/mm/aaaa"
                style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none" }}
              />
              <button
                onClick={addSeance}
                style={{ background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "8px", padding: "0 12px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}
              >
                <Plus size={14} />
              </button>
            </div>
            )}
          </div>
          {seances.length > 0 && (
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "-4px" }}>
              La tontine débutera le <b>{seances.slice().sort((a, b) => versDateISO(a.date).localeCompare(versDateISO(b.date)))[0].date}</b> (date de la première séance).
            </div>
          )}

          {tontineError && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {tontineError}
            </div>
          )}
          {tontineSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Tontine créée — {seances.length} tour(s) généré(s) dans le tableau.
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: `linear-gradient(135deg, ${C.vifOr}, ${C.accent2})`, color: "#FFFFFF", border: "none", borderRadius: "10px", padding: "13px", fontSize: "13.5px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}
            onClick={async () => {
              if (!tontineNom.trim()) { setTontineError("Le nom de la tontine est obligatoire."); setTontineSuccess(false); return; }
              if (!tontineMontant.trim()) { setTontineError("Le montant cotisé par tour est obligatoire."); setTontineSuccess(false); return; }
              if (seances.length === 0) { setTontineError("Ajoutez au moins une date de séance."); setTontineSuccess(false); return; }
              const montantNum = parseInt(tontineMontant.replace(/[^\d]/g, ""), 10);
              if (!montantNum || montantNum <= 0) { setTontineError("Montant invalide."); setTontineSuccess(false); return; }
              try {
                const membresActifs = membres.filter((m) => m.statut === "actif");
                const rotationAvecParts = construireRotationAvecParts(membresActifs);
                const seancesISO = seances.map((s) => ({ ...s, date: versDateISO(s.date) }));
                const dateDebutAuto = seancesISO.length
                  ? seancesISO.slice().sort((a, b) => a.date.localeCompare(b.date))[0].date
                  : null;
                await creerTontine(groupId, {
                  nom: tontineNom.trim(),
                  montantParTour: montantNum,
                  seances: seancesISO,
                  membresActifs: rotationAvecParts,
                  dateDebut: dateDebutAuto,
                });
                await rechargerTontine();
                setTontineError("");
                setTontineSuccess(true);
                setTimeout(() => {
                  setShowCreateTontine(false);
                  setTontineSuccess(false);
                  setTontineNom(""); setTontineMontant(""); setTontineDateDebut("");
                }, 1400);
              } catch (e) {
                console.error("Erreur de création de la tontine", e);
                setTontineError(e.message || "Erreur lors de la création de la tontine.");
                setTontineSuccess(false);
              }
            }}
          >
            <Banknote size={16} /> Créer la tontine
          </button>
        </Modal>
      )}
    </div>
  );
}
function MembreScreen({ groupId, nomGroupe, profileId, nomComplet }) {
  const [monCompte, setMonCompte] = useState(null);
  const [tableauDeBord, setTableauDeBord] = useState(null);
  const [mesFonds, setMesFonds] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [erreurDetail, setErreurDetail] = useState("");
  const [statutAbonnement, setStatutAbonnement] = useState(null);
  const [maPhotoUrl, setMaPhotoUrl] = useState("");
  const [logoGroupeUrl, setLogoGroupeUrl] = useState("");
  const fmtFCFA = (n) => `${Math.round(n || 0).toLocaleString("fr-FR")} FCFA`;

  useEffect(() => {
    if (!groupId) return;
    fetchStatutAbonnement(groupId)
      .then(setStatutAbonnement)
      .catch((e) => console.error("Erreur de vérification de la licence", e));
    fetchLogoGroupe(groupId)
      .then(setLogoGroupeUrl)
      .catch((e) => console.error("Erreur de chargement du logo", e));
    fetchSoldeSms(groupId)
      .then((s) => setSmsSolde(s.solde))
      .catch((e) => console.error("Erreur de chargement du solde SMS", e));
  }, [groupId]);
  const licenceExpiree = statutAbonnement?.expire === true || statutAbonnement?.statut === "suspendu";

  useEffect(() => {
    if (!groupId || !profileId) return;
    let annule = false;

    (async () => {
      try {
        const data = await fetchMonCompteMembre(groupId, profileId);
        if (annule) return;
        setMonCompte(data);
        setChargement(false); // affiche déjà rôle/statut sans attendre le reste

        try {
          const tdb = await fetchTableauDeBordMembre(groupId, data.id);
          if (!annule) setTableauDeBord(tdb);
        } catch (e2) {
          console.error("Erreur de chargement du tableau de bord", e2);
          if (!annule) setErreurDetail(e2.message || JSON.stringify(e2));
        }

        try {
          const fonds = await fetchFondsMembre(groupId, data.id);
          if (!annule) setMesFonds(fonds);
        } catch (e3) {
          console.error("Erreur de chargement des fonds", e3);
        }

        try {
          const docs = await fetchDocumentsMembre(data.id);
          if (!annule && docs.photo) setMaPhotoUrl(docs.photo);
        } catch (e4) {
          console.error("Erreur de chargement de la photo", e4);
        }
      } catch (e) {
        console.error("Erreur de chargement du compte membre", e);
        if (!annule) {
          setErreur("Impossible de charger tes informations.");
          setErreurDetail(e.message || JSON.stringify(e));
          setChargement(false);
        }
      }
    })();

    return () => { annule = true; };
  }, [groupId, profileId]);

  return licenceExpiree ? (
    <div style={{ minHeight: "680px", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "30px", textAlign: "center" }}>
      <div style={{ maxWidth: "320px" }}>
        <div style={{ width: "56px", height: "56px", margin: "0 auto 16px", borderRadius: "14px", background: C.warnBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ShieldAlert size={26} color={C.warn} />
        </div>
        <h1 style={{ fontSize: "18px", fontWeight: 700, color: C.ink, margin: "0 0 8px" }}>Licence expirée</h1>
        <p style={{ fontSize: "13px", color: C.sub, margin: 0 }}>
          {statutAbonnement?.statut === "suspendu"
            ? "L'accès à ton groupe a été suspendu par le Super Admin de la plateforme."
            : "L'abonnement de ton groupe a expiré."}
          {" "}Contacte l'admin de ton groupe ou le Super Admin de la plateforme.
        </p>
      </div>
    </div>
  ) : (
    <div style={{ minHeight: "680px", background: C.bg, display: "flex", justifyContent: "center", padding: "30px 0" }}>
      <div className="responsive-card" style={{ width: "360px", maxWidth: "94vw", background: C.panel, borderRadius: "26px", border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 20px 50px rgba(27,67,50,0.1)" }}>
        <div style={{ background: C.accent2, padding: "22px 20px", color: "#FAF6ED", display: "flex", alignItems: "center", gap: "14px" }}>
          {maPhotoUrl ? (
            <img src={maPhotoUrl} alt="Photo" style={{ width: "52px", height: "52px", borderRadius: "12px", objectFit: "cover", border: "2px solid rgba(255,255,255,0.3)" }} />
          ) : (
            <div style={{ width: "52px", height: "52px", borderRadius: "12px", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Users size={22} color="#FAF6ED" />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "12px", color: "#B7CCBD" }}>Bonjour,</div>
            <div style={{ fontSize: "18px", fontWeight: 700 }}>{nomComplet || "—"}</div>
            <div style={{ fontSize: "11px", color: "#9DB3A6", marginTop: "2px" }}>{nomGroupe || "—"}</div>
          </div>
          {logoGroupeUrl && (
            <img src={logoGroupeUrl} alt="Logo du groupe" style={{ width: "36px", height: "36px", borderRadius: "9px", objectFit: "cover", background: "#FFFFFF" }} />
          )}
        </div>

        {erreurDetail && (
          <div style={{ margin: "12px 20px 0", fontSize: "10.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px", wordBreak: "break-word" }}>
            Détail technique : {erreurDetail}
          </div>
        )}

        <div style={{ padding: "18px 20px" }}>
          {chargement ? (
            <div style={{ fontSize: "13px", color: C.sub, textAlign: "center", padding: "20px 0" }}>Chargement...</div>
          ) : erreur ? (
            <div style={{ fontSize: "12px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "10px 12px" }}>{erreur}</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
                <div style={{ flex: 1, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "10.5px", color: C.sub }}>Rôle</div>
                  <div style={{ fontSize: "13px", fontWeight: 700 }}>{monCompte?.role}</div>
                </div>
                <div style={{ flex: 1, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "10.5px", color: C.sub }}>Statut</div>
                  <Badge bg={monCompte?.statut === "actif" ? C.ok : C.warnBg} fg={monCompte?.statut === "actif" ? C.accent2 : C.warn}>{monCompte?.statut}</Badge>
                </div>
              </div>

              {monCompte?.statut === "en attente" && (
                <div style={{ marginBottom: "12px", fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "10px 12px" }}>
                  Ton inscription est en attente de validation par le Président du groupe.
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {tableauDeBord?.tontine && (
                  <MiniCard
                    icon={<Banknote size={16} color={C.accent2} />}
                    label={`Tontine — ${tableauDeBord.tontine.nom}`}
                    value={fmtFCFA(tableauDeBord.tontine.montantParTour)}
                    note={
                      tableauDeBord.tontine.tourEnCoursNumero
                        ? `Tour ${tableauDeBord.tontine.tourEnCoursNumero} en cours — ${tableauDeBord.tontine.aCotiseCeTour ? "cotisation à jour" : "cotisation non reçue"}`
                        : "Aucun tour en cours"
                    }
                    ok={tableauDeBord.tontine.aCotiseCeTour}
                    warn={!tableauDeBord.tontine.aCotiseCeTour}
                  />
                )}
                {tableauDeBord?.tontine?.monTourNumero && (
                  <MiniCard icon={<CheckCircle2 size={16} color={C.accent2} />} label="Mon tour" value={`Tour ${tableauDeBord.tontine.monTourNumero}`} note={tableauDeBord.tontine.monTourStatut} ok />
                )}

                {tableauDeBord?.epargnes?.map((ep) => (
                  <MiniCard key={ep.nom} icon={<PiggyBank size={16} color={C.accent2} />} label={ep.nom} value={fmtFCFA(ep.solde)} note="Solde collectif du groupe" />
                ))}

                {tableauDeBord?.assurance && (
                  <CarteProgression
                    icon={<HeartHandshake size={16} color={C.accent2} />}
                    label="Assurance"
                    solde={tableauDeBord.assurance.solde}
                    cible={tableauDeBord.assurance.soldeMinimum}
                  />
                )}

                {tableauDeBord?.mesPrets?.map((p, i) => (
                  <MiniCard key={i} icon={<Wallet size={16} color={C.accent2} />} label="Prêt en cours" value={fmtFCFA(p.montant)} note={`Échéance ${p.dateFin}`} />
                ))}

                {mesFonds.filter((f) => f.cible > 0 || f.solde > 0).map((f) => (
                  <CarteProgression
                    key={f.typeFondsId}
                    icon={<Wallet size={16} color={C.accent2} />}
                    label={f.nom}
                    solde={f.solde}
                    cible={f.cible}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {tableauDeBord?.historique?.length > 0 && (
          <div style={{ padding: "0 20px 20px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: C.sub, margin: "6px 0 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Historique récent</div>
            {tableauDeBord.historique.map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < tableauDeBord.historique.length - 1 ? `1px solid ${C.border}` : "none", fontSize: "12.5px" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{h.label}</div>
                  <div style={{ color: C.sub, fontSize: "11px" }}>{h.date}</div>
                </div>
                <div style={{ fontWeight: 700, color: h.montant < 0 ? C.warn : C.accent2 }}>
                  {h.montant < 0 ? "-" : "+"}{fmtFCFA(Math.abs(h.montant))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CarteProgression({ icon, label, solde, cible }) {
  const fmtFCFA = (n) => `${Math.round(n || 0).toLocaleString("fr-FR")} FCFA`;
  const complet = cible > 0 && solde >= cible;
  const pourcentage = cible > 0 ? Math.min(100, (solde / cible) * 100) : 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "12px", border: `1px solid ${C.border}`, background: "#FBFAF6" }}>
      <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: complet ? C.ok : "#F9E4D8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "11px", color: C.sub }}>{label}</div>
        <div style={{ fontSize: "14px", fontWeight: 700 }}>{fmtFCFA(solde)}{cible > 0 ? ` / ${fmtFCFA(cible)}` : ""}</div>
        {cible > 0 && (
          <>
            <div style={{ width: "100%", height: "5px", background: "#EEE", borderRadius: "3px", marginTop: "5px", marginBottom: "3px", overflow: "hidden" }}>
              <div style={{ width: `${pourcentage}%`, height: "100%", background: complet ? C.accent2 : C.warn }} />
            </div>
            <div style={{ fontSize: "10.5px", fontWeight: 600, color: complet ? C.accent2 : C.warn }}>{complet ? "Complet" : "Incomplet"}</div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniCard({ icon, label, value, note, ok, warn }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "12px", border: `1px solid ${C.border}`, background: "#FBFAF6" }}>
      <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: warn ? "#F9E4D8" : C.ok, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "11px", color: C.sub }}>{label}</div>
        <div style={{ fontSize: "14px", fontWeight: 700 }}>{value}</div>
        <div style={{ fontSize: "10.5px", color: warn ? C.warn : C.sub, marginTop: "1px" }}>{note}</div>
      </div>
    </div>
  );
}

// ============================================================
// COMPOSANTS PARTAGÉS
// ============================================================
function Sidebar({ role, sub, items, active, onSelect, logoUrl }) {
  return (
    <div className="app-sidebar" style={{ width: "210px", background: C.accent2, padding: "26px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
      <div className="sidebar-header" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "30px", paddingLeft: "6px" }}>
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" style={{ width: "32px", height: "32px", borderRadius: "9px", objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <LayoutDashboard size={16} color={C.accent2} />
          </div>
        )}
        <div>
          <div style={{ color: "#FAF6ED", fontWeight: 700, fontSize: "13px", lineHeight: 1.1 }}>{role}</div>
          <div style={{ color: "#9DB3A6", fontSize: "10.5px" }}>{sub}</div>
        </div>
      </div>
      {items.map((item) => (
        <div key={item.key} className="sidebar-item" onClick={() => onSelect(item.key)} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "8px", color: active === item.key ? C.accent2 : "#D7E3DA", background: active === item.key ? C.accent : "transparent", fontSize: "13px", fontWeight: active === item.key ? 600 : 500, cursor: "pointer" }}>
          {item.icon} {item.label}
        </div>
      ))}
      <div className="sidebar-footer" style={{ marginTop: "auto", fontSize: "10.5px", color: "#7F9788", paddingLeft: "6px" }}>Three T Solutions — 2026</div>
    </div>
  );
}

function Table({ cols, widths, rows }) {
  return (
    <div className="table-scroll">
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "14px", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: widths, padding: "12px 20px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: C.sub, borderBottom: `1px solid ${C.border}` }}>
          {cols.map((c) => <div key={c}>{c}</div>)}
        </div>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: widths, padding: "14px 20px", fontSize: "13px", alignItems: "center", borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none" }}>
            {row.map((cell, j) => <div key={j}>{cell}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Badge({ bg, fg, children }) {
  return <span style={{ background: bg, color: fg, fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "999px", textTransform: "capitalize" }}>{children}</span>;
}

function Modal({ children, onClose, title, icon, accentColor }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, padding: "16px" }}>
      <div className="responsive-modal" style={{ background: "#FFFFFF", borderRadius: "16px", padding: "26px", width: "360px", maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {icon && (
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `${accentColor || C.accent2}1A`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {React.cloneElement(icon, { size: 17, color: accentColor || C.accent2 })}
              </div>
            )}
            <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: C.ink }}>{title}</h2>
          </div>
          <X size={18} color={C.sub} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, placeholder, value, onChange }) {
  return (
    <div>
      <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>{label}</label>
      <input
        placeholder={placeholder}
        value={value !== undefined ? value : undefined}
        onChange={onChange}
        style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
      />
    </div>
  );
}

function RapportSection({ titre, children }) {
  return (
    <div>
      <div style={{ fontSize: "11px", fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em", margin: "4px 0 6px" }}>{titre}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>{children}</div>
    </div>
  );
}

function RapportLigne({ gauche, droite, positif }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "6px 8px", background: "#FBFAF6", borderRadius: "7px", fontSize: "12px" }}>
      <span>{gauche}</span>
      <span style={{ fontWeight: 700, color: positif ? C.accent2 : C.ink, whiteSpace: "nowrap" }}>{droite}</span>
    </div>
  );
}

function StatCard({ label, value, sub, icon }) {
  return (
    <div style={{ flex: "1 1 160px", minWidth: "160px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: C.sub, fontSize: "12px", marginBottom: "8px" }}>{icon} {label}</div>
      <div style={{ fontSize: "18px", fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: C.sub, marginTop: "3px" }}>{sub}</div>}
    </div>
  );
}

const btnPrimary = { background: `linear-gradient(135deg, ${C.accent2}, ${C.accent})`, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "11px 18px", fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", whiteSpace: "nowrap", boxShadow: `0 4px 12px ${C.accent2}40`, transition: "transform 0.12s ease, box-shadow 0.12s ease" };
const btnSecondary = { background: "#FFFFFF", color: C.accent2, border: `1.5px solid ${C.accent2}55`, borderRadius: "10px", padding: "11px 18px", fontSize: "13px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap", boxShadow: "0 2px 6px rgba(27,67,50,0.08)", transition: "transform 0.12s ease" };
