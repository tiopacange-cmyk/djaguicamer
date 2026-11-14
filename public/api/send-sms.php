<?php
// Envoi de SMS via l'API LMT Group, pour un hébergement PHP (LWS, cPanel…).
// La clé API et le secret restent sur le serveur, dans config.php, et ne
// sont JAMAIS envoyés au navigateur. Seul un utilisateur connecté à
// l'application (jeton Supabase valide) peut déclencher un envoi.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function repondre($code, $donnees) {
    http_response_code($code);
    echo json_encode($donnees, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function appelHttp($url, $entetes, $corps = null) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $entetes,
        CURLOPT_TIMEOUT => 20,
    ]);
    if ($corps !== null) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $corps);
    }
    $reponse = curl_exec($ch);
    $statut = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $erreur = curl_error($ch);
    curl_close($ch);
    return [$statut, $reponse, $erreur];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    repondre(405, ['error' => 'Méthode non autorisée.']);
}

$fichierConfig = __DIR__ . '/config.php';
if (!is_file($fichierConfig)) {
    repondre(500, ['error' => 'Configuration SMS absente sur le serveur (api/config.php).']);
}
$config = require $fichierConfig;

$apiKey = $config['LMT_API_KEY'] ?? '';
$apiSecret = $config['LMT_API_SECRET'] ?? '';
$senderIdDefaut = ($config['LMT_SENDER_ID'] ?? '') ?: 'TONTINE';
$supabaseUrl = rtrim($config['SUPABASE_URL'] ?? '', '/');
$supabaseAnon = $config['SUPABASE_ANON_KEY'] ?? '';

if ($apiKey === '' || $apiSecret === '') {
    repondre(500, ['error' => 'Clé API SMS non configurée sur le serveur.']);
}
if ($supabaseUrl === '' || $supabaseAnon === '') {
    repondre(500, ['error' => 'Supabase non configuré sur le serveur.']);
}

// Vérifie que l'appel vient d'un utilisateur connecté à l'application.
$autorisation = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer\s+(\S+)$/i', $autorisation, $m)) {
    repondre(401, ['error' => 'Connexion requise pour envoyer un SMS.']);
}
[$statutAuth, , ] = appelHttp($supabaseUrl . '/auth/v1/user', [
    'apikey: ' . $supabaseAnon,
    'Authorization: Bearer ' . $m[1],
]);
if ($statutAuth !== 200) {
    repondre(401, ['error' => 'Session expirée ou invalide.']);
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    repondre(400, ['error' => 'Corps de requête invalide.']);
}

$message = $payload['message'] ?? '';
$msisdn = $payload['msisdn'] ?? null;
$senderId = $payload['senderId'] ?? '';
$flag = $payload['flag'] ?? '';

if (!is_string($message) || $message === '' || !is_array($msisdn) || count($msisdn) === 0) {
    repondre(400, ['error' => 'message et msisdn (tableau) sont obligatoires.']);
}

$msisdnNormalises = [];
foreach ($msisdn as $n) {
    $chiffres = preg_replace('/\D/', '', (string) $n);
    if ($chiffres === '') continue;
    $msisdnNormalises[] = strpos($chiffres, '237') === 0 ? $chiffres : '237' . ltrim($chiffres, '0');
}
if (count($msisdnNormalises) === 0) {
    repondre(400, ['error' => 'Aucun numéro de téléphone valide.']);
}

[$statut, $reponse, $erreur] = appelHttp('https://sms.lmtgroup.com/api/v1/pushes', [
    'Content-Type: application/json',
    'X-Api-Key: ' . $apiKey,
    'X-Secret: ' . $apiSecret,
], json_encode([
    'senderId' => $senderId ?: $senderIdDefaut,
    'message' => $message,
    'msisdn' => $msisdnNormalises,
    'flag' => $flag ?: 'GSM7',
    'maskedMsisdn' => false,
], JSON_UNESCAPED_UNICODE));

if ($reponse === false) {
    error_log('Erreur d\'envoi SMS : ' . $erreur);
    repondre(500, ['error' => 'Erreur réseau lors de l\'envoi du SMS.']);
}

$data = json_decode($reponse, true);
if (!is_array($data)) $data = [];

if ($statut !== 201) {
    repondre($statut ?: 502, ['error' => $data['message'] ?? 'Erreur lors de l\'envoi du SMS.', 'details' => $data]);
}

repondre(200, array_merge(['success' => true], $data));
