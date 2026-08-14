import React, { useState, useEffect } from "react";
import { fetchMembres, inviterMembre, validerMembre } from "./lib/membres";
import { signIn, signOut, getSession, getMonProfil, getMesGroupes, onAuthStateChange } from "./lib/auth";
import { fetchGroupes, creerGroupeAvecAdmin } from "./lib/groups";

// ⚠️ À remplacer par le vrai group_id une fois qu'un groupe existe
// dans la table "groups" de Supabase (copie son UUID ici).
const GROUP_ID = "6a5d15cf-39d8-4afa-9d4c-08caa3109531";

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
  Banknote, PiggyBank, HeartHandshake, UserCog,
} from "lucide-react";

// ---------- Palette partagée ----------
const C = {
  ink: "#1B2420", sub: "#5B6B5F", accent: "#B8860F", accent2: "#1B4332",
  border: "#E5DFCE", bg: "#FAF6ED", panel: "#FFFFFF", purple: "#6B5FA6",
  warn: "#A44A1F", warnBg: "#F9E4D8", ok: "#E4EFE6",
};

export default function AppPrototype() {
  const [chargementSession, setChargementSession] = useState(true);
  const [connecte, setConnecte] = useState(false);
  const [monProfil, setMonProfil] = useState(null);
  const [mesGroupes, setMesGroupes] = useState([]);

  const chargerSessionEtRole = async () => {
    setChargementSession(true);
    try {
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
    const sub = onAuthStateChange(() => {
      chargerSessionEtRole();
    });
    return () => sub?.unsubscribe?.();
  }, []);

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

  if (!connecte) {
    return (
      <div style={{ fontFamily: "'Sora','Segoe UI',sans-serif" }}>
        <ConnexionScreen onLoggedIn={chargerSessionEtRole} />
      </div>
    );
  }

  // Détermine quel écran afficher selon le rôle réel de la personne connectée
  const estSuperAdmin = monProfil?.is_super_admin === true;
  const groupeAdmin = mesGroupes.find((g) => g.is_admin || g.is_president);
  const groupeMembreSimple = mesGroupes.find((g) => !g.is_admin && !g.is_president);

  return (
    <div style={{ fontFamily: "'Sora','Segoe UI',sans-serif", background: "#0E1210" }}>
      {/* Barre de session — visible sur tous les écrans une fois connecté */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "#0E1210" }}>
        <span style={{ fontSize: "12px", color: "#9AA69C" }}>
          Connecté : {monProfil?.nom_complet || "—"} {estSuperAdmin ? "(Super Admin)" : ""}
        </span>
        <button
          onClick={handleDeconnexion}
          style={{ display: "flex", alignItems: "center", gap: "6px", background: "#1D2420", color: "#9AA69C", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
        >
          <LogOut size={13} /> Déconnexion
        </button>
      </div>

      <div style={{ minHeight: "680px" }}>
        {estSuperAdmin ? (
          <SuperAdminScreen />
        ) : groupeAdmin ? (
          <AdminGroupeScreen />
        ) : groupeMembreSimple ? (
          <MembreScreen />
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const bg = dark ? "#14181A" : C.bg;
  const panelBg = dark ? "#1E2427" : C.panel;
  const ink = dark ? "#F2EEE3" : C.ink;
  const sub = dark ? "#9AA69C" : C.sub;
  const border = dark ? "#2B3336" : C.border;

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setErreur("Renseigne ton email et ton mot de passe.");
      return;
    }
    setChargement(true);
    setErreur("");
    try {
      await signIn({ email: email.trim(), password });
      onLoggedIn();
    } catch (e) {
      console.error("Erreur de connexion", e);
      setErreur("Email ou mot de passe incorrect.");
    } finally {
      setChargement(false);
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
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div style={{ width: "56px", height: "56px", margin: "0 auto 16px", borderRadius: "14px", background: `linear-gradient(135deg, ${C.accent2}, ${C.accent})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={26} color="#FAF6ED" />
            </div>
            <div style={{ fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: C.accent, fontWeight: 600, marginBottom: "6px" }}>Connexion</div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: ink, margin: 0 }}>Plateforme Tontine</h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", color: sub, marginBottom: "6px", display: "block" }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ex. toi@exemple.com"
                style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: "10px", border: `1px solid ${border}`, background: dark ? "#171C1E" : "#FBFAF6", color: ink, fontSize: "14px", outline: "none" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: sub, marginBottom: "6px", display: "block" }}>Mot de passe</label>
              <div style={{ position: "relative" }}>
                <Lock size={15} color={sub} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="••••••••"
                  style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px 12px 38px", borderRadius: "10px", border: `1px solid ${border}`, background: dark ? "#171C1E" : "#FBFAF6", color: ink, fontSize: "14px", outline: "none" }}
                />
              </div>
              <div style={{ textAlign: "right", marginTop: "6px" }}>
                <span style={{ fontSize: "12px", color: C.accent, cursor: "pointer", fontWeight: 600 }}>Mot de passe oublié ?</span>
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
// ÉCRAN 2 — SUPER ADMIN
// ============================================================
function SuperAdminScreen() {
  const [view, setView] = useState("groupes");
  const [groupes, setGroupes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const [showCreateGroupe, setShowCreateGroupe] = useState(false);
  const [nomGroupe, setNomGroupe] = useState("");
  const [adminNom, setAdminNom] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [creationErreur, setCreationErreur] = useState("");
  const [resultatCreation, setResultatCreation] = useState(null);

  const chargerGroupes = async () => {
    setChargement(true);
    try {
      const data = await fetchGroupes();
      setGroupes(data);
      setErreur("");
    } catch (e) {
      console.error("Erreur de chargement des groupes", e);
      setErreur("Impossible de charger les groupes — vérifie que ton compte est bien marqué Super Admin.");
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    chargerGroupes();
  }, []);

  const planColor = { Basic: C.sub, Standard: C.accent2, Pro: C.accent, Essai: C.purple };
  const statusStyle = { actif: { bg: C.ok, fg: C.accent2 }, "en retard": { bg: C.warnBg, fg: C.warn }, essai: { bg: "#EBE6F5", fg: C.purple } };

  return (
    <div style={{ minHeight: "680px", background: C.bg, display: "flex", color: C.ink }}>
      <Sidebar
        role="Super Admin" sub="Plateforme"
        items={[
          { icon: <Building2 size={16} />, label: "Groupes", key: "groupes" },
          { icon: <ScrollText size={16} />, label: "Journal d'audit", key: "audit" },
        ]}
        active={view} onSelect={setView}
      />
      <div style={{ flex: 1, padding: "32px 40px" }}>
        {view === "groupes" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Groupes enregistrés</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>
                  {chargement ? "Chargement..." : `${groupes.length} groupe(s).`} Création + abonnement uniquement — aucune visibilité sur les données internes.
                </p>
              </div>
              <button
                style={btnPrimary}
                onClick={() => {
                  setNomGroupe(""); setAdminNom(""); setAdminEmail("");
                  setCreationErreur(""); setResultatCreation(null);
                  setShowCreateGroupe(true);
                }}
              >
                <Plus size={15} /> Nouveau groupe
              </button>
            </div>

            {erreur && (
              <div style={{ marginTop: "16px", fontSize: "12.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "10px 12px" }}>
                {erreur}
              </div>
            )}

            <div style={{ marginTop: "22px" }} />
            <Table
              cols={["Groupe", "Formule", "Échéance", "Statut"]}
              widths="2fr 1.1fr 1.2fr 1.1fr"
              rows={groupes.map((g) => {
                const abo = g.subscriptions?.[0];
                return [
                  <b>{g.nom}</b>,
                  abo ? (
                    <span><span style={{ color: planColor[abo.formule] || C.sub, fontWeight: 700 }}>{abo.formule}</span> {abo.periodicite && <span style={{ color: C.sub, fontSize: 11 }}>· {abo.periodicite}</span>}</span>
                  ) : "—",
                  abo?.date_expiration ? <span style={{ color: C.sub, fontSize: 12 }}>{new Date(abo.date_expiration).toLocaleDateString("fr-FR")}</span> : "—",
                  abo ? <Badge bg={(statusStyle[abo.statut] || statusStyle.actif).bg} fg={(statusStyle[abo.statut] || statusStyle.actif).fg}>{abo.statut}</Badge> : "—",
                ];
              })}
            />
          </>
        )}

        {view === "audit" && (
          <>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Journal d'audit</h1>
            <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 22px" }}>
              Historique en lecture seule des actions Super Admin (branchement des entrées à venir).
            </p>
          </>
        )}
      </div>

      {showCreateGroupe && (
        <Modal onClose={() => setShowCreateGroupe(false)} title="Créer un nouveau groupe">
          {!resultatCreation ? (
            <>
              <FormField label="Nom du groupe" placeholder="Ex. Tontine Les Bâtisseurs" value={nomGroupe} onChange={(e) => setNomGroupe(e.target.value)} />
              <FormField label="Nom de l'administrateur" placeholder="Ex. Jean Mballa" value={adminNom} onChange={(e) => setAdminNom(e.target.value)} />
              <FormField label="Email de l'administrateur" placeholder="Ex. jean.mballa@exemple.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />

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
                    });
                    setResultatCreation(resultat);
                    await chargerGroupes();
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
                <div><b>Email :</b> {resultatCreation.adminEmail}</div>
                <div><b>Mot de passe temporaire :</b> {resultatCreation.motDePasseTemp}</div>
                <div style={{ color: C.sub, marginTop: "6px", fontSize: "11px" }}>
                  L'admin devra changer ce mot de passe dès sa première connexion (à mettre en place).
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
    </div>
  );
}

// ============================================================
// ÉCRAN 3 — ADMIN DE GROUPE (modules Tontine / Banque / Assurance / Bilan / Membres)
// ============================================================
function AdminGroupeScreen() {
  const [view, setView] = useState("tontine");
  const [showCreateTontine, setShowCreateTontine] = useState(false);
  const [tontineNom, setTontineNom] = useState("");
  const [tontineMontant, setTontineMontant] = useState("");
  const [tontineError, setTontineError] = useState("");
  const [tontineSuccess, setTontineSuccess] = useState(false);
  const [showPayout, setShowPayout] = useState(null);
  const [seances, setSeances] = useState([
    { date: "05/09/2026", mode: "Ordre fixe" },
    { date: "05/10/2026", mode: "Enchères" },
  ]);
  const [newDate, setNewDate] = useState("");
  const [newMode, setNewMode] = useState("Ordre fixe");

  const addSeance = () => {
    if (!newDate.trim()) return;
    setSeances([...seances, { date: newDate.trim(), mode: newMode }]);
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
      const data = await fetchMembres(GROUP_ID);
      setMembres(data);
      setMembresErreurChargement("");
    } catch (e) {
      console.error("Erreur de chargement des membres", e);
      setMembresErreurChargement("Impossible de charger les membres depuis Supabase — vérifie GROUP_ID et ta connexion.");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    rechargerMembres();
  }, []);

  const DEFAULT_TOURS = [
    { tour: 1, beneficiaire: "Jean Mballa", montant: "300 000 FCFA", mode: "Ordre fixe", statut: "clôturé" },
    { tour: 2, beneficiaire: "Sylvie Etoundi", montant: "285 000 FCFA", mode: "Enchères", statut: "clôturé" },
    { tour: 3, beneficiaire: "Rachel Biya", montant: "300 000 FCFA", mode: "Ordre fixe", statut: "en cours" },
    { tour: 4, beneficiaire: "À désigner", montant: "—", mode: "—", statut: "à venir" },
  ];
  const [tours, setTours] = useState(DEFAULT_TOURS);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("groupe-batisseurs:tours", false);
        if (res && res.value) setTours(JSON.parse(res.value));
      } catch (e) {
        // Pas encore de données sauvegardées
      }
    })();
  }, []);

  const persistTours = async (next) => {
    setTours(next);
    try {
      await window.storage.set("groupe-batisseurs:tours", JSON.stringify(next), false);
    } catch (e) {
      console.error("Erreur de sauvegarde des tours", e);
    }
  };

  const DEFAULT_PRETS = [
    { membre: "Paul Ngono", montant: "150 000 FCFA", avaliste: "Rachel Biya", statut: "en cours", echeance: "15 Sept 2026" },
    { membre: "Sylvie Etoundi", montant: "80 000 FCFA", avaliste: "—", statut: "remboursé", echeance: "02 Juin 2026" },
  ];
  const [prets, setPrets] = useState(DEFAULT_PRETS);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("groupe-batisseurs:prets", false);
        if (res && res.value) setPrets(JSON.parse(res.value));
      } catch (e) {
        // Pas encore de données sauvegardées
      }
    })();
  }, []);

  const persistPrets = async (next) => {
    setPrets(next);
    try {
      await window.storage.set("groupe-batisseurs:prets", JSON.stringify(next), false);
    } catch (e) {
      console.error("Erreur de sauvegarde des prêts", e);
    }
  };

  const tourStatus = { "clôturé": { bg: C.ok, fg: C.accent2 }, "en cours": { bg: "#FBF1DC", fg: C.accent }, "à venir": { bg: "#EEE", fg: C.sub } };

  const retards = [
    { membre: "Paul Ngono", tour: 3, jours: 5, montantDu: "75 000 FCFA" },
  ];
  const [showAmende, setShowAmende] = useState(null);
  const [showNouveauDepot, setShowNouveauDepot] = useState(false);
  const [depotDate, setDepotDate] = useState("");
  const [depotMontant, setDepotMontant] = useState("");
  const [depotMotif, setDepotMotif] = useState("");
  const [depotBanque, setDepotBanque] = useState("Afriland First Bank — Agence Nkolbisson");
  const [depotMembreSimple, setDepotMembreSimple] = useState("");
  const [depotError, setDepotError] = useState("");
  const [depotSuccess, setDepotSuccess] = useState(false);
  const [recuJoint, setRecuJoint] = useState(false);
  const [typeMouvementBanque, setTypeMouvementBanque] = useState("Dépôt");
  const signataires = ["Jean Mballa — Président", "Rachel Biya — Trésorière", "Sylvie Etoundi — Secrétaire générale"];
  const [signatairesChoisis, setSignatairesChoisis] = useState([]);
  const toggleSignataire = (nom) => {
    setSignatairesChoisis((prev) => (prev.includes(nom) ? prev.filter((n) => n !== nom) : [...prev, nom]));
  };
  const fmtFCFA = (n) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

  const DEFAULT_DEPOTS = [
    { date: "20 Juil 2026", type: "Dépôt", montantNum: 2150000, signataire: "Rachel Biya", banque: "Afriland First Bank — Agence Nkolbisson", motif: "—", statut: "reçu joint" },
    { date: "20 Juil 2026", type: "Retrait", montantNum: 150000, signataire: "Rachel Biya", banque: "Afriland First Bank — Agence Nkolbisson", motif: "Décaissement prêt — Paul Ngono", statut: "en attente du reçu" },
    { date: "29 Juil 2026", type: "Dépôt", montantNum: 600000, signataire: "Sylvie Etoundi", banque: "Afriland First Bank — Agence Nkolbisson", motif: "—", statut: "en attente du reçu" },
    { date: "05 Août 2026", type: "Dépôt", montantNum: 800000, signataire: "Jean Mballa", banque: "Afriland First Bank — Agence Nkolbisson", motif: "—", statut: "reçu joint" },
    { date: "08 Août 2026", type: "Retrait", montantNum: 300000, signataire: "Jean Mballa", banque: "Afriland First Bank — Agence Nkolbisson", motif: "Versement cagnotte tour 3", statut: "reçu joint" },
    { date: "12 Août 2026", type: "Dépôt", montantNum: 1500000, signataire: "Rachel Biya", banque: "Afriland First Bank — Agence Nkolbisson", motif: "—", statut: "reçu joint" },
  ];

  const [depotsBruts, setDepotsBruts] = useState(DEFAULT_DEPOTS);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("groupe-batisseurs:depots", false);
        if (res && res.value) setDepotsBruts(JSON.parse(res.value));
      } catch (e) {
        // Pas encore de données sauvegardées, on garde les valeurs par défaut
      }
    })();
  }, []);

  const persistDepots = async (next) => {
    setDepotsBruts(next);
    try {
      await window.storage.set("groupe-batisseurs:depots", JSON.stringify(next), false);
    } catch (e) {
      console.error("Erreur de sauvegarde des dépôts", e);
    }
  };

  // Recalcule le solde chronologiquement, puis affiche du plus récent au plus ancien
  let running = 0;
  const depotsChrono = depotsBruts.map((d) => {
    running += d.type === "Dépôt" ? d.montantNum : -d.montantNum;
    return { ...d, soldeNum: running };
  });
  const depots = [...depotsChrono].reverse().map((d) => ({
    ...d, montant: fmtFCFA(d.montantNum), solde: fmtFCFA(d.soldeNum),
  }));
  const soldeCompteActuel = depots.length ? depots[0].solde : fmtFCFA(0);
  const [filtreDateDebut, setFiltreDateDebut] = useState("");
  const [filtreDateFin, setFiltreDateFin] = useState("");
  const [bankTab, setBankTab] = useState("apercu");
  const historiqueBanque = [
    { date: "12 Août 2026", membre: "Jean Mballa", epargne: "Banque scolaire", type: "Versement", montant: "+40 000 FCFA", solde: "1 240 000 FCFA" },
    { date: "10 Août 2026", membre: "Paul Ngono", epargne: "Banque scolaire", type: "Retrait", montant: "-150 000 FCFA", solde: "1 200 000 FCFA" },
    { date: "05 Août 2026", membre: "Rachel Biya", epargne: "Banque annuelle", type: "Versement", montant: "+60 000 FCFA", solde: "3 850 000 FCFA" },
    { date: "28 Juil 2026", membre: "Sylvie Etoundi", epargne: "Épargne — Achat terrain", type: "Versement", montant: "+20 000 FCFA", solde: "620 000 FCFA" },
    { date: "22 Juil 2026", membre: "Sylvie Etoundi", epargne: "Banque scolaire", type: "Retrait", montant: "-80 000 FCFA", solde: "1 350 000 FCFA" },
  ];
  const [showInviteMember, setShowInviteMember] = useState(false);
  const [inviteNom, setInviteNom] = useState("");
  const [inviteTelephone, setInviteTelephone] = useState("");
  const [inviteCaution, setInviteCaution] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [showRapportJournalier, setShowRapportJournalier] = useState(false);
  const [showRapportMensuel, setShowRapportMensuel] = useState(false);
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
  const [epargneType, setEpargneType] = useState("Personnalisée");
  const [epargneNom, setEpargneNom] = useState("");
  const [epargneCotisation, setEpargneCotisation] = useState("");
  const [epargneTaux, setEpargneTaux] = useState("");
  const [epargneCloture, setEpargneCloture] = useState("");
  const [epargneError, setEpargneError] = useState("");
  const [epargneSuccess, setEpargneSuccess] = useState(false);
  const DEFAULT_EPARGNES = [
    { nom: "Banque scolaire", type: "Banque scolaire", solde: 1240000, cotisation: "Séance", tauxInteret: "5 %", cloture: "31 Août 2026" },
    { nom: "Banque annuelle", type: "Banque annuelle", solde: 3850000, cotisation: "Séance", tauxInteret: "5 %", cloture: "31 Déc 2026" },
    { nom: "Épargne — Achat terrain", type: "Personnalisée", solde: 620000, cotisation: "Séance", tauxInteret: "0 %", cloture: "Cycle personnalisé" },
  ];
  const [epargnes, setEpargnes] = useState(DEFAULT_EPARGNES);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("groupe-batisseurs:epargnes", false);
        if (res && res.value) setEpargnes(JSON.parse(res.value));
      } catch (e) {
        // Pas encore de données sauvegardées, on garde les valeurs par défaut
      }
    })();
  }, []);

  const persistEpargnes = async (next) => {
    setEpargnes(next);
    try {
      await window.storage.set("groupe-batisseurs:epargnes", JSON.stringify(next), false);
    } catch (e) {
      console.error("Erreur de sauvegarde des épargnes", e);
    }
  };
  const [showCotisationBanque, setShowCotisationBanque] = useState(false);
  const [showCreditForm, setShowCreditForm] = useState(false);
  const CAUTION_DEFAUT = 100000;
  const [creditMembre, setCreditMembre] = useState("");
  const [creditMontant, setCreditMontant] = useState("");
  const [creditDebut, setCreditDebut] = useState("");
  const [creditFin, setCreditFin] = useState("");
  const [creditAvaliste, setCreditAvaliste] = useState("");
  const [creditError, setCreditError] = useState("");
  const [creditSuccess, setCreditSuccess] = useState(false);
  const [creditDepasseCaution, setCreditDepasseCaution] = useState(false);
  const [cotisationEpargne, setCotisationEpargne] = useState("Banque scolaire");
  const [cotisationDate, setCotisationDate] = useState("");
  const [cotisationMontants, setCotisationMontants] = useState({});

  const setMontantMembre = (nom, val) => {
    setCotisationMontants((prev) => ({ ...prev, [nom]: val }));
  };

  const [showCotisationTontine, setShowCotisationTontine] = useState(false);
  const [cotisationTontineDate, setCotisationTontineDate] = useState("");
  const [cotisationTontineMontants, setCotisationTontineMontants] = useState({});
  const setMontantTontineMembre = (nom, val) => {
    setCotisationTontineMontants((prev) => ({ ...prev, [nom]: val }));
  };

  const [showCotisationAssurance, setShowCotisationAssurance] = useState(false);
  const [showDeclarerEvenement, setShowDeclarerEvenement] = useState(false);
  const [evenementBeneficiaire, setEvenementBeneficiaire] = useState("");
  const [evenementMontant, setEvenementMontant] = useState("");
  const [evenementError, setEvenementError] = useState("");
  const [evenementSuccess, setEvenementSuccess] = useState(false);
  const SOLDE_MIN_ASSURANCE = 80000;
  const DEFAULT_ASSURANCE = {
    "Jean Mballa": { solde: 80000, delaiRestant: null },
    "Sylvie Etoundi": { solde: 80000, delaiRestant: null },
    "Paul Ngono": { solde: 62000, delaiRestant: "18 jours" },
    "Rachel Biya": { solde: 80000, delaiRestant: null },
  };
  const [assuranceSoldes, setAssuranceSoldes] = useState(DEFAULT_ASSURANCE);
  const [evenements, setEvenements] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("groupe-batisseurs:assurance", false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setAssuranceSoldes(parsed.soldes || DEFAULT_ASSURANCE);
          setEvenements(parsed.evenements || []);
        }
      } catch (e) {
        // Pas encore de données sauvegardées
      }
    })();
  }, []);

  const persistAssurance = async (soldes, evts) => {
    setAssuranceSoldes(soldes);
    setEvenements(evts);
    try {
      await window.storage.set("groupe-batisseurs:assurance", JSON.stringify({ soldes, evenements: evts }), false);
    } catch (e) {
      console.error("Erreur de sauvegarde de l'assurance", e);
    }
  };
  const [eventTypes, setEventTypes] = useState(["Décès", "Mariage", "Cérémonie", "Autre"]);
  const [typeEvenement, setTypeEvenement] = useState("Décès");
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  const addEventType = () => {
    if (!newTypeName.trim()) return;
    setEventTypes([...eventTypes, newTypeName.trim()]);
    setTypeEvenement(newTypeName.trim());
    setNewTypeName("");
    setShowNewType(false);
  };

  const [delegues, setDelegues] = useState([]);
  const [touteReunion, setTouteReunion] = useState(false);
  const toggleDelegue = (nom) => {
    setDelegues((prev) => (prev.includes(nom) ? prev.filter((n) => n !== nom) : [...prev, nom]));
  };

  const [deductions, setDeductions] = useState([{ label: "Transport des délégués", montant: "" }]);
  const addDeduction = () => setDeductions([...deductions, { label: "", montant: "" }]);
  const updateDeduction = (idx, field, val) => {
    setDeductions((prev) => prev.map((d, i) => (i === idx ? { ...d, [field]: val } : d)));
  };
  const removeDeduction = (idx) => setDeductions((prev) => prev.filter((_, i) => i !== idx));
  const [cotisationAssuranceDate, setCotisationAssuranceDate] = useState("");
  const [cotisationAssuranceMontants, setCotisationAssuranceMontants] = useState({});
  const setMontantAssuranceMembre = (nom, val) => {
    setCotisationAssuranceMontants((prev) => ({ ...prev, [nom]: val }));
  };

  return (
    <div style={{ minHeight: "680px", background: C.bg, display: "flex", color: C.ink }}>
      <Sidebar
        role="Admin Groupe" sub="Tontine Les Bâtisseurs"
        items={[
          { icon: <Banknote size={16} />, label: "Tontine", key: "tontine" },
          { icon: <PiggyBank size={16} />, label: "Banque", key: "banque" },
          { icon: <Building2 size={16} />, label: "Dépôt / Retrait externe", key: "depots" },
          { icon: <HeartHandshake size={16} />, label: "Assurance", key: "assurance" },
          { icon: <FileBarChart size={16} />, label: "Bilan", key: "bilan" },
          { icon: <UserCog size={16} />, label: "Membres", key: "membres" },
        ]}
        active={view} onSelect={setView}
      />
      <div style={{ flex: 1, padding: "32px 40px" }}>
        {view === "tontine" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Cycle de tontine — Août 2026</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>4 membres · cotisation 75 000 FCFA/tour · mode mixte (ordre + enchères)</p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button style={btnSecondary} onClick={() => setShowCotisationTontine(true)}><Plus size={15} /> Enregistrer une cotisation</button>
                <button style={btnPrimary} onClick={() => { setTontineNom(""); setTontineMontant(""); setTontineError(""); setTontineSuccess(false); setShowCreateTontine(true); }}><Plus size={15} /> Créer une tontine</button>
              </div>
            </div>
            <div style={{ marginTop: "26px" }} />
            <Table cols={["Tour", "Bénéficiaire", "Montant", "Mode", "Statut", ""]} widths="0.5fr 1.4fr 1.1fr 1fr 0.9fr 1.1fr"
              rows={tours.map((t) => [
                t.tour, t.beneficiaire, t.montant, t.mode,
                <Badge bg={tourStatus[t.statut].bg} fg={tourStatus[t.statut].fg}>{t.statut}</Badge>,
                t.statut === "en cours" ? (
                  <button
                    onClick={() => setShowPayout(t)}
                    style={{ background: "#2E7D46", color: "#FAF6ED", border: "none", borderRadius: "7px", padding: "6px 12px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
                  >
                    <Banknote size={13} /> Bénéficiaire
                  </button>
                ) : null,
              ])} />
            <div style={{ marginTop: "18px", background: "#EBE6F5", border: `1px solid ${C.purple}44`, borderRadius: "12px", padding: "14px 18px", fontSize: "12.5px", color: C.purple, display: "flex", gap: "8px", alignItems: "center" }}>
              <Gavel size={16} /> Commission d'enchères cumulée ce cycle : <b>22 500 FCFA</b> — redistribuée aux membres à la clôture.
            </div>

            {retards.length > 0 && (
              <div style={{ marginTop: "22px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 10px" }}>Cotisations en retard</h2>
                {retards.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "10px", padding: "12px 16px", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Clock size={16} color={C.warn} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "13px" }}>{r.membre} — Tour {r.tour}</div>
                        <div style={{ fontSize: "11.5px", color: C.warn }}>{r.jours} jours de retard · {r.montantDu} dû</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAmende(r)}
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

        {view === "banque" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Banques du groupe</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>Banque scolaire, banque annuelle, et épargnes personnalisées.</p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button style={btnSecondary} onClick={() => setShowCotisationBanque(true)}><Plus size={15} /> Enregistrer une cotisation</button>
                <button style={btnPrimary} onClick={() => { setEpargneNom(""); setEpargneCotisation(""); setEpargneTaux(""); setEpargneCloture(""); setEpargneType("Personnalisée"); setEpargneError(""); setEpargneSuccess(false); setShowCreateEpargne(true); }}><Plus size={15} /> Créer une épargne</button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "6px", margin: "18px 0 4px" }}>
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
                    <StatCard key={ep.nom} label={ep.nom} value={fmtFCFA(ep.solde)} sub={`Clôture ${ep.cloture}`} icon={<PiggyBank size={16} />} />
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>Prêts en cours — Banque scolaire</h2>
                  <button style={btnSecondary} onClick={() => { setCreditMembre(""); setCreditMontant(""); setCreditDebut(""); setCreditFin(""); setCreditDepasseCaution(false); setCreditAvaliste(""); setCreditError(""); setCreditSuccess(false); setShowCreditForm(true); }}><Plus size={14} /> Mettre en place un crédit</button>
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

        {view === "depots" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Dépôt et retrait externe</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>
                  Versement des fonds du groupe dans une banque externe, après chaque séance, par un signataire du compte.
                </p>
              </div>
              <button style={btnPrimary} onClick={() => { setDepotDate(""); setDepotMontant(""); setDepotMotif(""); setDepotMembreSimple(""); setSignatairesChoisis([]); setRecuJoint(false); setDepotError(""); setDepotSuccess(false); setShowNouveauDepot(true); }}><Plus size={15} /> Enregistrer un mouvement</button>
            </div>

            <div style={{ marginTop: "22px" }}>
              <StatCard label="Solde actuel du compte" value={soldeCompteActuel} sub="Afriland First Bank — Agence Nkolbisson" icon={<Building2 size={16} />} />
            </div>

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
            <Table cols={["Date", "Type", "Montant", "Signataire", "Motif", "Solde du compte", "Statut"]} widths="0.8fr 0.7fr 0.9fr 1fr 1.3fr 1.1fr 1fr"
              rows={depots.map((d) => [
                <span style={{ color: C.sub, fontSize: 12 }}>{d.date}</span>,
                <Badge bg={d.type === "Dépôt" ? C.ok : "#EBE6F5"} fg={d.type === "Dépôt" ? C.accent2 : C.purple}>{d.type}</Badge>,
                <b>{d.montant}</b>,
                d.signataire,
                <span style={{ color: C.sub, fontSize: 12 }}>{d.motif}</span>,
                <b style={{ fontSize: 12.5 }}>{d.solde}</b>,
                <Badge bg={d.statut === "reçu joint" ? C.ok : C.warnBg} fg={d.statut === "reçu joint" ? C.accent2 : C.warn}>{d.statut}</Badge>,
              ])} />
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "10px" }}>
              À chaque retour de séance, le signataire doit joindre le reçu à la ligne correspondante. Un retrait doit toujours préciser son motif (ex. décaissement de prêt, versement de cagnotte).
            </div>
          </>
        )}

        {view === "assurance" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Assurance mutuelle</h1>
                <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 0" }}>Solde minimum requis : 80 000 FCFA par membre · délai de reconstitution : 60 jours.</p>
              </div>
              <button style={btnSecondary} onClick={() => setShowCotisationAssurance(true)}><Plus size={15} /> Enregistrer une cotisation</button>
            </div>
            <div style={{ marginTop: "22px" }} />
            <Table cols={["Membre", "Solde assurance", "Statut", "Délai restant"]} widths="1.6fr 1.2fr 1fr 1.2fr"
              rows={membres.map((m) => {
                const info = assuranceSoldes[m.nom] || { solde: 0, delaiRestant: null };
                const aJour = info.solde >= SOLDE_MIN_ASSURANCE;
                return [
                  m.nom,
                  fmtFCFA(info.solde),
                  aJour
                    ? <Badge bg={C.ok} fg={C.accent2}>à jour</Badge>
                    : <Badge bg={C.warnBg} fg={C.warn}>en reconstitution</Badge>,
                  aJour ? "—" : (info.delaiRestant || "à définir"),
                ];
              })}
            />
            <button style={{ ...btnPrimary, marginTop: "18px" }} onClick={() => { setEvenementBeneficiaire(""); setEvenementMontant(""); setEvenementError(""); setEvenementSuccess(false); setShowDeclarerEvenement(true); }}><HeartHandshake size={15} /> Déclarer un événement</button>
          </>
        )}

        {view === "bilan" && (
          <>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Bilan général</h1>
            <p style={{ fontSize: "13px", color: C.sub, margin: "6px 0 22px" }}>
              À présenter à l'assemblée générale. Calculé en direct à partir des données enregistrées dans l'application.
            </p>
            <div style={{ display: "flex", gap: "14px", marginBottom: "22px" }}>
              <StatCard label="Total en épargnes" value={fmtFCFA(epargnes.reduce((s, ep) => s + ep.solde, 0))} icon={<Wallet size={16} />} />
              <StatCard label="Solde assurance cumulé" value={fmtFCFA(Object.values(assuranceSoldes).reduce((s, a) => s + (a.solde || 0), 0))} icon={<HeartHandshake size={16} />} />
              <StatCard label="Tours effectués" value={`${tours.filter((t) => t.statut === "clôturé").length} / ${tours.length}`} icon={<CheckCircle2 size={16} />} />
            </div>

            <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 10px" }}>Répartition par module</h2>
            <Table cols={["Module", "Solde actuel", "Détail"]} widths="1.4fr 1.2fr 2fr"
              rows={[
                ...epargnes.map((ep) => [
                  ep.nom, fmtFCFA(ep.solde),
                  <span style={{ color: C.sub, fontSize: 12 }}>Clôture {ep.cloture} · taux {ep.tauxInteret}</span>,
                ]),
                [
                  "Tontine",
                  `${tours.filter((t) => t.statut === "clôturé").length} tour(s) clôturé(s)`,
                  <span style={{ color: C.sub, fontSize: 12 }}>{tours.length} tour(s) au total, {tours.filter((t) => t.statut === "en cours").length} en cours</span>,
                ],
                [
                  "Assurance",
                  fmtFCFA(Object.values(assuranceSoldes).reduce((s, a) => s + (a.solde || 0), 0)),
                  <span style={{ color: C.sub, fontSize: 12 }}>{evenements.length} événement(s) déclaré(s) cette année</span>,
                ],
                [
                  "Prêts en cours",
                  `${prets.filter((p) => p.statut === "en cours").length} prêt(s)`,
                  <span style={{ color: C.sub, fontSize: 12 }}>{prets.filter((p) => p.statut === "remboursé").length} remboursé(s)</span>,
                ],
              ]}
            />

            <div style={{ display: "flex", gap: "10px", marginTop: "22px" }}>
              <button style={btnSecondary} onClick={() => setShowRapportJournalier(true)}>Rapport journalier</button>
              <button style={btnSecondary} onClick={() => setShowRapportMensuel(true)}>Rapport mensuel</button>
              <button style={btnPrimary} onClick={() => setShowExportBilan(true)}>Exporter le bilan annuel</button>
            </div>
          </>
        )}

        {view === "membres" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
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
              <button style={btnPrimary} onClick={() => { setInviteNom(""); setInviteTelephone(""); setInviteCaution(""); setInviteError(""); setInviteSuccess(false); setShowInviteMember(true); }}><Plus size={15} /> Inviter un membre</button>
            </div>
            <div style={{ marginTop: "22px" }} />
            <Table cols={["Nom", "Rôle", "Statut", ""]} widths="1.5fr 1.1fr 1fr 1.3fr"
              rows={membres.map((m, i) => [
                m.nom, m.role,
                <Badge bg={m.statut === "actif" ? C.ok : C.warnBg} fg={m.statut === "actif" ? C.accent2 : C.warn}>{m.statut}</Badge>,
                m.statut === "en attente" ? (
                  <button
                    onClick={async () => {
                      try {
                        // ⚠️ validateurId : à remplacer par l'id du membre connecté (Président)
                        // une fois l'authentification branchée.
                        await validerMembre(m.id, m.id);
                        await rechargerMembres();
                      } catch (e) {
                        console.error("Erreur de validation du membre", e);
                      }
                    }}
                    style={{ background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "7px", padding: "6px 12px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Valider (Président)
                  </button>
                ) : null,
              ])} />
            <div style={{ fontSize: "11px", color: C.sub, marginTop: "10px" }}>
              Les membres invités sont sauvegardés automatiquement et restent visibles même après rechargement de la page.
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
            Laissez vide un membre qui n'a pas cotisé — il apparaîtra automatiquement dans les retards.
          </div>
          <button style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }} onClick={() => setShowCotisationTontine(false)}>
            Enregistrer les cotisations
          </button>
        </Modal>
      )}

      {showDeclarerEvenement && (
        <Modal onClose={() => setShowDeclarerEvenement(false)} title="Déclarer un événement">
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Type d'événement</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <select
                value={typeEvenement}
                onChange={(e) => setTypeEvenement(e.target.value)}
                style={{ flex: 1, boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
              >
                {eventTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
              <button
                onClick={() => setShowNewType(!showNewType)}
                style={{ background: C.ok, color: C.accent2, border: `1px solid ${C.accent2}33`, borderRadius: "9px", padding: "0 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
              >
                <Plus size={14} />
              </button>
            </div>
            {showNewType && (
              <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
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
              {membres.map((m) => {
                const info = assuranceSoldes[m.nom] || { solde: 0 };
                const aJour = info.solde >= SOLDE_MIN_ASSURANCE;
                return (
                  <option key={m.nom} value={m.nom} disabled={!aJour}>
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

          <div style={{ display: "flex", gap: "10px" }}>
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
                {membres.map((m) => (
                  <label key={m.nom} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", cursor: "pointer" }}>
                    <input type="checkbox" checked={delegues.includes(m.nom)} onChange={() => toggleDelegue(m.nom)} />
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
            onClick={() => {
              const montantBrut = parseInt(evenementMontant.replace(/[^\d]/g, ""), 10);
              if (!evenementBeneficiaire) { setEvenementError("Sélectionnez un membre bénéficiaire à jour."); setEvenementSuccess(false); return; }
              if (!montantBrut || montantBrut <= 0) { setEvenementError("Saisissez un montant brut valide."); setEvenementSuccess(false); return; }
              const part = montantBrut / membres.length;
              const nouveauxSoldes = { ...assuranceSoldes };
              membres.forEach((m) => {
                const actuel = nouveauxSoldes[m.nom] || { solde: SOLDE_MIN_ASSURANCE, delaiRestant: null };
                const nouveauSolde = Math.max(0, actuel.solde - part);
                nouveauxSoldes[m.nom] = {
                  solde: nouveauSolde,
                  delaiRestant: nouveauSolde < SOLDE_MIN_ASSURANCE ? (actuel.delaiRestant || "60 jours") : null,
                };
              });
              const nouvelEvenement = {
                type: typeEvenement, beneficiaire: evenementBeneficiaire, montant: montantBrut,
                delegues: touteReunion ? "Toute la réunion" : delegues.join(", "),
              };
              persistAssurance(nouveauxSoldes, [...evenements, nouvelEvenement]);
              setEvenementError("");
              setEvenementSuccess(true);
              setTimeout(() => {
                setShowDeclarerEvenement(false);
                setEvenementSuccess(false);
                setEvenementBeneficiaire(""); setEvenementMontant("");
                setDelegues([]); setTouteReunion(false);
                setDeductions([{ label: "Transport des délégués", montant: "" }]);
              }, 1400);
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
          <button style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }} onClick={() => setShowCotisationAssurance(false)}>
            Enregistrer les cotisations
          </button>
        </Modal>
      )}

      {showCreateEpargne && (
        <Modal onClose={() => setShowCreateEpargne(false)} title="Créer une épargne">
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Type</label>
            <div style={{ display: "flex", gap: "8px" }}>
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
            onClick={() => {
              if (!epargneNom.trim()) { setEpargneError("Le nom de l'épargne est obligatoire."); setEpargneSuccess(false); return; }
              if (epargnes.some((ep) => ep.nom.toLowerCase() === epargneNom.trim().toLowerCase())) {
                setEpargneError("Une épargne porte déjà ce nom.");
                setEpargneSuccess(false);
                return;
              }
              const nouvelle = {
                nom: epargneNom.trim(),
                type: epargneType,
                solde: 0,
                cotisation: epargneCotisation.trim() || "—",
                tauxInteret: epargneTaux.trim() || "—",
                cloture: epargneCloture.trim() || "—",
              };
              persistEpargnes([...epargnes, nouvelle]);
              setEpargneError("");
              setEpargneSuccess(true);
              setTimeout(() => {
                setShowCreateEpargne(false);
                setEpargneSuccess(false);
                setEpargneNom(""); setEpargneCotisation(""); setEpargneTaux(""); setEpargneCloture(""); setEpargneType("Personnalisée");
              }, 1200);
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
              value={cotisationEpargne}
              onChange={(e) => setCotisationEpargne(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              {epargnes.map((ep) => (
                <option key={ep.nom}>{ep.nom}</option>
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
          <button style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }} onClick={() => setShowCotisationBanque(false)}>
            Enregistrer les cotisations
          </button>
        </Modal>
      )}

      {showCreditForm && (
        <Modal onClose={() => setShowCreditForm(false)} title="Mettre en place un crédit">
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Membre emprunteur</label>
            <select
              value={creditMembre}
              onChange={(e) => setCreditMembre(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
            >
              <option value="">Sélectionner un membre</option>
              {membres.map((m) => <option key={m.nom} value={m.nom}>{m.nom}</option>)}
            </select>
          </div>
          <FormField label="Montant du prêt" placeholder="Ex. 150 000 FCFA" value={creditMontant} onChange={(e) => setCreditMontant(e.target.value)} />
          <FormField label="Frais de dossier" placeholder="Ex. 5 000 FCFA" />
          <FormField label="Commission du prêt" placeholder="Ex. 2 %" />

          <div style={{ display: "flex", gap: "10px" }}>
            <div style={{ flex: 1 }}>
              <FormField label="Date de début du crédit" placeholder="jj/mm/aaaa" value={creditDebut} onChange={(e) => setCreditDebut(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <FormField label="Date de fin du crédit" placeholder="jj/mm/aaaa" value={creditFin} onChange={(e) => setCreditFin(e.target.value)} />
            </div>
          </div>

          <FormField label="Pénalité en cas de non-remboursement" placeholder="Ex. 3 % du solde dû par mois de retard" />

          <div style={{ fontSize: "11px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            Le taux ou montant de pénalité est fixé par l'admin du groupe et s'applique automatiquement dès l'échéance dépassée.
          </div>

          <div style={{ fontSize: "11.5px", color: C.sub, background: "#EBE6F5", border: `1px solid ${C.purple}44`, borderRadius: "8px", padding: "9px 11px" }}>
            <b style={{ color: C.purple }}>Renouvellement</b> — ce membre a droit à un renouvellement unique de ce crédit, sous réserve du paiement des frais de mise en place à chaque renouvellement.
          </div>

          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 11px" }}>
            Caution du membre : <b>{fmtFCFA(CAUTION_DEFAUT)}</b>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: C.sub, cursor: "pointer" }}>
            <input type="checkbox" checked={creditDepasseCaution} onChange={(e) => setCreditDepasseCaution(e.target.checked)} />
            Le montant demandé dépasse la caution du membre
          </label>

          {creditDepasseCaution && (
            <div>
              <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Avaliste (garant)</label>
              <select
                value={creditAvaliste}
                onChange={(e) => setCreditAvaliste(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
              >
                <option value="">Sélectionner un avaliste</option>
                <option>Rachel Biya — capacité restante 450 000 FCFA</option>
                <option>Jean Mballa — capacité restante 200 000 FCFA</option>
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
            onClick={() => {
              const montantNum = parseInt(creditMontant.replace(/[^\d]/g, ""), 10);
              if (!creditMembre) { setCreditError("Sélectionnez le membre emprunteur."); setCreditSuccess(false); return; }
              if (!montantNum || montantNum <= 0) { setCreditError("Saisissez un montant de prêt valide."); setCreditSuccess(false); return; }
              if (!creditDebut.trim() || !creditFin.trim()) { setCreditError("Les dates de début et de fin sont obligatoires."); setCreditSuccess(false); return; }
              if (montantNum > CAUTION_DEFAUT && !creditDepasseCaution) {
                setCreditError("Ce montant dépasse la caution du membre — cochez la case et désignez un avaliste.");
                setCreditSuccess(false);
                return;
              }
              if (creditDepasseCaution && !creditAvaliste) {
                setCreditError("Sélectionnez un avaliste pour ce crédit.");
                setCreditSuccess(false);
                return;
              }
              const nouveauPret = {
                membre: creditMembre,
                montant: fmtFCFA(montantNum),
                avaliste: creditDepasseCaution ? creditAvaliste.split(" — ")[0] : "—",
                statut: "en cours",
                echeance: creditFin.trim(),
              };
              persistPrets([...prets, nouveauPret]);
              setCreditError("");
              setCreditSuccess(true);
              setTimeout(() => {
                setShowCreditForm(false);
                setCreditSuccess(false);
                setCreditMembre(""); setCreditMontant(""); setCreditDebut(""); setCreditFin("");
                setCreditDepasseCaution(false); setCreditAvaliste("");
              }, 1400);
            }}
          >
            Valider le crédit
          </button>
        </Modal>
      )}

      {showRapportJournalier && (
        <Modal onClose={() => setShowRapportJournalier(false)} title="Rapport journalier">
          <FormField label="Date de la séance" placeholder="jj/mm/aaaa" />
          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 11px" }}>
            Le rapport reprend toutes les cotisations, tours, prêts et aides enregistrés à cette date, prêt à être lu en séance.
          </div>
          <button style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }} onClick={() => setShowRapportJournalier(false)}>
            Générer le rapport
          </button>
        </Modal>
      )}

      {showRapportMensuel && (
        <Modal onClose={() => setShowRapportMensuel(false)} title="Rapport mensuel">
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Mois</label>
            <select style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}>
              <option>Août 2026</option>
              <option>Juillet 2026</option>
              <option>Juin 2026</option>
            </select>
          </div>
          <div style={{ fontSize: "11.5px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 11px" }}>
            Synthèse de toutes les activités du mois sélectionné, tous modules confondus.
          </div>
          <button style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }} onClick={() => setShowRapportMensuel(false)}>
            Générer le rapport
          </button>
        </Modal>
      )}

      {showExportBilan && (
        <Modal onClose={() => setShowExportBilan(false)} title="Exporter le bilan annuel">
          <div style={{ fontSize: "12.5px", color: C.sub }}>
            Le bilan annuel complet sera généré pour présentation à l'assemblée générale : total cotisé, intérêts générés, tours effectués, et détail par module (Tontine, Banque, Assurance).
          </div>
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Format</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {["PDF", "Excel"].map((f, idx) => (
                <div key={f} style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: "8px", border: `1px solid ${idx === 0 ? C.accent2 : C.border}`, background: idx === 0 ? C.ok : "#FBFAF6", fontSize: "12px", fontWeight: 600, color: idx === 0 ? C.accent2 : C.sub, cursor: "pointer" }}>
                  {f}
                </div>
              ))}
            </div>
          </div>
          <button style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }} onClick={() => setShowExportBilan(false)}>
            Télécharger le bilan
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
          <FormField label="Téléphone" placeholder="Ex. 6XX XXX XXX" value={inviteTelephone} onChange={(e) => setInviteTelephone(e.target.value)} />
          <FormField label="Profession" placeholder="Ex. Enseignant, commerçant..." />
          <FormField label="Quartier / Milieu d'habitation" placeholder="Ex. Nkolbisson, Yaoundé" />

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Statut de logement</label>
            <div style={{ display: "flex", gap: "8px" }}>
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
              <div style={{ display: "flex", gap: "8px" }}>
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
            <div style={{ display: "flex", gap: "8px" }}>
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
              <div style={{ display: "flex", gap: "8px" }}>
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
                <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
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

          <FormField label="Caution à l'inscription" placeholder="Ex. 100 000 FCFA" value={inviteCaution} onChange={(e) => setInviteCaution(e.target.value)} />

          <div style={{ fontSize: "11px", color: C.sub, background: "#FBFAF6", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px" }}>
            L'invitation est envoyée au membre, puis soumise à la <b>validation du Président</b> avant qu'il ne rejoigne officiellement le groupe.
          </div>

          {inviteError && (
            <div style={{ fontSize: "11.5px", color: C.warn, background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: "8px", padding: "8px 10px" }}>
              {inviteError}
            </div>
          )}
          {inviteSuccess && (
            <div style={{ fontSize: "11.5px", color: C.accent2, background: C.ok, border: `1px solid ${C.accent2}44`, borderRadius: "8px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} /> Invitation envoyée — {inviteNom} apparaît maintenant "en attente" dans la liste des membres.
            </div>
          )}

          <button
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onClick={async () => {
              if (!inviteNom.trim()) {
                setInviteError("Le nom complet est obligatoire.");
                setInviteSuccess(false);
                return;
              }
              try {
                await inviterMembre(GROUP_ID, {
                  nom: inviteNom.trim(),
                  telephone: inviteTelephone.trim(),
                  typeMembre: roleType,
                  posteId: null, // ⚠️ à relier au vrai id du poste choisi (table postes_bureau) une fois les postes créés en base
                  caution: parseInt(inviteCaution.replace(/[^\d]/g, ""), 10) || 0,
                });
                await rechargerMembres();
                setInviteError("");
                setInviteSuccess(true);
                setInviteNom("");
                setInviteTelephone("");
                setInviteCaution("");
                setTimeout(() => {
                  setShowInviteMember(false);
                  setInviteSuccess(false);
                }, 1200);
              } catch (e) {
                console.error("Erreur d'invitation", e);
                setInviteError("Erreur lors de l'envoi de l'invitation — vérifie la console pour le détail.");
                setInviteSuccess(false);
              }
            }}
          >
            Envoyer l'invitation
          </button>
        </Modal>
      )}

      {showNouveauDepot && (
        <Modal onClose={() => setShowNouveauDepot(false)} title="Enregistrer un mouvement bancaire">
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Type de mouvement</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {["Dépôt", "Retrait"].map((t) => (
                <div
                  key={t}
                  onClick={() => setTypeMouvementBanque(t)}
                  style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: "8px", border: `1px solid ${typeMouvementBanque === t ? C.accent2 : C.border}`, background: typeMouvementBanque === t ? C.ok : "#FBFAF6", fontSize: "12px", fontWeight: 600, color: typeMouvementBanque === t ? C.accent2 : C.sub, cursor: "pointer" }}
                >
                  {t}
                </div>
              ))}
            </div>
          </div>

          <FormField label="Date de la séance" placeholder="jj/mm/aaaa" value={depotDate} onChange={(e) => setDepotDate(e.target.value)} />
          <FormField label="Montant" placeholder="Ex. 1 000 000 FCFA" value={depotMontant} onChange={(e) => setDepotMontant(e.target.value)} />

          {typeMouvementBanque === "Retrait" && (
            <FormField label="Motif du retrait" placeholder="Ex. Décaissement de prêt, versement de cagnotte..." value={depotMotif} onChange={(e) => setDepotMotif(e.target.value)} />
          )}

          {typeMouvementBanque === "Dépôt" ? (
            <div>
              <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Membre effectuant le versement</label>
              <select
                value={depotMembreSimple}
                onChange={(e) => setDepotMembreSimple(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: "9px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "13px", outline: "none" }}
              >
                <option value="">Sélectionner un membre</option>
                {membres.map((m) => <option key={m.nom} value={m.nom}>{m.nom}</option>)}
              </select>
              <div style={{ fontSize: "11px", color: C.sub, marginTop: "5px" }}>
                Pour un versement, n'importe quel membre du groupe peut être désigné.
              </div>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Signataires (2 à 3 requis)</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {signataires.map((s) => (
                  <label key={s} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", cursor: "pointer" }}>
                    <input type="checkbox" checked={signatairesChoisis.includes(s)} onChange={() => toggleSignataire(s)} />
                    {s}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: "11px", color: signatairesChoisis.length >= 2 && signatairesChoisis.length <= 3 ? C.sub : C.warn, marginTop: "6px" }}>
                {signatairesChoisis.length < 2
                  ? "Sélectionnez au moins 2 signataires officiels du compte."
                  : signatairesChoisis.length > 3
                  ? "Maximum 3 signataires pour cette opération."
                  : `${signatairesChoisis.length} signataire(s) sélectionné(s).`}
              </div>
              <div style={{ fontSize: "11px", color: C.sub, marginTop: "4px" }}>
                Un retrait exige la validation de plusieurs signataires officiels, contrairement à un versement.
              </div>
            </div>
          )}

          <FormField label="Banque / Agence" placeholder="Ex. Afriland First Bank — Agence Nkolbisson" value={depotBanque} onChange={(e) => setDepotBanque(e.target.value)} />

          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>
              {typeMouvementBanque === "Retrait" ? "Reçu retrait" : "Reçu de dépôt"}
            </label>
            {!recuJoint ? (
              <div
                onClick={() => setRecuJoint(true)}
                style={{ border: `1.5px dashed ${C.border}`, borderRadius: "10px", padding: "16px", textAlign: "center", background: "#FBFAF6", cursor: "pointer" }}
              >
                <div style={{ fontSize: "12px", fontWeight: 600, color: C.accent2 }}>
                  + Joindre le {typeMouvementBanque === "Retrait" ? "reçu de retrait" : "reçu de dépôt"}
                </div>
                <div style={{ fontSize: "10.5px", color: C.sub, marginTop: "4px" }}>Photo ou scan remis par les signataires au retour de la séance</div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "8px", border: `1px solid ${C.accent2}44`, background: C.ok, fontSize: "12.5px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", color: C.accent2, fontWeight: 600 }}><CheckCircle2 size={14} /> Reçu_120826.jpg</span>
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
            onClick={() => {
              const montantNum = parseInt(depotMontant.replace(/[^\d]/g, ""), 10);
              if (!depotDate.trim()) { setDepotError("La date de la séance est obligatoire."); setDepotSuccess(false); return; }
              if (!montantNum || montantNum <= 0) { setDepotError("Saisissez un montant valide."); setDepotSuccess(false); return; }
              if (typeMouvementBanque === "Retrait" && !depotMotif.trim()) { setDepotError("Le motif est obligatoire pour un retrait."); setDepotSuccess(false); return; }
              if (typeMouvementBanque === "Retrait" && (signatairesChoisis.length < 2 || signatairesChoisis.length > 3)) {
                setDepotError("Sélectionnez entre 2 et 3 signataires pour un retrait.");
                setDepotSuccess(false);
                return;
              }
              if (typeMouvementBanque === "Retrait" && montantNum > (depotsChrono.length ? depotsChrono[depotsChrono.length - 1].soldeNum : 0)) {
                setDepotError("Le montant du retrait dépasse le solde actuel du compte.");
                setDepotSuccess(false);
                return;
              }
              const nouveauMouvement = {
                date: depotDate.trim(),
                type: typeMouvementBanque,
                montantNum,
                signataire: typeMouvementBanque === "Dépôt" ? (depotMembreSimple || "—") : signatairesChoisis.join(", "),
                banque: depotBanque.trim() || "—",
                motif: typeMouvementBanque === "Retrait" ? depotMotif.trim() : "—",
                statut: recuJoint ? "reçu joint" : "en attente du reçu",
              };
              persistDepots([...depotsBruts, nouveauMouvement]);
              setDepotError("");
              setDepotSuccess(true);
              setTimeout(() => {
                setShowNouveauDepot(false);
                setDepotSuccess(false);
                setDepotDate(""); setDepotMontant(""); setDepotMotif(""); setDepotMembreSimple("");
                setSignatairesChoisis([]); setRecuJoint(false);
              }, 1200);
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
            <span style={{ color: C.warn }}>{showAmende.jours} jours de retard</span>
          </div>
          <FormField label="Montant de l'amende" placeholder="Ex. 5 000 FCFA" />
          <FormField label="Motif (optionnel)" placeholder="Ex. Cotisation non versée à la séance" />
          <button
            onClick={() => setShowAmende(null)}
            style={{ marginTop: "6px", background: C.warn, color: "#FFF6EE", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            Appliquer l'amende
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
            onClick={() => {
              const idx = tours.findIndex((t) => t.tour === showPayout.tour);
              const next = tours.map((t, i) => {
                if (i === idx) return { ...t, statut: "clôturé" };
                if (i === idx + 1) return { ...t, statut: "en cours" };
                return t;
              });
              persistTours(next);
              setShowPayout(null);
            }}
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            Confirmer le versement
          </button>
        </Modal>
      )}

      {showCreateTontine && (
        <Modal onClose={() => setShowCreateTontine(false)} title="Créer une tontine">
          <FormField label="Nom de la tontine" placeholder="Ex. Tontine des Bâtisseurs — Cycle 2" value={tontineNom} onChange={(e) => setTontineNom(e.target.value)} />
          <FormField label="Montant cotisé par tour" placeholder="Ex. 75 000 FCFA" value={tontineMontant} onChange={(e) => setTontineMontant(e.target.value)} />
          <FormField label="Nombre de membres participants" placeholder="Ex. 12" />
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>Mode de distribution par défaut</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {["Ordre fixe", "Désignation", "Enchères"].map((m, idx) => (
                <div key={m} style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: "8px", border: `1px solid ${idx === 0 ? C.accent2 : C.border}`, background: idx === 0 ? C.ok : "#FBFAF6", fontSize: "11.5px", fontWeight: 600, color: idx === 0 ? C.accent2 : C.sub, cursor: "pointer" }}>
                  {m}
                </div>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: "12px", color: C.sub, marginBottom: "6px", display: "block" }}>
              Dates de séance et mode de distribution
            </label>
            <p style={{ fontSize: "11px", color: C.sub, margin: "0 0 8px" }}>
              Ajoutez chaque date de réunion et choisissez son mode pour ce tour-là.
            </p>

            {seances.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", marginBottom: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px" }}>
                  <span style={{ fontWeight: 600 }}>{s.date}</span>
                  <Badge bg={s.mode === "Enchères" ? "#EBE6F5" : C.ok} fg={s.mode === "Enchères" ? C.purple : C.accent2}>{s.mode}</Badge>
                </div>
                <X size={14} color={C.sub} style={{ cursor: "pointer" }} onClick={() => removeSeance(i)} />
              </div>
            ))}

            <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
              <input
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                placeholder="jj/mm/aaaa"
                style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none" }}
              />
              <select
                value={newMode}
                onChange={(e) => setNewMode(e.target.value)}
                style={{ padding: "9px 8px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "#FBFAF6", fontSize: "12.5px", outline: "none" }}
              >
                <option>Ordre fixe</option>
                <option>Désignation</option>
                <option>Enchères</option>
              </select>
              <button
                onClick={addSeance}
                style={{ background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "8px", padding: "0 12px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <FormField label="Date de début" placeholder="jj/mm/aaaa" />

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
            style={{ marginTop: "6px", background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onClick={() => {
              if (!tontineNom.trim()) { setTontineError("Le nom de la tontine est obligatoire."); setTontineSuccess(false); return; }
              if (!tontineMontant.trim()) { setTontineError("Le montant cotisé par tour est obligatoire."); setTontineSuccess(false); return; }
              if (seances.length === 0) { setTontineError("Ajoutez au moins une date de séance."); setTontineSuccess(false); return; }
              const nouveauxTours = seances.map((s, i) => ({
                tour: i + 1,
                beneficiaire: s.mode === "Enchères" ? "À désigner (enchères)" : (membres[i % membres.length] ? membres[i % membres.length].nom : "À désigner"),
                montant: i === 0 ? tontineMontant.trim() : "—",
                mode: s.mode,
                statut: i === 0 ? "en cours" : "à venir",
              }));
              persistTours(nouveauxTours);
              setTontineError("");
              setTontineSuccess(true);
              setTimeout(() => {
                setShowCreateTontine(false);
                setTontineSuccess(false);
                setTontineNom(""); setTontineMontant("");
              }, 1400);
            }}
          >
            Créer la tontine
          </button>
        </Modal>
      )}
    </div>
  );
}
function MembreScreen() {
  return (
    <div style={{ minHeight: "680px", background: C.bg, display: "flex", justifyContent: "center", padding: "30px 0" }}>
      <div style={{ width: "360px", background: C.panel, borderRadius: "26px", border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 20px 50px rgba(27,67,50,0.1)" }}>
        <div style={{ background: C.accent2, padding: "22px 20px", color: "#FAF6ED" }}>
          <div style={{ fontSize: "12px", color: "#B7CCBD" }}>Bonjour,</div>
          <div style={{ fontSize: "18px", fontWeight: 700 }}>Paul Ngono</div>
          <div style={{ fontSize: "11px", color: "#9DB3A6", marginTop: "2px" }}>Tontine Les Bâtisseurs</div>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <MiniCard icon={<Banknote size={16} color={C.accent2} />} label="Cotisation tontine" value="75 000 FCFA" note="Tour 3 — payé le 08 Août" ok />
          <MiniCard icon={<PiggyBank size={16} color={C.accent2} />} label="Banque scolaire" value="120 000 FCFA" note="Cotisé au 12 Août 2026" ok />
          <MiniCard icon={<HeartHandshake size={16} color={C.warn} />} label="Assurance" value="62 000 / 80 000 FCFA" note="18 jours pour reconstituer" warn />
          <MiniCard icon={<Wallet size={16} color={C.accent2} />} label="Prêt en cours" value="150 000 FCFA" note="Échéance 15 Sept 2026" />
        </div>

        <div style={{ padding: "0 20px 20px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: C.sub, margin: "6px 0 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Historique récent</div>
          {[
            { label: "Cotisation tontine — Tour 3", date: "08 Août 2026", montant: "-75 000" },
            { label: "Dépôt banque scolaire", date: "12 Août 2026", montant: "+40 000" },
            { label: "Prélèvement assurance — Aide décès", date: "01 Août 2026", montant: "-18 000" },
          ].map((h, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 2 ? `1px solid ${C.border}` : "none", fontSize: "12.5px" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{h.label}</div>
                <div style={{ color: C.sub, fontSize: "11px" }}>{h.date}</div>
              </div>
              <div style={{ fontWeight: 700, color: h.montant.startsWith("+") ? C.accent2 : C.warn }}>{h.montant} FCFA</div>
            </div>
          ))}
        </div>
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
function Sidebar({ role, sub, items, active, onSelect }) {
  return (
    <div style={{ width: "210px", background: C.accent2, padding: "26px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "30px", paddingLeft: "6px" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LayoutDashboard size={16} color={C.accent2} />
        </div>
        <div>
          <div style={{ color: "#FAF6ED", fontWeight: 700, fontSize: "13px", lineHeight: 1.1 }}>{role}</div>
          <div style={{ color: "#9DB3A6", fontSize: "10.5px" }}>{sub}</div>
        </div>
      </div>
      {items.map((item) => (
        <div key={item.key} onClick={() => onSelect(item.key)} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "8px", color: active === item.key ? C.accent2 : "#D7E3DA", background: active === item.key ? C.accent : "transparent", fontSize: "13px", fontWeight: active === item.key ? 600 : 500, cursor: "pointer" }}>
          {item.icon} {item.label}
        </div>
      ))}
      <div style={{ marginTop: "auto", fontSize: "10.5px", color: "#7F9788", paddingLeft: "6px" }}>Three T Solutions — 2026</div>
    </div>
  );
}

function Table({ cols, widths, rows }) {
  return (
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
  );
}

function Badge({ bg, fg, children }) {
  return <span style={{ background: bg, color: fg, fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "999px", textTransform: "capitalize" }}>{children}</span>;
}

function Modal({ children, onClose, title }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
      <div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "26px", width: "360px", maxHeight: "85vh", overflowY: "auto", border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: C.ink }}>{title}</h2>
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

function StatCard({ label, value, sub, icon }) {
  return (
    <div style={{ flex: 1, background: C.panel, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: C.sub, fontSize: "12px", marginBottom: "8px" }}>{icon} {label}</div>
      <div style={{ fontSize: "18px", fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: C.sub, marginTop: "3px" }}>{sub}</div>}
    </div>
  );
}

const btnPrimary = { background: C.accent2, color: "#FAF6ED", border: "none", borderRadius: "10px", padding: "11px 18px", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", whiteSpace: "nowrap" };
const btnSecondary = { background: "transparent", color: C.accent2, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "11px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
