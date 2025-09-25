import { NextResponse } from "next/server";
import { loadUnits } from "@/app/lib/csv";
import { getDailyUnit } from "@/app/lib/daily";
import { Feedback, StatKey, UnitRow } from "@/app/types";
import { Console } from "console";

const FIELDS: StatKey[] = [
  "Movement", "Toughness", "Save", "Invunl Save", "Wounds", "Leadership", "OC", "Points", "Model Count", "Faction"
];

function compareNumeric(a: number | null, b: number | null): "correct" | "higher" | "lower" | "close-higher" | "close-lower" | "mismatch" {
  if (a == null && b == null) return "correct";
  if ((a == null && b != null) || (b == null && a != null)) return "mismatch"; //Checks for infuln saves 
  if (a === b) return "correct";
  if (Math.abs(a - b) === 1) return a > b ? "close-higher" : "close-lower"; // Check if the guess is within 1 of the target
  if (a === null || b === null) return "mismatch"; //This should never be hit but its here for errors 
  return a > b ? "higher" : "lower";
}

function judge(guess: UnitRow, target: UnitRow): Feedback[] {
  return FIELDS.map((f) => {
    if (f === "Faction") {
      const g = (guess["Faction"] || "").toUpperCase();
      const t = (target["Faction"] || "").toUpperCase();
      console.log("Comparing factions:", g, t);
      if (g === t) return { field: f, status: "correct" };

      // Map known faction codes into higher-order groups
      const imperium = new Set(["Adeptus Custodes", "Adeptus Mechanicus", "Astra Militarum", "Agents", "Adepta Sororitas", "Grey Knights", "Imperial Knights", "Adeptus Titanicus"].map(s => s.toUpperCase()));
      const spaceMarines = new Set(["Space Marines", "Blood Angels", "Dark Angels", "Space Wolves", "Ultramarines", "Salamanders", "Iron Hands", "Raven Guard", "White Scars", "Black Templars", "Crimson Fists", "Deathwatch"].map(s => s.toUpperCase()));
      const chaos = new Set(["Chaos Daemons", "Chaos Space Marines", "Death Guard", "Emperor’s Children", "Chaos Knights", "Thousand Sons", "World Eaters"].map(s => s.toUpperCase()));
      const eldar = new Set(["Aeldari", "Drukhari"].map(s => s.toUpperCase()));
      const hiveMinde = new Set(["Genestealer Cults", "Tyranids"].map(s => s.toUpperCase()));
      const xenos = new Set(["Necrons", "Orks", "T’au Empire", "Leagues of Votann"].map(s => s.toUpperCase()));
      const none = new Set(["Unaligned Forces"].map(s => s.toUpperCase()));


      const inImperium = imperium.has(g) && imperium.has(t);
      const inChaos = chaos.has(g) && chaos.has(t);
      const inXenos = xenos.has(g) && xenos.has(t);
      const inEldar = eldar.has(g) && eldar.has(t);
      const inHiveMind = hiveMinde.has(g) && hiveMinde.has(t);
      const inSpaceMarines = spaceMarines.has(g) && spaceMarines.has(t);
      const inNoneOfTheAbove = none.has(g) && none.has(t);

      if (inImperium || inChaos || inXenos || inEldar || inHiveMind || inSpaceMarines || inNoneOfTheAbove) return { field: f, status: "related" };
      return { field: f, status: "mismatch" };
    }
    const status = compareNumeric(guess[f] as any, target[f] as any);
    return { field: f, status };
  });
}

export async function POST(req: Request) {
  const { name } = await req.json();
  const units = loadUnits();
  const target = getDailyUnit();
  const guess = units.find(u => u["Unit Name"].toLowerCase() === String(name).toLowerCase());
  if (!guess) return NextResponse.json({ error: "Unknown unit" }, { status: 404 });
  const feedback = judge(guess, target);
  const solved = feedback.every(f => f.status === "correct");
  return NextResponse.json({ feedback, solved, guess: { name: guess["Unit Name"], faction: guess["Faction"] } });
}