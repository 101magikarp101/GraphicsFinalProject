import { createEffect, createSignal, onCleanup } from "solid-js";
import type { BattleSessionState } from "@/game/battle";
import { MOVE_LIBRARY_BY_ID } from "@/game/creature-moves";

const LOG_LINE_REVEAL_MS = 950;

interface BattleHudProps {
  battle: BattleSessionState;
  hudScale: number;
  onSelectMove: (moveId: string) => void;
}

export function BattleHud(props: BattleHudProps) {
  const [nowMs, setNowMs] = createSignal(Date.now());
  const [revealStartedAtMs, setRevealStartedAtMs] = createSignal(Date.now());
  let lastRevealKey = "";

  const interval = window.setInterval(() => setNowMs(Date.now()), 150);
  onCleanup(() => window.clearInterval(interval));

  createEffect(() => {
    const key = `${props.battle.battleId}:${props.battle.revision}:${props.battle.phase}:${props.battle.log.length}`;
    if (key === lastRevealKey) return;
    lastRevealKey = key;
    setRevealStartedAtMs(Date.now());
  });

  const displayedStarterHp = () => displayedHpFor("starter");
  const displayedWildHp = () => displayedHpFor("wild");
  const starterHpPct = () => Math.round((displayedStarterHp() / Math.max(1, props.battle.starter.maxHp)) * 100);
  const wildHpPct = () => Math.round((displayedWildHp() / Math.max(1, props.battle.wild.maxHp)) * 100);
  const xpStart = () => props.battle.starter.level ** 3;
  const xpEnd = () =>
    props.battle.starter.nextLevelExperience ?? Math.max(xpStart() + 1, props.battle.starter.experience ?? 0);
  const xpPct = () =>
    Math.round((((props.battle.starter.experience ?? xpStart()) - xpStart()) / Math.max(1, xpEnd() - xpStart())) * 100);
  const selectMove = (moveId: string) => {
    props.onSelectMove(moveId);
  };
  const visibleLog = () => {
    const log = props.battle.log;
    if (log.length === 0) return ["Battle ready."];
    if (props.battle.phase !== "resolving") return log;

    const visibleCount = Math.max(
      1,
      Math.min(log.length, Math.floor((nowMs() - revealStartedAtMs()) / LOG_LINE_REVEAL_MS) + 1),
    );
    return log.slice(0, visibleCount);
  };
  const displayedHpFor = (actor: "starter" | "wild") => {
    const battle = props.battle;
    const base = actor === "starter" ? battle.starter.hp : battle.wild.hp;
    const max = actor === "starter" ? battle.starter.maxHp : battle.wild.maxHp;
    const animation = battle.lastTurnAnimation;
    if (battle.phase !== "resolving" || !animation) return base;

    let pendingDamage = 0;
    for (const action of animation.actions) {
      const target = action.actor === "starter" ? "wild" : "starter";
      if (target === actor && action.hit && action.damage > 0 && nowMs() < action.impactAtMs) {
        pendingDamage += action.damage;
      }
    }
    return Math.max(0, Math.min(max, base + pendingDamage));
  };

  return (
    <div class="absolute inset-x-0 bottom-0 z-30 p-3 md:p-4">
      <div
        class="mx-auto w-full max-w-5xl border-3 border-white/40 bg-[rgba(245,245,245,0.14)] p-3 shadow-[0_8px_28px_rgba(0,0,0,0.25)] backdrop-blur-[2px]"
        style={{
          transform: `scale(${Math.max(0.65, Math.min(1, props.hudScale))})`,
          "transform-origin": "bottom center",
        }}
      >
        <div class="grid gap-3 md:grid-cols-2">
          <div class="border border-white/35 bg-[rgba(255,255,255,0.12)] p-3">
            <div class="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/85">Your Starter</div>
            <div class="mt-1 font-mono text-xl font-black uppercase text-white">{props.battle.starter.speciesId}</div>
            <div class="mt-2 h-2.5 w-full bg-black/18">
              <div class="h-full bg-white/85" style={{ width: `${starterHpPct()}%` }} />
            </div>
            <div class="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-white/85">
              HP {displayedStarterHp()}/{props.battle.starter.maxHp} · Lv {props.battle.starter.level} ·{" "}
              {props.battle.starter.status}
            </div>
            <div class="mt-2 h-1.5 w-full bg-black/18">
              <div class="h-full bg-white/70" style={{ width: `${Math.max(0, Math.min(100, xpPct()))}%` }} />
            </div>
            <div class="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70">
              XP {props.battle.starter.experience ?? 0}/{xpEnd()}
            </div>
          </div>

          <div class="border border-white/35 bg-[rgba(255,255,255,0.12)] p-3">
            <div class="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/85">Wild Opponent</div>
            <div class="mt-1 font-mono text-xl font-black uppercase text-white">{props.battle.wild.speciesId}</div>
            <div class="mt-2 h-2.5 w-full bg-black/18">
              <div class="h-full bg-white/85" style={{ width: `${wildHpPct()}%` }} />
            </div>
            <div class="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-white/85">
              HP {displayedWildHp()}/{props.battle.wild.maxHp} · Lv {props.battle.wild.level} ·{" "}
              {props.battle.wild.status}
            </div>
          </div>
        </div>

        <div class="mt-3 grid gap-3 md:grid-cols-[2fr_1fr]">
          <div class="h-28 overflow-auto whitespace-pre-line border border-white/35 bg-[rgba(255,255,255,0.11)] p-2 font-mono text-[11px] uppercase tracking-[0.08em] text-white/92">
            {props.battle.phase === "resolving" ? "Resolving turn...\n" : ""}
            {visibleLog().join("\n")}
          </div>

          <div class="grid grid-cols-2 gap-2">
            {props.battle.availableMoves.map((moveId) => (
              <button
                type="button"
                class="cursor-pointer border border-white/35 bg-[rgba(255,255,255,0.12)] p-2 text-left"
                onContextMenu={(event) => event.preventDefault()}
                onMouseDown={(event) => {
                  if (event.button === 0) {
                    event.preventDefault();
                    selectMove(moveId);
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  selectMove(moveId);
                }}
              >
                <div class="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-white/95">
                  {MOVE_LIBRARY_BY_ID[moveId as keyof typeof MOVE_LIBRARY_BY_ID]?.name ?? moveId}
                </div>
                <div class="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-white/65">{moveId}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
