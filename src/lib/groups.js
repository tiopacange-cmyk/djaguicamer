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

  await supabase.from("audit_log").insert({
    group_id: groupe.id,
    action: "Groupe créé",
    detail: `Formule ${formule} — admin désigné : ${adminNom}`,
    type: "création",
  });

  return { groupe, motDePasseTemp, adminEmail, identifiant };
}

// ============================================================
// ACCÈS D'URGENCE — réinitialisation de mot de passe
// ============================================================
export async function reinitialiserMotDePasse(email, groupId, groupNom) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;

  const { error: logError } = await supabase.from("audit_log").insert({
    group_id: groupId || null,
    action: "Réinitialisation mot de passe",
    detail: `Email de réinitialisation envoyé à ${email}${groupNom ? ` (groupe : ${groupNom})` : ""}`,
    type: "urgence",
  });
  if (logError) console.error("Erreur d'écriture dans le journal d'audit", logError);
}

// ============================================================
// JOURNAL D'AUDIT
// ============================================================
export async function fetchAuditLog() {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data;
}

export async function logAudit({ groupId, action, detail, type }) {
  const { error } = await supabase.from("audit_log").insert({
    group_id: groupId || null,
    action,
    detail,
    type,
  });
  if (error) console.error("Erreur d'écriture dans le journal d'audit", error);
}

// ============================================================
// TARIFS / FORMULES D'ABONNEMENT
// ============================================================
export async function fetchPlansTarifaires() {
  const { data, error } = await supabase
    .from("plans_tarifaires")
    .select("*")
    .order("prix_mensuel", { ascending: true });

  if (error) throw error;
  return data;
}

export async function modifierPlanTarifaire(planId, { prixMensuel, prixAnnuel, limiteMembres, description }) {
  const champs = { updated_at: new Date().toISOString() };
  if (prixMensuel !== undefined) champs.prix_mensuel = prixMensuel;
  if (prixAnnuel !== undefined) champs.prix_annuel = prixAnnuel;
  if (limiteMembres !== undefined) champs.limite_membres = limiteMembres;
  if (description !== undefined) champs.description = description;

  const { data, error } = await supabase
    .from("plans_tarifaires")
    .update(champs)
    .eq("id", planId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
