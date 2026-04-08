// app.js — LehrerPlaner Main Application Logic
'use strict';

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const DAYS_SHORT  = ['Mo','Di','Mi','Do','Fr','Sa','So'];
const DAYS_FULL   = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const MONTHS      = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONTHS_S    = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

const EVENT_COLORS = ['#4A6FA5','#EF4444','#10B981','#F59E0B','#8B5CF6','#F97316','#EC4899','#06B6D4','#14B8A6','#6366F1'];
const CLASS_COLORS = ['#4A6FA5','#EF4444','#10B981','#F59E0B','#8B5CF6','#F97316','#EC4899','#06B6D4','#84CC16','#14B8A6','#F43F5E','#0EA5E9','#A855F7','#22C55E','#EAB308','#3B82F6','#D946EF','#64748B'];

const EVENT_TYPES = [
  { value:'appointment', label:'Termin',         color:'#4A6FA5' },
  { value:'task',        label:'Aufgabe',         color:'#F59E0B' },
  { value:'note',        label:'Notiz',           color:'#10B981' },
  { value:'schultermin', label:'Schultermin',     color:'#8B5CF6' },
  { value:'klassenarbeit',label:'Klassenarbeit',  color:'#EF4444' },
  { value:'konferenz',   label:'Konferenz',       color:'#F97316' },
  { value:'geburtstag',  label:'Geburtstag',      color:'#EC4899' },
];

// BW Schulferien (hardcoded presets)
const SCHULFERIEN = {
  '2025/26': [
    { name:'Herbstferien',     start:'2025-10-27', end:'2025-11-01' },
    { name:'Weihnachtsferien', start:'2025-12-22', end:'2026-01-05' },
    { name:'Osterferien',      start:'2026-03-23', end:'2026-04-03' },
    { name:'Pfingstferien',    start:'2026-06-02', end:'2026-06-06' },
    { name:'Sommerferien',     start:'2026-07-30', end:'2026-09-12' },
  ],
  '2026/27': [
    { name:'Herbstferien',     start:'2026-10-26', end:'2026-10-31' },
    { name:'Weihnachtsferien', start:'2026-12-22', end:'2027-01-04' },
    { name:'Osterferien',      start:'2027-03-29', end:'2027-04-10' },
    { name:'Pfingstferien',    start:'2027-05-25', end:'2027-05-29' },
    { name:'Sommerferien',     start:'2027-07-29', end:'2027-09-11' },
  ],
};

// BW Feiertage
const FEIERTAGE = [
  '2025-01-01','2025-01-06','2025-04-18','2025-04-21','2025-05-01',
  '2025-05-29','2025-06-09','2025-06-19','2025-10-03','2025-11-01',
  '2025-12-25','2025-12-26',
  '2026-01-01','2026-01-06','2026-04-03','2026-04-06','2026-05-01',
  '2026-05-14','2026-05-25','2026-06-04','2026-10-03','2026-11-01',
  '2026-12-25','2026-12-26',
  '2027-01-01','2027-01-06','2027-03-26','2027-03-29','2027-05-01',
  '2027-05-06','2027-05-17','2027-05-27','2027-10-03','2027-11-01',
  '2027-12-25','2027-12-26',
];

// ══════════════════════════════════════════════════════════════
// APPLICATION STATE
// ══════════════════════════════════════════════════════════════
const App = {
  settings:       {},
  classes:        [],
  currentView:    'dashboard',
  calView:        'week',
  calDate:        new Date(),
  notizPage:      1,
  orgModule:      null,
  inkMode:        false,
  inkColor:       '#1a1a2e',
  inkWidth:       3,
  isEraser:       false,
  isDrawing:      false,
  strokes:        [],       // strokes for current page
  currentStroke:  null,
  canvas:         null,
  ctx:            null,
  currentPageKey: null,
  deferredInstall:null,
  // Pending confirm resolve
  _confirmResolve: null,
};

// ══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════
function isoDate(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function parseDate(str) {
  if (!str) return null;
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
}
function formatDateDE(str) {
  if (!str) return '';
  const [y,m,d] = str.split('-');
  return `${d}.${m}.${y}`;
}
function formatDateShort(str) {
  if (!str) return '';
  const d = parseDate(str);
  return `${d.getDate()}. ${MONTHS_S[d.getMonth()]}`;
}
function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}
function getMondayOfWeek(d) {
  const day = d.getDay() || 7;
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day - 1));
  mon.setHours(0,0,0,0);
  return mon;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function addWeeks(d, n) { return addDays(d, n*7); }
function addMonths(d, n) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
function sameDay(a, b) { return isoDate(a) === isoDate(b); }
function isSchulferien(dateStr, schuljahr) {
  const ferien = SCHULFERIEN[schuljahr] || [];
  return ferien.find(f => dateStr >= f.start && dateStr <= f.end) || null;
}
function isFeiertag(dateStr) { return FEIERTAGE.includes(dateStr); }

function el(id) { return document.getElementById(id); }
function qs(sel, root=document) { return root.querySelector(sel); }
function qsa(sel, root=document) { return [...root.querySelectorAll(sel)]; }

function showToast(msg, type='', dur=2400) {
  const t = el('toast');
  t.textContent = msg;
  t.className = `show${type?' '+type:''}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, dur);
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function colorSwatchesHtml(selectedColor, colors, idPrefix) {
  return colors.map((c,i) =>
    `<button class="color-swatch${c===selectedColor?' active':''}" data-color="${c}" style="background:${c};" title="${c}"></button>`
  ).join('');
}

// ══════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════
async function init() {
  // Register service worker with full error reporting
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('[App] Service Worker registered, scope:', reg.scope);
        // Check offline readiness after SW is active
        const sw = reg.active || reg.installing || reg.waiting;
        if (sw) checkSWStatus(reg);
        reg.addEventListener('updatefound', () => {
          console.log('[App] Service Worker update found');
          checkSWStatus(reg);
        });
      })
      .catch(err => {
        console.error('[App] Service Worker registration FAILED:', err.message, err);
        showSWStatus('error', 'Service Worker konnte nicht registriert werden — Offline-Modus nicht verfügbar');
      });

    // Listen for pong from SW
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'pong') {
        console.log('[App] SW active, cache:', e.data.cache);
        showSWStatus('ok', 'App offline verfügbar');
      }
    });
  } else {
    showSWStatus('error', 'Service Worker nicht unterstützt');
  }

  // PWA install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    App.deferredInstall = e;
    el('install-prompt').classList.remove('hidden');
  });
  el('install-btn').addEventListener('click', async () => {
    if (App.deferredInstall) {
      App.deferredInstall.prompt();
      const { outcome } = await App.deferredInstall.userChoice;
      if (outcome === 'accepted') el('install-prompt').classList.add('hidden');
      App.deferredInstall = null;
    }
  });
  el('install-dismiss').addEventListener('click', () => el('install-prompt').classList.add('hidden'));

  // Load settings
  App.settings = await DB.getAllSettings();

  if (!App.settings.setupDone) {
    showSetupWizard();
    return;
  }

  await PinAuth.init();
  await launchApp();
}

async function launchApp() {
  App.settings = await DB.getAllSettings();
  App.classes = await DB.getClasses();
  await initSubjects();

  // Update header
  el('header-teacher').textContent = App.settings.teacherName || '';
  updateHeaderDate();
  setInterval(updateHeaderDate, 60000);

  // Wire navigation
  qsa('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => App.navigate(tab.dataset.view));
  });

  // Wire calendar view tabs
  qsa('.cal-view-tab').forEach(btn => {
    btn.addEventListener('click', () => switchCalView(btn.dataset.cal));
  });
  el('cal-prev').addEventListener('click', () => calNav(-1));
  el('cal-next').addEventListener('click', () => calNav(+1));
  el('cal-today-btn').addEventListener('click', () => { App.calDate = new Date(); renderCalendar(); });

  // Settings
  el('btn-settings').addEventListener('click', openSettings);
  el('settings-close').addEventListener('click', closeSettings);
  el('settings-save').addEventListener('click', saveSettings);
  el('btn-export').addEventListener('click', exportData);
  el('btn-import').addEventListener('click', () => el('import-file').click());
  el('import-file').addEventListener('change', importData);
  el('btn-new-year').addEventListener('click', newSchoolYear);
  el('btn-change-pin').addEventListener('click', async () => {
    closeSettings();
    await PinAuth.changePin();
    showToast('PIN geändert ✓', 'success');
  });
  document.addEventListener('pin-changed', () => {
    showToast('PIN erfolgreich geändert ✓', 'success');
  });

  // Google Calendar (null-safe in case cached HTML is stale)
  if (typeof GCal !== 'undefined') {
    GCal.init();
    el('btn-gcal-connect')?.addEventListener('click', async () => {
      const btn = el('btn-gcal-connect');
      if (btn) { btn.textContent = 'Verbinde…'; btn.disabled = true; }
      try {
        await GCal.connect();
        showToast('Google Kalender verbunden ✓', 'success');
      } catch(e) {
        // Show error both as toast and in the status text so it's visible behind the modal
        showToast('Fehler: ' + e.message, 'error');
        const statusEl = el('gcal-status-text');
        if (statusEl) statusEl.textContent = '⚠ ' + e.message;
        if (btn) { btn.textContent = 'Mit Google verbinden'; btn.disabled = false; }
      }
    });
    el('btn-gcal-sync')?.addEventListener('click', () => _gcalSync());
    el('cal-gcal-sync')?.addEventListener('click', () => _gcalSync());
    el('btn-gcal-disconnect')?.addEventListener('click', async () => {
      const ok = await confirm2('Google Kalender trennen?',
        'Die Verbindung wird getrennt. Bereits importierte Google-Termine bleiben erhalten.');
      if (!ok) return;
      await GCal.disconnect();
      showToast('Google Kalender getrennt', '');
    });
  }

  // Event modal
  el('ev-cancel').addEventListener('click', closeEventModal);
  el('event-modal-close').addEventListener('click', closeEventModal);
  el('ev-save').addEventListener('click', saveEvent);
  el('ev-delete').addEventListener('click', deleteEventFromModal);
  el('event-modal').addEventListener('click', e => { if (e.target===el('event-modal')) closeEventModal(); });
  setupColorSwatches('ev-colors', EVENT_COLORS, c => { App._evColor = c; });

  // Klasse modal
  el('kl-cancel').addEventListener('click', closeKlasseModal);
  el('klasse-modal-close').addEventListener('click', closeKlasseModal);
  el('kl-save').addEventListener('click', saveKlasse);
  el('kl-delete').addEventListener('click', deleteKlasseFromModal);
  el('klasse-modal').addEventListener('click', e => { if (e.target===el('klasse-modal')) closeKlasseModal(); });
  setupColorSwatches('kl-colors', CLASS_COLORS, c => { App._klColor = c; });

  // Class picker modal (for import)
  el('class-picker-modal').addEventListener('click', e => { if (e.target===el('class-picker-modal')) el('class-picker-modal').classList.add('hidden'); });

  // Student profile modal
  el('sp-modal-close').addEventListener('click', () => el('student-profile-modal').classList.add('hidden'));
  el('student-profile-modal').addEventListener('click', e => { if (e.target===el('student-profile-modal')) el('student-profile-modal').classList.add('hidden'); });

  // Subjects modal
  el('subjects-modal-close').addEventListener('click', () => el('subjects-modal').classList.add('hidden'));
  el('subjects-modal-cancel').addEventListener('click', () => el('subjects-modal').classList.add('hidden'));
  el('subjects-modal').addEventListener('click', e => { if (e.target===el('subjects-modal')) el('subjects-modal').classList.add('hidden'); });
  el('new-subject-input').addEventListener('keydown', e => { if (e.key==='Enter') addSubject(); });

  // FAB / quick add
  el('fab-add').addEventListener('click', () => openEventModal(null, isoDate(new Date())));
  el('dash-add-event').addEventListener('click', () => openEventModal(null, isoDate(new Date())));

  // Ink toolbar
  el('btn-mode-type').addEventListener('click', () => setInkMode(false));
  el('btn-mode-ink').addEventListener('click',  () => setInkMode(true));
  el('btn-eraser').addEventListener('click',    toggleEraser);
  el('btn-clear-ink').addEventListener('click', clearInk);
  el('ink-width').addEventListener('input', e => { App.inkWidth = +e.target.value; });
  qsa('.ink-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      App.isEraser = false;
      App.inkColor = btn.dataset.color;
      el('btn-eraser').classList.remove('btn-danger');
      qsa('.ink-color-btn').forEach(b => b.classList.toggle('active', b===btn));
    });
  });

  // Org back btn
  el('org-back').addEventListener('click', () => {
    el('org-overview').style.display = '';
    el('org-detail').style.display = 'none';
    App.orgModule = null;
  });

  // Item modal
  el('item-modal-close').addEventListener('click', () => el('item-modal').classList.add('hidden'));
  el('item-cancel').addEventListener('click',      () => el('item-modal').classList.add('hidden'));
  el('item-modal').addEventListener('click', e => { if (e.target===el('item-modal')) el('item-modal').classList.add('hidden'); });
  el('item-save').addEventListener('click', saveItemModal);
  el('item-delete').addEventListener('click', deleteItemModal);

  // Show app
  el('app').classList.remove('hidden');

  // Render initial view
  await App.navigate('dashboard');

  // Init notizen canvas
  initNotizCanvas();
}

// ── Service Worker Status ────────────────────────────────────
function checkSWStatus(reg) {
  // Ping the SW to confirm it's responding
  navigator.serviceWorker.ready.then(readyReg => {
    if (readyReg.active) {
      readyReg.active.postMessage('ping');
    }
  }).catch(() => {
    showSWStatus('warn', 'Service Worker inaktiv');
  });
}

let _swStatusTimer = null;
function showSWStatus(type, msg) {
  const badge = el('sw-status-badge');
  if (!badge) return;
  badge.textContent = type === 'ok' ? '✓ Offline OK' : type === 'warn' ? '⚠ SW inaktiv' : '✗ Kein Offline';
  badge.className   = `sw-status-badge sw-${type}`;
  badge.title       = msg;
  badge.style.display = '';
  clearTimeout(_swStatusTimer);
  // Auto-hide after 4 s if status is ok
  if (type === 'ok') {
    _swStatusTimer = setTimeout(() => { badge.style.display = 'none'; }, 4000);
  }
}

function updateHeaderDate() {
  const now = new Date();
  const kw = getWeekNumber(now);
  el('header-date').textContent = `KW ${kw} · ${now.toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'short'})}`;
}

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
App.navigate = async function(view) {
  App.currentView = view;

  // Update nav tabs
  qsa('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));

  // Show/hide views
  qsa('.view').forEach(v => v.classList.remove('active'));
  const target = el(`view-${view}`);
  if (target) target.classList.add('active');

  // FAB visibility
  const fabViews = ['dashboard','kalender','klassen'];
  el('fab-add').style.display = fabViews.includes(view) ? '' : 'none';

  // Render view
  switch (view) {
    case 'dashboard':      await renderDashboard(); break;
    case 'klassen':        await renderKlassen(); break;
    case 'kalender':       await renderCalendar(); break;
    case 'organisation':   renderOrganisation(); break;
    case 'notizen':        await renderNotizen(); break;
    case 'klasse-detail':
      // Keep KLASSEN tab highlighted
      qsa('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view==='klassen'));
      if (typeof renderKlasseDetail === 'function') await renderKlasseDetail();
      break;
  }
};

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
async function renderDashboard() {
  const today = new Date();
  const mon = getMondayOfWeek(today);
  const fri = addDays(mon, 4);
  const kw = getWeekNumber(today);

  el('dash-kw').textContent = `KW ${kw} · ${today.getFullYear()}`;
  el('dash-week-dates').textContent = `${mon.getDate()}. ${MONTHS_S[mon.getMonth()]} – ${fri.getDate()}. ${MONTHS_S[fri.getMonth()]}`;

  // Upcoming events (next 14 days)
  const start = isoDate(today);
  const end   = isoDate(addDays(today, 14));
  const events = await DB.getEventsByRange(start, end);
  events.sort((a,b) => a.date.localeCompare(b.date));
  const upcoming = events.slice(0, 5);

  const listEl = el('dash-events-list');
  if (!upcoming.length) {
    listEl.innerHTML = '<div class="empty-state" style="padding:16px 0;"><p>Keine Termine in den nächsten 14 Tagen</p></div>';
  } else {
    listEl.innerHTML = upcoming.map(ev => {
      const color = ev.color || typeColor(ev.type);
      return `<div class="dash-event-item">
        <div class="dash-event-dot" style="background:${color};"></div>
        <div class="dash-event-title">${escHtml(ev.title)}</div>
        <div class="dash-event-date">${formatDateShort(ev.date)}</div>
      </div>`;
    }).join('');
  }

  // Backup reminder banner
  const banner = el('dash-backup-banner');
  if (banner) {
    const last  = App.settings.lastBackup ? new Date(App.settings.lastBackup) : null;
    const snooze = App.settings.backupBannerSnoozed ? new Date(App.settings.backupBannerSnoozed) : null;
    const daysSinceLast   = last   ? (Date.now() - last.getTime())   / 86400000 : 999;
    const daysSinceSnooze = snooze ? (Date.now() - snooze.getTime()) / 86400000 : 999;
    const show = daysSinceLast > 7 && daysSinceSnooze > 2;
    banner.classList.toggle('hidden', !show);
  }

  // Classes grid
  App.classes = await DB.getClasses();
  App.classes.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, 'de'));
  const grid = el('dash-class-grid');
  if (!App.classes.length) {
    grid.innerHTML = '<div class="text-muted text-sm">Noch keine Klassen angelegt</div>';
  } else {
    grid.innerHTML = App.classes.map(c =>
      `<div class="dash-class-chip" data-id="${c.id}" draggable="true"
        style="background:${c.color||'#4A6FA5'};"
        onclick="openKlasseDetail(${c.id})">${escHtml(c.name)}</div>`
    ).join('');
    initDashClassDragDrop(grid);
  }
}

function initDashClassDragDrop(grid) {
  let dragSrc = null;

  grid.addEventListener('dragstart', e => {
    dragSrc = e.target.closest('.dash-class-chip');
    if (!dragSrc) return;
    e.dataTransfer.effectAllowed = 'move';
    dragSrc.style.opacity = '0.4';
  });

  grid.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.dash-class-chip');
    if (!target || target === dragSrc) return;
    grid.querySelectorAll('.dash-class-chip').forEach(c => c.classList.remove('dash-chip-over'));
    target.classList.add('dash-chip-over');
  });

  grid.addEventListener('dragleave', e => {
    const t = e.target.closest('.dash-class-chip');
    if (t) t.classList.remove('dash-chip-over');
  });

  grid.addEventListener('dragend', () => {
    grid.querySelectorAll('.dash-class-chip').forEach(c => {
      c.style.opacity = '';
      c.classList.remove('dash-chip-over');
    });
    dragSrc = null;
  });

  grid.addEventListener('drop', async e => {
    e.preventDefault();
    const target = e.target.closest('.dash-class-chip');
    if (!target || !dragSrc || target === dragSrc) return;

    // Determine insert position
    const rect = target.getBoundingClientRect();
    const mid  = rect.left + rect.width / 2;
    if (e.clientX < mid) grid.insertBefore(dragSrc, target);
    else                 grid.insertBefore(dragSrc, target.nextSibling);

    // Persist order
    const chips = [...grid.querySelectorAll('.dash-class-chip')];
    for (let i = 0; i < chips.length; i++) {
      const id  = Number(chips[i].dataset.id);
      const cls = App.classes.find(c => c.id === id);
      if (cls) { cls.order = i; await DB.saveClass(cls); }
    }
    grid.querySelectorAll('.dash-class-chip').forEach(c => c.classList.remove('dash-chip-over'));
  });

  // Touch support
  let tDragEl = null, tClone = null, tOffX = 0, tOffY = 0;

  grid.addEventListener('touchstart', e => {
    const chip = e.target.closest('.dash-class-chip');
    if (!chip) return;
    // Only start drag after a short hold (200ms) to distinguish from tap
    chip._holdTimer = setTimeout(() => {
      tDragEl = chip;
      e.preventDefault();
      const rect = chip.getBoundingClientRect();
      tOffX = e.touches[0].clientX - rect.left;
      tOffY = e.touches[0].clientY - rect.top;
      tClone = chip.cloneNode(true);
      tClone.style.cssText = `position:fixed;width:${rect.width}px;height:${rect.height}px;opacity:0.85;z-index:9999;pointer-events:none;left:${rect.left}px;top:${rect.top}px;border-radius:var(--radius);`;
      document.body.appendChild(tClone);
      chip.style.opacity = '0.3';
    }, 200);
  }, { passive: true });

  grid.addEventListener('touchmove', e => {
    const chip = e.target.closest('.dash-class-chip');
    if (chip && chip._holdTimer) { clearTimeout(chip._holdTimer); chip._holdTimer = null; }
    if (!tDragEl || !tClone) return;
    e.preventDefault();
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    tClone.style.left = (x - tOffX) + 'px';
    tClone.style.top  = (y - tOffY) + 'px';
    tClone.style.display = 'none';
    const under = document.elementFromPoint(x, y);
    tClone.style.display = '';
    const target = under && under.closest('.dash-class-chip');
    grid.querySelectorAll('.dash-class-chip').forEach(c => c.classList.remove('dash-chip-over'));
    if (target && target !== tDragEl) target.classList.add('dash-chip-over');
  }, { passive: false });

  grid.addEventListener('touchend', async e => {
    const chip = e.target.closest('.dash-class-chip');
    if (chip && chip._holdTimer) { clearTimeout(chip._holdTimer); chip._holdTimer = null; }
    if (!tDragEl || !tClone) return;
    const x = e.changedTouches[0].clientX, y = e.changedTouches[0].clientY;
    tClone.remove(); tClone = null;
    tDragEl.style.opacity = '';
    const under = document.elementFromPoint(x, y);
    const target = under && under.closest('.dash-class-chip');
    grid.querySelectorAll('.dash-class-chip').forEach(c => c.classList.remove('dash-chip-over'));

    if (target && target !== tDragEl) {
      const rect = target.getBoundingClientRect();
      if (x < rect.left + rect.width / 2) grid.insertBefore(tDragEl, target);
      else                                 grid.insertBefore(tDragEl, target.nextSibling);

      const chips = [...grid.querySelectorAll('.dash-class-chip')];
      for (let i = 0; i < chips.length; i++) {
        const id  = Number(chips[i].dataset.id);
        const cls = App.classes.find(c => c.id === id);
        if (cls) { cls.order = i; await DB.saveClass(cls); }
      }
    }
    tDragEl = null;
  });
}

// ══════════════════════════════════════════════════════════════
// CALENDAR
// ══════════════════════════════════════════════════════════════
function switchCalView(view) {
  App.calView = view;
  qsa('.cal-view-tab').forEach(b => b.classList.toggle('active', b.dataset.cal===view));
  qsa('.cal-subview').forEach(s => s.classList.remove('active'));
  el(`sub-${view}`).classList.add('active');
  renderCalendar();
}

function calNav(dir) {
  switch (App.calView) {
    case 'week':  App.calDate = addWeeks(App.calDate, dir); break;
    case 'month': App.calDate = addMonths(App.calDate, dir); break;
    case 'year':  App.calDate = new Date(App.calDate.getFullYear()+dir, 0, 1); break;
  }
  renderCalendar();
}

async function renderCalendar() {
  switch (App.calView) {
    case 'week':  await renderWeek(); break;
    case 'month': await renderMonth(); break;
    case 'year':  await renderYear(); break;
  }
}

// ── Week View ────────────────────────────────────────────────
async function renderWeek() {
  const mon = getMondayOfWeek(App.calDate);
  const kw  = getWeekNumber(mon);
  const year = mon.getFullYear();
  const schuljahr = App.settings.schoolYear || '2025/26';

  // Update title
  const fri = addDays(mon, 4);
  el('cal-title').textContent = `KW ${kw} · ${mon.getDate()}. ${MONTHS_S[mon.getMonth()]}${mon.getMonth()!==fri.getMonth()?` – ${fri.getDate()}. ${MONTHS_S[fri.getMonth()]}`:` – ${fri.getDate()}.`} ${year}`;

  // Load events for this week
  const start = isoDate(mon);
  const end   = isoDate(addDays(mon, 4));
  const events = await DB.getEventsByRange(start, end);

  // Group by date
  const byDate = {};
  for (let i=0;i<5;i++) {
    byDate[isoDate(addDays(mon,i))] = [];
  }
  events.forEach(ev => { if (byDate[ev.date]) byDate[ev.date].push(ev); });

  // Build header
  const header = el('week-header');
  header.innerHTML = '<div class="week-header-cell"></div>';
  for (let i=0;i<5;i++) {
    const d = addDays(mon,i);
    const ds = isoDate(d);
    const todayClass = sameDay(d,new Date()) ? ' today' : '';
    const ferien = isSchulferien(ds, schuljahr);
    const feiertag = isFeiertag(ds);
    const ferienClass = ferien ? ' ferien' : '';
    header.innerHTML += `<div class="week-header-cell${ferienClass}" data-date="${ds}" onclick="App._dayClick('${ds}')">
      <div class="week-day-name">${DAYS_SHORT[i]}${feiertag ? ' 🔴' : ''}</div>
      <div class="week-day-num${todayClass??' '}">${todayClass ? `<span class="week-day-num today">${d.getDate()}</span>` : d.getDate()}</div>
      ${ferien ? `<div class="ferien-badge">${ferien.name.split('f')[0]}…</div>` : ''}
    </div>`;
  }

  // All-day / banner row: school dates, conferences, birthdays
  const alldayRow = el('week-allday-row');
  alldayRow.innerHTML = '<div class="week-all-day-label">Ganztag</div>';
  const ALLDAY_TYPES = ['schultermin','konferenz','geburtstag'];
  for (let i=0;i<5;i++) {
    const ds = isoDate(addDays(mon,i));
    const allDayEvs = (byDate[ds]||[]).filter(e => ALLDAY_TYPES.includes(e.type));
    alldayRow.innerHTML += `<div class="week-all-day-cell" data-date="${ds}" onclick="App._dayClick('${ds}')">
      ${allDayEvs.map(ev => chipHtml(ev)).join('')}
    </div>`;
  }

  // Body: all other events
  const body = el('week-body');
  body.innerHTML = '<div class="week-gutter-cell"></div>';
  for (let i=0;i<5;i++) {
    const ds = isoDate(addDays(mon,i));
    const ferien = isSchulferien(ds, schuljahr);
    const ferienClass = ferien ? ' ferien' : '';
    const dayEvs = (byDate[ds]||[]).filter(e => !ALLDAY_TYPES.includes(e.type));
    body.innerHTML += `<div class="week-day-col${ferienClass}" data-date="${ds}" onclick="App._dayClick('${ds}')">
      ${dayEvs.map(ev => chipHtml(ev)).join('')}
      ${!dayEvs.length && ferien ? `<div class="text-muted text-sm" style="padding:4px 0;">${ferien.name}</div>` : ''}
    </div>`;
  }
}

App._dayClick = function(dateStr) {
  openEventModal(null, dateStr);
};

function chipHtml(ev) {
  const color = ev.color || typeColor(ev.type);
  const time  = ev.timeStart ? `<span class="event-chip-time">${ev.timeStart}</span> ` : '';
  const gBadge = ev.source === 'google'
    ? '<span class="gcal-chip-badge" title="Google Kalender">G</span>'
    : '';
  return `<div class="event-chip type-${ev.type}" style="background:${color};"
    onclick="event.stopPropagation();App._editEvent(${ev.id})">
    ${gBadge}${time}<span class="event-chip-text">${escHtml(ev.title)}</span>
  </div>`;
}

App._editEvent = function(id) { openEventModal(id); };

// ── Month View ───────────────────────────────────────────────
async function renderMonth() {
  const year  = App.calDate.getFullYear();
  const month = App.calDate.getMonth();
  const schuljahr = App.settings.schoolYear || '2025/26';

  el('cal-title').textContent = `${MONTHS[month]} ${year}`;

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth   = new Date(year, month+1, 0);
  const start = isoDate(startOfMonth);
  const end   = isoDate(endOfMonth);
  const events = await DB.getEventsByRange(start, end);

  const byDate = {};
  events.forEach(ev => {
    if (!byDate[ev.date]) byDate[ev.date] = [];
    byDate[ev.date].push(ev);
  });

  const grid = el('month-grid');
  // Day headers
  let html = DAYS_SHORT.slice(0,7).map(d => `<div class="month-header-cell">${d}</div>`).join('');

  // First day of month (Mon=1)
  const firstDow = (startOfMonth.getDay() || 7) - 1; // 0=Mon
  // Previous month fillers
  for (let i=0;i<firstDow;i++) {
    const d = addDays(startOfMonth, -(firstDow-i));
    html += `<div class="month-day other-month"><div class="month-day-num">${d.getDate()}</div></div>`;
  }
  // Current month days
  for (let d=1; d<=endOfMonth.getDate(); d++) {
    const date = new Date(year, month, d);
    const ds   = isoDate(date);
    const isToday = sameDay(date, new Date());
    const ferien  = isSchulferien(ds, schuljahr);
    const feiertag= isFeiertag(ds);
    const dayEvs  = byDate[ds] || [];
    const ferienClass = ferien ? ' ferien' : '';
    const todayNumClass = isToday ? ' today' : feiertag ? ' feiertag' : '';
    const shown = dayEvs.slice(0,3);
    const more  = dayEvs.length - shown.length;
    html += `<div class="month-day${ferienClass}" onclick="App._dayClick('${ds}')">
      <div class="month-day-num${todayNumClass}">${d}</div>
      <div class="month-event-chips">
        ${shown.map(ev => {
          const color = ev.color || typeColor(ev.type);
          const gBadge = ev.source === 'google' ? '<span class="gcal-chip-badge">G</span>' : '';
          return `<div class="month-event-chip" style="background:${color};" onclick="event.stopPropagation();App._editEvent(${ev.id})">${gBadge}${escHtml(ev.title)}</div>`;
        }).join('')}
        ${more>0 ? `<div class="month-event-more">+${more} weitere</div>` : ''}
      </div>
    </div>`;
  }
  // Trailing fillers
  const totalCells = firstDow + endOfMonth.getDate();
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i=1;i<=trailing;i++) {
    html += `<div class="month-day other-month"><div class="month-day-num">${i}</div></div>`;
  }
  grid.innerHTML = html;
}

// ── Year View ────────────────────────────────────────────────
async function renderYear() {
  const year = App.calDate.getFullYear();
  el('cal-title').textContent = `${year}`;

  // Load all events for the year
  const events = await DB.getEventsByRange(`${year}-01-01`, `${year}-12-31`);
  const eventDays = new Set(events.map(e => e.date));
  const schuljahr = App.settings.schoolYear || '2025/26';
  const grid = el('year-grid');
  let html = '';

  for (let m=0; m<12; m++) {
    const firstDay = new Date(year, m, 1);
    const lastDay  = new Date(year, m+1, 0);
    const firstDow = (firstDay.getDay()||7) - 1;
    html += `<div class="mini-cal">
      <div class="mini-cal-title">${MONTHS[m]}</div>
      <div class="mini-cal-grid">
        ${DAYS_SHORT.slice(0,7).map(d=>`<div class="mini-day-header">${d[0]}</div>`).join('')}
        ${Array(firstDow).fill('<div></div>').join('')}
        ${Array.from({length:lastDay.getDate()},(_,i)=>{
          const d = new Date(year, m, i+1);
          const ds = isoDate(d);
          const isToday = sameDay(d, new Date());
          const hasEv  = eventDays.has(ds);
          const ferien = isSchulferien(ds, schuljahr);
          let cls = 'mini-day';
          if (isToday) cls += ' today';
          else if (ferien) cls += ' ferien';
          else if (hasEv)  cls += ' has-event';
          return `<div class="${cls}" onclick="App._gotoDay('${ds}')">${i+1}</div>`;
        }).join('')}
      </div>
    </div>`;
  }
  grid.innerHTML = html;
}

App._gotoDay = function(ds) {
  App.calDate = parseDate(ds);
  switchCalView('week');
};

// ══════════════════════════════════════════════════════════════
// EVENT DIALOG
// ══════════════════════════════════════════════════════════════
let _editingEventId = null;

async function openEventModal(eventId, defaultDate) {
  _editingEventId = eventId || null;
  const modal = el('event-modal');

  // Populate class select first (sync)
  const sel = el('ev-class');
  sel.innerHTML = '<option value="">Keine Klasse</option>' +
    App.classes.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');

  if (eventId) {
    const ev = await DB.getEvent(eventId);
    if (!ev) return;
    el('event-modal-title').textContent = 'Eintrag bearbeiten';
    el('ev-title').value      = ev.title    || '';
    el('ev-date').value       = ev.date     || '';
    el('ev-type').value       = ev.type     || 'appointment';
    el('ev-class').value      = ev.classId  || '';
    el('ev-time-start').value = ev.timeStart|| '';
    el('ev-time-end').value   = ev.timeEnd  || '';
    el('ev-text').value       = ev.text     || '';
    App._evColor = ev.color || typeColor(ev.type);
    el('ev-delete').style.display = '';
    updateColorSwatches('ev-colors', App._evColor);
  } else {
    el('event-modal-title').textContent = 'Neuer Eintrag';
    el('ev-title').value      = '';
    el('ev-date').value       = defaultDate || isoDate(new Date());
    el('ev-type').value       = 'appointment';
    el('ev-class').value      = '';
    el('ev-time-start').value = '';
    el('ev-time-end').value   = '';
    el('ev-text').value       = '';
    App._evColor = EVENT_COLORS[0];
    el('ev-delete').style.display = 'none';
    updateColorSwatches('ev-colors', App._evColor);
  }

  modal.classList.remove('hidden');
  setTimeout(() => el('ev-title').focus(), 50);
}

function closeEventModal() { el('event-modal').classList.add('hidden'); }

async function saveEvent() {
  const title = el('ev-title').value.trim();
  if (!title) { showToast('Bitte einen Titel eingeben.','error'); return; }
  const ev = {
    title,
    date:      el('ev-date').value,
    type:      el('ev-type').value,
    classId:   el('ev-class').value ? Number(el('ev-class').value) : null,
    timeStart: el('ev-time-start').value || null,
    timeEnd:   el('ev-time-end').value   || null,
    text:      el('ev-text').value.trim() || null,
    color:     App._evColor || typeColor(el('ev-type').value),
  };
  if (_editingEventId) ev.id = _editingEventId;
  await DB.saveEvent(ev);
  closeEventModal();
  showToast('Eintrag gespeichert ✓','success');
  if (App.currentView==='kalender') await renderCalendar();
  if (App.currentView==='dashboard') await renderDashboard();
}

async function deleteEventFromModal() {
  if (!_editingEventId) return;
  const ok = await confirm2('Eintrag löschen?','Dieser Eintrag wird unwiderruflich gelöscht.');
  if (!ok) return;
  await DB.deleteEvent(_editingEventId);
  closeEventModal();
  showToast('Eintrag gelöscht');
  if (App.currentView==='kalender') await renderCalendar();
  if (App.currentView==='dashboard') await renderDashboard();
}

function typeColor(type) {
  const found = EVENT_TYPES.find(t => t.value === type);
  return found ? found.color : '#4A6FA5';
}

// ══════════════════════════════════════════════════════════════
// COLOR SWATCHES
// ══════════════════════════════════════════════════════════════
function setupColorSwatches(containerId, colors, onSelect) {
  const container = el(containerId);
  container.innerHTML = colorSwatchesHtml(colors[0], colors);
  container.addEventListener('click', e => {
    const btn = e.target.closest('.color-swatch');
    if (!btn) return;
    qsa('.color-swatch', container).forEach(b => b.classList.toggle('active', b===btn));
    onSelect(btn.dataset.color);
  });
}

function updateColorSwatches(containerId, selectedColor) {
  qsa('.color-swatch', el(containerId)).forEach(b => {
    b.classList.toggle('active', b.dataset.color===selectedColor);
  });
}

// ══════════════════════════════════════════════════════════════
// KLASSEN
// ══════════════════════════════════════════════════════════════
async function renderKlassen() {
  App.classes = await DB.getClasses();
  // Sort by order field, then by name
  App.classes.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, 'de'));

  const list = el('klassen-list');

  const toolbar = `<div class="klassen-toolbar">
    <button class="btn btn-secondary btn-sm" onclick="openASVImport()">↑ Importieren</button>
    <button class="btn btn-primary btn-sm" onclick="openKlasseModal(null)">+ Klasse hinzufügen</button>
  </div>`;

  if (!App.classes.length) {
    list.innerHTML = toolbar + `<div class="empty-state" style="margin-top:40px;">
      <div class="empty-state-icon">🏫</div>
      <p>Noch keine Klassen angelegt.</p>
    </div>`;
    return;
  }

  list.innerHTML = toolbar + `
    <div class="klassen-row-list" id="klassen-row-list">
      ${App.classes.map((c, i) => `
        <div class="klasse-row-item" data-id="${c.id}" data-order="${i}" draggable="true">
          <div class="klasse-row-handle" title="Ziehen zum Sortieren">⠿</div>
          <div class="klasse-row-color-bar" style="background:${c.color||'#4A6FA5'};"></div>
          <div class="klasse-row-info" onclick="openKlasseDetail(${c.id})">
            <div class="klasse-row-name" style="color:${c.color||'#4A6FA5'};">${escHtml(c.name)}</div>
            ${c.subject ? `<div class="klasse-row-subject">${escHtml(c.subject)}</div>` : ''}
          </div>
          <div class="klasse-row-meta">
            <span class="kl-student-count text-muted" id="kl-count-${c.id}"></span>
          </div>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();openKlasseModal(${c.id})" title="Bearbeiten">✎</button>
        </div>`).join('')}
    </div>`;

  // Load student counts asynchronously
  for (const c of App.classes) {
    DB.getStudentsByClass(c.id).then(students => {
      const el2 = document.getElementById(`kl-count-${c.id}`);
      if (el2) el2.textContent = `${students.filter(s => s.aktiv !== false).length} Schüler`;
    });
  }

  // Drag & drop for reordering
  initKlassenDragDrop();
}

// Opens ASV import after picking the target class (if >1 class exists)
window.openImportClassPicker = async function() {
  if (!App.classes.length) { showToast('Zuerst eine Klasse anlegen', 'error'); return; }
  if (App.classes.length === 1) {
    await openKlasseDetail(App.classes[0].id);
    // Wait for render, then open import
    setTimeout(() => { if (typeof openASVImport === 'function') openASVImport(); }, 200);
    return;
  }
  // Show picker modal
  const opts = App.classes.map(c =>
    `<div class="class-pick-item" onclick="pickClassForImport(${c.id})" style="border-left:4px solid ${c.color||'#4A6FA5'};">
      <strong>${escHtml(c.name)}</strong>${c.subject ? `<span class="text-muted text-sm"> · ${escHtml(c.subject)}</span>` : ''}
    </div>`
  ).join('');
  el('class-picker-list').innerHTML = opts;
  el('class-picker-modal').classList.remove('hidden');
};

window.pickClassForImport = async function(classId) {
  el('class-picker-modal').classList.add('hidden');
  await openKlasseDetail(classId);
  setTimeout(() => { if (typeof openASVImport === 'function') openASVImport(); }, 200);
};

function initKlassenDragDrop() {
  const list = document.getElementById('klassen-row-list');
  if (!list) return;
  let dragSrc = null;

  list.addEventListener('dragstart', e => {
    dragSrc = e.target.closest('.klasse-row-item');
    if (!dragSrc) return;
    e.dataTransfer.effectAllowed = 'move';
    dragSrc.classList.add('dragging');
  });

  list.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.klasse-row-item');
    if (!target || target === dragSrc) return;
    const rect = target.getBoundingClientRect();
    const mid  = rect.top + rect.height / 2;
    list.querySelectorAll('.klasse-row-item').forEach(i => i.classList.remove('drag-over-top','drag-over-bottom'));
    target.classList.add(e.clientY < mid ? 'drag-over-top' : 'drag-over-bottom');
  });

  list.addEventListener('dragleave', e => {
    const target = e.target.closest('.klasse-row-item');
    if (target) target.classList.remove('drag-over-top','drag-over-bottom');
  });

  list.addEventListener('dragend', e => {
    list.querySelectorAll('.klasse-row-item').forEach(i => {
      i.classList.remove('dragging','drag-over-top','drag-over-bottom');
    });
    dragSrc = null;
  });

  list.addEventListener('drop', async e => {
    e.preventDefault();
    const target = e.target.closest('.klasse-row-item');
    if (!target || !dragSrc || target === dragSrc) return;

    const items = [...list.querySelectorAll('.klasse-row-item')];
    const fromIdx = items.indexOf(dragSrc);
    const toIdx   = items.indexOf(target);
    const rect = target.getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;

    // Re-order DOM
    if (insertBefore) {
      list.insertBefore(dragSrc, target);
    } else {
      list.insertBefore(dragSrc, target.nextSibling);
    }

    // Persist new order
    const ordered = [...list.querySelectorAll('.klasse-row-item')];
    for (let i = 0; i < ordered.length; i++) {
      const id = Number(ordered[i].dataset.id);
      const cls = App.classes.find(c => c.id === id);
      if (cls) { cls.order = i; await DB.saveClass(cls); }
    }
    list.querySelectorAll('.klasse-row-item').forEach(i => i.classList.remove('drag-over-top','drag-over-bottom'));
  });

  // Touch-based drag for tablets
  let touchDragEl = null, touchClone = null, touchOffY = 0;
  list.addEventListener('touchstart', e => {
    const handle = e.target.closest('.klasse-row-handle');
    if (!handle) return;
    touchDragEl = handle.closest('.klasse-row-item');
    if (!touchDragEl) return;
    e.preventDefault();
    const rect = touchDragEl.getBoundingClientRect();
    touchOffY = e.touches[0].clientY - rect.top;
    touchClone = touchDragEl.cloneNode(true);
    touchClone.style.cssText = `position:fixed;left:${rect.left}px;width:${rect.width}px;opacity:0.8;z-index:9999;pointer-events:none;top:${rect.top}px;`;
    document.body.appendChild(touchClone);
    touchDragEl.style.opacity = '0.3';
  }, { passive: false });

  list.addEventListener('touchmove', e => {
    if (!touchDragEl || !touchClone) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    touchClone.style.top = (y - touchOffY) + 'px';
    // Find item under finger
    touchClone.style.display = 'none';
    const under = document.elementFromPoint(e.touches[0].clientX, y);
    touchClone.style.display = '';
    const target = under && under.closest('.klasse-row-item');
    list.querySelectorAll('.klasse-row-item').forEach(i => i.classList.remove('drag-over-top','drag-over-bottom'));
    if (target && target !== touchDragEl) {
      const rect = target.getBoundingClientRect();
      target.classList.add(y < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
    }
  }, { passive: false });

  list.addEventListener('touchend', async e => {
    if (!touchDragEl || !touchClone) return;
    const y = e.changedTouches[0].clientY;
    const cx = e.changedTouches[0].clientX;
    touchClone.remove(); touchClone = null;
    touchDragEl.style.opacity = '';
    const under = document.elementFromPoint(cx, y);
    const target = under && under.closest('.klasse-row-item');
    list.querySelectorAll('.klasse-row-item').forEach(i => i.classList.remove('drag-over-top','drag-over-bottom'));

    if (target && target !== touchDragEl) {
      const rect = target.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) list.insertBefore(touchDragEl, target);
      else list.insertBefore(touchDragEl, target.nextSibling);

      const ordered = [...list.querySelectorAll('.klasse-row-item')];
      for (let i = 0; i < ordered.length; i++) {
        const id = Number(ordered[i].dataset.id);
        const cls = App.classes.find(c => c.id === id);
        if (cls) { cls.order = i; await DB.saveClass(cls); }
      }
    }
    touchDragEl = null;
  });
}

window.openKlasseModal = async function(klasseId) {
  _editingKlasseId = klasseId || null;
  App._klColor = CLASS_COLORS[0];

  if (klasseId) {
    const c = await DB.getClass(klasseId);
    if (!c) return;
    el('klasse-modal-title').textContent = 'Klasse bearbeiten';
    el('kl-name').value    = c.name    || '';
    el('kl-subject').value = c.subject || '';
    App._klColor = c.color || CLASS_COLORS[0];
    el('kl-delete').style.display = '';
  } else {
    el('klasse-modal-title').textContent = 'Neue Klasse';
    el('kl-name').value    = '';
    el('kl-subject').value = '';
    App._klColor = CLASS_COLORS[App.classes.length % CLASS_COLORS.length];
    el('kl-delete').style.display = 'none';
  }
  updateColorSwatches('kl-colors', App._klColor);
  el('klasse-modal').classList.remove('hidden');
  setTimeout(() => el('kl-name').focus(), 50);
};

let _editingKlasseId = null;

async function saveKlasse() {
  const name = el('kl-name').value.trim();
  if (!name) { showToast('Bitte einen Namen eingeben.','error'); return; }
  const existing = _editingKlasseId ? await DB.getClass(_editingKlasseId) : null;
  const cls = {
    name,
    subject: el('kl-subject').value.trim() || null,
    color:   App._klColor || CLASS_COLORS[0],
    order:   existing ? (existing.order ?? App.classes.length) : App.classes.length,
  };
  if (_editingKlasseId) cls.id = _editingKlasseId;
  await DB.saveClass(cls);
  App.classes = await DB.getClasses();
  closeKlasseModal();
  showToast('Klasse gespeichert ✓','success');
  await renderKlassen();
}

async function deleteKlasseFromModal() {
  if (!_editingKlasseId) return;
  const ok = await confirm2('Klasse löschen?','Alle Daten dieser Klasse gehen verloren.');
  if (!ok) return;
  await DB.deleteClass(_editingKlasseId);
  App.classes = await DB.getClasses();
  closeKlasseModal();
  showToast('Klasse gelöscht');
  await renderKlassen();
}

function closeKlasseModal() { el('klasse-modal').classList.add('hidden'); }

// ══════════════════════════════════════════════════════════════
// ORGANISATION
// ══════════════════════════════════════════════════════════════
const ORG_MODULES = [
  { id:'todos',        icon:'✅', label:'To-Dos',           sub:'' },
  { id:'faecher',      icon:'📖', label:'Fächer',            sub:'' },
  { id:'stundenplan',  icon:'🗓', label:'Stundenpläne',      sub:'4 Slots' },
  { id:'schultermine', icon:'📅', label:'Schultermine',      sub:'1./2. HJ' },
  { id:'klassenarbeiten',icon:'📝',label:'Klassenarbeiten',  sub:'1./2. HJ' },
  { id:'contacts',     icon:'👤', label:'Kontakte',          sub:'' },
  { id:'links',        icon:'🔗', label:'Linksammlung',      sub:'' },
  { id:'vertretung',   icon:'🔄', label:'Vertretung',        sub:'' },
  { id:'geburtstage',  icon:'🎂', label:'Geburtstage',       sub:'' },
  { id:'konferenzen',  icon:'🤝', label:'Konferenzen',       sub:'' },
];

function renderOrganisation() {
  if (App.orgModule) {
    openOrgModule(App.orgModule);
    return;
  }
  el('org-overview').style.display = '';
  el('org-detail').style.display = 'none';
  const grid = el('org-grid');
  grid.innerHTML = ORG_MODULES.map(m =>
    `<div class="org-module-card" onclick="openOrgModule('${m.id}')">
      <div class="org-module-icon">${m.icon}</div>
      <div class="org-module-title">${m.label}</div>
      ${m.sub ? `<div class="org-module-count">${m.sub}</div>` : ''}
    </div>`
  ).join('');
}

window.openOrgModule = async function(moduleId) {
  App.orgModule = moduleId;
  el('org-overview').style.display = 'none';
  el('org-detail').style.display = '';
  const mod = ORG_MODULES.find(m => m.id===moduleId);
  el('org-detail-title').textContent = mod ? mod.label : moduleId;

  switch (moduleId) {
    case 'todos':          await renderTodos(); break;
    case 'faecher':        await renderFaecher(); break;
    case 'stundenplan':    await renderStundenplan(); break;
    case 'schultermine':   await renderSchultermine(); break;
    case 'klassenarbeiten':await renderKlassenarbeiten(); break;
    case 'contacts':       await renderContacts(); break;
    case 'links':          await renderLinks(); break;
    case 'vertretung':     await renderVertretung(); break;
    case 'geburtstage':    await renderGeburtstage(); break;
    case 'konferenzen':    await renderKonferenzen(); break;
  }
};

// ── Fächer ───────────────────────────────────────────────────
const DEFAULT_FAECHER = [
  'Deutsch','Mathematik','Englisch','Sport','Sachunterricht','Kunst','Musik',
  'Technik','Informatik','Ethik','Religion','NWA','Geschichte','Geographie',
  'Wirtschaft','Französisch','Physik','Chemie','Biologie',
];

async function initSubjects() {
  const existing = await DB.getSubjects();
  if (existing.length) return; // already initialized
  for (let i = 0; i < DEFAULT_FAECHER.length; i++) {
    await DB.saveSubject({ name: DEFAULT_FAECHER[i], order: i });
  }
}

async function renderFaecher() {
  const subjects = await DB.getSubjects();
  const content = el('org-detail-content');
  el('org-add-btn').style.display = 'none';

  let html = '<div class="faecher-list">';
  if (!subjects.length) {
    html += '<div class="empty-state"><p>Noch keine Fächer.</p></div>';
  } else {
    html += subjects.map(s => `
      <div class="fach-item">
        <span class="fach-name">${escHtml(s.name)}</span>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteFach(${s.id})" title="Löschen">×</button>
      </div>`).join('');
  }
  html += '</div>';
  html += `<div class="faecher-add-row" style="margin-top:12px;display:flex;gap:8px;">
    <input type="text" class="form-input" id="fach-new-input" placeholder="Neues Fach…" style="flex:1;"
      onkeydown="if(event.key==='Enter')addFach()">
    <button class="btn btn-primary btn-sm" onclick="addFach()">+ Hinzufügen</button>
  </div>`;
  content.innerHTML = html;
  setTimeout(() => el('fach-new-input')?.focus(), 50);
}

// For subjects modal (standalone modal, separate from org module)
window.addSubject = async function() {
  const input = el('new-subject-input');
  const name = input ? input.value.trim() : '';
  if (!name) return;
  const subjects = await DB.getSubjects();
  if (subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    showToast('Fach bereits vorhanden', 'error'); return;
  }
  await DB.saveSubject({ name, order: subjects.length });
  input.value = '';
  await renderSubjectsModalList();
};

async function renderSubjectsModalList() {
  const subjects = await DB.getSubjects();
  const list = el('subjects-list');
  if (!list) return;
  list.innerHTML = subjects.map(s => `
    <div class="fach-item">
      <span class="fach-name">${escHtml(s.name)}</span>
      <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteSubjectFromModal(${s.id})">×</button>
    </div>`).join('') || '<div class="text-muted text-sm">Noch keine Fächer.</div>';
}

window.deleteSubjectFromModal = async function(id) {
  await DB.deleteSubject(id);
  await renderSubjectsModalList();
};

window.addFach = async function() {
  const input = el('fach-new-input');
  const name = input ? input.value.trim() : '';
  if (!name) return;
  const subjects = await DB.getSubjects();
  if (subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    showToast('Fach bereits vorhanden', 'error'); return;
  }
  await DB.saveSubject({ name, order: subjects.length });
  showToast(`${name} hinzugefügt ✓`, 'success');
  await renderFaecher();
};

window.deleteFach = async function(id) {
  if (!await confirm2('Fach löschen?', 'Noten mit diesem Fach bleiben erhalten.')) return;
  await DB.deleteSubject(id);
  await renderFaecher();
};

// Helper: populate a <select> with subjects
async function populateSubjectSelect(selectEl, currentValue) {
  const subjects = await DB.getSubjects();
  selectEl.innerHTML = subjects.map(s =>
    `<option value="${escHtml(s.name)}"${s.name === currentValue ? ' selected' : ''}>${escHtml(s.name)}</option>`
  ).join('');
  if (!selectEl.value && subjects.length) selectEl.value = subjects[0].name;
}

// ── Todos ────────────────────────────────────────────────────
async function renderTodos() {
  const todos = await DB.getTodos();
  todos.sort((a,b) => (a.done?1:-1) - (b.done?1:-1) || (a.dueDate||'z').localeCompare(b.dueDate||'z'));
  const content = el('org-detail-content');

  el('org-add-btn').onclick = () => openItemModal('todo', null);

  if (!todos.length) {
    content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>Keine To-Dos vorhanden</p></div>';
    return;
  }
  content.innerHTML = `<div class="todo-list">${todos.map(t => `
    <div class="todo-item">
      <div class="todo-check${t.done?' done':''}" onclick="toggleTodo(${t.id})">${t.done?'✓':''}</div>
      <div class="todo-text${t.done?' done':''}">${escHtml(t.text)}</div>
      ${t.dueDate ? `<div class="todo-due">${formatDateDE(t.dueDate)}</div>` : ''}
      <button class="todo-del btn btn-ghost btn-sm btn-icon" onclick="deleteTodo(${t.id})">×</button>
    </div>`).join('')}</div>`;
}

window.toggleTodo = async function(id) {
  const t = await DB.getTodos().then(ts => ts.find(t=>t.id===id));
  if (!t) return;
  t.done = !t.done;
  await DB.saveTodo(t);
  await renderTodos();
};
window.deleteTodo = async function(id) {
  await DB.deleteTodo(id);
  await renderTodos();
};

// ── Stundenplan ──────────────────────────────────────────────
let _spSlot = 1;
async function renderStundenplan() {
  el('org-add-btn').onclick = null;
  el('org-add-btn').style.display = 'none';

  const content = el('org-detail-content');
  const periods = 10;
  const DAYS = ['Mo','Di','Mi','Do','Fr'];

  let plan = await DB.getStundenplan(_spSlot);
  if (!plan) plan = { id: _spSlot, name: `Stundenplan ${_spSlot}`, schedule: {} };

  content.innerHTML = `
    <div class="stundenplan-tabs">${[1,2,3,4].map(s =>
      `<div class="stundenplan-tab${_spSlot===s?' active':''}" onclick="switchSpSlot(${s})">Stundenplan ${s}</div>`
    ).join('')}</div>
    <div style="margin-bottom:12px;">
      <input type="text" class="form-input" id="sp-name-input" value="${escHtml(plan.name)}" placeholder="Name des Stundenplans" style="max-width:280px;">
      <button class="btn btn-primary btn-sm" style="margin-left:8px;" onclick="saveSpName()">Speichern</button>
    </div>
    <div class="stundenplan-grid" id="sp-grid">
      <div class="sp-header"></div>
      ${DAYS.map(d=>`<div class="sp-header">${d}</div>`).join('')}
      ${Array.from({length:periods},(_,p)=>`
        <div class="sp-period">${p+1}</div>
        ${DAYS.map((_,di)=>{
          const cell = ((plan.schedule||{})[di]||[])[p] || {};
          return `<div class="sp-cell" onclick="editSpCell(${di},${p})">
            <div class="sp-cell-subject">${escHtml(cell.subject||'')}</div>
            <div class="sp-cell-room">${escHtml(cell.room||'')}</div>
          </div>`;
        }).join('')}
      `).join('')}
    </div>`;
}

window.switchSpSlot = function(slot) { _spSlot = slot; renderStundenplan(); };

window.saveSpName = async function() {
  let plan = await DB.getStundenplan(_spSlot) || { id:_spSlot, schedule:{} };
  plan.name = el('sp-name-input').value.trim() || `Stundenplan ${_spSlot}`;
  await DB.saveStundenplan(plan);
  showToast('Gespeichert ✓','success');
};

window.editSpCell = async function(dayIdx, periodIdx) {
  let plan = await DB.getStundenplan(_spSlot) || { id:_spSlot, name:`Stundenplan ${_spSlot}`, schedule:{} };
  if (!plan.schedule[dayIdx]) plan.schedule[dayIdx] = [];
  const cell = plan.schedule[dayIdx][periodIdx] || {};

  const body = el('item-modal-body');
  body.innerHTML = `
    <div class="form-group"><label class="form-label">Fach</label>
      <input type="text" class="form-input" id="sp-subject" value="${escHtml(cell.subject||'')}" placeholder="z. B. Mathematik"></div>
    <div class="form-group"><label class="form-label">Raum</label>
      <input type="text" class="form-input" id="sp-room" value="${escHtml(cell.room||'')}" placeholder="z. B. A201"></div>
    <div class="form-group"><label class="form-label">Notiz</label>
      <input type="text" class="form-input" id="sp-notes" value="${escHtml(cell.notes||'')}" placeholder="Optional"></div>`;
  el('item-modal-title').textContent = `${['Mo','Di','Mi','Do','Fr'][dayIdx]}, ${periodIdx+1}. Stunde`;
  el('item-delete').style.display = 'none';
  el('item-modal').classList.remove('hidden');

  el('item-save').onclick = async () => {
    if (!plan.schedule[dayIdx]) plan.schedule[dayIdx] = [];
    plan.schedule[dayIdx][periodIdx] = {
      subject: el('sp-subject').value.trim(),
      room:    el('sp-room').value.trim(),
      notes:   el('sp-notes').value.trim(),
    };
    await DB.saveStundenplan(plan);
    el('item-modal').classList.add('hidden');
    await renderStundenplan();
    showToast('Gespeichert ✓','success');
  };
};

// ── Schultermine ─────────────────────────────────────────────
async function renderSchultermine() {
  const events = await DB.getEventsByType('schultermin');
  events.sort((a,b) => a.date.localeCompare(b.date));
  const schuljahr = App.settings.schoolYear || '2025/26';
  el('org-add-btn').style.display = '';
  el('org-add-btn').onclick = () => openEventModal(null, isoDate(new Date()));
  // Also add preset BW Ferienzeiten button
  const content = el('org-detail-content');
  const hj1 = events.filter(e => { const m = parseDate(e.date)?.getMonth(); return m>=7||m<=0; });
  const hj2 = events.filter(e => { const m = parseDate(e.date)?.getMonth(); return m>=1&&m<=6; });

  function listHtml(evs) {
    if (!evs.length) return '<div class="empty-state" style="padding:16px 0;"><p>Keine Einträge</p></div>';
    return `<div class="schultermin-list">${evs.map(e=>`
      <div class="schultermin-item" style="border-left-color:${e.color||typeColor(e.type)};">
        <div class="schultermin-date">${formatDateDE(e.date)}</div>
        <div class="schultermin-title">${escHtml(e.title)}</div>
        <button class="btn btn-ghost btn-sm btn-icon schultermin-del" onclick="App._editEvent(${e.id})">✎</button>
      </div>`).join('')}</div>`;
  }

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <div class="section-title" style="margin-bottom:8px;">1. Halbjahr (Aug–Jan)</div>
      ${listHtml(hj1)}
    </div>
    <div>
      <div class="section-title" style="margin-bottom:8px;">2. Halbjahr (Feb–Jul)</div>
      ${listHtml(hj2)}
    </div>
    <div class="mt-3" style="padding-top:12px;border-top:1px solid var(--border);">
      <button class="btn btn-secondary btn-sm" onclick="importBWFerien('${schuljahr}')">BW Schulferien ${schuljahr} importieren</button>
    </div>`;
}

window.importBWFerien = async function(schuljahr) {
  const ferien = SCHULFERIEN[schuljahr];
  if (!ferien) { showToast('Keine Feriendaten verfügbar','error'); return; }
  for (const f of ferien) {
    await DB.saveEvent({ title: f.name, date: f.start, type:'schultermin', color:'#8B5CF6', text: `bis ${formatDateDE(f.end)}` });
  }
  showToast(`${ferien.length} Schulferieneinträge importiert ✓`,'success');
  await renderSchultermine();
  await renderCalendar();
};

// ── Klassenarbeiten ──────────────────────────────────────────
async function renderKlassenarbeiten() {
  const events = await DB.getEventsByType('klassenarbeit');
  events.sort((a,b) => a.date.localeCompare(b.date));
  el('org-add-btn').style.display = '';
  el('org-add-btn').onclick = () => {
    openEventModal(null, isoDate(new Date()));
    el('ev-type').value = 'klassenarbeit';
  };
  const hj1 = events.filter(e => { const m = parseDate(e.date)?.getMonth(); return m>=7||m<=0; });
  const hj2 = events.filter(e => { const m = parseDate(e.date)?.getMonth(); return m>=1&&m<=6; });
  const content = el('org-detail-content');

  function listHtml(evs) {
    if (!evs.length) return '<div class="empty-state" style="padding:16px 0;"><p>Keine Einträge</p></div>';
    return `<div class="schultermin-list">${evs.map(e=>{
      const cls = App.classes.find(c=>c.id===e.classId);
      return `<div class="schultermin-item" style="border-left-color:${e.color||'#EF4444'};">
        <div class="schultermin-date">${formatDateDE(e.date)}</div>
        <div class="schultermin-title">${escHtml(e.title)}${cls?` <span class="tag-chip" style="background:${cls.color||'#4A6FA5'};color:#fff;">${escHtml(cls.name)}</span>`:''}</div>
        <button class="btn btn-ghost btn-sm btn-icon schultermin-del" onclick="App._editEvent(${e.id})">✎</button>
      </div>`;
    }).join('')}</div>`;
  }

  content.innerHTML = `
    <div style="margin-bottom:20px;"><div class="section-title" style="margin-bottom:8px;">1. Halbjahr</div>${listHtml(hj1)}</div>
    <div><div class="section-title" style="margin-bottom:8px;">2. Halbjahr</div>${listHtml(hj2)}</div>`;
}

// ── Contacts ─────────────────────────────────────────────────
async function renderContacts() {
  const contacts = await DB.getContacts();
  contacts.sort((a,b) => (a.name||'').localeCompare(b.name||''));
  el('org-add-btn').style.display = '';
  el('org-add-btn').onclick = () => openItemModal('contact', null);
  const content = el('org-detail-content');
  if (!contacts.length) {
    content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👤</div><p>Keine Kontakte</p></div>';
    return;
  }
  content.innerHTML = `<div class="list-items">${contacts.map(c=>`
    <div class="list-item">
      <div class="list-item-avatar">${(c.name||'?')[0].toUpperCase()}</div>
      <div class="list-item-info">
        <div class="list-item-name">${escHtml(c.name)}</div>
        <div class="list-item-sub">${[c.role,c.phone,c.email].filter(Boolean).map(escHtml).join(' · ')}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openItemModal('contact',${c.id})">✎</button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteContact(${c.id})">×</button>
      </div>
    </div>`).join('')}</div>`;
}
window.deleteContact = async function(id) {
  if (!await confirm2('Kontakt löschen?')) return;
  await DB.deleteContact(id);
  await renderContacts();
};

// ── Links ─────────────────────────────────────────────────────
async function renderLinks() {
  const links = await DB.getLinks();
  el('org-add-btn').style.display = '';
  el('org-add-btn').onclick = () => openItemModal('link', null);
  const content = el('org-detail-content');
  if (!links.length) {
    content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔗</div><p>Keine Links</p></div>';
    return;
  }
  content.innerHTML = `<div class="list-items">${links.map(l=>`
    <div class="list-item">
      <div class="list-item-avatar">🔗</div>
      <div class="list-item-info">
        <div class="list-item-name">${escHtml(l.title)}</div>
        <div class="list-item-sub"><a href="${escHtml(l.url)}" target="_blank" rel="noopener">${escHtml(l.url)}</a>${l.category?' · '+escHtml(l.category):''}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openItemModal('link',${l.id})">✎</button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteLink(${l.id})">×</button>
      </div>
    </div>`).join('')}</div>`;
}
window.deleteLink = async function(id) {
  if (!await confirm2('Link löschen?')) return;
  await DB.deleteLink(id);
  await renderLinks();
};

// ── Vertretung ────────────────────────────────────────────────
async function renderVertretung() {
  const items = await DB.getVertretung();
  items.sort((a,b) => (a.date||'').localeCompare(b.date||''));
  el('org-add-btn').style.display = '';
  el('org-add-btn').onclick = () => openItemModal('vertretung', null);
  const content = el('org-detail-content');
  if (!items.length) {
    content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔄</div><p>Keine Vertretungseinträge</p></div>';
    return;
  }
  content.innerHTML = `<div class="schultermin-list">${items.map(v=>`
    <div class="schultermin-item">
      <div class="schultermin-date">${formatDateDE(v.date)}</div>
      <div class="schultermin-title">${escHtml(v.notes||v.subject||'')}${v.period ? ` · ${v.period}. Std.` : ''}</div>
      <button class="btn btn-ghost btn-sm btn-icon schultermin-del" onclick="deleteVertretung(${v.id})">×</button>
    </div>`).join('')}</div>`;
}
window.deleteVertretung = async function(id) {
  await DB.deleteVertretung(id);
  await renderVertretung();
};

// ── Geburtstage ──────────────────────────────────────────────
async function renderGeburtstage() {
  const events = await DB.getEventsByType('geburtstag');
  events.sort((a,b) => {
    const ma = a.date ? a.date.slice(5) : '';
    const mb = b.date ? b.date.slice(5) : '';
    return ma.localeCompare(mb);
  });
  el('org-add-btn').style.display = '';
  el('org-add-btn').onclick = () => {
    openEventModal(null, isoDate(new Date()));
    el('ev-type').value = 'geburtstag';
  };
  const content = el('org-detail-content');
  if (!events.length) {
    content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎂</div><p>Keine Geburtstage</p></div>';
    return;
  }
  content.innerHTML = `<div class="schultermin-list">${events.map(e=>`
    <div class="schultermin-item" style="border-left-color:#EC4899;">
      <div class="schultermin-date">${formatDateDE(e.date)}</div>
      <div class="schultermin-title">${escHtml(e.title)}</div>
      <button class="btn btn-ghost btn-sm btn-icon schultermin-del" onclick="App._editEvent(${e.id})">✎</button>
    </div>`).join('')}</div>`;
}

// ── Konferenzen ───────────────────────────────────────────────
async function renderKonferenzen() {
  const events = await DB.getEventsByType('konferenz');
  events.sort((a,b) => a.date.localeCompare(b.date));
  el('org-add-btn').style.display = '';
  el('org-add-btn').onclick = () => {
    openEventModal(null, isoDate(new Date()));
    el('ev-type').value = 'konferenz';
  };
  const content = el('org-detail-content');
  if (!events.length) {
    content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🤝</div><p>Keine Konferenzen</p></div>';
    return;
  }
  content.innerHTML = `<div class="schultermin-list">${events.map(e=>`
    <div class="schultermin-item" style="border-left-color:#F97316;">
      <div class="schultermin-date">${formatDateDE(e.date)}</div>
      <div class="schultermin-title">${escHtml(e.title)}</div>
      <button class="btn btn-ghost btn-sm btn-icon schultermin-del" onclick="App._editEvent(${e.id})">✎</button>
    </div>`).join('')}</div>`;
}

// ══════════════════════════════════════════════════════════════
// GENERIC ITEM MODAL
// ══════════════════════════════════════════════════════════════
let _itemModalType  = null;
let _itemModalId    = null;

async function openItemModal(type, id) {
  _itemModalType = type;
  _itemModalId   = id;
  const body = el('item-modal-body');
  el('item-delete').style.display = id ? '' : 'none';

  let data = {};
  if (id) {
    switch (type) {
      case 'todo':      data = (await DB.getTodos()).find(t=>t.id===id) || {}; break;
      case 'contact':   data = (await DB.getContacts()).find(c=>c.id===id) || {}; break;
      case 'link':      data = (await DB.getLinks()).find(l=>l.id===id) || {}; break;
      case 'vertretung':data = (await DB.getVertretung()).find(v=>v.id===id) || {}; break;
    }
  }

  switch (type) {
    case 'todo':
      el('item-modal-title').textContent = id ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
      body.innerHTML = `
        <div class="form-group"><label class="form-label">Aufgabe</label>
          <input type="text" class="form-input" id="im-text" value="${escHtml(data.text||'')}" placeholder="Was ist zu tun?"></div>
        <div class="form-group"><label class="form-label">Fällig bis</label>
          <input type="date" class="form-input" id="im-due" value="${data.dueDate||''}"></div>`;
      break;
    case 'contact':
      el('item-modal-title').textContent = id ? 'Kontakt bearbeiten' : 'Neuer Kontakt';
      body.innerHTML = `
        <div class="form-group"><label class="form-label">Name</label>
          <input type="text" class="form-input" id="im-name" value="${escHtml(data.name||'')}" placeholder="Vollständiger Name"></div>
        <div class="form-group"><label class="form-label">Funktion / Rolle</label>
          <input type="text" class="form-input" id="im-role" value="${escHtml(data.role||'')}" placeholder="z. B. Schulleitung"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Telefon</label>
            <input type="tel" class="form-input" id="im-phone" value="${escHtml(data.phone||'')}"></div>
          <div class="form-group"><label class="form-label">E-Mail</label>
            <input type="email" class="form-input" id="im-email" value="${escHtml(data.email||'')}"></div>
        </div>
        <div class="form-group"><label class="form-label">Notiz</label>
          <textarea class="form-textarea" id="im-notes" rows="2">${escHtml(data.notes||'')}</textarea></div>`;
      break;
    case 'link':
      el('item-modal-title').textContent = id ? 'Link bearbeiten' : 'Neuer Link';
      body.innerHTML = `
        <div class="form-group"><label class="form-label">Titel</label>
          <input type="text" class="form-input" id="im-title" value="${escHtml(data.title||'')}" placeholder="Bezeichnung"></div>
        <div class="form-group"><label class="form-label">URL</label>
          <input type="url" class="form-input" id="im-url" value="${escHtml(data.url||'')}" placeholder="https://..."></div>
        <div class="form-group"><label class="form-label">Kategorie</label>
          <input type="text" class="form-input" id="im-cat" value="${escHtml(data.category||'')}" placeholder="z. B. Schule, Material"></div>`;
      break;
    case 'vertretung':
      el('item-modal-title').textContent = id ? 'Vertretung bearbeiten' : 'Neue Vertretung';
      body.innerHTML = `
        <div class="form-row">
          <div class="form-group"><label class="form-label">Datum</label>
            <input type="date" class="form-input" id="im-date" value="${data.date||isoDate(new Date())}"></div>
          <div class="form-group"><label class="form-label">Stunde</label>
            <input type="number" class="form-input" id="im-period" value="${data.period||''}" min="1" max="12" placeholder="1"></div>
        </div>
        <div class="form-group"><label class="form-label">Fach / Klasse</label>
          <input type="text" class="form-input" id="im-subject" value="${escHtml(data.subject||'')}"></div>
        <div class="form-group"><label class="form-label">Notiz</label>
          <textarea class="form-textarea" id="im-notes" rows="2">${escHtml(data.notes||'')}</textarea></div>`;
      break;
  }
  el('item-modal').classList.remove('hidden');
}

async function saveItemModal() {
  let data = { id: _itemModalId || undefined };
  if (data.id === undefined) delete data.id;
  switch (_itemModalType) {
    case 'todo':
      data.text    = el('im-text')?.value.trim() || '';
      data.dueDate = el('im-due')?.value || null;
      data.done    = false;
      if (!data.text) { showToast('Text eingeben','error'); return; }
      await DB.saveTodo(data);
      break;
    case 'contact':
      data.name  = el('im-name')?.value.trim() || '';
      data.role  = el('im-role')?.value.trim() || null;
      data.phone = el('im-phone')?.value.trim() || null;
      data.email = el('im-email')?.value.trim() || null;
      data.notes = el('im-notes')?.value.trim() || null;
      if (!data.name) { showToast('Name eingeben','error'); return; }
      await DB.saveContact(data);
      break;
    case 'link':
      data.title    = el('im-title')?.value.trim() || '';
      data.url      = el('im-url')?.value.trim() || '';
      data.category = el('im-cat')?.value.trim() || null;
      if (!data.title||!data.url) { showToast('Titel und URL eingeben','error'); return; }
      await DB.saveLink(data);
      break;
    case 'vertretung':
      data.date    = el('im-date')?.value || isoDate(new Date());
      data.period  = Number(el('im-period')?.value) || null;
      data.subject = el('im-subject')?.value.trim() || null;
      data.notes   = el('im-notes')?.value.trim() || null;
      await DB.saveVertretung(data);
      break;
  }
  el('item-modal').classList.add('hidden');
  showToast('Gespeichert ✓','success');
  // Refresh current module
  if (App.orgModule) await openOrgModule(App.orgModule);
}

async function deleteItemModal() {
  if (!_itemModalId) return;
  const ok = await confirm2('Eintrag löschen?');
  if (!ok) return;
  switch (_itemModalType) {
    case 'todo':      await DB.deleteTodo(_itemModalId); break;
    case 'contact':   await DB.deleteContact(_itemModalId); break;
    case 'link':      await DB.deleteLink(_itemModalId); break;
    case 'vertretung':await DB.deleteVertretung(_itemModalId); break;
  }
  el('item-modal').classList.add('hidden');
  showToast('Gelöscht');
  if (App.orgModule) await openOrgModule(App.orgModule);
}

// ══════════════════════════════════════════════════════════════
// NOTIZEN
// ══════════════════════════════════════════════════════════════
async function renderNotizen() {
  // Build sidebar tabs
  const sidebar = el('notiz-sidebar');
  const existing = await DB.getAllNotes();
  const noteMap = Object.fromEntries(existing.map(n=>[n.id,n]));
  sidebar.innerHTML = '<div class="notiz-sidebar-title">Notizen</div>';
  for (let i=1;i<=10;i++) {
    const note = noteMap[i];
    const title = note?.title || `Seite ${i}`;
    sidebar.innerHTML += `<div class="notiz-tab${App.notizPage===i?' active':''}" onclick="switchNotizPage(${i})">
      <span class="notiz-tab-num">${i}</span>${escHtml(title)}
    </div>`;
  }

  await loadNotizPage(App.notizPage);
}

window.switchNotizPage = async function(page) {
  // Save current page before switching
  await saveNotizPage(App.notizPage);
  App.notizPage = page;
  // Update tabs
  qsa('.notiz-tab').forEach((t,i) => t.classList.toggle('active', i===page-1));
  await loadNotizPage(page);
};

async function loadNotizPage(page) {
  const note = await DB.getNote(page) || { id:page, title:'', content:'' };
  el('notiz-title').value    = note.title   || '';
  el('notiz-textarea').value = note.content || '';

  // Save title on blur to update sidebar
  el('notiz-title').onblur = async () => {
    await saveNotizPage(page);
    qsa('.notiz-tab')[page-1].lastChild.textContent = el('notiz-title').value.trim() || `Seite ${page}`;
  };

  // Auto-save textarea on content change (debounced)
  let _notizSaveTimer = null;
  el('notiz-textarea').oninput = () => {
    clearTimeout(_notizSaveTimer);
    _notizSaveTimer = setTimeout(() => saveNotizPage(page), 600);
  };

  // Load ink layer
  const pageKey = `note-${page}`;
  App.currentPageKey = pageKey;
  await loadInkLayer(pageKey);
}

async function saveNotizPage(page) {
  const note = {
    id:      page,
    title:   el('notiz-title').value.trim(),
    content: el('notiz-textarea').value,
  };
  await DB.saveNote(note);
  // Save ink
  if (App.currentPageKey === `note-${page}`) {
    await DB.saveInkLayer(App.currentPageKey, App.strokes);
  }
}

// ══════════════════════════════════════════════════════════════
// CANVAS / INK SYSTEM
// ══════════════════════════════════════════════════════════════
function initNotizCanvas() {
  const canvas = el('notiz-canvas');
  const wrap   = el('notiz-canvas-wrap');
  App.canvas = canvas;
  App.ctx    = canvas.getContext('2d');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.offsetWidth;
    const h = wrap.offsetHeight;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    App.ctx.scale(dpr, dpr);
    redrawCanvas();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  resize();

  // Pointer events for drawing
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup',   onPointerUp,   { passive: false });
  canvas.addEventListener('pointercancel', onPointerUp, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

function setInkMode(active) {
  App.inkMode = active;
  const canvas = el('notiz-canvas');
  const textarea = el('notiz-textarea');
  canvas.classList.toggle('active', active);
  textarea.style.pointerEvents = active ? 'none' : '';
  el('btn-mode-type').classList.toggle('active', !active);
  el('btn-mode-ink').classList.toggle('active', active);
  el('ink-toolbar').style.display = active ? 'flex' : 'none';
  App.isEraser = false;
  el('btn-eraser').classList.remove('btn-danger');
}

function toggleEraser() {
  App.isEraser = !App.isEraser;
  el('btn-eraser').classList.toggle('btn-danger', App.isEraser);
  qsa('.ink-color-btn').forEach(b => b.classList.toggle('active', !App.isEraser && b.dataset.color===App.inkColor));
}

async function clearInk() {
  const ok = await confirm2('Handschrift löschen?','Alle Tintenstriche auf dieser Seite werden gelöscht.');
  if (!ok) return;
  App.strokes = [];
  await DB.saveInkLayer(App.currentPageKey, []);
  const ctx = App.ctx;
  ctx.clearRect(0, 0, App.canvas.offsetWidth, App.canvas.offsetHeight);
}

function onPointerDown(e) {
  if (!App.inkMode) return;
  // Palm rejection: ignore touch when in ink mode
  if (e.pointerType === 'touch') return;
  e.preventDefault();
  App.isDrawing = true;

  const pos = getPos(e);
  if (App.isEraser) {
    eraseAt(pos);
    return;
  }
  App.currentStroke = {
    color: App.inkColor,
    width: App.inkWidth,
    points: [{ x:pos.x, y:pos.y, p: e.pressure||0.5 }],
  };
  // Start drawing
  const ctx = App.ctx;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
}

function onPointerMove(e) {
  if (!App.inkMode || !App.isDrawing) return;
  if (e.pointerType === 'touch') return;
  e.preventDefault();

  const pos = getPos(e);
  if (App.isEraser) {
    eraseAt(pos);
    return;
  }
  if (!App.currentStroke) return;
  App.currentStroke.points.push({ x:pos.x, y:pos.y, p:e.pressure||0.5 });

  // Draw segment
  const pts = App.currentStroke.points;
  const last = pts[pts.length-2];
  const curr = pts[pts.length-1];
  const ctx = App.ctx;
  const pressure = curr.p || 0.5;
  const width = App.inkWidth * (0.5 + pressure);

  ctx.beginPath();
  ctx.lineWidth = width;
  ctx.strokeStyle = App.inkColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(curr.x, curr.y);
  ctx.stroke();
}

async function onPointerUp(e) {
  if (!App.inkMode || !App.isDrawing) return;
  App.isDrawing = false;
  if (App.currentStroke && App.currentStroke.points.length > 0) {
    App.strokes.push(App.currentStroke);
    App.currentStroke = null;
    // Auto-save strokes
    await DB.saveInkLayer(App.currentPageKey, App.strokes);
  }
}

function getPos(e) {
  const rect = App.canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function eraseAt(pos) {
  const r = App.inkWidth * 6;
  const before = App.strokes.length;
  App.strokes = App.strokes.filter(stroke => {
    return !stroke.points.some(pt => {
      const dx = pt.x - pos.x;
      const dy = pt.y - pos.y;
      return Math.sqrt(dx*dx + dy*dy) < r;
    });
  });
  if (App.strokes.length !== before) redrawCanvas();
}

function redrawCanvas() {
  if (!App.ctx || !App.canvas) return;
  const ctx = App.ctx;
  ctx.clearRect(0, 0, App.canvas.offsetWidth, App.canvas.offsetHeight);
  for (const stroke of App.strokes) {
    if (!stroke.points || stroke.points.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = stroke.color || '#000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    const pts = stroke.points;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=1;i<pts.length;i++) {
      const p = pts[i].p || 0.5;
      ctx.lineWidth = (stroke.width||3) * (0.5 + p);
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
  }
}

async function loadInkLayer(pageKey) {
  const layer = await DB.getInkLayer(pageKey);
  App.strokes = (layer && layer.strokes) ? layer.strokes : [];
  redrawCanvas();
}

// ══════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════
function openSettings() {
  el('settings-name').value = App.settings.teacherName || '';
  el('settings-year').value = App.settings.schoolYear  || '2025/26';

  // Storage estimate
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(({usage, quota}) => {
      const used = (usage/1024/1024).toFixed(1);
      const total = (quota/1024/1024).toFixed(0);
      el('settings-storage').textContent = `${used} MB / ${total} MB genutzt`;
    });
  } else {
    el('settings-storage').textContent = 'Nicht verfügbar';
  }

  if (typeof GCal !== 'undefined') GCal.updateSettingsUI();
  el('settings-panel').classList.remove('hidden');
}

function closeSettings() { el('settings-panel').classList.add('hidden'); }

async function saveSettings() {
  const name = el('settings-name').value.trim();
  const year = el('settings-year').value;
  await DB.setSetting('teacherName', name);
  await DB.setSetting('schoolYear', year);
  App.settings.teacherName = name;
  App.settings.schoolYear  = year;
  el('header-teacher').textContent = name;
  closeSettings();
  showToast('Einstellungen gespeichert ✓','success');
}

// ══════════════════════════════════════════════════════════════
// BACKUP CRYPTO (AES-256-GCM + PBKDF2, password not stored)
// ══════════════════════════════════════════════════════════════
// GOOGLE CALENDAR SYNC HELPER
// ══════════════════════════════════════════════════════════════
async function _gcalSync() {
  if (!navigator.onLine) { showToast('Kein Internet', 'error'); return; }
  const btn = el('btn-gcal-sync');
  const calBtn = el('cal-gcal-sync');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.textContent = '…'; btn.disabled = true; }
  if (calBtn) calBtn.classList.add('gcal-syncing');
  try {
    const { pushed, pulled } = await GCal.sync();
    showToast(`Sync ✓ — ${pushed} hochgeladen, ${pulled} importiert`, 'success');
    if (App.currentView === 'kalender') await renderCalendar();
    if (App.currentView === 'dashboard') await renderDashboard();
  } catch(e) {
    showToast('Sync-Fehler: ' + e.message, 'error');
  } finally {
    if (btn) { btn.textContent = origText || 'Sync'; btn.disabled = false; }
    if (calBtn) calBtn.classList.remove('gcal-syncing');
  }
}

// ══════════════════════════════════════════════════════════════
function _bkHexToBytes(hex) {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) a[i / 2] = parseInt(hex.substr(i, 2), 16);
  return a;
}
function _bkBytesToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function _bkDeriveKey(password, saltHex) {
  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: _bkHexToBytes(saltHex), iterations: 200000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function _bkEncrypt(password, jsonString) {
  const salt = _bkBytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const iv   = _bkBytesToHex(crypto.getRandomValues(new Uint8Array(12)));
  const key  = await _bkDeriveKey(password, salt);
  const ct   = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: _bkHexToBytes(iv) }, key,
    new TextEncoder().encode(jsonString)
  );
  return JSON.stringify({ v: 1, t: 'LehrerPlanerExport', c: new Date().toISOString(), s: salt, i: iv, d: _bkBytesToHex(ct) });
}
async function _bkDecrypt(password, envelopeString) {
  const env = JSON.parse(envelopeString);
  if (env.v !== 1 || env.t !== 'LehrerPlanerExport') throw new Error('Ungültige Datei');
  const key = await _bkDeriveKey(password, env.s);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: _bkHexToBytes(env.i) }, key, _bkHexToBytes(env.d)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

// Backup export password dialog — resolves with password string or null (cancelled)
function _promptBackupExportPw() {
  return new Promise(resolve => {
    el('backup-pw-input').value   = '';
    el('backup-pw-confirm').value = '';
    el('backup-pw-error').style.display = 'none';
    el('backup-pw-modal').classList.remove('hidden');
    setTimeout(() => el('backup-pw-input').focus(), 50);

    function showErr(msg) {
      const e = el('backup-pw-error');
      e.textContent = msg;
      e.style.display = 'block';
    }
    function onOk() {
      const pw  = el('backup-pw-input').value;
      const pw2 = el('backup-pw-confirm').value;
      if (pw.length < 8)  { showErr('Passwort muss mindestens 8 Zeichen haben'); return; }
      if (pw !== pw2)      { showErr('Passwörter stimmen nicht überein'); return; }
      cleanup(); resolve(pw);
    }
    function onCancel() { cleanup(); resolve(null); }
    function cleanup() {
      el('backup-pw-modal').classList.add('hidden');
      el('backup-pw-ok').removeEventListener('click', onOk);
      el('backup-pw-cancel').removeEventListener('click', onCancel);
      el('backup-pw-close').removeEventListener('click', onCancel);
    }
    el('backup-pw-ok').addEventListener('click', onOk);
    el('backup-pw-cancel').addEventListener('click', onCancel);
    el('backup-pw-close').addEventListener('click', onCancel);
    el('backup-pw-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') onOk(); });
    el('backup-pw-input').addEventListener('keydown', e => { if (e.key === 'Enter') el('backup-pw-confirm').focus(); });
  });
}

// Backup import password dialog — resolves with password string or null (cancelled)
function _promptBackupImportPw() {
  return new Promise(resolve => {
    el('backup-import-pw-input').value = '';
    el('backup-import-pw-error').style.display = 'none';
    el('backup-import-pw-modal').classList.remove('hidden');
    setTimeout(() => el('backup-import-pw-input').focus(), 50);

    function onOk() {
      const pw = el('backup-import-pw-input').value;
      if (!pw) { el('backup-import-pw-error').textContent = 'Bitte Passwort eingeben'; el('backup-import-pw-error').style.display = 'block'; return; }
      cleanup(); resolve(pw);
    }
    function onCancel() { cleanup(); resolve(null); }
    function cleanup() {
      el('backup-import-pw-modal').classList.add('hidden');
      el('backup-import-pw-ok').removeEventListener('click', onOk);
      el('backup-import-pw-cancel').removeEventListener('click', onCancel);
      el('backup-import-pw-close').removeEventListener('click', onCancel);
    }
    el('backup-import-pw-ok').addEventListener('click', onOk);
    el('backup-import-pw-cancel').addEventListener('click', onCancel);
    el('backup-import-pw-close').addEventListener('click', onCancel);
    el('backup-import-pw-input').addEventListener('keydown', e => { if (e.key === 'Enter') onOk(); });
  });
}

// ══════════════════════════════════════════════════════════════
// BACKUP & RESTORE
// ══════════════════════════════════════════════════════════════
async function exportData() {
  const pw = await _promptBackupExportPw();
  if (pw === null) return; // cancelled
  try {
    const data      = await DB.exportAll();
    const json      = JSON.stringify(data);
    const encrypted = await _bkEncrypt(pw, json);
    const blob = new Blob([encrypted], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `LehrerPlaner-Backup-${date}.lpe`;
    a.click();
    URL.revokeObjectURL(url);
    await DB.setSetting('lastBackup', new Date().toISOString());
    App.settings.lastBackup = new Date().toISOString();
    el('dash-backup-banner')?.classList.add('hidden');
    showToast('Verschlüsseltes Backup erstellt ✓', 'success');
  } catch(err) {
    showToast('Fehler beim Export: ' + err.message, 'error');
  }
}

window.dismissBackupBanner = function() {
  el('dash-backup-banner')?.classList.add('hidden');
  DB.setSetting('backupBannerSnoozed', new Date().toISOString());
};

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  const ok = await confirm2(
    'Backup wiederherstellen?',
    'Alle bestehenden Daten werden überschrieben. Dieser Vorgang kann nicht rückgängig gemacht werden.',
    'Wiederherstellen'
  );
  if (!ok) return;

  try {
    const text = await file.text();
    let data;

    // Detect format by content, not just extension.
    // LPE files contain {"v":1,"t":"LehrerPlanerExport",...}
    const isLpe = (() => {
      try { const p = JSON.parse(text); return p.v === 1 && p.t === 'LehrerPlanerExport'; }
      catch(_) { return false; }
    })();

    if (isLpe) {
      const pw = await _promptBackupImportPw();
      if (pw === null) return;
      try {
        data = await _bkDecrypt(pw, text);
      } catch(_) {
        showToast('Falsches Passwort oder ungültige Datei', 'error');
        return;
      }
    } else {
      // Legacy plain JSON backup — warn the user
      data = JSON.parse(text);
      showToast('Legacy Backup ohne Verschlüsselung wird importiert', 'warning');
    }

    await DB.importAll(data);
    App.settings = await DB.getAllSettings();
    App.classes  = await DB.getClasses();
    el('header-teacher').textContent = App.settings.teacherName || '';
    closeSettings();
    showToast('Backup wiederhergestellt ✓', 'success');
    await App.navigate(App.currentView);
  } catch(err) {
    showToast('Fehler beim Import: ' + err.message, 'error');
  }
}

async function newSchoolYear() {
  const ok = await confirm2(
    'Neues Schuljahr anlegen?',
    'Alle Kalendereinträge werden gelöscht. Klassen und Notizen bleiben erhalten.',
    'Neues Schuljahr starten'
  );
  if (!ok) return;
  // Export first as safety
  await exportData();

  // Delete all events
  const events = await DB.getAllEvents();
  for (const ev of events) await DB.deleteEvent(ev.id);

  showToast('Neues Schuljahr angelegt ✓','success');
  closeSettings();
  await App.navigate('dashboard');
}

// ══════════════════════════════════════════════════════════════
// CONFIRM DIALOG
// ══════════════════════════════════════════════════════════════
function confirm2(title, text, okLabel='Löschen') {
  return new Promise(resolve => {
    el('confirm-title').textContent = title || 'Bist du sicher?';
    el('confirm-text').textContent  = text  || '';
    el('confirm-ok').textContent    = okLabel;
    el('confirm-dialog').classList.remove('hidden');
    App._confirmResolve = resolve;
  });
}
el('confirm-ok').addEventListener('click', () => {
  el('confirm-dialog').classList.add('hidden');
  if (App._confirmResolve) App._confirmResolve(true);
  App._confirmResolve = null;
});
el('confirm-cancel').addEventListener('click', () => {
  el('confirm-dialog').classList.add('hidden');
  if (App._confirmResolve) App._confirmResolve(false);
  App._confirmResolve = null;
});

// ══════════════════════════════════════════════════════════════
// SETUP WIZARD
// ══════════════════════════════════════════════════════════════
let _setupStep = 0;

function showSetupWizard() {
  el('setup-wizard').classList.remove('hidden');
  _setupStep = 0;

  // Build class input grids
  function buildGrid(containerId, start, end) {
    const grid = el(containerId);
    grid.innerHTML = '';
    for (let i=start; i<=end; i++) {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'form-input';
      inp.id = `setup-class-${i}`;
      inp.placeholder = `Klasse ${i}`;
      inp.style.textAlign = 'center';
      grid.appendChild(inp);
    }
  }
  buildGrid('setup-classes-1', 1, 9);
  buildGrid('setup-classes-2', 10, 18);

  el('setup-next').addEventListener('click', setupNext, { once: false });
  el('setup-back').addEventListener('click', setupBack, { once: false });
  updateSetupUI();
}

function updateSetupUI() {
  qsa('.setup-step').forEach((s,i) => s.classList.toggle('active', i===_setupStep));
  qsa('.setup-dot').forEach((d,i) => d.classList.toggle('active', i===_setupStep));
  el('setup-back').style.display = _setupStep > 0 ? '' : 'none';
  el('setup-next').textContent = _setupStep < 2 ? 'Weiter →' : '🎉 Loslegen!';
}

function setupBack() {
  if (_setupStep > 0) { _setupStep--; updateSetupUI(); }
}

async function setupNext() {
  if (_setupStep === 0) {
    const name = el('setup-name').value.trim();
    if (!name) { showToast('Bitte deinen Namen eingeben.','error'); return; }
    await DB.setSetting('teacherName', name);
    await DB.setSetting('schoolYear', el('setup-year').value);
    await DB.setSetting('state', el('setup-state').value);
    _setupStep = 1;
    updateSetupUI();
  } else if (_setupStep === 1) {
    // Save classes
    for (let i=1;i<=18;i++) {
      const inp = el(`setup-class-${i}`);
      if (inp && inp.value.trim()) {
        const color = CLASS_COLORS[(i-1) % CLASS_COLORS.length];
        await DB.saveClass({ name:inp.value.trim(), slot:i, color, subject:null });
      }
    }
    _setupStep = 2;
    updateSetupUI();
  } else if (_setupStep === 2) {
    await DB.setSetting('setupDone', true);
    el('setup-wizard').classList.add('hidden');
    await PinAuth.init();
    await launchApp();
  }
}

// ══════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', init);
