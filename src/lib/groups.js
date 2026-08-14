import { supabase } from "./supabaseClient";

// Génère un mot de passe temporaire lisible (ex. Tontine-4821)
function genererMotDePasseTemp() {
  const nombre = Math.floor(1000 + Math.random() * 9000);
  return `Tontine-${nombre}`;
}

// Liste tous les groupes (réservé au Super Admin — nécessite d'être
// authentifié avec un compte marqué is_super_admin = true, sinon RLS bloque)
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
// Retourne le mot de passe temporaire à communiquer à l'admin
// (dans un vrai produit, ce serait un email d'invitation automatique).
export async function creerGroupeAvecAdmin({ nomGroupe, adminNom, adminEmail, formule = "Essai" }) {
  const motDePasseTemp = genererMotDePasseTemp();

  // 1. Créer le compte auth de l'admin
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: adminEmail,
    password: motDePasseTemp,
  });
  if (authError) throw authError;
  if (!authData.user) throw new Error("Impossible de créer le compte administrateur.");

  // 2. Créer son profil
  const { error: profileError } = await supabase
    .from("profiles")
    .insert({ id: authData.user.id, nom_complet: adminNom });
  if (profileError && profileError.code !== "23505") throw profileError;

  // 3. Créer le groupe
  const { data: groupe, error: groupeError } = await supabase
    .from("groups")
    .insert({ nom: nomGroupe })
    .select()
    .single();
  if (groupeError) throw groupeError;

  // 4. Créer l'abonnement (formule Essai par défaut, 14 jours)
  const dateExpiration = new Date();
  dateExpiration.setDate(dateExpiration.getDate() + 14);
  const { error: subError } = await supabase.from("subscriptions").insert({
    group_id: groupe.id,
    formule,
    statut: "essai",
    date_expiration: dateExpiration.toISOString(),
  });
  if (subError) throw subError;

  // 5. Associer l'admin au groupe, avec droits admin
  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: groupe.id,
    profile_id: authData.user.id,
    type_membre: "Membre du bureau",
    is_admin: true,
    statut: "actif",
  });
  if (memberError) throw memberError;

  return { groupe, motDePasseTemp, adminEmail };
}
