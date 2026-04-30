vincent:
	cls
	bun install
	bun run build
	bun dev

reset-db:
	git clean -f drizzle/meta/*.json
	if exist *.sqlite del /Q *.sqlite
	echo Database reset. Re-run migrations to initialize schema.

fresh-start: vincent reset-db

MSG := $(strip $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS)))
FOLDER := $(MSG)
SCRIPTS_DIR := scripts

.PHONY: push folder

push:
	@if "$(MSG)"=="" (echo Usage: make push ^<commit-message^> & exit /b 1)
	@git add .
	@git commit -m "$(MSG)"
	@git push origin main

