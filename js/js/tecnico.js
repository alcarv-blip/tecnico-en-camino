const estado = {
  enViaje: false, sessionId: null, watchId: null,
  map: null, marker: null, updateCount: 0,
  ultimaPos: null, ultimaEscritura: 0, escribiendo: false, erroresGPS: 0,
};

const DEBOUNCE_ESCRITURA = 3000;
const MAX_ERRORES_GPS = 5;

const els = {
  mainBtn:     document.getElementById('mainBtn'),
  fabIcon:     document.getElementById('fabIcon'),
  fabLabel:    document.getElementById('fabLabel'),
  statusPanel: document.getElementById('statusPanel'),
  mapSection:  document.getElementById('mapSection'),
  tripInfo:    document.getElementById('tripInfo'),
  sharePanel:  document.getElementById('sharePanel'),
  statusBadge: document.getElementById('statusBadge'),
  badgeLabel:  document.querySelector('#statusBadge .badge-label'),
  coordsText:  document.getElementById('coordsText'),
  accuracyVal: document.getElementById('accuracyVal'),
  speedVal:    document.getElementById('speedVal'),
  updateCount: document.getElementById('updateCount'),
  shareLink:   document.getElementById('shareLink'),
  toast:       document.getElementById('toast'),
};

async function init() {
  els.mainBtn.disabled = true;
  els.fabLabel.textContent = 'Conectando...';
  const ok = await Storage.init();
  if (!ok) {
    mostrarToast('❌ Error al conectar con Firebase');
    els.fabLabel.textContent = 'Error de conexión';
    return;
  }
  els.mainBtn.disabled = false;
  els.fabLabel.textContent = 'Iniciar Viaje';
  const sessionGuardada = sessionStorage.getItem('tec_session_id');
  if (sessionGuardada) {
    const datos = await Storage.leerViaje(sessionGuardada);
    if (datos && datos.activo) {
      estado.sessionId = sessionGuardada;
      mostrarToast('🔄 Retomando viaje activo...');
      setUiEnViaje(true);
      iniciarGPS();
    } else {
      sessionStorage.removeItem('tec_session_id');
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function toggleViaje() {
  if (estado.enViaje) confirmarFinViaje();
  else iniciarViaje();
}

async function iniciarViaje() {
  if (!navigator.geolocation) { mostrarToast('❌ Tu dispositivo no soporta GPS'); return; }
  if (!Storage.estaConectado()) { mostrarToast('❌ Sin conexión a Firebase'); return; }
  estado.sessionId = Storage.generarSessionId();
  sessionStorage.setItem('tec_session_id', estado.sessionId);
  await Storage.guardarViaje(estado.sessionId, { lat: 0, lng: 0, activo: true, speed: null, accuracy: null });
  setUiEnViaje(true);
  iniciarGPS();
  mostrarToast('📍 GPS activado. Compartí el enlace.');
}

function confirmarFinViaje() {
  if (!confirm('¿Finalizar el viaje?\nEl cliente dejará de ver tu ubicación.')) return;
  finalizarViaje();
}

async function finalizarViaje() {
  els.mainBtn.disabled = true;
  detenerGPS();
  if (estado.sessionId) {
    try { await Storage.finalizarViaje(estado.sessionId); } catch (e) { console.error(e); }
    sessionStorage.removeItem('tec_session_id');
  }
  estado.enViaje = false; estado.sessionId = null;
  estado.updateCount = 0; estado.ultimaPos = null; estado.erroresGPS = 0;
  if (estado.marker) { estado.marker.remove(); estado.marker = null; }
  setUiEnViaje(false);
  els.mainBtn.disabled = false;
  mostrarToast('✅ Viaje finalizado');
}

function iniciarGPS() {
  if (estado.watchId !== null) return;
  estado.watchId = navigator.geolocation.watchPosition(
    onPosicionActualizada, onErrorGPS,
    window.APP_CONFIG?.GEO_OPTIONS ?? { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function detenerGPS() {
  if (estado.watchId !== null) { navigator.geolocation.clearWatch(estado.watchId); estado.watchId = null; }
}

async function onPosicionActualizada(pos) {
  const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
  estado.erroresGPS = 0;
  estado.ultimaPos = { lat, lng, accuracy, speed };
  estado.updateCount++;
  actualizarMapa(lat, lng);
  els.coordsText.textContent  = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  els.accuracyVal.textContent = `±${Math.round(accuracy)}m`;
  els.speedVal.textContent    = speed ? `${Math.round(speed * 3.6)} km/h` : '—';
  els.updateCount.textContent = estado.updateCount;
  const ahora = Date.now();
  if (estado.escribiendo || (ahora - estado.ultimaEscritura) < DEBOUNCE_ESCRITURA) return;
  estado.escribiendo = true;
  estado.ultimaEscritura = ahora;
  try {
    await Storage.guardarViaje(estado.sessionId, {
      lat, lng, accuracy: Math.round(accuracy),
      speed: speed ? Math.round(speed * 3.6) : null, activo: true,
    });
  } catch (e) { mostrarToast('⚠️ Error de conexión'); }
  finally { estado.escribiendo = false; }
}

function onErrorGPS(err) {
  estado.erroresGPS++;
  const msgs = { 1: '❌ Permiso GPS denegado.', 2: '⚠️ No se pudo obtener posición.', 3: '⏱️ Timeout GPS.' };
  if (estado.erroresGPS <= 3) mostrarToast(msgs[err.code] || '⚠️ Error GPS');
}

function onVisibilityChange() {
  if (!estado.enViaje) return;
  if (document.visibilityState === 'visible') estado.ultimaEscritura = 0;
}

function inicializarMapa(lat, lng) {
  estado.map = L.map('map', { zoomControl: false, attributionControl: false, preferCanvas: true, fadeAnimation: false }).setView([lat, lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, updateWhenIdle: true }).addTo(estado.map);
  const icono = L.divIcon({
    className: '',
    html: `<div style="background:#f97316;width:40px;height:40px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 14px rgba(249,115,22,0.65);display:flex;align-items:center;justify-content:center;position:relative;"><span style="transform:rotate(45deg);font-size:17px;position:absolute;">🛠️</span></div>`,
    iconSize: [40, 40], iconAnchor: [11, 40],
  });
  estado.marker = L.marker([lat, lng], { icon: icono }).addTo(estado.map);
}

function actualizarMapa(lat, lng) {
  if (!estado.map) inicializarMapa(lat, lng);
  else { estado.marker.setLatLng([lat, lng]); estado.map.panTo([lat, lng], { animate: true, duration: 0.8 }); }
}

function generarEnlace() {
  const base = window.location.href.replace(/\/[^/]*$/, '/');
  return `${base}cliente.html?id=${estado.sessionId}`;
}

function compartirWhatsApp() {
  const msg = encodeURIComponent(`¡Hola! Seguí mi ubicación en tiempo real 👇\n${generarEnlace()}`);
  window.open(`https://wa.me/?text=${msg}`, '_blank');
}

function compartirSMS() {
  window.open(`sms:?body=${encodeURIComponent(`Seguí mi ubicación: ${generarEnlace()}`)}`, '_self');
}

async function copiarEnlace() {
  const link = els.shareLink.value;
  if (!link) return;
  try { await navigator.clipboard.writeText(link); }
  catch { els.shareLink.select(); document.execCommand('copy'); }
  mostrarToast('✅ Enlace copiado');
  const btn = document.getElementById('copyBtn');
  btn.innerHTML = '<span>✓</span>';
  setTimeout(() => { btn.innerHTML = '<span class="copy-icon">📋</span>'; }, 2000);
}

function setUiEnViaje(activo) {
  estado.enViaje = activo;
  if (activo) {
    els.statusPanel.classList.add('hidden');
    els.mapSection.classList.remove('hidden');
    els.tripInfo.classList.remove('hidden');
    els.fabIcon.textContent = '■';
    els.fabLabel.textContent = 'Finalizar Viaje';
    els.mainBtn.classList.add('danger');
    els.statusBadge.classList.add('active');
    els.badgeLabel.textContent = 'En viaje';
    setTimeout(() => { els.sharePanel.classList.remove('hidden'); els.shareLink.value = generarEnlace(); }, 600);
  } else {
    els.statusPanel.classList.remove('hidden');
    els.mapSection.classList.add('hidden');
    els.tripInfo.classList.add('hidden');
    els.sharePanel.classList.add('hidden');
    els.fabIcon.textContent = '▶';
    els.fabLabel.textContent = 'Iniciar Viaje';
    els.mainBtn.classList.remove('danger');
    els.statusBadge.classList.remove('active');
    els.badgeLabel.textContent = 'Inactivo';
  }
}

function mostrarToast(mensaje) {
  els.toast.textContent = mensaje;
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 2800);
}

document.addEventListener('DOMContentLoaded', init);
