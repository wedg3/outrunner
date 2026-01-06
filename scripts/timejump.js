// scripts/timejump.js
import { clamp, MAX_STAT, nowMs, saveState } from "./state.js";

function walkMult(walkFreq){
  if (walkFreq === "easy") return 0.6;
  if (walkFreq === "hard") return 1.6;
  return 1.0;
}

export function applyTimeJump(st){
  const t0 = st.lastTickMs ?? nowMs();
  const t1 = nowMs();

  if (t1 < t0 - 5 * 60 * 1000){
    st.lastTickMs = t1;
    saveState(st);
    return { dtHours: 0, note: "Clock anomaly ignored." };
  }

  const dtMs = t1 - t0;
  const dtHoursRaw = dtMs / 3600000;
  const dtHours = clamp(dtHoursRaw, 0, 48);

  const mult = walkMult(st.walkFreq);

  // Tune later
  const hungerRate = 1.2 * mult;
  const coldRate   = 0.9 * mult;

  for (const p of st.family){
    p.hunger = clamp(p.hunger - hungerRate * dtHours, 0, MAX_STAT);
    p.cold   = clamp(p.cold   - coldRate   * dtHours, 0, MAX_STAT);
  }

  st.lastTickMs = t1;
  saveState(st);
  return { dtHours, note: dtHoursRaw > 48 ? "Time jump clamped to 48h." : "" };
}
