export type UnitRow = {
  "Unit ID": string;
  "Unit Name": string;
  "Faction": string;
  Movement: number | null;
  Toughness: number | null;
  Save: number | null;
  "Invunl Save": number | null;
  Wounds: number | null;
  Leadership: number | null;
  OC: number | null;
  Points: number | null;
  "Model Count": number;
};

export type StatKey = keyof Pick<UnitRow,
  | "Movement"
  | "Toughness"
  | "Save"
  | "Invunl Save"
  | "Wounds"
  | "Leadership"
  | "OC"
  | "Points"
  | "Model Count"
  | "Faction"
>;

export type Feedback = {
  field: StatKey;
  status: "correct" | "higher" | "lower" | "mismatch" | "related" | "close-higher" | "close-lower";
  data: string | number | null;
};