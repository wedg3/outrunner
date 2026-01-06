// scripts/app.js
import { loadState, saveState, setWalkFreq, addFamilyMember } from "./state.js";
import { applyTimeJump, deliverBackpack } from "./timejump.js";
import { loadSpawnTables, getDailyPickups, markCollected, todayKey } from "./spawns.js";
import { setActiveView, withinHome, updateStatus, updateBackpack, renderFamily } from "./ui.js";

let st = loadState();

const els = {
  btnFamily: document.getElementById("btnFamily"),
  btnMap: document.getElementById("btnMap"),
  btnDeliver: document.getElementById("btnDeliver"),
  btnSetHomeHere: document.getElementById("btnSetHomeHere"),
  btnAddMember: document.getElementById("btnAddMember"),
  walkFreq: document.getElementById("walkFreq"),
  status: document.getElementById("status"),
  homeInfo: document.getElementById("homeInfo"),
  backpackCounts: document.getElementById("backpackCounts"),
  spawnInfo: document.getElementById("spawnInfo"),
  familyList: document.getElementById("familyList"),
    btnMoveHome: document.getElementById("btnMoveHome"),
  familyNote: document.getElementById("familyNote")


};

els.walkFreq.value = st.walkFreq || "normal";

let map, myMarker, homeMarker;
let myPos = null;
let lastMapClickPos = null; // { lat, lng } from map clicks (desktop-friendly)

let pickupMarkers = new Map(); // id -> marker

function initMap(){
  const start = st.home ? [st.home.lat, st.home.lng] : [59.33, 18.06];
  const startZoom = st.home ? 16 : 13;

  map = L.map("map", { zoomControl: true }).setView(start, startZoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

    map.on("click", (e) => {
    lastMapClickPos = { lat: e.latlng.lat, lng: e.latlng.lng };
    // quick feedback:
    L.popup()
      .setLatLng(e.latlng)
      .setContent("Selected location")
      .openOn(map);
  });

  // If home exists, don't auto-center to player on first GPS fix
  if (st.home) {
    st._centeredOnce = true;
    saveState(st);
  }

  map.on("moveend", () => refreshPickups());
}

function showSetupPanel(show){
  const el = document.getElementById("setupPanel");
  if (!el) return;
  el.style.display = show ? "block" : "none";
}


function getBestHomeCandidate(){
  // Priority: GPS position, then last map click, then map center
  if (myPos) return { lat: myPos.lat, lng: myPos.lng };
  if (lastMapClickPos) return { ...lastMapClickPos };
  if (map){
    const c = map.getCenter();
    return { lat: c.lat, lng: c.lng };
  }
  return null;
}

function setHomeUI(){
  if (!st.home){
    els.homeInfo.textContent = "Home: not set";
    if (homeMarker){
      map.removeLayer(homeMarker);
      homeMarker = null;
    }
    return;
  }

  els.homeInfo.textContent = `Home: ${st.home.lat.toFixed(5)}, ${st.home.lng.toFixed(5)}`;

  const homeIcon = L.icon({
    iconUrl: "assets/home.png",
    iconSize: [40, 40],       // tweak if needed
    iconAnchor: [20, 40],     // bottom-center sits on location
    popupAnchor: [0, -36]
  });

  if (!homeMarker){
    homeMarker = L.marker(
      [st.home.lat, st.home.lng],
      { icon: homeIcon, title: "Home" }
    ).addTo(map);
  } else {
    homeMarker.setLatLng([st.home.lat, st.home.lng]);
    homeMarker.setIcon(homeIcon); // ensures icon stays correct
  }
}




function setMyMarker(){
  if (!myPos) return;
  if (!myMarker){
    myMarker = L.circleMarker([myPos.lat, myPos.lng], {
      radius: 8,
      weight: 2
    }).addTo(map);
  } else {
    myMarker.setLatLng([myPos.lat, myPos.lng]);
  }
}

function clearPickupMarkers(){
  for (const m of pickupMarkers.values()){
    map.removeLayer(m);
  }
  pickupMarkers.clear();
}

function refreshPickups(){
  if (!st.home || !map) return;

  // Daily spawns centered on home
  const pickups = getDailyPickups(st, 450);

  // Update info text
  const key = todayKey();
  els.spawnInfo.textContent = `Today: ${key}\nPickups remaining: ${pickups.length}`;

  // Remove markers not in list
  const keep = new Set(pickups.map(p => p.id));
  for (const [id, marker] of pickupMarkers.entries()){
    if (!keep.has(id)){
      map.removeLayer(marker);
      pickupMarkers.delete(id);
    }
  }

  // Add missing markers
  for (const p of pickups){
    if (pickupMarkers.has(p.id)) continue;

    const icon = L.icon({
      iconUrl: p.icon,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([p.lat, p.lng], { icon, title: p.kind }).addTo(map);
    marker.on("click", () => collectPickup(p));
    pickupMarkers.set(p.id, marker);
  }
}

function collectPickup(p){
  // Require GPS position to collect, and a simple distance check to avoid “teleport clicking”
  if (!myPos) return;

  const d = L.latLng(myPos.lat, myPos.lng).distanceTo(L.latLng(p.lat, p.lng));
  if (d > 35){
    alert(`Too far away (${Math.round(d)}m). Walk closer.`);
    return;
  }

  if (p.kind === "food") st.backpack.food = (st.backpack.food || 0) + 1;
  if (p.kind === "fuel") st.backpack.fuel = (st.backpack.fuel || 0) + 1;

  markCollected(st, p.id);

  // remove marker
  const m = pickupMarkers.get(p.id);
  if (m){ map.removeLayer(m); pickupMarkers.delete(p.id); }

  updateBackpack(els.backpackCounts, st);
  refreshPickups();
}

function doTimeJumpAndRender(){
  const res = applyTimeJump(st);
  if (res.dtHours > 0.01 || res.note){
    // optional: show a small log in console
    console.log("Time jump:", res);
  }
  saveState(st);
  renderAll();
}

function renderAll(){
  setHomeUI();
  updateStatus(els.status, st, myPos);
  updateBackpack(els.backpackCounts, st);

  const hasHome = !!st.home;
const nearHome = withinHome(st, myPos);

// Family view should always be accessible
renderFamily(els.familyList, els.familyNote, st, hasHome);

// Only “deliver” is gated (you can choose: require nearHome or just hasHome)
els.btnFamily.disabled = false;
els.btnDeliver.disabled = !(hasHome && nearHome);


  if (map) refreshPickups();
}

function wireUI(){
els.btnSetHomeHere.addEventListener("click", () => {
  const cand = getBestHomeCandidate();
  if (!cand){
    alert("Click the map to pick a home location.");
    return;
  }
  st.home = { lat: cand.lat, lng: cand.lng };
  st._centeredOnce = true;
  saveState(st);
  if (map) map.setView([st.home.lat, st.home.lng], 16);
  renderAll();
  });

  els.btnAddMember.addEventListener("click", () => {
    addFamilyMember(st);
    renderAll();
  });

els.btnMoveHome.addEventListener("click", () => {
  const cand = getBestHomeCandidate();
  if (!cand){
    alert("Click the map to pick a home location.");
    return;
  }
  st.home = { lat: cand.lat, lng: cand.lng };
  st._centeredOnce = true;
  saveState(st);

  setActiveView("viewMap");
  showSetupPanel(true);    // 👈 SHOW setup panel explicitly
  if (map) map.setView([st.home.lat, st.home.lng], 16);
  renderAll();
});



  els.walkFreq.addEventListener("change", () => {
    setWalkFreq(st, els.walkFreq.value);
    doTimeJumpAndRender(); // apply new rate going forward
  });

  els.btnFamily.addEventListener("click", () => {
    // only if near home (button is disabled otherwise)
    setActiveView("viewFamily");
    renderAll();
  });

els.btnMap.addEventListener("click", () => {
  setActiveView("viewMap");
  showSetupPanel(false);   // 👈 hide when gathering
  if (map) map.invalidateSize();
  renderAll();
});


  els.btnDeliver.addEventListener("click", () => {
    const canAccess = withinHome(st, myPos);
    if (!canAccess){
      alert("You must be at home to deliver.");
      return;
    }
    const res = deliverBackpack(st);
    alert(res.msg);
    renderAll();
  });

  // time-jump when returning to tab
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden){
      doTimeJumpAndRender();
    }
  });

  // periodic tick while open (keeps stats moving a little)
  setInterval(() => {
    // update lastTick so stats drift over time while open, too
    doTimeJumpAndRender();
  }, 60_000);
}

function startGeolocation(){
  if (!navigator.geolocation){
    alert("Geolocation not supported in this browser.");
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMyMarker();
      updateStatus(els.status, st, myPos);

      // If home is set and map not centered, you can keep the view around player a bit:
      // (leave it simple: only auto-center the first time)
      if (!st._centeredOnce && map){
        map.setView([myPos.lat, myPos.lng], 16);
        st._centeredOnce = true;
        saveState(st);
      }

      renderAll();
    },
    (err) => {
      console.warn(err);
      alert("GPS error. Make sure location is allowed.");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 15000
    }
  );
}

// Boot
initMap();
showSetupPanel(false);
wireUI();

// Load spawn tables first, then start gameplay
(async () => {
  try {
    await loadSpawnTables();
  } catch (e) {
    console.error(e);
    alert("Failed to load item tables (food.json / fuel.json). Check /content/ paths.");
  }

  doTimeJumpAndRender();
  startGeolocation();
})();
