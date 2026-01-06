// scripts/spawns.js
import { saveState } from "./state.js";

// YYYY-MM-DD in local time
export function todayKey(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

// Small deterministic RNG
function mulberry32(seed){
  return function(){
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s){
  let h = 2166136261;
  for (let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function weightedPick(items, rnd){
  if (!items || items.length === 0) return null;
  let total = 0;
  for (const it of items){
    total += Math.max(0, Number(it.rarity ?? 1));
  }
  if (total <= 0) return items[Math.floor(rnd() * items.length)];

  let r = rnd() * total;
  for (const it of items){
    r -= Math.max(0, Number(it.rarity ?? 1));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// --- Content tables (loaded once) ---
let FOOD_TABLE = null;
let FUEL_TABLE = null;

export async function loadSpawnTables(){
  if (FOOD_TABLE && FUEL_TABLE) return;

  const [foodRes, fuelRes] = await Promise.all([
    fetch("content/food.json", { cache: "no-store" }),
    fetch("content/fuel.json", { cache: "no-store" })
  ]);

  if (!foodRes.ok) throw new Error("Failed to load content/food.json");
  if (!fuelRes.ok) throw new Error("Failed to load content/fuel.json");

  FOOD_TABLE = await foodRes.json();
  FUEL_TABLE = await fuelRes.json();

  // light validation
  if (!FOOD_TABLE?.items?.length) console.warn("food.json has no items.");
  if (!FUEL_TABLE?.items?.length) console.warn("fuel.json has no items.");
}

// Generate daily pickups around home within radius (meters).
// Deterministic per day (including which item is chosen).
export function getDailyPickups(st, radiusM = 450){
  if (!st.home) return [];
  if (!FOOD_TABLE || !FUEL_TABLE){
    console.warn("Spawn tables not loaded yet. Call loadSpawnTables() first.");
    return [];
  }

  const key = todayKey();
  const seed = hashStr(`${key}|${st.home.lat.toFixed(5)},${st.home.lng.toFixed(5)}`);
  const rnd = mulberry32(seed);

  // Counts (tune later)
  const foodN = 10;
  const fuelN = 6;

  const out = [];

  // Convert radius meters to degree offsets approx
  const lat0 = st.home.lat;
  const lng0 = st.home.lng;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(lat0 * Math.PI/180);

  function randPoint(){
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * radiusM;
    const dLat = (r * Math.cos(a)) / metersPerDegLat;
    const dLng = (r * Math.sin(a)) / metersPerDegLng;
    return { lat: lat0 + dLat, lng: lng0 + dLng };
  }

  // Build deterministic food spawns
  for (let i=0;i<foodN;i++){
    const p = randPoint();

    // Deterministic selection: use the same RNG stream for picking item
    const item = weightedPick(FOOD_TABLE.items, rnd) || {
      id: "food_default",
      name: "Food",
      value: 10,
      pickupImg: "assets/food1.png"
    };

    out.push({
      kind: "food",
      id: `food:${key}:${i}`,     // stable per-day/per-index
      itemId: item.id,
      itemName: item.name,
      itemValue: Number(item.value ?? 0),
      lat: p.lat,
      lng: p.lng,
      icon: item.pickupImg || "assets/food1.png"
    });
  }

  // Build deterministic fuel spawns
  for (let i=0;i<fuelN;i++){
    const p = randPoint();

    const item = weightedPick(FUEL_TABLE.items, rnd) || {
      id: "fuel_default",
      name: "Fuel",
      value: 10,
      pickupImg: "assets/fuel1.png"
    };

    out.push({
      kind: "fuel",
      id: `fuel:${key}:${i}`,
      itemId: item.id,
      itemName: item.name,
      itemValue: Number(item.value ?? 0),
      lat: p.lat,
      lng: p.lng,
      icon: item.pickupImg || "assets/fuel1.png"
    });
  }

  // Filter out collected
  const collected = st.collectedByDate?.[key] || {};
  return out.filter(it => !collected[it.id]);
}

export function markCollected(st, pickupId){
  const key = todayKey();
  st.collectedByDate[key] = st.collectedByDate[key] || {};
  st.collectedByDate[key][pickupId] = true;
  saveState(st);
}
