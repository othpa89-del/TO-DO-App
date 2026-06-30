import React, { useEffect, useMemo, useRef, useState } from "react";
import { L, useLang, getLang } from "./i18n.js";
import {
  Plane, Star, Archive, Search, Plus, X, Pencil, Printer, FileText, Download,
  Trash2, Check, Mic, Square as SquareIcon, Image as ImageIcon, Paperclip,
  ChevronDown, ChevronUp, Users, Bold, Italic, List, ListOrdered, CheckSquare, Link as LinkIcon, Settings,
} from "lucide-react";

// ===========================================================================
//  Meeting Minutes – professionelles Besprechungsprotokoll
// ===========================================================================
const C = {
  burgundy: "#AF1E65", burgundyDark: "#871C54", burgundyDarker: "#6E1444",
  ink: "#1f2937", body: "#374151", grey: "#4b5563", cool: "#9aa0a6",
  line: "#D7D7D7", fill: "#f1f3f5", panel: "#F8F9FA", white: "#fff",
  sky: "#2563eb", skyPale: "#eef4ff", green: "#1A7F45", amber: "#b7791f",
};

const MEETING_TYPES = ["Weekly", "Steering Committee", "Management Meeting", "Kick-Off", "Training", "Workshop", "Kundenmeeting", "Lieferantenmeeting", "Sonstiges"];
const MEETING_STATUS = ["Geplant", "Laufend", "Abgeschlossen", "Archiviert"];
const STATUS_COLOR = { Geplant: C.sky, Laufend: C.amber, Abgeschlossen: C.green, Archiviert: C.cool };
const DECISION_STATUS = ["Offen", "Beschlossen", "Umgesetzt", "Verworfen"];

// Anzeige-Labels für gespeicherte Status-Werte (gespeicherte value bleibt deutsch).
const statusLabel = (s) => ({
  Geplant: L("Geplant", "Planned"),
  Laufend: L("Laufend", "In progress"),
  Abgeschlossen: L("Abgeschlossen", "Completed"),
  Archiviert: L("Archiviert", "Archived"),
}[s] || s);
const decisionStatusLabel = (s) => ({
  Offen: L("Offen", "Open"),
  Beschlossen: L("Beschlossen", "Decided"),
  Umgesetzt: L("Umgesetzt", "Implemented"),
  Verworfen: L("Verworfen", "Rejected"),
}[s] || s);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDay = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(getLang() === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

export async function loadMeetings() {
  try { const r = await window.storage.get("meetings", true); return r && r.value ? JSON.parse(r.value) : []; }
  catch { return []; }
}
async function saveMeetings(arr) {
  try { await window.storage.set("meetings", JSON.stringify(arr), true); return true; } catch { return false; }
}
async function loadTypes() {
  try { const r = await window.storage.get("meetingTypes", true); const a = r && r.value ? JSON.parse(r.value) : null; return Array.isArray(a) && a.length ? a : MEETING_TYPES.slice(); }
  catch { return MEETING_TYPES.slice(); }
}
async function saveTypes(arr) { try { await window.storage.set("meetingTypes", JSON.stringify(arr), true); } catch {} }

function blankMeeting(profile) {
  return {
    id: uid(), favorite: false, archived: false,
    title: "", project: "", category: "", date: todayISO(), start: "", end: "",
    location: "", onlineLink: "", organizer: profile || "", recorder: profile || "",
    participants: [], absentees: [], type: "Weekly", status: "Geplant",
    agenda: [], decisions: [], actionItems: [], attachments: [], images: [], voice: [],
    openPoints: "", nextMeeting: { date: "", note: "" },
    createdAt: "", updatedAt: "",
  };
}

// --- Datei-Helfer -----------------------------------------------------------
function fileToDataUrl(file) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
}
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
function downloadFile(content, name, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function htmlToPlain(html) {
  if (!html) return "";
  let s = html
    .replace(/<\/(div|p|h[1-6])>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "\n• ").replace(/<\/li>/gi, "")
    .replace(/<input[^>]*type=["']?checkbox["']?[^>]*checked[^>]*>/gi, "[x] ")
    .replace(/<input[^>]*type=["']?checkbox["']?[^>]*>/gi, "[ ] ")
    .replace(/<[^>]+>/g, "");
  const ta = document.createElement("textarea"); ta.innerHTML = s;
  return ta.value.replace(/\n{3,}/g, "\n\n").trim();
}
// Entfernt potenziell gefährliches HTML vor dem Export/Druck (Self-XSS vermeiden)
function sanitizeHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*(iframe|object|embed|link|meta|style)[\s\S]*?>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "").replace(/\son\w+\s*=\s*'[^']*'/gi, "").replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

// --- Lightweight Rich-Text-Editor (contenteditable) -------------------------
function RichText({ value, onChange, placeholder }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.innerHTML = value || ""; /* nur initial setzen */ }, []);
  const sync = () => ref.current && onChange(ref.current.innerHTML);
  const exec = (cmd, arg) => { document.execCommand(cmd, false, arg); sync(); ref.current && ref.current.focus(); };
  const insert = (html) => { document.execCommand("insertHTML", false, html); sync(); };
  const addLink = () => { const url = prompt(L("Link-URL:", "Link URL:")); if (url) exec("createLink", /^https?:/.test(url) ? url : "https://" + url); };
  const addCheckbox = () => insert('<label class="mm-cb"><input type="checkbox"> </label>&nbsp;');
  const addTable = () => insert('<table class="mm-tbl"><tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><div><br></div>');
  const B = ({ cmd, arg, on, title, children }) => (
    <button type="button" title={title} className="mm-rtb" onMouseDown={(e) => { e.preventDefault(); on ? on() : exec(cmd, arg); }}>{children}</button>
  );
  return (
    <div className="mm-rt">
      <div className="mm-rtbar">
        <B cmd="bold" title={L("Fett", "Bold")}><Bold size={13} /></B>
        <B cmd="italic" title={L("Kursiv", "Italic")}><Italic size={13} /></B>
        <B cmd="insertUnorderedList" title={L("Liste", "List")}><List size={13} /></B>
        <B cmd="insertOrderedList" title={L("Nummerierung", "Numbering")}><ListOrdered size={13} /></B>
        <B on={addCheckbox} title={L("Checkbox", "Checkbox")}><CheckSquare size={13} /></B>
        <B on={addLink} title={L("Link", "Link")}><LinkIcon size={13} /></B>
        <B on={addTable} title={L("Tabelle", "Table")}>▦</B>
      </div>
      <div className="mm-rtarea" ref={ref} contentEditable suppressContentEditableWarning
        data-ph={placeholder || ""} onInput={sync} onBlur={sync} />
    </div>
  );
}

// ===========================================================================
export default function Meetings({ persons = [], categories = [], profile = "", onCreateTask, companyColor, onMeetingsChange }) {
  useLang();
  const [meetings, setMeetings] = useState([]);
  const [types, setTypes] = useState(MEETING_TYPES);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const [favOnly, setFavOnly] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [layout, setLayout] = useState("list");
  const [toast, setToast] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [mgrOpen, setMgrOpen] = useState(false);

  useEffect(() => {
    let on = true;
    loadMeetings().then((m) => { if (on) { setMeetings(m); setLoaded(true); if (onMeetingsChange) onMeetingsChange(m); } });
    loadTypes().then((t) => on && setTypes(t));
    const h = () => { loadMeetings().then((m) => { if (on) { setMeetings(m); if (onMeetingsChange) onMeetingsChange(m); } }); loadTypes().then((t) => on && setTypes(t)); };
    window.addEventListener("ctc:remote", h);
    return () => { on = false; window.removeEventListener("ctc:remote", h); };
  }, []);

  function persistTypes(next) { setTypes(next); saveTypes(next); }

  function flash(m) { setToast(m); clearTimeout(flash._t); flash._t = setTimeout(() => setToast(""), 2600); }
  // Funktionaler Updater + Persistenz auf Basis des AKTUELLEN States (race-sicher);
  // Speicher-Fehler werden gemeldet statt still verschluckt (z. B. zu große Anhänge).
  function mutate(fn) {
    setMeetings((prev) => {
      const next = fn(prev);
      saveMeetings(next).then((ok) => { if (!ok) flash(L("Speichern fehlgeschlagen – evtl. zu große Anhänge.", "Save failed – attachments may be too large.")); });
      if (onMeetingsChange) onMeetingsChange(next); // Export-Tab (App) live aktuell halten
      return next;
    });
  }
  function saveMeeting(m) {
    const now = new Date().toISOString();
    mutate((prev) => {
      const exists = prev.some((x) => x.id === m.id);
      const updated = { ...m, archived: m.status === "Archiviert" ? true : m.archived, updatedAt: now };
      return exists ? prev.map((x) => (x.id === m.id ? updated : x)) : [{ ...updated, createdAt: now }, ...prev];
    });
    setEditing(null); flash(L("Meeting gespeichert.", "Meeting saved."));
  }
  function removeMeeting(id) { mutate((prev) => prev.filter((x) => x.id !== id)); setConfirmDel(null); flash(L("Meeting gelöscht.", "Meeting deleted.")); }
  function toggleFav(id) { mutate((prev) => prev.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x))); }
  function toggleArchive(id) { mutate((prev) => prev.map((x) => (x.id === id ? { ...x, archived: !x.archived } : x))); }

  const filtered = useMemo(() => {
    let arr = meetings.filter((m) => !!m.archived === showArchive);
    if (favOnly) arr = arr.filter((m) => m.favorite);
    if (fType !== "all") arr = arr.filter((m) => m.type === fType);
    if (fStatus !== "all") arr = arr.filter((m) => m.status === fStatus);
    if (fFrom) arr = arr.filter((m) => (m.date || "") >= fFrom);
    if (fTo) arr = arr.filter((m) => (m.date || "") <= fTo);
    const q = search.trim().toLowerCase();
    if (q) arr = arr.filter((m) => [m.title, m.project, m.category, m.location, m.organizer,
      (m.participants || []).map((p) => p.name).join(" "), (m.agenda || []).map((a) => a.title).join(" ")]
      .join(" ").toLowerCase().includes(q));
    const dir = sortDir === "asc" ? 1 : -1;
    return arr.slice().sort((a, b) => dir * ((a.date || "").localeCompare(b.date || "") || (a.createdAt || "").localeCompare(b.createdAt || "")));
  }, [meetings, showArchive, favOnly, fType, fStatus, fFrom, fTo, sortDir, search]);

  return (
    <div className="mm-root">
      <style>{css}</style>
      {mgrOpen && <TypeManager types={types} onChange={persistTypes} onClose={() => setMgrOpen(false)} />}
      {editing ? (
        <MeetingEditor meeting={editing} persons={persons} categories={categories} profile={profile}
          types={types} onManageTypes={() => setMgrOpen(true)}
          companyColor={companyColor} onCreateTask={onCreateTask} flash={flash}
          onSave={saveMeeting} onCancel={() => setEditing(null)} />
      ) : (
      <div className="mm-wrap">
        <div className="mm-head">
          <h2><Plane size={18} strokeWidth={2.2} /> Meeting Minutes</h2>
          <button className="mm-btn primary" onClick={() => setEditing(blankMeeting(profile))}><Plus size={15} /> {L("Neues Meeting", "New meeting")}</button>
        </div>

        <div className="mm-controls">
          <div className="mm-search"><Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("Meeting, Projekt, Teilnehmer suchen …", "Search meeting, project, participant …")} />
            {search && <button className="mm-x" onClick={() => setSearch("")}><X size={14} /></button>}
          </div>
          <div className="mm-fg"><span>{L("Typ", "Type")}</span>
            <select value={fType} onChange={(e) => setFType(e.target.value)}>
              <option value="all">{L("Alle Typen", "All types")}</option>{types.slice().sort((a, b) => a.localeCompare(b, "de")).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="mm-gear" onClick={() => setMgrOpen(true)} title={L("Typen verwalten", "Manage types")}><Settings size={13} /></button>
          </div>
          <div className="mm-fg"><span>{L("Status", "Status")}</span>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="all">{L("Alle Status", "All statuses")}</option>{MEETING_STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </div>
          <div className="mm-fg"><span>{L("Von", "From")}</span><input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} /></div>
          <div className="mm-fg"><span>{L("Bis", "To")}</span><input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} /></div>
          {(fFrom || fTo) && <button className="mm-x" onClick={() => { setFFrom(""); setFTo(""); }} title={L("Datumsfilter zurücksetzen", "Reset date filter")}><X size={14} /></button>}
          <div className="mm-fg"><span>{L("Sortieren", "Sort")}</span>
            <select value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
              <option value="desc">{L("Neueste zuerst", "Newest first")}</option><option value="asc">{L("Älteste zuerst", "Oldest first")}</option>
            </select>
          </div>
          <button className={"mm-toggle" + (favOnly ? " on" : "")} onClick={() => setFavOnly((v) => !v)}><Star size={14} /> {L("Favoriten", "Favorites")}</button>
          <button className={"mm-toggle" + (showArchive ? " on" : "")} onClick={() => setShowArchive((v) => !v)}><Archive size={14} /> {showArchive ? L("Archiv", "Archive") : L("Aktiv", "Active")}</button>
          <div className="mm-layout">
            <button className={layout === "list" ? "on" : ""} onClick={() => setLayout("list")} title={L("Liste", "List")}><List size={15} /> {L("Liste", "List")}</button>
            <button className={layout === "cards" ? "on" : ""} onClick={() => setLayout("cards")} title={L("Karten", "Cards")}><SquareIcon size={15} /> {L("Karten", "Cards")}</button>
          </div>
        </div>

        {!loaded && <div className="mm-empty">{L("Meetings werden geladen …", "Loading meetings …")}</div>}
        {loaded && filtered.length === 0 && (
          <div className="mm-empty">{search || favOnly || fType !== "all" || fStatus !== "all" ? L("Keine Treffer.", "No matches.") : showArchive ? L("Kein archiviertes Meeting.", "No archived meeting.") : L("Noch keine Meetings – oben „Neues Meeting“ anlegen.", "No meetings yet – create one with “New meeting” above.")}</div>
        )}

        <div className={layout === "cards" ? "mm-cards" : "mm-list"}>
          {filtered.map((m) => (
            <div key={m.id} className={"mm-item" + (layout === "cards" ? " card" : "")} style={{ borderLeftColor: STATUS_COLOR[m.status] || C.cool }}>
              <button className={"mm-star" + (m.favorite ? " on" : "")} onClick={() => toggleFav(m.id)} title={L("Favorit", "Favorite")}><Star size={16} /></button>
              <div className="mm-item-main" onClick={() => setEditing(m)}>
                <div className="mm-item-title">{m.title || L("(ohne Titel)", "(no title)")}</div>
                <div className="mm-item-meta">
                  <span>{fmtDay(m.date)}{m.start ? " · " + m.start : ""}</span>
                  <span className="mm-type">{m.type}</span>
                  <span className="mm-status" style={{ color: STATUS_COLOR[m.status] }}>{statusLabel(m.status)}</span>
                  {m.project && <span>· {m.project}</span>}
                </div>
                <div className="mm-item-sub">
                  <span><Users size={12} /> {(m.participants || []).length}</span>
                  {(m.agenda || []).length > 0 && <span>· {m.agenda.length} {L("Agenda", "Agenda")}</span>}
                  {(m.actionItems || []).length > 0 && <span>· {m.actionItems.length} {L("Aufgaben", "Tasks")}</span>}
                  {(m.attachments || []).length + (m.images || []).length > 0 && <span><Paperclip size={12} /> {(m.attachments || []).length + (m.images || []).length}</span>}
                </div>
              </div>
              <div className="mm-item-actions">
                <button className="mm-ic" onClick={() => setEditing(m)} title={L("Öffnen", "Open")}><Pencil size={15} /></button>
                <button className="mm-ic" onClick={() => toggleArchive(m.id)} title={m.archived ? L("Aus Archiv", "Unarchive") : L("Archivieren", "Archive")}><Archive size={15} /></button>
                {confirmDel === m.id ? (
                  <button className="mm-ic del" onClick={() => removeMeeting(m.id)}>{L("Löschen?", "Delete?")}</button>
                ) : (
                  <button className="mm-ic" onClick={() => setConfirmDel(m.id)} title={L("Löschen", "Delete")}><Trash2 size={15} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
      {toast && <div className="mm-toast">{toast}</div>}
    </div>
  );
}

// ===========================================================================
//  Editor
// ===========================================================================
function MeetingEditor({ meeting, persons, categories, profile, types = MEETING_TYPES, onManageTypes, companyColor, onCreateTask, onSave, onCancel, flash }) {
  useLang();
  const [m, setM] = useState(meeting);
  const [openAgenda, setOpenAgenda] = useState({});
  const [recording, setRecording] = useState(false);
  const recRef = useRef(null);
  const set = (k, v) => setM((p) => ({ ...p, [k]: v }));

  // ---- Teilnehmer ----
  function addParticipant(field, personId) {
    if (!personId) return;
    const p = persons.find((x) => x.id === personId); if (!p) return;
    if ((m[field] || []).some((x) => x.id === p.id)) return;
    const snap = { id: p.id, name: p.name, company: p.company || "", role: p.role || "", phone: p.phone || "", email: p.email || "" };
    set(field, [...(m[field] || []), snap]);
  }
  function removeParticipant(field, id) { set(field, (m[field] || []).filter((x) => x.id !== id)); }

  // ---- Agenda ----
  function addAgenda() {
    const item = { id: uid(), title: "", desc: "", done: false, notesHtml: "", decisions: "", discussion: "", risks: "", openQuestions: "" };
    set("agenda", [...(m.agenda || []), item]);
    setOpenAgenda((o) => ({ ...o, [item.id]: true }));
  }
  function updAgenda(id, patch) { set("agenda", (m.agenda || []).map((a) => (a.id === id ? { ...a, ...patch } : a))); }
  function delAgenda(id) { set("agenda", (m.agenda || []).filter((a) => a.id !== id)); }

  // ---- Decisions ----
  function addDecision() { set("decisions", [...(m.decisions || []), { id: uid(), title: "", desc: "", owner: "", date: todayISO(), status: "Offen" }]); }
  function updDecision(id, patch) { set("decisions", (m.decisions || []).map((d) => (d.id === id ? { ...d, ...patch } : d))); }
  function delDecision(id) { set("decisions", (m.decisions || []).filter((d) => d.id !== id)); }

  // ---- Action Items ----
  function addActionItem(text = "", fromTitle = "") {
    set("actionItems", [...(m.actionItems || []), { id: uid(), text: text || fromTitle, taskId: null }]);
  }
  function updActionItem(id, patch) { set("actionItems", (m.actionItems || []).map((a) => (a.id === id ? { ...a, ...patch } : a))); }
  function delActionItem(id) { set("actionItems", (m.actionItems || []).filter((a) => a.id !== id)); }
  function makeTask(item) {
    if (!item.text.trim()) { flash(L("Bitte zuerst einen Text eingeben.", "Please enter some text first.")); return; }
    if (!onCreateTask) return;
    const id = onCreateTask({ title: item.text.trim(), notes: L("Aus Meeting: ", "From meeting: ") + (m.title || fmtDay(m.date)) });
    updActionItem(item.id, { taskId: id || true });
    flash(L("Aufgabe erstellt.", "Task created."));
  }
  function taskFromAgenda(a) {
    if (!onCreateTask) return;
    const note = htmlToPlain(a.notesHtml);
    onCreateTask({ title: a.title || L("Agenda-Punkt", "Agenda item"), notes: (L("Aus Meeting: ", "From meeting: ") + (m.title || fmtDay(m.date)) + (note ? "\n" + note : "")).slice(0, 2000) });
    addActionItem(a.title);
    flash(L("Aufgabe aus Agenda-Punkt erstellt.", "Task created from agenda item."));
  }

  // ---- Dateien / Bilder / Audio ----
  async function onFiles(e) {
    const files = Array.from(e.target.files || []); e.target.value = "";
    let added = 0;
    for (const f of files) {
      if (f.size > 3 * 1024 * 1024) { flash(L(`„${f.name}“ > 3 MB – übersprungen.`, `“${f.name}” > 3 MB – skipped.`)); continue; }
      const dataUrl = await fileToDataUrl(f);
      setM((p) => ({ ...p, attachments: [...(p.attachments || []), { id: uid(), name: f.name, type: f.type, size: f.size, dataUrl }] }));
      added++;
    }
    if (added) flash(L(added + (added === 1 ? " Anhang" : " Anhänge") + " hinzugefügt.", added + (added === 1 ? " attachment" : " attachments") + " added."));
  }
  async function onImages(e) {
    const files = Array.from(e.target.files || []); e.target.value = "";
    let added = 0;
    for (const f of files) {
      const dataUrl = await compressImage(f);
      if (dataUrl) { setM((p) => ({ ...p, images: [...(p.images || []), { id: uid(), name: f.name, dataUrl }] })); added++; }
      else flash(L(`„${f.name}“ konnte nicht verarbeitet werden.`, `“${f.name}” could not be processed.`));
    }
    if (added) flash(L(added + (added === 1 ? " Bild" : " Bilder") + " gespeichert.", added + (added === 1 ? " image" : " images") + " saved."));
  }
  function removeAtt(field, id) { set(field, (m[field] || []).filter((x) => x.id !== id)); }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); const chunks = [];
      mr.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        if (blob.size > 3 * 1024 * 1024) { flash(L("Aufnahme > 3 MB – verworfen.", "Recording > 3 MB – discarded.")); }
        else { const dataUrl = await fileToDataUrl(blob); setM((p) => ({ ...p, voice: [...(p.voice || []), { id: uid(), name: L("Sprachmemo ", "Voice memo ") + new Date().toLocaleTimeString(getLang() === "en" ? "en-GB" : "de-DE"), dataUrl }] })); }
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start(); recRef.current = mr; setRecording(true);
    } catch { flash(L("Mikrofon nicht verfügbar.", "Microphone not available.")); }
  }
  function stopRec() { if (recRef.current) { recRef.current.stop(); setRecording(false); } }

  const sortedPersons = persons.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));

  return (
    <div className="mm-wrap mm-editor">
      <div className="mm-ehead">
        <button className="mm-btn ghost" onClick={onCancel}><X size={15} /> {L("Zurück", "Back")}</button>
        <div className="mm-ehead-title">{meeting.title || L("Neues Meeting", "New meeting")}</div>
        <div className="mm-ehead-actions">
          <button className="mm-btn ghost" onClick={() => set("favorite", !m.favorite)}><Star size={15} style={{ color: m.favorite ? C.burgundy : C.cool, fill: m.favorite ? C.burgundy : "none" }} /></button>
          <button className="mm-btn primary" onClick={() => onSave(m)}><Check size={15} /> {L("Speichern", "Save")}</button>
        </div>
      </div>

      {/* Allgemein */}
      <Section title={L("Allgemein", "General")}>
        <div className="mm-grid">
          <F label={L("Titel", "Title")} wide><input value={m.title} onChange={(e) => set("title", e.target.value)} placeholder={L("Meeting-Titel", "Meeting title")} /></F>
          <F label={L("Projekt", "Project")}><input value={m.project} onChange={(e) => set("project", e.target.value)} /></F>
          <F label={L("Kategorie", "Category")}>
            <input list="mm-cats" value={m.category} onChange={(e) => set("category", e.target.value)} />
            <datalist id="mm-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </F>
          <F label={L("Meeting-Typ", "Meeting type")} action={onManageTypes && <button type="button" className="mm-link" onClick={onManageTypes}><Settings size={12} /> {L("Verwalten", "Manage")}</button>}>
            <select value={m.type} onChange={(e) => set("type", e.target.value)}>
              {!types.includes(m.type) && m.type && <option value={m.type}>{m.type}</option>}
              {types.slice().sort((a, b) => a.localeCompare(b, "de")).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </F>
          <F label={L("Status", "Status")}><select value={m.status} onChange={(e) => set("status", e.target.value)}>{MEETING_STATUS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></F>
          <F label={L("Datum", "Date")}><input type="date" value={m.date} onChange={(e) => set("date", e.target.value)} /></F>
          <F label={L("Beginn", "Start")}><input type="time" value={m.start} onChange={(e) => set("start", e.target.value)} /></F>
          <F label={L("Ende", "End")}><input type="time" value={m.end} onChange={(e) => set("end", e.target.value)} /></F>
          <F label={L("Ort", "Location")}><input value={m.location} onChange={(e) => set("location", e.target.value)} placeholder={L("Raum / Adresse", "Room / address")} /></F>
          <F label={L("Online-Link", "Online link")}><input value={m.onlineLink} onChange={(e) => set("onlineLink", e.target.value)} placeholder="https://…" /></F>
          <F label={L("Organisator", "Organizer")}><input list="mm-people" value={m.organizer} onChange={(e) => set("organizer", e.target.value)} placeholder={L("Kontakt wählen oder eintippen …", "Pick or type a contact …")} /></F>
          <F label={L("Protokollführer", "Minute taker")}><input list="mm-people" value={m.recorder} onChange={(e) => set("recorder", e.target.value)} placeholder={L("Kontakt wählen oder eintippen …", "Pick or type a contact …")} /></F>
        </div>
      </Section>

      {/* Teilnehmer */}
      <Section title={L("Teilnehmer", "Participants")}>
        <ParticipantPicker label={L("Teilnehmer", "Participants")} field="participants" list={m.participants} persons={sortedPersons}
          onAdd={addParticipant} onRemove={removeParticipant} companyColor={companyColor} />
        <ParticipantPicker label={L("Abwesend", "Absent")} field="absentees" list={m.absentees} persons={sortedPersons}
          onAdd={addParticipant} onRemove={removeParticipant} companyColor={companyColor} muted />
        {persons.length === 0 && <p className="mm-hint">{L("Noch keine Kontakte – lege im Tab „Persons“ Personen an, dann erscheinen sie hier.", "No contacts yet – add people in the “Persons” tab and they will appear here.")}</p>}
      </Section>

      {/* Agenda & Mitschrift */}
      <Section title={L("Agenda & Mitschrift", "Agenda & minutes")} action={<button className="mm-btn out" onClick={addAgenda}><Plus size={14} /> {L("Punkt", "Item")}</button>}>
        {(m.agenda || []).length === 0 && <p className="mm-hint">{L("Noch keine Agenda-Punkte.", "No agenda items yet.")}</p>}
        {(m.agenda || []).map((a, i) => {
          const open = openAgenda[a.id];
          return (
            <div key={a.id} className="mm-agenda">
              <div className="mm-agenda-head">
                <span className="mm-num">{i + 1}</span>
                <input className="mm-agenda-title" value={a.title} onChange={(e) => updAgenda(a.id, { title: e.target.value })} placeholder={L("Agenda-Punkt", "Agenda item")} />
                <label className="mm-done" title={L("Erledigt", "Done")}><input type="checkbox" checked={!!a.done} onChange={(e) => updAgenda(a.id, { done: e.target.checked })} /></label>
                <button className="mm-ic" onClick={() => setOpenAgenda((o) => ({ ...o, [a.id]: !o[a.id] }))}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                <button className="mm-ic" onClick={() => delAgenda(a.id)}><X size={16} /></button>
              </div>
              {open && (
                <div className="mm-agenda-body">
                  <F label={L("Beschreibung", "Description")}><textarea rows={2} value={a.desc} onChange={(e) => updAgenda(a.id, { desc: e.target.value })} /></F>
                  <div className="mm-sub">{L("Notizen", "Notes")}</div>
                  <RichText key={a.id + "-n"} value={a.notesHtml} onChange={(v) => updAgenda(a.id, { notesHtml: v })} placeholder={L("Mitschrift … (Fett, Kursiv, Listen, Checkboxen, Tabellen, Links)", "Minutes … (bold, italic, lists, checkboxes, tables, links)")} />
                  <div className="mm-grid2">
                    <F label={L("Entscheidungen", "Decisions")}><textarea rows={2} value={a.decisions} onChange={(e) => updAgenda(a.id, { decisions: e.target.value })} /></F>
                    <F label={L("Diskussion", "Discussion")}><textarea rows={2} value={a.discussion} onChange={(e) => updAgenda(a.id, { discussion: e.target.value })} /></F>
                    <F label={L("Risiken", "Risks")}><textarea rows={2} value={a.risks} onChange={(e) => updAgenda(a.id, { risks: e.target.value })} /></F>
                    <F label={L("Offene Fragen", "Open questions")}><textarea rows={2} value={a.openQuestions} onChange={(e) => updAgenda(a.id, { openQuestions: e.target.value })} /></F>
                  </div>
                  <button className="mm-btn out sm" onClick={() => taskFromAgenda(a)}><Plus size={13} /> {L("Aufgabe aus diesem Punkt", "Task from this item")}</button>
                </div>
              )}
            </div>
          );
        })}
      </Section>

      {/* Entscheidungen */}
      <Section title={L("Entscheidungen", "Decisions")} action={<button className="mm-btn out" onClick={addDecision}><Plus size={14} /> {L("Entscheidung", "Decision")}</button>}>
        {(m.decisions || []).length === 0 && <p className="mm-hint">{L("Noch keine Entscheidungen.", "No decisions yet.")}</p>}
        {(m.decisions || []).map((d) => (
          <div key={d.id} className="mm-row-card">
            <div className="mm-grid2">
              <F label={L("Titel", "Title")} wide><input value={d.title} onChange={(e) => updDecision(d.id, { title: e.target.value })} /></F>
              <F label={L("Verantwortlicher", "Responsible")}><input list="mm-people" value={d.owner} onChange={(e) => updDecision(d.id, { owner: e.target.value })} /></F>
              <F label={L("Datum", "Date")}><input type="date" value={d.date} onChange={(e) => updDecision(d.id, { date: e.target.value })} /></F>
              <F label={L("Status", "Status")}><select value={d.status} onChange={(e) => updDecision(d.id, { status: e.target.value })}>{DECISION_STATUS.map((s) => <option key={s} value={s}>{decisionStatusLabel(s)}</option>)}</select></F>
              <F label={L("Beschreibung", "Description")} wide><textarea rows={2} value={d.desc} onChange={(e) => updDecision(d.id, { desc: e.target.value })} /></F>
            </div>
            <button className="mm-ic abs" onClick={() => delDecision(d.id)}><X size={15} /></button>
          </div>
        ))}
        <datalist id="mm-people">{persons.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "de")).map((p) => <option key={p.id} value={p.name} />)}</datalist>
      </Section>

      {/* Action Items */}
      <Section title={L("Action Items (Aufgaben)", "Action items (tasks)")} action={<button className="mm-btn out" onClick={() => addActionItem()}><Plus size={14} /> {L("Item", "Item")}</button>}>
        {(m.actionItems || []).length === 0 && <p className="mm-hint">{L("Aus Notizen direkt Aufgaben erstellen.", "Create tasks directly from notes.")}</p>}
        {(m.actionItems || []).map((a) => (
          <div key={a.id} className="mm-action">
            <input value={a.text} onChange={(e) => updActionItem(a.id, { text: e.target.value })} placeholder={L("Was ist zu tun?", "What needs to be done?")} />
            {a.taskId ? <span className="mm-tag ok"><Check size={13} /> {L("Aufgabe", "Task")}</span>
              : <button className="mm-btn out sm" onClick={() => makeTask(a)}><Plus size={13} /> {L("Als Aufgabe", "As task")}</button>}
            <button className="mm-ic" onClick={() => delActionItem(a.id)}><X size={15} /></button>
          </div>
        ))}
      </Section>

      {/* Anhänge / Bilder / Sprachmemos */}
      <Section title={L("Anhänge, Bilder & Sprachmemos", "Attachments, images & voice memos")}>
        <div className="mm-attbar">
          <label className="mm-btn out"><Paperclip size={14} /> {L("Datei", "File")} <input type="file" hidden multiple onChange={onFiles} /></label>
          <label className="mm-btn out"><ImageIcon size={14} /> {L("Bild", "Image")} <input type="file" hidden accept="image/*" multiple onChange={onImages} /></label>
          {!recording ? <button className="mm-btn out" onClick={startRec}><Mic size={14} /> {L("Aufnehmen", "Record")}</button>
            : <button className="mm-btn rec" onClick={stopRec}><SquareIcon size={14} /> {L("Stop", "Stop")}</button>}
          <span className="mm-hint">{L("max. 3 MB pro Datei", "max. 3 MB per file")}</span>
        </div>
        {(m.images || []).length > 0 && (
          <div className="mm-thumbs">
            {m.images.map((img) => (
              <div key={img.id} className="mm-thumb">
                <img src={img.dataUrl} alt={img.name} />
                <button className="mm-ic" onClick={() => removeAtt("images", img.id)}><X size={13} /></button>
              </div>
            ))}
          </div>
        )}
        {(m.attachments || []).map((f) => (
          <div key={f.id} className="mm-file">
            <Paperclip size={13} /><a href={f.dataUrl} download={f.name}>{f.name}</a>
            <span className="mm-hint">{Math.round((f.size || 0) / 1024)} KB</span>
            <button className="mm-ic" onClick={() => removeAtt("attachments", f.id)}><X size={14} /></button>
          </div>
        ))}
        {(m.voice || []).map((v) => (
          <div key={v.id} className="mm-file">
            <Mic size={13} /><audio controls src={v.dataUrl} style={{ height: 30 }} />
            <button className="mm-ic" onClick={() => removeAtt("voice", v.id)}><X size={14} /></button>
          </div>
        ))}
      </Section>

      {/* Offene Punkte & nächstes Meeting */}
      <Section title={L("Offene Punkte & nächstes Meeting", "Open points & next meeting")}>
        <F label={L("Offene Punkte", "Open points")} wide><textarea rows={3} value={m.openPoints} onChange={(e) => set("openPoints", e.target.value)} placeholder={L("Themen, die offen bleiben …", "Topics that remain open …")} /></F>
        <div className="mm-grid2">
          <F label={L("Nächstes Meeting – Datum", "Next meeting – date")}><input type="date" value={m.nextMeeting?.date || ""} onChange={(e) => set("nextMeeting", { ...m.nextMeeting, date: e.target.value })} /></F>
          <F label={L("Notiz", "Note")}><input value={m.nextMeeting?.note || ""} onChange={(e) => set("nextMeeting", { ...m.nextMeeting, note: e.target.value })} /></F>
        </div>
      </Section>

      <p className="mm-hint">{L("Export & Druck (PDF, Word, Markdown, TXT) findest du gesammelt im Tab „Druck & Export\" – nach dem Speichern.", "Export & print (PDF, Word, Markdown, TXT) are bundled in the “Print & Export” tab – after saving.")}</p>

      <div className="mm-ebottom">
        <button className="mm-btn ghost" onClick={onCancel}>{L("Abbrechen", "Cancel")}</button>
        <button className="mm-btn primary" onClick={() => onSave(m)}><Check size={15} /> {L("Speichern", "Save")}</button>
      </div>
    </div>
  );
}

// --- kleine UI-Bausteine ----------------------------------------------------
function Section({ title, action, children }) {
  return (
    <div className="mm-section">
      <div className="mm-section-head"><h3>{title}</h3>{action}</div>
      <div className="mm-section-body">{children}</div>
    </div>
  );
}
function F({ label, wide, action, children }) {
  return (
    <div className={"mm-field" + (wide ? " wide" : "")}>
      <div className="mm-flabel"><label>{label}</label>{action}</div>
      {children}
    </div>
  );
}
function TypeManager({ types, onChange, onClose }) {
  useLang();
  const [val, setVal] = useState("");
  function add() {
    const t = val.trim(); if (!t) return;
    if (types.some((x) => x.toLowerCase() === t.toLowerCase())) { setVal(""); return; }
    onChange([...types, t]); setVal("");
  }
  return (
    <div className="mm-modal-bg" onClick={onClose}>
      <div className="mm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mm-modal-head"><h3>{L("Meeting-Typen verwalten", "Manage meeting types")}</h3><button className="mm-ic" onClick={onClose}><X size={18} /></button></div>
        <div className="mm-addrow">
          <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={L("Neuer Typ …", "New type …")} />
          <button className="mm-btn primary" onClick={add}><Plus size={14} /> {L("Hinzufügen", "Add")}</button>
        </div>
        <div className="mm-taglist">
          {types.slice().sort((a, b) => a.localeCompare(b, "de")).map((t) => (
            <span key={t} className="mm-tagchip">{t}<button onClick={() => onChange(types.filter((x) => x !== t))} title={L("Entfernen", "Remove")}><X size={13} /></button></span>
          ))}
          {types.length === 0 && <span className="mm-hint">{L("Keine Typen – füge oben einen hinzu.", "No types – add one above.")}</span>}
        </div>
        <p className="mm-hint">{L("Diese Typen erscheinen im Filter und beim Anlegen eines Meetings.", "These types appear in the filter and when creating a meeting.")}</p>
      </div>
    </div>
  );
}
function ParticipantPicker({ label, field, list = [], persons, onAdd, onRemove, companyColor, muted }) {
  return (
    <div className="mm-pp">
      <div className="mm-pp-head">
        <label>{label}</label>
        <select value="" onChange={(e) => { onAdd(field, e.target.value); e.target.value = ""; }}>
          <option value="">{L("+ hinzufügen …", "+ add …")}</option>
          {persons.map((p) => <option key={p.id} value={p.id}>{p.name}{p.company ? " · " + p.company : ""}</option>)}
        </select>
      </div>
      <div className="mm-chips">
        {list.map((p) => (
          <span key={p.id} className={"mm-pchip" + (muted ? " muted" : "")}>
            <b>{p.name}</b>
            {(p.role || p.company) && <em>{[p.role, p.company].filter(Boolean).join(" · ")}</em>}
            {(p.phone || p.email) && <i>{[p.phone, p.email].filter(Boolean).join(" · ")}</i>}
            <button onClick={() => onRemove(field, p.id)}><X size={12} /></button>
          </span>
        ))}
        {list.length === 0 && <span className="mm-hint">—</span>}
      </div>
    </div>
  );
}

// ===========================================================================
//  Export-Helfer
// ===========================================================================
function meetingMetaRows(m) {
  return [
    [L("Projekt", "Project"), m.project], [L("Kategorie", "Category"), m.category], [L("Typ", "Type"), m.type], [L("Status", "Status"), statusLabel(m.status)],
    [L("Datum", "Date"), fmtDay(m.date)], [L("Zeit", "Time"), [m.start, m.end].filter(Boolean).join(" – ")],
    [L("Ort", "Location"), m.location], [L("Online", "Online"), m.onlineLink],
    [L("Organisator", "Organizer"), m.organizer], [L("Protokollführer", "Minute taker"), m.recorder],
  ].filter((r) => r[1]);
}

// Teilnehmer-Schnappschüsse werden beim Hinzufügen gespeichert. Wird die
// Funktion/Firma einer Person erst SPÄTER im Kontakt ergänzt, fehlt sie im
// alten Schnappschuss. Vor dem Export füllen wir fehlende Felder aus der
// aktuellen Kontaktliste nach (per id, ersatzweise per Name).
export function enrichMeeting(m, persons = []) {
  if (!m) return m;
  const byId = {}, byName = {};
  persons.forEach((p) => { byId[p.id] = p; byName[(p.name || "").toLowerCase()] = p; });
  const fill = (p) => {
    const src = byId[p.id] || byName[(p.name || "").toLowerCase()];
    if (!src) return p;
    return {
      ...p,
      company: p.company || src.company || "",
      role: p.role || src.role || "",
      phone: p.phone || src.phone || "",
      email: p.email || src.email || "",
    };
  };
  return { ...m, participants: (m.participants || []).map(fill), absentees: (m.absentees || []).map(fill) };
}
export function meetingToMarkdown(m) {
  const LINES = [];
  LINES.push(`# ${L("Besprechungsprotokoll", "Meeting minutes")} – ${m.title || ""}`.trim(), "");
  meetingMetaRows(m).forEach(([k, v]) => LINES.push(`**${k}:** ${v}`));
  LINES.push("");
  if ((m.participants || []).length) { LINES.push(`## ${L("Teilnehmer", "Participants")}`); m.participants.forEach((p) => LINES.push(`- ${p.name}${p.company ? ` (${p.company})` : ""}${p.role ? `, ${p.role}` : ""}`)); LINES.push(""); }
  if ((m.absentees || []).length) { LINES.push(`## ${L("Abwesend", "Absent")}`); m.absentees.forEach((p) => LINES.push(`- ${p.name}`)); LINES.push(""); }
  if ((m.agenda || []).length) {
    LINES.push(`## ${L("Agenda & Mitschrift", "Agenda & minutes")}`);
    m.agenda.forEach((a, i) => {
      LINES.push(`### ${i + 1}. ${a.title || ""}${a.done ? " ✓" : ""}`);
      if (a.desc) LINES.push(a.desc);
      const notes = htmlToPlain(a.notesHtml); if (notes) LINES.push("", notes);
      [[L("Entscheidungen", "Decisions"), a.decisions], [L("Diskussion", "Discussion"), a.discussion], [L("Risiken", "Risks"), a.risks], [L("Offene Fragen", "Open questions"), a.openQuestions]]
        .filter((x) => x[1]).forEach(([k, v]) => LINES.push(`- **${k}:** ${v}`));
      LINES.push("");
    });
  }
  if ((m.decisions || []).length) { LINES.push(`## ${L("Entscheidungen", "Decisions")}`); m.decisions.forEach((d) => LINES.push(`- **${d.title}** (${decisionStatusLabel(d.status)}${d.owner ? ", " + d.owner : ""}${d.date ? ", " + fmtDay(d.date) : ""})${d.desc ? " – " + d.desc : ""}`)); LINES.push(""); }
  if ((m.actionItems || []).length) { LINES.push(`## ${L("Aufgaben", "Tasks")}`); m.actionItems.forEach((a) => LINES.push(`- [ ] ${a.text}`)); LINES.push(""); }
  if (m.openPoints) { LINES.push(`## ${L("Offene Punkte", "Open points")}`, m.openPoints, ""); }
  if (m.nextMeeting && (m.nextMeeting.date || m.nextMeeting.note)) LINES.push(`## ${L("Nächstes Meeting", "Next meeting")}`, `${fmtDay(m.nextMeeting.date)} ${m.nextMeeting.note || ""}`.trim(), "");
  if ((m.images || []).length) { LINES.push(`## ${L("Bilder", "Images")}`); m.images.forEach((im) => LINES.push(`- ${im.name || L("Bild", "Image")}`)); LINES.push(""); }
  if ((m.attachments || []).length) { LINES.push(`## ${L("Anlagen", "Attachments")}`); m.attachments.forEach((f) => LINES.push(`- ${f.name}`)); LINES.push(""); }
  if ((m.voice || []).length) { LINES.push(`## ${L("Sprachmemos", "Voice memos")}`); m.voice.forEach((v) => LINES.push(`- ${v.name}`)); LINES.push(""); }
  LINES.push("", "© Copyright by Patrick Thorn");
  return LINES.join("\n");
}
export function meetingToText(m) { return meetingToMarkdown(m).replace(/[#*>`]/g, "").replace(/\n{3,}/g, "\n\n").trim(); }

function meetingHTML(m, forWord) {
  const esc = (s) => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  const meta = meetingMetaRows(m).map(([k, v]) => {
    const isLink = /^https?:\/\//i.test(v || "");
    const cell = isLink ? `<a href="${esc(v)}">${esc(v)}</a>` : esc(v);
    return `<tr><td class="k">${esc(k)}</td><td>${cell}</td></tr>`;
  }).join("");
  const parts = (m.participants || []).map((p) => `<li><b>${esc(p.name)}</b>${p.company ? " – " + esc(p.company) : ""}${p.role ? ", " + esc(p.role) : ""}${p.phone ? " · " + esc(p.phone) : ""}${p.email ? " · " + esc(p.email) : ""}</li>`).join("");
  const absent = (m.absentees || []).map((p) => `<li>${esc(p.name)}</li>`).join("");
  const agenda = (m.agenda || []).map((a, i) => `
    <div class="ag"><h3>${i + 1}. ${esc(a.title)}${a.done ? " ✓" : ""}</h3>
    ${a.desc ? `<p class="muted">${esc(a.desc)}</p>` : ""}
    ${a.notesHtml ? `<div class="notes">${sanitizeHtml(a.notesHtml)}</div>` : ""}
    ${[[L("Entscheidungen", "Decisions"), a.decisions], [L("Diskussion", "Discussion"), a.discussion], [L("Risiken", "Risks"), a.risks], [L("Offene Fragen", "Open questions"), a.openQuestions]].filter((x) => x[1]).map(([k, v]) => `<p><b>${k}:</b> ${esc(v)}</p>`).join("")}
    </div>`).join("");
  const decisions = (m.decisions || []).map((d) => `<tr><td>${esc(d.title)}</td><td>${esc(d.owner)}</td><td>${esc(fmtDay(d.date))}</td><td>${esc(decisionStatusLabel(d.status))}</td></tr>`).join("");
  const actions = (m.actionItems || []).map((a) => `<li>☐ ${esc(a.text)}</li>`).join("");
  const imgs = (m.images || []).map((im) => `<a href="${im.dataUrl}" download="${esc(im.name) || "bild"}"><img class="ph" src="${im.dataUrl}" alt="${esc(im.name)}" /></a>`).join("");
  const att = (m.attachments || []).map((f) => `<li><a href="${f.dataUrl}" download="${esc(f.name) || "datei"}">${esc(f.name)}</a></li>`).join("");
  const voc = (m.voice || []).map((v) => `<li>${esc(v.name)}</li>`).join("");
  const style = `
    body{font-family:'Mulish',Arial,sans-serif;color:#1f2937;margin:0;padding:${forWord ? "28px 32px" : "14mm 16mm"};}
    .hd{display:flex;align-items:center;gap:14px;border-bottom:3px solid ${C.burgundy};padding-bottom:12px;margin-bottom:16px;}
    .logo{width:40px;height:40px;color:${C.burgundy};}
    .hd h1{font-size:22px;margin:0;color:${C.burgundyDark};letter-spacing:.02em;}
    .hd .sub{font-size:12px;color:#6b7280;}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:${C.burgundy};border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin:18px 0 8px;}
    h3{font-size:13px;margin:10px 0 4px;color:${C.ink};}
    table{border-collapse:collapse;width:100%;font-size:12px;margin:4px 0;}
    td,th{border:1px solid #e5e7eb;padding:5px 8px;text-align:left;vertical-align:top;}
    td.k{background:#f8f5f7;font-weight:700;width:160px;color:${C.grey};}
    ul{margin:4px 0;padding-left:18px;font-size:12px;}
    p{font-size:12px;margin:4px 0;} .muted{color:#6b7280;}
    .notes{font-size:12px;border-left:3px solid #eee;padding-left:10px;margin:4px 0;}
    .mm-tbl td{border:1px solid #cbd5e1;}
    .ph{max-width:46%;margin:6px 6px 0 0;border:1px solid #e5e7eb;border-radius:6px;vertical-align:top;}
    .sign{display:flex;gap:40px;margin-top:36px;} .sign div{flex:1;border-top:1px solid #9ca3af;padding-top:5px;font-size:11px;color:#6b7280;text-align:center;}
    .gen{margin-top:20px;text-align:center;font-size:9px;color:#b9bec7;}
    .cpr{margin-top:6px;text-align:center;font-size:9px;color:#9ca3af;}
    @page{margin:${forWord ? "14mm" : "0"};}
    @media print{@page{margin:${forWord ? "14mm" : "0"};}}
  `;
  const planeSvg = `<svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`;
  return `<!doctype html><html lang="${getLang() === "en" ? "en" : "de"}"><head><meta charset="utf-8"><title>${L("Protokoll", "Minutes")} ${esc(m.title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Mulish:wght@400;600;700;900&display=swap" rel="stylesheet"><style>${style}</style></head>
    <body>
    <div class="hd">${planeSvg}<div><h1>${L("Besprechungsprotokoll", "Meeting minutes")}</h1><div class="sub">${esc(m.title)} · ${esc(fmtDay(m.date))}</div></div></div>
    <h2>${L("Eckdaten", "Key data")}</h2><table>${meta}</table>
    ${parts ? `<h2>${L("Teilnehmer", "Participants")}</h2><ul>${parts}</ul>` : ""}
    ${absent ? `<h2>${L("Abwesend", "Absent")}</h2><ul>${absent}</ul>` : ""}
    ${agenda ? `<h2>${L("Agenda & Mitschrift", "Agenda & minutes")}</h2>${agenda}` : ""}
    ${decisions ? `<h2>${L("Entscheidungen", "Decisions")}</h2><table><tr><th>${L("Titel", "Title")}</th><th>${L("Verantwortlich", "Responsible")}</th><th>${L("Datum", "Date")}</th><th>${L("Status", "Status")}</th></tr>${decisions}</table>` : ""}
    ${actions ? `<h2>${L("Aufgaben", "Tasks")}</h2><ul>${actions}</ul>` : ""}
    ${m.openPoints ? `<h2>${L("Offene Punkte", "Open points")}</h2><p>${esc(m.openPoints)}</p>` : ""}
    ${(m.nextMeeting && (m.nextMeeting.date || m.nextMeeting.note)) ? `<h2>${L("Nächstes Meeting", "Next meeting")}</h2><p>${esc(fmtDay(m.nextMeeting.date))} ${esc(m.nextMeeting.note)}</p>` : ""}
    ${imgs ? `<h2>${L("Bilder", "Images")}</h2>${imgs}` : ""}
    ${att ? `<h2>${L("Anlagen", "Attachments")}</h2><ul>${att}</ul>` : ""}
    ${voc ? `<h2>${L("Sprachmemos", "Voice memos")}</h2><ul>${voc}</ul>` : ""}
    <div class="sign"><div>${L("Organisator", "Organizer")}${m.organizer ? " – " + esc(m.organizer) : ""}</div><div>${L("Protokollführer", "Minute taker")}${m.recorder ? " – " + esc(m.recorder) : ""}</div></div>
    <div class="gen">${L("Erstellt am", "Created on")} ${esc(new Date().toLocaleString(getLang() === "en" ? "en-GB" : "de-DE"))}</div>
    <div class="cpr">© Copyright by Patrick Thorn</div>
    </body></html>`;
}
export function printMeeting(m) {
  const w = window.open("", "_blank");
  if (!w) { alert(L("Bitte Pop-ups erlauben, um zu drucken.", "Please allow pop-ups to print.")); return; }
  w.document.write(meetingHTML(m));
  w.document.close(); w.focus();
  // Erst drucken, wenn die Schrift (Mulish) wirklich geladen ist – sonst werden
  // einzelne Zeichen in einer Ersatzschrift gedruckt (I/l sehen dann anders aus).
  let printed = false;
  const go = () => { if (printed) return; printed = true; try { w.print(); } catch {} };
  try {
    if (w.document.fonts && w.document.fonts.ready) {
      w.document.fonts.ready.then(() => setTimeout(go, 150));
      setTimeout(go, 2500); // Fallback, falls fonts.ready nicht auslöst
    } else setTimeout(go, 800);
  } catch { setTimeout(go, 800); }
}
export function exportWord(m) {
  const html = meetingHTML(m, true);
  downloadFile("﻿" + html, `${(m.date || new Date().toISOString().slice(0, 10)).replace(/-/g, "")}_${L("Protokoll", "Minutes")}_${(m.title || "Meeting").replace(/\s+/g, "_")}.doc`, "application/msword");
}

// Kompaktes, inline-formatiertes HTML-Fragment fürs Einfügen in E-Mails
export function meetingToEmailHtml(m) {
  const esc = (s) => (s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  const P = "margin:0 0 7px;font-size:13px;color:#1f2937;";
  const H = "margin:14px 0 4px;font-size:12px;color:#871C54;font-weight:bold;text-transform:uppercase;letter-spacing:.03em;";
  const o = [];
  o.push(`<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:13px;line-height:1.5;">`);
  o.push(`<div style="font-size:18px;font-weight:bold;color:#871C54;">${L("Besprechungsprotokoll", "Meeting minutes")}</div>`);
  if (m.title) o.push(`<div style="font-size:14px;font-weight:bold;margin-top:2px;">${esc(m.title)}</div>`);
  o.push(`<div style="color:#6b7280;font-size:12px;margin-bottom:10px;">${esc(fmtDay(m.date))}${m.start ? " · " + esc(m.start) + (m.end ? "–" + esc(m.end) : "") : ""}${m.type ? " · " + esc(m.type) : ""}${m.status ? " · " + esc(statusLabel(m.status)) : ""}</div>`);
  const extra = meetingMetaRows(m).filter(([k]) => ![L("Datum", "Date"), L("Typ", "Type"), L("Status", "Status"), L("Zeit", "Time")].includes(k));
  if (extra.length) o.push(extra.map(([k, v]) => `<div style="${P}"><b>${esc(k)}:</b> ${esc(v)}</div>`).join(""));
  if ((m.participants || []).length) o.push(`<div style="${H}">${L("Teilnehmer", "Participants")}</div><div style="${P}">${m.participants.map((p) => esc(p.name) + (p.company ? ` (${esc(p.company)})` : "")).join(", ")}</div>`);
  if ((m.absentees || []).length) o.push(`<div style="${H}">${L("Abwesend", "Absent")}</div><div style="${P}">${m.absentees.map((p) => esc(p.name)).join(", ")}</div>`);
  if ((m.agenda || []).length) {
    o.push(`<div style="${H}">${L("Agenda &amp; Mitschrift", "Agenda &amp; minutes")}</div>`);
    m.agenda.forEach((a, i) => {
      o.push(`<div style="margin:0 0 8px;"><div style="font-weight:bold;">${i + 1}. ${esc(a.title)}${a.done ? " ✓" : ""}</div>`);
      if (a.desc) o.push(`<div style="color:#6b7280;font-size:12px;">${esc(a.desc)}</div>`);
      if (a.notesHtml) o.push(`<div style="font-size:13px;margin:3px 0;">${sanitizeHtml(a.notesHtml)}</div>`);
      [[L("Entscheidungen", "Decisions"), a.decisions], [L("Diskussion", "Discussion"), a.discussion], [L("Risiken", "Risks"), a.risks], [L("Offene Fragen", "Open questions"), a.openQuestions]]
        .filter((x) => x[1]).forEach(([k, v]) => o.push(`<div style="${P}"><b>${esc(k)}:</b> ${esc(v)}</div>`));
      o.push(`</div>`);
    });
  }
  if ((m.decisions || []).length) { o.push(`<div style="${H}">${L("Entscheidungen", "Decisions")}</div>`); m.decisions.forEach((d) => o.push(`<div style="${P}">• <b>${esc(d.title)}</b> (${esc(decisionStatusLabel(d.status))}${d.owner ? ", " + esc(d.owner) : ""}${d.date ? ", " + esc(fmtDay(d.date)) : ""})${d.desc ? " – " + esc(d.desc) : ""}</div>`)); }
  if ((m.actionItems || []).length) { o.push(`<div style="${H}">${L("Aufgaben", "Tasks")}</div>`); m.actionItems.forEach((a) => o.push(`<div style="${P}">☐ ${esc(a.text)}</div>`)); }
  if (m.openPoints) o.push(`<div style="${H}">${L("Offene Punkte", "Open points")}</div><div style="${P}">${esc(m.openPoints).replace(/\n/g, "<br>")}</div>`);
  if (m.nextMeeting && (m.nextMeeting.date || m.nextMeeting.note)) o.push(`<div style="${H}">${L("Nächstes Meeting", "Next meeting")}</div><div style="${P}">${esc(fmtDay(m.nextMeeting.date))} ${esc(m.nextMeeting.note || "")}</div>`);
  if ((m.attachments || []).length) o.push(`<div style="${H}">${L("Anlagen", "Attachments")}</div><div style="${P}">${m.attachments.map((f) => esc(f.name)).join(", ")}</div>`);
  if ((m.voice || []).length) o.push(`<div style="${H}">${L("Sprachmemos", "Voice memos")}</div><div style="${P}">${m.voice.map((v) => esc(v.name)).join(", ")}</div>`);
  o.push(`<div style="margin-top:16px;color:#9ca3af;font-size:11px;">© Copyright by Patrick Thorn</div>`);
  o.push(`</div>`);
  return o.join("");
}

// Protokoll formatiert (HTML + Text) in die Zwischenablage legen
export async function copyMeetingToClipboard(m) {
  const html = meetingToEmailHtml(m);
  const text = meetingToText(m);
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new window.ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      })]);
      return true;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch {}
  try {
    const ta = document.createElement("textarea"); ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}

// Mailprogramm mit Betreff + Text öffnen
export function emailMeeting(m) {
  const subject = `${L("Protokoll", "Minutes")}: ${m.title || L("Meeting", "Meeting")}${m.date ? " (" + fmtDay(m.date) + ")" : ""}`;
  const body = meetingToText(m);
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ===========================================================================
const css = `
.mm-root{font-family:'Mulish',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${C.body};}
.mm-root *{box-sizing:border-box;}
.mm-wrap{max-width:1000px;margin:0 auto;padding:18px 20px 60px;}
.mm-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;}
.mm-head h2{display:flex;align-items:center;gap:9px;font-size:20px;font-weight:900;color:${C.ink};margin:0;}
.mm-head h2 svg{color:${C.burgundy};}
.mm-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:${C.white};border:1px solid ${C.line};border-radius:10px;padding:8px 10px;margin-bottom:14px;}
.mm-search{display:flex;align-items:center;gap:7px;border:1px solid ${C.line};border-radius:8px;padding:0 10px;flex:1;min-width:180px;color:${C.cool};}
.mm-search input{border:none;outline:none;padding:8px 0;font-size:14px;font-family:inherit;width:100%;background:none;}
.mm-x{background:none;border:none;color:${C.cool};cursor:pointer;display:flex;}
.mm-controls select{width:auto;max-width:200px;padding:6px 8px;font-size:12px;border:1px solid ${C.line};border-radius:8px;background:${C.white};font-family:inherit;}
.mm-fg{display:flex;align-items:center;gap:5px;}
.mm-fg span{font-size:10px;font-weight:800;color:${C.cool};text-transform:uppercase;letter-spacing:.04em;}
.mm-fg input[type="date"]{width:auto;padding:5px 7px;font-size:12px;border:1px solid ${C.line};border-radius:8px;-webkit-appearance:none;appearance:none;}
.mm-toggle{display:inline-flex;align-items:center;gap:5px;font-family:inherit;font-size:13px;font-weight:700;color:${C.grey};background:${C.white};border:1px solid ${C.line};border-radius:8px;padding:7px 10px;cursor:pointer;}
.mm-toggle.on{background:${C.burgundy};border-color:${C.burgundy};color:#fff;}
.mm-layout{display:flex;gap:6px;margin-left:auto;}
.mm-layout button{display:flex;align-items:center;justify-content:center;gap:6px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:7px 11px;border-radius:8px;border:1px solid ${C.line};background:${C.white};color:${C.grey};}
.mm-layout button.on{background:${C.burgundy};border-color:${C.burgundy};color:#fff;}
.mm-empty{background:${C.white};border:1px dashed ${C.line};border-radius:10px;padding:30px;text-align:center;color:${C.cool};font-size:14px;}
.mm-list{display:flex;flex-direction:column;gap:7px;}
.mm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;}
.mm-item{display:flex;align-items:flex-start;gap:8px;background:${C.white};border:1px solid ${C.line};border-left-width:4px;border-radius:9px;padding:10px 12px;}
.mm-item.card{flex-direction:column;}
.mm-item.card .mm-item-actions{align-self:flex-end;}
.mm-star{background:none;border:none;cursor:pointer;color:${C.line};padding:2px;display:flex;}
.mm-star.on{color:${C.burgundy};} .mm-star.on svg{fill:${C.burgundy};}
.mm-item-main{flex:1;min-width:0;cursor:pointer;}
.mm-item-title{font-size:15px;font-weight:800;color:${C.ink};line-height:1.25;}
.mm-item-meta{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:${C.grey};margin-top:3px;align-items:center;}
.mm-type{background:${C.fill};border-radius:5px;padding:1px 7px;font-weight:700;font-size:11px;}
.mm-status{font-weight:800;}
.mm-item-sub{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:${C.cool};margin-top:4px;align-items:center;}
.mm-item-sub span{display:inline-flex;align-items:center;gap:3px;}
.mm-item-actions{display:flex;gap:3px;flex:none;}
.mm-ic{background:none;border:none;color:${C.cool};cursor:pointer;border-radius:6px;padding:5px;display:inline-flex;align-items:center;font-family:inherit;font-size:12px;font-weight:800;}
.mm-ic:hover{background:${C.fill};color:${C.burgundy};}
.mm-ic.del{color:#fff;background:${C.burgundyDarker};padding:5px 9px;}
.mm-ic.abs{position:absolute;top:8px;right:8px;}
.mm-btn{display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-weight:800;font-size:13px;cursor:pointer;border-radius:8px;padding:9px 13px;border:1px solid transparent;}
.mm-btn.primary{background:${C.burgundy};color:#fff;} .mm-btn.primary:hover{background:${C.burgundyDark};}
.mm-btn.ghost{background:${C.white};color:${C.grey};border-color:${C.line};}
.mm-btn.out{background:${C.white};color:${C.burgundyDark};border-color:${C.line};} .mm-btn.out:hover{border-color:${C.burgundy};}
.mm-btn.out.sm{padding:6px 10px;font-size:12px;}
.mm-btn.rec{background:#D32F2F;color:#fff;}
/* Editor */
.mm-editor{max-width:880px;}
.mm-ehead{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;background:${C.panel};padding:10px 0;margin-bottom:6px;border-bottom:1px solid ${C.line};}
.mm-ehead-title{font-weight:900;color:${C.ink};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mm-ehead-actions{display:flex;gap:6px;}
.mm-section{background:${C.white};border:1px solid ${C.line};border-radius:11px;padding:14px 16px;margin-bottom:12px;}
.mm-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.mm-section-head h3{font-size:14px;font-weight:900;color:${C.burgundyDark};margin:0;text-transform:uppercase;letter-spacing:.03em;}
.mm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.mm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.mm-field{display:flex;flex-direction:column;gap:4px;min-width:0;}
.mm-field.wide{grid-column:1 / -1;}
.mm-flabel{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.mm-field label{font-size:11px;font-weight:800;color:${C.grey};text-transform:uppercase;letter-spacing:.03em;}
.mm-link{display:inline-flex;align-items:center;gap:4px;background:none;border:none;color:${C.sky};font-family:inherit;font-size:11px;font-weight:800;cursor:pointer;padding:0;}
.mm-link:hover{color:${C.burgundy};}
.mm-gear{background:none;border:1px solid ${C.line};border-radius:7px;color:${C.cool};cursor:pointer;padding:6px;display:inline-flex;}
.mm-gear:hover{border-color:${C.burgundy};color:${C.burgundy};}
.mm-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:70;padding:20px;}
.mm-modal{background:#fff;border-radius:14px;width:100%;max-width:440px;max-height:84vh;overflow:auto;padding:18px 20px;box-shadow:0 20px 60px rgba(0,0,0,.3);}
.mm-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.mm-modal-head h3{font-size:15px;font-weight:900;color:${C.ink};margin:0;}
.mm-addrow{display:flex;gap:8px;margin-bottom:12px;}
.mm-addrow input{flex:1;}
.mm-taglist{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;}
.mm-tagchip{display:inline-flex;align-items:center;gap:6px;background:${C.fill};border:1px solid ${C.line};border-radius:7px;padding:5px 9px;font-size:13px;font-weight:700;color:${C.body};}
.mm-tagchip button{background:none;border:none;color:${C.cool};cursor:pointer;display:flex;padding:0;}
.mm-tagchip button:hover{color:${C.burgundyDarker};}
.mm-root input,.mm-root select,.mm-root textarea{width:100%;max-width:100%;min-width:0;font-family:inherit;font-size:14px;color:${C.body};background:${C.white};border:1px solid ${C.line};border-radius:8px;padding:8px 10px;outline:none;}
.mm-root input[type="date"],.mm-root input[type="time"]{-webkit-appearance:none;appearance:none;}
.mm-root textarea{resize:vertical;}
.mm-root input:focus,.mm-root select:focus,.mm-root textarea:focus{border-color:${C.burgundy};box-shadow:0 0 0 3px rgba(175,30,101,.12);}
.mm-hint{font-size:12px;color:${C.cool};margin:2px 0;}
.mm-sub{font-size:11px;font-weight:800;color:${C.grey};text-transform:uppercase;letter-spacing:.03em;margin:8px 0 3px;}
/* Teilnehmer */
.mm-pp{margin-bottom:12px;}
.mm-pp-head{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
.mm-pp-head label{font-size:12px;font-weight:800;color:${C.grey};min-width:80px;}
.mm-pp-head select{max-width:280px;}
.mm-chips{display:flex;flex-wrap:wrap;gap:6px;}
.mm-pchip{display:inline-flex;flex-direction:column;background:${C.skyPale};border:1px solid #cfe0ff;border-radius:8px;padding:5px 8px;position:relative;font-size:12px;color:${C.body};}
.mm-pchip.muted{background:${C.fill};border-color:${C.line};opacity:.85;}
.mm-pchip b{font-weight:800;padding-right:14px;}
.mm-pchip em{font-style:normal;color:${C.grey};font-size:11px;}
.mm-pchip i{font-style:normal;color:${C.cool};font-size:11px;}
.mm-pchip button{position:absolute;top:3px;right:3px;background:none;border:none;color:${C.cool};cursor:pointer;display:flex;}
/* Agenda */
.mm-agenda{border:1px solid ${C.line};border-radius:9px;margin-bottom:8px;overflow:hidden;}
.mm-agenda-head{display:flex;align-items:center;gap:8px;padding:8px 10px;background:${C.fill};}
.mm-num{flex:none;width:22px;height:22px;border-radius:50%;background:${C.burgundy};color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;}
.mm-agenda-title{flex:1;border:1px solid transparent !important;background:transparent !important;font-weight:700;}
.mm-agenda-title:focus{background:#fff !important;border-color:${C.line} !important;}
.mm-done input{width:18px;height:18px;}
.mm-agenda-body{padding:10px;display:flex;flex-direction:column;gap:8px;}
.mm-row-card{position:relative;border:1px solid ${C.line};border-radius:9px;padding:12px;margin-bottom:8px;}
.mm-action{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.mm-action input{flex:1;}
.mm-tag{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:800;border-radius:6px;padding:5px 8px;}
.mm-tag.ok{background:#e6f4ea;color:${C.green};}
/* Rich text */
.mm-rt{border:1px solid ${C.line};border-radius:8px;overflow:hidden;}
.mm-rtbar{display:flex;gap:2px;background:${C.fill};border-bottom:1px solid ${C.line};padding:4px 6px;}
.mm-rtb{background:none;border:none;cursor:pointer;color:${C.grey};border-radius:5px;padding:4px 7px;font-size:13px;font-weight:800;display:inline-flex;align-items:center;}
.mm-rtb:hover{background:${C.white};color:${C.burgundy};}
.mm-rtarea{min-height:90px;padding:9px 11px;font-size:14px;line-height:1.45;outline:none;}
.mm-rtarea:empty:before{content:attr(data-ph);color:${C.cool};}
.mm-rtarea table.mm-tbl{border-collapse:collapse;margin:6px 0;}
.mm-rtarea table.mm-tbl td{border:1px solid ${C.line};padding:4px 8px;min-width:60px;}
.mm-rtarea ul,.mm-rtarea ol{margin:4px 0;padding-left:22px;}
/* Anhänge */
.mm-attbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;}
.mm-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;}
.mm-thumb{position:relative;width:96px;height:96px;border:1px solid ${C.line};border-radius:8px;overflow:hidden;}
.mm-thumb img{width:100%;height:100%;object-fit:cover;}
.mm-thumb button{position:absolute;top:2px;right:2px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:5px;cursor:pointer;display:flex;padding:2px;}
.mm-file{display:flex;align-items:center;gap:8px;font-size:13px;color:${C.body};padding:5px 0;border-bottom:1px solid ${C.fill};}
.mm-file a{color:${C.sky};font-weight:700;text-decoration:none;}
.mm-ebottom{display:flex;justify-content:flex-end;gap:8px;margin-top:8px;}
.mm-toast{position:fixed;bottom:64px;left:50%;transform:translateX(-50%);background:${C.ink};color:#fff;font-size:13px;font-weight:700;padding:9px 16px;border-radius:9px;z-index:60;box-shadow:0 8px 24px rgba(0,0,0,.2);}
@media(max-width:760px){
  .mm-wrap{padding:14px 12px 60px;}
  .mm-grid,.mm-grid2{grid-template-columns:1fr;}
  .mm-pp-head{flex-wrap:wrap;} .mm-pp-head select{max-width:none;width:100%;}
}
/* Laptop & iPad (quer): Breite nutzen */
@media(min-width:1024px){
  .mm-wrap{max-width:1180px;}
  .mm-list{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .mm-editor{max-width:1000px;}
}
`;
