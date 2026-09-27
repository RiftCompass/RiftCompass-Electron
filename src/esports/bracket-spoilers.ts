import type { StageSection } from "./types";

// Which series a team played before a given point of a tournament's
// brackets, across its stages (esports-sin-spoilers.md, round 45): a team
// in the quarterfinals is there because of its Swiss series, so those
// count as earlier too. Masking only inside one section let the next stage
// give the result away (Worlds' knockouts named the eight teams that got
// through the Swiss). Swiss stages themselves keep their pairings and hide
// only the scores (the owner, 2026-09-27): a cell named "1-0" already tells
// the record, and rounds 2 to 5 as a wall of "?" told nothing. Same module
// as the web's src/lib/esports/bracket-spoilers.ts.

export interface EarlierSeries {
  /** The position of the column in the tournament, see bracketRank. */
  at: number;
  id: string;
}
export type EarlierSeriesMap = Map<string, EarlierSeries[]>;

/** One number that orders every column of every section of every stage. */
export function bracketRank(stage: number, section: number, column: number): number {
  return stage * 1_000_000 + section * 1_000 + column;
}

export function isSwissStage(name: string | null | undefined): boolean {
  return /swiss|suizo/i.test(name ?? "");
}

export function earlierSeriesByTeam(stages: readonly { structure: { sections: StageSection[] } }[]): EarlierSeriesMap {
  const map: EarlierSeriesMap = new Map();
  stages.forEach((stage, stageIndex) => {
    stage.structure.sections.forEach((section, sectionIndex) => {
      if (section.type !== "bracket") return;
      section.columns.forEach((column, columnIndex) => {
        for (const cell of column.cells) {
          for (const match of cell.matches) {
            if (match.state === "unstarted") continue;
            for (const slot of match.teams) {
              if (!slot.team) continue;
              const list = map.get(slot.team.code) ?? [];
              list.push({ at: bracketRank(stageIndex, sectionIndex, columnIndex), id: match.id });
              map.set(slot.team.code, list);
            }
          }
        }
      });
    });
  });
  return map;
}

/** The series a team played before `at`: while any is hidden, the team is masked there. */
export function seriesBefore(map: EarlierSeriesMap, code: string, at: number): string[] {
  return (map.get(code) ?? []).filter((entry) => entry.at < at).map((entry) => entry.id);
}
