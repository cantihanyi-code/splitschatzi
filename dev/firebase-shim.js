/* Nur für lokale Entwicklung (wird von dev/server.mjs statt des echten Firebase-SDKs ausgeliefert).
   Bildet den kleinen Teil der Firebase-RTDB-Compat-API nach, den app.js nutzt, und synchronisiert
   über den Dev-Server (Server-Sent Events) – so lassen sich zwei "Handys" in zwei Browser-Tabs testen.
   Zum Offline-Testen in der Konsole: firebase.__dev.setOffline(true) */
(function () {
  let tree = null, ready, markReady, offline = false, es = null;
  const queue = [], listeners = [];
  ready = new Promise(r => (markReady = r));
  const segs = p => String(p || '').split('/').filter(Boolean);
  const clone = v => (v == null ? null : JSON.parse(JSON.stringify(v)));
  function getAt(p) {
    if (p === '.info/connected') return !!es && !offline && es.readyState === 1;
    let n = tree;
    for (const k of segs(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
    return n === undefined ? null : n;
  }
  function clean(v) {
    if (v == null || typeof v !== 'object') return v == null ? null : v;
    const o = {};
    for (const [k, x] of Object.entries(v)) { const c = clean(x); if (c != null) o[k] = c; }
    return Object.keys(o).length ? o : null;
  }
  function setAt(p, v) {
    const s = segs(p);
    if (!s.length) { tree = clean(v); return; }
    if (tree == null || typeof tree !== 'object') tree = {};
    let n = tree; const parents = [];
    for (let i = 0; i < s.length - 1; i++) {
      if (n[s[i]] == null || typeof n[s[i]] !== 'object') n[s[i]] = {};
      parents.push([n, s[i]]); n = n[s[i]];
    }
    const c = clean(v), last = s[s.length - 1];
    if (c == null) delete n[last]; else n[last] = c;
    for (let i = parents.length - 1; i >= 0; i--) { const [par, k] = parents[i]; if (!Object.keys(par[k]).length) delete par[k]; }
  }
  const snap = p => { const v = clone(getAt(p)); return { val: () => clone(v), exists: () => v != null, key: segs(p).pop() || null }; };
  // Wie bei Firebase: Daten-Listener feuern erst, wenn Daten da sind; Verbindungsstatus jederzeit
  let loaded = false;
  const notify = () => listeners.slice().forEach(l => {
    if (l.path !== '.info/connected' && !loaded) return;
    try { l.cb(snap(l.path)); } catch (e) { console.error(e); }
  });
  function send(op) {
    if (offline) { queue.push(op); return Promise.resolve(); }
    return fetch('/__dev/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(op) }).then(r => { if (!r.ok) throw new Error('dev write failed'); });
  }
  function connect() {
    es = new EventSource('/__dev/stream');
    es.onmessage = ev => { tree = JSON.parse(ev.data); loaded = true; markReady(); notify(); };
    es.onerror = () => notify();
    es.onopen = () => notify();
  }
  class Ref {
    constructor(p) { this.path = segs(p).join('/'); this.key = segs(p).pop() || null; }
    child(p) { return new Ref(this.path + '/' + p); }
    on(ev, cb, errCb) {
      listeners.push({ path: this.path, cb });
      if (this.path === '.info/connected') setTimeout(() => cb(snap(this.path)));
      else ready.then(() => cb(snap(this.path)));
      return cb;
    }
    off(ev, cb) { for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].path === this.path && (!cb || listeners[i].cb === cb)) listeners.splice(i, 1); }
    once() { return ready.then(() => snap(this.path)); }
    set(v) { setAt(this.path, clone(v)); notify(); return send({ op: 'set', path: this.path, value: v }); }
    update(obj) { for (const k in obj) setAt(this.path + '/' + k, clone(obj[k])); notify(); return send({ op: 'update', path: this.path, value: obj }); }
    remove() { return this.set(null); }
    transaction(fn) {
      return ready.then(() => {
        const nv = fn(clone(getAt(this.path)));
        if (nv === undefined) return { committed: false, snapshot: snap(this.path) };
        return this.set(nv).then(() => ({ committed: true, snapshot: snap(this.path) }));
      });
    }
  }
  const database = () => ({ ref: p => new Ref(p), goOnline() {}, goOffline() {} });
  window.firebase = {
    database,
    __dev: {
      setOffline(v) {
        offline = !!v;
        if (offline) { es && es.close(); notify(); return; }
        Promise.all(queue.splice(0).map(send)).finally(connect);
      },
    },
  };
  connect();
})();
