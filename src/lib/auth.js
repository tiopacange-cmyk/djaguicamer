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
