# Minceraft

To install dependencies:

```bash
bun install
```

To run:

```bash
bun dev # Start development server
```

To build:

```bash
bun build # Build for production
```

To test:

```bash
bun test
```

To lint and format:

```bash
bun lint:fix
```

## Final Project Controls

- `W/A/S/D`: move
- Hold `Shift`: sprint
- `Space`: jump
- Left click while pointer-locked: break blocks, attack players, or start a wild-creature battle when targeting one
- Battle HUD move buttons: left click to select a move
- `E`: inventory
- `F3`: diagnostics
- `H`: mob highlight toggle
- `F1`: hide/show HUD

The diagnostics panel includes:

- Shadow technique: `ambient-occlusion`, `shadow-map`, `shadow-volume`
- Shadow strength: applies to `shadow-map` and `shadow-volume`
- Benchmark start/stop/export controls when launched with benchmark query parameters

## Final Project Artifacts

Report and artifact drafts live in `docs/final-project/`.

Runtime shadow benchmark capture:

```bash
npm run dev -- --host 127.0.0.1
node scripts/capture-shadow-benchmarks.mjs
```

The benchmark script expects the app at `http://127.0.0.1:5175/` by default. Override with `BENCHMARK_URL=http://127.0.0.1:<port>/` if Vite chooses another port.
