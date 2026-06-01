const Storage = (() => {

  let _app = null;
  let _db  = null;
  let _unsubscribe = null;
  let _conectado = false;

  async function init() {
    try {
      if (!window.FIREBASE_CONFIG) {
        throw new Error('firebase-config.js no cargado.');
      }
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
      const { getFirestore, enableNetwork, disableNetwork } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      try {
        _app = initializeApp(window.FIREBASE_CONFIG);
      } catch (e) {
        if (e.code === 'app/duplicate-app') {
          const { getApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
          _app = getApp();
        } else throw e;
      }
      _db = getFirestore(_app);
      _conectado = true;
      window.addEventListener('online',  () => { if (_db) enableNetwork(_db); });
      window.addEventListener('offline', () => { if (_db) disableNetwork(_db); });
      console.info('[Storage] Firebase iniciado OK');
      return true;
    } catch (error) {
      console.error('[Storage] Error:', error);
      _conectado = false;
      return false;
    }
  }

  async function guardarViaje(sessionId, data) {
    if (!_db) return;
    const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const payload = {
      lat:       data.lat,
      lng:       data.lng,
      accuracy:  data.accuracy  ?? null,
      speed:     data.speed     ?? null,
      activo:    data.activo    ?? true,
      telefono:  data.telefono  ?? window.TELEFONO_TECNICO ?? '',
      timestamp:   Date.now(),
      serverTime:  serverTimestamp(),
    };
    await setDoc(doc(_db, 'viajes', sessionId), payload, { merge: true });
  }

  async function finalizarViaje(sessionId) {
    if (!_db) return;
    const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    await updateDoc(doc(_db, 'viajes', sessionId), {
      activo: false,
      finTimestamp: Date.now(),
      finServerTime: serverTimestamp(),
    });
  }

  async function limpiarViaje(sessionId) {
    if (!_db) return;
    const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    await deleteDoc(doc(_db, 'viajes', sessionId));
  }

  async function escucharViaje(sessionId, onDatos, onError) {
    if (!_db) { onError?.(new Error('Firestore no iniciado')); return () => {}; }
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
    const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    _unsubscribe = onSnapshot(
      doc(_db, 'viajes', sessionId),
      (snapshot) => { onDatos(snapshot.exists() ? snapshot.data() : null); },
      (error)    => { console.error('[Storage] Listener error:', error); onError?.(error); }
    );
    return _unsubscribe;
  }

  async function leerViaje(sessionId) {
    if (!_db) return null;
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    try {
      const snap = await getDoc(doc(_db, 'viajes', sessionId));
      return snap.exists() ? snap.data() : null;
    } catch { return null; }
  }

  function cancelarEscucha() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  }

  function generarSessionId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  function estaConectado() { return _conectado && _db !== null; }

  return { init, guardarViaje, escucharViaje, leerViaje, finalizarViaje, limpiarViaje, cancelarEscucha, generarSessionId, estaConectado };

})();
