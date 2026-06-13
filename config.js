/* ============================================================
   Horus — CONFIGURAZIONE
   Unico file da modificare per collegare la demo al tuo backend.
   Vedi SETUP.md per ottenere ogni valore.
   ============================================================ */
const MG_CONFIG = {
  // Nome dell'app (compare in header, notifiche, assistente e dashboard)
  APP_NAME: 'Horus',

  // --- Supabase (Dashboard → Project Settings → API) ---
  SUPABASE_URL: 'https://nlovdhxymuvnxnveampb.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_wiMyt2rTURQFrdEAX0gtKQ_0VR8hi0A',

  // --- Web Push (genera con: npx web-push generate-vapid-keys) ---
  VAPID_PUBLIC_KEY: 'BMK9Ee4QEuL5JoJWmu-3z9TMB3Z22s8iinzH7DoNtoYMwKDNw5IJadTxDrS-BHSBuxDnvEAUt3LRG0DhjBK3KIw',

  // --- Parametri demo ---
  DEFAULT_PATIENT_CODE: 'MG-001', // prefisso del codice paziente generato al primo avvio
  WINDOW_SECONDS: 30,             // durata della finestra di analisi vocale "collana"
  USE_TTS_DEFAULT: true,          // l'app legge le domande del check-in ad alta voce

  // --- Voce naturale (cloud, Google) — devono combaciare con la Edge Function e con gen-prompts.mjs ---
  TTS_CLOUD_VOICE: 'it-IT-Wavenet-D', // voce Google (vedi libreria voci: https://cloud.google.com/text-to-speech/docs/voices)
  TTS_CLOUD_PITCH: -2.5,          // tono: negativo = più basso/caldo (range -20..20). Ignorato dalle voci Chirp3-HD
  TTS_CLOUD_RATE: 0.97            // velocità: <1 = più lenta e posata (range 0.25..4)
};

// true solo quando l'URL è stato davvero compilato
const MG_CONFIGURED =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(MG_CONFIG.SUPABASE_URL) &&
  !MG_CONFIG.SUPABASE_ANON_KEY.includes('INCOLLA');
