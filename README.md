# PromptBridge

A browser extension that sends selected text to a custom API provider using configurable prompts.

## Installation

### Development Mode (Unpacked Extension)

**Chrome:**

1. Copy the manifest file for Chrome:
   ```bash
   cp manifest.v3.json manifest.json
   ```
2. Open `chrome://extensions/` in your browser
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the project folder

**Firefox:**

1. Copy the manifest file for Firefox:
   ```bash
   cp manifest.v2.json manifest.json
   ```
2. Open `about:debugging#/runtime/this-firefox` in your browser
3. Click "Load Temporary Add-on"
4. Select any file in the project folder (e.g., `manifest.json`)

**Note:** In Firefox, temporary extensions are removed when you close the browser.
