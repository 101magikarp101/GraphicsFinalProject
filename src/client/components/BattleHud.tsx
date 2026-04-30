import type { BattleSessionState } from "@/game/battle";
import { MOVE_LIBRARY_BY_ID } from "@/game/creature-moves";

interface BattleHudProps {
  battle: BattleSessionState;
  onSelectMove: (moveId: string) => void;
}

export function BattleHud(props: BattleHudProps) {
  const starterHpPct = Math.round((props.battle.starter.hp / Math.max(1, props.battle.starter.maxHp)) * 100);
  const wildHpPct = Math.round((props.battle.wild.hp / Math.max(1, props.battle.wild.maxHp)) * 100);

  return (
    <div class="absolute inset-x-0 bottom-0 z-30 p-3 md:p-4">
      <div class="mx-auto w-full max-w-5xl border-3 border-[#242d47] bg-[#111726e8] p-3 shadow-[0_8px_28px_rgba(0,0,0,0.5)] backdrop-blur-[2px]">
        <div class="grid gap-3 md:grid-cols-2">
          <div class="border border-[#2f3a5a] bg-[#141b2d] p-3">
            <div class="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#9ab0ff]">Your Starter</div>
            <div class="mt-1 font-mono text-xl font-black uppercase text-white">{props.battle.starter.speciesId}</div>
            <div class="mt-2 h-2.5 w-full bg-[#0d1220]">
              <div class="h-full bg-[#67d36d]" style={{ width: `${starterHpPct}%` }} />
            </div>
            <div class="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[#d7def9]">
              HP {props.battle.starter.hp}/{props.battle.starter.maxHp} (Lv {props.battle.starter.level})
            </div>
          </div>

          <div class="border border-[#5a3030] bg-[#241417] p-3">
            <div class="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff9a9a]">Wild Opponent</div>
            <div class="mt-1 font-mono text-xl font-black uppercase text-white">{props.battle.wild.speciesId}</div>
            <div class="mt-2 h-2.5 w-full bg-[#1b0f11]">
              <div class="h-full bg-[#ff6767]" style={{ width: `${wildHpPct}%` }} />
            </div>
            <div class="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[#f6d6d6]">
              HP {props.battle.wild.hp}/{props.battle.wild.maxHp} (Lv {props.battle.wild.level})
            </div>
          </div>
        </div>

        <div class="mt-3 grid gap-3 md:grid-cols-[2fr_1fr]">
          <div class="h-28 overflow-auto border border-[#313b59] bg-[#0f1526] p-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#c7d2ff]">
            {props.battle.log.length === 0 ? "Battle ready." : props.battle.log.join("\n")}
          </div>

          <div class="grid grid-cols-2 gap-2">
            {props.battle.availableMoves.map((moveId) => (
              <button
                type="button"
                class="cursor-pointer border border-[#3d4a70] bg-[#18213a] p-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!props.battle.canSelectMove}
                onClick={() => props.onSelectMove(moveId)}
              >
                <div class="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-white">
                  {MOVE_LIBRARY_BY_ID[moveId as keyof typeof MOVE_LIBRARY_BY_ID]?.name ?? moveId}
                </div>
                <div class="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#b7c3ea]">{moveId}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
