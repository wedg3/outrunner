// scripts/timejump.js
import { clamp, MAX_STAT, nowMs, saveState } from "./state.js";

function walkMult(walkFreq){
  if (walkFreq === "easy") return 0.6;
  if (walkFreq === "hard") return 1.6;
  return 1.0;
}

// This is the “time jump” logic.
// It decreases hunger and cold over elapsed time.
// We clamp elapsed time to avoid absurd jumps.
export function applyTimeJump(st){
  const t0 = st.lastTickMs ?? nowMs();
  const t1 = nowMs();

  // If user clock went backwards a lot, ignore.
  if (t1 < t0 - 5 * 60 * 1000){
    st.lastTickMs = t1;
    saveState(st);
    return { dtHours: 0, note: "Clock anomaly ignored." };
  }

  const dtMs = t1 - t0;
  const dtHoursRaw = dtMs / 3600000;

  // clamp time jump so it stays playable
  const dtHours = clamp(dtHoursRaw, 0, 48);

  const mult = walkMult(st.walkFreq);

  // rates per hour (tune later!)
  const hungerRate = 1.2 * mult; // points/hour
  const coldRate   = 0.9 * mult; // points/hour

  let changed = false;

  for (const p of st.family){
    const newH = clamp(p.hunger - hungerRate * dtHours, 0, MAX_STAT);
    const newC = clamp(p.cold   - coldRate   * dtHours, 0, MAX_STAT);
    if (newH !== p.hunger || newC !== p.cold) changed = true;
    p.hunger = newH;
    p.cold   = newC;
  }

  st.lastTickMs = t1;
  if (changed) saveState(st);
  return { dtHours, note: dtHoursRaw > 48 ? "Time jump clamped to 48h." : "" };
}

// Deliver backpack to family (simple prototype logic)
export function deliverBackpack(st){
  const food = st.backpack.food || 0;
  const fuel = st.backpack.fuel || 0;

  if (!st.family.length) return { ok:false, msg:"No family members yet." };
  if (food === 0 && fuel === 0) return { ok:false, msg:"Backpack is empty." };

  // Prototype values:
  // each food gives +18 hunger distributed evenly
  // each fuel gives +14 cold distributed evenly
  const hungerGainTotal = food * 18;
  const coldGainTotal = fuel * 14;

  const per = st.family.length;
  const hungerPer = hungerGainTotal / per;
  const coldPer = coldGainTotal / per;

  for (const p of st.family){
    p.hunger = clamp(p.hunger + hungerPer, 0, MAX_STAT);
    p.cold   = clamp(p.cold   + coldPer,   0, MAX_STAT);
  }

  st.backpack.food = 0;
  st.backpack.fuel = 0;
  saveState(st);
  return { ok:true, msg:`Delivered ${food} food and ${fuel} fuel.` };
}
