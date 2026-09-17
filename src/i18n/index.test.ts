import { describe, expect, it } from "vitest";
import { interpolate } from "./index";

describe("interpolate", () => {
  it("picks the plural branch by locale and formats the number", () => {
    const tpl = "{count, plural, one {# game} other {# games}}";
    expect(interpolate(tpl, { count: 1 }, "en")).toBe("1 game");
    expect(interpolate(tpl, { count: 2 }, "en")).toBe("2 games");
    expect(interpolate(tpl, { count: 1234 }, "es")).toBe("1234 games".replace("1234", new Intl.NumberFormat("es").format(1234)));
    expect(interpolate("{count, plural, one {# partie} other {# parties}}", { count: 1 }, "fr")).toBe("1 partie");
    expect(interpolate("{count, plural, one {# Spiel} other {# Spiele}}", { count: 1 }, "de")).toBe("1 Spiel");
  });

  it("prefers an exact =n branch and keeps plain variables", () => {
    const tpl = "{n, plural, =0 {none} one {# item} other {# items}} for {who}";
    expect(interpolate(tpl, { n: 0, who: "you" }, "en")).toBe("none for you");
    expect(interpolate(tpl, { n: 3, who: "you" }, "en")).toBe("3 items for you");
  });

  it("leaves a plural without its variable untouched", () => {
    const tpl = "{count, plural, one {# game} other {# games}}";
    expect(interpolate(tpl, undefined, "en")).toBe(tpl);
  });
});
