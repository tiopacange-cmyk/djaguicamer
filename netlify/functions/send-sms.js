// Fonction Netlify — envoie un SMS via l'API LMT Group.
// La clé API et le secret restent ici, côté serveur, et ne sont
// JAMAIS envoyés au navigateur (variables d'environnement Netlify).
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Méthode non autorisée." }) };
  }

  const apiKey = process.env.LMT_API_KEY;
  const apiSecret = process.env.LMT_API_SECRET;
  const senderIdDefaut = process.env.LMT_SENDER_ID || "TONTINE";

  if (!apiKey || !apiSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: "Clé API SMS non configurée sur le serveur." }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Corps de requête invalide." }) };
  }

  const { message, msisdn, senderId, flag } = payload;

  if (!message || !msisdn || !Array.isArray(msisdn) || msisdn.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "message et msisdn (tableau) sont obligatoires." }) };
  }

  const msisdnNormalises = msisdn
    .map((n) => (n || "").toString().replace(/[^\d]/g, ""))
    .filter((n) => n.length > 0)
    .map((n) => (n.startsWith("237") ? n : `237${n.replace(/^0+/, "")}`));

  if (msisdnNormalises.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "Aucun numéro de téléphone valide." }) };
  }

  try {
    const response = await fetch("https://sms.lmtgroup.com/api/v1/pushes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "X-Secret": apiSecret,
      },
      body: JSON.stringify({
        senderId: senderId || senderIdDefaut,
        message,
        msisdn: msisdnNormalises,
        flag: flag || "GSM7",
        maskedMsisdn: false,
      }),
    });

    const data = await response.json();

    if (response.status !== 201) {
      return { statusCode: response.status, body: JSON.stringify({ error: data.message || "Erreur lors de l'envoi du SMS.", details: data }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, ...data }) };
  } catch (e) {
    console.error("Erreur d'envoi SMS", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Erreur réseau lors de l'envoi du SMS." }) };
  }
};
