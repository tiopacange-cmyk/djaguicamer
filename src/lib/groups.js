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
      id, nom, created_at, sms_credits,
      subscriptions ( formule, periodicite, statut, date_expiration )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// Crée un nouveau groupe + un compte admin pour ce groupe.
// L'admin reçoit tout de suite un vrai compte de connexion, avec
// un identifiant court (dérivé de son nom) pour se connecter facilement.
export async function creerGroupeAvecAdmin({ nomGroupe, adminNom, adminEmail, formule = "Essai", periodicite, creditSms = 0 }) {
  const motDePasseTemp = genererMotDePasseTemp();
  const identifiantBase = genererIdentifiant(adminNom);
  // Ajoute un petit suffixe aléatoire pour limiter les risques de collision
  const identifiant = `${identifiantBase}${Math.floor(10 + Math.random() * 90)}`;

  // Sauvegarde la session du Super Admin AVANT de créer le compte
  // du nouvel admin — sans ça, la création du compte (signUp)
  // remplace la session active par celle du nouvel admin, ce qui
  // casse tout le reste de la création (RLS refuse les insertions
  // suivantes puisqu'elles ne s'exécutent plus avec les droits
  // Super Admin).
  const { data: { session: sessionSuperAdmin } } = await supabase.auth.getSession();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: adminEmail,
    password: motDePasseTemp,
  });
  if (authError) throw authError;
  if (!authData.user) throw new Error("Impossible de créer le compte administrateur.");

  // Restaure la session du Super Admin avant toute autre opération
  if (sessionSuperAdmin) {
    await supabase.auth.setSession({
      access_token: sessionSuperAdmin.access_token,
      refresh_token: sessionSuperAdmin.refresh_token,
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({ auth_user_id: authData.user.id, nom_complet: adminNom, email: adminEmail, identifiant, doit_changer_mdp: true })
    .select()
    .single();
  if (profileError) throw profileError;

  const { data: groupe, error: groupeError } = await supabase
    .from("groups")
    .insert({ nom: nomGroupe, sms_credits: creditSms })
    .select()
    .single();
  if (groupeError) throw groupeError;

  // La durée d'accès dépend du plan choisi : essai = 14 jours fixes,
  // sinon 30 jours (mensuel) ou 365 jours (annuel).
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

// ============================================================
// ACCÈS D'URGENCE — réinitialisation directe du mot de passe
// (sans email, pour un accès immédiat)
// ============================================================

// Liste tous les admins/présidents de tous les groupes, pour que
// le Super Admin les choisisse dans une liste plutôt que de taper
// un email
export async function fetchAdminsDesGroupes() {
  const { data, error } = await supabase
    .from("group_members")
    .select(`
      is_admin, is_president,
      profile:profiles ( email, nom_complet, identifiant ),
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
      identifiant: m.profile.identifiant,
      groupId: m.group?.id,
      groupNom: m.group?.nom,
      role: m.is_president ? "Président" : "Admin",
    }));
}

// Réinitialise directement le mot de passe (sans email), génère
// un nouveau mot de passe temporaire, et marque que la personne
// devra en choisir un nouveau à sa prochaine connexion.
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

// Change son propre mot de passe (utilisé après une réinitialisation
// d'urgence, à la prochaine connexion)
export async function changerMotDePasse(nouveauMotDePasse) {
  const { error } = await supabase.auth.updateUser({ password: nouveauMotDePasse });
  if (error) throw error;

  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    await supabase.from("profiles").update({ doit_changer_mdp: false }).eq("auth_user_id", userData.user.id);
  }
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

// ============================================================
// LICENCE / ABONNEMENT — vérification d'accès et renouvellement
// ============================================================

// Récupère le statut d'abonnement le plus récent d'un groupe, avec
// le nombre de jours restants avant expiration.
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

// Renouvelle l'abonnement d'un groupe : prolonge la date
// d'expiration de 30 (mensuel) ou 365 (annuel) jours, à partir
// d'aujourd'hui ou de la date d'expiration actuelle si elle n'est
// pas encore dépassée.
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

// ============================================================
// MODIFIER / SUSPENDRE UN GROUPE
// ============================================================

export async function modifierGroupe(groupId, nom) {
  const { error } = await supabase.from("groups").update({ nom }).eq("id", groupId);
  if (error) throw error;
}

// Suspend l'accès au groupe sans rien supprimer (bloque la
// connexion de tous ses membres, comme une licence expirée)
export async function suspendreGroupe(groupId) {
  const { error } = await supabase
    .from("subscriptions")
    .update({ statut: "suspendu" })
    .eq("group_id", groupId);
  if (error) throw error;
}

// Réactive un groupe précédemment suspendu
export async function reactiverGroupe(groupId) {
  const { error } = await supabase
    .from("subscriptions")
    .update({ statut: "actif" })
    .eq("group_id", groupId);
  if (error) throw error;
}

// ============================================================
// TABLEAU DE BORD SUPER ADMIN — statistiques globales de la
// plateforme, tous groupes confondus.
// ============================================================
export async function fetchStatsPlateforme() {
  const { data: groupes, error: errG } = await supabase
    .from("groups")
    .select("id, nom, created_at, subscriptions(formule, statut, date_expiration)");
  if (errG) throw errG;

  const { count: totalMembres, error: errM } = await supabase
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("statut", "actif");
  if (errM) throw errM;

  const aujourdHui = new Date();
  const dansSeptJours = new Date(aujourdHui.getTime() + 7 * 86400000);

  const parFormule = {};
  let expirentBientot = [];
  let expires = 0;
  let actifs = 0;
  let essais = 0;
  let suspendus = 0;

  groupes.forEach((g) => {
    const abo = g.subscriptions?.[0];
    if (!abo) return;
    parFormule[abo.formule] = (parFormule[abo.formule] || 0) + 1;

    const dateExp = new Date(abo.date_expiration);
    if (abo.statut === "suspendu") suspendus += 1;
    else if (dateExp < aujourdHui) expires += 1;
    else if (abo.statut === "essai") essais += 1;
    else actifs += 1;

    if (dateExp >= aujourdHui && dateExp <= dansSeptJours && abo.statut !== "suspendu") {
      expirentBientot.push({ nom: g.nom, dateExpiration: abo.date_expiration, formule: abo.formule });
    }
  });

  return {
    totalGroupes: groupes.length,
    totalMembres: totalMembres || 0,
    parFormule,
    actifs,
    essais,
    expires,
    suspendus,
    expirentBientot: expirentBientot.sort((a, b) => a.dateExpiration.localeCompare(b.dateExpiration)),
    groupesRecents: groupes
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5)
      .map((g) => ({ nom: g.nom, date: g.created_at })),
  };
}

// ============================================================
// CRÉDITS SMS — vendus par le Super Admin à chaque groupe
// ============================================================

export async function fetchSoldeSms(groupId) {
  const { data, error } = await supabase.from("groups").select("sms_credits, sms_bloquer_si_epuise").eq("id", groupId).single();
  if (error) throw error;
  return { solde: data.sms_credits, bloquerSiEpuise: data.sms_bloquer_si_epuise };
}

export async function vendreCreditsSms(groupId, quantite, prix, modePaiement, note) {
  const { data, error } = await supabase.rpc("vendre_credits_sms", {
    p_group_id: groupId,
    p_quantite: quantite,
    p_prix: prix || null,
    p_mode: modePaiement || null,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}

export async function definirBlocageSms(groupId, bloquer) {
  const { error } = await supabase.from("groups").update({ sms_bloquer_si_epuise: bloquer }).eq("id", groupId);
  if (error) throw error;
}

export async function fetchHistoriqueSms(groupId) {
  const { data, error } = await supabase
    .from("sms_credits_mouvements")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
