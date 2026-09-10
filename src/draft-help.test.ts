import { describe, expect, it } from "vitest";
import { masteryLogit } from "./draft-help";

// La maestría es un empujón acotado, no el criterio principal: un campeón que
// dominas no puede colarse por encima de uno objetivamente mejor solo por eso.
// Estas pruebas fijan ese contrato, que es fácil de romper sin darse cuenta al
// tocar la fórmula.
describe("masteryLogit", () => {
  it("es neutro cuando no hay datos de maestría de ningún campeón", () => {
    expect(masteryLogit(0, 0)).toBe(0);
    expect(masteryLogit(10_000, 0)).toBe(0);
  });

  it("un campeón nunca jugado va al suelo, por debajo de uno jugado un poco", () => {
    expect(masteryLogit(0, 500_000)).toBe(-0.35);
    expect(masteryLogit(100, 500_000)).toBeGreaterThan(masteryLogit(0, 500_000));
  });

  it("premia al campeón más jugado del propio jugador", () => {
    expect(masteryLogit(300_000, 300_000)).toBeCloseTo(0.35, 5);
  });

  it("penaliza, sin exagerar, a uno que apenas se ha tocado", () => {
    const apenas = masteryLogit(100, 300_000);
    expect(apenas).toBeLessThan(0);
    expect(apenas).toBeGreaterThanOrEqual(-0.35);
  });

  it("nunca se sale del tope, ni con datos absurdos", () => {
    for (const [puntos, tope] of [
      [1, 1],
      [999_999, 1],
      [1, 999_999],
      [250_000, 300_000],
    ]) {
      const v = masteryLogit(puntos, tope);
      expect(v).toBeGreaterThanOrEqual(-0.35);
      expect(v).toBeLessThanOrEqual(0.35);
    }
  });

  it("crece de forma amortiguada: los primeros puntos valen más que los últimos", () => {
    const tope = 400_000;
    const primerTramo = masteryLogit(40_000, tope) - masteryLogit(0.0001, tope);
    const ultimoTramo = masteryLogit(400_000, tope) - masteryLogit(360_000, tope);
    expect(primerTramo).toBeGreaterThan(ultimoTramo);
  });

  it("es monótono: más maestría nunca puntúa menos", () => {
    const tope = 300_000;
    const valores = [1_000, 10_000, 50_000, 150_000, 300_000].map((p) => masteryLogit(p, tope));
    for (let i = 1; i < valores.length; i++) {
      expect(valores[i]).toBeGreaterThan(valores[i - 1]);
    }
  });
});
