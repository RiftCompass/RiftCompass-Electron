import { describe, expect, it } from "vitest";
import type { StageMatchRef, StageSection } from "./types";
import { bracketRank, earlierSeriesByTeam, earlierSeriesForMatch, isSwissStage, seriesBefore } from "./bracket-spoilers";

function series(id: string, a: string | null, b: string | null, state: StageMatchRef["state"] = "completed"): StageMatchRef {
  return { id, state, teams: [a, b].map((code) => ({ team: code ? { id: null, code, name: code } : null, gameWins: 0, outcome: null })) };
}

function bracket(name: string, ...columns: StageMatchRef[][]): StageSection {
  return { name, type: "bracket", columns: columns.map((matches, index) => ({ cells: [{ name: `Round ${index + 1}`, slug: `round-${index + 1}`, matches }] })) };
}

// Worlds in miniature: a Swiss stage and then knockouts whose first
// quarterfinal pairs two teams that are only there through the Swiss.
const swiss = bracket("Swiss", [series("s1", "G2", "T1"), series("s2", "KC", "GEN")], [series("s3", "G2", "KC"), series("s4", "T1", "GEN")]);
const knockouts = bracket("Knockouts", [series("q1", "G2", "GEN"), series("q2", "T1", "KC", "unstarted")], [series("f1", null, null, "unstarted")]);
const stages = [{ structure: { sections: [swiss] } }, { structure: { sections: [knockouts] } }];

describe("bracketRank", () => {
  it("orders every column of every section of every stage", () => {
    expect(bracketRank(0, 0, 4)).toBeLessThan(bracketRank(0, 1, 0));
    expect(bracketRank(0, 9, 9)).toBeLessThan(bracketRank(1, 0, 0));
  });
});

describe("isSwissStage", () => {
  it("recognises the stage by its name, in English or Spanish", () => {
    expect(isSwissStage("Swiss")).toBe(true);
    expect(isSwissStage("Fase suiza")).toBe(true);
    expect(isSwissStage("Knockouts")).toBe(false);
    expect(isSwissStage(null)).toBe(false);
  });
});

describe("earlierSeriesByTeam and seriesBefore", () => {
  const earlier = earlierSeriesByTeam(stages);

  it("collects every played series of a team across the tournament, in order", () => {
    expect(earlier.get("G2")?.map((entry) => entry.id)).toEqual(["s1", "s3", "q1"]);
    expect(earlier.get("GEN")?.map((entry) => entry.id)).toEqual(["s2", "s4", "q1"]);
  });

  it("skips a series nobody has played yet", () => {
    expect(earlier.get("T1")?.map((entry) => entry.id)).toEqual(["s1", "s4"]);
    expect(earlier.get("KC")?.map((entry) => entry.id)).toEqual(["s2", "s3"]);
  });

  it("masks a team in the knockouts with its Swiss series, not with the series of that same column", () => {
    const quarterfinals = bracketRank(1, 0, 0);
    expect(seriesBefore(earlier, "G2", quarterfinals)).toEqual(["s1", "s3"]);
    expect(seriesBefore(earlier, "GEN", quarterfinals)).toEqual(["s2", "s4"]);
  });

  it("counts an earlier column of the same section as earlier", () => {
    expect(seriesBefore(earlier, "G2", bracketRank(0, 0, 1))).toEqual(["s1"]);
  });

  it("masks nothing in the first column of the first stage, nor a team it never saw", () => {
    expect(seriesBefore(earlier, "G2", bracketRank(0, 0, 0))).toEqual([]);
    expect(seriesBefore(earlier, "FNC", bracketRank(1, 0, 0))).toEqual([]);
  });
});

describe("earlierSeriesForMatch", () => {
  const named = [
    { name: "Swiss", structure: { sections: [swiss] } },
    { name: "Knockouts", structure: { sections: [knockouts] } },
  ];

  it("finds a match in the brackets and gives the team's series before it", () => {
    expect(earlierSeriesForMatch(named, "q1", "G2")).toEqual(["s1", "s3"]);
    expect(earlierSeriesForMatch(named, "q1", "GEN")).toEqual(["s2", "s4"]);
  });

  it("masks nothing inside a Swiss stage, for an unknown match or for an empty slot", () => {
    expect(earlierSeriesForMatch(named, "s3", "G2")).toEqual([]);
    expect(earlierSeriesForMatch(named, "not-there", "G2")).toEqual([]);
    expect(earlierSeriesForMatch(named, "f1", "")).toEqual([]);
  });
});
