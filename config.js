// config.js — API-Konfiguration für LehrerPlaner
//
// ── Google Calendar API einrichten ───────────────────────────────────────
// 1. Google Cloud Console öffnen: https://console.cloud.google.com
// 2. Neues Projekt anlegen (z.B. "LehrerPlaner")
// 3. APIs & Dienste → Bibliothek → "Google Calendar API" aktivieren
// 4. APIs & Dienste → Anmeldedaten → "Anmeldedaten erstellen" →
//    "OAuth-Client-ID"
//    Anwendungstyp: Webanwendung
//    Autorisierte JavaScript-Quellen hinzufügen:
//      https://pappamap70-dot.github.io
//    (Für lokale Entwicklung zusätzlich: http://localhost und http://localhost:PORT)
// 5. Erstellte Client-ID unten eintragen (endet auf .apps.googleusercontent.com)
// ─────────────────────────────────────────────────────────────────────────

const CONFIG = {
  GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
};
