import { db } from '../db/db';
import { deleteObjects, putObjects, restoreObjects } from '../db/repo';
import type { PageObject } from '../db/types';

// Cofnij/ponów. Każda akcja to para funkcji „zrób” i „odwróć”, operujących na bazie danych.
interface Op {
  redo: () => Promise<void>;
  undo: () => Promise<void>;
}

const LIMIT = 200;

export class History {
  private past: Op[] = [];
  private future: Op[] = [];
  private listeners = new Set<() => void>();

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  private emit() { this.listeners.forEach((f) => f()); }

  private push(op: Op) {
    this.past.push(op);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
    this.emit();
  }

  async undo() {
    const op = this.past.pop();
    if (!op) return;
    await op.undo();
    this.future.push(op);
    this.emit();
  }

  async redo() {
    const op = this.future.pop();
    if (!op) return;
    await op.redo();
    this.past.push(op);
    this.emit();
  }

  /** Dodano obiekty (np. nową kreskę). */
  async add(objs: PageObject[]) {
    await putObjects(objs);
    this.push({
      redo: () => restoreObjects(objs),
      undo: () => deleteObjects(objs.map((o) => o.id)),
    });
  }

  /** Rejestruje dodanie obiektów, które już są w bazie (np. blok tekstu zapisywany w trakcie pisania). */
  added(objs: PageObject[]) {
    const ids = objs.map((o) => o.id);
    let snapshot = objs;
    this.push({
      redo: () => restoreObjects(snapshot),
      undo: async () => {
        // zapamiętujemy najnowszą treść (tekst mógł się zmienić po utworzeniu bloku)
        snapshot = (await db.objects.bulkGet(ids)).filter((o): o is PageObject => !!o);
        await deleteObjects(ids);
      },
    });
  }

  /** Usunięto obiekty (gumka „całe kreski”, Delete w zaznaczeniu). */
  async remove(objs: PageObject[]) {
    await deleteObjects(objs.map((o) => o.id));
    this.push({
      redo: () => deleteObjects(objs.map((o) => o.id)),
      undo: () => restoreObjects(objs),
    });
  }

  /** Zamiana jednych obiektów na inne (gumka częściowa, przesunięcie lassem, prostowanie kształtu). */
  async replace(before: PageObject[], after: PageObject[]) {
    const afterIds = new Set(after.map((o) => o.id));
    const removed = before.filter((o) => !afterIds.has(o.id));
    await deleteObjects(removed.map((o) => o.id));
    await putObjects(after);
    this.push({
      redo: async () => {
        await deleteObjects(removed.map((o) => o.id));
        await restoreObjects(after);
      },
      undo: async () => {
        await deleteObjects(after.filter((o) => !before.some((b) => b.id === o.id)).map((o) => o.id));
        await restoreObjects(before);
      },
    });
  }
}

export const history = new History();
