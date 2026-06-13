/* ============================================================
   Horus — CONFIGURAZIONE
   Unico file da modificare per collegare la demo al tuo backend.
   Vedi SETUP.md per ottenere ogni valore.
   ============================================================ */
const MG_CONFIG = {
  // Nome dell'app (compare in header, notifiche, assistente e dashboard)
  APP_NAME: 'Horus',

  // --- Supabase (Dashboard → Project Settings → API) ---
  SUPABASE_URL: 'https://TUO-PROGETTO.supabase.co',
  SUPABASE_ANON_KEY: 'INCOLLA-QUI-LA-ANON-KEY',

  // --- Web Push (genera con: npx web-push generate-vapid-keys) ---
  VAPID_PUBLIC_KEY: 'INCOLLA-QUI-LA-VAPID-PUBLIC-KEY',

  // --- Parametri demo ---
  DEFAULT_PATIENT_CODE: 'MG-001', // prefisso del codice paziente generato al primo avvio
  WINDOW_SECONDS: 30,             // durata della finestra di analisi vocale "collana"
  USE_TTS_DEFAULT: true           // l'app legge le domande del check-in ad alta voce
};

// true solo quando l'URL è stato davvero compilato
const MG_CONFIGURED =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(MG_CONFIG.SUPABASE_URL) &&
  !MG_CONFIG.SUPABASE_ANON_KEY.includes('INCOLLA');
