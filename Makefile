HTML_FILES = $(wildcard *.html)
CSS_FILES = $(wildcard *.css)
JS_FILES = $(wildcard *.js)
PNG_FILES = $(wildcard images/*.png)

FILES = manifest.json $(HTML_FILES) $(CSS_FILES) $(JS_FILES) $(PNG_FILES)

all: clean build

build:
	zip -r PromptBridge.zip $(FILES)

clean:
	rm -f *.zip
