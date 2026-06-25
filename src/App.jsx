import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
  User, Building2, Printer, FileSpreadsheet, Check, Pencil, X, Square, CheckSquare,
  Bell, Settings, Search, ExternalLink, Repeat, Download, Upload, Database, Plus, Mail, Phone,
  MessageSquare, ChevronUp, ChevronDown, Plane,
} from "lucide-react";

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
  hoch: { label: "Hoch", color: C.burgundy, rank: 0 },
  mittel: { label: "Mittel", color: C.sky, rank: 1 },
  niedrig: { label: "Niedrig", color: C.cool, rank: 2 },
};
const STATUS = {
  "": { label: "", color: C.cool },
  offen: { label: "Offen", color: C.cool },
  inArbeit: { label: "In Arbeit", color: C.sky },
  onHold: { label: "On Hold", color: C.burgundyLight },
  erledigt: { label: "Erledigt", color: C.burgundyDark },
};
const RECUR = { none: "Keine", weekly: "Wöchentlich", monthly: "Monatlich", quarterly: "Quartalsweise", yearly: "Jährlich" };
const ESC = { "": "", ja: "Ja", nein: "Nein" };
const LEADS = [
  { v: 0, label: "Am Fälligkeitstag" }, { v: 1, label: "1 Tag vorher" }, { v: 3, label: "3 Tage vorher" },
  { v: 7, label: "1 Woche vorher" }, { v: 14, label: "2 Wochen vorher" },
];
const SCOPES = {
  personal: { key: "tasks-personal", shared: false, label: "Aufgaben" },
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
    escalation: t.escalation || "", updatedAt: t.updatedAt || "", start: t.start || "",
  };
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
  return new Date(due + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "short" });
}
function relLabel(due) {
  const d = dayDiff(due);
  if (d === null) return "";
  if (d < -1) return `${Math.abs(d)} Tage überfällig`;
  if (d === -1) return "Gestern fällig"; if (d === 0) return "Heute fällig"; if (d === 1) return "Morgen fällig";
  return `in ${d} Tagen`;
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
const dt = (iso) => (iso ? new Date(iso).toLocaleDateString("de-DE") : "");
const fmtDay = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("de-DE") : "");
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

// ===========================================================================
export default function App() {
  const [tasks, setTasks] = useState({ personal: [] });
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [companies, setCompanies] = useState(DEFAULT_COMPANIES);
  const [persons, setPersons] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [remoteTick, setRemoteTick] = useState(0);
  const [view, setView] = useState("all");
  const [returnView, setReturnView] = useState("all"); // wohin nach dem Bearbeiten zurück
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open");
  const [filterCompany, setFilterCompany] = useState("all");
  const [filterContact, setFilterContact] = useState("all");
  const [sortBy, setSortBy] = useState("due");
  const [groupByCat, setGroupByCat] = useState(false);
  const [editId, setEditId] = useState(null);
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
  const [bulkText, setBulkText] = useState("");
  const [bulkCat, setBulkCat] = useState("");
  const [pendingRestore, setPendingRestore] = useState(null);
  // Persons
  const [pForm, setPForm] = useState({ name: "", company: "", role: "", email: "", phone: "", topics: [], notes: "" });
  const [pEditId, setPEditId] = useState(null);
  const [pSearch, setPSearch] = useState("");
  const [pFilterTopic, setPFilterTopic] = useState("all");
  const [expandedPerson, setExpandedPerson] = useState(null);

  const formRef = useRef(null);

  const blank = { title: "", notes: "", category: "", priority: "", status: "offen", start: "", due: "", remindLead: 3, contact: "", company: "", link: "", recurrence: "none", escalation: "", updatedAt: new Date().toISOString().slice(0, 10), scope: "personal" };
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

  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Mulish:wght@400;500;600;700;800;900&display=swap";
    document.head.appendChild(l);
    return () => { try { document.head.removeChild(l); } catch {} };
  }, []);

  useEffect(() => {
    if (printNonce > 0) {
      const t = setTimeout(() => window.print(), 60);
      return () => clearTimeout(t);
    }
  }, [printNonce]);

  function flash(msg) { setToast(msg); clearTimeout(flash._t); flash._t = setTimeout(() => setToast(null), 2600); }
  async function persist(scope, arr) {
    setTasks((prev) => ({ ...prev, [scope]: arr }));
    try { await saveScope(scope, arr); } catch { flash("Speichern fehlgeschlagen – bitte erneut versuchen."); }
  }
  async function saveProfile(name) { setProfile(name); try { await window.storage.set("profile", JSON.stringify(name), false); } catch {} }
  async function persistCategories(arr) { try { await window.storage.set("categories", JSON.stringify(arr), true); } catch { flash("Speichern fehlgeschlagen."); } }
  async function persistCompanies(arr) { try { await window.storage.set("companies", JSON.stringify(arr), true); } catch { flash("Speichern fehlgeschlagen."); } }
  async function persistPersons(arr) { setPersons(arr); try { await window.storage.set("persons", JSON.stringify(arr), true); } catch { flash("Speichern fehlgeschlagen."); } }

  function addCategory() {
    const name = newCat.trim();
    if (!name) return;
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) { flash("Bereich existiert bereits."); return; }
    const next = [...categories, name]; setCategories(next); persistCategories(next); setNewCat(""); flash("Bereich hinzugefügt.");
  }
  function deleteCategory(name) {
    const next = categories.filter((c) => c !== name); setCategories(next); persistCategories(next);
    if (filterCat === name) setFilterCat("all");
    if (form.category === name) setForm((f) => ({ ...f, category: "" }));
    flash("Bereich gelöscht.");
  }
  function addCompany() {
    const name = newCompany.trim();
    if (!name) return;
    if (companies.some((c) => c.toLowerCase() === name.toLowerCase())) { flash("Company existiert bereits."); return; }
    const next = [...companies, name]; setCompanies(next); persistCompanies(next); setNewCompany(""); flash("Company hinzugefügt.");
  }
  function deleteCompany(name) {
    const next = companies.filter((c) => c !== name); setCompanies(next); persistCompanies(next);
    if (filterCompany === name) setFilterCompany("all");
    if (form.company === name) setForm((f) => ({ ...f, company: "" }));
    flash("Company gelöscht.");
  }

  function onContactChange(val) {
    const match = persons.find((p) => p.name.toLowerCase() === val.trim().toLowerCase());
    setForm((f) => ({ ...f, contact: val, company: match && match.company ? match.company : f.company }));
  }

  function submit() {
    const title = form.title.trim();
    if (!title) { flash("Bitte einen Titel eingeben."); return; }
    if (editId) {
      const scope = editScope;
      const arr = tasks[scope].map((x) => x.id === editId ? {
        ...x, title, notes: form.notes.trim(), category: form.category, priority: form.priority, status: form.status,
        start: form.start, due: form.due, remindLead: Number(form.remindLead), contact: form.contact.trim(), company: form.company.trim(),
        link: form.link.trim(), recurrence: form.recurrence, escalation: form.escalation, updatedAt: new Date().toISOString().slice(0, 10),
        completedAt: form.status === "erledigt" ? (x.completedAt || new Date().toISOString()) : null,
      } : x);
      persist(scope, arr); flash("Aufgabe aktualisiert."); cancelEdit();
    } else {
      const scope = form.scope;
      const task = normalizeTask({
        id: uid(), title, notes: form.notes.trim(), category: form.category, priority: form.priority, status: form.status,
        start: form.start, due: form.due, remindLead: Number(form.remindLead), contact: form.contact.trim(), company: form.company.trim(),
        link: form.link.trim(), recurrence: form.recurrence, escalation: form.escalation, updatedAt: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        createdBy: "", completedAt: form.status === "erledigt" ? new Date().toISOString() : null,
      });
      persist(scope, [task, ...tasks[scope]]);
      flash("Aufgabe hinzugefügt.");
      setForm({ ...blank, scope, category: form.category, company: form.company });
    }
  }
  function changeStatus(scope, id, newStatus) {
    const t = tasks[scope].find((x) => x.id === id);
    if (!t) return;
    const willDone = newStatus === "erledigt";
    let arr = tasks[scope].map((x) => x.id === id ? {
      ...x, status: newStatus, updatedAt: new Date().toISOString().slice(0, 10),
      completedAt: willDone ? (x.completedAt || new Date().toISOString()) : null,
      completedBy: willDone ? profile || "" : "",
    } : x);
    if (willDone && !isDone(t) && t.recurrence && t.recurrence !== "none" && t.due) {
      const nd = shiftDate(t.due, t.recurrence);
      if (nd) {
        const next = normalizeTask({ ...t, id: uid(), status: "offen", due: nd, completedAt: null, completedBy: "", createdAt: new Date().toISOString() });
        arr = [next, ...arr]; flash("Folgetermin angelegt: " + fmtDate(nd));
      }
    }
    persist(scope, arr);
  }
  function del(scope, id) {
    persist(scope, tasks[scope].filter((x) => x.id !== id));
    setConfirmDel(null);
    setSelected((s) => { const n = new Set(s); n.delete(scope + ":" + id); return n; });
    flash("Aufgabe gelöscht.");
  }
  function startEdit(scope, t) {
    setEditId(t.id); setEditScope(scope);
    setForm({
      title: t.title, notes: t.notes || "", category: t.category || "", priority: t.priority, status: t.status || "offen",
      start: t.start || "", due: t.due || "", remindLead: t.remindLead ?? 3, contact: t.contact || "", company: t.company || "",
      link: t.link || "", recurrence: t.recurrence || "none", escalation: t.escalation || "", updatedAt: t.updatedAt || "", scope,
    });
    setReturnView(isTaskView ? view : "all"); // aktuelle Liste merken
    setView("new");                            // ins Formular wechseln
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function cancelEdit() { setEditId(null); setEditScope(null); setForm(blank); setView(returnView); }

  // Persons handlers
  function submitPerson() {
    const name = pForm.name.trim();
    if (!name) { flash("Bitte einen Namen eingeben."); return; }
    if (pEditId) {
      persistPersons(persons.map((p) => p.id === pEditId ? { ...p, ...pForm, name, topics: pForm.topics } : p));
      flash("Person aktualisiert.");
    } else {
      persistPersons([{ id: uid(), ...pForm, name }, ...persons]);
      flash("Person hinzugefügt.");
    }
    cancelPerson();
  }
  function editPerson(p) {
    setPEditId(p.id);
    setPForm({ name: p.name, company: p.company || "", role: p.role || "", email: p.email || "", phone: p.phone || "", topics: p.topics || [], notes: p.notes || "" });
  }
  function deletePerson(id) { persistPersons(persons.filter((p) => p.id !== id)); if (pEditId === id) cancelPerson(); flash("Person gelöscht."); }
  function cancelPerson() { setPEditId(null); setPForm({ name: "", company: "", role: "", email: "", phone: "", topics: [], notes: "" }); }
  function togglePTopic(c) { setPForm((f) => ({ ...f, topics: f.topics.includes(c) ? f.topics.filter((x) => x !== c) : [...f.topics, c] })); }

  // Daten
  function doBackup() {
    const payload = { app: "TO DO APP", version: 2, exportedAt: new Date().toISOString(), categories, companies, persons, tasks: { personal: tasks.personal } };
    downloadBlob(JSON.stringify(payload, null, 2), `TODO_Sicherung_${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    flash("Sicherung erstellt.");
  }
  function onRestoreFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    f.text().then((txt) => { try { setPendingRestore(JSON.parse(txt)); } catch { flash("Datei nicht lesbar."); } });
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
      flash("Sicherung wiederhergestellt.");
    } catch { flash("Wiederherstellung teilweise fehlgeschlagen."); }
    setPendingRestore(null);
  }
  function doBulkAdd() {
    const lines = bulkText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!lines.length) { flash("Keine Zeilen erkannt."); return; }
    const scope = "personal";
    const news = lines.map((title) => normalizeTask({
      id: uid(), title, category: bulkCat, priority: "", status: "offen", due: "", remindLead: 3,
      escalation: "", updatedAt: new Date().toISOString().slice(0, 10),
      contact: "", company: "", link: "", recurrence: "none", createdAt: new Date().toISOString(),
      createdBy: "",
    }));
    persist(scope, [...news, ...tasks[scope]]);
    setBulkText(""); flash(lines.length + " Aufgaben hinzugefügt.");
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
  list.sort((a, b) => {
    if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
    if (sortBy === "prio") return (PRIORITIES[a.priority] || PRIORITIES[""]).rank - (PRIORITIES[b.priority] || PRIORITIES[""]).rank;
    if (sortBy === "created") return (b.createdAt || "").localeCompare(a.createdAt || "");
    if (sortBy === "company") return (a.company || "\uffff").localeCompare(b.company || "\uffff", "de");
    if (sortBy === "contact") return (a.contact || "\uffff").localeCompare(b.contact || "\uffff", "de");
    const da = a.due ? dayDiff(a.due) : Infinity; const db = b.due ? dayDiff(b.due) : Infinity;
    return da - db;
  });

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
  const openCount = taskViewPool.filter((t) => !isDone(t)).length;
  const doneCount = taskViewPool.filter((t) => isDone(t)).length;

  const selectedItems = merged.filter((t) => selected.has(keyOf(t)));
  const expList = merged
    .filter((t) => (expStatus === "open" ? !isDone(t) : expStatus === "erledigt" ? isDone(t) : true))
    .sort((a, b) => { const da = a.due ? dayDiff(a.due) : Infinity; const db = b.due ? dayDiff(b.due) : Infinity; return da - db; });
  const expAllSelected = expList.length > 0 && expList.every((t) => selected.has(keyOf(t)));
  const expLabel = selectedItems.length ? `${selectedItems.length} ausgewählt` : `alle ${expList.length}`;

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
    if (!target.length) { flash("Keine Aufgaben zum Export."); return; }
    setPrintKind("tasks"); setPrintItems(target); setPrintNonce((n) => n + 1);
  }
  function doExcel(fallback) {
    const target = selectedItems.length ? selectedItems : fallback;
    if (!target.length) { flash("Keine Aufgaben zum Export."); return; }
    const rows = target.map((t) => ({
      Titel: t.title, Bereich: catDisplay(t.category), Priorität: (PRIORITIES[t.priority] || PRIORITIES[""]).label,
      Status: STATUS[t.status] ? STATUS[t.status].label : "Offen",
      Eskalation: ESC[t.escalation] || "", "Letztes Update": fmtDay(t.updatedAt),
      Startdatum: t.start ? dt(t.start + "T00:00:00") : "",
      "Fällig am": t.due ? dt(t.due + "T00:00:00") : "", Erinnerung: t.due ? leadLabel(t.remindLead) : "",
      Wiederholung: RECUR[t.recurrence] || "Keine", Ansprechperson: t.contact || "", Company: t.company || "",
      Referenz: t.link || "", Notiz: t.notes || "",
      Verlauf: (t.log || []).map((e) => `${dt(e.date)}${e.by ? " " + e.by : ""}: ${e.text}`).join(" | "),
      "Erstellt am": dt(t.createdAt), "Erledigt am": dt(t.completedAt),
    }));
    try {
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 34 }, { wch: 24 }, { wch: 9 }, { wch: 18 }, { wch: 11 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 15 }, { wch: 13 }, { wch: 18 }, { wch: 22 }, { wch: 30 }, { wch: 40 }, { wch: 50 }, { wch: 12 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "TO DO");
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      downloadBlob(out, `TODO_${new Date().toISOString().slice(0, 10)}.xlsx`, "application/octet-stream");
      flash("Excel-Datei erstellt.");
    } catch { flash("Excel-Export fehlgeschlagen."); }
  }
  function openTaskCount(name) {
    return merged.filter((t) => !isDone(t) && t.contact && t.contact.toLowerCase() === (name || "").toLowerCase()).length;
  }
  function doPrintPersons(items) {
    if (!items.length) { flash("Keine Personen zum Export."); return; }
    setPrintKind("persons"); setPrintPersons(items); setPrintNonce((n) => n + 1);
  }
  function doExcelPersons(items) {
    if (!items.length) { flash("Keine Personen zum Export."); return; }
    const rows = items.map((p) => ({
      Name: p.name, "Funktion / Rolle": p.role || "", Company: p.company || "",
      "E-Mail": p.email || "", Telefon: p.phone || "", Themen: (p.topics || []).join(", "),
      Notiz: p.notes || "", "Offene Aufgaben": openTaskCount(p.name),
    }));
    try {
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 40 }, { wch: 40 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Personen");
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      downloadBlob(out, `Personen_${new Date().toISOString().slice(0, 10)}.xlsx`, "application/octet-stream");
      flash("Excel-Datei erstellt.");
    } catch { flash("Excel-Export fehlgeschlagen."); }
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
        <button className={"check" + (isDone(t) ? " on" : "")} style={isDone(t) ? { background: col, borderColor: col } : {}}
          onClick={() => changeStatus(t._scope, t.id, isDone(t) ? "offen" : "erledigt")} title={isDone(t) ? "Als offen markieren" : "Als erledigt markieren"}>
          {isDone(t) ? <Check size={14} strokeWidth={3} /> : null}
        </button>
        <div className="task-body">
          <div className="task-title">{t.title}{t.recurrence !== "none" && <Repeat size={13} className="rep" />}</div>
          {t.notes && <div className="task-notes">{t.notes}</div>}
          {t.link && <a className="task-link" href={normalizeUrl(t.link)} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Referenz</a>}
          <div className="task-meta">
            {catName && <span className="badge" style={{ color: col, borderColor: col }}>{catName}</span>}
            {t.escalation === "ja" && <span className="esc-badge">Eskalation</span>}
            <select className="status-sel" value={t.status} style={{ color: st.color, borderColor: st.color }}
              onChange={(e) => changeStatus(t._scope, t.id, e.target.value)}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {t.priority && <span className="dot" style={{ background: PRIORITIES[t.priority].color }} />}
            {t.priority && <span className="prio-label">{PRIORITIES[t.priority].label}</span>}
            {t.start && <span className="due muted">Start: {fmtDate(t.start)}</span>}
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
              {t.updatedAt && <span className="upd">Akt. {fmtDay(t.updatedAt)}</span>}
            </div>
          )}
          {(() => {
            const k = keyOf(t);
            const open = expandedLogs.has(k);
            const n = (t.log || []).length;
            return (
              <div className="log">
                <button className="log-toggle" onClick={() => toggleLog(k)}>
                  <MessageSquare size={12} /> Verlauf{n > 0 ? ` (${n})` : ""} {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {open && (
                  <div className="log-body">
                    {(t.log || []).slice().reverse().map((e) => (
                      <div key={e.id} className="log-entry">
                        <span className="log-date">{dt(e.date)}{e.by ? " · " + e.by : ""}</span>
                        <span className="log-text">{e.text}</span>
                        <button className="log-del" onClick={() => delLog(t._scope, t.id, e.id)} title="Eintrag löschen"><X size={12} /></button>
                      </div>
                    ))}
                    <div className="log-add">
                      <input value={logDrafts[k] || ""} placeholder="Nachfassen / Notiz mit Datum …"
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
          <button className="icon" onClick={() => startEdit(t._scope, t)} title="Bearbeiten"><Pencil size={15} /></button>
          {confirmDel === keyOf(t) ? (
            <button className="icon del-confirm" onClick={() => del(t._scope, t.id)}>Löschen?</button>
          ) : (
            <button className="icon" onClick={() => setConfirmDel(keyOf(t))} title="Löschen"><X size={16} /></button>
          )}
        </div>
      </li>
    );
  }

  // grouped
  let groupNames = [], groups = {};
  if (groupByCat) {
    list.forEach((t) => { const name = catDisplay(t.category) || "Ohne Bereich"; (groups[name] = groups[name] || []).push(t); });
    groupNames = Object.keys(groups).sort((a, b) => a === "Ohne Bereich" ? 1 : b === "Ohne Bereich" ? -1 : a.localeCompare(b, "de"));
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

  return (
    <div className="ctc-root">
      <style>{css}</style>

      <div className="screen">
        <header className="hd">
          <div className="hd-inner">
            <Plane className="hd-mark" strokeWidth={2.2} />
            <div><h1>TO DO APP</h1></div>
            <div className="hd-profile">
              <label>Dein Kürzel</label>
              <input value={profile} onChange={(e) => saveProfile(e.target.value)} placeholder="z. B. PB" maxLength={6} />
            </div>
          </div>
          <nav className="tabs">
            {["new", "all", "persons", "export"].map((v) => (
              <button key={v} className={"tab" + (view === v ? " on" : "")} onClick={() => setView(v)}>
                {v === "all" ? "Aufgaben" : v === "persons" ? "Persons" : v === "export" ? "Druck & Export" : "Neue Aufgabe"}
              </button>
            ))}
            {isTaskView && <span className="tab-count">{openCount} offen · {doneCount} erledigt</span>}
          </nav>
        </header>

        {isTaskView && (overdue.length || today.length || soon.length) > 0 && (
          <section className="band">
            {overdue.length > 0 && <ReminderGroup tone={C.burgundyDarker} label="Überfällig" items={overdue} />}
            {today.length > 0 && <ReminderGroup tone={C.burgundy} label="Heute fällig" items={today} />}
            {soon.length > 0 && <ReminderGroup tone={C.sky} label="Demnächst" items={soon} />}
          </section>
        )}

        {/* ===================== PERSONS ===================== */}
        {view === "persons" ? (
          <div className="grid">
            <aside className="panel">
              <div className="card">
                <h2>{pEditId ? "Person bearbeiten" : "Neue Ansprechperson"}</h2>
                <div className="field"><label>Name</label>
                  <input value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} placeholder="Vor- und Nachname" /></div>
                <div className="row2">
                  <div className="field"><label>Funktion / Rolle</label>
                    <input value={pForm.role} onChange={(e) => setPForm({ ...pForm, role: e.target.value })} placeholder="z. B. NPCT" /></div>
                  <div className="field">
                    <div className="label-row"><label>Company</label>
                      <button className="link sm" onClick={() => setCmgrOpen(true)}><Settings size={13} /> Verwalten</button></div>
                    <select value={pForm.company} onChange={(e) => setPForm({ ...pForm, company: e.target.value })}>
                      <option value=""></option>
                      {sortedCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select></div>
                </div>
                <div className="row2">
                  <div className="field"><label>E-Mail</label>
                    <input value={pForm.email} onChange={(e) => setPForm({ ...pForm, email: e.target.value })} placeholder="name@firma.com" /></div>
                  <div className="field"><label>Telefon</label>
                    <input value={pForm.phone} onChange={(e) => setPForm({ ...pForm, phone: e.target.value })} placeholder="+43 …" /></div>
                </div>
                <div className="field">
                  <div className="label-row"><label>Zuständige Themen / Bereiche</label>
                    <button className="link sm" onClick={() => setMgrOpen(true)}><Settings size={13} /> Verwalten</button></div>
                  <div className="chips">
                    {sortedCats.map((c) => (
                      <button key={c} className={"chip" + (pForm.topics.includes(c) ? " on" : "")}
                        style={pForm.topics.includes(c) ? { background: catColor(c), borderColor: catColor(c) } : {}}
                        onClick={() => togglePTopic(c)}>{c}</button>
                    ))}
                    {sortedCats.length === 0 && <span className="hint">Noch keine Bereiche angelegt.</span>}
                  </div>
                </div>
                <div className="field"><label>Notiz (optional)</label>
                  <textarea rows={2} value={pForm.notes} onChange={(e) => setPForm({ ...pForm, notes: e.target.value })} placeholder="Erreichbarkeit, Vertretung …" /></div>
                <div className="actions">
                  <button className="btn primary" onClick={submitPerson}>{pEditId ? "Aktualisieren" : "Hinzufügen"}</button>
                  {pEditId && <button className="btn ghost" onClick={cancelPerson}>Abbrechen</button>}
                </div>
                <p className="hint">Beim Anlegen einer Aufgabe schlägt das Feld „Ansprechperson" diese Namen vor.</p>
              </div>
            </aside>

            <main className="panel">
              <div className="toolbar">
                <div className="search"><Search size={15} />
                  <input value={pSearch} onChange={(e) => setPSearch(e.target.value)} placeholder="Person, Company, Thema suchen …" /></div>
                <div className="tb-group"><span>Thema</span>
                  <select value={pFilterTopic} onChange={(e) => setPFilterTopic(e.target.value)}>
                    <option value="all">Alle Themen</option>
                    {sortedCats.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="tb-export">
                  <button className="btn out" onClick={() => doPrintPersons(personsView)}><Printer size={15} /> Drucken / PDF</button>
                  <button className="btn out" onClick={() => doExcelPersons(personsView)}><FileSpreadsheet size={15} /> Excel</button>
                </div>
              </div>
              {persons.length === 0 && <div className="empty">Noch keine Ansprechpersonen. Links die erste anlegen.</div>}
              {persons.length > 0 && personsView.length === 0 && <div className="empty">Keine Treffer.</div>}
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
                          <button className="icon" onClick={() => editPerson(p)} title="Bearbeiten"><Pencil size={15} /></button>
                          <button className="icon" onClick={() => deletePerson(p.id)} title="Löschen"><X size={16} /></button>
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
                        {openTasks.length} offene Aufgabe(n) {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      {open && (
                        <div className="pdrill">
                          {pTasks.length === 0 && <div className="pdrill-empty">Keine Aufgaben zugeordnet.</div>}
                          {pTasks.sort((a, b) => (isDone(a) === isDone(b) ? 0 : isDone(a) ? 1 : -1)).map((t) => (
                            <div key={keyOf(t)} className={"pdrill-row" + (isDone(t) ? " done" : "")} style={{ borderLeftColor: companyColor(t.company) }}
                              onClick={() => startEdit(t._scope, t)} title="Zur Aufgabe">
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
            </main>
          </div>
        ) : view === "export" ? (
          /* ===================== DRUCK & EXPORT ===================== */
          <div className="exportwrap">
            <div className="card">
              <h2>Auswahl & Export</h2>
              <p className="hint">Einzelne Aufgaben anhaken – oder ohne Auswahl die gesamte gefilterte Liste exportieren. „Drucken / PDF" öffnet den Druckdialog; dort „Als PDF speichern" wählen.</p>
              <div className="exp-controls">
                <div className="tb-group"><span>Status</span>
                  <select value={expStatus} onChange={(e) => setExpStatus(e.target.value)}>
                    <option value="all">Alle</option><option value="open">Offen</option><option value="erledigt">Erledigt</option>
                  </select></div>
                <button className="link" onClick={() => selectAll(expList)} disabled={!expList.length}>
                  {expAllSelected ? <CheckSquare size={15} /> : <Square size={15} />} {expAllSelected ? "Auswahl aufheben" : "Alle auswählen"}
                </button>
                {selectedItems.length > 0 && <button className="link" onClick={() => setSelected(new Set())}>Auswahl leeren</button>}
                <div className="exp-actions">
                  <button className="btn out" onClick={() => doPrint(expList)}><Printer size={15} /> Drucken / PDF <em>({expLabel})</em></button>
                  <button className="btn out" onClick={() => doExcel(expList)}><FileSpreadsheet size={15} /> Excel <em>({expLabel})</em></button>
                </div>
              </div>
              {expList.length === 0 ? <div className="empty">Keine Aufgaben in dieser Auswahl.</div> : (
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
              <h2>Sicherung</h2>
              <p className="hint">Lädt alle Aufgaben, Bereiche und Personen als JSON-Datei. Empfohlen regelmäßig, da der App-Speicher nicht garantiert dauerhaft ist.</p>
              <div className="data-row">
                <button className="btn out" onClick={doBackup}><Download size={15} /> Sicherung herunterladen</button>
                <label className="btn out filelbl"><Upload size={15} /> Sicherung laden
                  <input type="file" accept="application/json,.json" onChange={onRestoreFile} hidden /></label>
              </div>
              {pendingRestore && (
                <div className="restore-confirm">Aktuelle Daten durch die geladene Sicherung ersetzen?
                  <div className="data-row">
                    <button className="btn primary" onClick={applyRestore}>Wiederherstellen</button>
                    <button className="btn ghost" onClick={() => setPendingRestore(null)}>Abbrechen</button>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <h2>Mehrere Aufgaben anlegen</h2>
              <p className="hint">Eine Aufgabe pro Zeile. Wird mit dem gewählten Bereich angelegt.</p>
              <div className="field"><label>Bereich</label>
                <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
                  <option value=""></option>{sortedCats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <textarea rows={5} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"OM-D Kapitel 5 prüfen\nStandardisierungsbriefing vorbereiten\n…"} />
              <div className="data-row"><button className="btn primary" onClick={doBulkAdd}><Plus size={15} /> Aufgaben hinzufügen</button></div>
            </div>
          </div>
        ) : view === "new" ? (
          /* ============ NEUE AUFGABE / BEARBEITEN ============ */
          <div className="formwrap" ref={formRef}>
              <div className="card">
                <h2>{editId ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</h2>
                <div className="field"><label>Titel</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Was ist zu tun?" /></div>
                <div className="field"><label>Notiz (optional)</label>
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Kontext, Referenz, nächster Schritt …" /></div>
                <div className="field">
                  <div className="label-row"><label>Bereich</label>
                    <button className="link sm" onClick={() => setMgrOpen(true)}><Settings size={13} /> Verwalten</button></div>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value=""></option>
                    {sortedCats.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="row2">
                  <div className="field"><label>Priorität</label>
                    <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                      {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                  <div className="field"><label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                </div>
                <div className="row2">
                  <div className="field"><label>Ansprechperson</label>
                    <input list="personnames" value={form.contact} onChange={(e) => onContactChange(e.target.value)} placeholder="Name / Funktion" />
                    <datalist id="personnames">{persons.map((p) => <option key={p.id} value={p.name} />)}</datalist></div>
                  <div className="field">
                    <div className="label-row"><label>Company</label>
                      <button className="link sm" onClick={() => setCmgrOpen(true)}><Settings size={13} /> Verwalten</button></div>
                    <select value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}>
                      <option value=""></option>
                      {sortedCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select></div>
                </div>
                <div className="field">
                  <div className="label-row"><label>Startdatum (optional)</label>
                    {form.start && <button type="button" className="link sm" onClick={() => setForm({ ...form, start: "" })}>Löschen</button>}</div>
                  <input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
                <div className="row2">
                  <div className="field">
                    <div className="label-row"><label>Fällig am (optional)</label>
                      {form.due && <button type="button" className="link sm" onClick={() => setForm({ ...form, due: "" })}>Löschen</button>}</div>
                    <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></div>
                  <div className="field"><label>Erinnerung</label>
                    <select value={form.remindLead} onChange={(e) => setForm({ ...form, remindLead: e.target.value })} disabled={!form.due}>
                      {LEADS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
                    </select></div>
                </div>
                <div className="field"><label>Wiederholung</label>
                  <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
                    {Object.entries(RECUR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                {editId ? (
                  <div className="row2">
                    <div className="field"><label>Eskalationsbedarf</label>
                      <select value={form.escalation} onChange={(e) => setForm({ ...form, escalation: e.target.value })}>
                        <option value=""></option><option value="ja">Ja</option><option value="nein">Nein</option>
                      </select></div>
                    <div className="field"><label>Letztes Update</label>
                      <div className="ro-field">{form.updatedAt ? fmtDay(form.updatedAt) : fmtDay(new Date().toISOString().slice(0, 10))}<span className="ro-hint">automatisch</span></div></div>
                  </div>
                ) : (
                  <div className="field"><label>Eskalationsbedarf</label>
                    <select value={form.escalation} onChange={(e) => setForm({ ...form, escalation: e.target.value })}>
                      <option value=""></option><option value="ja">Ja</option><option value="nein">Nein</option>
                    </select></div>
                )}
                <div className="field"><label>Referenz-Link (optional)</label>
                  <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https:// … (Reg, Drive-Dokument)" /></div>
                <div className="actions">
                  <button className="btn primary" onClick={submit}>{editId ? "Aktualisieren" : "Hinzufügen"}</button>
                  {editId && <button className="btn ghost" onClick={cancelEdit}>Abbrechen</button>}
                </div>
              </div>
          </div>
        ) : (
          /* ============ AUFGABEN-LISTE ============ */
          <div className="listwrap">
            <main className="panel">
              <div className="toolbar">
                <div className="tb-group"><span>Bereich</span>
                  <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
                    <option value="all">Alle Bereiche</option><option value="__none__">Ohne Bereich</option>
                    {sortedCats.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div className="tb-group"><span>Status</span>
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="open">Offen (alle)</option><option value="inArbeit">In Arbeit</option>
                    <option value="onHold">On Hold</option><option value="erledigt">Erledigt</option><option value="all">Alle</option>
                  </select></div>
                <div className="tb-group"><span>Company</span>
                  <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
                    <option value="all">Alle</option><option value="__none__">Ohne</option>
                    {sortedCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div className="tb-group"><span>Person</span>
                  <select value={filterContact} onChange={(e) => setFilterContact(e.target.value)}>
                    <option value="all">Alle</option><option value="__none__">Ohne</option>
                    {contactFilterOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div className="tb-group"><span>Sortieren</span>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="due">Fälligkeit</option><option value="prio">Priorität</option><option value="created">Neueste</option>
                    <option value="company">Company</option><option value="contact">Ansprechperson</option>
                  </select></div>
                <button className="link" onClick={() => setGroupByCat((g) => !g)}>
                  {groupByCat ? <CheckSquare size={15} /> : <Square size={15} />} Nach Bereich
                </button>
              </div>

              <div className="stats">
                <span className="stat"><b>{stat.offen}</b> Offen</span>
                <span className="stat"><b style={{ color: C.sky }}>{stat.inArbeit}</b> In Arbeit</span>
                <span className="stat"><b style={{ color: C.burgundyLight }}>{stat.onHold}</b> On Hold</span>
                <span className="stat"><b style={{ color: C.burgundyDark }}>{stat.erledigt}</b> Erledigt</span>
                {stat.overdue > 0 && <span className="stat overdue"><b>{stat.overdue}</b> überfällig</span>}
              </div>

              <div className="legend">
                {CONTEXT_COMPANIES.map((c) => (
                  <span key={c} className="legend-item"><i style={{ background: companyColor(c) }} /> {c}</span>
                ))}
                <span className="legend-item"><i style={{ background: companyColor("") }} /> Andere</span>
              </div>

              {!loaded && <div className="empty">Aufgaben werden geladen …</div>}
              {loaded && list.length === 0 && (
                <div className="empty">
                  {search ? "Keine Treffer." : filterStatus === "erledigt" ? "Noch nichts erledigt." : "Keine Aufgaben in dieser Ansicht. Über den Tab „Neue Aufgabe“ anlegen."}
                </div>
              )}

              {!groupByCat && <ul className="tasks">{list.map(renderTask)}</ul>}
              {groupByCat && groupNames.map((g) => (
                <div key={g} className="grp">
                  <div className="grp-head"><span>{g}</span><em>{groups[g].length}</em></div>
                  <ul className="tasks">{groups[g].map(renderTask)}</ul>
                </div>
              ))}

              <div className="search-bottom">
                <div className="search"><Search size={15} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Aufgaben durchsuchen …" />
                  {search && <button className="clear" onClick={() => setSearch("")}><X size={14} /></button>}
                </div>
              </div>
            </main>
          </div>
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>

      {/* Bereiche verwalten */}
      {mgrOpen && (
        <div className="modal-bg" onClick={() => setMgrOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Bereiche verwalten</h2>
              <button className="icon" onClick={() => setMgrOpen(false)}><X size={18} /></button></div>
            <p className="hint">Die Reihenfolge ist automatisch alphabetisch.</p>
            <div className="mgr-add">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} placeholder="Neuer Bereich …" />
              <button className="btn primary" onClick={addCategory}>Hinzufügen</button>
            </div>
            <ul className="mgr-list">
              {sortedCats.map((c) => (
                <li key={c}><span className="dot" style={{ background: catColor(c) }} />
                  <span className="mgr-name">{c}</span>
                  <button className="icon" onClick={() => deleteCategory(c)} title="Bereich löschen"><X size={15} /></button></li>
              ))}
              {sortedCats.length === 0 && <li className="mgr-empty">Noch keine Bereiche angelegt.</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Companies verwalten */}
      {cmgrOpen && (
        <div className="modal-bg" onClick={() => setCmgrOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Companies verwalten</h2>
              <button className="icon" onClick={() => setCmgrOpen(false)}><X size={18} /></button></div>
            <p className="hint">Die Reihenfolge ist automatisch alphabetisch.</p>
            <div className="mgr-add">
              <input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCompany()} placeholder="Neue Company …" />
              <button className="btn primary" onClick={addCompany}>Hinzufügen</button>
            </div>
            <ul className="mgr-list">
              {sortedCompanies.map((c) => (
                <li key={c}><Building2 size={15} style={{ color: C.cool, flex: "none" }} />
                  <span className="mgr-name">{c}</span>
                  <button className="icon" onClick={() => deleteCompany(c)} title="Company löschen"><X size={15} /></button></li>
              ))}
              {sortedCompanies.length === 0 && <li className="mgr-empty">Noch keine Companies angelegt.</li>}
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

function ReminderGroup({ tone, label, items }) {
  return (
    <div className="rgroup" style={{ borderTopColor: tone }}>
      <div className="rhead" style={{ color: tone }}>
        <span className="rcount" style={{ background: tone }}>{items.length}</span><Bell size={13} /> {label}
      </div>
      <ul>
        {items.slice(0, 4).map((t) => <li key={keyOf(t)}>{t.title}</li>)}
        {items.length > 4 && <li className="more">+{items.length - 4} weitere</li>}
      </ul>
    </div>
  );
}

function PrintDoc({ items }) {
  const now = new Date().toLocaleString("de-DE");
  return (
    <div className="printable">
      <div className="p-head">
        <Plane className="p-mark" strokeWidth={2.2} />
        <div className="p-titlewrap"><div className="p-title">TO DO APP</div></div>
        <div className="p-date">Erstellt: {now}<br />{items.length} Aufgabe(n)</div>
      </div>
      <table className="p-table">
        <thead><tr><th>Titel</th><th>Bereich</th><th>Prio</th><th>Status</th><th>Eskal.</th><th>Fällig</th><th>Ansprechperson</th><th>Company</th></tr></thead>
        <tbody>
          {items.map((t) => (
            <tr key={keyOf(t)}>
              <td><strong>{t.title}</strong>{t.notes ? <div className="p-note">{t.notes}</div> : null}
                {t.start && <div className="p-note">Start: {fmtDay(t.start)}</div>}
                {t.updatedAt && <div className="p-note">Letztes Update: {fmtDay(t.updatedAt)}</div>}
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
      <div className="p-foot">Zur internen Verwendung</div>
    </div>
  );
}

function PersonsPrintDoc({ items, openCount }) {
  const now = new Date().toLocaleString("de-DE");
  return (
    <div className="printable">
      <div className="p-head">
        <Plane className="p-mark" strokeWidth={2.2} />
        <div className="p-titlewrap"><div className="p-title">Ansprechpersonen</div></div>
        <div className="p-date">Erstellt: {now}<br />{items.length} Person(en)</div>
      </div>
      <table className="p-table">
        <thead><tr><th>Name</th><th>Funktion</th><th>Company</th><th>Themen</th><th>E-Mail</th><th>Telefon</th><th>Offen</th></tr></thead>
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
      <div className="p-foot">Zur internen Verwendung</div>
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
.hd-profile{margin-left:auto;text-align:right;}
.hd-profile label{display:block;color:rgba(255,255,255,.82);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;}
.hd-profile input{width:88px;text-align:center;border:none;border-radius:7px;padding:7px 8px;font-size:14px;font-weight:700;color:${C.burgundyDark};background:${C.white};}
.tabs{display:flex;align-items:center;gap:4px;padding:0 24px;background:${C.burgundyDark};}
.tab{background:transparent;border:none;color:rgba(255,255,255,.78);font-family:inherit;font-size:14px;font-weight:700;padding:13px 16px;cursor:pointer;border-bottom:3px solid transparent;transition:.15s;}
.tab:hover{color:${C.white};}
.tab.on{color:${C.white};border-bottom-color:${C.skyLight};}
.tab-count{margin-left:auto;color:rgba(255,255,255,.7);font-size:12px;font-weight:600;}

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
.seg-b{flex:1;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:9px;border-radius:8px;border:1px solid ${C.line};background:${C.white};color:${C.grey};}
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
.search-bottom{margin-top:18px;padding-top:14px;border-top:1px solid ${C.fill};display:flex;justify-content:center;}
.search-bottom .search{max-width:420px;width:100%;flex:none;}
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
@media print{
  .screen{display:none !important;}
  .printable{display:block !important;}
  .ctc-root{background:#fff;max-width:none;}
  @page{margin:14mm;}
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
