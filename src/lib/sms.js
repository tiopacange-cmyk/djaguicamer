// Envoie un SMS à un ou plusieurs numéros, via la fonction Netlify
// sécurisée (la clé API ne transite jamais par le navigateur).
export async function envoyerSMS({ message, numeros, senderId }) {
  const liste = Array.isArray(numeros) ? numeros : [numeros];
  const valides = liste.filter((n) => n && n.toString().trim().length > 0);
  if (valides.length === 0) return { success: false, error: "Aucun numéro valide." };

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
    return { success: true, data };
  } catch (e) {
    console.error("Erreur réseau lors de l'envoi du SMS", e);
    return { success: false, error: e.message };
  }
}
