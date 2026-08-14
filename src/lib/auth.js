import { supabase } from "./supabaseClient";

// Inscription d'un nouvel utilisateur (email + mot de passe),
// puis création de son profil dans la table "profiles"
export async function signUp({ email, password, nomComplet }) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  // Si un compte auth a été créé, on crée aussi son profil
  if (data.user) {
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({ id: data.user.id, nom_complet: nomComplet });
    // Si le profil existe déjà (ex. re-tentative), on ignore l'erreur de doublon
    if (profileError && profileError.code !== "23505") throw profileError;
  }

  return data;
}

// Connexion avec email + mot de passe
export async function signIn({ email, password }) {
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
    .eq("id", userData.user.id)
    .single();

  if (error) throw error;
  return data;
}

// Récupère tous les groupes/rôles de l'utilisateur connecté
export async function getMesGroupes() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from("group_members")
    .select(`
      id, is_admin, is_president, statut, type_membre,
      group:groups ( id, nom )
    `)
    .eq("profile_id", userData.user.id)
    .eq("statut", "actif");

  if (error) throw error;
  return data;
}

// Écoute les changements de connexion/déconnexion en direct
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return data.subscription;
}
