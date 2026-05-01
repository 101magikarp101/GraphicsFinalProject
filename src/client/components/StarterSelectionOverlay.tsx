import type { CreatureSpeciesId } from "@/game/creature-species";

interface StarterSelectionOverlayProps {
  onSelectStarter: (speciesId: CreatureSpeciesId) => void;
  disabled?: boolean;
}

const STARTERS: Array<{ speciesId: CreatureSpeciesId; title: string; description: string }> = [
  {
    speciesId: "emberlynx",
    title: "Emberlynx",
    description: "Fast fire striker with early pressure.",
  },
  {
    speciesId: "rippletoad",
    title: "Rippletoad",
    description: "Reliable water all-rounder with steady defenses.",
  },
  {
    speciesId: "spriglyn",
    title: "Spriglyn",
    description: "Grass special attacker with status pressure.",
  },
];

export function StarterSelectionOverlay(props: StarterSelectionOverlayProps) {
  const selectStarter = (speciesId: CreatureSpeciesId) => {
    if (props.disabled) return;
    props.onSelectStarter(speciesId);
  };

  return (
    <div class="absolute inset-0 z-40 flex items-center justify-center bg-[#090b12cc] p-4">
      <div class="w-full max-w-3xl border-3 border-[#1e2435] bg-[#0f1422] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
        <div class="mb-3 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#8ba4ff]">First Journey Step</div>
        <h2 class="font-mono text-2xl font-black uppercase tracking-[0.08em] text-white">Choose Your Starter</h2>
        <p class="mt-2 font-mono text-xs uppercase tracking-[0.1em] text-[#b8c1e3]">
          Pick one companion to begin your creature journey.
        </p>

        <div class="mt-5 grid gap-3 md:grid-cols-3">
          {STARTERS.map((starter) => (
            <button
              type="button"
              class="cursor-pointer border-2 border-[#2a3557] bg-[#131c30] p-4 text-left transition-colors hover:border-[#4f6fcb] hover:bg-[#1a2743] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={props.disabled}
              onClick={() => selectStarter(starter.speciesId)}
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={(event) => {
                if (event.button === 0) return;
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <div class="font-mono text-lg font-black uppercase tracking-[0.06em] text-white">{starter.title}</div>
              <div class="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#b7c5f5]">
                {starter.description}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
