vincent:
	cls
	bun install
	bun run build
	bun dev

MSG := $(strip $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS)))
FOLDER := $(MSG)
SCRIPTS_DIR := scripts

.PHONY: push folder

push:
	@if "$(MSG)"=="" (echo Usage: make push ^<commit-message^> & exit /b 1)
	@git add .
	@git commit -m "$(MSG)"
	@git push origin main

