// pin.js — PIN authentication and AES-256-GCM encryption for LehrerPlaner
'use strict';

const PinAuth = (() => {
  // ── Constants ────────────────────────────────────────────────
  const MAX_ATTEMPTS      = 5;
  const LOCKOUT_SEC       = 30;
  const AUTO_LOCK_MS      = 30 * 60 * 1000;

  // ── State ────────────────────────────────────────────────────
  let _key          = null;   // CryptoKey (AES-256-GCM), null when locked
  let _mode         = 'verify';
  let _inputBuffer  = '';
  let _newPinBuf    = '';
  let _attempts     = 0;
  let _lockedUntil  = 0;
  let _lockTimer    = null;
  let _lockInterval = null;
  let _resolve      = null;   // resolves the init() promise

  // ── Crypto helpers ───────────────────────────────────────────
  function hexToBytes(hex) {
    const a = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) a[i / 2] = parseInt(hex.substr(i, 2), 16);
    return a;
  }
  function bytesToHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function randomHex(n) { return bytesToHex(crypto.getRandomValues(new Uint8Array(n))); }

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return bytesToHex(buf);
  }

  async function deriveKey(pin, saltHex) {
    const km = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: 100000, hash: 'SHA-256' },
      km,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // ── Encryption (called by db.js via window.AppCrypto) ────────
  // Index fields kept in plaintext so IDB indexes keep working.
  const INDEX_FIELDS = ['id', 'classId', 'studentId', 'datum'];

  async function encrypt(obj) {
    if (!_key || !obj) return obj;
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const ct  = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      _key,
      new TextEncoder().encode(JSON.stringify(obj))
    );
    const envelope = { iv: bytesToHex(iv), d: bytesToHex(ct) };
    const record = { _enc: JSON.stringify(envelope) };
    INDEX_FIELDS.forEach(f => { if (obj[f] !== undefined) record[f] = obj[f]; });
    return record;
  }

  async function decrypt(record) {
    if (!_key || !record || !record._enc) return record;
    try {
      const { iv, d } = JSON.parse(record._enc);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: hexToBytes(iv) },
        _key,
        hexToBytes(d)
      );
      return JSON.parse(new TextDecoder().decode(plain));
    } catch (e) {
      console.error('[PinAuth] decrypt error', e);
      return record;
    }
  }

  // ── PIN screen DOM helpers ───────────────────────────────────
  function el(id) { return document.getElementById(id); }

  function renderDots(count) {
    const dots = el('pin-dots');
    if (!dots) return;
    dots.innerHTML = '';
    // Show max(4, count) dots up to 6
    const total = Math.max(4, Math.min(count + 1, 6));
    for (let i = 0; i < total; i++) {
      const d = document.createElement('div');
      d.className = 'pin-dot' + (i < count ? ' filled' : '');
      dots.appendChild(d);
    }
  }

  function renderKeypad() {
    const kp = el('pin-keypad');
    if (!kp) return;
    kp.innerHTML = '';
    ['1','2','3','4','5','6','7','8','9','','0','⌫'].forEach(k => {
      const btn = document.createElement('button');
      btn.className = 'pin-key' + (k === '' ? ' pin-key-empty' : '');
      btn.textContent = k;
      if (k === '⌫') {
        btn.setAttribute('aria-label', 'Löschen');
        btn.addEventListener('click', () => pressKey('del'));
      } else if (k !== '') {
        btn.setAttribute('aria-label', k);
        btn.addEventListener('click', () => pressKey(k));
      }
      kp.appendChild(btn);
    });
  }

  function setTitle(t) { const e = el('pin-title'); if (e) e.textContent = t; }
  function setSubtitle(t) { const e = el('pin-subtitle'); if (e) e.textContent = t; }

  function setError(msg) {
    const e = el('pin-error');
    if (!e) return;
    e.textContent = msg;
    e.style.display = msg ? 'block' : 'none';
    if (msg) {
      // Shake animation
      e.classList.remove('shake');
      void e.offsetWidth;
      e.classList.add('shake');
    }
  }

  function setKeypadDisabled(disabled) {
    document.querySelectorAll('.pin-key').forEach(b => { b.disabled = disabled; });
  }

  // ── Key press handler ────────────────────────────────────────
  function pressKey(k) {
    if (_lockedUntil && Date.now() < _lockedUntil) return;
    if (k === 'del') {
      _inputBuffer = _inputBuffer.slice(0, -1);
      renderDots(_inputBuffer.length);
      setError('');
      return;
    }
    if (_inputBuffer.length >= 6) return;
    _inputBuffer += k;
    renderDots(_inputBuffer.length);
    setError('');

    // Auto-submit at 6 digits; for 4–5 wait for confirm button
    if (_inputBuffer.length === 6) {
      setTimeout(() => submitCurrent(), 150);
    }
    // Show confirm key when >= 4
    updateConfirmKey();
  }

  function updateConfirmKey() {
    const kp = el('pin-keypad');
    if (!kp) return;
    const keys = kp.querySelectorAll('.pin-key');
    // The empty cell is index 9 (0-based)
    const emptyBtn = keys[9];
    if (!emptyBtn) return;
    if (_inputBuffer.length >= 4 && _inputBuffer.length < 6) {
      emptyBtn.textContent = '✓';
      emptyBtn.className = 'pin-key pin-key-confirm';
      // Replace listener
      const newBtn = emptyBtn.cloneNode(true);
      newBtn.addEventListener('click', () => submitCurrent());
      emptyBtn.parentNode.replaceChild(newBtn, emptyBtn);
    } else if (_inputBuffer.length < 4) {
      emptyBtn.textContent = '';
      emptyBtn.className = 'pin-key pin-key-empty';
      const newBtn = emptyBtn.cloneNode(true);
      emptyBtn.parentNode.replaceChild(newBtn, emptyBtn);
    }
  }

  async function submitCurrent() {
    const pin = _inputBuffer;
    _inputBuffer = '';
    renderDots(0);
    updateConfirmKey();
    if (pin.length < 4) { setError('PIN muss mindestens 4 Stellen haben'); return; }
    await handleInput(pin);
  }

  // ── Mode handlers ────────────────────────────────────────────
  async function handleInput(pin) {
    switch (_mode) {
      case 'setup':      return handleSetup(pin);
      case 'setup-confirm': return handleSetupConfirm(pin);
      case 'verify':     return handleVerify(pin);
      case 'change-old': return handleChangeOld(pin);
      case 'change-new': return handleChangeNew(pin);
      case 'change-confirm': return handleChangeConfirm(pin);
    }
  }

  function handleSetup(pin) {
    _newPinBuf = pin;
    _mode = 'setup-confirm';
    setTitle('PIN bestätigen');
    setSubtitle('Wiederhole deinen neuen PIN');
    setError('');
  }

  async function handleSetupConfirm(pin) {
    if (pin !== _newPinBuf) {
      setError('PINs stimmen nicht überein');
      _mode = 'setup';
      setTitle('PIN festlegen');
      setSubtitle('Wähle einen PIN mit 4–6 Ziffern');
      _newPinBuf = '';
      return;
    }
    await saveNewPin(pin);
    hidePinScreen();
    if (_resolve) { _resolve(); _resolve = null; }
    startAutoLock();
  }

  async function handleVerify(pin) {
    const hash = await DB.getSetting('pinHash');
    const salt = await DB.getSetting('pinSalt');
    const got  = await sha256(pin + salt);
    if (got === hash) {
      _attempts = 0;
      _key = await deriveKey(pin, salt);
      window.AppCrypto = { encrypt, decrypt };
      hidePinScreen();
      if (_resolve) { _resolve(); _resolve = null; }
      startAutoLock();
    } else {
      _attempts++;
      if (_attempts >= MAX_ATTEMPTS) {
        _attempts = 0;
        _lockedUntil = Date.now() + LOCKOUT_SEC * 1000;
        startLockout(LOCKOUT_SEC);
      } else {
        const left = MAX_ATTEMPTS - _attempts;
        setError(`Falscher PIN. Noch ${left} Versuch${left === 1 ? '' : 'e'}.`);
      }
    }
  }

  async function handleChangeOld(pin) {
    const hash = await DB.getSetting('pinHash');
    const salt = await DB.getSetting('pinSalt');
    const got  = await sha256(pin + salt);
    if (got !== hash) {
      setError('Falscher PIN');
      return;
    }
    _newPinBuf = '';
    _mode = 'change-new';
    setTitle('Neuer PIN');
    setSubtitle('Wähle einen neuen PIN (4–6 Ziffern)');
    setError('');
  }

  function handleChangeNew(pin) {
    _newPinBuf = pin;
    _mode = 'change-confirm';
    setTitle('PIN bestätigen');
    setSubtitle('Neuen PIN wiederholen');
    setError('');
  }

  async function handleChangeConfirm(pin) {
    if (pin !== _newPinBuf) {
      setError('PINs stimmen nicht überein');
      _mode = 'change-new';
      setTitle('Neuer PIN');
      setSubtitle('Wähle einen neuen PIN (4–6 Ziffern)');
      _newPinBuf = '';
      return;
    }
    // Re-encrypt all data with new key
    const oldKey = _key;
    const newSalt = randomHex(16);
    const newKey  = await deriveKey(pin, newSalt);

    await reEncryptSensitiveStores(oldKey, newKey);

    _key = newKey;
    window.AppCrypto = { encrypt, decrypt };
    await saveNewPin(pin, newSalt);
    hidePinScreen();
    // Signal completion via event
    document.dispatchEvent(new CustomEvent('pin-changed'));
  }

  // ── Re-encrypt all sensitive data with a new key ─────────────
  async function reEncryptSensitiveStores(oldKey, newKey) {
    const STORES = ['students','grades','attendance','remarks','homeworkMissed'];
    const db = await idb.openDB('lehrerplaner-db');
    for (const store of STORES) {
      const tx   = db.transaction(store, 'readwrite');
      const all  = await tx.store.getAll();
      for (const record of all) {
        let plain = record;
        // Decrypt with old key
        if (oldKey && record._enc) {
          try {
            const { iv, d } = JSON.parse(record._enc);
            const buf = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: hexToBytes(iv) },
              oldKey,
              hexToBytes(d)
            );
            plain = JSON.parse(new TextDecoder().decode(buf));
          } catch (e) { /* leave as-is */ }
        }
        // Encrypt with new key
        const iv  = crypto.getRandomValues(new Uint8Array(12));
        const ct  = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          newKey,
          new TextEncoder().encode(JSON.stringify(plain))
        );
        const envelope = { iv: bytesToHex(iv), d: bytesToHex(ct) };
        const newRecord = { _enc: JSON.stringify(envelope) };
        INDEX_FIELDS.forEach(f => { if (plain[f] !== undefined) newRecord[f] = plain[f]; });
        await tx.store.put(newRecord);
      }
      await tx.done;
    }
  }

  // ── Save PIN hash + salt to DB ───────────────────────────────
  async function saveNewPin(pin, salt) {
    salt = salt || randomHex(16);
    const hash = await sha256(pin + salt);
    await DB.setSetting('pinHash', hash);
    await DB.setSetting('pinSalt', salt);
    return salt;
  }

  // ── Lockout countdown ────────────────────────────────────────
  function startLockout(seconds) {
    setKeypadDisabled(true);
    const lockEl = el('pin-lockout');
    const errEl  = el('pin-error');
    if (errEl) errEl.style.display = 'none';
    if (lockEl) { lockEl.textContent = `Gesperrt — bitte warte ${seconds} Sekunden`; lockEl.style.display = 'block'; }

    clearInterval(_lockInterval);
    _lockInterval = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(_lockInterval);
        _lockInterval = null;
        _lockedUntil  = 0;
        setKeypadDisabled(false);
        if (lockEl) lockEl.style.display = 'none';
      } else {
        if (lockEl) lockEl.textContent = `Gesperrt — bitte warte ${seconds} Sekunden`;
      }
    }, 1000);
  }

  // ── Auto-lock on inactivity ──────────────────────────────────
  function resetAutoLock() {
    clearTimeout(_lockTimer);
    _lockTimer = setTimeout(lock, AUTO_LOCK_MS);
  }

  function startAutoLock() {
    resetAutoLock();
    ['pointerdown','keydown','touchstart'].forEach(ev =>
      document.addEventListener(ev, resetAutoLock, { passive: true })
    );
  }

  // ── Show / hide the PIN screen ───────────────────────────────
  function showPinScreen(mode, title, subtitle) {
    _mode        = mode;
    _inputBuffer = '';
    const screen = el('pin-screen');
    if (screen) screen.classList.remove('hidden');
    setTitle(title || 'PIN eingeben');
    setSubtitle(subtitle || '');
    setError('');
    const lockEl = el('pin-lockout');
    if (lockEl) lockEl.style.display = 'none';
    const forgot = el('pin-forgot');
    if (forgot) forgot.style.display = mode === 'verify' ? 'block' : 'none';
    renderDots(0);
    renderKeypad();
  }

  function hidePinScreen() {
    const screen = el('pin-screen');
    if (screen) screen.classList.add('hidden');
  }

  // ── PIN-vergessen: wipe all data ─────────────────────────────
  async function wipeAllData() {
    const confirmed = window.confirm(
      'Alle Daten werden unwiderruflich gelöscht!\n\nBitte bestätige mit OK.'
    );
    if (!confirmed) return;
    const confirmed2 = window.confirm(
      'Wirklich alle Daten löschen?\nDieser Vorgang kann NICHT rückgängig gemacht werden.'
    );
    if (!confirmed2) return;
    await indexedDB.deleteDatabase('lehrerplaner-db');
    window.location.reload();
  }

  // ── Lock (called from auto-lock or manual) ───────────────────
  function lock() {
    _key = null;
    window.AppCrypto = null;
    clearTimeout(_lockTimer);
    showPinScreen('verify', 'PIN eingeben', '');
  }

  // ── Public API ───────────────────────────────────────────────
  return {
    // Called from init() — resolves when user is authenticated
    init() {
      return new Promise(async resolve => {
        _resolve = resolve;
        const pinHash = await DB.getSetting('pinHash');
        if (!pinHash) {
          showPinScreen('setup', 'PIN festlegen', 'Wähle einen PIN mit 4–6 Ziffern');
        } else {
          showPinScreen('verify', 'PIN eingeben', '');
        }
        // Wire forgot button
        const forgot = el('pin-forgot');
        if (forgot) {
          forgot.replaceWith(forgot.cloneNode(true));
          el('pin-forgot').addEventListener('click', wipeAllData);
        }
      });
    },

    // Called from settings "PIN ändern" button
    changePin() {
      return new Promise(resolve => {
        _resolve = () => { resolve(); startAutoLock(); };
        showPinScreen('change-old', 'Aktuellen PIN eingeben', 'Zur Bestätigung');
        const forgot = el('pin-forgot');
        if (forgot) forgot.style.display = 'none';
      });
    },

    lock,

    get isLocked() { return _key === null; },

    // Exposed for db.js (before AppCrypto is set on window)
    encrypt,
    decrypt,
  };
})();
