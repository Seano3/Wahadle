import { Feedback, StatKey, UnitRow } from "@/app/types";

export const FIELDS: StatKey[] = [
  "Movement",
  "Toughness",
  "Save",
  "Invunl Save",
  "Wounds",
  "Leadership",
  "OC",
  "Points",
  "Model Count",
  "Faction",
];

export function compareNumeric(
  a: number | null,
  b: number | null
): "correct" | "higher" | "lower" | "close-higher" | "close-lower" | "mismatch" {
  if (a == null && b == null) return "correct";
  if ((a == null && b != null) || (b == null && a != null)) return "mismatch";
  if (a === b) return "correct";
  if (a === null || b === null) return "mismatch";
  if (Math.abs(a - b) === 1) return a > b ? "close-higher" : "close-lower";
  return a > b ? "higher" : "lower";
}

// Faction "grand order" groupings -- guessing a unit from the same
// broad alignment (but wrong faction) gives a partial-credit tile,
// similar to Wordle's yellow. Source: Wahapedia faction list.
const FACTION_GROUPS: ReadonlySet<string>[] = [
  new Set(
    [
      "Adeptus Custodes",
      "Adeptus Mechanicus",
      "Astra Militarum",
      "Imperial Agents",
      "Adepta Sororitas",
      "Grey Knights",
      "Imperial Knights",
      "Adeptus Titanicus",
    ].map((s) => s.toUpperCase())
  ),
  new Set(
    [
      "Space Marines",
      "Blood Angels",
      "Dark Angels",
      "Space Wolves",
      "Ultramarines",
      "Salamanders",
      "Iron Hands",
      "Raven Guard",
      "White Scars",
      "Black Templars",
      "Crimson Fists",
      "Deathwatch",
    ].map((s) => s.toUpperCase())
  ),
  new Set(
    [
      "Chaos Daemons",
      "Chaos Space Marines",
      "Death Guard",
      "Emperor’s Children",
      "Chaos Knights",
      "Thousand Sons",
      "World Eaters",
    ].map((s) => s.toUpperCase())
  ),
  new Set(
    [
      "Necrons",
      "Orks",
      "T’au Empire",
      "Leagues of Votann",
      "Genestealer Cults",
      "Tyranids",
      "Aeldari",
      "Drukhari",
    ].map((s) => s.toUpperCase())
  ),
  new Set(["Unaligned Forces", "Unbound Adversaries"].map((s) => s.toUpperCase())),
];

function judgeFaction(guessFaction: string, targetFaction: string): Feedback {
  const g = guessFaction.toUpperCase();
  const t = targetFaction.toUpperCase();

  if (g === t) return { field: "Faction", status: "correct", data: guessFaction };

  const sameGroup = FACTION_GROUPS.some((group) => group.has(g) && group.has(t));
  if (sameGroup) return { field: "Faction", status: "related", data: null };

  return { field: "Faction", status: "mismatch", data: null };
}

function judgePoints(guessPoints: number | null, targetPoints: number | null): Feedback {
  if (guessPoints == null || targetPoints == null) {
    return {
      field: "Points",
      status: compareNumeric(guessPoints, targetPoints),
      data: guessPoints,
    };
  }
  const diff = Math.abs(guessPoints - targetPoints);
  if (diff === 0) return { field: "Points", status: "correct", data: guessPoints };
  if (diff <= 50) {
    return {
      field: "Points",
      status: guessPoints > targetPoints ? "close-higher" : "close-lower",
      data: guessPoints,
    };
  }
  return {
    field: "Points",
    status: guessPoints > targetPoints ? "higher" : "lower",
    data: guessPoints,
  };
}

const SUFFIXED_FIELDS = new Set<StatKey>(["Save", "Invunl Save", "Leadership"]);

export function judge(guess: UnitRow, target: UnitRow): Feedback[] {
  return FIELDS.map((field) => {
    if (field === "Faction") return judgeFaction(guess.Faction, target.Faction);
    if (field === "Points") return judgePoints(guess.Points, target.Points);

    const guessValue = guess[field] as number | null;
    const targetValue = target[field] as number | null;
    const status = compareNumeric(guessValue, targetValue);

    const data =
      guessValue !== null && SUFFIXED_FIELDS.has(field)
        ? `${guessValue}+`
        : guessValue;

    return { field, status, data };
  });
}
