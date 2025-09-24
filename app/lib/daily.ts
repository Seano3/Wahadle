import { loadUnits } from "./csv";

export function dailyIndex(d = new Date()): number {
  const ymd = `${d.getUTCFullYear()}-${(d.getUTCMonth()+1).toString().padStart(2,"0")}-${d.getUTCDate().toString().padStart(2,"0")}`;
  let h = 2166136261;
  for (let i=0;i<ymd.length;i++) { h ^= ymd.charCodeAt(i); h += (h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24); }
  const units = loadUnits();
  return Math.abs(h) % units.length;
}

export function getDailyUnit() {
  const units = loadUnits();
  return units[dailyIndex()];
}