const CONFIG = { STALE_THRESHOLD: 20000, VELOCIDAD_MEDIA: 30 };

const estado = {
  sessionId: null, map: null, markerTecnico: null, markerCliente: null,
  linea: null, posCliente: null, ultimoTimestamp: 0,
  primeraUbicacion: true, viajeActivo: true, unsubscribeFn: null, telefonoTecnico: '',
};

const els = {
  eta: document.getElementById('eta'),
  distancia: document.getElementById('distancia'),
  velocidad: document.getElementById('velocidad'),
  techStatus: document.getElementById('techStatus'),
  lastUpdate: document.getElementById('lastUpdate'),
  updateDot: document.getElementById('updateDot'),
  waitingOverlay: document.getElementById('waitingOverlay'),
  toast: document.getElementById('toast'),
};

async function init() {
  const params = new URLSearchParams(window.location.search);
  estado.sessionId = params.get('id');
  if (!estado.sessionId) { mostrarError('Enlace inválido. Pedile al técnico el enlace correcto.'); return; }
  inicializarMapa(-38.4, -63.6, 4);
  obtenerPosCliente();
  mostrarOverlayEspera(true);
  const ok = await Storage.init();
  if (!ok) { mostrarError('Error al conectar. Verificá tu internet.'); return; }
  await activarListenerFirestore();
  setInterval(actualizarIndicadorActualizacion, 1000);
  window.addEventListener('beforeunload', () => Storage.cancelarEscucha());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && estado.viajeActivo) actualizarIndicadorActualizacion();
  });
}

async function activarListenerFirestore() {
  estado.unsubscribeFn = await Storage.escucharViaje(
    estado.sessionId,
    (datos) => {
      if (!datos) { mostrarOverlayEspera(true); return; }
      if (datos.telefono) estado.telefonoTecnico = datos.telefono;
      if (!datos.activo) { onViajeTerminado(); return; }
      if (datos.lat === 0 && datos.lng === 0) {
        mostrarOverlayEspera(true);
        if (els.techStatus) els.techStatus.textContent = 'Obteniendo GPS...';
        return;
      }
      mostrarOverlayEspera(false);
      actualizarUI(datos);
    },
    (error) => {
      console.error('[Cliente] Error Firestore:', error);
      mostrarToast('⚠️ Error de conexión. Reconectando...');
      setTimeout(() => activarListenerFirestore(), 5000);
    }
  );
}

function actualizarUI(datos) {
  const { lat, lng, speed, timestamp } = datos;
  actualizarMarcadorTecnico(lat, lng);
  if (estado.posCliente) {
    const distKm = calcularDistanciaKm(estado.posCliente.lat, estado.posCliente.lng, lat, lng);
    const velKmh = (speed && speed > 0) ? speed : CONFIG.VELOCIDAD_MEDIA;
    const etaMin = Math.round((distKm / velKmh) * 60);
    els.distancia.textContent = distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`;
    els.eta.textContent = formatEta(etaMin);
    if (distKm < 0.05) els.techStatus.textContent = '¡El técnico llegó! 🎉';
    else if (distKm < 0.2) els.techStatus.textContent = '¡Llegando! A metros de vos';
    else els.techStatus.textContent = `A ${distKm.toFixed(1)} km de vos`;
    actualizarLinea(lat, lng, estado.posCliente.lat, estado.posCliente.lng);
  } else {
    els.distancia.textContent = '—'; els.eta.textContent = '—';
    els.techStatus.textContent = 'Localizando...';
  }
  els.velocidad.textContent = (speed && speed > 0) ? `${speed} km/h` : '—';
  estado.ultimoTimestamp = timestamp || Date.now();
  actualizarIndicadorActualizacion();
}

function onViajeTerminado() {
  estado.viajeActivo = false;
  Storage.cancelarEscucha();
  els.techStatus.textContent = 'El técnico finalizó el viaje';
  els.eta.textContent = '—'; els.distancia.textContent = '—'; els.velocidad.textContent = '—';
  els.updateDot.classList.add('stale');
  mostrarToast('El técnico llegó o finalizó el viaje. ✅');
}

function actualizarIndicadorActualizacion() {
  if (!estado.ultimoTimestamp) return;
  const segs = Math.round((Date.now() - estado.ultimoTimestamp) / 1000);
  els.lastUpdate.textContent = segs < 5 ? 'Ahora' : `hace ${segs}s`;
  const esStale = (Date.now() - estado.ultimoTimestamp) > CONFIG.STALE_THRESHOLD;
  els.updateDot.classList.toggle('stale', esStale);
}

function inicializarMapa(lat, lng, zoom = 14) {
  estado.map = L.map('map', { zoomControl: true, attributionControl: false, preferCanvas: true, fadeAnimation: false }).setView([lat, lng], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, updateWhenIdle: true }).addTo(estado.map);
}

function actualizarMarcadorTecnico(lat, lng) {
  if (!estado.markerTecnico) {
    const icono = L.divIcon({
      className: '',
      html: `<div style="background:#f97316;width:44px;height:44px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 18px rgba(249,115,22,0.7);display:flex;align-items:center;justify-content:center;position:relative;"><span style="transform:rotate(45deg);font-size:19px;position:absolute;">🛠️</span></div>`,
      iconSize: [44, 44], iconAnchor: [13, 44],
    });
    estado.markerTecnico = L.marker([lat, lng], { icon: icono }).bindPopup('<strong>Tu técnico</strong>').addTo(estado.map);
  } else {
    estado.markerTecnico.setLatLng([lat, lng]);
  }
  if (estado.primeraUbicacion) {
    estado.primeraUbicacion = false;
    if (estado.posCliente) {
      estado.map.fitBounds(L.latLngBounds([lat, lng], [estado.posCliente.lat, estado.posCliente.lng]), { padding: [70, 70], animate: true });
    } else {
      estado.map.setView([lat, lng], 14, { animate: true });
    }
  } else {
    estado.map.panTo([lat, lng], { animate: true, duration: 0.8 });
  }
}

function actualizarLinea(latTec, lngTec, latCli, lngCli) {
  const puntos = [[latTec, lngTec], [latCli, lngCli]];
  if (!estado.linea) {
    estado.linea = L.polyline(puntos, { color: '#f97316', weight: 2, opacity: 0.55, dashArray: '6, 9' }).addTo(estado.map);
  } else { estado.linea.setLatLngs(puntos); }
}

function obtenerPosCliente() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      estado.posCliente = { lat, lng };
      const icono = L.divIcon({
        className: '',
        html: `<div style="background:#3b82f6;width:34px;height:34px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 12px rgba(59,130,246,0.65);display:flex;align-items:center;justify-content:center;font-size:15px;">👤</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17],
      });
      estado.markerCliente = L.marker([lat, lng], { icon: icono }).bindPopup('<strong>Tu ubicación</strong>').addTo(estado.map);
    },
    (err) => console.info('[Cliente] GPS no disponible:', err.message),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function llamarTecnico() {
  if (!estado.telefonoTecnico) { mostrarToast('⚠️ Número no disponible'); return; }
  window.location.href = `tel:${estado.telefonoTecnico}`;
}

function whatsappTecnico() {
  if (!estado.telefonoTecnico) { mostrarToast('⚠️ Número no disponible'); return; }
  window.open(`https://wa.me/${estado.telefonoTecnico.replace(/\D/g, '')}`, '_blank');
}

function calcularDistanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function toRad(deg) { return deg * (Math.PI / 180); }

function formatEta(minutos) {
  if (minutos < 1) return '< 1 min';
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60), m = minutos % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function mostrarOverlayEspera(mostrar) {
  document.getElementById('waitingOverlay')?.classList.toggle('hidden', !mostrar);
}

function mostrarToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 3000);
}

function mostrarError(msg) {
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;padding:24px;background:#0f172a;color:#f1f5f9;text-align:center;font-family:'Space Mono',monospace;"><div><div style="font-size:52px;margin-bottom:20px">⚠️</div><p style="font-size:13px;color:#94a3b8;line-height:1.75;max-width:300px">${msg}</p></div></div>`;
}

document.addEventListener('DOMContentLoaded', init);
