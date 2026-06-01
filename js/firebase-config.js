const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCVhdcd0Bbj_UopNbcG9oS8_e0Travoxsw",
  authDomain:        "tecnico-en-camino.firebaseapp.com",
  projectId:         "tecnico-en-camino",
  storageBucket:     "tecnico-en-camino.firebasestorage.app",
  messagingSenderId: "579170875053",
  appId:             "1:579170875053:web:42baac3a7a9463f8e1f824"
};

const TELEFONO_TECNICO = "+542944713310";

const APP_CONFIG = {
  STALE_THRESHOLD: 20000,
  VELOCIDAD_MEDIA: 30,
  GEO_OPTIONS: {
    enableHighAccuracy: true,
    timeout:            12000,
    maximumAge:         0,
  },
};

window.FIREBASE_CONFIG  = FIREBASE_CONFIG;
window.TELEFONO_TECNICO = TELEFONO_TECNICO;
window.APP_CONFIG       = APP_CONFIG;
