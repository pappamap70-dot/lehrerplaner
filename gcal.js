// gcal.js — Google Calendar Sync für LehrerPlaner
// Datenschutz: nur Termine ohne Personenbezug werden synchronisiert.
// Keine Schülerdaten, Noten, Anwesenheit oder Bemerkungen.
//
// Google Cloud Console → Branding → Datenschutzrichtlinien-URL hinterlegen:
// https://pappamap70-dot.github.io/lehrerplaner/datenschutz.html
'use strict';

const GCal = (() => {
  // ── Konfiguration ────────────────────────────────────────────
  const GIS_URL    = 'https://accounts.google.com/gsi/client';
  const SCOPE      = 'https://www.googleapis.com/auth/calendar';
  const CAL_ID     = 'primary';
  // Sync-Fenster: 30 Tage zurück, 180 Tage voraus
  const PAST_DAYS  = 30;
  const FUTURE_DAYS = 180;

  // Nur diese Typen werden nach Google gepusht (kein Personenbezug)
  const PUSH_TYPES = new Set(['appointment','schultermin','konferenz','klassenarbeit','task']);

  // ── Hilfsfunktionen (Datum) ───────────────────────────────────
  function _isoDate(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function _rangeStart() { const d = new Date(); d.setDate(d.getDate() - PAST_DAYS); return d; }
  function _rangeEnd()   { const d = new Date(); d.setDate(d.getDate() + FUTURE_DAYS); return d; }

  // ── Client-ID (DB hat Vorrang vor config.js) ────────────────
  async function _getClientId() {
    const fromDb = await DB.getSetting('gcalClientId');
    if (fromDb && fromDb.trim() && !fromDb.includes('YOUR_GOOGLE')) return fromDb.trim();
    const fromConfig = CONFIG?.GOOGLE_CLIENT_ID;
    if (fromConfig && !fromConfig.includes('YOUR_GOOGLE')) return fromConfig;
    return null;
  }

  // ── Token-Verwaltung (IndexedDB settings) ────────────────────
  async function _getToken() {
    try {
      const raw = await DB.getSetting('gcalToken');
      if (!raw) return null;
      const t = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Date.now() >= t.expires_at) return null; // abgelaufen
      return t;
    } catch (_) { return null; }
  }

  async function _saveToken(tr) {
    // Gültigkeitsdauer: expires_in Sekunden minus 60s Puffer
    const expires_at = Date.now() + ((tr.expires_in || 3600) - 60) * 1000;
    await DB.setSetting('gcalToken', JSON.stringify({
      access_token: tr.access_token,
      expires_at,
    }));
  }

  async function _clearToken() {
    await DB.setSetting('gcalToken', null);
  }

  // ── GIS (Google Identity Services) laden ─────────────────────
  function _loadGis() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) { resolve(); return; }
      if (document.getElementById('gis-script')) {
        // Bereits im DOM, warten bis geladen
        const poll = setInterval(() => {
          if (window.google?.accounts?.oauth2) { clearInterval(poll); resolve(); }
        }, 100);
        setTimeout(() => { clearInterval(poll); reject(new Error('GIS timeout')); }, 10000);
        return;
      }
      const s = document.createElement('script');
      s.id    = 'gis-script';
      s.src   = GIS_URL;
      s.async = true;
      s.defer = true;
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Google Identity Services konnte nicht geladen werden'));
      document.head.appendChild(s);
    });
  }

  // ── Calendar REST API (fetch-basiert) ────────────────────────
  async function _apiFetch(method, path, body) {
    if (!navigator.onLine) throw new Error('Kein Internet — Sync nicht möglich');
    const token = await _getToken();
    if (!token) throw new Error('Nicht authentifiziert — bitte neu verbinden');

    const url = `https://www.googleapis.com/calendar/v3${path}`;
    const opts = {
      method,
      headers: { 'Authorization': `Bearer ${token.access_token}` },
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);

    if (res.status === 401) {
      await _clearToken();
      throw new Error('Sitzung abgelaufen — bitte Google Kalender erneut verbinden');
    }
    if (res.status === 404) return null;   // Event nicht mehr vorhanden
    if (res.status === 204) return null;   // Delete-Erfolg
    if (!res.ok) {
      let msg = `${res.status}`;
      try { const j = await res.json(); msg = j.error?.message || msg; } catch (_) {}
      throw new Error(`Google Calendar API: ${msg}`);
    }
    return res.json();
  }

  // ── App-Event → Google Event ──────────────────────────────────
  const TYPE_LABELS = {
    appointment: 'Termin', schultermin: 'Schultermin',
    konferenz: 'Konferenz', klassenarbeit: 'Klassenarbeit', task: 'Aufgabe',
  };
  const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function _toGEvent(ev) {
    const typeLabel = TYPE_LABELS[ev.type] || ev.type;
    const gev = {
      summary:     `[LP] ${ev.title}`,
      description: `Typ: ${typeLabel}${ev.text ? '\n\n' + ev.text : ''}`,
      extendedProperties: {
        private: { lehrerplanerId: String(ev.id) },
      },
    };
    // Datum + optional Uhrzeit
    const nextDay = _isoDate(new Date(new Date(ev.date).getTime() + 86400000));
    if (ev.timeStart) {
      gev.start = { dateTime: `${ev.date}T${ev.timeStart}:00`, timeZone: TZ };
      gev.end   = { dateTime: `${ev.date}T${ev.timeEnd || ev.timeStart}:00`, timeZone: TZ };
    } else {
      gev.start = { date: ev.date };
      gev.end   = { date: nextDay };
    }
    return gev;
  }

  // ── Google Event → App-Event ──────────────────────────────────
  function _fromGEvent(gev) {
    const date      = (gev.start?.date || gev.start?.dateTime || '').slice(0, 10);
    const timeStart = gev.start?.dateTime ? gev.start.dateTime.slice(11, 16) : null;
    const timeEnd   = gev.end?.dateTime   ? gev.end.dateTime.slice(11, 16)   : null;
    return {
      title:       (gev.summary || '(ohne Titel)').replace(/^\[LP\]\s*/, ''),
      date,
      timeStart,
      timeEnd,
      type:        'appointment',
      text:        gev.description || null,
      color:       '#4285F4',
      source:      'google',
      gcalEventId: gev.id,
    };
  }

  // ── Push: App → Google Calendar ──────────────────────────────
  async function _push() {
    const start = _rangeStart();
    const end   = _rangeEnd();
    const all   = await DB.getEventsByRange(_isoDate(start), _isoDate(end));
    const toSync = all.filter(ev => PUSH_TYPES.has(ev.type) && ev.source !== 'google');

    let pushed = 0, errors = 0;
    for (const ev of toSync) {
      try {
        const gev = _toGEvent(ev);
        if (ev.gcalEventId) {
          // Bestehendes Google-Event aktualisieren
          const updated = await _apiFetch('PATCH',
            `/calendars/${encodeURIComponent(CAL_ID)}/events/${ev.gcalEventId}`, gev);
          if (updated === null) {
            // Event existiert nicht mehr → neu anlegen
            const created = await _apiFetch('POST',
              `/calendars/${encodeURIComponent(CAL_ID)}/events`, gev);
            ev.gcalEventId = created.id;
            await DB.saveEvent(ev);
          }
        } else {
          // Neues Google-Event anlegen
          const created = await _apiFetch('POST',
            `/calendars/${encodeURIComponent(CAL_ID)}/events`, gev);
          ev.gcalEventId = created.id;
          await DB.saveEvent(ev);
        }
        pushed++;
      } catch (e) {
        console.warn('[GCal] Push-Fehler für Event', ev.id, e.message);
        errors++;
      }
    }
    return { pushed, errors };
  }

  // ── Pull: Google Calendar → App ──────────────────────────────
  async function _pull() {
    const params = new URLSearchParams({
      timeMin:       _rangeStart().toISOString(),
      timeMax:       _rangeEnd().toISOString(),
      singleEvents:  'true',
      orderBy:       'startTime',
      maxResults:    '500',
    });

    const result  = await _apiFetch('GET',
      `/calendars/${encodeURIComponent(CAL_ID)}/events?${params}`);
    const gEvents = (result?.items || []).filter(g => g.status !== 'cancelled');

    // Bestehende App-Events im Zeitraum holen
    const appEvents = await DB.getEventsByRange(
      _isoDate(_rangeStart()), _isoDate(_rangeEnd())
    );
    const byGcalId = {};
    appEvents.forEach(ev => { if (ev.gcalEventId) byGcalId[ev.gcalEventId] = ev; });

    // Aktive Google-IDs für Bereinigung merken
    const activeGIds = new Set(gEvents.map(g => g.id));

    let pulled = 0;
    for (const gev of gEvents) {
      // Überspringen: von LP erstellte Events (werden per Push verwaltet)
      if (gev.extendedProperties?.private?.lehrerplanerId) continue;

      const appEv  = _fromGEvent(gev);
      const exists = byGcalId[gev.id];

      if (exists) {
        // Nur aktualisieren wenn sich Titel oder Datum geändert haben
        if (exists.title !== appEv.title || exists.date !== appEv.date ||
            exists.timeStart !== appEv.timeStart) {
          await DB.saveEvent({ ...exists, ...appEv, id: exists.id });
          pulled++;
        }
      } else {
        await DB.saveEvent(appEv);
        pulled++;
      }
    }

    // Google-Herkunft-Events löschen die in Google nicht mehr existieren
    for (const ev of appEvents.filter(e => e.source === 'google')) {
      if (ev.gcalEventId && !activeGIds.has(ev.gcalEventId)) {
        await DB.deleteEvent(ev.id);
      }
    }

    return { pulled };
  }

  // ── Settings-UI aktualisieren (3 Zustände) ──────────────────
  async function _updateSettingsUI() {
    const clientId  = await _getClientId();
    const connected = !!(await _getToken());
    const lastSync  = await DB.getSetting('gcalLastSync');

    const wizardRow     = document.getElementById('gcal-wizard-row');
    const rowConnect    = document.getElementById('gcal-connect-row');
    const rowSynced     = document.getElementById('gcal-synced-row');
    const rowDisconnect = document.getElementById('gcal-disconnect-row');
    const lastSyncEl    = document.getElementById('gcal-last-sync-text');
    const calSyncBtn    = document.getElementById('cal-gcal-sync');

    if (!wizardRow) return; // settings panel noch nicht im DOM

    // Herkunft dynamisch setzen (nie hardcodiert)
    const originEl = document.getElementById('gcal-origin-display');
    if (originEl) originEl.textContent = window.location.origin;

    function show(el) { if (el) el.style.display = ''; }
    function hide(el) { if (el) el.style.display = 'none'; }

    if (!clientId) {
      // Zustand 1: kein Client-ID → Wizard anzeigen
      show(wizardRow); hide(rowConnect); hide(rowSynced); hide(rowDisconnect);
      if (calSyncBtn) calSyncBtn.classList.add('hidden');
    } else if (!connected) {
      // Zustand 2: Client-ID vorhanden, aber nicht verbunden
      hide(wizardRow); show(rowConnect); hide(rowSynced); hide(rowDisconnect);
      if (calSyncBtn) calSyncBtn.classList.add('hidden');
    } else {
      // Zustand 3: verbunden
      hide(wizardRow); hide(rowConnect); show(rowSynced); show(rowDisconnect);
      if (lastSyncEl) {
        lastSyncEl.textContent = lastSync
          ? 'Letzter Sync: ' + new Date(lastSync).toLocaleString('de-DE')
          : 'Noch nie synchronisiert';
      }
      if (calSyncBtn) calSyncBtn.classList.remove('hidden');
    }
  }

  // ── Öffentliche API ──────────────────────────────────────────
  return {
    // Von launchApp() aufgerufen — wrappt App._editEvent für read-only Google-Events
    init() {
      const _orig = App._editEvent;
      App._editEvent = async function(id) {
        const ev = await DB.getEvent(id);
        if (ev?.source === 'google') {
          if (typeof showToast === 'function')
            showToast('Google-Termin — schreibgeschützt', '');
          return;
        }
        _orig(id);
      };
    },

    updateSettingsUI: _updateSettingsUI,

    async isConnected() {
      return !!(await _getToken());
    },

    // OAuth-Flow starten
    async connect() {
      if (!navigator.onLine) throw new Error('Kein Internet');
      const clientId = await _getClientId();
      if (!clientId) throw new Error('Google Client ID nicht konfiguriert');
      await _loadGis();

      return new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: async (tr) => {
            if (tr.error) {
              reject(new Error(tr.error_description || tr.error));
              return;
            }
            await _saveToken(tr);
            await _updateSettingsUI();
            resolve();
          },
          error_callback: (err) => {
            reject(new Error(err?.message || 'OAuth-Fehler'));
          },
        });
        client.requestAccessToken({ prompt: 'select_account' });
      });
    },

    // Verbindung trennen
    async disconnect() {
      const token = await _getToken();
      if (token && window.google?.accounts?.oauth2) {
        try { window.google.accounts.oauth2.revoke(token.access_token, () => {}); }
        catch (_) {}
      }
      await _clearToken();
      await DB.setSetting('gcalLastSync', null);
      await _updateSettingsUI();
    },

    // Vollständiger Sync (Push + Pull)
    async sync() {
      if (!navigator.onLine) throw new Error('Kein Internet — bitte später versuchen');
      const token = await _getToken();
      if (!token) throw new Error('Nicht verbunden — bitte Google Kalender verbinden');

      const { pushed, errors } = await _push();
      const { pulled }         = await _pull();

      await DB.setSetting('gcalLastSync', new Date().toISOString());
      await _updateSettingsUI();

      return { pushed, pulled, errors };
    },

    // Client-ID in IndexedDB speichern (überdauert App-Updates)
    async saveClientId(id) {
      await DB.setSetting('gcalClientId', id.trim());
      await _updateSettingsUI();
    },

    // Client-ID zurücksetzen (zurück zum Wizard)
    async resetClientId() {
      await DB.setSetting('gcalClientId', null);
      await _clearToken();
      await DB.setSetting('gcalLastSync', null);
      await _updateSettingsUI();
    },
  };
})();

// Synchron beim Laden: Origin-Anzeige sofort befüllen (ohne async-Verzögerung)
(function () {
  function _setOrigin() {
    var el = document.getElementById('gcal-origin-display');
    if (el) el.textContent = window.location.origin;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _setOrigin);
  } else {
    _setOrigin();
  }
}());
