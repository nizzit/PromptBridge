# List of all files to include in the archive
FILES = manifest.json popup.html options.html content.css global.css \
        js/background.js js/content.js js/options.js js/popup.js js/utils.js \
        images/icon16.png images/icon48.png images/icon128.png

# Default command
all: build-chrome build-firefox

# Build for Chrome
build-chrome:
	@echo "Building for Chrome..."
	cp manifest.v3.json manifest.json
	zip -r PromptBridge-chrome.zip $(FILES)
	rm manifest.json
	@echo "Done: PromptBridge-chrome.zip"

# Build for Firefox
build-firefox:
	@echo "Building for Firefox..."
	cp manifest.v2.json manifest.json
	zip -r PromptBridge-firefox.zip $(FILES)
	rm manifest.json
	@echo "Done: PromptBridge-firefox.zip"

# Cleanup
clean:
	rm -f *.zip manifest.json