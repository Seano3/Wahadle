export type UnitRow = {
  "Unit ID": string;
  "Unit Name": string;
  /** Disambiguates multiple stat-lines within one datasheet (e.g. Boy vs Boss Nob). */
  "Model Line": number;
  Faction: string;
  Movement: number | null;
  Toughness: number | null;
  Save: number | null;
  "Invunl Save": number | null;
  Wounds: number | null;
  Leadership: number | null;
  OC: number | null;
  Points: number | null;
  /**
   * Number of models extracted from Wahapedia's free-text squad-size
   * description (e.g. "10 models" -> 10, "1 Spanner and 4 Burna Boyz"
   * -> 5). Null when the description doesn't parse to a count.
   */
  "Model Count": number | null;
  /** Original Wahapedia text this was parsed from, for display. */
  "Model Count Label": string;
};

export type StatKey = keyof Pick<
  UnitRow,
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
  status:
    | "correct"
    | "higher"
    | "lower"
    | "mismatch"
    | "related"
    | "close-higher"
    | "close-lower";
  data: string | number | null;
};
