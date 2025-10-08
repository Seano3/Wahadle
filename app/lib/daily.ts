import { connect } from "node:http2";
import { loadUnits } from "./csv";

export async function dailyIndex(d = new Date()): Promise<number> {
  const ymd = `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, "0")}-${d.getUTCDate().toString().padStart(2, "0")}`;
  let h = 2166136261;
  for (let i = 0; i < ymd.length; i++) { h ^= ymd.charCodeAt(i); h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24); }
  const units = await loadUnits();
  return Math.abs(h) % units.length;
}

export async function getDailyUnit() {
  const units = await loadUnits();
  const idx = await dailyIndex();
  const target = units[idx];
  console.log("🎯 Today's target unit is:", target["Unit Name"], target);
  return target;
}