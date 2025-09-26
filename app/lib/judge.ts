import { Feedback, StatKey, UnitRow } from "@/app/types";

export const FIELDS: StatKey[] = [
    "Movement", "Toughness", "Save", "Invunl Save", "Wounds", "Leadership", "OC", "Points", "Model Count", "Faction"
];

export function compareNumeric(a: number | null, b: number | null): "correct" | "higher" | "lower" | "close-higher" | "close-lower" | "mismatch" {
    if (a == null && b == null) return "correct";
    if ((a == null && b != null) || (b == null && a != null)) return "mismatch";
    if (a === b) return "correct";
    if (a === null || b === null) return "mismatch";
    if (Math.abs(a - b) === 1) return a > b ? "close-higher" : "close-lower";
    return a > b ? "higher" : "lower";
}

export function judge(guess: UnitRow, target: UnitRow): Feedback[] {
    return FIELDS.map((f) => {
        if (f === "Faction") {
            const g = (guess["Faction"] || "").toUpperCase();
            const t = (target["Faction"] || "").toUpperCase();
            if (g === t) return { field: f, status: "correct", data: g } as Feedback;

            const imperium = new Set(["Adeptus Custodes", "Adeptus Mechanicus", "Astra Militarum", "Agents", "Adepta Sororitas", "Grey Knights", "Imperial Knights", "Adeptus Titanicus"].map(s => s.toUpperCase()));
            const spaceMarines = new Set(["Space Marines", "Blood Angels", "Dark Angels", "Space Wolves", "Ultramarines", "Salamanders", "Iron Hands", "Raven Guard", "White Scars", "Black Templars", "Crimson Fists", "Deathwatch"].map(s => s.toUpperCase()));
            const chaos = new Set(["Chaos Daemons", "Chaos Space Marines", "Death Guard", "Emperor’s Children", "Chaos Knights", "Thousand Sons", "World Eaters"].map(s => s.toUpperCase()));
            const xenos = new Set(["Necrons", "Orks", "T’au Empire", "Leagues of Votann", "Genestealer Cults", "Tyranids", "Aeldari", "Drukhari"].map(s => s.toUpperCase()));
            const none = new Set(["Unaligned Forces"].map(s => s.toUpperCase()));

            const inImperium = imperium.has(g) && imperium.has(t);
            const inChaos = chaos.has(g) && chaos.has(t);
            const inXenos = xenos.has(g) && xenos.has(t);
            const inSpaceMarines = spaceMarines.has(g) && spaceMarines.has(t);
            const inNoneOfTheAbove = none.has(g) && none.has(t);

            if (inImperium || inChaos || inXenos || inSpaceMarines || inNoneOfTheAbove) return { field: f, status: "related", data: null } as Feedback;
            return { field: f, status: "mismatch", data: null } as Feedback;
        }

        if (f === "Points") {
            const g = guess["Points"];
            const t = target["Points"];
            if (g !== null && t !== null && Math.abs(g - t) == 0) {
                return { field: f, status: "correct", data: g } as Feedback;
            }
            if (g !== null && t !== null && Math.abs(g - t) <= 50) {
                return { field: f, status: g > t ? "close-higher" : "close-lower", data: g } as Feedback;
            }
        }

        const status = compareNumeric(guess[f] as any, target[f] as any);
        let data = guess[f];

        let formattedData = null;
        if (f === "Save" || f === "Invunl Save" || f === "Leadership") {
            formattedData = data !== null ? `${data}+` : null;
        }

        return { field: f, status, data: f === "Save" || f === "Invunl Save" || f === "Leadership" ? formattedData : data } as Feedback;
    });
}
