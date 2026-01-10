// scripts/app.js
import { loadState, saveState, clamp, MAX_STAT, MAX_PEOPLE } from "./state.js";
import { applyTimeJump } from "./timejump.js";
import { loadSpawnTables, getDailyPickups, markCollected, todayKey } from "./spawns.js";
import { loadCatalog, getItemDef } from "./contentStore.js";

let st = loadState();

const els = {
  // view switch
  btnToFamily: document.getElementById("btnToFamily"),
  btnToMap: document.getElementById("btnToMap"),

  // map view
  mapEl: document.getElementById("map"),
  backpackCounts: document.getElementById("backpackCounts"),
  spawnInfo: document.getElementById("spawnInfo"),
  setupPanel: document.getElementById("setupPanel"),
  btnSetHomeHere: document.getElementById("btnSetHomeHere"),
  walkFreq: document.getElementById("walkFreq"),
  walkWrap: document.getElementById("walkWrap"),

  // family view
  btnAddMember: document.getElementById("btnAddMember"),
  btnMoveHome: document.getElementById("btnMoveHome"),
  peopleLayer: document.getElementById("peopleLayer"),
  fireDrop: document.getElementById("fireDrop"),
  fireFuelVal: document.getElementById("fireFuelVal"),

  // backpack overlay
  btnBackpack: document.getElementById("btnBackpack"),
  bpOverlay: document.getElementById("bpOverlay"),
  bpClose: document.getElementById("bpClose"),
  bpGrid: document.getElementById("bpGrid")
};

let map, myMarker, homeMarker;
let myPos = null;
let lastMapClickPos = null;
let pickupMarkers = new Map(); // id -> marker

function setActiveView(id){
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function showSetupPanel(show){
  els.setupPanel.style.display = show ? "block" : "none";
}

function showWalkFreq(show){
  els.walkWrap.style.display = show ? "block" : "none";
}

function getBestHomeCandidate(){
  if (myPos) return { lat: myPos.lat, lng: myPos.lng };
  if (lastMapClickPos) return { ...lastMapClickPos };
  if (map){
    const c = map.getCenter();
    return { lat: c.lat, lng: c.lng };
  }
  return null;
}

// ---------- Map init ----------
function initMap(){
  const start = st.home ? [st.home.lat, st.home.lng] : [59.33, 18.06];
  const startZoom = st.home ? 16 : 13;

  map = L.map("map", { zoomControl: true }).setView(start, startZoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  if (st.home){
    st._centeredOnce = true;
    saveState(st);
  }

  map.on("click", (e) => {
    lastMapClickPos = { lat: e.latlng.lat, lng: e.latlng.lng };
    L.popup().setLatLng(e.latlng).setContent("Selected location").openOn(map);
  });

  map.on("moveend", () => refreshPickups());
}

function setMyMarker(){
  if (!myPos) return;
  if (!myMarker){
    myMarker = L.circleMarker([myPos.lat, myPos.lng], { radius: 8, weight: 2 }).addTo(map);
  } else {
    myMarker.setLatLng([myPos.lat, myPos.lng]);
  }
}

function setHomeMarker(){
  if (!st.home){
    if (homeMarker){ map.removeLayer(homeMarker); homeMarker = null; }
    return;
  }
  const homeIcon = L.icon({
    iconUrl: "assets/home.png",
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });
  if (!homeMarker){
    homeMarker = L.marker([st.home.lat, st.home.lng], { icon: homeIcon, title:"Home" }).addTo(map);
  } else {
    homeMarker.setLatLng([st.home.lat, st.home.lng]);
    homeMarker.setIcon(homeIcon);
  }
}

let drag = null; // { itemId, ghostEl, sourceEl }

function startDragItem(e, itemId){
  const def = getItemDef(itemId);
  if (!def) return;

  const src = e.currentTarget;
  src.classList.add("dragging");

  // Create ghost
  const ghost = document.createElement("div");
  ghost.className = "dragGhost";
  const img = document.createElement("img");
  img.src = def.displayImg || def.pickupImg || "assets/food1.png";
  img.alt = def.name || itemId;
  ghost.appendChild(img);
  document.body.appendChild(ghost);

  drag = { itemId, ghostEl: ghost, sourceEl: src };

  moveGhost(e);

  window.addEventListener("pointermove", onDragMove, { passive: false });
  window.addEventListener("pointerup", onDragEnd, { passive: false, once: true });
}

function moveGhost(e){
  if (!drag) return;
  drag.ghostEl.style.left = `${e.clientX}px`;
  drag.ghostEl.style.top  = `${e.clientY}px`;
}

function onDragMove(e){
  if (!drag) return;
  e.preventDefault();
  moveGhost(e);

  // Optional: highlight current drop target
  const el = document.elementFromPoint(e.clientX, e.clientY);
  highlightDropTarget(el);
}

function onDragEnd(e){
  if (!drag) return;
  e.preventDefault();

  clearDropHighlights();

  // ✅ HIT-TEST THROUGH OVERLAY:
  const overlay = document.getElementById("bpOverlay");
  const oldDisplay = overlay ? overlay.style.display : null;

  if (overlay) overlay.style.display = "none"; // temporarily hide dim overlay
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (overlay) overlay.style.display = oldDisplay ?? "block";

  const ok = handleDropOnElement(drag.itemId, el);

  if (drag.sourceEl) drag.sourceEl.classList.remove("dragging");
  if (drag.ghostEl) drag.ghostEl.remove();
  drag = null;

  window.removeEventListener("pointermove", onDragMove);
}

function handleDropOnElement(itemId, el){
  if (!el) return false;

  // Walk up the DOM tree to find a drop zone
  const personEl = el.closest?.(".person");
  const fireEl = el.closest?.("#fireDrop");

  const def = getItemDef(itemId);
  if (!def) return false;

  if (personEl){
    const pid = personEl.dataset.pid;
    return applyItemToPerson(itemId, pid);
  }

  if (fireEl){
    return applyItemToFire(itemId);
  }

  return false;
}

// --- optional highlighting ---
function clearDropHighlights(){
  document.querySelectorAll(".dropHint").forEach(n => n.classList.remove("dropHint"));
}
function highlightDropTarget(el){
  clearDropHighlights();
  if (!el) return;
  const p = el.closest?.(".person");
  const f = el.closest?.("#fireDrop");
  if (p) p.classList.add("dropHint");
  else if (f) f.classList.add("dropHint");
}



// ---------- Spawns ----------
function refreshPickups(){
  if (!st.home) return;
  const pickups = getDailyPickups(st, 450);
  els.spawnInfo.textContent = `Today: ${todayKey()}\nPickups remaining: ${pickups.length}`;

  const keep = new Set(pickups.map(p => p.id));
  for (const [id, marker] of pickupMarkers.entries()){
    if (!keep.has(id)){
      map.removeLayer(marker);
      pickupMarkers.delete(id);
    }
  }

  for (const p of pickups){
    if (pickupMarkers.has(p.id)) continue;

    const icon = L.icon({ iconUrl: p.icon, iconSize:[32,32], iconAnchor:[16,16] });
    const marker = L.marker([p.lat, p.lng], { icon, title: p.itemName || p.kind }).addTo(map);
    marker.on("click", () => collectPickup(p));
    marker.on("touchstart", () => collectPickup(p));
    pickupMarkers.set(p.id, marker);
  }
}

function addToBackpack(itemId, qty=1){
  st.backpack.items[itemId] = (st.backpack.items[itemId] || 0) + qty;
  saveState(st);
}

function collectPickup(p){
  if (!myPos) return;

  const d = L.latLng(myPos.lat, myPos.lng).distanceTo(L.latLng(p.lat, p.lng));
  const radius = 35;
  if (d > radius) return;

  addToBackpack(p.itemId, 1);
  markCollected(st, p.id);

  const m = pickupMarkers.get(p.id);
  if (m){ map.removeLayer(m); pickupMarkers.delete(p.id); }

  renderMapHUD();
  renderBackpackOverlay();
  refreshPickups();
}

function autoCollectNearbyPickups(){
  if (!myPos || pickupMarkers.size === 0 || !st.home) return;
  const radius = 35;
  const myLL = L.latLng(myPos.lat, myPos.lng);

  const pickups = getDailyPickups(st, 450);
  const byId = new Map(pickups.map(p => [p.id, p]));

  for (const [id, marker] of pickupMarkers.entries()){
    const d = myLL.distanceTo(marker.getLatLng());
    if (d <= radius){
      const p = byId.get(id);
      if (p) collectPickup(p);
    }
  }
}

// ---------- Family rendering ----------
function ensureNames(){
  let n = 1;
  for (const p of st.family){
    if (!p.name){
      p.name = `Person ${n++}`;
    }
  }
}

function renderFamily(){
  ensureNames();
  els.peopleLayer.innerHTML = "";

  // positions across the log
  const slots = [
    { x: 20,  y: 18 },
    { x: 40,  y: 18 },
    { x: 60,  y: 18 },
    { x: 80,  y: 18 }
  ];

  st.family.slice(0, MAX_PEOPLE).forEach((p, i) => {
    const spot = slots[i] || slots[slots.length-1];

    const div = document.createElement("div");
    div.className = "person";
    div.style.left = `${spot.x}%`;
    div.style.top  = `38%`;
    div.style.transform = "translate(-50%, -50%)";

    div.dataset.pid = p.id;

    // drop target for FOOD
    div.addEventListener("dragover", (e) => { e.preventDefault(); div.classList.add("dropHint"); });
    div.addEventListener("dragleave", () => div.classList.remove("dropHint"));
    div.addEventListener("drop", (e) => {
      e.preventDefault();
      div.classList.remove("dropHint");
      const itemId = e.dataTransfer.getData("text/itemId");
      if (!itemId) return;

      const def = getItemDef(itemId);
      if (!def) return;

      // Only food affects person hunger in this prototype
      // (you can tag items later)
      if (def.id.startsWith("food_")){
        consumeBackpackItem(itemId, 1);
        p.hunger = clamp(p.hunger + Number(def.value || 0), 0, MAX_STAT);
        saveState(st);
        renderFamily();
        renderBackpackOverlay();
        renderMapHUD();
      }
    });

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name;

    const avatar = document.createElement("div");
    avatar.className = "avatar";

    const bars = document.createElement("div");
    bars.className = "bars";

    const hLine = document.createElement("div");
    hLine.className = "barline";
    hLine.innerHTML = `<span style="color:white">Hunger</span><span>${Math.round(p.hunger)}</span>`;

    const hBar = document.createElement("div");
    hBar.className = "bar";
    const hFill = document.createElement("div");
    hFill.className = "fill";
    hFill.style.width = `${(p.hunger / MAX_STAT) * 100}%`;
    hBar.appendChild(hFill);

    const cLine = document.createElement("div");
    cLine.className = "barline";
    cLine.style.marginTop = "6px";
    cLine.innerHTML = `<span style="color:white">Cold</span><span>${Math.round(p.cold)}</span>`;

    const cBar = document.createElement("div");
    cBar.className = "bar";
    const cFill = document.createElement("div");
    cFill.className = "fill";
    cFill.style.width = `${(p.cold / MAX_STAT) * 100}%`;
    cBar.appendChild(cFill);

    bars.appendChild(hLine);
    bars.appendChild(hBar);
    bars.appendChild(cLine);
    bars.appendChild(cBar);
  
   div.appendChild(name);
    div.appendChild(bars);
   
    div.appendChild(avatar);
  

    els.peopleLayer.appendChild(div);
  });

  els.fireFuelVal.textContent = String(Math.round(st.fireFuel || 0));
}

function consumeBackpackItem(itemId, qty){
  const cur = st.backpack.items[itemId] || 0;
  const next = Math.max(0, cur - qty);
  if (next === 0) delete st.backpack.items[itemId];
  else st.backpack.items[itemId] = next;
  saveState(st);
}

function renderMapHUD(){
  // simple count display
  const items = st.backpack.items || {};
  const total = Object.values(items).reduce((a,b)=>a+b,0);
  els.backpackCounts.textContent = `Items: ${total}`;
}

function applyItemToPerson(itemId, personId){
  const def = getItemDef(itemId);
  if (!def) return false;

  // Decide what counts as food.
  // For now: treat items from food.json as food by checking id prefix.
  // Better later: add "category" field in JSON.
  const isFood = String(def.id || "").startsWith("food_");
  if (!isFood) return false;

  if (!st.backpack.items[itemId]) return false;

  const p = st.family.find(x => x.id === personId);
  if (!p) return false;

  consumeBackpackItem(itemId, 1);
  p.hunger = clamp(p.hunger + Number(def.value || 0), 0, MAX_STAT);

  saveState(st);
  renderFamily();
  renderBackpackOverlay();
  renderMapHUD();
  return true;
}

function applyItemToFire(itemId){
  const def = getItemDef(itemId);
  if (!def) return false;

  const isFuel = String(def.id || "").startsWith("fuel_");
  if (!isFuel) return false;

  if (!st.backpack.items[itemId]) return false;

  consumeBackpackItem(itemId, 1);

  st.fireFuel = (st.fireFuel || 0) + Number(def.value || 0);

  const n = Math.max(1, st.family.length);
  const warmPer = Number(def.value || 0) / n;
  for (const p of st.family){
    p.cold = clamp(p.cold + warmPer, 0, MAX_STAT);
  }

  saveState(st);
  renderFamily();
  renderBackpackOverlay();
  renderMapHUD();
  return true;
}



// ---------- Backpack overlay (drag source) ----------
function openBackpack(){
  els.bpOverlay.style.display = "block";
  renderBackpackOverlay();
}
function closeBackpack(){
  els.bpOverlay.style.display = "none";
}

function renderBackpackOverlay(){
  const items = st.backpack.items || {};
  els.bpGrid.innerHTML = "";

  const entries = Object.entries(items);
  if (entries.length === 0){
    const d = document.createElement("div");
    d.className = "small";
    d.textContent = "Backpack is empty.";
    els.bpGrid.appendChild(d);
    return;
  }

  for (const [itemId, qty] of entries){
    const def = getItemDef(itemId);
    if (!def) continue;

    const card = document.createElement("div");
    card.className = "bpItem";
   
    card.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startDragItem(e, itemId);
  });
  card.style.touchAction = "none";



    const img = document.createElement("img");
    img.src = def.displayImg || def.pickupImg || "assets/food1.png";
    img.alt = def.name || itemId;
img.draggable = false;

    const q = document.createElement("div");
    q.className = "bpQty";
    q.textContent = `x${qty}`;

    card.appendChild(img);
    card.appendChild(q);

    els.bpGrid.appendChild(card);
  }
}


// ---------- Buttons / flows ----------
function addPerson(){
  if (st.family.length >= MAX_PEOPLE) return;

  const id = "p_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  st.family.push({
    id,
    name: `Person ${st.family.length + 1}`,
    hunger: MAX_STAT,
    cold: MAX_STAT,
    equipment: { hat: null, shirt: null } // placeholder for clothes
  });
  saveState(st);
  renderFamily();
}

function openHomeSettings(){
  setActiveView("viewMap");
  showSetupPanel(true);
  showWalkFreq(true);
  if (map) map.invalidateSize();
}

function setHomeFromCandidate(){
  const cand = getBestHomeCandidate();
  if (!cand){
    alert("Click the map to pick a home location.");
    return;
  }
  st.home = { lat: cand.lat, lng: cand.lng };
  st._centeredOnce = true;
  saveState(st);
  setHomeMarker();
  if (map) map.setView([st.home.lat, st.home.lng], 16);
  refreshPickups();
}

// ---------- Time jump ----------
function doTimeJump(){
  applyTimeJump(st);
  saveState(st);
  renderFamily();
}

// ---------- GPS ----------
function startGeolocation(){
  if (!navigator.geolocation){
    console.warn("Geolocation not supported.");
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => {
      myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMyMarker();

      if (!st._centeredOnce && map){
        map.setView([myPos.lat, myPos.lng], 16);
        st._centeredOnce = true;
        saveState(st);
      }

      refreshPickups();
      autoCollectNearbyPickups();
    },
    (err) => console.warn(err),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
  );
}

// ---------- Boot ----------
(async function boot(){
  // defaults
  els.walkFreq.value = st.walkFreq || "normal";

  initMap();
  setHomeMarker();

  // view buttons
  els.btnToFamily.addEventListener("click", () => setActiveView("viewFamily"));
  els.btnToMap.addEventListener("click", () => {
    setActiveView("viewMap");
    showSetupPanel(false);
    showWalkFreq(false);
    if (map) map.invalidateSize();
  });

  // family buttons
  els.btnAddMember.addEventListener("click", addPerson);
  els.btnMoveHome.addEventListener("click", openHomeSettings);

  // setup panel
  els.btnSetHomeHere.addEventListener("click", setHomeFromCandidate);
  els.walkFreq.addEventListener("change", () => {
    st.walkFreq = els.walkFreq.value;
    saveState(st);
    doTimeJump();
  });

  // backpack overlay
  els.btnBackpack.addEventListener("click", openBackpack);
  els.bpClose.addEventListener("click", closeBackpack);
  els.bpOverlay.addEventListener("click", (e) => {
    if (e.target === els.bpOverlay) closeBackpack();
  });



  // load tables
  await loadSpawnTables();
  await loadCatalog();

  // start on family view
  setActiveView("viewFamily");

  // hide setup unless invoked
  showSetupPanel(false);
  showWalkFreq(false);

  // initial renders
  renderMapHUD();
  renderFamily();
  refreshPickups();

  // time jump on resume + periodic
  doTimeJump();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) doTimeJump(); });
  setInterval(doTimeJump, 60_000);

  startGeolocation();
})();
