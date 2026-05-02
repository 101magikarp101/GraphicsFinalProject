vincent:
	cls
	bun install
	bun run build
	bun dev

reset-db:
	@echo Resetting local database state...
	@powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process wrangler,workerd,miniflare -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 200; Get-ChildItem -Path . -Filter '*.sqlite*' -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; if (Test-Path '.wrangler/state') { Remove-Item '.wrangler/state' -Recurse -Force -ErrorAction SilentlyContinue }; if (Test-Path '.wrangler/deploy/config.json') { Remove-Item '.wrangler/deploy/config.json' -Force -ErrorAction SilentlyContinue }"
	@git clean -f drizzle/meta/*.json
	@echo Database reset complete. Local DO/SQLite state is fresh.

fresh-start: reset-db vincent

MSG := $(strip $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS)))
FOLDER := $(MSG)
SCRIPTS_DIR := scripts

.PHONY: push folder

push:
	@if "$(MSG)"=="" (echo Usage: make push ^<commit-message^> & exit /b 1)
	@git add .
	@git commit -m "$(MSG)"
	@git push origin main

