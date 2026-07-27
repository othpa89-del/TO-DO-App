// Kalendertag als "YYYY-MM-DD" aus der LOKALEN Zeit.
// Wichtig: new Date().toISOString().slice(0,10) rechnet nach UTC um und liefert
// in Zeitzonen östlich von UTC abends bereits den Vortag bzw. verschiebt
// Folgetermine um einen Tag. Alle Kalenderdaten (Fälligkeiten, Wiederholungen,
// updatedAt, Meeting-Datum) werden daher lokal gebildet.
export function isoDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
