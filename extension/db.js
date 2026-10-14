// Общая локальная база (IndexedDB) для popup и offscreen — один и тот же origin расширения.
const DB = {
  _p: null,
  open() {
    if (!this._p) this._p = new Promise((res, rej) => {
      const r = indexedDB.open('ng', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('articles', { keyPath: 'url' });
        r.result.createObjectStore('state', { keyPath: 'k' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this._p;
  },
  async run(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  put(store, v) { return this.run(store, 'readwrite', s => s.put(v)); },
  get(store, k) { return this.run(store, 'readonly', s => s.get(k)); },
  getAll(store) { return this.run(store, 'readonly', s => s.getAll()); },
  count(store) { return this.run(store, 'readonly', s => s.count()); },
  clear(store) { return this.run(store, 'readwrite', s => s.clear()); }
};
