# ─── Configuration ────────────────────────────────────────────────────────────
# Path to the Godot 4 headless binary. Override on the command line if needed:
#   make GODOT=/path/to/godot4 build
GODOT        ?= godot

# Android preset name as defined in export_presets.cfg
PRESET       ?= Android

# Output APK (must match export_path in export_presets.cfg)
APK          ?= build/PromptBridge.apk

# Android package name (must match package/unique_name in export_presets.cfg,
# with $$genname replaced by the actual app name lower-cased)
PACKAGE      ?= com.example.promptbridge

# Main activity launched after install (standard Godot 4 activity class)
ACTIVITY     ?= com.godot.game.GodotApp

# adb device serial – leave empty to use the first connected device:
#   make SERIAL=emulator-5554 deploy
SERIAL       ?=
ADB_FLAGS    := $(if $(SERIAL),-s $(SERIAL),)

# ─── Targets ──────────────────────────────────────────────────────────────────
.PHONY: all build install run deploy clean

## Default: build → install → run
all: deploy

## Export the Godot project as a debug APK
build:
	@echo ">>> Exporting Godot project (debug) …"
	@mkdir -p build
	$(GODOT) --headless --path . --export-debug "$(PRESET)" "$(APK)"

## Install the APK on the connected Android device
install: $(APK)
	@echo ">>> Installing $(APK) on device …"
	adb $(ADB_FLAGS) install -r "$(APK)"

## Launch the app on the device
run:
	@echo ">>> Launching $(PACKAGE)/$(ACTIVITY) …"
	adb $(ADB_FLAGS) shell am start -n "$(PACKAGE)/$(ACTIVITY)"

## Build + install + run in one step
deploy: build install run

## Remove the generated APK
clean:
	@echo ">>> Cleaning build artefacts …"
	rm -f "$(APK)"
