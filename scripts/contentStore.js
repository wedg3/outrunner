// scripts/contentStore.js
let CATALOG_BY_ID = new Map();

export async function loadCatalog(){
  // load same tables you already have
  const [foodRes, fuelRes] = await Promise.all([
    fetch("content/food.json", { cache: "no-store" }),
    fetch("content/fuel.json", { cache: "no-store" })
  ]);
  if (!foodRes.ok) throw new Error("Failed to load content/food.json");
  if (!fuelRes.ok) throw new Error("Failed to load content/fuel.json");

  const food = await foodRes.json();
  const fuel = await fuelRes.json();

  CATALOG_BY_ID = new Map();
  for (const it of (food.items || [])) CATALOG_BY_ID.set(it.id, it);
  for (const it of (fuel.items || [])) CATALOG_BY_ID.set(it.id, it);

  return CATALOG_BY_ID;
}

export function getItemDef(itemId){
  return CATALOG_BY_ID.get(itemId) || null;
}

export function ensureLoaded(){
  return CATALOG_BY_ID && CATALOG_BY_ID.size > 0;
}
