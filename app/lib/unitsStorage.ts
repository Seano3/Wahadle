import { UnitRow } from "../types";

export type Unit = Record<string, unknown>;

/**
 * Mutable storage for units.
 * - Import `units` to read or mutate the array contents.
 * - Use `setUnits` to replace the entire array.
 */
export let units: UnitRow[] = [];

/** Replace the stored units array (useful if you need to reassign). */
export function setUnits(newUnits: UnitRow[]) {
    units = newUnits;
}

/** Read the current units reference (identical to accessing `units`). */
export function getUnits(): UnitRow[] {
    return units;
}

export function isUnitsLoaded(): boolean {
    return units.length > 0;
}


/** Clear all units. */
export function clearUnits() {
    units.length = 0;
}