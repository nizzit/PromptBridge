# PromptBridge

A browser extension that sends selected text to a custom LLM provider using configurable prompts.

## Installation

### Development Mode (Unpacked Extension)

**Firefox:**

1. Open `about:debugging#/runtime/this-firefox` in your browser
2. Click "Load Temporary Add-on"
3. Select any file in the project folder (e.g., `manifest.json`)

**Chrome/Chromium:**

1. Build the Chrome version: `make build-chrome`
2. Open `chrome://extensions/` in your browser
3. Enable "Developer mode" (toggle in top right corner)
4. Click "Load unpacked"
5. Select the `build/chrome/` folder