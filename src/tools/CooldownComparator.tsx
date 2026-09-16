import { useEffect, useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { ChampionCombobox } from "../ChampionCombobox";
import {
  fetchChampionDetail,
  fetchChampionMap,
  fetchLatestVersion,
  spellIconUrl,
  type ChampionDetail,
  type ChampionInfo,
} from "../ddragon";
import { useI18n } from "../i18n";
import { LoadError } from "./LoadError";
import { COLORS, FONT_HEADING, TYPE } from "../theme";

// Ported from the web app's src/lib/riot/ddragon.ts's effectiveCooldown —
// same formula and the same [0,200] ability-haste clamp fixed there after
// a real bug was found (haste <= -100 made the denominator zero/negative,
// showing Infinity or a negative cooldown).
function effectiveCooldown(base: number, abilityHaste: number): number {
  return Math.round((base / (1 + abilityHaste / 100)) * 10) / 10;
}

function clampHaste(value: number): number {
  return Math.min(200, Math.max(0, value));
}

const SPELL_KEYS = ["Q", "W", "E", "R"];

export function CooldownComparator() {
  const { t } = useI18n();
  const [champions, setChampions] = useState<ChampionInfo[]>([]);
  const [version, setVersion] = useState("");
  // Carga, fallo y "sin resultados" son tres estados distintos (ronda 22):
  // sin esto, con Data Dragon caído el combobox contestaba "No se han
  // encontrado campeones" a cualquier letra, y para siempre.
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetchLatestVersion()
      .then((v) => fetchChampionMap().then((m) => ({ v, list: Object.values(m.byId) })))
      .then(({ v, list }) => {
        if (cancelled) return;
        setVersion(v);
        setChampions(list);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (status === "loading") {
    return <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("ProfileSearch.loading")}</p>;
  }
  if (status === "error") {
    return <LoadError message={t("Common.dataDragonError")} onRetry={() => setAttempt((n) => n + 1)} />;
  }

  return (
    // A vertical divider between the two columns, since neither panel sits
    // in its own bordered card (same `sm:divide-x` as the web version — a
    // plain gap alone left the two panels looking unrelated instead of one
    // A/B comparison).
    // auto-fit, not a fixed 2: a hard 280px floor per column kept the grid
    // from ever going below 592px, and the window allows 640px with the
    // container clipping horizontal overflow, so the B panel got cut off
    // with no way to scroll to it. The web stacks below `sm`; this does the
    // same, and it is the pattern Wave Timer and Jungle XP already use.
    <div className="rc-ab-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 32 }}>
      <ChampionCooldownPanel slot="A" champions={champions} version={version} />
      {/* The divider itself lives in global.css: it has to disappear when
          the grid stacks, which an inline style can't express. */}
      <div className="rc-ab-divider">
        <ChampionCooldownPanel slot="B" champions={champions} version={version} />
      </div>
    </div>
  );
}

function ChampionCooldownPanel({
  slot,
  champions,
  version,
}: {
  slot: "A" | "B";
  champions: ChampionInfo[];
  version: string;
}) {
  const { t, locale } = useI18n();
  const [champion, setChampion] = useState<ChampionInfo | null>(null);
  const [detail, setDetail] = useState<ChampionDetail | null>(null);
  const [abilityHaste, setAbilityHaste] = useState(0);
  const [loading, setLoading] = useState(false);
  // Un fallo al pedir las habilidades se dice (con reintento) en vez de
  // volver a "Elige un campeón" con el campeón ya elegido (ronda 22).
  const [detailError, setDetailError] = useState(false);
  const [detailAttempt, setDetailAttempt] = useState(0);
  // Segundos con la coma del idioma ("4,4s" en es/fr/de), ronda 22.
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  // One rank pip-picker per ability (like the in-game skill points),
  // index-matched to detail.spells, defaulting to rank 1 on a fresh pick.
  const [selectedRanks, setSelectedRanks] = useState<number[]>([]);

  useEffect(() => {
    if (!champion || !version) {
      setDetail(null);
      setSelectedRanks([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDetailError(false);
    fetchChampionDetail(version, champion.internalId, locale)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
          setSelectedRanks(data.spells.map(() => 1));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
          setDetailError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [champion, version, locale, detailAttempt]);

  function setRank(spellIndex: number, rank: number) {
    setSelectedRanks((prev) => prev.map((r, i) => (i === spellIndex ? rank : r)));
  }

  return (
    // gap 18, not 14 — the transition from the ability-haste row straight
    // into the loading/list/empty-state paragraph below it is bare text on
    // both sides (no box/border giving it padding the way the combobox
    // above does), so the same gap value read visibly tighter there than
    // everywhere else in this column.
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* A section title, the same as on the web: it is what separates the
          two halves of the comparison, so it can't be smaller and dimmer
          than the ability names underneath it. */}
      <span style={{ fontFamily: FONT_HEADING, fontSize: TYPE.subheading, color: COLORS.text }}>
        {t("Cooldowns.championLabel", { slot })}
      </span>
      <ChampionCombobox
        champions={champions}
        value={champion}
        onChange={setChampion}
        placeholder={t("Cooldowns.selectPlaceholder")}
        noResultsLabel={t("Cooldowns.noResults")}
      />

      {/* Always-visible custom stepper so there's no doubt the value is
          editable — the native number-input spinner is suppressed via
          -webkit-appearance so the two don't double up. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ flex: 1, fontSize: TYPE.body, color: COLORS.muted }}>{t("Cooldowns.abilityHasteLabel")}</label>
        <div style={{ display: "flex", alignItems: "center" }}>
          <input
            type="number"
            min={0}
            max={200}
            value={abilityHaste}
            onChange={(e) => setAbilityHaste(clampHaste(Number(e.target.value) || 0))}
            className="rc-no-spinner"
            style={{
              width: 40,
              background: "none",
              color: COLORS.text,
              border: "none",
              borderBottom: `1px solid ${COLORS.cardBorder}`,
              padding: "4px 2px",
              fontSize: TYPE.body,
              textAlign: "right",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <button
              type="button"
              onClick={() => setAbilityHaste((prev) => clampHaste(prev + 1))}
              aria-label={t("Cooldowns.increaseHaste")}
              style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 0, display: "flex" }}
            >
              <CaretUp size={13} />
            </button>
            <button
              type="button"
              onClick={() => setAbilityHaste((prev) => clampHaste(prev - 1))}
              aria-label={t("Cooldowns.decreaseHaste")}
              style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 0, display: "flex" }}
            >
              <CaretDown size={13} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: TYPE.body, color: COLORS.muted }}>{t("Cooldowns.loading")}</p>
      ) : detailError ? (
        <LoadError message={t("Cooldowns.loadError")} onRetry={() => setDetailAttempt((n) => n + 1)} />
      ) : detail ? (
        <ul style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0, listStyle: "none" }}>
          {detail.spells.map((spell, index) => {
            const rank = selectedRanks[index] ?? 1;
            const baseCooldown = spell.cooldown[rank - 1];
            const withHaste = abilityHaste > 0 ? effectiveCooldown(baseCooldown, abilityHaste) : null;
            return (
              <li key={spell.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    flexShrink: 0,
                    borderRadius: 6,
                    background: `${COLORS.rose}1a`,
                    color: COLORS.rose,
                    fontSize: TYPE.label,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {SPELL_KEYS[index]}
                </span>
                <img
                  src={spellIconUrl(version, spell.image.full)}
                  alt={spell.name}
                  style={{ width: 34, height: 34, borderRadius: 6, border: `1px solid ${COLORS.cardBorder}` }}
                />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: TYPE.body, fontWeight: 500 }}>{spell.name}</span>
                  {/* Clickable rank pips, same visual language as the
                      client's own level-up UI (filled = points already
                      put in). Clicking pip N shows that rank's cooldown. */}
                  <div style={{ display: "flex", gap: 3 }}>
                    {spell.cooldown.map((_, rankIndex) => {
                      const pipRank = rankIndex + 1;
                      const filled = pipRank <= rank;
                      return (
                        <button
                          key={pipRank}
                          type="button"
                          onClick={() => setRank(index, pipRank)}
                          aria-label={t("Cooldowns.rankLabel", { rank: pipRank })}
                          title={t("Cooldowns.rankLabel", { rank: pipRank })}
                          style={{
                            width: 18,
                            height: 10,
                            borderRadius: 2,
                            border: "none",
                            cursor: "pointer",
                            background: filled ? COLORS.rose : `${COLORS.muted}40`,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
                <span style={{ textAlign: "right", fontSize: TYPE.body, fontWeight: 500 }}>
                  {withHaste !== null ? (
                    <>
                      <span style={{ color: COLORS.gold }}>{nf.format(withHaste)}s</span>
                      <span style={{ display: "block", fontSize: TYPE.label, fontWeight: 400, color: COLORS.muted }}>
                        {t("Cooldowns.withHaste")}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: COLORS.muted }}>{nf.format(baseCooldown)}s</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ fontSize: TYPE.body, color: COLORS.muted }}>{t("Cooldowns.emptyState")}</p>
      )}
    </div>
  );
}
