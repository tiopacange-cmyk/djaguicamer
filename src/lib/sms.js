import { supabase } from "./supabaseClient";

// Envoie un SMS à un ou plusieurs numéros, via la fonction Netlify
// sécurisée (la clé API ne transite jamais par le navigateur).
// Ne bloque jamais l'action principale : en cas d'échec (y compris
// crédits épuisés), l'erreur est journalisée en console mais aucune
// exception n'est levée, pour ne jamais empêcher l'enregistrement
// d'une cotisation, d'un versement, etc.
//
// Si un groupId est fourni, vérifie et décompte le crédit SMS du
// groupe. Le comportement à solde épuisé est configurable par
// groupe (bloquer complètement, ou laisser passer en avertissant).
export async function envoyerSMS({ message, numeros, senderId, groupId }) {
  const liste = Array.isArray(numeros) ? numeros : [numeros];
  const valides = liste.filter((n) => n && n.toString().trim().length > 0);
  if (valides.length === 0) return { success: false, error: "Aucun numéro valide." };

  if (groupId) {
    try {
      const { data: g, error: errG } = await supabase
        .from("groups")
        .select("sms_credits, sms_bloquer_si_epuise")
        .eq("id", groupId)
        .single();
      if (!errG && g && g.sms_credits <= 0 && g.sms_bloquer_si_epuise) {
        console.warn("Crédits SMS épuisés — envoi bloqué pour ce groupe.");
        return { success: false, error: "Crédits SMS épuisés pour ce groupe." };
      }
    } catch (e) {
      console.error("Erreur de vérification du crédit SMS", e);
      // En cas d'erreur de vérification, on laisse passer plutôt
      // que de bloquer toute l'application pour ça.
    }
  }

  try {
    const res = await fetch("/.netlify/functions/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, msisdn: valides, senderId }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Erreur d'envoi SMS", data);
      return { success: false, error: data.error };
    }

    if (groupId) {
      try {
        await supabase.rpc("decrementer_credits_sms", { p_group_id: groupId, p_quantite: valides.length });
      } catch (e) {
        console.error("Erreur de décompte des crédits SMS", e);
      }
    }

    return { success: true, data };
  } catch (e) {
    console.error("Erreur réseau lors de l'envoi du SMS", e);
    return { success: false, error: e.message };
  }
}
