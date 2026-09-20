import { describe, expect, it } from "vitest";
// The release script is plain ESM (it runs in CI without a build step);
// its changelog helpers are pure, so they are tested from here.
import { changelogFor, compareVersions, releaseNotes } from "../../scripts/github-release.mjs";

const changelog = `# Changelog

Intro.

## 0.3.29

- Twenty-nine.

## 0.3.28

- Twenty-eight.

## 0.3.27

- Twenty-seven.

## 0.3.26

- Twenty-six.
`;

describe("release notes", () => {
  it("compares versions numerically", () => {
    expect(compareVersions("0.3.10", "0.3.9")).toBeGreaterThan(0);
    expect(compareVersions("0.3.28", "0.3.28")).toBe(0);
  });

  it("keeps a single version's section as it was", () => {
    expect(changelogFor("0.3.28", changelog)).toBe("- Twenty-eight.");
    expect(changelogFor("9.9.9", changelog)).toBe("");
  });

  it("stacks every unpublished version under its own heading, newest first (round 39)", () => {
    expect(releaseNotes("0.3.28", "0.3.25", changelog)).toBe("## 0.3.28\n\n- Twenty-eight.\n\n## 0.3.27\n\n- Twenty-seven.\n\n## 0.3.26\n\n- Twenty-six.");
    expect(releaseNotes("0.3.29", "0.3.28", changelog)).toBe("- Twenty-nine.");
    // Nothing published yet: the version's own notes only.
    expect(releaseNotes("0.3.27", null, changelog)).toBe("- Twenty-seven.");
  });
});
