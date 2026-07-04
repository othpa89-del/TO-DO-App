// ---------------------------------------------------------------------------
//  Datenzugriff: Aufgaben & Meetings als EINZELNE Zeilen im Cloud-Speicher.
//
//  Früher lag die komplette Liste als ein einziger JSON-Block unter
//  "tasks-personal" bzw. "meetings". Jede kleine Änderung (z. B. ein Häkchen)
//  musste dadurch die GESAMTE Liste übertragen – und zwei Geräte konnten sich
//  gegenseitig überschreiben. Jetzt hat jeder Eintrag eine eigene Zeile
//  ("task:<id>" / "meeting:<id>"); gespeichert wird nur, was sich wirklich
//  geändert hat. Konflikte entstehen nur noch, wenn zwei Geräte DENSELBEN
//  Eintrag gleichzeitig ändern.
//
//  Migration: Beim ersten Laden wird das alte Format automatisch in Zeilen
//  überführt. Die ALTEN Schlüssel bleiben unangetastet in der Datenbank
//  liegen (Rückfallebene) – gelöscht wird nichts.
// ---------------------------------------------------------------------------

const TASK_PREFIX = "task:";
const TASK_ORDER = "task-order";     // manuelle Reihenfolge + Format-Marker
const MEET_PREFIX = "meeting:";
const MEET_INDEX = "meeting-index";  // Manifest + Format-Marker
const LEGACY_TASKS = "tasks-personal";
const LEGACY_MEETINGS = "meetings";

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// --- Pure Helfer (separat testbar) --------------------------------------

// Unterschied zwischen zuletzt gespeichertem Stand (id -> JSON-String) und
// neuem Array: nur geänderte Zeilen schreiben, entfernte löschen.
export function diffRows(prevMap, arr, prefix) {
  const writes = []; const deletes = []; const nextMap = {};
  for (const item of arr) { if (item && item.id) nextMap[item.id] = JSON.stringify(item); }
  for (const [id, json] of Object.entries(nextMap)) {
    if (prevMap[id] !== json) writes.push({ key: prefix + id, value: json });
  }
  for (const id of Object.keys(prevMap)) {
    if (!(id in nextMap)) deletes.push(prefix + id);
  }
  return { writes, deletes, nextMap };
}

// Zeilen ({key,value}) anhand der Reihenfolge-Liste zu einem Array zusammensetzen.
// Zeilen, die (noch) nicht in der Reihenfolge stehen (z. B. gerade auf einem
// anderen Gerät angelegt), kommen nach vorn – wie neu angelegte Einträge.
export function assembleRows(items, order) {
  const byId = {};
  for (const it of items || []) {
    try { const o = JSON.parse(it.value); if (o && o.id) byId[o.id] = o; } catch {}
  }
  const out = []; const seen = new Set();
  for (const id of order || []) {
    if (byId[id] && !seen.has(id)) { out.push(byId[id]); seen.add(id); }
  }
  const rest = Object.values(byId).filter((o) => !seen.has(o.id))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return [...rest, ...out];
}

// --- Aufgaben -------------------------------------------------------------

let taskSnap = null;      // id -> JSON-String des zuletzt geladenen/gespeicherten Standes
let taskOrderSnap = "";

export async function loadTasks() {
  // Neues Format? (Reihenfolge-Schlüssel vorhanden = bereits migriert)
  try {
    const ord = await window.storage.get(TASK_ORDER);
    if (ord && ord.value != null) {
      const order = JSON.parse(ord.value) || [];
      const { items } = await window.storage.getPrefix(TASK_PREFIX);
      const arr = assembleRows(items, order);
      taskSnap = {}; arr.forEach((t) => { taskSnap[t.id] = JSON.stringify(t); });
      taskOrderSnap = JSON.stringify(arr.map((t) => t.id));
      return arr;
    }
  } catch {}
  // Altes Format lesen und – falls vorhanden – einmalig in Zeilen überführen
  let arr = []; let hadLegacy = false;
  try {
    const r = await window.storage.get(LEGACY_TASKS);
    if (r && r.value) { arr = JSON.parse(r.value) || []; hadLegacy = true; }
  } catch {}
  arr = (Array.isArray(arr) ? arr : []).map((t) => (t && t.id ? t : { ...t, id: newId() }));
  taskSnap = {}; arr.forEach((t) => { taskSnap[t.id] = JSON.stringify(t); });
  taskOrderSnap = JSON.stringify(arr.map((t) => t.id));
  if (hadLegacy) {
    try {
      for (const t of arr) await window.storage.set(TASK_PREFIX + t.id, JSON.stringify(t));
      await window.storage.set(TASK_ORDER, taskOrderSnap);
      // Alter Schlüssel bleibt bewusst liegen (Rückfallebene, wird nicht gelöscht)
    } catch {}
  }
  return arr;
}

export async function saveTasks(arr) {
  if (!taskSnap) { taskSnap = {}; taskOrderSnap = ""; }
  const { writes, deletes, nextMap } = diffRows(taskSnap, arr, TASK_PREFIX);
  const order = JSON.stringify(arr.map((t) => t && t.id).filter(Boolean));
  for (const w of writes) await window.storage.set(w.key, w.value);
  for (const k of deletes) await window.storage.delete(k);
  if (order !== taskOrderSnap) await window.storage.set(TASK_ORDER, order);
  taskSnap = nextMap; taskOrderSnap = order;
}

// --- Meetings ---------------------------------------------------------------

let meetSnap = null;
let meetIndexSnap = "";

export async function loadMeetingsData() {
  try {
    const idx = await window.storage.get(MEET_INDEX);
    if (idx && idx.value != null) {
      const order = JSON.parse(idx.value) || [];
      const { items } = await window.storage.getPrefix(MEET_PREFIX);
      const arr = assembleRows(items, order);
      meetSnap = {}; arr.forEach((m) => { meetSnap[m.id] = JSON.stringify(m); });
      meetIndexSnap = JSON.stringify(arr.map((m) => m.id));
      return arr;
    }
  } catch {}
  let arr = []; let hadLegacy = false;
  try {
    const r = await window.storage.get(LEGACY_MEETINGS);
    if (r && r.value) { arr = JSON.parse(r.value) || []; hadLegacy = true; }
  } catch {}
  arr = (Array.isArray(arr) ? arr : []).map((m) => (m && m.id ? m : { ...m, id: newId() }));
  meetSnap = {}; arr.forEach((m) => { meetSnap[m.id] = JSON.stringify(m); });
  meetIndexSnap = JSON.stringify(arr.map((m) => m.id));
  if (hadLegacy) {
    try {
      for (const m of arr) await window.storage.set(MEET_PREFIX + m.id, JSON.stringify(m));
      await window.storage.set(MEET_INDEX, meetIndexSnap);
    } catch {}
  }
  return arr;
}

export async function saveMeetingsData(arr) {
  if (!meetSnap) { meetSnap = {}; meetIndexSnap = ""; }
  const { writes, deletes, nextMap } = diffRows(meetSnap, arr, MEET_PREFIX);
  const index = JSON.stringify(arr.map((m) => m && m.id).filter(Boolean));
  for (const w of writes) await window.storage.set(w.key, w.value);
  for (const k of deletes) await window.storage.delete(k);
  if (index !== meetIndexSnap) await window.storage.set(MEET_INDEX, index);
  meetSnap = nextMap; meetIndexSnap = index;
}
