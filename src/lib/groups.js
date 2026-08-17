import { supabase } from "./supabaseClient";

// Génère un mot de passe temporaire lisible (ex. Tontine-4821)
function genererMotDePasseTemp() {
  const nombre = Math.floor(1000 + Math.random() * 9000);
  return `Tontine-${nombre}`;
}

// Génère un identifiant court à partir du nom (ex. "Jean Mballa" -> "jeanmballa")
function genererIdentifiant(nom) {
  return nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

// Liste tous les groupes (réservé au Super Admin)
export async function fetchGroupes() {
  const { data, error } = await supabase
    .from("groups")
    .select(`
      id, nom, created_at,
      subscriptions ( formule, periodicite, statut, date_expiration )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// Crée un nouveau groupe + un compte admin pour ce groupe.
// L'admin reçoit tout de suite un vrai compte de connexion, avec
// un identifiant court (dérivé de son nom) pour se connecter facilement.
export async function creerGroupeAvecAdmin({ nomGroupe, adminNom, adminEmail, formule = "Essai" }) {
  const motDePasseTemp = genererMotDePasseTemp();
  const identifiantBase = genererIdentifiant(adminNom);
  // Ajoute un petit suffixe aléatoire pour limiter les risques de collision
  const identifiant = `${identifiantBase}${Math.floor(10 + Math.random() * 90)}`;

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: adminEmail,
    password: motDePasseTemp,
  });
  if (authError) throw authError;
  if (!authData.user) throw new Error("Impossible de créer le compte administrateur.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({ auth_user_id: authData.user.id, nom_complet: adminNom, email: adminEmail, identifiant })
    .select()
    .single();
  if (profileError) throw profileError;

  const { data: groupe, error: groupeError } = await supabase
    .from("groups")
    .insert({ nom: nomGroupe })
    .select()
    .single();
  if (groupeError) throw groupeError;

  const dateExpiration = new Date();
  dateExpiration.setDate(dateExpiration.getDate() + 14);
  const { error: subError } = await supabase.from("subscriptions").insert({
    group_id: groupe.id,
    formule,
    statut: "essai",
    date_expiration: dateExpiration.toISOString(),
  });
  if (subError) throw subError;

  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: groupe.id,
    profile_id: profile.id,
    type_membre: "Membre du bureau",
    is_admin: true,
    statut: "actif",
  });
  if (memberError) throw memberError;

  return { groupe, motDePasseTemp, adminEmail, identifiant };
}
