// scripts/state.js
const STORAGE_KEY = "zf_proto_v2";

export const HOME_RADIUS_M = 60;
export const MAX_STAT = 100;
export const MAX_PEOPLE = 4;

export function nowMs(){ return Date.now(); }

export function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw){
    try { return JSON.parse(raw); } catch {}
  }
  return {
    version: 2,
    home: null,                 // { lat, lng }
    walkFreq: "normal",
    lastTickMs: nowMs(),
    family: [],                 // [{ id, name, hunger, cold, equipment }]
    backpack: { items: {} },    // { items: { [itemId]: qty } }
    fireFuel: 0,                // shared fuel reserve (prototype)
    collectedByDate: {}         // { "YYYY-MM-DD": { "food:...": true } }
  };
}

export function saveState(st){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
}

export function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

// Haversine distance in meters
export function distanceM(a, b){
  const R = 6371000;
  const toRad = d => d * Math.PI/180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const s1 = Math.sin(dLat/2), s2 = Math.sin(dLon/2);
  const h = s1*s1 + Math.cos(lat1)*Math.cos(lat2)*s2*s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
