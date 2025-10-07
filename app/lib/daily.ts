import { loadUnits } from "./csv";

export function dailyIndexForDate(d = new Date(), total = 1): number {
  const ymd = `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, "0")}-${d.getUTCDate().toString().padStart(2, "0")}`;
  let h = 2166136261;
  for (let i = 0; i < ymd.length; i++) { h ^= ymd.charCodeAt(i); h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24); }
  return Math.abs(h) % Math.max(1, total);
}

export async function getDailyUnit(d = new Date()) {
  const units = await loadUnits();
  const idx = dailyIndexForDate(d, units.length);
  const target = units[idx];
  console.log("🎯 Today's target unit is:", target?.["Unit Name"], target);
  return target;
}