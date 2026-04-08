// db.js — IndexedDB wrapper for LehrerPlaner (uses idb UMD from CDN)
'use strict';

const DB_NAME = 'lehrerplaner-db';
const DB_VERSION = 3;
let _db = null;

async function getDB() {
  if (_db) return _db;
  _db = await idb.openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // ── Version 1 stores ─────────────────────────────────
      if (!db.objectStoreNames.contains('events')) {
        const ev = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
        ev.createIndex('date', 'date');
        ev.createIndex('classId', 'classId');
        ev.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains('classes')) {
        db.createObjectStore('classes', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('inkLayers')) {
        db.createObjectStore('inkLayers', { keyPath: 'pageKey' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('todos')) {
        db.createObjectStore('todos', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('contacts')) {
        db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('links')) {
        db.createObjectStore('links', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('stundenplaene')) {
        db.createObjectStore('stundenplaene', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('vertretung')) {
        const vt = db.createObjectStore('vertretung', { keyPath: 'id', autoIncrement: true });
        vt.createIndex('date', 'date');
      }
      // ── Version 3 stores — Fächer ────────────────────────
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('subjects')) {
          db.createObjectStore('subjects', { keyPath: 'id', autoIncrement: true });
        }
      }
      // ── Version 2 stores — Schülerverwaltung ─────────────
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('students')) {
          const st = db.createObjectStore('students', { keyPath: 'id', autoIncrement: true });
          st.createIndex('classId', 'classId');
        }
        if (!db.objectStoreNames.contains('grades')) {
          const gr = db.createObjectStore('grades', { keyPath: 'id', autoIncrement: true });
          gr.createIndex('studentId', 'studentId');
          gr.createIndex('classId', 'classId');
        }
        if (!db.objectStoreNames.contains('attendance')) {
          const at = db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
          at.createIndex('studentId', 'studentId');
          at.createIndex('classId', 'classId');
          at.createIndex('datum', 'datum');
        }
        if (!db.objectStoreNames.contains('remarks')) {
          const re = db.createObjectStore('remarks', { keyPath: 'id', autoIncrement: true });
          re.createIndex('studentId', 'studentId');
          re.createIndex('classId', 'classId');
        }
        if (!db.objectStoreNames.contains('seatingPlan')) {
          db.createObjectStore('seatingPlan', { keyPath: 'classId' });
        }
        if (!db.objectStoreNames.contains('homeworkMissed')) {
          const hw = db.createObjectStore('homeworkMissed', { keyPath: 'id', autoIncrement: true });
          hw.createIndex('studentId', 'studentId');
          hw.createIndex('classId', 'classId');
        }
      }
    },
  });
  return _db;
}

const DB = {
  // ── EVENTS ──────────────────────────────────────────────
  async getEvent(id) { return (await getDB()).get('events', id); },
  async getEventsByDate(date) {
    return (await (await getDB()).getAll('events')).filter(e => e.date === date);
  },
  async getEventsByRange(startDate, endDate) {
    return (await (await getDB()).getAll('events')).filter(e => e.date && e.date >= startDate && e.date <= endDate);
  },
  async getEventsByType(type) {
    return (await (await getDB()).getAll('events')).filter(e => e.type === type);
  },
  async getAllEvents() { return (await getDB()).getAll('events'); },
  async saveEvent(event) {
    const db = await getDB();
    if (event.id) { await db.put('events', event); return event.id; }
    return db.add('events', event);
  },
  async deleteEvent(id) { return (await getDB()).delete('events', id); },

  // ── CLASSES ─────────────────────────────────────────────
  async getClasses() { return (await getDB()).getAll('classes'); },
  async getClass(id) { return (await getDB()).get('classes', id); },
  async saveClass(cls) {
    const db = await getDB();
    if (cls.id) { await db.put('classes', cls); return cls.id; }
    return db.add('classes', cls);
  },
  async deleteClass(id) { return (await getDB()).delete('classes', id); },

  // ── INK LAYERS ──────────────────────────────────────────
  async getInkLayer(pageKey) { return (await getDB()).get('inkLayers', pageKey); },
  async saveInkLayer(pageKey, strokes) { return (await getDB()).put('inkLayers', { pageKey, strokes }); },
  async deleteInkLayer(pageKey) { return (await getDB()).delete('inkLayers', pageKey); },

  // ── SETTINGS ────────────────────────────────────────────
  async getSetting(key) {
    const entry = await (await getDB()).get('settings', key);
    return entry ? entry.value : null;
  },
  async setSetting(key, value) { return (await getDB()).put('settings', { key, value }); },
  async getAllSettings() {
    const all = await (await getDB()).getAll('settings');
    return Object.fromEntries(all.map(s => [s.key, s.value]));
  },

  // ── NOTES ───────────────────────────────────────────────
  async getNote(id) { return (await getDB()).get('notes', id); },
  async saveNote(note) { return (await getDB()).put('notes', note); },
  async getAllNotes() { return (await getDB()).getAll('notes'); },

  // ── TODOS ───────────────────────────────────────────────
  async getTodos() { return (await getDB()).getAll('todos'); },
  async saveTodo(todo) {
    const db = await getDB();
    if (todo.id) { await db.put('todos', todo); return todo.id; }
    return db.add('todos', todo);
  },
  async deleteTodo(id) { return (await getDB()).delete('todos', id); },

  // ── CONTACTS ────────────────────────────────────────────
  async getContacts() { return (await getDB()).getAll('contacts'); },
  async saveContact(c) {
    const db = await getDB();
    if (c.id) { await db.put('contacts', c); return c.id; }
    return db.add('contacts', c);
  },
  async deleteContact(id) { return (await getDB()).delete('contacts', id); },

  // ── LINKS ───────────────────────────────────────────────
  async getLinks() { return (await getDB()).getAll('links'); },
  async saveLink(link) {
    const db = await getDB();
    if (link.id) { await db.put('links', link); return link.id; }
    return db.add('links', link);
  },
  async deleteLink(id) { return (await getDB()).delete('links', id); },

  // ── STUNDENPLAENE ───────────────────────────────────────
  async getStundenplan(slot) { return (await getDB()).get('stundenplaene', slot); },
  async saveStundenplan(plan) { return (await getDB()).put('stundenplaene', plan); },
  async getAllStundenplaene() { return (await getDB()).getAll('stundenplaene'); },

  // ── VERTRETUNG ──────────────────────────────────────────
  async getVertretung() { return (await getDB()).getAll('vertretung'); },
  async saveVertretung(v) {
    const db = await getDB();
    if (v.id) { await db.put('vertretung', v); return v.id; }
    return db.add('vertretung', v);
  },
  async deleteVertretung(id) { return (await getDB()).delete('vertretung', id); },

  // ── SUBJECTS ────────────────────────────────────────────
  async getSubjects() {
    const all = await (await getDB()).getAll('subjects');
    return all.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, 'de'));
  },
  async saveSubject(s) {
    const db = await getDB();
    if (s.id) { await db.put('subjects', s); return s.id; }
    return db.add('subjects', s);
  },
  async deleteSubject(id) { return (await getDB()).delete('subjects', id); },

  // ── STUDENTS ────────────────────────────────────────────
  async getStudentsByClass(classId) {
    const all = await (await getDB()).getAll('students');
    return all.filter(s => s.classId === classId);
  },
  async getStudent(id) { return (await getDB()).get('students', id); },
  async saveStudent(s) {
    const db = await getDB();
    if (s.id) { await db.put('students', s); return s.id; }
    return db.add('students', s);
  },
  async getAllStudents() { return (await getDB()).getAll('students'); },
  async deleteStudent(id) { return (await getDB()).delete('students', id); },

  // ── GRADES ──────────────────────────────────────────────
  async getGradesByStudent(studentId) {
    return (await (await getDB()).getAll('grades')).filter(g => g.studentId === studentId);
  },
  async getGradesByClass(classId) {
    return (await (await getDB()).getAll('grades')).filter(g => g.classId === classId);
  },
  async getGrade(id) { return (await getDB()).get('grades', id); },
  async saveGrade(g) {
    const db = await getDB();
    if (g.id) { await db.put('grades', g); return g.id; }
    return db.add('grades', g);
  },
  async deleteGrade(id) { return (await getDB()).delete('grades', id); },

  // ── ATTENDANCE ──────────────────────────────────────────
  async getAttendanceByClassAndDate(classId, datum) {
    return (await (await getDB()).getAll('attendance')).filter(a => a.classId === classId && a.datum === datum);
  },
  async getAttendanceByStudent(studentId) {
    return (await (await getDB()).getAll('attendance')).filter(a => a.studentId === studentId);
  },
  async getAttendanceByClassAndMonth(classId, yearMonth) {
    // yearMonth = 'YYYY-MM'
    return (await (await getDB()).getAll('attendance')).filter(a => a.classId === classId && (a.datum||'').startsWith(yearMonth));
  },
  async saveAttendance(a) {
    const db = await getDB();
    if (a.id) { await db.put('attendance', a); return a.id; }
    return db.add('attendance', a);
  },
  async deleteAttendanceById(id) { return (await getDB()).delete('attendance', id); },
  async deleteAttendancesForClassAndDate(classId, datum) {
    const all = await (await getDB()).getAll('attendance');
    const db = await getDB();
    for (const a of all.filter(a => a.classId === classId && a.datum === datum)) {
      await db.delete('attendance', a.id);
    }
  },

  // ── REMARKS ─────────────────────────────────────────────
  async getRemarksByStudent(studentId) {
    return (await (await getDB()).getAll('remarks')).filter(r => r.studentId === studentId);
  },
  async getRemarksByClass(classId) {
    return (await (await getDB()).getAll('remarks')).filter(r => r.classId === classId);
  },
  async saveRemark(r) {
    const db = await getDB();
    if (r.id) { await db.put('remarks', r); return r.id; }
    return db.add('remarks', r);
  },
  async deleteRemark(id) { return (await getDB()).delete('remarks', id); },

  // ── SEATING PLAN ────────────────────────────────────────
  async getSeatingPlan(classId) { return (await getDB()).get('seatingPlan', classId); },
  async saveSeatingPlan(plan) { return (await getDB()).put('seatingPlan', plan); },

  // ── HOMEWORK MISSED ─────────────────────────────────────
  async getHomeworkByClass(classId) {
    return (await (await getDB()).getAll('homeworkMissed')).filter(h => h.classId === classId);
  },
  async saveHomework(h) {
    const db = await getDB();
    if (h.id) { await db.put('homeworkMissed', h); return h.id; }
    return db.add('homeworkMissed', h);
  },
  async deleteHomework(id) { return (await getDB()).delete('homeworkMissed', id); },

  // ── EXPORT / IMPORT ─────────────────────────────────────
  async exportAll() {
    const db = await getDB();
    return {
      _version: 2,
      _exported: new Date().toISOString(),
      events:        await db.getAll('events'),
      classes:       await db.getAll('classes'),
      subjects:      await db.getAll('subjects'),
      settings:      await db.getAll('settings'),
      notes:         await db.getAll('notes'),
      todos:         await db.getAll('todos'),
      contacts:      await db.getAll('contacts'),
      links:         await db.getAll('links'),
      stundenplaene: await db.getAll('stundenplaene'),
      vertretung:    await db.getAll('vertretung'),
      students:      await db.getAll('students'),
      grades:        await db.getAll('grades'),
      attendance:    await db.getAll('attendance'),
      remarks:       await db.getAll('remarks'),
      seatingPlan:   await db.getAll('seatingPlan'),
      homeworkMissed:await db.getAll('homeworkMissed'),
    };
  },
  async importAll(data) {
    const db = await getDB();
    const stores = [
      'events','classes','subjects','settings','notes','todos','contacts','links',
      'stundenplaene','vertretung',
      'students','grades','attendance','remarks','seatingPlan','homeworkMissed',
    ];
    for (const store of stores) {
      if (!Array.isArray(data[store])) continue;
      const tx = db.transaction(store, 'readwrite');
      await tx.store.clear();
      for (const item of data[store]) await tx.store.put(item);
      await tx.done;
    }
  },
};
