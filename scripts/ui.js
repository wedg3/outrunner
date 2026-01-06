// scripts/ui.js
import { HOME_RADIUS_M, distanceM } from "./state.js";

export function setActiveView(id){
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

export function withinHome(st, myPos){
  if (!st.home) return false;
  if (!myPos) return true; // desktop/test mode
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
