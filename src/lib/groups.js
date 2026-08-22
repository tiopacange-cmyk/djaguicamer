import { supabase } from "./supabaseClient";

function genererMotDePasseTemp() {
  const nombre = Math.floor(1000 + Math.random() * 9000);
  return `Tontine-${nombre}`;
}

function genererIdentifiant(nom) {
  return nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

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

export async function creerGroupeAvecAdmin({ nomGroupe, adminNom, adminEmail, formule = "Essai", periodicite }) {
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
    .insert({ auth_user_id: authData.user.id, nom_complet: adminNom, email: adminEmail, identifiant, doit_changer_mdp: true })
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
  const nbJours = formule === "Essai" ? 14 : periodicite === "Annuel" ? 365 : 30;
  dateExpiration.setDate(dateExpiration.getDate() + nbJours);

  const { error: subError } = await supabase.from("subscriptions").insert({
    group_id: groupe.id,
    formule,
    periodicite: formule === "Essai" ? null : periodicite,
    statut: formule === "Essai" ? "essai" : "actif",
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

export async function fetchAdminsDesGroupes() {
  const { data, error } = await supabase
    .from("group_members")
    .select(`
      is_admin, is_president,
      profile:profiles ( email, nom_complet ),
      group:groups ( id, nom )
    `)
    .or("is_admin.eq.true,is_president.eq.true")
    .eq("statut", "actif");

  if (error) throw error;

  return data
    .filter((m) => m.profile?.email)
    .map((m) => ({
      email: m.profile.email,
      nom: m.profile.nom_complet,
      groupId: m.group?.id,
      groupNom: m.group?.nom,
      role: m.is_president ? "Président" : "Admin",
    }));
}

export async function reinitialiserMotDePasseDirect(email, groupId, groupNom) {
  const motDePasseTemp = genererMotDePasseTemp();

  const { error } = await supabase.rpc("reset_password_super_admin", {
    p_email: email,
    p_nouveau_mdp: motDePasseTemp,
  });
  if (error) throw error;

  const { error: logError } = await supabase.from("audit_log").insert({
    group_id: groupId || null,
    action: "Réinitialisation mot de passe",
    detail: `Mot de passe réinitialisé pour ${email}${groupNom ? ` (groupe : ${groupNom})` : ""}`,
    type: "urgence",
  });
  if (logError) console.error("Erreur d'écriture dans le journal d'audit", logError);

  return motDePasseTemp;
}

export async function changerMotDePasse(nouveauMotDePasse) {
  const { error } = await supabase.auth.updateUser({ password: nouveauMotDePasse });
  if (error) throw error;

  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    await supabase.from("profiles").update({ doit_changer_mdp: false }).eq("auth_user_id", userData.user.id);
  }
}

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

export async function fetchStatutAbonnement(groupId) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const joursRestants = Math.ceil((new Date(data.date_expiration) - new Date()) / 86400000);
  return {
    formule: data.formule,
    periodicite: data.periodicite,
    statut: data.statut,
    dateExpiration: data.date_expiration,
    joursRestants,
    expire: joursRestants < 0,
  };
}

export async function renouvelerAbonnement(groupId, formule, periodicite) {
  const { data: actuel, error: errLecture } = await supabase
    .from("subscriptions")
    .select("date_expiration")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errLecture) throw errLecture;

  const base = actuel && new Date(actuel.date_expiration) > new Date() ? new Date(actuel.date_expiration) : new Date();
  const nbJours = periodicite === "Annuel" ? 365 : 30;
  base.setDate(base.getDate() + nbJours);

  const { error } = await supabase.from("subscriptions").insert({
    group_id: groupId,
    formule,
    periodicite,
    statut: "actif",
    date_expiration: base.toISOString(),
  });
  if (error) throw error;
}

// ============================================================
// LOGO DU GROUPE
// ============================================================
export async function televerserLogoGroupe(groupId, fichier) {
  const extension = fichier.name.split(".").pop();
  const chemin = `${groupId}/logo-${Date.now()}.${extension}`;

  const { error: errUpload } = await supabase.storage.from("logos-groupes").upload(chemin, fichier);
  if (errUpload) throw errUpload;

  const { data: urlData } = supabase.storage.from("logos-groupes").getPublicUrl(chemin);

  const { error } = await supabase.from("groups").update({ logo_url: urlData.publicUrl }).eq("id", groupId);
  if (error) throw error;

  return urlData.publicUrl;
}

export async function fetchLogoGroupe(groupId) {
  const { data, error } = await supabase.from("groups").select("logo_url").eq("id", groupId).maybeSingle();
  if (error) throw error;
  return data?.logo_url || "";
}
