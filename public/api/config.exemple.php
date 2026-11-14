<?php
// Copiez ce fichier en config.php (dans le même dossier api/ sur le serveur)
// et remplissez vos vraies valeurs. Ne mettez JAMAIS config.php sur GitHub.
return [
    // Compte LMT Group (envoi des SMS)
    'LMT_API_KEY'    => 'votre-cle-api-lmt',
    'LMT_API_SECRET' => 'votre-secret-lmt',
    'LMT_SENDER_ID'  => 'TONTINE',

    // Supabase (mêmes valeurs que VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY du .env)
    'SUPABASE_URL'      => 'https://TON-PROJET.supabase.co',
    'SUPABASE_ANON_KEY' => 'ta-cle-anon-publique-ici',
];
