// scripts/familyView.js
import { MAX_STAT, distanceM, HOME_RADIUS_M } from "./state.js";

export function initFamilyView({
  getState,
  saveState,
  getMyPos,
  setActiveView,
  showSetupPanel,
  getBestHomeCandidate,
  renderAll,
}){
  const btnAdd = document.getElementById("btnAddMember");
  const btnMoveHome = document.getElementById("btnMoveHome");
  const listEl = document.getElementById("familyList");
  const noteEl = document.getElementById("familyNote");

  function withinHomeForDeliver(st, myPos){
    if (!st.home) return false;
    // desktop/test mode: if no GPS, allow
    if (!myPos) return true;
    return distanceM(st.home, myPos) <= HOME_RADIUS_M;
  }

  function render(){
    const st = getState();
    const myPos = getMyPos();

    // Note text
    if (!st.home){
      noteEl.textContent = "No home set yet. Tap the house icon to set your home location.";
    } else {
      const near = withinHomeForDeliver(st, myPos);
      noteEl.textContent = near
        ? "You are at home. Deliver supplies from the top bar."
        : "Family view is always available. To deliver items, return home.";
    }

    // List
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

      // Hunger
      const hLab = document.createElement("div");
      hLab.className = "barlabel";
      hLab.textContent = `Hunger: ${Math.round(p.hunger)} / ${MAX_STAT}`;

      const hBar = document.createElement("div");
      hBar.className = "bar";
      const hFill = document.createElement("div");
      hFill.style.width = `${(p.hunger / MAX_STAT) * 100}%`;
      hBar.appendChild(hFill);

      // Cold
      const cLab = document.createElement("div");
      cLab.className = "barlabel";
      cLab.textContent = `Cold: ${Math.round(p.cold)} / ${MAX_STAT}`;

      const cBar = document.createElement("div");
      cBar.className = "bar";
      const cFill = document.createElement("div");
      cFill.style.width = `${(p.cold / MAX_STAT) * 100}%`;
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

  // Wire events once
  btnAdd.addEventListener("click", () => {
    const st = getState();
    const id = "p_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
    st.family.push({ id, hunger: MAX_STAT, cold: MAX_STAT });
    saveState(st);
    renderAll();
  });

  btnMoveHome.addEventListener("click", () => {
    const st = getState();
    const cand = getBestHomeCandidate();
    if (!cand){
      alert("Click the map to pick a home location.");
      return;
    }

    st.home = { lat: cand.lat, lng: cand.lng };
    st._centeredOnce = true;
    saveState(st);

    // show setup panel when home-management is invoked
    setActiveView("viewMap");
    showSetupPanel(true);
        const walkWrap = document.getElementById("walkWrap");
        if (walkWrap) walkWrap.style.display = "block";


    renderAll();
  });

  return { render };
}
