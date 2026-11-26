import { supabase } from "./supabaseClient";

// Envoie un SMS à un ou plusieurs numéros, via le script PHP
// api/send-sms.php de l'hébergement (la clé API ne transite jamais
// par le navigateur). Le jeton de session accompagne la requête ; le
// serveur vérifie avec la base que la personne est administrateur du
// groupe, que le crédit SMS suffit, utilise l'expéditeur du groupe,
// puis décompte le crédit après l'envoi.
// Ne bloque jamais l'action principale : en cas d'échec (y compris
// crédits épuisés), l'erreur est journalisée en console mais aucune
// exception n'est levée.
export async function envoyerSMS({ message, numeros, groupId }) {
  const liste = Array.isArray(numeros) ? numeros : [numeros];
  const valides = liste.filter((n) => n && n.toString().trim().length > 0);
  if (valides.length === 0) return { success: false, error: "Aucun numéro valide." };
  if (!groupId) return { success: false, error: "Groupe manquant pour l'envoi du SMS." };

  // Le serveur vérifie tout : administrateur du groupe, crédit SMS,
  // expéditeur du groupe, et décompte le crédit après l'envoi.
  try {
    const { data: session } = await supabase.auth.getSession();
    const jeton = session?.session?.access_token;
    const res = await fetch(import.meta.env.VITE_SMS_ENDPOINT || "/api/send-sms.php", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
      body: JSON.stringify({ message, msisdn: valides, groupId }),
    });
    const data = await res.json().catch(() => ({ error: `Réponse invalide du serveur SMS (${res.status}).` }));
    if (!res.ok) {
      console.error("Erreur d'envoi SMS", data);
      return { success: false, error: data.error };
    }
    return { success: true, data };
  } catch (e) {
    console.error("Erreur réseau lors de l'envoi du SMS", e);
    return { success: false, error: e.message };
  }
}
