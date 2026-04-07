// db.js — IndexedDB wrapper for LehrerPlaner (uses idb UMD from CDN)
'use strict';

const DB_NAME = 'lehrerplaner-db';
const DB_VERSION = 1;
let _db = null;

async function getDB() {
  if (_db) return _db;
  _db = await idb.openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('events')) {
        const ev = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
        ev.createIndex('date', 'date');
        ev.createIndex('classId', 'classId');
        ev.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains('classes')) {
        db.createObjectStore('classes', { keyPath: 'id', autoIncrement: true });
      }
      // inkLayers keyed by pageKey string
      if (!db.objectStoreNames.contains('inkLayers')) {
        db.createObjectStore('inkLayers', { keyPath: 'pageKey' });
      }
      // settings: key/value pairs
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      // notes: 10 fixed pages, id = page number 1–10
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
      // Stundenplan: id = slot 1–4
      if (!db.objectStoreNames.contains('stundenplaene')) {
        db.createObjectStore('stundenplaene', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('vertretung')) {
        const vt = db.createObjectStore('vertretung', { keyPath: 'id', autoIncrement: true });
        vt.createIndex('date', 'date');
      }
    },
  });
  return _db;
}

const DB = {
  // ── EVENTS ──────────────────────────────────────────────
  async getEvent(id) {
    return (await getDB()).get('events', id);
  },
  async getEventsByDate(date) {
    const all = await (await getDB()).getAll('events');
    return all.filter(e => e.date === date);
  },
  async getEventsByRange(startDate, endDate) {
    const all = await (await getDB()).getAll('events');
    return all.filter(e => e.date && e.date >= startDate && e.date <= endDate);
  },
  async getEventsByType(type) {
    const all = await (await getDB()).getAll('events');
    return all.filter(e => e.type === type);
  },
  async getAllEvents() {
    return (await getDB()).getAll('events');
  },
  async saveEvent(event) {
    const db = await getDB();
    if (event.id) { await db.put('events', event); return event.id; }
    return db.add('events', event);
  },
  async deleteEvent(id) {
    return (await getDB()).delete('events', id);
  },

  // ── CLASSES ─────────────────────────────────────────────
  async getClasses() {
    return (await getDB()).getAll('classes');
  },
  async getClass(id) {
    return (await getDB()).get('classes', id);
  },
  async saveClass(cls) {
    const db = await getDB();
    if (cls.id) { await db.put('classes', cls); return cls.id; }
    return db.add('classes', cls);
  },
  async deleteClass(id) {
    return (await getDB()).delete('classes', id);
  },

  // ── INK LAYERS ──────────────────────────────────────────
  async getInkLayer(pageKey) {
    return (await getDB()).get('inkLayers', pageKey);
  },
  async saveInkLayer(pageKey, strokes) {
    return (await getDB()).put('inkLayers', { pageKey, strokes });
  },
  async deleteInkLayer(pageKey) {
    return (await getDB()).delete('inkLayers', pageKey);
  },

  // ── SETTINGS ────────────────────────────────────────────
  async getSetting(key) {
    const entry = await (await getDB()).get('settings', key);
    return entry ? entry.value : null;
  },
  async setSetting(key, value) {
    return (await getDB()).put('settings', { key, value });
  },
  async getAllSettings() {
    const all = await (await getDB()).getAll('settings');
    return Object.fromEntries(all.map(s => [s.key, s.value]));
  },

  // ── NOTES ───────────────────────────────────────────────
  async getNote(id) {
    return (await getDB()).get('notes', id);
  },
  async saveNote(note) {
    return (await getDB()).put('notes', note);
  },
  async getAllNotes() {
    return (await getDB()).getAll('notes');
  },

  // ── TODOS ───────────────────────────────────────────────
  async getTodos() {
    return (await getDB()).getAll('todos');
  },
  async saveTodo(todo) {
    const db = await getDB();
    if (todo.id) { await db.put('todos', todo); return todo.id; }
    return db.add('todos', todo);
  },
  async deleteTodo(id) {
    return (await getDB()).delete('todos', id);
  },

  // ── CONTACTS ────────────────────────────────────────────
  async getContacts() {
    return (await getDB()).getAll('contacts');
  },
  async saveContact(c) {
    const db = await getDB();
    if (c.id) { await db.put('contacts', c); return c.id; }
    return db.add('contacts', c);
  },
  async deleteContact(id) {
    return (await getDB()).delete('contacts', id);
  },

  // ── LINKS ───────────────────────────────────────────────
  async getLinks() {
    return (await getDB()).getAll('links');
  },
  async saveLink(link) {
    const db = await getDB();
    if (link.id) { await db.put('links', link); return link.id; }
    return db.add('links', link);
  },
  async deleteLink(id) {
    return (await getDB()).delete('links', id);
  },

  // ── STUNDENPLAENE ───────────────────────────────────────
  async getStundenplan(slot) {
    return (await getDB()).get('stundenplaene', slot);
  },
  async saveStundenplan(plan) {
    return (await getDB()).put('stundenplaene', plan);
  },
  async getAllStundenplaene() {
    return (await getDB()).getAll('stundenplaene');
  },

  // ── VERTRETUNG ──────────────────────────────────────────
  async getVertretung() {
    return (await getDB()).getAll('vertretung');
  },
  async saveVertretung(v) {
    const db = await getDB();
    if (v.id) { await db.put('vertretung', v); return v.id; }
    return db.add('vertretung', v);
  },
  async deleteVertretung(id) {
    return (await getDB()).delete('vertretung', id);
  },

  // ── EXPORT / IMPORT ─────────────────────────────────────
  async exportAll() {
    const db = await getDB();
    return {
      _version: 1,
      _exported: new Date().toISOString(),
      events:       await db.getAll('events'),
      classes:      await db.getAll('classes'),
      settings:     await db.getAll('settings'),
      notes:        await db.getAll('notes'),
      todos:        await db.getAll('todos'),
      contacts:     await db.getAll('contacts'),
      links:        await db.getAll('links'),
      stundenplaene:await db.getAll('stundenplaene'),
      vertretung:   await db.getAll('vertretung'),
    };
  },
  async importAll(data) {
    const db = await getDB();
    const stores = ['events','classes','settings','notes','todos','contacts','links','stundenplaene','vertretung'];
    for (const store of stores) {
      if (!Array.isArray(data[store])) continue;
      const tx = db.transaction(store, 'readwrite');
      await tx.store.clear();
      for (const item of data[store]) {
        await tx.store.put(item);
      }
      await tx.done;
    }
  },
};
