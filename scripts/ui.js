// scripts/ui.js
import { HOME_RADIUS_M, distanceM, MAX_STAT } from "./state.js";

export function setActiveView(id){
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

export function withinHome(st, myPos){
  if (!st.home) return false;

  // Desktop/test mode: if we don't have GPS, allow family access.
  if (!myPos) return true;

  return distanceM(st.home, myPos) <= HOME_RADIUS_M;
}


export function updateStatus(el, st, myPos){
  const home = st.home ? `Home set` : `Home not set`;
  const pos = myPos ? `GPS ok` : `Waiting GPS`;
  let distTxt = "";
  if (st.home && myPos){
    const d = distanceM(st.home, myPos);
    distTxt = ` | dist to home: ${Math.round(d)}m`;
  }
  el.textContent = `${home} | ${pos}${distTxt}`;
}

export function updateBackpack(el, st){
  el.innerHTML = `Food: ${st.backpack.food || 0}<br/>Fuel: ${st.backpack.fuel || 0}`;
}

export function renderFamily(listEl, noteEl, st, canAccess){
  if (!st.home){
  noteEl.textContent = "No home set yet. Tap the house icon to set your home location.";
} else {
  noteEl.textContent = "Family view is always available. To deliver items, return home.";
}

  listEl.innerHTML = "";
  if (!st.family.length){
    const d = document.createElement("div");
    d.className = "small";
    d.textContent = "No members yet. Press “+ Add member”.";
    listEl.appendChild(d);
    return;
  }

  for (const p of st.family){
    const row = document.createElement("div");
    row.className = "row";

    const img = document.createElement("img");
    img.className = "avatar";
    img.src = "assets/person.png";
    img.alt = "person";

    const bars = document.createElement("div");
    bars.className = "bars";

    const hLab = document.createElement("div");
    hLab.className = "barlabel";
    hLab.textContent = `Hunger: ${Math.round(p.hunger)} / ${MAX_STAT}`;

    const hBar = document.createElement("div");
    hBar.className = "bar";
    const hFill = document.createElement("div");
    hFill.style.width = `${(p.hunger/MAX_STAT)*100}%`;
    hBar.appendChild(hFill);

    const cLab = document.createElement("div");
    cLab.className = "barlabel";
    cLab.textContent = `Cold: ${Math.round(p.cold)} / ${MAX_STAT}`;

    const cBar = document.createElement("div");
    cBar.className = "bar";
    const cFill = document.createElement("div");
    cFill.style.width = `${(p.cold/MAX_STAT)*100}%`;
    cBar.appendChild(cFill);

    bars.appendChild(hLab);
    bars.appendChild(hBar);
    bars.appendChild(cLab);
    bars.appendChild(cBar);

    row.appendChild(img);
    row.appendChild(bars);

    listEl.appendChild(row);
  }
}
