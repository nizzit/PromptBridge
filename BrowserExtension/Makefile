HTML_FILES = $(wildcard *.html)
CSS_FILES = $(wildcard *.css)
JS_FILES = $(wildcard *.js)
PNG_FILES = $(wildcard images/*.png)
COMMON_FILES = $(HTML_FILES) $(CSS_FILES) $(JS_FILES) $(PNG_FILES)

# Default target: build both versions
all: clean build-firefox build-chrome

# Build Firefox version (uses manifest.json)
build-firefox:
	@echo "Building Firefox version..."
	zip -r PromptBridge-Firefox.zip $(COMMON_FILES) manifest.json

# Build Chrome version (uses manifest-chrome.json renamed to manifest.json)
build-chrome:
	@echo "Building Chrome version..."
	@cp manifest.json manifest-firefox.json.bak
	@cp manifest-chrome.json manifest.json
	zip -r PromptBridge-Chrome.zip $(COMMON_FILES) manifest.json
	@mv manifest-firefox.json.bak manifest.json
	@echo "Unpacking Chrome version for development..."
	@mkdir -p build/chrome
	@unzip -o -q PromptBridge-Chrome.zip -d build/chrome
	@echo "Chrome version built successfully"
	@echo "Chrome unpacked to: build/chrome/"

# Clean all build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -f *.zip *.bak
	rm -rf build/

.PHONY: all build-firefox build-chrome clean
