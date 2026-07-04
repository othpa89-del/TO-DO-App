import { describe, it, expect } from "vitest";
import { diffRows, assembleRows } from "../store.js";

describe("diffRows", () => {
  const a = { id: "a", title: "Alpha" };
  const b = { id: "b", title: "Beta" };

  it("schreibt nur geänderte Zeilen", () => {
    const prev = { a: JSON.stringify(a), b: JSON.stringify(b) };
    const changed = { ...b, title: "Beta 2" };
    const { writes, deletes } = diffRows(prev, [a, changed], "task:");
    expect(writes).toEqual([{ key: "task:b", value: JSON.stringify(changed) }]);
    expect(deletes).toEqual([]);
  });

  it("erkennt gelöschte Einträge", () => {
    const prev = { a: JSON.stringify(a), b: JSON.stringify(b) };
    const { writes, deletes } = diffRows(prev, [a], "task:");
    expect(writes).toEqual([]);
    expect(deletes).toEqual(["task:b"]);
  });

  it("keine Änderung -> keine Schreibvorgänge", () => {
    const prev = { a: JSON.stringify(a) };
    const { writes, deletes } = diffRows(prev, [a], "task:");
    expect(writes).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it("neue Einträge werden geschrieben", () => {
    const { writes } = diffRows({}, [a, b], "meeting:");
    expect(writes.map((w) => w.key).sort()).toEqual(["meeting:a", "meeting:b"]);
  });
});

describe("assembleRows", () => {
  const row = (o) => ({ key: "task:" + o.id, value: JSON.stringify(o) });

  it("hält die Reihenfolge der Order-Liste ein", () => {
    const items = [row({ id: "b", t: 2 }), row({ id: "a", t: 1 })];
    const arr = assembleRows(items, ["a", "b"]);
    expect(arr.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("unbekannte Zeilen (neu von anderem Gerät) kommen nach vorn", () => {
    const items = [row({ id: "a" }), row({ id: "neu", createdAt: "2026-07-04" })];
    const arr = assembleRows(items, ["a"]);
    expect(arr.map((x) => x.id)).toEqual(["neu", "a"]);
  });

  it("kaputtes JSON wird übersprungen", () => {
    const items = [row({ id: "a" }), { key: "task:x", value: "{kaputt" }];
    const arr = assembleRows(items, ["a"]);
    expect(arr.map((x) => x.id)).toEqual(["a"]);
  });

  it("Order-Einträge ohne Zeile werden ignoriert", () => {
    const arr = assembleRows([row({ id: "a" })], ["fehlt", "a"]);
    expect(arr.map((x) => x.id)).toEqual(["a"]);
  });
});
