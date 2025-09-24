export type UnitRow = {
  "Unit ID": string;
  "Unit Name": string;
  "Faction ID": string;
  Movement: number | null;
  Toughness: number | null;
  Save: number | null;
  "Invunl Save": number | null;
  Wounds: number | null;
  Leadership: number | null;
  OC: number | null;
  Points: number | null;
  "Model Count": number;
  Legends?: string | null;
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
  | "Faction ID"
  | "Legends"
>;

export type Feedback = {
  field: StatKey;
  status: "correct" | "higher" | "lower" | "mismatch";
};