// students.js — Schülerverwaltung für LehrerPlaner
'use strict';

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════
const S = {
  classId:        null,   // current class
  kdTab:          'schueler',
  // grades
  gradeView:      'overview', // 'overview' | 'detail'
  gradeStudentId: null,
  gradeFach:      null,
  // attendance
  attDate:        isoDate(new Date()),
  attMonthMode:   false,
  // remarks
  remarkStudentFilter: null,  // null = all
  remarkCat:      'allgemein',
  // seating
  seatingSelected: null,   // { type:'seat'|'pool', row, col } | { type:'pool', studentId }
  seatingRows:    5,
  seatingCols:    6,
  // homework
  hwDate:         isoDate(new Date()),
  hwFach:         '',
  hwMonthMode:    false,
  // asv import
  asvStep:        1,
  asvRows:        [],     // parsed raw rows (array of arrays)
  asvHeaders:     [],
  asvMapping:     {},     // colIndex → fieldName
};

// ══════════════════════════════════════════════════════════════
// ENTRY POINT — called from klasse card
// ══════════════════════════════════════════════════════════════
window.openKlasseDetail = async function(classId) {
  S.classId  = classId;
  S.kdTab    = 'schueler';
  S.gradeView = 'overview';
  await App.navigate('klasse-detail');
};

// Called by app.js navigate
async function renderKlasseDetail() {
  const cls = await DB.getClass(S.classId);
  if (!cls) { App.navigate('klassen'); return; }

  el('kd-class-name').textContent    = cls.name    || '';
  el('kd-class-subject').textContent = cls.subject || '';

  // Back button
  el('kd-back-btn').onclick = () => App.navigate('klassen');

  // Tab wiring (re-wire on each render to avoid stale closures)
  qsa('.kd-tab').forEach(btn => {
    btn.onclick = () => switchKdTab(btn.dataset.kd);
  });

  await switchKdTab(S.kdTab);
}

async function switchKdTab(tab) {
  S.kdTab = tab;
  qsa('.kd-tab').forEach(b => b.classList.toggle('active', b.dataset.kd === tab));
  const act = el('kd-action-btn');
  act.style.display = '';
  act.onclick = null;

  switch (tab) {
    case 'schueler':     await renderSchuelerTab(act); break;
    case 'noten':        await renderNotenTab(act); break;
    case 'anwesenheit':  await renderAnwesenheitTab(act); break;
    case 'bemerkungen':  await renderBemerkungenTab(act); break;
    case 'sitzplan':     await renderSitzplanTab(act); break;
    case 'hausaufgaben': await renderHausaufgabenTab(act); break;
  }
}

// Helper: get active students sorted alphabetically
async function getActiveStudents(includeInactive = false) {
  const all = await DB.getStudentsByClass(S.classId);
  const filtered = includeInactive ? all : all.filter(s => s.aktiv !== false);
  return filtered.sort((a, b) => {
    const na = (a.nachname + a.vorname).toLowerCase();
    const nb = (b.nachname + b.vorname).toLowerCase();
    return na.localeCompare(nb, 'de');
  });
}

// ══════════════════════════════════════════════════════════════
// SCHÜLER TAB
// ══════════════════════════════════════════════════════════════
async function renderSchuelerTab(act) {
  act.textContent = '+ Schüler';
  act.onclick = () => openStudentModal(null);

  const students = await DB.getStudentsByClass(S.classId);
  students.sort((a, b) => (a.nachname + a.vorname).localeCompare(b.nachname + b.vorname, 'de'));

  const c = el('kd-content');

  const importBtn = `<button class="btn btn-secondary btn-sm" onclick="openASVImport()">↑ Aus ASV importieren</button>`;

  if (!students.length) {
    c.innerHTML = `<div class="kd-toolbar">${importBtn}</div>
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <p>Noch keine Schüler in dieser Klasse.<br>Schüler hinzufügen oder CSV/Excel importieren.</p>
      </div>`;
    return;
  }

  const active   = students.filter(s => s.aktiv !== false);
  const inactive = students.filter(s => s.aktiv === false);

  let html = `<div class="kd-toolbar">${importBtn}<span class="text-muted text-sm">${active.length} aktiv${inactive.length ? `, ${inactive.length} inaktiv` : ''}</span></div>`;
  html += '<div class="student-list">';
  for (const s of students) {
    const initials = (s.vorname[0] || '') + (s.nachname[0] || '');
    const gClass = s.geschlecht === 'w' ? 'w' : s.geschlecht === 'd' ? 'd' : '';
    const inactiveRow = s.aktiv === false ? ' inactive' : '';
    html += `<div class="student-row${inactiveRow}">
      <div class="student-avatar ${gClass}">${escHtml(initials.toUpperCase())}</div>
      <div class="student-name">
        ${escHtml(s.nachname)}, <span class="vorname">${escHtml(s.vorname)}</span>
      </div>
      <div class="student-badges">
        ${s.aktiv === false ? '<span class="badge-inactive">Inaktiv</span>' : ''}
        ${s.geburtsdatum ? `<span class="text-muted text-sm">${formatDateDE(s.geburtsdatum)}</span>` : ''}
      </div>
      <div class="student-actions">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openStudentModal(${s.id})" title="Bearbeiten">✎</button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openRemarkForStudent(${s.id})" title="Bemerkung">💬</button>
      </div>
    </div>`;
  }
  html += '</div>';
  c.innerHTML = html;

  // Update class card student count
  const countEl = document.getElementById(`kl-count-${S.classId}`);
  if (countEl) countEl.textContent = `${active.length} Schüler`;
}

// Student modal
let _editStudentId = null;

window.openStudentModal = async function(id) {
  _editStudentId = id || null;
  el('student-modal-title').textContent = id ? 'Schüler bearbeiten' : 'Neuer Schüler';
  el('s-nachname').value     = '';
  el('s-vorname').value      = '';
  el('s-geschlecht').value   = 'm';
  el('s-geburtsdatum').value = '';
  el('s-aktiv').checked      = true;
  el('s-deactivate').style.display = 'none';

  if (id) {
    const s = await DB.getStudent(id);
    if (s) {
      el('s-nachname').value     = s.nachname     || '';
      el('s-vorname').value      = s.vorname      || '';
      el('s-geschlecht').value   = s.geschlecht   || 'm';
      el('s-geburtsdatum').value = s.geburtsdatum || '';
      el('s-aktiv').checked      = s.aktiv !== false;
      el('s-deactivate').style.display = '';
      el('s-deactivate').textContent = s.aktiv !== false ? 'Deaktivieren' : 'Reaktivieren';
    }
  }
  el('student-modal').classList.remove('hidden');
  setTimeout(() => el('s-nachname').focus(), 50);
};

async function saveStudent() {
  const nachname = el('s-nachname').value.trim();
  const vorname  = el('s-vorname').value.trim();
  if (!nachname || !vorname) { showToast('Vor- und Nachname erforderlich', 'error'); return; }

  const s = {
    classId:      S.classId,
    nachname,
    vorname,
    geschlecht:   el('s-geschlecht').value,
    geburtsdatum: el('s-geburtsdatum').value || null,
    aktiv:        el('s-aktiv').checked,
  };
  if (_editStudentId) s.id = _editStudentId;

  const savedId = await DB.saveStudent(s);
  // Sync birthday to events store
  if (s.geburtsdatum) await syncBirthday({ ...s, id: savedId || _editStudentId });

  closeStudentModal();
  showToast('Schüler gespeichert ✓', 'success');
  await renderSchuelerTab(el('kd-action-btn'));
}

function closeStudentModal() { el('student-modal').classList.add('hidden'); }

async function deactivateStudent() {
  if (!_editStudentId) return;
  const s = await DB.getStudent(_editStudentId);
  if (!s) return;
  s.aktiv = s.aktiv !== false ? false : true;
  await DB.saveStudent(s);
  closeStudentModal();
  showToast(s.aktiv ? 'Reaktiviert' : 'Deaktiviert');
  await renderSchuelerTab(el('kd-action-btn'));
}

// ══════════════════════════════════════════════════════════════
// NOTEN TAB
// ══════════════════════════════════════════════════════════════
const GEW = { muendlich: 1, schriftlich: 2, projekt: 1.5 };

function calcAvg(grades) {
  if (!grades.length) return null;
  const sumW = grades.reduce((s, g) => s + (g.gewichtung || 1), 0);
  const sumWN = grades.reduce((s, g) => s + g.note * (g.gewichtung || 1), 0);
  return sumWN / sumW;
}

function avgColor(avg) {
  if (avg === null) return '';
  if (avg <= 1.5) return 'g1';
  if (avg <= 2.5) return 'g2';
  if (avg <= 3.5) return 'g3';
  if (avg <= 4.5) return 'g4';
  return 'g5';
}

function gradeColor(note) {
  if (note <= 1.5) return '#10B981';
  if (note <= 2.5) return '#84CC16';
  if (note <= 3.5) return '#F59E0B';
  if (note <= 4.5) return '#F97316';
  return '#EF4444';
}

async function renderNotenTab(act) {
  act.textContent = '+ Note';
  act.onclick = () => openGradeModal(null, null, null);

  if (S.gradeView === 'detail' && S.gradeStudentId) {
    await renderStudentGradeDetail(act);
    return;
  }

  const students = await getActiveStudents();
  const allGrades = await DB.getGradesByClass(S.classId);

  // Collect all subjects
  const subjects = [...new Set(allGrades.map(g => g.fach).filter(Boolean))].sort();

  const c = el('kd-content');

  if (!students.length) {
    c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><p>Keine aktiven Schüler in dieser Klasse.</p></div>';
    return;
  }

  // Build table: students × subjects
  let html = `<div class="kd-toolbar">
    <button class="btn btn-secondary btn-sm" onclick="openGradeModal(null,null,null)">+ Note eintragen</button>
  </div>
  <div class="grades-table-wrap">
  <table class="grades-table">
    <thead><tr>
      <th>Schüler/in</th>
      ${subjects.map(f => `<th class="subject-col">${escHtml(f)}</th>`).join('')}
      <th class="subject-col">Ø Gesamt</th>
    </tr></thead>
    <tbody>`;

  for (const s of students) {
    const sg = allGrades.filter(g => g.studentId === s.id);
    const overallAvg = calcAvg(sg);
    html += `<tr onclick="showStudentGrades(${s.id})">
      <td style="cursor:pointer;font-weight:500;">${escHtml(s.nachname)}, ${escHtml(s.vorname)}</td>`;
    for (const fach of subjects) {
      const fg = sg.filter(g => g.fach === fach);
      const avg = calcAvg(fg);
      if (avg !== null) {
        html += `<td class="grade-cell"><span class="grade-avg ${avgColor(avg)}">${avg.toFixed(1)}</span></td>`;
      } else {
        html += `<td class="grade-cell" onclick="event.stopPropagation();openGradeModal(null,${s.id},'${escHtml(fach)}')"><span style="color:var(--text-muted)">—</span></td>`;
      }
    }
    const oa = overallAvg;
    html += `<td class="grade-cell">${oa !== null ? `<span class="grade-avg ${avgColor(oa)}">${oa.toFixed(1)}</span>` : '—'}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  c.innerHTML = html;
}

window.showStudentGrades = function(studentId) {
  S.gradeView = 'detail';
  S.gradeStudentId = studentId;
  renderNotenTab(el('kd-action-btn'));
};

async function renderStudentGradeDetail(act) {
  const s = await DB.getStudent(S.gradeStudentId);
  const allGrades = await DB.getGradesByStudent(S.gradeStudentId);
  allGrades.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));

  const subjects = [...new Set(allGrades.map(g => g.fach).filter(Boolean))].sort();

  const c = el('kd-content');
  let html = `<div class="kd-toolbar">
    <button class="btn btn-ghost btn-sm" onclick="S.gradeView='overview';renderNotenTab(el('kd-action-btn'))">← Übersicht</button>
    <strong style="font-size:15px;">${escHtml(s?.nachname||'')}, ${escHtml(s?.vorname||'')}</strong>
    <button class="btn btn-primary btn-sm" onclick="openGradeModal(null,${S.gradeStudentId},null)">+ Note</button>
  </div>`;

  if (!allGrades.length) {
    html += '<div class="empty-state"><p>Noch keine Noten für diesen Schüler.</p></div>';
    c.innerHTML = html;
    return;
  }

  // Group by subject
  for (const fach of subjects) {
    const fg = allGrades.filter(g => g.fach === fach);
    const avg = calcAvg(fg);
    html += `<div style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div class="section-title" style="margin:0;">${escHtml(fach)}</div>
        ${avg !== null ? `<span class="grade-avg ${avgColor(avg)}" style="width:auto;padding:0 10px;">${avg.toFixed(2)}</span>` : ''}
      </div>
      <div class="grade-list">
        ${fg.map(g => `<div class="grade-item">
          <div class="grade-note-badge" style="background:${gradeColor(g.note)};">${g.note}</div>
          <div class="grade-info">
            <div style="display:flex;gap:6px;align-items:center;">
              <span class="grade-type-badge">${g.typ||'mündlich'}</span>
              <span class="text-muted text-sm">×${g.gewichtung||1}</span>
              ${g.datum ? `<span class="text-muted text-sm">${formatDateDE(g.datum)}</span>` : ''}
            </div>
            ${g.kommentar ? `<div class="text-sm" style="color:var(--text-2);margin-top:2px;">${escHtml(g.kommentar)}</div>` : ''}
          </div>
          <div class="grade-actions">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="openGradeModal(${g.id},null,null)">✎</button>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  }
  c.innerHTML = html;
}

// Grade modal
let _editGradeId = null;

window.openGradeModal = async function(gradeId, preStudentId, preFach) {
  _editGradeId = gradeId || null;
  const students = await getActiveStudents();

  const sel = el('g-student');
  sel.innerHTML = students.map(s =>
    `<option value="${s.id}">${escHtml(s.nachname)}, ${escHtml(s.vorname)}</option>`
  ).join('');

  // Populate fach datalist
  const allGrades = await DB.getGradesByClass(S.classId);
  const subjects = [...new Set(allGrades.map(g => g.fach).filter(Boolean))].sort();
  el('g-fach-list').innerHTML = subjects.map(f => `<option value="${escHtml(f)}">`).join('');

  el('grade-modal-title').textContent = gradeId ? 'Note bearbeiten' : 'Note eintragen';
  el('g-datum').value       = isoDate(new Date());
  el('g-note').value        = '';
  el('g-typ').value         = 'muendlich';
  el('g-gewichtung').value  = '1';
  el('g-kommentar').value   = '';
  el('g-fach').value        = preFach || '';
  el('g-delete').style.display = 'none';

  if (preStudentId) sel.value = preStudentId;
  if (S.gradeStudentId) sel.value = S.gradeStudentId;

  if (gradeId) {
    const g = await DB.getGrade(gradeId);
    if (g) {
      sel.value             = g.studentId;
      el('g-fach').value    = g.fach || '';
      el('g-note').value    = g.note;
      el('g-typ').value     = g.typ         || 'muendlich';
      el('g-gewichtung').value = g.gewichtung || 1;
      el('g-datum').value   = g.datum       || isoDate(new Date());
      el('g-kommentar').value = g.kommentar || '';
      el('g-delete').style.display = '';
    }
  }

  // Auto-set Gewichtung when type changes
  el('g-typ').onchange = () => {
    el('g-gewichtung').value = GEW[el('g-typ').value] || 1;
  };

  el('grade-modal').classList.remove('hidden');
  setTimeout(() => el('g-note').focus(), 50);
};

async function saveGrade() {
  const studentId = Number(el('g-student').value);
  const fach      = el('g-fach').value.trim();
  const note      = parseFloat(el('g-note').value);
  if (!fach)              { showToast('Fach eingeben', 'error'); return; }
  if (isNaN(note) || note < 1 || note > 6) { showToast('Note muss zwischen 1 und 6 liegen', 'error'); return; }

  const g = {
    studentId,
    classId:     S.classId,
    fach,
    note,
    typ:         el('g-typ').value,
    gewichtung:  parseFloat(el('g-gewichtung').value) || 1,
    datum:       el('g-datum').value,
    kommentar:   el('g-kommentar').value.trim() || null,
  };
  if (_editGradeId) g.id = _editGradeId;
  await DB.saveGrade(g);
  closeGradeModal();
  showToast('Note gespeichert ✓', 'success');
  await renderNotenTab(el('kd-action-btn'));
}

async function deleteGradeFromModal() {
  if (!_editGradeId) return;
  if (!await confirm2('Note löschen?')) return;
  await DB.deleteGrade(_editGradeId);
  closeGradeModal();
  showToast('Note gelöscht');
  await renderNotenTab(el('kd-action-btn'));
}

function closeGradeModal() { el('grade-modal').classList.add('hidden'); }

// ══════════════════════════════════════════════════════════════
// ANWESENHEIT TAB
// ══════════════════════════════════════════════════════════════
const ATT_CYCLE  = ['anwesend', 'fehlt', 'entschuldigt', 'spaet'];
const ATT_LABEL  = { anwesend:'✓ Anwesend', fehlt:'✗ Fehlt', entschuldigt:'⚡ Entschuldigt', spaet:'⏱ Verspätet' };
const ATT_CLASS  = { anwesend:'att-anwesend', fehlt:'att-fehlt', entschuldigt:'att-entschuldigt', spaet:'att-spaet' };

// In-memory map for current day: studentId → status
let _attMap = {};

async function renderAnwesenheitTab(act) {
  act.style.display = 'none';
  const students = await getActiveStudents();
  const c = el('kd-content');

  const viewToggle = `<div style="display:flex;gap:6px;margin-left:auto;">
    <button class="btn btn-sm ${!S.attMonthMode ? 'btn-primary' : 'btn-secondary'}" onclick="S.attMonthMode=false;renderAnwesenheitTab(el('kd-action-btn'))">Tagesansicht</button>
    <button class="btn btn-sm ${S.attMonthMode  ? 'btn-primary' : 'btn-secondary'}" onclick="S.attMonthMode=true;renderAnwesenheitTab(el('kd-action-btn'))">Monatsübersicht</button>
  </div>`;

  if (S.attMonthMode) {
    await renderAttMonthly(c, students, viewToggle);
    return;
  }

  // Daily view
  const recs = await DB.getAttendanceByClassAndDate(S.classId, S.attDate);
  _attMap = {};
  recs.forEach(r => { _attMap[r.studentId] = r.status; });

  let html = `<div class="kd-toolbar" style="flex-wrap:nowrap;">
    <label style="font-size:13px;font-weight:500;">Datum:</label>
    <input type="date" class="form-input" id="att-date-input" value="${S.attDate}" style="width:160px;">
    ${viewToggle}
  </div>`;

  if (!students.length) {
    html += '<div class="empty-state"><p>Keine aktiven Schüler.</p></div>';
    c.innerHTML = html;
    return;
  }

  html += '<div id="att-list">';
  for (const s of students) {
    const status = _attMap[s.id] || 'anwesend';
    html += attRowHtml(s, status);
  }
  html += '</div>';
  html += `<div style="margin-top:16px;display:flex;gap:8px;">
    <button class="btn btn-primary btn-sm" onclick="saveAttendance()">Speichern</button>
    <button class="btn btn-secondary btn-sm" onclick="setAllAttendance('anwesend')">Alle anwesend</button>
  </div>`;
  c.innerHTML = html;

  el('att-date-input').addEventListener('change', e => {
    S.attDate = e.target.value;
    renderAnwesenheitTab(el('kd-action-btn'));
  });
}

function attRowHtml(s, status) {
  return `<div class="att-row" id="att-row-${s.id}">
    <div class="att-name">${escHtml(s.nachname)}, ${escHtml(s.vorname)}</div>
    <button class="att-status-btn ${ATT_CLASS[status]}" data-sid="${s.id}" onclick="cycleAttStatus(${s.id},this)">
      ${ATT_LABEL[status]}
    </button>
  </div>`;
}

window.cycleAttStatus = function(studentId, btn) {
  const cur = _attMap[studentId] || 'anwesend';
  const idx  = ATT_CYCLE.indexOf(cur);
  const next = ATT_CYCLE[(idx + 1) % ATT_CYCLE.length];
  _attMap[studentId] = next;
  btn.textContent  = ATT_LABEL[next];
  btn.className    = `att-status-btn ${ATT_CLASS[next]}`;
};

window.setAllAttendance = function(status) {
  const students = el('att-list').querySelectorAll('[data-sid]');
  students.forEach(btn => {
    const sid = Number(btn.dataset.sid);
    _attMap[sid] = status;
    btn.textContent = ATT_LABEL[status];
    btn.className   = `att-status-btn ${ATT_CLASS[status]}`;
  });
};

window.saveAttendance = async function() {
  // Delete existing records for this class+date, then save deviations
  await DB.deleteAttendancesForClassAndDate(S.classId, S.attDate);
  for (const [sid, status] of Object.entries(_attMap)) {
    if (status !== 'anwesend') {
      await DB.saveAttendance({
        studentId: Number(sid),
        classId:   S.classId,
        datum:     S.attDate,
        status,
      });
    }
  }
  showToast('Anwesenheit gespeichert ✓', 'success');
};

async function renderAttMonthly(c, students, viewToggle) {
  const now   = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const recs  = await DB.getAttendanceByClassAndMonth(S.classId, month);

  let html = `<div class="kd-toolbar">${viewToggle}</div>
    <div class="section-title" style="margin-bottom:8px;">${MONTHS[now.getMonth()]} ${now.getFullYear()}</div>
    <table class="att-month-table">
      <thead><tr>
        <th>Schüler/in</th>
        <th>Fehltage gesamt</th>
        <th>davon entsch.</th>
        <th>Verspätungen</th>
      </tr></thead><tbody>`;

  for (const s of students) {
    const sr    = recs.filter(r => r.studentId === s.id);
    const fehlt = sr.filter(r => r.status === 'fehlt' || r.status === 'entschuldigt').length;
    const entsch= sr.filter(r => r.status === 'entschuldigt').length;
    const spaet = sr.filter(r => r.status === 'spaet').length;
    html += `<tr>
      <td>${escHtml(s.nachname)}, ${escHtml(s.vorname)}</td>
      <td><span class="att-count${fehlt > 3 ? ' red' : ''}">${fehlt}</span></td>
      <td>${entsch}</td>
      <td>${spaet}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  c.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// BEMERKUNGEN TAB
// ══════════════════════════════════════════════════════════════
async function renderBemerkungenTab(act) {
  act.textContent = '+ Bemerkung';
  act.onclick = () => openRemarkModal(null);

  const students = await getActiveStudents(true);
  const remarks  = await DB.getRemarksByClass(S.classId);
  remarks.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));

  const studentMap = Object.fromEntries(students.map(s => [s.id, s]));
  const filtered   = S.remarkStudentFilter
    ? remarks.filter(r => r.studentId === S.remarkStudentFilter)
    : remarks;

  const c = el('kd-content');

  // Filter toolbar
  const opts = students.map(s =>
    `<option value="${s.id}"${S.remarkStudentFilter === s.id ? ' selected' : ''}>${escHtml(s.nachname)}, ${escHtml(s.vorname)}</option>`
  ).join('');

  let html = `<div class="kd-toolbar">
    <select class="form-select" id="remark-filter" style="max-width:220px;">
      <option value="">Alle Schüler</option>
      ${opts}
    </select>
  </div>`;

  if (!filtered.length) {
    html += '<div class="empty-state"><div class="empty-state-icon">💬</div><p>Keine Bemerkungen vorhanden.</p></div>';
    c.innerHTML = html;
    c.querySelector('#remark-filter').onchange = e => {
      S.remarkStudentFilter = e.target.value ? Number(e.target.value) : null;
      renderBemerkungenTab(act);
    };
    return;
  }

  for (const r of filtered) {
    const s = studentMap[r.studentId];
    html += `<div class="remark-item ${r.kategorie||'allgemein'}">
      <div class="remark-meta">
        <div class="remark-date">${formatDateDE(r.datum)}</div>
        <span class="remark-cat ${r.kategorie||'allgemein'}">${escHtml(r.kategorie||'allgemein')}</span>
        ${!S.remarkStudentFilter && s ? `<div class="remark-student">${escHtml(s.nachname)}</div>` : ''}
      </div>
      <div class="remark-text">${escHtml(r.text)}</div>
      <button class="btn btn-ghost btn-sm btn-icon remark-del" onclick="deleteRemark(${r.id})">×</button>
    </div>`;
  }
  c.innerHTML = html;
  c.querySelector('#remark-filter').onchange = e => {
    S.remarkStudentFilter = e.target.value ? Number(e.target.value) : null;
    renderBemerkungenTab(act);
  };
}

window.deleteRemark = async function(id) {
  if (!await confirm2('Bemerkung löschen?')) return;
  await DB.deleteRemark(id);
  await renderBemerkungenTab(el('kd-action-btn'));
};

window.openRemarkForStudent = function(studentId) {
  S.remarkStudentFilter = studentId;
  switchKdTab('bemerkungen');
};

// Remark modal
window.openRemarkModal = async function(preStudentId) {
  const students = await getActiveStudents();
  const sel = el('r-student');
  sel.innerHTML = students.map(s =>
    `<option value="${s.id}">${escHtml(s.nachname)}, ${escHtml(s.vorname)}</option>`
  ).join('');

  if (preStudentId) sel.value = preStudentId;
  else if (S.remarkStudentFilter) sel.value = S.remarkStudentFilter;

  el('r-datum').value = isoDate(new Date());
  el('r-text').value  = '';
  S.remarkCat = 'allgemein';
  updateRemarkCatBtns();
  el('remark-modal').classList.remove('hidden');
  setTimeout(() => el('r-text').focus(), 50);
};

function updateRemarkCatBtns() {
  qsa('.remark-cat-btn', el('r-cat-btns')).forEach(b => {
    b.classList.toggle('active', b.dataset.cat === S.remarkCat);
  });
}

async function saveRemark() {
  const text = el('r-text').value.trim();
  if (!text) { showToast('Text eingeben', 'error'); return; }
  await DB.saveRemark({
    studentId: Number(el('r-student').value),
    classId:   S.classId,
    datum:     el('r-datum').value,
    kategorie: S.remarkCat,
    text,
  });
  el('remark-modal').classList.add('hidden');
  showToast('Bemerkung gespeichert ✓', 'success');
  await renderBemerkungenTab(el('kd-action-btn'));
}

// ══════════════════════════════════════════════════════════════
// SITZPLAN TAB
// ══════════════════════════════════════════════════════════════
async function renderSitzplanTab(act) {
  act.textContent = 'PNG exportieren';
  act.onclick = exportSeatingPNG;

  const students = await getActiveStudents();
  let plan = await DB.getSeatingPlan(S.classId);
  if (!plan) {
    plan = { classId: S.classId, rows: S.seatingRows, cols: S.seatingCols, grid: [] };
  }
  S.seatingRows = plan.rows || 5;
  S.seatingCols = plan.cols || 6;

  // Ensure grid is properly sized
  plan.grid = normalizeGrid(plan.grid, S.seatingRows, S.seatingCols);

  // Find seated student IDs
  const seatedIds = new Set(plan.grid.flat().filter(id => id !== null));
  const pool = students.filter(s => !seatedIds.has(s.id));

  const c = el('kd-content');
  let html = `<div class="kd-toolbar">
    <label class="form-label" style="margin:0;">Reihen:</label>
    <input type="number" class="form-input" id="sp-rows" value="${S.seatingRows}" min="1" max="10" style="width:60px;">
    <label class="form-label" style="margin:0;">Spalten:</label>
    <input type="number" class="form-input" id="sp-cols" value="${S.seatingCols}" min="1" max="10" style="width:60px;">
    <button class="btn btn-secondary btn-sm" onclick="updateSeatingSize()">Anpassen</button>
    <button class="btn btn-secondary btn-sm" onclick="clearSeatingPlan()">Zurücksetzen</button>
  </div>
  <div class="seating-wrap">
    <div class="seating-grid-wrap">
      <div class="seating-blackboard">TAFEL / VORNE</div>
      <div class="seating-grid" id="seating-grid" style="grid-template-columns:repeat(${S.seatingCols},1fr);"></div>
    </div>
    <div class="seating-sidebar">
      <div class="seating-sidebar-title">Nicht platziert</div>
      <div class="seating-pool" id="seating-pool">
        ${pool.length ? pool.map(s =>
          `<div class="pool-student" data-sid="${s.id}" onclick="selectPoolStudent(${s.id},this)">
            ${escHtml(s.nachname)}, ${escHtml(s.vorname[0])}.
          </div>`
        ).join('') : '<div class="text-muted text-sm" style="padding:8px;">Alle platziert ✓</div>'}
      </div>
    </div>
  </div>`;
  c.innerHTML = html;

  renderSeatingGrid(plan);
}

function normalizeGrid(grid, rows, cols) {
  const g = [];
  for (let r = 0; r < rows; r++) {
    const row = grid[r] ? [...grid[r]] : [];
    while (row.length < cols) row.push(null);
    g.push(row.slice(0, cols));
  }
  return g;
}

function renderSeatingGrid(plan) {
  const grid = el('seating-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let r = 0; r < S.seatingRows; r++) {
    for (let c = 0; c < S.seatingCols; c++) {
      const sid = (plan.grid[r] || [])[c] || null;
      const seat = document.createElement('div');
      seat.className = 'seat' + (sid ? ' occupied' : '');
      seat.dataset.row = r;
      seat.dataset.col = c;
      if (sid) {
        const stu = DB.getStudent(sid); // we'll render async
        seat.innerHTML = `<div class="seat-empty" style="font-size:10px;">…</div>`;
        DB.getStudent(sid).then(s => {
          if (s) seat.innerHTML = `<div class="seat-name">${escHtml(s.nachname)}<br>${escHtml(s.vorname[0])}.</div>`;
        });
        seat.dataset.sid = sid;
      } else {
        seat.innerHTML = '<div class="seat-empty">+</div>';
      }
      seat.addEventListener('click', () => onSeatClick(r, c, plan));
      grid.appendChild(seat);
    }
  }
}

window.selectPoolStudent = function(sid, el_) {
  S.seatingSelected = { type: 'pool', studentId: sid };
  qsa('.pool-student').forEach(el_ => el_.classList.remove('selected'));
  el_.classList.add('selected');
  qsa('.seat').forEach(s => s.classList.remove('selected'));
};

async function onSeatClick(row, col, plan) {
  const curSid = (plan.grid[row] || [])[col] || null;

  if (S.seatingSelected) {
    if (S.seatingSelected.type === 'pool') {
      // Place unplaced student here; if occupied swap to pool
      if (curSid) {
        // Move existing to pool (already there in the pool list or add it)
        const poolEl = el('seating-pool');
        const exists = poolEl.querySelector(`[data-sid="${curSid}"]`);
        if (!exists) {
          const s = await DB.getStudent(curSid);
          if (s) {
            poolEl.innerHTML += `<div class="pool-student" data-sid="${curSid}" onclick="selectPoolStudent(${curSid},this)">${escHtml(s.nachname)}, ${escHtml(s.vorname[0])}.</div>`;
          }
        }
      }
      plan.grid[row][col] = S.seatingSelected.studentId;
      // Remove from pool UI
      const poolBtn = el('seating-pool').querySelector(`[data-sid="${S.seatingSelected.studentId}"]`);
      if (poolBtn) poolBtn.remove();
    } else if (S.seatingSelected.type === 'seat') {
      // Swap seats
      const fromRow = S.seatingSelected.row;
      const fromCol = S.seatingSelected.col;
      const fromSid = (plan.grid[fromRow] || [])[fromCol] || null;
      plan.grid[row][col]         = fromSid;
      plan.grid[fromRow][fromCol] = curSid;
    }
    S.seatingSelected = null;
    await DB.saveSeatingPlan(plan);
    renderSeatingGrid(plan);
    return;
  }

  // Nothing selected — select this seat (if occupied) or do nothing
  if (curSid) {
    S.seatingSelected = { type: 'seat', row, col };
    qsa('.seat').forEach(s => s.classList.remove('selected'));
    const seatsEls = el('seating-grid').children;
    const idx = row * S.seatingCols + col;
    seatsEls[idx].classList.add('selected');
  } else {
    // Empty seat clicked with nothing selected — no op
    S.seatingSelected = null;
    qsa('.seat').forEach(s => s.classList.remove('selected'));
  }
}

window.updateSeatingSize = async function() {
  const rows = Math.max(1, Math.min(10, parseInt(el('sp-rows').value) || 5));
  const cols = Math.max(1, Math.min(10, parseInt(el('sp-cols').value) || 6));
  S.seatingRows = rows;
  S.seatingCols = cols;
  let plan = await DB.getSeatingPlan(S.classId) || { classId: S.classId, grid: [] };
  plan.rows = rows;
  plan.cols = cols;
  plan.grid = normalizeGrid(plan.grid, rows, cols);
  await DB.saveSeatingPlan(plan);
  await renderSitzplanTab(el('kd-action-btn'));
};

window.clearSeatingPlan = async function() {
  if (!await confirm2('Sitzplan zurücksetzen?', 'Alle Platzzuweisungen werden gelöscht.')) return;
  const plan = { classId: S.classId, rows: S.seatingRows, cols: S.seatingCols, grid: normalizeGrid([], S.seatingRows, S.seatingCols) };
  await DB.saveSeatingPlan(plan);
  S.seatingSelected = null;
  await renderSitzplanTab(el('kd-action-btn'));
};

async function exportSeatingPNG() {
  const plan = await DB.getSeatingPlan(S.classId);
  if (!plan) { showToast('Kein Sitzplan vorhanden', 'error'); return; }
  const cls = await DB.getClass(S.classId);

  const CELL_W = 130, CELL_H = 60, PAD = 20, TITLE_H = 40;
  const W = S.seatingCols * CELL_W + PAD * 2;
  const H = S.seatingRows * CELL_H + PAD * 2 + TITLE_H + 30;

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#1A1A2E';
  ctx.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx.fillText(`Sitzplan — ${cls?.name || ''} ${cls?.subject || ''}`, PAD, PAD + 18);

  // Blackboard bar
  ctx.fillStyle = '#2D4A2D';
  ctx.fillRect(PAD, PAD + TITLE_H, W - PAD * 2, 20);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TAFEL / VORNE', W / 2, PAD + TITLE_H + 14);
  ctx.textAlign = 'left';

  // Draw seats
  const allStudents = await DB.getStudentsByClass(S.classId);
  const sMap = Object.fromEntries(allStudents.map(s => [s.id, s]));

  for (let r = 0; r < S.seatingRows; r++) {
    for (let c2 = 0; c2 < S.seatingCols; c2++) {
      const x = PAD + c2 * CELL_W;
      const y = PAD + TITLE_H + 30 + r * CELL_H;
      const sid = (plan.grid[r] || [])[c2] || null;

      ctx.strokeStyle = '#DDE2EA';
      ctx.lineWidth = 1;
      ctx.fillStyle = sid ? '#EEF3FA' : '#F8F9FA';
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, CELL_W - 4, CELL_H - 4, 6);
      ctx.fill();
      ctx.stroke();

      if (sid && sMap[sid]) {
        const s = sMap[sid];
        ctx.fillStyle = '#1A1A2E';
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.nachname, x + CELL_W / 2, y + CELL_H / 2 - 2);
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#6B7280';
        ctx.fillText(s.vorname, x + CELL_W / 2, y + CELL_H / 2 + 12);
        ctx.textAlign = 'left';
      }
    }
  }

  const url = cv.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `Sitzplan-${cls?.name || 'Klasse'}.png`;
  a.click();
  showToast('Sitzplan exportiert ✓', 'success');
}

// ══════════════════════════════════════════════════════════════
// HAUSAUFGABEN TAB
// ══════════════════════════════════════════════════════════════
async function renderHausaufgabenTab(act) {
  act.style.display = 'none';
  const students = await getActiveStudents();
  const allHW = await DB.getHomeworkByClass(S.classId);
  const c = el('kd-content');

  // Subjects from grades
  const allGrades = await DB.getGradesByClass(S.classId);
  const subjects = [...new Set(allGrades.map(g => g.fach).filter(Boolean))].sort();

  const subjectOpts = subjects.map(f => `<option value="${escHtml(f)}"${S.hwFach===f?' selected':''}>${escHtml(f)}</option>`).join('');
  const viewToggle = `<button class="btn btn-sm ${!S.hwMonthMode?'btn-primary':'btn-secondary'}" onclick="S.hwMonthMode=false;renderHausaufgabenTab(el('kd-action-btn'))">Schnelleingabe</button>
    <button class="btn btn-sm ${S.hwMonthMode?'btn-primary':'btn-secondary'}" onclick="S.hwMonthMode=true;renderHausaufgabenTab(el('kd-action-btn'))">Monatsübersicht</button>`;

  if (S.hwMonthMode) {
    // Count per student
    const counts = {};
    students.forEach(s => { counts[s.id] = 0; });
    allHW.forEach(h => { if (counts[h.studentId] !== undefined) counts[h.studentId]++; });
    const sorted = students.slice().sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    const max = Math.max(1, ...sorted.map(s => counts[s.id] || 0));

    let html = `<div class="kd-toolbar">${viewToggle}</div>
      <div class="section-title" style="margin-bottom:12px;">Häufigste Versäumnisse (gesamt)</div>`;
    sorted.forEach((s, i) => {
      const cnt = counts[s.id] || 0;
      html += `<div class="hw-month-row">
        <div class="hw-rank">${i + 1}.</div>
        <div class="hw-month-name">${escHtml(s.nachname)}, ${escHtml(s.vorname)}</div>
        <div class="hw-bar-wrap"><div class="hw-bar" style="width:${Math.round(cnt/max*100)}%;"></div></div>
        <div class="hw-count">${cnt}</div>
      </div>`;
    });
    c.innerHTML = html;
    return;
  }

  // Daily quick-entry
  // Today's already-marked students for this date+subject
  const todayHW = allHW.filter(h => h.datum === S.hwDate && (!S.hwFach || h.fach === S.hwFach));
  const markedIds = new Set(todayHW.map(h => h.studentId));

  let html = `<div class="kd-toolbar">
    <input type="date" class="form-input" value="${S.hwDate}" id="hw-date-input" style="width:160px;">
    <select class="form-select" id="hw-fach-input" style="max-width:180px;">
      <option value="">Kein Fach</option>${subjectOpts}
    </select>
    ${viewToggle}
  </div>`;

  if (!students.length) {
    html += '<div class="empty-state"><p>Keine aktiven Schüler.</p></div>';
  } else {
    html += '<div>';
    for (const s of students) {
      const hwToday = allHW.filter(h => h.studentId === s.id);
      const totalCount = hwToday.length;
      const isMarked = markedIds.has(s.id);
      html += `<div class="hw-quick-row">
        <div class="hw-name">${escHtml(s.nachname)}, ${escHtml(s.vorname)}</div>
        <div class="hw-tally text-muted">${totalCount > 0 ? totalCount + '×' : ''}</div>
        <button class="hw-check-btn${isMarked ? ' marked' : ''}" onclick="toggleHW(${s.id},this)">
          ${isMarked ? '✗' : '·'}
        </button>
      </div>`;
    }
    html += '</div>';
  }
  c.innerHTML = html;

  el('hw-date-input')?.addEventListener('change', e => {
    S.hwDate = e.target.value;
    renderHausaufgabenTab(el('kd-action-btn'));
  });
  el('hw-fach-input')?.addEventListener('change', e => {
    S.hwFach = e.target.value;
    renderHausaufgabenTab(el('kd-action-btn'));
  });
}

window.toggleHW = async function(studentId, btn) {
  const allHW = await DB.getHomeworkByClass(S.classId);
  const existing = allHW.find(h => h.studentId === studentId && h.datum === S.hwDate && (h.fach === S.hwFach || !S.hwFach));
  if (existing) {
    await DB.deleteHomework(existing.id);
    btn.classList.remove('marked');
    btn.textContent = '·';
  } else {
    await DB.saveHomework({ studentId, classId: S.classId, datum: S.hwDate, fach: S.hwFach || null });
    btn.classList.add('marked');
    btn.textContent = '✗';
  }
};

// ══════════════════════════════════════════════════════════════
// BIRTHDAY SYNC
// ══════════════════════════════════════════════════════════════
async function syncBirthday(student) {
  if (!student.geburtsdatum || !student.aktiv) return;
  const title = `${student.vorname} ${student.nachname}`;
  const allEvents = await DB.getEventsByType('geburtstag');
  const existing = allEvents.find(e =>
    e.text && e.text.includes(`sid:${student.id}`)
  );
  const ev = {
    title,
    date:    student.geburtsdatum,
    type:    'geburtstag',
    color:   '#EC4899',
    classId: student.classId,
    text:    `sid:${student.id}`,
  };
  if (existing) {
    ev.id = existing.id;
  }
  await DB.saveEvent(ev);
}

// ══════════════════════════════════════════════════════════════
// ASV IMPORT
// ══════════════════════════════════════════════════════════════
window.openASVImport = function() {
  S.asvStep = 1;
  S.asvRows = [];
  S.asvHeaders = [];
  S.asvMapping = {};
  updateASVUI();
  el('import-asv-modal').classList.remove('hidden');
};

function updateASVUI() {
  qsa('.import-step').forEach((s, i) => s.classList.toggle('active', i === S.asvStep - 1));
  el('asv-back').style.display  = S.asvStep > 1 && S.asvStep < 3 ? '' : 'none';
  el('asv-next').style.display  = S.asvStep < 3 ? '' : 'none';
  el('asv-cancel').textContent  = S.asvStep === 3 ? 'Schließen' : 'Abbrechen';
  el('asv-next').textContent    = S.asvStep === 2 ? 'Importieren' : 'Weiter →';
}

function closeASVModal() { el('import-asv-modal').classList.add('hidden'); }

async function asvNext() {
  if (S.asvStep === 1) {
    if (!S.asvRows.length) { showToast('Bitte zuerst eine Datei laden', 'error'); return; }
    buildASVMapping();
    S.asvStep = 2;
    updateASVUI();
  } else if (S.asvStep === 2) {
    // Read current mapping from dropdowns
    qsa('.asv-map-select').forEach(sel => {
      S.asvMapping[sel.dataset.col] = sel.value;
    });
    await runASVImport();
    S.asvStep = 3;
    updateASVUI();
  }
}

async function parseASVFile(file) {
  const isXLSX = /\.(xlsx|xls)$/i.test(file.name);
  let data;
  if (typeof XLSX === 'undefined') {
    showToast('SheetJS nicht geladen — bitte Online sein', 'error');
    return null;
  }
  if (isXLSX) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  } else {
    const text = await file.text();
    const wb = XLSX.read(text, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  }
  return data.filter(row => row.some(c => String(c).trim() !== ''));
}

function autoDetectColumns(headers) {
  const MAP_NAMES = {
    nachname:     ['name','nachname','familienname','surname','last'],
    vorname:      ['vorname','firstname','first','rufname','givenname'],
    geburtsdatum: ['geburts','geb','birth','dob','datum'],
    geschlecht:   ['geschlecht','gender','sex'],
    klasse:       ['klasse','class','schulklasse','grade'],
  };
  const mapping = {};
  headers.forEach((h, i) => {
    const hl = String(h).toLowerCase().trim();
    for (const [field, patterns] of Object.entries(MAP_NAMES)) {
      if (patterns.some(p => hl.includes(p)) && !Object.values(mapping).includes(field)) {
        mapping[i] = field;
      }
    }
  });
  return mapping;
}

function buildASVMapping() {
  const headers = S.asvHeaders;
  const autoMap = autoDetectColumns(headers);
  S.asvMapping = autoMap;

  // Preview table (first 3 data rows)
  const previewRows = S.asvRows.slice(0, 3);
  let previewHtml = '<table><thead><tr>' +
    headers.map(h => `<th>${escHtml(String(h))}</th>`).join('') +
    '</tr></thead><tbody>' +
    previewRows.map(row =>
      '<tr>' + headers.map((_, i) => `<td>${escHtml(String(row[i] ?? ''))}</td>`).join('') + '</tr>'
    ).join('') +
    '</tbody></table>';
  el('asv-preview').innerHTML = previewHtml;

  // Column mapping dropdowns
  const fieldOpts = `
    <option value="">— ignorieren —</option>
    <option value="nachname">Nachname</option>
    <option value="vorname">Vorname</option>
    <option value="geburtsdatum">Geburtsdatum</option>
    <option value="geschlecht">Geschlecht</option>
    <option value="klasse">Klasse</option>
  `;
  el('asv-col-mapping').innerHTML = headers.map((h, i) => `
    <div class="col-map-item">
      <label>${escHtml(String(h))}</label>
      <select class="form-select asv-map-select" data-col="${i}">
        ${fieldOpts}
      </select>
    </div>
  `).join('');

  // Pre-select detected mappings
  qsa('.asv-map-select').forEach(sel => {
    const col = Number(sel.dataset.col);
    if (autoMap[col]) sel.value = autoMap[col];
  });
}

function parseGeschlecht(val) {
  const v = String(val).toLowerCase().trim();
  if (/^m|männlich|male/.test(v)) return 'm';
  if (/^w|weiblich|female|f$/.test(v)) return 'w';
  if (/^d|divers|diverse/.test(v)) return 'd';
  return 'm';
}

function parseGeburtsdatum(val) {
  const s = String(val).trim();
  // DD.MM.YYYY
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (de) return `${de[3]}-${de[2].padStart(2,'0')}-${de[1].padStart(2,'0')}`;
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  // Excel serial date
  if (/^\d+$/.test(s)) {
    try {
      const d = XLSX.SSF.parse_date_code(Number(s));
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    } catch(e) {}
  }
  return null;
}

async function runASVImport() {
  // Read final mapping from dropdowns
  const mapping = {};
  qsa('.asv-map-select').forEach(sel => {
    if (sel.value) mapping[Number(sel.dataset.col)] = sel.value;
  });

  const dupMode = el('asv-dup-mode').value; // 'skip' | 'overwrite'
  const allClasses = await DB.getClasses();
  const classMap   = Object.fromEntries(allClasses.map(c => [c.name.toLowerCase().trim(), c]));

  let imported = 0, skipped = 0, errors = 0;

  const existingStudents = await DB.getAllStudents();
  const existingSet = new Set(existingStudents.map(s =>
    (s.nachname + '|' + s.vorname).toLowerCase()
  ));
  const existingMap = {};
  existingStudents.forEach(s => {
    existingMap[(s.nachname + '|' + s.vorname).toLowerCase()] = s;
  });

  for (const row of S.asvRows) {
    try {
      const get = field => {
        const col = Object.entries(mapping).find(([, f]) => f === field)?.[0];
        return col !== undefined ? String(row[Number(col)] ?? '').trim() : '';
      };

      const nachname = get('nachname');
      const vorname  = get('vorname');
      if (!nachname || !vorname) { errors++; continue; }

      const key = (nachname + '|' + vorname).toLowerCase();
      const existing = existingMap[key];

      // Determine which class to put them in
      let targetClassId = S.classId;
      const klasseName = get('klasse');
      if (klasseName) {
        const found = classMap[klasseName.toLowerCase()];
        if (found) {
          targetClassId = found.id;
        } else if (klasseName) {
          // Create new class
          const color = '#4A6FA5';
          const newId = await DB.saveClass({ name: klasseName, slot: 0, color, subject: null });
          classMap[klasseName.toLowerCase()] = { id: newId, name: klasseName };
          targetClassId = newId;
        }
      }

      const geburtsdatum = parseGeburtsdatum(get('geburtsdatum')) || null;
      const geschlecht   = parseGeschlecht(get('geschlecht')) || 'm';

      if (existing) {
        if (dupMode === 'skip') { skipped++; continue; }
        // overwrite
        await DB.saveStudent({
          ...existing,
          nachname, vorname, geschlecht, geburtsdatum,
          classId: targetClassId,
          aktiv: existing.aktiv !== false,
        });
        if (geburtsdatum) await syncBirthday({ ...existing, vorname, nachname, geburtsdatum, classId: targetClassId });
        imported++;
      } else {
        const newId = await DB.saveStudent({
          classId: targetClassId, nachname, vorname, geschlecht, geburtsdatum, aktiv: true,
        });
        if (geburtsdatum) await syncBirthday({ id: newId, vorname, nachname, geburtsdatum, classId: targetClassId });
        existingMap[key] = { id: newId, nachname, vorname };
        imported++;
      }
    } catch (e) {
      errors++;
    }
  }

  el('asv-summary').innerHTML = `
    <div style="font-size:32px;margin-bottom:12px;">✅</div>
    <strong style="font-size:16px;">Import abgeschlossen</strong><br><br>
    ✓ <strong>${imported}</strong> Schüler importiert<br>
    ⏭ <strong>${skipped}</strong> übersprungen (Duplikat)<br>
    ${errors ? `⚠ <strong>${errors}</strong> Fehler (fehlende Pflichtfelder)` : ''}
  `;
  // Refresh student list
  App.classes = await DB.getClasses();
  await renderSchuelerTab(el('kd-action-btn'));
}

// ══════════════════════════════════════════════════════════════
// EVENT WIRING — runs after DOM is ready
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Student modal
  el('student-modal-close').addEventListener('click', closeStudentModal);
  el('s-cancel').addEventListener('click', closeStudentModal);
  el('s-save').addEventListener('click', saveStudent);
  el('s-deactivate').addEventListener('click', deactivateStudent);
  el('student-modal').addEventListener('click', e => { if (e.target === el('student-modal')) closeStudentModal(); });

  // Grade modal
  el('grade-modal-close').addEventListener('click', closeGradeModal);
  el('g-cancel').addEventListener('click', closeGradeModal);
  el('g-save').addEventListener('click', saveGrade);
  el('g-delete').addEventListener('click', deleteGradeFromModal);
  el('grade-modal').addEventListener('click', e => { if (e.target === el('grade-modal')) closeGradeModal(); });

  // Remark modal
  el('remark-modal-close').addEventListener('click', () => el('remark-modal').classList.add('hidden'));
  el('r-cancel').addEventListener('click',            () => el('remark-modal').classList.add('hidden'));
  el('r-save').addEventListener('click', saveRemark);
  el('remark-modal').addEventListener('click', e => { if (e.target === el('remark-modal')) el('remark-modal').classList.add('hidden'); });
  el('r-cat-btns').addEventListener('click', e => {
    const btn = e.target.closest('.remark-cat-btn');
    if (!btn) return;
    S.remarkCat = btn.dataset.cat;
    updateRemarkCatBtns();
  });

  // ASV Import modal
  el('asv-modal-close').addEventListener('click', closeASVModal);
  el('asv-cancel').addEventListener('click', closeASVModal);
  el('asv-next').addEventListener('click', asvNext);
  el('asv-back').addEventListener('click', () => { S.asvStep = 1; updateASVUI(); });
  el('import-asv-modal').addEventListener('click', e => { if (e.target === el('import-asv-modal')) closeASVModal(); });

  // File drop zone
  const dropZone = el('asv-drop-zone');
  const fileInput = el('asv-file-input');
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    fileInput.value = '';
    const data = await parseASVFile(file);
    if (!data || data.length < 2) { showToast('Datei konnte nicht gelesen werden', 'error'); return; }
    S.asvHeaders = data[0].map(h => String(h));
    S.asvRows    = data.slice(1);
    dropZone.innerHTML = `<div class="import-drop-icon">✅</div>
      <p style="font-weight:600;">${escHtml(file.name)}</p>
      <p class="text-muted text-sm">${S.asvRows.length} Zeilen erkannt · Klicken um andere Datei zu wählen</p>`;
  });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', async e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const data = await parseASVFile(file);
    if (!data || data.length < 2) { showToast('Datei konnte nicht gelesen werden', 'error'); return; }
    S.asvHeaders = data[0].map(h => String(h));
    S.asvRows    = data.slice(1);
    dropZone.innerHTML = `<div class="import-drop-icon">✅</div>
      <p style="font-weight:600;">${escHtml(file.name)}</p>
      <p class="text-muted text-sm">${S.asvRows.length} Zeilen erkannt</p>`;
  });

  // Wire kd-action-btn for klasse-detail (handled per tab, but wire the button reference)
  // Tab clicks are wired in renderKlasseDetail()
});
