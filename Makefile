FILES = manifest.json popup.html options.html content.css global.css \
        background.js content.js options.js popup.js \
        images/icon16.png images/icon48.png images/icon128.png

all: clean build

build:
	zip -r PromptBridge.zip $(FILES)

clean:
	rm -f *.zip
