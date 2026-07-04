import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
  User, Building2, Printer, FileSpreadsheet, Check, Pencil, X, Square, CheckSquare,
  Bell, Settings, Search, ExternalLink, Repeat, Download, Upload, Database, Plus, Mail, Phone,
  MessageSquare, ChevronUp, ChevronDown, Plane, FileText, Copy, GripVertical, Paperclip, Image as ImageIcon, ListChecks,
  List, Kanban,
} from "lucide-react";
import Sortable from "sortablejs";
import Meetings, { loadMeetings, meetingToMarkdown, meetingToText, exportWord, printMeeting, copyMeetingToClipboard, emailMeeting, enrichMeeting } from "./Meetings.jsx";
import { L, useLang, getLang, setLang } from "./i18n.js";

// --- Markenfarben (Farbchapter) ---
const C = {
  burgundy: "#AF1E65", burgundyDark: "#871C54", burgundyLight: "#D41370", burgundyDarker: "#701745",
  sky: "#00A6CF", skyLight: "#6BCCE0", skyPale: "#E6F5F9", ink: "#212529", body: "#333333",
  grey: "#575757", cool: "#787878", line: "#D7D7D7", fill: "#F1F3F5", panel: "#F8F9FA", white: "#FFFFFF",
};
const DEFAULT_CATEGORIES = [
  "OM-D", "OM-D Annex", "Simulator General", "Simulator Training", "Simulator OCC",
  "Simulator Special Airport Training", "Simulator TRI/TRE", "LAT / GAT",
  "Ground Training General", "Ground Training OCC", "WBT", "Safety", "FDM", "HR",
];
const CAT_COLORS = [C.burgundy, C.burgundyDark, C.sky, C.burgundyDarker, C.cool];
function catColor() { return "#787878"; }
const OLD_MAP = { training: "Trainingsinhalte", standard: "Standardisierung", quality: "Qualität", safety: "Safety", other: "" };
const catDisplay = (c) => (c ? (OLD_MAP[c] !== undefined ? OLD_MAP[c] : c) : "");

const PRIORITIES = {
  "": { label: "", color: C.cool, rank: 3 },
  hoch: { get label() { return L("Hoch", "High"); }, color: C.burgundy, rank: 0 },
  mittel: { get label() { return L("Mittel", "Medium"); }, color: C.sky, rank: 1 },
  niedrig: { get label() { return L("Niedrig", "Low"); }, color: C.cool, rank: 2 },
};
const STATUS = {
  "": { label: "", color: C.cool },
  offen: { get label() { return L("Offen", "Open"); }, color: C.cool },
  inArbeit: { get label() { return L("In Arbeit", "In progress"); }, color: C.sky },
  onHold: { get label() { return L("On Hold", "On hold"); }, color: C.burgundyLight },
  erledigt: { get label() { return L("Erledigt", "Done"); }, color: C.burgundyDark },
};
const RECUR = {
  get none() { return L("Keine", "None"); },
  get weekly() { return L("Wöchentlich", "Weekly"); },
  get monthly() { return L("Monatlich", "Monthly"); },
  get quarterly() { return L("Quartalsweise", "Quarterly"); },
  get yearly() { return L("Jährlich", "Yearly"); },
};
const ESC = { "": "", get ja() { return L("Ja", "Yes"); }, get nein() { return L("Nein", "No"); } };
const LEADS = [
  { v: 0, get label() { return L("Am Fälligkeitstag", "On the due date"); } },
  { v: 1, get label() { return L("1 Tag vorher", "1 day before"); } },
  { v: 3, get label() { return L("3 Tage vorher", "3 days before"); } },
  { v: 7, get label() { return L("1 Woche vorher", "1 week before"); } },
  { v: 14, get label() { return L("2 Wochen vorher", "2 weeks before"); } },
];
const SCOPES = {
  personal: { key: "tasks-personal", shared: false, get label() { return L("Aufgaben", "Tasks"); } },
};
const COMPANY_SUGGESTIONS = ["Eurowings", "Aviation Academy Austria", "Lufthansa Group", "Austro Control"];
const DEFAULT_COMPANIES = [...COMPANY_SUGGESTIONS, "Privat"];
// Kontext-/Firmenfarben (für die optische Unterscheidung, v. a. in „Persönlich")
const COMPANY_COLORS = {
  "eurowings": "#AF1E65",                 // Burgundy
  "aviation academy austria": "#1A4F8B",  // dunkleres Blau
  "privat": "#5FB87A",                    // Hellgrün
};
const companyColor = (name) => COMPANY_COLORS[(name || "").trim().toLowerCase()] || "#9AA0A6";
const CONTEXT_COMPANIES = ["Eurowings", "Aviation Academy Austria", "Privat"];

// --- Helfer ---
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const keyOf = (t) => t._scope + ":" + t.id;
const leadLabel = (v) => (LEADS.find((l) => l.v === Number(v)) || {}).label || "";
const sortCats = (arr) => [...arr].sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
const isDone = (t) => (t.status ? t.status === "erledigt" : !!t.done);
const normalizeUrl = (u) => (!u ? "#" : /^https?:\/\//i.test(u) ? u : "https://" + u);
function normalizeTask(t) {
  let status = t.status || (t.done ? "erledigt" : "offen");
  if (status === "wartet") status = "onHold";
  return {
    ...t, status, recurrence: t.recurrence || "none",
    link: t.link || "", notes: t.notes || "", contact: t.contact || "", company: t.company || "", category: t.category || "",
    log: Array.isArray(t.log) ? t.log : [],
    checklist: Array.isArray(t.checklist) ? t.checklist : [],
    attachments: Array.isArray(t.attachments) ? t.attachments : [],
    images: Array.isArray(t.images) ? t.images : [],
    escalation: t.escalation || "", updatedAt: t.updatedAt || "", start: t.start || "",
  };
}
function fileToDataUrl(file) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); }); }
function compressImage(file, maxDim = 1280, quality = 0.72) {
  return new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) { if (width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; } }
        else { if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; } }
        const cv = document.createElement("canvas"); cv.width = width; cv.height = height;
        cv.getContext("2d").drawImage(img, 0, 0, width, height);
        res(cv.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => res(null);
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function dayDiff(due) {
  if (!due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(due + "T00:00:00") - today) / 86400000);
}
function urgency(t) {
  if (isDone(t) || !t.due) return null;
  const d = dayDiff(t.due);
  if (d === null) return null;
  if (d < 0) return "overdue"; if (d === 0) return "today";
  if (d <= (t.remindLead ?? 3)) return "soon"; return null;
}
function fmtDate(due) {
  if (!due) return "";
  return new Date(due + "T00:00:00").toLocaleDateString(getLang() === "en" ? "en-GB" : "de-DE", { weekday: "short", day: "2-digit", month: "short" });
}
function relLabel(due) {
  const d = dayDiff(due);
  if (d === null) return "";
  if (d < -1) return L(`${Math.abs(d)} Tage überfällig`, `${Math.abs(d)} days overdue`);
  if (d === -1) return L("Gestern fällig", "Due yesterday"); if (d === 0) return L("Heute fällig", "Due today"); if (d === 1) return L("Morgen fällig", "Due tomorrow");
  return L(`in ${d} Tagen`, `in ${d} days`);
}
function shiftDate(iso, rec) {
  const d = new Date(iso + "T00:00:00");
  if (rec === "weekly") d.setDate(d.getDate() + 7);
  else if (rec === "monthly") d.setMonth(d.getMonth() + 1);
  else if (rec === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (rec === "yearly") d.setFullYear(d.getFullYear() + 1);
  else return null;
  return d.toISOString().slice(0, 10);
}
const dt = (iso) => (iso ? new Date(iso).toLocaleDateString(getLang() === "en" ? "en-GB" : "de-DE") : "");
const fmtDay = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(getLang() === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
function downloadBlob(data, filename, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function loadScope(scope) {
  const { key, shared } = SCOPES[scope];
  try { const r = await window.storage.get(key, shared); return r && r.value ? JSON.parse(r.value) : []; } catch { return []; }
}
async function saveScope(scope, arr) {
  const { key, shared } = SCOPES[scope];
  await window.storage.set(key, JSON.stringify(arr), shared);
}

// Ansichts-Einstellungen (Filter/Sortierung/Layout) pro Gerät merken.
const PREFS_KEY = "ctc_prefs_v1";
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } };

// ===========================================================================
export default function App() {
  const lang = useLang(); // re-render bei Sprachwechsel
  const [swUpdate, setSwUpdate] = useState(false);
  const [gOpen, setGOpen] = useState(false); // globale Suche
  const [gSearch, setGSearch] = useState("");
  const [openMeetingReq, setOpenMeetingReq] = useState(null); // Meeting aus Suche öffnen
  const [tasks, setTasks] = useState({ personal: [] });
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [companies, setCompanies] = useState(DEFAULT_COMPANIES);
  const [persons, setPersons] = useState([]);
  const [meetings, setMeetings] = useState([]); // nur für den Export-Tab (read-only)
  const [loaded, setLoaded] = useState(false);
  const [remoteTick, setRemoteTick] = useState(0);
  const [sync, setSync] = useState({ state: "synced", pending: 0, online: true });
  const [view, setView] = useState("dash");
  const [returnView, setReturnView] = useState("all"); // wohin nach dem Bearbeiten zurück
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState(() => loadPrefs().filterStatus || "open");
  const [filterCompany, setFilterCompany] = useState("all");
  const [filterContact, setFilterContact] = useState("all");
  const [sortBy, setSortBy] = useState(() => loadPrefs().sortBy || "due");
  const [groupByCat, setGroupByCat] = useState(() => !!loadPrefs().groupByCat);
  const [editId, setEditId] = useState(null);
  const [clOpen, setClOpen] = useState(false);  // Checkliste-Abschnitt offen
  const [atOpen, setAtOpen] = useState(false);  // Anhänge-Abschnitt offen
  const [pLayout, setPLayout] = useState(() => loadPrefs().pLayout || "list"); // Persons: list | cards
  const [taskLayout, setTaskLayout] = useState(() => loadPrefs().taskLayout || "list"); // Aufgaben: list | board
  const [editScope, setEditScope] = useState(null);
  const [profile, setProfile] = useState("");
  const [toast, setToast] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [printKind, setPrintKind] = useState("tasks");
  const [printItems, setPrintItems] = useState([]);
  const [printPersons, setPrintPersons] = useState([]);
  const [printNonce, setPrintNonce] = useState(0);
  const [expandedLogs, setExpandedLogs] = useState(new Set());
  const [logDrafts, setLogDrafts] = useState({});
  const [mgrOpen, setMgrOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [cmgrOpen, setCmgrOpen] = useState(false);
  const [newCompany, setNewCompany] = useState("");
  const [expStatus, setExpStatus] = useState("all");
  const [pendingRestore, setPendingRestore] = useState(null);
  // Persons
  const [pForm, setPForm] = useState({ name: "", company: "", role: "", email: "", phone: "", topics: [], notes: "" });
  const [pEditId, setPEditId] = useState(null);
  const [pSearch, setPSearch] = useState("");
  const [pFilterTopic, setPFilterTopic] = useState("all");
  const [expandedPerson, setExpandedPerson] = useState(null);

  const formRef = useRef(null);
  const tasksUlRef = useRef(null);  // <ul> für Drag&Drop
  const listRef = useRef([]);       // aktuelle sichtbare Liste (manuelle Reihenfolge)
  const tasksRef = useRef(tasks);   // aktuelle Aufgaben
  const kcolRefs = useRef({});      // Kanban-Spalten-Container

  const blank = { title: "", notes: "", category: "", priority: "", status: "offen", start: "", due: "", remindLead: 3, contact: "", company: "", link: "", recurrence: "none", escalation: "", updatedAt: new Date().toISOString().slice(0, 10), scope: "personal", checklist: [], attachments: [], images: [] };
  const [form, setForm] = useState(blank);
  const sortedCats = sortCats(categories);
  const sortedCompanies = sortCats(companies);

  useEffect(() => {
    let on = true;
    (async () => {
      const [p, tRaw] = await Promise.all([
        loadScope("personal"),
        window.storage.get("tasks-team", true).then((r) => (r && r.value ? JSON.parse(r.value) : [])).catch(() => []),
      ]);
      if (!on) return;
      let personal = p.map(normalizeTask);
      const teamTasks = (tRaw || []).map(normalizeTask);
      if (teamTasks.length) {
        // Einmalige Migration: frühere "Team"-Aufgaben in die normale Liste übernehmen, alten Speicher leeren
        personal = [...personal, ...teamTasks];
        try { await saveScope("personal", personal); await window.storage.set("tasks-team", JSON.stringify([]), true); } catch {}
      }
      setTasks({ personal });
      let cats = null;
      try { const r = await window.storage.get("categories", true); cats = r && r.value ? JSON.parse(r.value) : null; } catch {}
      if (!cats) { cats = DEFAULT_CATEGORIES; try { await window.storage.set("categories", JSON.stringify(cats), true); } catch {} }
      if (on) setCategories(cats);
      let comps = null;
      try { const r = await window.storage.get("companies", true); comps = r && r.value ? JSON.parse(r.value) : null; } catch {}
      if (!comps) { comps = DEFAULT_COMPANIES; try { await window.storage.set("companies", JSON.stringify(comps), true); } catch {} }
      const missingCtx = CONTEXT_COMPANIES.filter((x) => !comps.some((c) => c.toLowerCase() === x.toLowerCase()));
      if (missingCtx.length) { comps = [...comps, ...missingCtx]; try { await window.storage.set("companies", JSON.stringify(comps), true); } catch {} }
      if (on) setCompanies(comps);
      try { const r = await window.storage.get("persons", true); if (on && r && r.value) setPersons(JSON.parse(r.value)); } catch {}
      try { const pr = await window.storage.get("profile", false); if (pr && pr.value && on) setProfile(JSON.parse(pr.value)); } catch {}
      try { const mm = await loadMeetings(); if (on) setMeetings(mm); } catch {}
      if (on) setLoaded(true);
    })();
    return () => { on = false; };
  }, [remoteTick]);

  // Live-Sync: andere Geräte melden Änderungen -> Daten neu laden
  useEffect(() => {
    const h = () => setRemoteTick((v) => v + 1);
    window.addEventListener("ctc:remote", h);
    return () => window.removeEventListener("ctc:remote", h);
  }, []);

  // Ansichts-Einstellungen merken
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ filterStatus, sortBy, groupByCat, pLayout, taskLayout })); } catch {}
  }, [filterStatus, sortBy, groupByCat, pLayout, taskLayout]);

  // PWA: neue Version verfügbar -> Banner anzeigen
  useEffect(() => {
    const h = () => setSwUpdate(true);
    window.addEventListener("ctc:sw-update", h);
    return () => window.removeEventListener("ctc:sw-update", h);
  }, []);

  // Offline-/Sync-Status
  useEffect(() => {
    const s = (e) => setSync({ state: e.detail.state, pending: e.detail.pending, online: e.detail.online });
    const on = () => setSync((p) => ({ ...p, online: true }));
    const off = () => setSync((p) => ({ ...p, online: false, state: "offline" }));
    window.addEventListener("ctc:sync", s);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if (typeof navigator !== "undefined" && navigator.onLine === false) off();
    return () => { window.removeEventListener("ctc:sync", s); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Mulish:wght@400;500;600;700;800;900&display=swap";
    document.head.appendChild(l);
    return () => { try { document.head.removeChild(l); } catch {} };
  }, []);

  // Drag & Drop (nur bei view "all", sortBy "manual", ohne Gruppierung)
  useEffect(() => {
    if (view !== "all" || taskLayout !== "list" || sortBy !== "manual" || groupByCat || !tasksUlRef.current) return;
    const s = Sortable.create(tasksUlRef.current, {
      handle: ".drag-handle", animation: 150, delay: 60, delayOnTouchOnly: true, forceFallback: true,
      onEnd: (evt) => { if (evt.oldIndex != null && evt.newIndex != null) reorderManual(evt.oldIndex, evt.newIndex); },
    });
    return () => { try { s.destroy(); } catch {} };
  }, [view, taskLayout, sortBy, groupByCat, loaded]);

  // Kanban-Board: Karten per Drag&Drop zwischen Status-Spalten verschieben
  useEffect(() => {
    if (view !== "all" || taskLayout !== "board") return;
    const cols = ["offen", "inArbeit", "onHold", "erledigt"];
    const inst = [];
    cols.forEach((key) => {
      const el = kcolRefs.current[key];
      if (!el) return;
      inst.push(Sortable.create(el, {
        group: "kanban", sort: false, animation: 150, delay: 70, delayOnTouchOnly: true, forceFallback: true,
        onAdd: (evt) => {
          const id = evt.item.getAttribute("data-id");
          const toCol = evt.to.getAttribute("data-col");
          try { evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex] ?? null); } catch {}
          if (id && toCol) changeStatus("personal", id, toCol);
        },
      }));
    });
    return () => inst.forEach((s) => { try { s.destroy(); } catch {} });
  }, [view, taskLayout, loaded]);

  useEffect(() => {
    if (printNonce > 0) {
      let printed = false;
      const go = () => { if (printed) return; printed = true; window.print(); };
      // Schrift erst laden lassen, dann drucken (sonst Ersatz-Glyphen im PDF)
      try {
        if (document.fonts && document.fonts.ready) { document.fonts.ready.then(() => setTimeout(go, 80)); }
      } catch {}
      const t = setTimeout(go, 400);
      return () => clearTimeout(t);
    }
  }, [printNonce]);

  function flash(msg) { setToast(msg); clearTimeout(flash._t); flash._t = setTimeout(() => setToast(null), 2600); }
  async function persist(scope, arr) {
    setTasks((prev) => ({ ...prev, [scope]: arr }));
    try { await saveScope(scope, arr); } catch { flash(L("Speichern fehlgeschlagen – bitte erneut versuchen.", "Saving failed – please try again.")); }
  }
  // Manuelle Reihenfolge per Drag&Drop: sichtbare Liste neu anordnen, Reihenfolge
  // in tasks.personal übernehmen (versteckte/gefilterte Aufgaben behalten ihre Plätze).
  function reorderManual(oldIndex, newIndex) {
    if (oldIndex === newIndex) return;
    const visible = listRef.current || [];
    const ids = visible.map((t) => t.id);
    if (oldIndex < 0 || oldIndex >= ids.length) return;
    const [moved] = ids.splice(oldIndex, 1);
    ids.splice(Math.min(newIndex, ids.length), 0, moved);
    const visibleSet = new Set(visible.map((t) => t.id));
    const byId = {}; (tasksRef.current.personal || []).forEach((t) => { byId[t.id] = t; });
    let vi = 0;
    const next = (tasksRef.current.personal || []).map((t) => (visibleSet.has(t.id) ? byId[ids[vi++]] : t));
    persist("personal", next);
  }
  // Aufgabe aus einem Meeting-Action-Item erzeugen (für Meetings-Modul)
  function addExternalTask(partial = {}) {
    const task = normalizeTask({
      id: uid(), title: (partial.title || L("Aufgabe", "Task")).slice(0, 200), notes: partial.notes || "",
      category: partial.category || "", priority: "", status: "offen",
      start: "", due: partial.due || "", remindLead: 3, contact: partial.contact || "",
      company: partial.company || "", link: partial.link || "", recurrence: "none", escalation: "",
      updatedAt: new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString(), createdBy: "", completedAt: null,
    });
    persist("personal", [task, ...tasks.personal]);
    flash(L("Aufgabe aus Meeting erstellt.", "Task created from meeting."));
    return task.id;
  }
  async function saveProfile(name) { setProfile(name); try { await window.storage.set("profile", JSON.stringify(name), false); } catch {} }
  async function persistCategories(arr) { try { await window.storage.set("categories", JSON.stringify(arr), true); } catch { flash(L("Speichern fehlgeschlagen.", "Saving failed.")); } }
  async function persistCompanies(arr) { try { await window.storage.set("companies", JSON.stringify(arr), true); } catch { flash(L("Speichern fehlgeschlagen.", "Saving failed.")); } }
  async function persistPersons(arr) { setPersons(arr); try { await window.storage.set("persons", JSON.stringify(arr), true); } catch { flash(L("Speichern fehlgeschlagen.", "Saving failed.")); } }

  function addCategory() {
    const name = newCat.trim();
    if (!name) return;
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) { flash(L("Bereich existiert bereits.", "Area already exists.")); return; }
    const next = [...categories, name]; setCategories(next); persistCategories(next); setNewCat(""); flash(L("Bereich hinzugefügt.", "Area added."));
  }
  function deleteCategory(name) {
    const next = categories.filter((c) => c !== name); setCategories(next); persistCategories(next);
    if (filterCat === name) setFilterCat("all");
    if (form.category === name) setForm((f) => ({ ...f, category: "" }));
    flash(L("Bereich gelöscht.", "Area deleted."));
  }
  function addCompany() {
    const name = newCompany.trim();
    if (!name) return;
    if (companies.some((c) => c.toLowerCase() === name.toLowerCase())) { flash(L("Company existiert bereits.", "Company already exists.")); return; }
    const next = [...companies, name]; setCompanies(next); persistCompanies(next); setNewCompany(""); flash(L("Company hinzugefügt.", "Company added."));
  }
  function deleteCompany(name) {
    const next = companies.filter((c) => c !== name); setCompanies(next); persistCompanies(next);
    if (filterCompany === name) setFilterCompany("all");
    if (form.company === name) setForm((f) => ({ ...f, company: "" }));
    flash(L("Company gelöscht.", "Company deleted."));
  }

  function onContactChange(val) {
    const match = persons.find((p) => p.name.toLowerCase() === val.trim().toLowerCase());
    setForm((f) => ({ ...f, contact: val, company: match && match.company ? match.company : f.company }));
  }

  function submit() {
    const title = form.title.trim();
    if (!title) { flash(L("Bitte einen Titel eingeben.", "Please enter a title.")); return; }
    if (editId) {
      const scope = editScope;
      const arr = tasks[scope].map((x) => x.id === editId ? {
        ...x, title, notes: form.notes.trim(), category: form.category, priority: form.priority, status: form.status,
        start: form.start, due: form.due, remindLead: Number(form.remindLead), contact: form.contact.trim(), company: form.company.trim(),
        link: form.link.trim(), recurrence: form.recurrence, escalation: form.escalation, updatedAt: new Date().toISOString().slice(0, 10),
        checklist: form.checklist || [], attachments: form.attachments || [], images: form.images || [],
        completedAt: form.status === "erledigt" ? (x.completedAt || new Date().toISOString()) : null,
      } : x);
      persist(scope, arr); flash(L("Aufgabe aktualisiert.", "Task updated.")); cancelEdit();
    } else {
      const scope = form.scope;
      const task = normalizeTask({
        id: uid(), title, notes: form.notes.trim(), category: form.category, priority: form.priority, status: form.status,
        start: form.start, due: form.due, remindLead: Number(form.remindLead), contact: form.contact.trim(), company: form.company.trim(),
        link: form.link.trim(), recurrence: form.recurrence, escalation: form.escalation, updatedAt: new Date().toISOString().slice(0, 10),
        checklist: form.checklist || [], attachments: form.attachments || [], images: form.images || [],
        createdAt: new Date().toISOString(),
        createdBy: "", completedAt: form.status === "erledigt" ? new Date().toISOString() : null,
      });
      persist(scope, [task, ...tasks[scope]]);
      flash(L("Aufgabe hinzugefügt.", "Task added."));
      setForm({ ...blank, scope, category: form.category, company: form.company });
      setClOpen(false); setAtOpen(false);
    }
  }
  // --- Checkliste/Unteraufgaben im Formular ---
  function chkAdd() { setForm((f) => ({ ...f, checklist: [...(f.checklist || []), { id: uid(), text: "", done: false }] })); }
  function chkUpd(id, patch) { setForm((f) => ({ ...f, checklist: (f.checklist || []).map((c) => (c.id === id ? { ...c, ...patch } : c)) })); }
  function chkDel(id) { setForm((f) => ({ ...f, checklist: (f.checklist || []).filter((c) => c.id !== id) })); }
  // --- Checkliste direkt in der Aufgabenkarte abhaken ---
  function toggleChecklistItem(scope, taskId, itemId) {
    persist(scope, tasks[scope].map((t) => (t.id === taskId
      ? { ...t, checklist: (t.checklist || []).map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)), updatedAt: new Date().toISOString().slice(0, 10) }
      : t)));
  }
  // --- Anhänge/Bilder im Formular ---
  async function formAddFiles(e) {
    const files = Array.from(e.target.files || []); e.target.value = ""; let added = 0;
    for (const fl of files) {
      if (fl.size > 3 * 1024 * 1024) { flash(L(`„${fl.name}“ > 3 MB – übersprungen.`, `"${fl.name}" > 3 MB – skipped.`)); continue; }
      const dataUrl = await fileToDataUrl(fl);
      setForm((f) => ({ ...f, attachments: [...(f.attachments || []), { id: uid(), name: fl.name, type: fl.type, size: fl.size, dataUrl }] })); added++;
    }
    if (added) flash(L("Anhang hinzugefügt.", "Attachment added."));
  }
  async function formAddImages(e) {
    const files = Array.from(e.target.files || []); e.target.value = ""; let added = 0;
    for (const fl of files) { const dataUrl = await compressImage(fl); if (dataUrl) { setForm((f) => ({ ...f, images: [...(f.images || []), { id: uid(), name: fl.name, dataUrl }] })); added++; } }
    if (added) flash(L("Bild gespeichert.", "Image saved."));
  }
  function formRemoveAtt(field, id) { setForm((f) => ({ ...f, [field]: (f[field] || []).filter((x) => x.id !== id) })); }
  function changeStatus(scope, id, newStatus) {
    const cur = tasksRef.current[scope] || tasks[scope];
    const t = cur.find((x) => x.id === id);
    if (!t) return;
    const willDone = newStatus === "erledigt";
    let arr = cur.map((x) => x.id === id ? {
      ...x, status: newStatus, updatedAt: new Date().toISOString().slice(0, 10),
      completedAt: willDone ? (x.completedAt || new Date().toISOString()) : null,
      completedBy: willDone ? profile || "" : "",
    } : x);
    if (willDone && !isDone(t) && t.recurrence && t.recurrence !== "none" && t.due) {
      const nd = shiftDate(t.due, t.recurrence);
      if (nd) {
        const next = normalizeTask({ ...t, id: uid(), status: "offen", due: nd, completedAt: null, completedBy: "", log: [], updatedAt: new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString() });
        arr = [next, ...arr]; flash(L("Folgetermin angelegt: ", "Follow-up created: ") + fmtDate(nd));
      }
    }
    persist(scope, arr);
  }
  function del(scope, id) {
    persist(scope, tasks[scope].filter((x) => x.id !== id));
    setConfirmDel(null);
    setSelected((s) => { const n = new Set(s); n.delete(scope + ":" + id); return n; });
    flash(L("Aufgabe gelöscht.", "Task deleted."));
  }
  function startEdit(scope, t) {
    setEditId(t.id); setEditScope(scope);
    setForm({
      title: t.title, notes: t.notes || "", category: t.category || "", priority: t.priority, status: t.status || "offen",
      start: t.start || "", due: t.due || "", remindLead: t.remindLead ?? 3, contact: t.contact || "", company: t.company || "",
      link: t.link || "", recurrence: t.recurrence || "none", escalation: t.escalation || "", updatedAt: t.updatedAt || "", scope,
      checklist: Array.isArray(t.checklist) ? t.checklist : [], attachments: Array.isArray(t.attachments) ? t.attachments : [], images: Array.isArray(t.images) ? t.images : [],
    });
    setClOpen((t.checklist || []).length > 0);
    setAtOpen(((t.attachments || []).length + (t.images || []).length) > 0);
    setReturnView(isTaskView ? view : "all"); // aktuelle Liste merken
    setView("new");                            // ins Formular wechseln
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function cancelEdit() { setEditId(null); setEditScope(null); setForm(blank); setClOpen(false); setAtOpen(false); setView(returnView); }
  function openNewTask() {
    setEditId(null); setEditScope(null); setForm({ ...blank });
    setClOpen(false); setAtOpen(false);
    setReturnView(view === "new" ? "all" : view); setView("new");
    window.scrollTo({ top: 0 });
  }

  // Persons handlers
  function submitPerson() {
    const name = pForm.name.trim();
    if (!name) { flash(L("Bitte einen Namen eingeben.", "Please enter a name.")); return; }
    if (pEditId) {
      persistPersons(persons.map((p) => p.id === pEditId ? { ...p, ...pForm, name, topics: pForm.topics } : p));
      flash(L("Person aktualisiert.", "Person updated."));
    } else {
      persistPersons([{ id: uid(), ...pForm, name }, ...persons]);
      flash(L("Person hinzugefügt.", "Person added."));
    }
    cancelPerson();
  }
  function editPerson(p) {
    setPEditId(p.id);
    setPForm({ name: p.name, company: p.company || "", role: p.role || "", email: p.email || "", phone: p.phone || "", topics: p.topics || [], notes: p.notes || "" });
  }
  function deletePerson(id) { persistPersons(persons.filter((p) => p.id !== id)); if (pEditId === id) cancelPerson(); flash(L("Person gelöscht.", "Person deleted.")); }
  function cancelPerson() { setPEditId(null); setPForm({ name: "", company: "", role: "", email: "", phone: "", topics: [], notes: "" }); }
  function togglePTopic(c) { setPForm((f) => ({ ...f, topics: f.topics.includes(c) ? f.topics.filter((x) => x !== c) : [...f.topics, c] })); }

  // Daten – vollständige Sicherung (inkl. Meetings & Meeting-Typen)
  async function doBackup() {
    let meetingTypes = [];
    let allMeetings = meetings;
    try { const r = await window.storage.get("meetingTypes", true); if (r && r.value) meetingTypes = JSON.parse(r.value); } catch {}
    try { const r = await window.storage.get("meetings", true); if (r && r.value) allMeetings = JSON.parse(r.value); } catch {}
    const payload = {
      app: "TO DO APP", version: 3, exportedAt: new Date().toISOString(),
      profile, categories, companies, persons,
      tasks: { personal: tasks.personal }, meetings: allMeetings, meetingTypes,
    };
    downloadBlob(JSON.stringify(payload, null, 2), `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_TODO_${L("Sicherung", "Backup")}.json`, "application/json");
    flash(L("Sicherung erstellt (inkl. Meetings).", "Backup created (incl. meetings)."));
  }
  function onRestoreFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    f.text().then((txt) => { try { setPendingRestore(JSON.parse(txt)); } catch { flash(L("Datei nicht lesbar.", "File not readable.")); } });
    e.target.value = "";
  }
  async function applyRestore() {
    const obj = pendingRestore; if (!obj) return;
    // Alte Sicherungen können noch eine "team"-Liste enthalten -> in personal übernehmen
    const np = [...(((obj.tasks && obj.tasks.personal) || []).map(normalizeTask)), ...(((obj.tasks && obj.tasks.team) || []).map(normalizeTask))];
    const cats = obj.categories || categories; const pers = obj.persons || persons; const comps = obj.companies || companies;
    setTasks({ personal: np }); setCategories(cats); setPersons(pers); setCompanies(comps);
    try {
      await saveScope("personal", np); await window.storage.set("tasks-team", JSON.stringify([]), true);
      await window.storage.set("categories", JSON.stringify(cats), true);
      await window.storage.set("companies", JSON.stringify(comps), true);
      await window.storage.set("persons", JSON.stringify(pers), true);
      if (Array.isArray(obj.meetings)) { await window.storage.set("meetings", JSON.stringify(obj.meetings), true); setMeetings(obj.meetings); }
      if (Array.isArray(obj.meetingTypes)) await window.storage.set("meetingTypes", JSON.stringify(obj.meetingTypes), true);
      if (typeof obj.profile === "string") { setProfile(obj.profile); await window.storage.set("profile", JSON.stringify(obj.profile), false); }
      flash(L("Sicherung wiederhergestellt (inkl. Meetings).", "Backup restored (incl. meetings)."));
    } catch { flash(L("Wiederherstellung teilweise fehlgeschlagen.", "Restore partially failed.")); }
    setPendingRestore(null);
  }

  // --- abgeleitete Task-Daten ---
  const merged = tasks.personal.map((t) => ({ ...t, _scope: "personal" }));
  const taskViewPool = merged;

  let list = taskViewPool.filter((t) => {
    if (filterCat === "__none__") { if (t.category) return false; }
    else if (filterCat !== "all") { if (t.category !== filterCat) return false; }
    if (filterStatus === "open") { if (isDone(t)) return false; }
    else if (filterStatus === "erledigt") { if (!isDone(t)) return false; }
    else if (filterStatus === "inArbeit") { if (t.status !== "inArbeit") return false; }
    else if (filterStatus === "onHold") { if (t.status !== "onHold") return false; }
    if (filterCompany === "__none__") { if (t.company) return false; }
    else if (filterCompany !== "all") { if (t.company !== filterCompany) return false; }
    if (filterContact === "__none__") { if (t.contact) return false; }
    else if (filterContact !== "all") { if (t.contact !== filterContact) return false; }
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = [t.title, t.notes, t.contact, t.company, catDisplay(t.category)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (sortBy !== "manual") list.sort((a, b) => {
    if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
    if (sortBy === "prio") return (PRIORITIES[a.priority] || PRIORITIES[""]).rank - (PRIORITIES[b.priority] || PRIORITIES[""]).rank;
    if (sortBy === "created") return (b.createdAt || "").localeCompare(a.createdAt || "");
    if (sortBy === "company") return (a.company || "\uffff").localeCompare(b.company || "\uffff", "de");
    if (sortBy === "contact") return (a.contact || "\uffff").localeCompare(b.contact || "\uffff", "de");
    const da = a.due ? dayDiff(a.due) : Infinity; const db = b.due ? dayDiff(b.due) : Infinity;
    return da - db;
  });
  listRef.current = list; tasksRef.current = tasks;

  // Kanban-Board: nach allen Filtern AUSSER Status, dann nach Status in Spalten
  const boardItems = taskViewPool.filter((t) => {
    if (filterCat === "__none__") { if (t.category) return false; }
    else if (filterCat !== "all") { if (t.category !== filterCat) return false; }
    if (filterCompany === "__none__") { if (t.company) return false; }
    else if (filterCompany !== "all") { if (t.company !== filterCompany) return false; }
    if (filterContact === "__none__") { if (t.contact) return false; }
    else if (filterContact !== "all") { if (t.contact !== filterContact) return false; }
    if (search.trim()) { const q = search.toLowerCase(); const hay = [t.title, t.notes, t.contact, t.company, catDisplay(t.category)].join(" ").toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  });
  const BOARD_COLS = [
    { key: "offen", get label() { return L("Offen", "Open"); }, match: (t) => !isDone(t) && (t.status === "offen" || !t.status) },
    { key: "inArbeit", get label() { return L("In Arbeit", "In progress"); }, match: (t) => !isDone(t) && t.status === "inArbeit" },
    { key: "onHold", get label() { return L("On Hold", "On hold"); }, match: (t) => !isDone(t) && t.status === "onHold" },
    { key: "erledigt", get label() { return L("Erledigt", "Done"); }, match: (t) => isDone(t) },
  ];

  const contactFilterOptions = Array.from(new Set(merged.map((t) => t.contact).filter(Boolean))).sort((a, b) => a.localeCompare(b, "de"));

  const reminderPool = taskViewPool.filter((t) => !isDone(t) && t.due);
  const overdue = reminderPool.filter((t) => urgency(t) === "overdue");
  const today = reminderPool.filter((t) => urgency(t) === "today");
  const soon = reminderPool.filter((t) => urgency(t) === "soon");

  const stat = { offen: 0, inArbeit: 0, onHold: 0, erledigt: 0, overdue: 0 };
  taskViewPool.forEach((t) => {
    if (isDone(t)) stat.erledigt++;
    else if (t.status === "inArbeit") stat.inArbeit++;
    else if (t.status === "onHold") stat.onHold++;
    else stat.offen++;
    if (!isDone(t) && urgency(t) === "overdue") stat.overdue++;
  });

  const selectedItems = merged.filter((t) => selected.has(keyOf(t)));
  const expList = merged
    .filter((t) => (expStatus === "open" ? !isDone(t) : expStatus === "erledigt" ? isDone(t) : true))
    .sort((a, b) => { const da = a.due ? dayDiff(a.due) : Infinity; const db = b.due ? dayDiff(b.due) : Infinity; return da - db; });
  const expAllSelected = expList.length > 0 && expList.every((t) => selected.has(keyOf(t)));
  const expLabel = selectedItems.length ? L(`${selectedItems.length} ausgewählt`, `${selectedItems.length} selected`) : L(`alle ${expList.length}`, `all ${expList.length}`);

  function togglePick(t) { setSelected((s) => { const n = new Set(s); const k = keyOf(t); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  function selectAll(items) {
    setSelected((s) => {
      const n = new Set(s);
      const all = items.length > 0 && items.every((t) => n.has(keyOf(t)));
      if (all) items.forEach((t) => n.delete(keyOf(t)));
      else items.forEach((t) => n.add(keyOf(t)));
      return n;
    });
  }
  function doPrint(fallback) {
    const target = selectedItems.length ? selectedItems : fallback;
    if (!target.length) { flash(L("Keine Aufgaben zum Export.", "No tasks to export.")); return; }
    setPrintKind("tasks"); setPrintItems(target); setPrintNonce((n) => n + 1);
  }
  function doExcel(fallback) {
    const target = selectedItems.length ? selectedItems : fallback;
    if (!target.length) { flash(L("Keine Aufgaben zum Export.", "No tasks to export.")); return; }
    const rows = target.map((t) => ({
      [L("Titel", "Title")]: t.title, [L("Bereich", "Area")]: catDisplay(t.category), [L("Priorität", "Priority")]: (PRIORITIES[t.priority] || PRIORITIES[""]).label,
      [L("Status", "Status")]: STATUS[t.status] ? STATUS[t.status].label : L("Offen", "Open"),
      [L("Eskalation", "Escalation")]: ESC[t.escalation] || "", [L("Letztes Update", "Last update")]: fmtDay(t.updatedAt),
      [L("Startdatum", "Start date")]: t.start ? dt(t.start + "T00:00:00") : "",
      [L("Fällig am", "Due on")]: t.due ? dt(t.due + "T00:00:00") : "", [L("Erinnerung", "Reminder")]: t.due ? leadLabel(t.remindLead) : "",
      [L("Wiederholung", "Recurrence")]: RECUR[t.recurrence] || L("Keine", "None"), [L("Ansprechperson", "Contact")]: t.contact || "", [L("Company", "Company")]: t.company || "",
      [L("Referenz", "Reference")]: t.link || "", [L("Notiz", "Note")]: t.notes || "",
      [L("Checkliste", "Checklist")]: (t.checklist || []).length ? `${t.checklist.filter((c) => c.done).length}/${t.checklist.length}` : "",
      [L("Unteraufgaben", "Subtasks")]: (t.checklist || []).map((c) => `${c.done ? "☑" : "☐"} ${c.text}`).join(" | "),
      [L("Anhänge", "Attachments")]: (t.attachments || []).map((a) => a.name).join(", "),
      [L("Bilder", "Images")]: (t.images || []).length || "",
      [L("Verlauf", "History")]: (t.log || []).map((e) => `${dt(e.date)}${e.by ? " " + e.by : ""}: ${e.text}`).join(" | "),
      [L("Erstellt am", "Created on")]: dt(t.createdAt), [L("Erledigt am", "Completed on")]: dt(t.completedAt),
    }));
    try {
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 34 }, { wch: 24 }, { wch: 9 }, { wch: 18 }, { wch: 11 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 15 }, { wch: 13 }, { wch: 18 }, { wch: 22 }, { wch: 30 }, { wch: 40 }, { wch: 9 }, { wch: 40 }, { wch: 30 }, { wch: 7 }, { wch: 50 }, { wch: 12 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "TO DO");
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      downloadBlob(out, `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_TODO.xlsx`, "application/octet-stream");
      flash(L("Excel-Datei erstellt.", "Excel file created."));
    } catch { flash(L("Excel-Export fehlgeschlagen.", "Excel export failed.")); }
  }
  function openTaskCount(name) {
    return merged.filter((t) => !isDone(t) && t.contact && t.contact.toLowerCase() === (name || "").toLowerCase()).length;
  }
  function doPrintPersons(items) {
    if (!items.length) { flash(L("Keine Personen zum Export.", "No persons to export.")); return; }
    setPrintKind("persons"); setPrintPersons(items); setPrintNonce((n) => n + 1);
  }
  function doExcelPersons(items) {
    if (!items.length) { flash(L("Keine Personen zum Export.", "No persons to export.")); return; }
    const rows = items.map((p) => ({
      [L("Name", "Name")]: p.name, [L("Funktion / Rolle", "Function / role")]: p.role || "", [L("Company", "Company")]: p.company || "",
      [L("E-Mail", "Email")]: p.email || "", [L("Telefon", "Phone")]: p.phone || "", [L("Themen", "Topics")]: (p.topics || []).join(", "),
      [L("Notiz", "Note")]: p.notes || "", [L("Offene Aufgaben", "Open tasks")]: openTaskCount(p.name),
    }));
    try {
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 40 }, { wch: 40 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, L("Personen", "Persons"));
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      downloadBlob(out, `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${L("Personen", "Persons")}.xlsx`, "application/octet-stream");
      flash(L("Excel-Datei erstellt.", "Excel file created."));
    } catch { flash(L("Excel-Export fehlgeschlagen.", "Excel export failed.")); }
  }
  function addLog(scope, id) {
    const k = scope + ":" + id;
    const text = (logDrafts[k] || "").trim();
    if (!text) return;
    const entry = { id: uid(), date: new Date().toISOString(), text, by: profile || "" };
    persist(scope, tasks[scope].map((x) => x.id === id ? { ...x, log: [...(x.log || []), entry], updatedAt: new Date().toISOString().slice(0, 10) } : x));
    setLogDrafts((d) => ({ ...d, [k]: "" }));
  }
  function delLog(scope, id, entryId) {
    persist(scope, tasks[scope].map((x) => x.id === id ? { ...x, log: (x.log || []).filter((e) => e.id !== entryId) } : x));
  }
  function toggleLog(k) { setExpandedLogs((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); }

  // --- Task-Zeile ---
  function renderTask(t) {
    const col = catColor(t.category);
    const ccol = companyColor(t.company);
    const catName = catDisplay(t.category);
    const u = urgency(t);
    const st = STATUS[t.status] || STATUS.offen;
    return (
      <li key={keyOf(t)} className={"task" + (isDone(t) ? " done" : "")} style={{ borderLeftColor: ccol }}>
        {sortBy === "manual" && !groupByCat && view === "all" && (
          <span className="drag-handle" title={L("Ziehen zum Sortieren", "Drag to sort")}><GripVertical size={16} /></span>
        )}
        <button className={"check" + (isDone(t) ? " on" : "")} style={isDone(t) ? { background: col, borderColor: col } : {}}
          onClick={() => changeStatus(t._scope, t.id, isDone(t) ? "offen" : "erledigt")} title={isDone(t) ? L("Als offen markieren", "Mark as open") : L("Als erledigt markieren", "Mark as done")}>
          {isDone(t) ? <Check size={14} strokeWidth={3} /> : null}
        </button>
        <div className="task-body">
          <div className="task-title">{t.title}{t.recurrence !== "none" && <Repeat size={13} className="rep" />}</div>
          {t.notes && <div className="task-notes">{t.notes}</div>}
          {t.link && <a className="task-link" href={normalizeUrl(t.link)} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {L("Referenz", "Reference")}</a>}
          <div className="task-meta">
            {catName && <span className="badge" style={{ color: col, borderColor: col }}>{catName}</span>}
            {t.escalation === "ja" && <span className="esc-badge">{L("Eskalation", "Escalation")}</span>}
            <select className="status-sel" value={t.status} style={{ color: st.color, borderColor: st.color }}
              onChange={(e) => changeStatus(t._scope, t.id, e.target.value)}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {t.priority && <span className="dot" style={{ background: (PRIORITIES[t.priority] || PRIORITIES[""]).color }} />}
            {t.priority && <span className="prio-label">{(PRIORITIES[t.priority] || PRIORITIES[""]).label}</span>}
            {t.start && <span className="due muted">{L("Start:", "Start:")} {fmtDate(t.start)}</span>}
            {t.due && (
              <span className="due" style={u === "overdue" ? { color: C.burgundyDarker, fontWeight: 700 } : u === "today" ? { color: C.burgundy, fontWeight: 700 } : {}}>
                {fmtDate(t.due)} · {relLabel(t.due)}
              </span>
            )}
            {t.company && <span className="company-chip" style={{ background: ccol }}><Building2 size={12} /> {t.company}</span>}
          </div>
          {(t.contact || t.updatedAt) && (
            <div className="task-contact">
              {t.contact && <span><User size={12} /> {t.contact}</span>}
              {t.updatedAt && <span className="upd">{L("Akt.", "Upd.")} {fmtDay(t.updatedAt)}</span>}
            </div>
          )}
          {(t.checklist || []).length > 0 && (() => {
            const done = t.checklist.filter((c) => c.done).length;
            return (
              <div className="card-chk">
                <div className="card-chk-head"><ListChecks size={12} /> {done}/{t.checklist.length}
                  <span className="card-chk-bar"><span style={{ width: (t.checklist.length ? Math.round(done / t.checklist.length * 100) : 0) + "%" }} /></span>
                </div>
                {t.checklist.map((c) => (
                  <label key={c.id} className={"card-chk-item" + (c.done ? " done" : "")}>
                    <input type="checkbox" checked={!!c.done} onChange={() => toggleChecklistItem(t._scope, t.id, c.id)} />
                    <span>{c.text || "—"}</span>
                  </label>
                ))}
              </div>
            );
          })()}
          {((t.images || []).length > 0 || (t.attachments || []).length > 0) && (
            <div className="card-att">
              {(t.images || []).map((im) => (
                <a key={im.id} href={im.dataUrl} target="_blank" rel="noreferrer" className="card-att-img"><img src={im.dataUrl} alt="" /></a>
              ))}
              {(t.attachments || []).map((fl) => (
                <a key={fl.id} href={fl.dataUrl} download={fl.name} className="card-att-file"><Paperclip size={11} /> {fl.name}</a>
              ))}
            </div>
          )}
          {(() => {
            const k = keyOf(t);
            const open = expandedLogs.has(k);
            const n = (t.log || []).length;
            return (
              <div className="log">
                <button className="log-toggle" onClick={() => toggleLog(k)}>
                  <MessageSquare size={12} /> {L("Verlauf", "History")}{n > 0 ? ` (${n})` : ""} {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {open && (
                  <div className="log-body">
                    {(t.log || []).slice().reverse().map((e) => (
                      <div key={e.id} className="log-entry">
                        <span className="log-date">{dt(e.date)}{e.by ? " · " + e.by : ""}</span>
                        <span className="log-text">{e.text}</span>
                        <button className="log-del" onClick={() => delLog(t._scope, t.id, e.id)} title={L("Eintrag löschen", "Delete entry")}><X size={12} /></button>
                      </div>
                    ))}
                    <div className="log-add">
                      <input value={logDrafts[k] || ""} placeholder={L("Nachfassen / Notiz mit Datum …", "Follow-up / note with date …")}
                        onChange={(ev) => setLogDrafts((d) => ({ ...d, [k]: ev.target.value }))}
                        onKeyDown={(ev) => ev.key === "Enter" && addLog(t._scope, t.id)} />
                      <button className="btn out" onClick={() => addLog(t._scope, t.id)}><Plus size={14} /></button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        <div className="task-actions">
          <button className="icon" onClick={() => startEdit(t._scope, t)} title={L("Bearbeiten", "Edit")}><Pencil size={15} /></button>
          {confirmDel === keyOf(t) ? (
            <button className="icon del-confirm" onClick={() => del(t._scope, t.id)}>{L("Löschen?", "Delete?")}</button>
          ) : (
            <button className="icon" onClick={() => setConfirmDel(keyOf(t))} title={L("Löschen", "Delete")}><X size={16} /></button>
          )}
        </div>
      </li>
    );
  }

  // grouped
  let groupNames = [], groups = {};
  if (groupByCat) {
    list.forEach((t) => { const name = catDisplay(t.category) || L("Ohne Bereich", "No area"); (groups[name] = groups[name] || []).push(t); });
    groupNames = Object.keys(groups).sort((a, b) => a === L("Ohne Bereich", "No area") ? 1 : b === L("Ohne Bereich", "No area") ? -1 : a.localeCompare(b, "de"));
  }

  const isTaskView = view === "all";
  const personsView = persons
    .filter((p) => pFilterTopic === "all" || (p.topics || []).includes(pFilterTopic))
    .filter((p) => {
      if (!pSearch.trim()) return true;
      const q = pSearch.toLowerCase();
      return [p.name, p.company, p.role, (p.topics || []).join(" ")].join(" ").toLowerCase().includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  // Globale Suche: über Aufgaben, Meetings und Personen
  const gq = gSearch.trim().toLowerCase();
  const gTasks = gq ? merged.filter((t) => [t.title, t.notes, t.contact, t.company, catDisplay(t.category)].join(" ").toLowerCase().includes(gq)).slice(0, 8) : [];
  const gMeetings = gq ? meetings.filter((m) => [m.title, m.project, m.type, m.location, (m.participants || []).map((p) => p.name).join(" ")].join(" ").toLowerCase().includes(gq)).slice(0, 8) : [];
  const gPersons = gq ? persons.filter((p) => [p.name, p.company, p.role, p.email, (p.topics || []).join(" ")].join(" ").toLowerCase().includes(gq)).slice(0, 8) : [];
  const gTotal = gTasks.length + gMeetings.length + gPersons.length;
  function closeGlobal() { setGOpen(false); setGSearch(""); }
  function gotoTask(t) { closeGlobal(); startEdit(t._scope || "personal", t); }
  function gotoPerson(p) { closeGlobal(); setView("persons"); editPerson(p); }
  function gotoMeeting(m) { closeGlobal(); setView("meetings"); setOpenMeetingReq({ id: m.id, n: (openMeetingReq?.n || 0) + 1 }); }

  return (
    <div className="ctc-root">
      <style>{css}</style>

      <div className="screen">
        <header className="hd">
          <div className="hd-inner">
            <Plane className="hd-mark" strokeWidth={2.2} />
            <div><h1>TO DO APP</h1></div>
            <div className="hd-right">
              <button className="hd-search" onClick={() => setGOpen(true)} title={L("Suche", "Search")}><Search size={18} /></button>
              <div className="lang-switch" title={L("Sprache", "Language")}>
                <button className={"lang-b" + (lang === "de" ? " on" : "")} onClick={() => setLang("de")}>DE</button>
                <button className={"lang-b" + (lang === "en" ? " on" : "")} onClick={() => setLang("en")}>EN</button>
              </div>
              <div className="hd-profile">
                <label>{L("Dein Name", "Your name")}</label>
                <input value={profile} onChange={(e) => saveProfile(e.target.value)} placeholder={L("z. B. Patrick Thorn", "e.g. Patrick Thorn")} maxLength={60} />
              </div>
            </div>
          </div>
          <nav className="tabs">
            {["dash", "all", "meetings", "persons", "export"].map((v) => (
              <button key={v} className={"tab" + (view === v ? " on" : "")} onClick={() => setView(v)}>
                {v === "dash" ? L("Dashboard", "Dashboard") : v === "all" ? L("Aufgaben", "Tasks") : v === "meetings" ? L("Meeting Minutes", "Meeting Minutes") : v === "persons" ? L("Persons", "Persons") : L("Druck & Export", "Print & Export")}
              </button>
            ))}
          </nav>
        </header>

        {isTaskView && (overdue.length || today.length || soon.length) > 0 && (
          <section className="band">
            {overdue.length > 0 && <ReminderGroup tone={C.burgundyDarker} label={L("Überfällig", "Overdue")} items={overdue} />}
            {today.length > 0 && <ReminderGroup tone={C.burgundy} label={L("Heute fällig", "Due today")} items={today} />}
            {soon.length > 0 && <ReminderGroup tone={C.sky} label={L("Demnächst", "Upcoming")} items={soon} />}
          </section>
        )}

        {/* ===================== DASHBOARD ===================== */}
        {view === "dash" ? (
          <div className="dash">
            <div className="dash-head">
              <div>
                <h2 className="dash-hi">{L("Hallo", "Hello")}{profile ? ", " + profile : ""} 👋</h2>
                <div className="dash-date">{new Date().toLocaleDateString(getLang() === "en" ? "en-GB" : "de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
              </div>
              <div className="dash-quick">
                <button className="btn primary" onClick={openNewTask}><Plus size={15} /> {L("Aufgabe", "Task")}</button>
                <button className="btn out" onClick={() => setView("meetings")}><Plane size={15} /> {L("Meeting", "Meeting")}</button>
              </div>
            </div>

            <div className="dash-tiles">
              <button className="dtile" onClick={() => { setFilterStatus("open"); setView("all"); }}><b>{stat.offen}</b><span>{L("Offen", "Open")}</span></button>
              <button className="dtile" onClick={() => { setFilterStatus("inArbeit"); setView("all"); }}><b style={{ color: C.sky }}>{stat.inArbeit}</b><span>{L("In Arbeit", "In progress")}</span></button>
              <button className="dtile" onClick={() => { setFilterStatus("onHold"); setView("all"); }}><b style={{ color: C.burgundyLight }}>{stat.onHold}</b><span>{L("On Hold", "On hold")}</span></button>
              <button className="dtile" onClick={() => { setFilterStatus("erledigt"); setView("all"); }}><b style={{ color: C.burgundyDark }}>{stat.erledigt}</b><span>{L("Erledigt", "Done")}</span></button>
              <button className="dtile over" onClick={() => { setFilterStatus("open"); setView("all"); }}><b style={{ color: C.burgundyDarker }}>{stat.overdue}</b><span>{L("Überfällig", "Overdue")}</span></button>
            </div>

            <div className="dash-grid">
              <DashList title={L("Überfällig", "Overdue")} tone={C.burgundyDarker} items={overdue} onOpen={startEdit} />
              <DashList title={L("Heute fällig", "Due today")} tone={C.burgundy} items={today} onOpen={startEdit} />
              <DashList title={L("Demnächst", "Upcoming")} tone={C.sky} items={soon} onOpen={startEdit} />
              <div className="dash-card">
                <div className="dash-card-h" style={{ color: C.burgundyDark }}>{L("Nächste Meetings", "Upcoming meetings")}</div>
                {(() => {
                  const ts = new Date().toISOString().slice(0, 10);
                  const up = meetings.filter((m) => !m.archived && (m.date || "") >= ts).sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(0, 6);
                  if (!up.length) return <div className="dash-empty">{L("Keine anstehenden Meetings.", "No upcoming meetings.")}</div>;
                  return up.map((m) => (
                    <button key={m.id} className="dash-row" style={{ borderLeftColor: C.burgundy }} onClick={() => setView("meetings")}>
                      <span className="dash-row-t">{m.title || L("(ohne Titel)", "(untitled)")}</span>
                      <span className="dash-row-m">{fmtDay(m.date)}{m.start ? " · " + m.start : ""}{m.type ? " · " + m.type : ""}</span>
                    </button>
                  ));
                })()}
              </div>
            </div>
          </div>
        ) : view === "meetings" ? (
          <Meetings persons={persons} categories={sortedCats} profile={profile}
            companyColor={companyColor} onCreateTask={addExternalTask} onMeetingsChange={setMeetings} openMeetingReq={openMeetingReq} />
        ) : view === "persons" ? (
          <div className="grid">
            <aside className="panel">
              <div className="card">
                <h2>{pEditId ? L("Person bearbeiten", "Edit person") : L("Neue Ansprechperson", "New contact")}</h2>
                <div className="field"><label>{L("Name", "Name")}</label>
                  <input value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} placeholder={L("Vor- und Nachname", "First and last name")} /></div>
                <div className="row2">
                  <div className="field"><label>{L("Funktion / Rolle", "Function / role")}</label>
                    <input value={pForm.role} onChange={(e) => setPForm({ ...pForm, role: e.target.value })} placeholder={L("z. B. NPCT", "e.g. NPCT")} /></div>
                  <div className="field">
                    <div className="label-row"><label>{L("Company", "Company")}</label>
                      <button className="link sm" onClick={() => setCmgrOpen(true)}><Settings size={13} /> {L("Verwalten", "Manage")}</button></div>
                    <select value={pForm.company} onChange={(e) => setPForm({ ...pForm, company: e.target.value })}>
                      <option value=""></option>
                      {sortedCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select></div>
                </div>
                <div className="row2">
                  <div className="field"><label>{L("E-Mail", "Email")}</label>
                    <input value={pForm.email} onChange={(e) => setPForm({ ...pForm, email: e.target.value })} placeholder="name@firma.com" /></div>
                  <div className="field"><label>{L("Telefon", "Phone")}</label>
                    <input value={pForm.phone} onChange={(e) => setPForm({ ...pForm, phone: e.target.value })} placeholder="+43 …" /></div>
                </div>
                <div className="field">
                  <div className="label-row"><label>{L("Zuständige Themen / Bereiche", "Responsible topics / areas")}</label>
                    <button className="link sm" onClick={() => setMgrOpen(true)}><Settings size={13} /> {L("Verwalten", "Manage")}</button></div>
                  <div className="chips">
                    {sortedCats.map((c) => (
                      <button key={c} className={"chip" + (pForm.topics.includes(c) ? " on" : "")}
                        style={pForm.topics.includes(c) ? { background: catColor(c), borderColor: catColor(c) } : {}}
                        onClick={() => togglePTopic(c)}>{c}</button>
                    ))}
                    {sortedCats.length === 0 && <span className="hint">{L("Noch keine Bereiche angelegt.", "No areas created yet.")}</span>}
                  </div>
                </div>
                <div className="field"><label>{L("Notiz (optional)", "Note (optional)")}</label>
                  <textarea rows={2} value={pForm.notes} onChange={(e) => setPForm({ ...pForm, notes: e.target.value })} placeholder={L("Erreichbarkeit, Vertretung …", "Availability, deputy …")} /></div>
                <div className="actions">
                  <button className="btn primary" onClick={submitPerson}>{pEditId ? L("Aktualisieren", "Update") : L("Hinzufügen", "Add")}</button>
                  {pEditId && <button className="btn ghost" onClick={cancelPerson}>{L("Abbrechen", "Cancel")}</button>}
                </div>
                <p className="hint">{L("Beim Anlegen einer Aufgabe schlägt das Feld „Ansprechperson\" diese Namen vor.", "When creating a task, the \"Contact\" field suggests these names.")}</p>
              </div>
            </aside>

            <main className="panel">
              <div className="toolbar">
                <div className="search"><Search size={15} />
                  <input value={pSearch} onChange={(e) => setPSearch(e.target.value)} placeholder={L("Person, Company, Thema suchen …", "Search person, company, topic …")} /></div>
                <div className="tb-group"><span>{L("Thema", "Topic")}</span>
                  <select value={pFilterTopic} onChange={(e) => setPFilterTopic(e.target.value)}>
                    <option value="all">{L("Alle Themen", "All topics")}</option>
                    {sortedCats.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="seg viewtog">
                  <button className={"seg-b" + (pLayout === "list" ? " on" : "")} onClick={() => setPLayout("list")} title={L("Liste", "List")}><List size={15} /> {L("Liste", "List")}</button>
                  <button className={"seg-b" + (pLayout === "cards" ? " on" : "")} onClick={() => setPLayout("cards")} title={L("Karten", "Cards")}><Square size={15} /> {L("Karten", "Cards")}</button>
                </div>
              </div>
              {persons.length === 0 && <div className="empty">{L("Noch keine Ansprechpersonen. Links die erste anlegen.", "No contacts yet. Create the first one on the left.")}</div>}
              {persons.length > 0 && personsView.length === 0 && <div className="empty">{L("Keine Treffer.", "No matches.")}</div>}
              {pLayout === "list" ? (
                <div className="plist">
                  {personsView.map((p) => {
                    const openP = merged.filter((t) => t.contact && t.contact.toLowerCase() === p.name.toLowerCase() && !isDone(t)).length;
                    return (
                      <div key={p.id} className="prow">
                        <span className="prow-name" onClick={() => editPerson(p)}>{p.name}</span>
                        <div className="prow-fields">
                          {p.company && <span className="pf"><b>{L("Company:", "Company:")}</b> {p.company}</span>}
                          {p.role && <span className="pf"><b>{L("Funktion:", "Function:")}</b> {p.role}</span>}
                          {p.email && <span className="pf"><b>{L("E-Mail:", "Email:")}</b> <a href={"mailto:" + p.email}>{p.email}</a></span>}
                          {p.phone && <span className="pf"><b>{L("Telefon:", "Phone:")}</b> <a href={"tel:" + p.phone}>{p.phone}</a></span>}
                          {p.notes && <span className="pf"><b>{L("Notizen:", "Notes:")}</b> {p.notes}</span>}
                        </div>
                        <div className="prow-topics">{(p.topics || []).map((c) => <span key={c} className="badge" style={{ color: catColor(c), borderColor: catColor(c) }}>{c}</span>)}</div>
                        <span className="prow-count">{openP} {L("offen", "open")}</span>
                        <div className="task-actions">
                          <button className="icon" onClick={() => editPerson(p)} title={L("Bearbeiten", "Edit")}><Pencil size={15} /></button>
                          <button className="icon" onClick={() => deletePerson(p.id)} title={L("Löschen", "Delete")}><X size={16} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
              <div className="pgrid">
                {personsView.map((p) => {
                  const pTasks = merged.filter((t) => t.contact && t.contact.toLowerCase() === p.name.toLowerCase());
                  const openTasks = pTasks.filter((t) => !isDone(t));
                  const open = expandedPerson === p.id;
                  return (
                    <div key={p.id} className={"pcard" + (open ? " open" : "")}>
                      <div className="pcard-head clickable" onClick={() => setExpandedPerson(open ? null : p.id)}>
                        <div>
                          <div className="pcard-name">{p.name}</div>
                          <div className="pcard-role">{[p.role, p.company].filter(Boolean).join(" · ")}</div>
                        </div>
                        <div className="task-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="icon" onClick={() => editPerson(p)} title={L("Bearbeiten", "Edit")}><Pencil size={15} /></button>
                          <button className="icon" onClick={() => deletePerson(p.id)} title={L("Löschen", "Delete")}><X size={16} /></button>
                        </div>
                      </div>
                      {(p.topics || []).length > 0 && (
                        <div className="ptopics">
                          {(p.topics || []).map((c) => <span key={c} className="badge" style={{ color: catColor(c), borderColor: catColor(c) }}>{c}</span>)}
                        </div>
                      )}
                      <div className="pcontact">
                        {p.email && <a href={"mailto:" + p.email}><Mail size={13} /> {p.email}</a>}
                        {p.phone && <a href={"tel:" + p.phone}><Phone size={13} /> {p.phone}</a>}
                      </div>
                      {p.notes && <div className="pnotes">{p.notes}</div>}
                      <button className="pcount-btn" onClick={() => setExpandedPerson(open ? null : p.id)}>
                        {openTasks.length} {L("offene Aufgabe(n)", "open task(s)")} {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      {open && (
                        <div className="pdrill">
                          {pTasks.length === 0 && <div className="pdrill-empty">{L("Keine Aufgaben zugeordnet.", "No tasks assigned.")}</div>}
                          {pTasks.sort((a, b) => (isDone(a) === isDone(b) ? 0 : isDone(a) ? 1 : -1)).map((t) => (
                            <div key={keyOf(t)} className={"pdrill-row" + (isDone(t) ? " done" : "")} style={{ borderLeftColor: companyColor(t.company) }}
                              onClick={() => startEdit(t._scope, t)} title={L("Zur Aufgabe", "Go to task")}>
                              <span className="pdrill-title">{t.title}</span>
                              <span className="pdrill-meta">
                                <span style={{ color: (STATUS[t.status] || STATUS.offen).color, fontWeight: 800 }}>{(STATUS[t.status] || STATUS.offen).label || "—"}</span>
                                {t.due && <span className="due">{fmtDate(t.due)}</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </main>
          </div>
        ) : view === "export" ? (
          /* ===================== DRUCK & EXPORT ===================== */
          <div className="exportwrap">
            <div className="card">
              <h2>{L("Auswahl & Export", "Selection & export")}</h2>
              <p className="hint">{L("Einzelne Aufgaben anhaken – oder ohne Auswahl die gesamte gefilterte Liste exportieren. „Drucken / PDF\" öffnet den Druckdialog; dort „Als PDF speichern\" wählen.", "Tick individual tasks – or without a selection, export the entire filtered list. \"Print / PDF\" opens the print dialog; choose \"Save as PDF\" there.")}</p>
              <div className="exp-controls">
                <div className="tb-group"><span>{L("Status", "Status")}</span>
                  <select value={expStatus} onChange={(e) => setExpStatus(e.target.value)}>
                    <option value="all">{L("Alle", "All")}</option><option value="open">{L("Offen", "Open")}</option><option value="erledigt">{L("Erledigt", "Done")}</option>
                  </select></div>
                <button className="link" onClick={() => selectAll(expList)} disabled={!expList.length}>
                  {expAllSelected ? <CheckSquare size={15} /> : <Square size={15} />} {expAllSelected ? L("Auswahl aufheben", "Deselect all") : L("Alle auswählen", "Select all")}
                </button>
                {selectedItems.length > 0 && <button className="link" onClick={() => setSelected(new Set())}>{L("Auswahl leeren", "Clear selection")}</button>}
                <div className="exp-actions">
                  <button className="btn out" onClick={() => doPrint(expList)}><Printer size={15} /> {L("Drucken / PDF", "Print / PDF")} <em>({expLabel})</em></button>
                  <button className="btn out" onClick={() => doExcel(expList)}><FileSpreadsheet size={15} /> {L("Excel", "Excel")} <em>({expLabel})</em></button>
                </div>
              </div>
              {expList.length === 0 ? <div className="empty">{L("Keine Aufgaben in dieser Auswahl.", "No tasks in this selection.")}</div> : (
                <ul className="exp-list">
                  {expList.map((t) => {
                    const picked = selected.has(keyOf(t));
                    const col = catColor(t.category);
                    const st = STATUS[t.status] || STATUS.offen;
                    return (
                      <li key={keyOf(t)} className={"exp-row" + (picked ? " picked" : "")} onClick={() => togglePick(t)}>
                        <span className="exp-check">{picked ? <CheckSquare size={18} /> : <Square size={18} />}</span>
                        <span className="exp-title" style={{ borderLeftColor: companyColor(t.company) }}>{t.title}</span>
                        <span className="exp-meta">
                          {catDisplay(t.category) && <span className="badge" style={{ color: col, borderColor: col }}>{catDisplay(t.category)}</span>}
                          <span className="exp-status" style={{ color: st.color }}>{st.label || "—"}</span>
                          {t.due ? <span className="due">{fmtDate(t.due)}</span> : <span className="due muted">—</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="card">
              <h2>{L("Personen exportieren", "Export persons")}</h2>
              <p className="hint">{L("Alle Ansprechpersonen als PDF/Druck oder Excel.", "All contacts as PDF/print or Excel.")}</p>
              <div className="data-row">
                <button className="btn out" onClick={() => doPrintPersons(persons)} disabled={!persons.length}><Printer size={15} /> {L("Drucken / PDF", "Print / PDF")}</button>
                <button className="btn out" onClick={() => doExcelPersons(persons)} disabled={!persons.length}><FileSpreadsheet size={15} /> {L("Excel", "Excel")}</button>
              </div>
              {persons.length === 0 && <div className="empty">{L("Noch keine Personen angelegt.", "No persons created yet.")}</div>}
            </div>

            <div className="card">
              <h2>{L("Meeting-Protokolle exportieren", "Export meeting minutes")}</h2>
              <p className="hint">{L("Pro Meeting: „Kopieren\" (formatiert in E-Mail einfügen), „E-Mail\" (Mailprogramm öffnen) oder als PDF/Druck, Word, Markdown, TXT. Anlegen/Bearbeiten im Tab „Meeting Minutes\".", "Per meeting: \"Copy\" (paste formatted into an email), \"Email\" (open mail app) or as PDF/print, Word, Markdown, TXT. Create/edit in the \"Meeting Minutes\" tab.")}</p>
              {meetings.length === 0 ? <div className="empty">{L("Noch keine Meetings angelegt.", "No meetings created yet.")}</div> : (
                <ul className="mexp-list">
                  {meetings.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((mt) => {
                    const me = enrichMeeting(mt, persons); // Funktion/Firma aus aktuellen Kontakten nachfüllen
                    return (
                    <li key={mt.id} className="mexp-row">
                      <div className="mexp-info">
                        <span className="mexp-title">{mt.title || L("(ohne Titel)", "(untitled)")}</span>
                        <span className="mexp-meta">{fmtDay(mt.date)}{mt.type ? " · " + mt.type : ""}{mt.status ? " · " + mt.status : ""}</span>
                      </div>
                      <div className="mexp-actions">
                        <button className="btn out" onClick={async () => { const ok = await copyMeetingToClipboard(me); flash(ok ? L("Protokoll kopiert – in E-Mail mit Strg/Cmd+V einfügen.", "Minutes copied – paste into an email with Ctrl/Cmd+V.") : L("Kopieren nicht möglich.", "Copy not possible.")); }}><Copy size={14} /> {L("Kopieren", "Copy")}</button>
                        <button className="btn out" onClick={() => emailMeeting(me)}><Mail size={14} /> {L("E-Mail", "Email")}</button>
                        <button className="btn out" onClick={() => printMeeting(me)}><Printer size={14} /> {L("PDF", "PDF")}</button>
                        <button className="btn out" onClick={() => exportWord(me)}><FileText size={14} /> {L("Word", "Word")}</button>
                        <button className="btn out" onClick={() => downloadBlob(meetingToMarkdown(me), `${(mt.date || new Date().toISOString().slice(0, 10)).replace(/-/g, "")}_${L("Protokoll", "Minutes")}_${(mt.title || "Meeting").replace(/\s+/g, "_")}.md`, "text/markdown")}>MD</button>
                        <button className="btn out" onClick={() => downloadBlob(meetingToText(me), `${(mt.date || new Date().toISOString().slice(0, 10)).replace(/-/g, "")}_${L("Protokoll", "Minutes")}_${(mt.title || "Meeting").replace(/\s+/g, "_")}.txt`, "text/plain")}>TXT</button>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="card">
              <h2>{L("Sicherung", "Backup")}</h2>
              <p className="hint">{L("Lädt", "Downloads")} <b>{L("alle Daten", "all data")}</b> {L("(Aufgaben, Bereiche, Companies, Personen, Meetings inkl. Anhänge, Meeting-Typen) als eine JSON-Datei. Regelmäßig empfohlen. Mit „Sicherung laden\" kannst du alles wiederherstellen.", "(tasks, areas, companies, persons, meetings incl. attachments, meeting types) as a single JSON file. Recommended regularly. With \"Load backup\" you can restore everything.")}</p>
              <div className="data-row">
                <button className="btn out" onClick={doBackup}><Download size={15} /> {L("Sicherung herunterladen", "Download backup")}</button>
                <label className="btn out filelbl"><Upload size={15} /> {L("Sicherung laden", "Load backup")}
                  <input type="file" accept="application/json,.json" onChange={onRestoreFile} hidden /></label>
              </div>
              {pendingRestore && (
                <div className="restore-confirm">{L("Aktuelle Daten durch die geladene Sicherung ersetzen?", "Replace current data with the loaded backup?")}
                  <div className="data-row">
                    <button className="btn primary" onClick={applyRestore}>{L("Wiederherstellen", "Restore")}</button>
                    <button className="btn ghost" onClick={() => setPendingRestore(null)}>{L("Abbrechen", "Cancel")}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : view === "new" ? (
          /* ============ NEUE AUFGABE / BEARBEITEN ============ */
          <div className="formwrap" ref={formRef}>
              <div className="card">
                <h2>{editId ? L("Aufgabe bearbeiten", "Edit task") : L("Neue Aufgabe", "New task")}</h2>
                <div className="field"><label>{L("Titel", "Title")}</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && submit()} placeholder={L("Was ist zu tun?", "What needs to be done?")} /></div>
                <div className="field"><label>{L("Notiz (optional)", "Note (optional)")}</label>
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={L("Kontext, Referenz, nächster Schritt …", "Context, reference, next step …")} /></div>
                <div className="field">
                  <div className="label-row"><label>{L("Bereich", "Area")}</label>
                    <button className="link sm" onClick={() => setMgrOpen(true)}><Settings size={13} /> {L("Verwalten", "Manage")}</button></div>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value=""></option>
                    {sortedCats.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="row2">
                  <div className="field"><label>{L("Priorität", "Priority")}</label>
                    <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                      {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                  <div className="field"><label>{L("Status", "Status")}</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                </div>
                <div className="row2">
                  <div className="field"><label>{L("Ansprechperson", "Contact")}</label>
                    <input list="personnames" value={form.contact} onChange={(e) => onContactChange(e.target.value)} placeholder={L("Name / Funktion", "Name / function")} />
                    <datalist id="personnames">{persons.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "de")).map((p) => <option key={p.id} value={p.name} />)}</datalist></div>
                  <div className="field">
                    <div className="label-row"><label>{L("Company", "Company")}</label>
                      <button className="link sm" onClick={() => setCmgrOpen(true)}><Settings size={13} /> {L("Verwalten", "Manage")}</button></div>
                    <select value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}>
                      <option value=""></option>
                      {sortedCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select></div>
                </div>
                <div className="field">
                  <div className="label-row"><label>{L("Startdatum (optional)", "Start date (optional)")}</label>
                    {form.start && <button type="button" className="link sm" onClick={() => setForm({ ...form, start: "" })}>{L("Löschen", "Clear")}</button>}</div>
                  <input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
                <div className="row2">
                  <div className="field">
                    <div className="label-row"><label>{L("Fällig am (optional)", "Due on (optional)")}</label>
                      {form.due && <button type="button" className="link sm" onClick={() => setForm({ ...form, due: "" })}>{L("Löschen", "Clear")}</button>}</div>
                    <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></div>
                  <div className="field"><label>{L("Erinnerung", "Reminder")}</label>
                    <select value={form.remindLead} onChange={(e) => setForm({ ...form, remindLead: e.target.value })} disabled={!form.due}>
                      {LEADS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
                    </select></div>
                </div>
                <div className="field"><label>{L("Wiederholung", "Recurrence")}</label>
                  <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
                    {Object.entries(RECUR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                {editId ? (
                  <div className="row2">
                    <div className="field"><label>{L("Eskalationsbedarf", "Escalation needed")}</label>
                      <select value={form.escalation} onChange={(e) => setForm({ ...form, escalation: e.target.value })}>
                        <option value=""></option><option value="ja">{L("Ja", "Yes")}</option><option value="nein">{L("Nein", "No")}</option>
                      </select></div>
                    <div className="field"><label>{L("Letztes Update", "Last update")}</label>
                      <div className="ro-field">{form.updatedAt ? fmtDay(form.updatedAt) : fmtDay(new Date().toISOString().slice(0, 10))}<span className="ro-hint">{L("automatisch", "automatic")}</span></div></div>
                  </div>
                ) : (
                  <div className="field"><label>{L("Eskalationsbedarf", "Escalation needed")}</label>
                    <select value={form.escalation} onChange={(e) => setForm({ ...form, escalation: e.target.value })}>
                      <option value=""></option><option value="ja">{L("Ja", "Yes")}</option><option value="nein">{L("Nein", "No")}</option>
                    </select></div>
                )}
                <div className="field"><label>{L("Referenz-Link (optional)", "Reference link (optional)")}</label>
                  <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder={L("https:// … (Reg, Drive-Dokument)", "https:// … (reg, Drive document)")} /></div>

                {/* Optional: Unteraufgaben / Checkliste */}
                {(clOpen || (form.checklist || []).length > 0) ? (
                  <div className="opt-sec">
                    <div className="opt-head"><label>{L("Unteraufgaben / Checkliste", "Subtasks / checklist")}</label>
                      <button type="button" className="link sm" onClick={() => { setClOpen(false); }}>{L("ausblenden", "hide")}</button></div>
                    {(form.checklist || []).map((c) => (
                      <div key={c.id} className="chk-row">
                        <input type="checkbox" checked={!!c.done} onChange={(e) => chkUpd(c.id, { done: e.target.checked })} />
                        <input className="chk-text" value={c.text} onChange={(e) => chkUpd(c.id, { text: e.target.value })} placeholder={L("Unteraufgabe …", "Subtask …")}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); chkAdd(); } }} />
                        <button type="button" className="icon" onClick={() => chkDel(c.id)}><X size={14} /></button>
                      </div>
                    ))}
                    <button type="button" className="link sm" onClick={chkAdd}><Plus size={13} /> {L("Punkt hinzufügen", "Add item")}</button>
                  </div>
                ) : (
                  <button type="button" className="opt-add" onClick={() => { setClOpen(true); chkAdd(); }}><Plus size={14} /> {L("Unteraufgaben / Checkliste", "Subtasks / checklist")}</button>
                )}

                {/* Optional: Anhänge / Bilder */}
                {(atOpen || (form.attachments || []).length > 0 || (form.images || []).length > 0) ? (
                  <div className="opt-sec">
                    <div className="opt-head"><label>{L("Anhänge & Bilder", "Attachments & images")}</label>
                      <button type="button" className="link sm" onClick={() => setAtOpen(false)}>{L("ausblenden", "hide")}</button></div>
                    <div className="data-row">
                      <label className="btn out filelbl"><Upload size={14} /> {L("Datei", "File")} <input type="file" hidden multiple onChange={formAddFiles} /></label>
                      <label className="btn out filelbl"><Upload size={14} /> {L("Bild", "Image")} <input type="file" hidden accept="image/*" multiple onChange={formAddImages} /></label>
                      <span className="hint">{L("max. 3 MB pro Datei", "max. 3 MB per file")}</span>
                    </div>
                    {(form.images || []).length > 0 && (
                      <div className="att-thumbs">
                        {form.images.map((im) => (
                          <div key={im.id} className="att-thumb"><img src={im.dataUrl} alt={im.name} /><button type="button" onClick={() => formRemoveAtt("images", im.id)}><X size={12} /></button></div>
                        ))}
                      </div>
                    )}
                    {(form.attachments || []).map((fl) => (
                      <div key={fl.id} className="att-file"><a href={fl.dataUrl} download={fl.name}>{fl.name}</a><span className="hint">{Math.round((fl.size || 0) / 1024)} KB</span><button type="button" className="icon" onClick={() => formRemoveAtt("attachments", fl.id)}><X size={14} /></button></div>
                    ))}
                  </div>
                ) : (
                  <button type="button" className="opt-add" onClick={() => setAtOpen(true)}><Plus size={14} /> {L("Anhänge & Bilder", "Attachments & images")}</button>
                )}

                <div className="actions">
                  <button className="btn primary" onClick={submit}>{editId ? L("Aktualisieren", "Update") : L("Hinzufügen", "Add")}</button>
                  <button className="btn ghost" onClick={cancelEdit}>{editId ? L("Abbrechen", "Cancel") : L("Zurück", "Back")}</button>
                </div>
              </div>
          </div>
        ) : (
          /* ============ AUFGABEN-LISTE ============ */
          <div className="listwrap">
            <main className="panel">
              <div className="list-head">
                <h2>{L("Aufgaben", "Tasks")}</h2>
                <button className="btn primary" onClick={openNewTask}><Plus size={16} /> {L("Neue Aufgabe", "New task")}</button>
              </div>
              <div className="search-top">
                <div className="search"><Search size={15} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("Aufgaben nach Stichwort suchen … (Titel, Notiz, Person, Company, Bereich)", "Search tasks by keyword … (title, note, person, company, area)")} />
                  {search && <button className="clear" onClick={() => setSearch("")}><X size={14} /></button>}
                </div>
              </div>
              <div className="toolbar">
                <div className="tb-group"><span>{L("Bereich", "Area")}</span>
                  <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
                    <option value="all">{L("Alle Bereiche", "All areas")}</option><option value="__none__">{L("Ohne Bereich", "No area")}</option>
                    {sortedCats.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div className="tb-group"><span>{L("Status", "Status")}</span>
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="open">{L("Offen (alle)", "Open (all)")}</option><option value="inArbeit">{L("In Arbeit", "In progress")}</option>
                    <option value="onHold">{L("On Hold", "On hold")}</option><option value="erledigt">{L("Erledigt", "Done")}</option><option value="all">{L("Alle", "All")}</option>
                  </select></div>
                <div className="tb-group"><span>{L("Company", "Company")}</span>
                  <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
                    <option value="all">{L("Alle", "All")}</option><option value="__none__">{L("Ohne", "None")}</option>
                    {sortedCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div className="tb-group"><span>{L("Person", "Person")}</span>
                  <select value={filterContact} onChange={(e) => setFilterContact(e.target.value)}>
                    <option value="all">{L("Alle", "All")}</option><option value="__none__">{L("Ohne", "None")}</option>
                    {contactFilterOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div className="tb-group"><span>{L("Sortieren", "Sort")}</span>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="due">{L("Fälligkeit", "Due date")}</option><option value="prio">{L("Priorität", "Priority")}</option><option value="created">{L("Neueste", "Newest")}</option><option value="manual">{L("Eigene Reihenfolge", "Custom order")}</option>
                    <option value="company">{L("Company", "Company")}</option><option value="contact">{L("Ansprechperson", "Contact")}</option>
                  </select></div>
                <button className="link" onClick={() => setGroupByCat((g) => !g)}>
                  {groupByCat ? <CheckSquare size={15} /> : <Square size={15} />} {L("Nach Bereich", "By area")}
                </button>
                <div className="seg viewtog">
                  <button className={"seg-b" + (taskLayout === "list" ? " on" : "")} onClick={() => setTaskLayout("list")} title={L("Liste", "List")}><List size={15} /> {L("Liste", "List")}</button>
                  <button className={"seg-b" + (taskLayout === "board" ? " on" : "")} onClick={() => setTaskLayout("board")} title={L("Board", "Board")}><Kanban size={15} /> {L("Board", "Board")}</button>
                </div>
              </div>

              <div className="stats">
                <span className="stat"><b>{stat.offen}</b> {L("Offen", "Open")}</span>
                <span className="stat"><b style={{ color: C.sky }}>{stat.inArbeit}</b> {L("In Arbeit", "In progress")}</span>
                <span className="stat"><b style={{ color: C.burgundyLight }}>{stat.onHold}</b> {L("On Hold", "On hold")}</span>
                <span className="stat"><b style={{ color: C.burgundyDark }}>{stat.erledigt}</b> {L("Erledigt", "Done")}</span>
                {stat.overdue > 0 && <span className="stat overdue"><b>{stat.overdue}</b> {L("überfällig", "overdue")}</span>}
              </div>

              <div className="legend">
                {CONTEXT_COMPANIES.map((c) => (
                  <span key={c} className="legend-item"><i style={{ background: companyColor(c) }} /> {c}</span>
                ))}
                <span className="legend-item"><i style={{ background: companyColor("") }} /> {L("Andere", "Other")}</span>
              </div>

              {!loaded && <div className="empty">{L("Aufgaben werden geladen …", "Loading tasks …")}</div>}

              {loaded && taskLayout === "board" ? (
                <div className="kboard">
                  {BOARD_COLS.map((col) => {
                    const items = boardItems.filter(col.match);
                    return (
                      <div key={col.key} className="kcol">
                        <div className="kcol-h" style={{ borderTopColor: (STATUS[col.key] || {}).color || C.cool }}>{col.label} <em>{items.length}</em></div>
                        <div className="kcol-body" data-col={col.key} ref={(el) => { kcolRefs.current[col.key] = el; }}>
                          {items.map((t) => (
                            <div key={keyOf(t)} className={"kcard" + (isDone(t) ? " done" : "")} data-id={t.id} onClick={() => startEdit(t._scope, t)} style={{ borderLeftColor: companyColor(t.company) }}>
                              <div className="kcard-title">{t.title}</div>
                              <div className="kcard-meta">
                                {catDisplay(t.category) && <span className="badge" style={{ color: catColor(t.category), borderColor: catColor(t.category) }}>{catDisplay(t.category)}</span>}
                                {t.priority && <span className="dot" style={{ background: (PRIORITIES[t.priority] || PRIORITIES[""]).color }} />}
                                {t.due && <span className="due">{fmtDate(t.due)}</span>}
                                {(t.checklist || []).length > 0 && <span className="kchk">☑ {t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span>}
                              </div>
                            </div>
                          ))}
                          {items.length === 0 && <div className="kcol-empty">—</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  {loaded && list.length === 0 && (
                    <div className="empty">
                      {search ? L("Keine Treffer.", "No matches.") : filterStatus === "erledigt" ? L("Noch nichts erledigt.", "Nothing done yet.") : L("Keine Aufgaben in dieser Ansicht. Oben „+ Neue Aufgabe“ anlegen.", "No tasks in this view. Create one with \"+ New task\" above.")}
                    </div>
                  )}
                  {!groupByCat && <ul className="tasks" ref={tasksUlRef}>{list.map(renderTask)}</ul>}
                  {groupByCat && groupNames.map((g) => (
                    <div key={g} className="grp">
                      <div className="grp-head"><span>{g}</span><em>{groups[g].length}</em></div>
                      <ul className="tasks">{groups[g].map(renderTask)}</ul>
                    </div>
                  ))}
                </>
              )}

            </main>
          </div>
        )}
        {toast && <div className="toast">{toast}</div>}
        {(!sync.online || sync.pending > 0 || sync.state === "syncing") && (
          <div className={"sync-badge" + (!sync.online ? " off" : "")}>
            <span className="sync-dot" />
            {!sync.online ? L("Offline – wird gespeichert", "Offline – being saved")
              : sync.state === "syncing" ? L("Synchronisiere …", "Synchronising …")
              : L(sync.pending + " Änderung(en) ausstehend", sync.pending + " change(s) pending")}
          </div>
        )}
        {swUpdate && (
          <div className="update-banner">
            <span>{L("Neue Version verfügbar.", "New version available.")}</span>
            <button className="btn primary" onClick={() => { try { if (window.__ctcUpdateSW) window.__ctcUpdateSW(true); else location.reload(); } catch { location.reload(); } }}>{L("Jetzt neu laden", "Reload now")}</button>
            <button className="ub-x" onClick={() => setSwUpdate(false)} title={L("Später", "Later")}><X size={15} /></button>
          </div>
        )}
        <footer className="app-foot">© Copyright by Patrick Thorn<span className="app-ver">Version {__APP_VERSION__} · {fmtDay(__BUILD_DATE__)}</span></footer>
      </div>

      {/* Globale Suche */}
      {gOpen && (
        <div className="modal-bg gsearch-bg" onClick={closeGlobal}>
          <div className="gsearch" onClick={(e) => e.stopPropagation()}>
            <div className="gsearch-in">
              <Search size={17} />
              <input autoFocus value={gSearch} onChange={(e) => setGSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && closeGlobal()}
                placeholder={L("Suche in Aufgaben, Meetings, Personen …", "Search tasks, meetings, persons …")} />
              <button className="icon" onClick={closeGlobal}><X size={18} /></button>
            </div>
            <div className="gsearch-body">
              {!gq ? <div className="gs-hint">{L("Tippe, um überall zu suchen …", "Type to search everywhere …")}</div>
                : gTotal === 0 ? <div className="gs-hint">{L("Keine Treffer.", "No matches.")}</div> : (
                  <>
                    {gTasks.length > 0 && (
                      <div className="gs-group"><div className="gs-h">{L("Aufgaben", "Tasks")}</div>
                        {gTasks.map((t) => (
                          <button key={keyOf(t)} className="gs-row" onClick={() => gotoTask(t)}>
                            <span className="gs-dot" style={{ background: companyColor(t.company) }} />
                            <span className="gs-title">{t.title}</span>
                            <span className="gs-sub">{[catDisplay(t.category), (STATUS[t.status] || STATUS.offen).label].filter(Boolean).join(" · ")}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {gMeetings.length > 0 && (
                      <div className="gs-group"><div className="gs-h">{L("Meetings", "Meetings")}</div>
                        {gMeetings.map((m) => (
                          <button key={m.id} className="gs-row" onClick={() => gotoMeeting(m)}>
                            <Plane size={13} className="gs-ic" />
                            <span className="gs-title">{m.title || L("(ohne Titel)", "(no title)")}</span>
                            <span className="gs-sub">{[fmtDay(m.date), m.type].filter(Boolean).join(" · ")}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {gPersons.length > 0 && (
                      <div className="gs-group"><div className="gs-h">{L("Personen", "Persons")}</div>
                        {gPersons.map((p) => (
                          <button key={p.id} className="gs-row" onClick={() => gotoPerson(p)}>
                            <User size={13} className="gs-ic" />
                            <span className="gs-title">{p.name}</span>
                            <span className="gs-sub">{[p.role, p.company].filter(Boolean).join(" · ")}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Bereiche verwalten */}
      {mgrOpen && (
        <div className="modal-bg" onClick={() => setMgrOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>{L("Bereiche verwalten", "Manage areas")}</h2>
              <button className="icon" onClick={() => setMgrOpen(false)}><X size={18} /></button></div>
            <p className="hint">{L("Die Reihenfolge ist automatisch alphabetisch.", "The order is automatically alphabetical.")}</p>
            <div className="mgr-add">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} placeholder={L("Neuer Bereich …", "New area …")} />
              <button className="btn primary" onClick={addCategory}>{L("Hinzufügen", "Add")}</button>
            </div>
            <ul className="mgr-list">
              {sortedCats.map((c) => (
                <li key={c}><span className="dot" style={{ background: catColor(c) }} />
                  <span className="mgr-name">{c}</span>
                  <button className="icon" onClick={() => deleteCategory(c)} title={L("Bereich löschen", "Delete area")}><X size={15} /></button></li>
              ))}
              {sortedCats.length === 0 && <li className="mgr-empty">{L("Noch keine Bereiche angelegt.", "No areas created yet.")}</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Companies verwalten */}
      {cmgrOpen && (
        <div className="modal-bg" onClick={() => setCmgrOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>{L("Companies verwalten", "Manage companies")}</h2>
              <button className="icon" onClick={() => setCmgrOpen(false)}><X size={18} /></button></div>
            <p className="hint">{L("Die Reihenfolge ist automatisch alphabetisch.", "The order is automatically alphabetical.")}</p>
            <div className="mgr-add">
              <input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCompany()} placeholder={L("Neue Company …", "New company …")} />
              <button className="btn primary" onClick={addCompany}>{L("Hinzufügen", "Add")}</button>
            </div>
            <ul className="mgr-list">
              {sortedCompanies.map((c) => (
                <li key={c}><Building2 size={15} style={{ color: C.cool, flex: "none" }} />
                  <span className="mgr-name">{c}</span>
                  <button className="icon" onClick={() => deleteCompany(c)} title={L("Company löschen", "Delete company")}><X size={15} /></button></li>
              ))}
              {sortedCompanies.length === 0 && <li className="mgr-empty">{L("Noch keine Companies angelegt.", "No companies created yet.")}</li>}
            </ul>
          </div>
        </div>
      )}

      {printKind === "persons"
        ? <PersonsPrintDoc items={printPersons} openCount={openTaskCount} />
        : <PrintDoc items={printItems} />}
    </div>
  );
}

function DashList({ title, tone, items, onOpen }) {
  return (
    <div className="dash-card">
      <div className="dash-card-h" style={{ color: tone }}>{title} <em>{items.length}</em></div>
      {items.length === 0 ? <div className="dash-empty">{L("Nichts offen.", "Nothing open.")}</div> :
        items.slice(0, 6).map((t) => (
          <button key={keyOf(t)} className="dash-row" style={{ borderLeftColor: tone }} onClick={() => onOpen(t._scope, t)}>
            <span className="dash-row-t">{t.title}</span>
            <span className="dash-row-m">{t.due ? fmtDate(t.due) + " · " + relLabel(t.due) : ""}</span>
          </button>
        ))}
      {items.length > 6 && <div className="dash-more">+{items.length - 6} {L("weitere", "more")}</div>}
    </div>
  );
}

function ReminderGroup({ tone, label, items }) {
  return (
    <div className="rgroup" style={{ borderTopColor: tone }}>
      <div className="rhead" style={{ color: tone }}>
        <span className="rcount" style={{ background: tone }}>{items.length}</span><Bell size={13} /> {label}
      </div>
      <ul>
        {items.slice(0, 4).map((t) => <li key={keyOf(t)}>{t.title}</li>)}
        {items.length > 4 && <li className="more">+{items.length - 4} {L("weitere", "more")}</li>}
      </ul>
    </div>
  );
}

function PrintDoc({ items }) {
  const now = new Date().toLocaleString(getLang() === "en" ? "en-GB" : "de-DE");
  return (
    <div className="printable">
      <div className="p-head">
        <Plane className="p-mark" strokeWidth={2.2} />
        <div className="p-titlewrap"><div className="p-title">TO DO APP</div></div>
        <div className="p-date">{L("Erstellt:", "Created:")} {now}<br />{items.length} {L("Aufgabe(n)", "task(s)")}</div>
      </div>
      <table className="p-table">
        <thead><tr><th>{L("Titel", "Title")}</th><th>{L("Bereich", "Area")}</th><th>{L("Prio", "Prio")}</th><th>{L("Status", "Status")}</th><th>{L("Eskal.", "Escal.")}</th><th>{L("Fällig", "Due")}</th><th>{L("Ansprechperson", "Contact")}</th><th>{L("Company", "Company")}</th></tr></thead>
        <tbody>
          {items.map((t) => (
            <tr key={keyOf(t)}>
              <td><strong>{t.title}</strong>{t.notes ? <div className="p-note">{t.notes}</div> : null}
                {t.start && <div className="p-note">{L("Start:", "Start:")} {fmtDay(t.start)}</div>}
                {t.updatedAt && <div className="p-note">{L("Letztes Update:", "Last update:")} {fmtDay(t.updatedAt)}</div>}
                {(t.checklist || []).length > 0 && <div className="p-note">{L("Checkliste", "Checklist")} ({t.checklist.filter((c) => c.done).length}/{t.checklist.length}): {t.checklist.map((c) => `${c.done ? "☑" : "☐"} ${c.text}`).join("  ·  ")}</div>}
                {(t.attachments || []).length > 0 && <div className="p-note">{L("Anhänge:", "Attachments:")} {t.attachments.map((a) => a.name).join(", ")}</div>}
                {(t.images || []).length > 0 && <div className="p-note">{L("Bilder:", "Images:")} {t.images.length}</div>}
                {(t.log || []).length > 0 && <div className="p-note">{(t.log || []).map((e) => `${dt(e.date)}: ${e.text}`).join("  •  ")}</div>}</td>
              <td>{catDisplay(t.category) || "—"}</td>
              <td>{(PRIORITIES[t.priority] || PRIORITIES[""]).label || "—"}</td>
              <td>{(STATUS[t.status] || STATUS.offen).label}</td>
              <td>{ESC[t.escalation] || "—"}</td>
              <td>{t.due ? `${fmtDate(t.due)} (${relLabel(t.due)})` : "—"}</td>
              <td>{t.contact || "—"}</td>
              <td>{t.company || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-foot">{L("Zur internen Verwendung", "For internal use")} · © Copyright by Patrick Thorn</div>
    </div>
  );
}

function PersonsPrintDoc({ items, openCount }) {
  const now = new Date().toLocaleString(getLang() === "en" ? "en-GB" : "de-DE");
  return (
    <div className="printable">
      <div className="p-head">
        <Plane className="p-mark" strokeWidth={2.2} />
        <div className="p-titlewrap"><div className="p-title">{L("Ansprechpersonen", "Contacts")}</div></div>
        <div className="p-date">{L("Erstellt:", "Created:")} {now}<br />{items.length} {L("Person(en)", "person(s)")}</div>
      </div>
      <table className="p-table">
        <thead><tr><th>{L("Name", "Name")}</th><th>{L("Funktion", "Function")}</th><th>{L("Company", "Company")}</th><th>{L("Themen", "Topics")}</th><th>{L("E-Mail", "Email")}</th><th>{L("Telefon", "Phone")}</th><th>{L("Offen", "Open")}</th></tr></thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td><strong>{p.name}</strong>{p.notes ? <div className="p-note">{p.notes}</div> : null}</td>
              <td>{p.role || "—"}</td>
              <td>{p.company || "—"}</td>
              <td>{(p.topics || []).join(", ") || "—"}</td>
              <td>{p.email || "—"}</td>
              <td>{p.phone || "—"}</td>
              <td>{openCount(p.name)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-foot">{L("Zur internen Verwendung", "For internal use")} · © Copyright by Patrick Thorn</div>
    </div>
  );
}

// ===========================================================================
const css = `
.ctc-root{font-family:'Mulish',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${C.body};background:${C.panel};min-height:100vh;max-width:1180px;margin:0 auto;-webkit-font-smoothing:antialiased;}
.ctc-root *{box-sizing:border-box;}
.ctc-root h1,.ctc-root h2{margin:0;font-weight:900;color:${C.ink};letter-spacing:-.01em;}
.ctc-root h3{margin:0;font-weight:800;color:${C.ink};}
.printable{display:none;}

.hd{background-image:linear-gradient(90deg,${C.burgundy},${C.burgundyDark});}
.hd-inner{display:flex;align-items:center;gap:16px;padding:20px 24px;}
.hd-mark{width:34px;height:34px;color:${C.white};opacity:.97;flex:none;}
.hd h1{color:${C.white};font-size:24px;line-height:1.1;letter-spacing:.04em;}
.hd-right{margin-left:auto;display:flex;align-items:center;gap:12px;}
.lang-switch{display:flex;gap:3px;background:rgba(255,255,255,.18);border-radius:8px;padding:3px;}
.lang-b{font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;border:none;background:transparent;color:rgba(255,255,255,.85);border-radius:6px;padding:5px 9px;}
.lang-b.on{background:${C.white};color:${C.burgundyDark};}
.hd-search{display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.18);border:none;color:#fff;border-radius:8px;width:34px;height:34px;cursor:pointer;flex:none;}
.hd-search:hover{background:rgba(255,255,255,.30);}
.hd-profile{text-align:right;}
.update-banner{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom));z-index:60;display:flex;align-items:center;gap:12px;background:${C.ink};color:#fff;border-radius:12px;padding:9px 10px 9px 16px;box-shadow:0 8px 30px rgba(0,0,0,.28);font-size:13px;font-weight:700;max-width:92vw;}
.update-banner .btn{padding:7px 12px;font-size:13px;}
.update-banner .ub-x{background:none;border:none;color:rgba(255,255,255,.7);cursor:pointer;display:flex;padding:2px;}
.gsearch-bg{align-items:flex-start;}
.gsearch{width:100%;max-width:560px;margin-top:9vh;background:${C.white};border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;display:flex;flex-direction:column;max-height:74vh;}
.gsearch-in{display:flex;align-items:center;gap:10px;padding:13px 14px;border-bottom:1px solid ${C.line};color:${C.cool};}
.gsearch-in input{flex:1;border:none;outline:none;font-size:16px;font-family:inherit;color:${C.ink};background:none;}
.gsearch-body{overflow:auto;padding:8px;}
.gs-hint{padding:26px;text-align:center;color:${C.cool};font-size:14px;}
.gs-group{margin-bottom:4px;}
.gs-h{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:${C.burgundy};padding:8px 10px 4px;}
.gs-row{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:8px 10px;border-radius:8px;font-family:inherit;}
.gs-row:hover{background:${C.fill};}
.gs-dot{width:9px;height:9px;border-radius:50%;flex:none;}
.gs-ic{color:${C.burgundy};flex:none;}
.gs-title{font-size:14px;font-weight:700;color:${C.ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gs-sub{font-size:12px;color:${C.cool};margin-left:auto;white-space:nowrap;flex:none;padding-left:10px;}
.hd-profile label{display:block;color:rgba(255,255,255,.82);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;}
.hd-profile input{width:190px;max-width:46vw;text-align:center;border:none;border-radius:7px;padding:7px 10px;font-size:14px;font-weight:700;color:${C.burgundyDark};background:${C.white};}
.tabs{display:flex;align-items:center;gap:4px;padding:0 24px;background:${C.burgundyDark};}
.tab{background:transparent;border:none;color:rgba(255,255,255,.78);font-family:inherit;font-size:14px;font-weight:700;padding:13px 16px;cursor:pointer;border-bottom:3px solid transparent;transition:.15s;}
.tab:hover{color:${C.white};}
.tab.on{color:${C.white};border-bottom-color:${C.skyLight};}

.band{display:flex;gap:14px;flex-wrap:wrap;padding:16px 24px;background:${C.skyPale};border-bottom:1px solid ${C.line};}
.rgroup{background:${C.white};border:1px solid ${C.line};border-top-width:3px;border-radius:9px;padding:11px 14px;min-width:200px;flex:1;}
.rhead{display:flex;align-items:center;gap:7px;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.03em;margin-bottom:7px;}
.rcount{color:${C.white};font-size:12px;min-width:20px;height:20px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;padding:0 6px;}
.rgroup ul{margin:0;padding:0;list-style:none;}
.rgroup li{font-size:13px;color:${C.grey};padding:2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.rgroup li.more{color:${C.cool};font-weight:600;font-size:12px;}

.grid{display:grid;grid-template-columns:340px 1fr;gap:20px;padding:20px 24px 40px;align-items:start;}
.formwrap{max-width:660px;margin:0 auto;padding:20px 24px 48px;}
.listwrap{padding:20px 24px 40px;}
.panel{min-width:0;}
aside.panel .card{position:sticky;top:16px;}
.card{background:${C.white};border:1px solid ${C.line};border-radius:12px;padding:18px;}
.card h2{font-size:16px;margin-bottom:14px;}
.field{margin-bottom:13px;}
.field label{display:block;font-size:12px;font-weight:700;color:${C.grey};margin-bottom:5px;}
.label-row{display:flex;align-items:center;justify-content:space-between;}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:11px;}
.row2>*{min-width:0;}
.ctc-root input,.ctc-root select,.ctc-root textarea{width:100%;max-width:100%;min-width:0;font-family:inherit;font-size:14px;color:${C.body};background:${C.white};border:1px solid ${C.line};border-radius:8px;padding:9px 10px;outline:none;transition:.15s;}
.ctc-root input[type="date"]{-webkit-appearance:none;appearance:none;}
.ctc-root textarea{resize:vertical;}
.ctc-root input:focus,.ctc-root select:focus,.ctc-root textarea:focus{border-color:${C.burgundy};box-shadow:0 0 0 3px rgba(175,30,101,.13);}
.ctc-root select:disabled{background:${C.fill};color:${C.cool};}
.seg{display:flex;gap:6px;}
.seg-b{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:9px;border-radius:8px;border:1px solid ${C.line};background:${C.white};color:${C.grey};}
.seg-b.on{background:${C.burgundy};border-color:${C.burgundy};color:${C.white};}
.actions{display:flex;gap:9px;margin-top:6px;}
.btn{display:inline-flex;align-items:center;gap:7px;font-family:inherit;font-weight:800;font-size:14px;cursor:pointer;border-radius:8px;padding:10px 16px;border:1px solid transparent;transition:.15s;}
.btn.primary{background:${C.burgundy};color:${C.white};}
.btn.primary:hover{background:${C.burgundyDark};}
.btn.ghost{background:${C.white};color:${C.grey};border-color:${C.line};}
.btn.ghost:hover{border-color:${C.cool};}
.btn.out{background:${C.white};color:${C.burgundyDark};border-color:${C.line};padding:8px 12px;font-size:13px;}
.btn.out:hover{border-color:${C.burgundy};background:${C.skyPale};}
.btn.out em{font-style:normal;font-weight:600;color:${C.cool};font-size:12px;}
.filelbl{cursor:pointer;}
.hint{margin:11px 0 0;font-size:12px;color:${C.cool};line-height:1.4;}

.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:${C.white};border:1px solid ${C.line};border-radius:10px;padding:8px 10px;margin-bottom:12px;}
.search{display:flex;align-items:center;gap:7px;border:1px solid ${C.line};border-radius:8px;padding:0 10px;min-width:170px;flex:1;max-width:280px;color:${C.cool};}
.search-top{margin:0 0 12px;display:flex;}
.search-top .search{max-width:none;width:100%;flex:1;}
.search input{border:none;padding:8px 0;box-shadow:none !important;}
.search .clear{background:none;border:none;color:${C.cool};cursor:pointer;display:flex;}
.tb-group{display:flex;align-items:center;gap:5px;}
.tb-group span{font-size:10px;font-weight:800;color:${C.cool};text-transform:uppercase;letter-spacing:.04em;}
.tb-group select{width:auto;padding:5px 7px;font-size:12px;}
.tb-export{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-left:auto;}
.link{display:inline-flex;align-items:center;gap:6px;background:none;border:none;font-family:inherit;font-size:13px;font-weight:700;color:${C.sky};cursor:pointer;padding:6px 4px;}
.link:hover{color:${C.burgundy};}
.link:disabled{color:${C.line};cursor:default;}
.link.sm{font-size:12px;padding:0;}
.stats{display:flex;gap:18px;flex-wrap:wrap;padding:0 4px 12px;}
.stat{font-size:13px;color:${C.grey};font-weight:600;}
.stat b{color:${C.ink};font-weight:900;margin-right:3px;}
.stat.overdue b{color:${C.burgundyDarker};}
.selbar{display:flex;align-items:center;gap:14px;background:${C.skyPale};border:1px solid ${C.skyLight};border-radius:9px;padding:9px 14px;margin-bottom:12px;font-size:13px;font-weight:700;color:${C.burgundyDark};}

.empty{background:${C.white};border:1px dashed ${C.line};border-radius:10px;padding:34px 20px;text-align:center;color:${C.cool};font-size:14px;}
.grp{margin-bottom:18px;}
.grp-head{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;color:${C.burgundyDark};text-transform:uppercase;letter-spacing:.03em;margin:0 0 8px;padding-bottom:5px;border-bottom:2px solid ${C.fill};}
.grp-head em{font-style:normal;color:${C.cool};font-weight:700;}
.tasks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px;}
.task{display:flex;gap:9px;align-items:flex-start;background:${C.white};border:1px solid ${C.line};border-left-width:4px;border-radius:8px;padding:8px 11px;transition:.15s;}
.task:hover{box-shadow:0 2px 10px rgba(33,37,41,.06);}
.task.picked{background:${C.skyPale};border-color:${C.skyLight};}
.task.done{opacity:.62;}
.task.done .task-title{text-decoration:line-through;color:${C.cool};}
.pick{flex:none;background:none;border:none;cursor:pointer;color:${C.line};padding:2px;margin-top:1px;transition:.15s;}
.pick:hover{color:${C.sky};}
.pick.on{color:${C.sky};}
.drag-handle{flex:none;display:flex;align-items:center;color:${C.line};cursor:grab;margin-top:1px;touch-action:none;}
.drag-handle:hover{color:${C.cool};}
.sortable-ghost{opacity:.5;}
.sortable-chosen{box-shadow:0 4px 16px rgba(33,37,41,.14);}
.check{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid ${C.line};background:${C.white};cursor:pointer;color:${C.white};display:flex;align-items:center;justify-content:center;margin-top:1px;transition:.15s;}
.check:hover{border-color:${C.burgundy};}
.task-body{flex:1;min-width:0;}
.task-title{font-size:14px;font-weight:700;color:${C.ink};line-height:1.3;display:flex;align-items:center;gap:6px;}
.task-title .rep{color:${C.sky};flex:none;}
.task-notes{font-size:12px;color:${C.grey};margin-top:1px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;}
.task-link{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:${C.sky};text-decoration:none;margin-top:3px;}
.task-link:hover{color:${C.burgundy};}
.task-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;}
.badge{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;border:1px solid;border-radius:5px;padding:1px 6px;background:${C.white};}
.status-sel{width:auto !important;padding:3px 6px !important;font-size:11px !important;font-weight:800;border-width:1px !important;border-radius:5px !important;background:${C.white};cursor:pointer;}
.dot{width:9px;height:9px;border-radius:50%;flex:none;}
.prio-label{font-size:12px;color:${C.cool};font-weight:600;}
.due{font-size:12px;color:${C.grey};font-weight:600;}
.due.muted{color:${C.line};font-weight:600;}
.scope-tag{font-size:11px;font-weight:700;color:${C.cool};background:${C.fill};border-radius:5px;padding:2px 7px;}
.task-contact{display:flex;gap:10px;flex-wrap:wrap;margin-top:3px;}
.task-contact span{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:${C.grey};font-weight:600;}
.task-contact span.upd{color:${C.cool};font-weight:600;}
.esc-badge{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:${C.white};background:#D32F2F;border-radius:5px;padding:2px 8px;}
.company-chip{display:inline-flex;align-items:center;gap:5px;color:${C.white} !important;font-size:12px;font-weight:700;border-radius:5px;padding:2px 8px;}
.company-chip svg{color:${C.white};}
.legend{display:flex;gap:16px;flex-wrap:wrap;align-items:center;padding:0 4px 14px;}
.legend-item{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:${C.grey};}
.legend-item i{width:11px;height:11px;border-radius:3px;display:inline-block;}
.ro-field{display:flex;align-items:center;justify-content:space-between;font-size:14px;font-weight:600;color:${C.grey};background:${C.fill};border:1px solid ${C.line};border-radius:8px;padding:9px 10px;}
.ro-hint{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:${C.cool};}
.log{margin-top:4px;}
.log-toggle{display:inline-flex;align-items:center;gap:5px;background:none;border:none;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;color:${C.sky};padding:0;}
.log-toggle:hover{color:${C.burgundy};}
.log-body{margin-top:8px;border-left:2px solid ${C.fill};padding-left:10px;display:flex;flex-direction:column;gap:6px;}
.log-entry{display:flex;align-items:flex-start;gap:8px;font-size:12px;}
.log-date{flex:none;color:${C.cool};font-weight:700;white-space:nowrap;}
.log-text{flex:1;color:${C.body};line-height:1.4;}
.log-del{flex:none;background:none;border:none;color:${C.line};cursor:pointer;display:flex;padding:0;}
.log-del:hover{color:${C.burgundyDarker};}
.log-add{display:flex;gap:6px;margin-top:2px;}
.log-add input{font-size:13px;padding:6px 9px;}
.log-add .btn.out{padding:6px 9px;}
.task-contact svg{color:${C.cool};}
.task-actions{display:flex;gap:4px;flex:none;}
.icon{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:none;background:transparent;color:${C.cool};cursor:pointer;border-radius:7px;transition:.15s;}
.icon:hover{background:${C.fill};color:${C.burgundy};}
.icon.del-confirm{width:auto;padding:0 10px;font-size:12px;font-weight:800;color:${C.white};background:${C.burgundyDarker};}

.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;}
.pcard{background:${C.white};border:1px solid ${C.line};border-radius:12px;padding:15px;}
.pcard-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}
.pcard-name{font-size:16px;font-weight:800;color:${C.ink};}
.pcard-role{font-size:12px;color:${C.cool};font-weight:600;margin-top:2px;}
.ptopics{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px;}
.pcontact{display:flex;flex-direction:column;gap:5px;margin-top:11px;}
.pcontact a{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:${C.sky};text-decoration:none;font-weight:600;}
.pcontact a:hover{color:${C.burgundy};}
.pnotes{font-size:13px;color:${C.grey};margin-top:10px;line-height:1.4;}
.pcount{margin-top:11px;font-size:12px;font-weight:700;color:${C.burgundyDark};background:${C.skyPale};border-radius:6px;padding:5px 9px;display:inline-block;}
.pcard-head.clickable{cursor:pointer;}
.pcount-btn{display:inline-flex;align-items:center;gap:6px;margin-top:11px;font-family:inherit;font-size:12px;font-weight:700;color:${C.burgundyDark};background:${C.skyPale};border:none;border-radius:6px;padding:6px 10px;cursor:pointer;}
.pcount-btn:hover{background:${C.skyLight};}
.pdrill{margin-top:11px;display:flex;flex-direction:column;gap:6px;border-top:1px solid ${C.fill};padding-top:10px;}
.pdrill-empty{font-size:13px;color:${C.cool};}
.pdrill-row{display:flex;flex-direction:column;gap:4px;border-left:3px solid ${C.cool};background:${C.panel};border-radius:7px;padding:8px 10px;cursor:pointer;transition:.12s;}
.pdrill-row:hover{background:${C.skyPale};}
.pdrill-row.done{opacity:.6;}
.pdrill-row.done .pdrill-title{text-decoration:line-through;}
.pdrill-title{font-size:13px;font-weight:700;color:${C.ink};}
.pdrill-meta{display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:12px;color:${C.grey};}
.chips{display:flex;flex-wrap:wrap;gap:6px;}
.chip{font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ${C.line};background:${C.white};color:${C.grey};border-radius:6px;padding:4px 8px;transition:.15s;}
.chip:hover{border-color:${C.sky};}
.chip.on{color:${C.white};}

.mexp-list{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:7px;}
.mexp-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid ${C.line};border-radius:9px;padding:9px 12px;}
.mexp-info{flex:1;min-width:150px;}
.mexp-title{display:block;font-weight:800;color:${C.ink};font-size:14px;}
.mexp-meta{font-size:12px;color:${C.cool};}
.mexp-actions{display:flex;gap:6px;flex-wrap:wrap;}
.mexp-actions .btn.out{padding:6px 10px;font-size:12px;}
.opt-add{display:inline-flex;align-items:center;gap:6px;background:${C.fill};border:1px dashed ${C.line};color:${C.grey};font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;border-radius:8px;padding:9px 12px;margin-top:2px;}
.opt-add:hover{border-color:${C.burgundy};color:${C.burgundyDark};}
.opt-sec{border:1px solid ${C.line};border-radius:9px;padding:10px 12px;margin-top:4px;background:${C.fill};}
.opt-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.opt-head label{font-size:12px;font-weight:800;color:${C.grey};}
.chk-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.chk-row input[type="checkbox"]{width:17px;height:17px;flex:none;accent-color:${C.burgundy};}
.chk-text{flex:1;}
.att-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0;}
.att-thumb{position:relative;width:84px;height:84px;border:1px solid ${C.line};border-radius:8px;overflow:hidden;}
.att-thumb img{width:100%;height:100%;object-fit:cover;}
.att-thumb button{position:absolute;top:2px;right:2px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:5px;cursor:pointer;display:flex;padding:2px;}
.att-file{display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 0;border-bottom:1px solid ${C.line};}
.att-file a{color:${C.sky};font-weight:700;text-decoration:none;}
.card-chk{margin-top:6px;}
.card-chk-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:${C.grey};}
.card-chk-bar{flex:1;height:5px;background:${C.fill};border-radius:3px;overflow:hidden;max-width:120px;margin-left:4px;}
.card-chk-bar span{display:block;height:100%;background:${C.burgundy};}
.card-chk-item{display:flex;align-items:center;gap:7px;font-size:12px;color:${C.body};margin-top:3px;cursor:pointer;}
.card-chk-item input{width:15px;height:15px;accent-color:${C.burgundy};}
.card-chk-item.done span{text-decoration:line-through;color:${C.cool};}
.card-att{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center;}
.card-att-img{display:block;width:40px;height:40px;border:1px solid ${C.line};border-radius:6px;overflow:hidden;}
.card-att-img img{width:100%;height:100%;object-fit:cover;}
.card-att-file{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:${C.sky};text-decoration:none;background:${C.fill};border-radius:6px;padding:3px 7px;}
.list-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}
.list-head h2{font-size:20px;font-weight:900;color:${C.ink};margin:0;}
.viewtog{margin-left:auto;flex:none;}
.viewtog .seg-b{padding:7px 11px;}
.kboard{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;align-items:start;}
.kcol{background:${C.panel};border:1px solid ${C.line};border-radius:11px;padding:8px;min-height:80px;}
.kcol-h{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.03em;color:${C.ink};border-top:3px solid ${C.cool};border-radius:3px;padding:7px 6px 8px;display:flex;align-items:center;gap:6px;}
.kcol-h em{font-style:normal;color:${C.cool};font-weight:700;margin-left:auto;}
.kcol-body{min-height:40px;display:flex;flex-direction:column;gap:7px;padding-top:4px;}
.kcard{background:${C.white};border:1px solid ${C.line};border-left-width:4px;border-radius:9px;padding:9px 11px;cursor:pointer;transition:.12s;}
.kcard:hover{box-shadow:0 3px 12px rgba(33,37,41,.1);}
.kcard.done .kcard-title{text-decoration:line-through;color:${C.cool};}
.kcard-title{font-size:13px;font-weight:700;color:${C.ink};line-height:1.3;}
.kcard-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;}
.kchk{font-size:11px;font-weight:700;color:${C.grey};}
.kcol-empty{color:${C.line};font-size:13px;text-align:center;padding:10px 0;}
.plist{display:flex;flex-direction:column;gap:6px;}
.prow{display:flex;align-items:center;gap:12px;background:${C.white};border:1px solid ${C.line};border-radius:9px;padding:9px 12px;flex-wrap:wrap;}
.prow-name{cursor:pointer;font-weight:800;color:${C.ink};font-size:14px;min-width:120px;}
.prow-fields{display:flex;flex-wrap:wrap;align-items:center;gap:4px 16px;flex:1;min-width:160px;font-size:12px;color:${C.grey};}
.pf b{font-weight:700;color:${C.cool};margin-right:3px;}
.pf a{color:${C.sky};text-decoration:none;font-weight:600;}
.prow-topics{display:flex;flex-wrap:wrap;gap:4px;max-width:260px;}
.prow-count{font-size:12px;font-weight:700;color:${C.grey};white-space:nowrap;}
.app-foot{text-align:center;font-size:14px;font-weight:700;color:#8b93a7;border-top:1px solid ${C.fill};margin-top:6px;padding:18px 12px calc(22px + env(safe-area-inset-bottom));}
.app-ver{display:block;margin-top:4px;font-size:11px;font-weight:600;color:${C.cool};}
.dash{padding:20px 24px 48px;max-width:1180px;margin:0 auto;}
.dash-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px;}
.dash-hi{font-size:24px;font-weight:900;color:${C.ink};margin:0;}
.dash-date{font-size:13px;color:${C.cool};font-weight:600;margin-top:2px;text-transform:capitalize;}
.dash-quick{display:flex;gap:8px;}
.dash-tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px;}
.dtile{display:flex;flex-direction:column;align-items:flex-start;gap:2px;background:${C.white};border:1px solid ${C.line};border-radius:12px;padding:14px 16px;cursor:pointer;font-family:inherit;text-align:left;transition:.15s;}
.dtile:hover{box-shadow:0 4px 16px rgba(33,37,41,.08);transform:translateY(-1px);}
.dtile b{font-size:26px;font-weight:900;color:${C.ink};line-height:1;}
.dtile span{font-size:12px;font-weight:700;color:${C.grey};}
.dtile.over{background:${C.skyPale};border-color:${C.skyLight};}
.dash-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
.dash-card{background:${C.white};border:1px solid ${C.line};border-radius:12px;padding:14px 16px;}
.dash-card-h{font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px;display:flex;align-items:center;gap:8px;}
.dash-card-h em{font-style:normal;color:${C.cool};font-weight:700;}
.dash-row{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;text-align:left;background:${C.fill};border:none;border-left:3px solid ${C.line};border-radius:7px;padding:8px 10px;margin-bottom:6px;cursor:pointer;font-family:inherit;}
.dash-row:hover{background:#eceff3;}
.dash-row-t{font-size:13px;font-weight:700;color:${C.ink};line-height:1.25;}
.dash-row-m{font-size:11px;color:${C.cool};font-weight:600;}
.dash-empty{font-size:13px;color:${C.cool};padding:6px 0;}
.dash-more{font-size:12px;color:${C.cool};font-weight:600;padding-top:2px;}
.sync-badge{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:70;display:inline-flex;align-items:center;gap:7px;background:${C.ink};color:#fff;font-size:12px;font-weight:700;padding:7px 12px;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,.22);}
.sync-badge.off{background:${C.burgundyDarker};}
.sync-dot{width:8px;height:8px;border-radius:50%;background:#ffd166;}
.sync-badge.off .sync-dot{background:#ff6b6b;}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:80;background:${C.ink};color:${C.white};font-size:14px;font-weight:600;padding:11px 18px;border-radius:9px;box-shadow:0 6px 24px rgba(0,0,0,.22);}
.modal-bg{position:fixed;inset:0;background:rgba(33,37,41,.45);z-index:70;display:flex;align-items:center;justify-content:center;padding:20px;}
.modal{background:${C.white};border-radius:14px;width:100%;max-width:480px;max-height:86vh;overflow:auto;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.3);}
.modal-head{display:flex;align-items:center;justify-content:space-between;}
.modal-head h2{font-size:17px;}
.modal .sec{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:${C.burgundyDark};margin-top:18px;margin-bottom:2px;}
.mgr-add{display:flex;gap:8px;margin:14px 0;}
.mgr-add input{flex:1;}
.mgr-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;}
.mgr-list li{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid ${C.fill};}
.mgr-name{flex:1;font-size:14px;font-weight:600;color:${C.ink};}
.mgr-empty{color:${C.cool};font-size:13px;justify-content:center;}
.data-row{display:flex;gap:9px;flex-wrap:wrap;margin-top:10px;}
.restore-confirm{background:${C.skyPale};border:1px solid ${C.skyLight};border-radius:9px;padding:12px;margin-top:12px;font-size:13px;font-weight:700;color:${C.burgundyDark};}
.exportwrap{display:flex;flex-direction:column;gap:18px;padding:20px 24px 40px;max-width:900px;}
.exportwrap .card h2{font-size:16px;margin-bottom:6px;}
.exp-controls{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin:12px 0 14px;padding-bottom:14px;border-bottom:1px solid ${C.fill};}
.exp-actions{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto;}
.exp-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:60vh;overflow:auto;}
.exp-row{display:flex;align-items:center;gap:11px;padding:9px 10px;border:1px solid ${C.line};border-radius:9px;cursor:pointer;transition:.12s;}
.exp-row:hover{border-color:${C.sky};}
.exp-row.picked{background:${C.skyPale};border-color:${C.skyLight};}
.exp-check{flex:none;color:${C.line};display:flex;}
.exp-row.picked .exp-check{color:${C.sky};}
.exp-title{flex:1;min-width:0;font-size:14px;font-weight:700;color:${C.ink};padding-left:9px;border-left:3px solid ${C.cool};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.exp-meta{display:flex;align-items:center;gap:9px;flex-wrap:wrap;flex:none;}
.exp-status{font-size:12px;font-weight:800;}

@media(max-width:860px){
  .grid{grid-template-columns:1fr;padding:16px 16px 40px;}
  .formwrap,.listwrap{padding:16px 16px 40px;}
  .dash{padding:16px 14px 48px;}
  .dash-tiles{grid-template-columns:repeat(2,1fr);}
  .dash-grid{grid-template-columns:1fr;}
  .kboard{display:flex;gap:10px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px;}
  .kcol{min-width:82%;flex:none;}
  .viewtog{margin-left:0;}
  aside.panel .card{position:static;}
  .hd-profile{display:none;}
  .hd-inner{padding:16px;padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right));}
  .hd h1{font-size:20px;}
  .tabs{padding:0 8px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
  .tabs::-webkit-scrollbar{display:none;}
  .tab{padding:12px 12px;font-size:13px;white-space:nowrap;flex:none;}
  .band{padding:14px 16px;}
  .rgroup{min-width:140px;}
  .toolbar{padding:10px 12px;}
  .tb-export{margin-left:0;}
  .search{max-width:none;}
  .exportwrap{padding:16px;}
  .exp-actions{margin-left:0;}
  .exp-row{flex-wrap:wrap;}
  .exp-title{white-space:normal;flex:1 1 100%;}
}
/* Laptop & iPad (quer): Breite nutzen – Aufgabenliste zweispaltig */
@media(min-width:1024px){
  .ctc-root{max-width:1240px;}
  .tasks{display:grid;grid-template-columns:1fr 1fr;gap:9px;align-items:start;}
  .grp .tasks{grid-template-columns:1fr 1fr;}
}
@media(min-width:1480px){
  .tasks{grid-template-columns:1fr 1fr 1fr;}
}
@media print{
  .screen{display:none !important;}
  .printable{display:block !important;padding:14mm 14mm;}
  .printable, .printable *{font-family:Calibri,Candara,"Segoe UI","Helvetica Neue",Arial,sans-serif !important;}
  .ctc-root{background:#fff;max-width:none;}
  @page{margin:0;}
  .p-head{display:flex;align-items:center;gap:12px;border-bottom:3px solid ${C.burgundy};padding-bottom:10px;margin-bottom:14px;}
  .p-mark{width:28px;height:28px;color:${C.burgundy};flex:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .p-title{font-size:20px;font-weight:900;color:${C.burgundyDark};letter-spacing:.04em;}
  .p-sub{font-size:11px;color:${C.grey};font-weight:600;}
  .p-date{margin-left:auto;text-align:right;font-size:10px;color:${C.cool};}
  .p-table{width:100%;border-collapse:collapse;font-size:10px;color:${C.body};}
  .p-table th{background:${C.burgundy};color:#fff;text-align:left;padding:6px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.03em;}
  .p-table td{border-bottom:1px solid ${C.line};padding:6px 7px;vertical-align:top;}
  .p-table tr:nth-child(even) td{background:${C.fill};}
  .p-note{color:${C.grey};font-size:9px;margin-top:2px;}
  .p-foot{margin-top:14px;font-size:9px;color:${C.cool};text-align:right;}
}
`;
