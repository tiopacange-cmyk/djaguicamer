import { supabase } from "./supabaseClient";

// Inscription d'un nouvel utilisateur (email + mot de passe),
// puis création (ou liaison) de son profil dans la table "profiles"
export async function signUp({ email, password, nomComplet, identifiant }) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  if (data.user) {
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({ auth_user_id: data.user.id, nom_complet: nomComplet, email, identifiant });
    if (profileError && profileError.code !== "23505") throw profileError;
  }

  return data;
}

// Connexion avec identifiant (court) + mot de passe.
// On retrouve l'email correspondant à l'identifiant, puis on se
// connecte normalement avec cet email en interne.
export async function signIn({ identifiant, password }) {
  const { data: email, error: lookupError } = await supabase.rpc(
    "get_email_pour_identifiant",
    { p_identifiant: identifiant }
  );
  if (lookupError) throw lookupError;
  if (!email) throw new Error("Identifiant introuvable.");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Déconnexion
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Récupère la session actuelle (utilisateur déjà connecté ou non)
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// Récupère le profil complet (avec is_super_admin) de l'utilisateur connecté
export async function getMonProfil() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", userData.user.id)
    .single();

  if (error) throw error;
  return data;
}

// Récupère tous les groupes/rôles de l'utilisateur connecté
export async function getMesGroupes() {
  const monProfil = await getMonProfil();
  if (!monProfil) return [];

  const { data, error } = await supabase
    .from("group_members")
    .select(`
      id, is_admin, is_president, statut, type_membre, poste_id,
      group:groups ( id, nom, slug )
    `)
    .eq("profile_id", monProfil.id)
    .eq("statut", "actif");

  if (error) throw error;
  return data;
}

// Demande une réinitialisation de mot de passe par email, pour un
// identifiant donné. Un lien est envoyé à l'email associé ; en
// cliquant dessus, la personne revient sur l'application et peut
// choisir un nouveau mot de passe.
export async function demanderReinitialisationMotDePasse(identifiant) {
  const { data: email, error: lookupError } = await supabase.rpc(
    "get_email_pour_identifiant",
    { p_identifiant: identifiant }
  );
  if (lookupError) throw new Error("Vérification impossible pour le moment. Réessaie dans un instant.");
  if (!email) throw new Error("Identifiant introuvable. Vérifie l'orthographe (ex. jeanne41).");

  // Le lien ramène sur la page d'où vient la demande (ex. /armens), pour
  // retrouver la page de son groupe.
  const chemin = window.location.pathname && window.location.pathname !== "/" ? window.location.pathname : "";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${chemin}`,
  });
  if (error) {
    if (error.status === 429 || /rate limit|too many|security purposes/i.test(error.message || "")) {
      throw new Error("Trop de demandes : attends quelques minutes avant de réessayer.");
    }
    throw new Error("L'e-mail n'a pas pu être envoyé. Si cela continue, demande à l'administrateur de ton groupe de réinitialiser ton mot de passe (Membres → Accès d'urgence).");
  }
  return email;
}

// Un lien de réinitialisation expiré ou déjà utilisé revient avec une
// erreur dans l'adresse : on la lit, on l'efface, et on l'explique.
export function lireErreurLienEmail() {
  const brut = `${window.location.hash.replace(/^#/, "")}&${window.location.search.replace(/^\?/, "")}`;
  const params = new URLSearchParams(brut);
  const code = params.get("error_code") || params.get("error");
  if (!code) return "";
  window.history.replaceState(null, "", window.location.pathname);
  if (/otp_expired|expired/i.test(`${code} ${params.get("error_description") || ""}`)) {
    return "Ce lien de réinitialisation a expiré ou a déjà été utilisé. Fais une nouvelle demande avec « Mot de passe oublié » : le lien est valable 1 heure et ne sert qu'une fois.";
  }
  return "Ce lien n'est pas valable. Fais une nouvelle demande avec « Mot de passe oublié ».";
}

// Écoute les changements de connexion/déconnexion en direct
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session, event);
  });
  return data.subscription;
}

// Lien « sûr » de réinitialisation : l'e-mail contient ?token_hash=…&type=recovery.
// Ouvrir la page ne consomme rien (les boîtes mail qui vérifient les liens
// toutes seules ne le cassent plus) : le lien n'est utilisé qu'au clic sur
// « Enregistrer », avec le nouveau mot de passe.
export function lireLienRecuperation() {
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get("token_hash");
  if (!tokenHash || params.get("type") !== "recovery") return null;
  window.history.replaceState(null, "", window.location.pathname);
  return tokenHash;
}

export async function reinitialiserAvecLien(tokenHash, nouveauMotDePasse) {
  const { error: eV } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (eV) {
    throw new Error("Ce lien a expiré ou a déjà été utilisé. Retourne à la connexion et fais une nouvelle demande avec « Mot de passe oublié ».");
  }
  const { error } = await supabase.auth.updateUser({ password: nouveauMotDePasse });
  if (error) throw new Error(/should be different|same/i.test(error.message || "") ? "Choisis un mot de passe différent de l'ancien." : "Le mot de passe n'a pas pu être changé. Réessaie.");
  const { data } = await supabase.auth.getUser();
  if (data?.user) await supabase.from("profiles").update({ doit_changer_mdp: false }).eq("auth_user_id", data.user.id);
}
