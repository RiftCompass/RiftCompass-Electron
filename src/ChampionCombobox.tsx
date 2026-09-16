import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChampionInfo } from "./ddragon";
import { COLORS, TYPE } from "./theme";

// A small search-by-text champion picker — native equivalent of the web
// app's ChampionCombobox (src/components/champion-combobox.tsx), same
// "type to filter, click to pick" interaction, this app's own UI.
export function ChampionCombobox({
  champions,
  value,
  onChange,
  placeholder = "Search a champion…",
  noResultsLabel,
}: {
  champions: ChampionInfo[];
  value: ChampionInfo | null;
  onChange: (champion: ChampionInfo | null) => void;
  placeholder?: string;
  // Required, not defaulted to an English literal — same as the web's own
  // ChampionCombobox, so every call site passes a real translated string
  // instead of this component silently showing untranslated text.
  noResultsLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Cierre por clic fuera del contenedor, como en la web, en vez de un
  // onBlur con temporizador: aquel cerraba la lista al pulsar Tab antes de
  // que el foco llegara a ningún botón, así que el selector no se podía
  // usar sin ratón (ronda 21).
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) return champions.slice(0, 30);
    const q = query.toLowerCase();
    return champions.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 30);
  }, [champions, query]);

  const pick = (c: ChampionInfo) => {
    onChange(c);
    setOpen(false);
  };

  // Enter elige el primer resultado, Escape cierra; Tab recorre la lista
  // porque las opciones son botones. Salir del widget con el teclado cierra
  // igual que un clic fuera.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && open && results.length > 0) {
      e.preventDefault();
      pick(results[0]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ position: "relative" }}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {value ? (
        <button
          onClick={() => {
            onChange(null);
            setQuery("");
            setOpen(true);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            background: COLORS.card,
            color: COLORS.text,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 8,
            padding: "8px 12px",
            cursor: "pointer",
            font: "inherit",
            textAlign: "left",
          }}
        >
          <img src={value.iconUrl} alt="" style={{ width: 24, height: 24, borderRadius: 5 }} />
          <span style={{ fontSize: 14 }}>{value.name}</span>
        </button>
      ) : (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-label={placeholder}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          style={{
            width: "100%",
            background: COLORS.card,
            color: COLORS.text,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 14,
            boxSizing: "border-box",
          }}
        />
      )}
      {open && !value ? (
        <div
          id={listId}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: "auto",
            background: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 8,
            zIndex: 10,
            boxShadow: "0 12px 24px -8px rgba(0,0,0,0.6)",
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: 12, fontSize: TYPE.body, color: COLORS.muted }}>{noResultsLabel}</div>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                onClick={() => pick(c)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  background: "none",
                  border: "none",
                  padding: "8px 12px",
                  cursor: "pointer",
                  color: COLORS.text,
                  font: "inherit",
                  textAlign: "left",
                }}
              >
                <img src={c.iconUrl} alt="" style={{ width: 22, height: 22, borderRadius: 5 }} />
                <span style={{ fontSize: TYPE.body }}>{c.name}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
