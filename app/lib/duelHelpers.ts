export type PlayerRoundRow = {
  id: string;
  round_number: number;
  user_id: string;
  started_at: string | null;
  completed_at: string | null;
  guess_count: number;
  time_seconds: number | null;
  score: number | null;
  solved: boolean;
};

/**
 * Returns the first round number (1-5) where not both players have a
 * completed row. Returns 6 when all 5 rounds are fully done.
 */
export function computeCurrentRound(
  playerRounds: PlayerRoundRow[],
  challengerId: string,
  challengedId: string
): number {
  for (let r = 1; r <= 5; r++) {
    const cRow = playerRounds.find((p) => p.round_number === r && p.user_id === challengerId);
    const dRow = playerRounds.find((p) => p.round_number === r && p.user_id === challengedId);
    if (cRow?.completed_at && dRow?.completed_at) continue;
    return r;
  }
  return 6;
}
