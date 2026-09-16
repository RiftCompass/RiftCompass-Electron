import { runeIconUrl, statShardById, statShardIconUrl, type RuneStyle } from "../ddragon";
import type { ChampionBuildRunes } from "../riftcompass";
import { useI18n } from "../i18n";
import { COLORS } from "../theme";

// Las piezas con las que se dibuja una build, iguales allá donde salga una:
// Champion Builds (populares, guardadas y el editor) y la ficha de un
// matchup. Equivalente de src/components/champions/build-visuals.tsx y
// skill-order-table.tsx de la web. Solo presentación: sin datos ni estado.

export type Translate = ReturnType<typeof useI18n>["t"];

export const SKILL_KEYS: Record<number, string> = { 1: "Q", 2: "W", 3: "E", 4: "R" };

export interface RuneIndex {
  byId: Map<number, { name: string; icon: string; shortDesc: string }>;
  styleById: Map<number, RuneStyle>;
}

export function indexRunes(runeStyles: RuneStyle[]): RuneIndex {
  const byId = new Map<number, { name: string; icon: string; shortDesc: string }>();
  const styleById = new Map<number, RuneStyle>();
  for (const style of runeStyles) {
    styleById.set(style.id, style);
    for (const slot of style.slots) for (const rune of slot) byId.set(rune.id, rune);
  }
  return { byId, styleById };
}

export function RunePageView({
  runes,
  index,
  t,
}: {
  runes: ChampionBuildRunes;
  index: { byId: Map<number, { name: string; icon: string; shortDesc: string }>; styleById: Map<number, RuneStyle> };
  t: Translate;
}) {
  const primary = index.styleById.get(runes.primaryStyleId);
  const secondary = index.styleById.get(runes.subStyleId);
  const icon = (perkId: number, size: number) => {
    const rune = index.byId.get(perkId);
    return rune ? (
      <img
        key={perkId}
        src={runeIconUrl(rune.icon)}
        alt={rune.name}
        title={`${rune.name}: ${rune.shortDesc}`}
        style={{ width: size, height: size, borderRadius: "50%" }}
      />
    ) : null;
  };

  return (
    <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {primary ? <img src={runeIconUrl(primary.icon)} alt={primary.name} title={primary.name} style={{ width: 14, height: 14 }} /> : null}
        {icon(runes.perk0, 26)}
        {icon(runes.perk1, 18)}
        {icon(runes.perk2, 18)}
        {icon(runes.perk3, 18)}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {secondary ? (
          <img src={runeIconUrl(secondary.icon)} alt={secondary.name} title={secondary.name} style={{ width: 14, height: 14 }} />
        ) : null}
        {icon(runes.perk4, 18)}
        {icon(runes.perk5, 18)}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {[runes.statPerk0, runes.statPerk1, runes.statPerk2].map((shardId, row) => {
          const shard = statShardById(row, shardId);
          if (!shard) return null;
          const label = t(`ChampionBuilds.statShards.${shard.key}`);
          return (
            <img
              key={row}
              src={statShardIconUrl(shard)}
              alt={label}
              title={label}
              style={{ width: 14, height: 14, borderRadius: "50%" }}
            />
          );
        })}
      </span>
    </span>
  );
}

export function AbilityBadge({ slot, iconUrl, size = 26 }: { slot: number; iconUrl: string | null; size?: number }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      {iconUrl ? (
        <img src={iconUrl} alt={SKILL_KEYS[slot]} style={{ width: size, height: size, borderRadius: 6 }} />
      ) : (
        <span style={{ width: size, height: size, borderRadius: 6, border: `1px solid ${COLORS.cardBorder}` }} />
      )}
      <span
        style={{
          position: "absolute",
          right: -3,
          bottom: -3,
          background: `${COLORS.background}e6`,
          borderRadius: 4,
          padding: "0 3px",
          fontSize: 9,
          fontWeight: 700,
        }}
      >
        {SKILL_KEYS[slot]}
      </span>
    </span>
  );
}

// One row per ability, one column per champion level, filled where that
// level's point went. Same grid the web draws; editable when onSet is given.
export function SkillGrid({
  path,
  abilityIcon,
  onSet,
}: {
  path: { level: number; skillSlot: number }[];
  abilityIcon: (slot: number) => string | null;
  onSet?: (level: number, slot: number) => void;
}) {
  const bySlotLevel = new Map(path.map((step) => [step.level, step.skillSlot]));
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 520 }}>
        <div style={{ display: "flex", gap: 3, paddingLeft: 32 }}>
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} style={{ flex: 1, textAlign: "center", fontSize: 9, color: COLORS.muted }}>
              {index + 1}
            </span>
          ))}
        </div>
        {[1, 2, 3, 4].map((slot) => (
          <div key={slot} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 29 }}>
              <AbilityBadge slot={slot} iconUrl={abilityIcon(slot)} size={22} />
            </span>
            {Array.from({ length: 18 }, (_, index) => {
              const level = index + 1;
              const active = bySlotLevel.get(level) === slot;
              const cell = {
                flex: 1,
                height: 20,
                borderRadius: 4,
                border: "none",
                background: active ? `${COLORS.rose}40` : `${COLORS.card}cc`,
                color: active ? COLORS.rose : "transparent",
                fontSize: 10,
                fontWeight: 700,
                cursor: onSet ? "pointer" : "default",
              } as const;
              return onSet ? (
                <button key={level} onClick={() => onSet(level, slot)} style={cell}>
                  {SKILL_KEYS[slot]}
                </button>
              ) : (
                <span key={level} style={cell}>
                  {SKILL_KEYS[slot]}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
