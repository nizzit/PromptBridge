// This script is injected into the page.
console.log("Content script loaded.");

let selectionMenu = null;
let resultOverlay = null;
let loadingIndicator = null; // Loading indicator for context menu requests
let lastMouseX = 0;
let lastMouseY = 0;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let isProcessing = false; // Request processing flag
let menuCreationId = 0; // Counter to track menu creation attempts and invalidate old ones
let lastMenuInteractionTime = 0; // Timestamp of last menu interaction to prevent duplicate creation

// Prefetch cache: stores results for prompts with prefetch enabled
// Key: prompt name, Value: { status: 'loading'|'ready'|'error', result: data, selectedText: text }
let prefetchCache = {};
let currentMenuSelectedText = ''; // Track text for current menu session
let minSelectionLength = 3; // Default value, will be updated from settings

// Utility: generate stable cache key for prefetch
function getPrefetchCacheKey(promptName, selectedText) {
    return promptName + "|" + selectedText;
}

// Utility function to get storage API
function getStorage() {
    return typeof browser !== 'undefined' ? browser.storage : chrome.storage;
}

// Utility function to get selected text with consistent trimming
function getSelectedText() {
    const text = window.getSelection().toString().trim();
    if (text.length < minSelectionLength) {
        return '';
    }
    return text;
}

// Function to get all text from the page
function getFullPageText() {
    // Get text from body, excluding script and style tags
    const clone = document.body.cloneNode(true);

    // Remove script and style elements
    const scriptsAndStyles = clone.querySelectorAll('script, style, noscript');
    scriptsAndStyles.forEach(el => el.remove());

    // Get text content and clean it up
    let text = clone.textContent || clone.innerText || '';

    // Clean up excessive whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
}

// Function to create a prompt button
function createPromptButton(prompt, storage) {
    const button = document.createElement('button');
    button.textContent = prompt.name;
    button.className = 'pb-prompt-button';
    button.style.display = 'none'; // Initially hidden

    button.addEventListener('click', async function (event) {
        // Prevent event from bubbling to document mouseup handler
        event.stopPropagation();
        // Mark interaction time
        lastMenuInteractionTime = Date.now();

        const selectedText = getSelectedText();

        // Hide all other prompt buttons
        const allButtons = selectionMenu.querySelectorAll('.pb-prompt-button');
        allButtons.forEach(btn => {
            btn.style.display = 'none';
        });

        // Show spinner on selection button
        const selectionButton = selectionMenu.querySelector('.pb-selection-button');
        selectionButton.classList.add('disabled', 'loading');

        // Set processing flag
        isProcessing = true;

        const originalText = button.textContent;
        await handlePromptSelection(prompt, selectedText, storage, button, originalText);
    });
    return button;
}

// Function to handle prompt selection and API call
async function handlePromptSelection(prompt, selectedText, storage, button, originalText) {
    // Try to find cache immediately by prompt+selectedText key
    const prefetchCacheKey = getPrefetchCacheKey(prompt.name, selectedText);
    const matchingCache = prefetchCache[prefetchCacheKey];

    if (prompt.prefetch && matchingCache && matchingCache.selectedText === selectedText) {
        if (matchingCache.status === 'ready') {
            // Show cached result immediately
            isProcessing = false;
            removeSelectionMenu();
            removeLoadingIndicator();
            createResultOverlay(matchingCache.result);
            return;
        } else if (matchingCache.status === 'loading') {
            // Subscribe to prefetch completion and wait
            matchingCache.callbacks.push((status, result) => {
                isProcessing = false;
                removeSelectionMenu();
                removeLoadingIndicator();
                // Show the result
                createResultOverlay(result);
            });
            // Keep spinner and processing state - will be handled by callback
            return;
        } else if (matchingCache.status === 'error') {
            // Show error from prefetch
            isProcessing = false;
            removeSelectionMenu();
            removeLoadingIndicator();
            createResultOverlay(matchingCache.result);
            return;
        }
    }

    const result = await storage.sync.get(['apiUrl', 'apiToken', 'modelName']);

    // Use prompt-specific model if available, otherwise use global model
    const modelName = prompt.modelName || result.modelName;

    if (!result.apiUrl || !result.apiToken || !modelName) {
        alert('Error: API settings are not configured. Please configure the extension.');
        // Restore button
        button.textContent = originalText;
        // Remove loading indicator if shown
        removeLoadingIndicator();
        isProcessing = false;
        return;
    }

    try {
        const fullPrompt = prompt.text + '\n\n' + selectedText;

        // Call API through background script to bypass CSP
        chrome.runtime.sendMessage({
            action: 'callAPI',
            apiUrl: result.apiUrl,
            apiToken: result.apiToken,
            modelName: modelName,
            fullPrompt: fullPrompt
        }, (response) => {
            // Remove menu after receiving response
            isProcessing = false;
            removeSelectionMenu();
            // Remove loading indicator
            removeLoadingIndicator();

            if (response.success) {
                const data = response.data;
                if (data.choices && data.choices[0] && data.choices[0].message) {
                    const resultText = data.choices[0].message.content;
                    createResultOverlay(resultText);
                } else {
                    createResultOverlay('Error: unexpected response format from API');
                }
            } else {
                createResultOverlay(`Error accessing API: ${response.error}`);
                console.error('API Error:', response.error);
            }
        });

    } catch (error) {
        // Remove menu on error too
        isProcessing = false;
        removeSelectionMenu();
        // Remove loading indicator
        removeLoadingIndicator();
        createResultOverlay(`Error: ${error.message}`);
        console.error('Error:', error);
    }
}
// Utility function to create a positioned container
function createPositionedContainer(className, x, y) {
    const container = document.createElement('div');
    container.className = className;
    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
    return container;
}

// Utility function to create a styled button
function createStyledButton(text, className, additionalClasses = []) {
    const button = document.createElement('button');
    button.textContent = text;
    button.className = [className, ...additionalClasses].join(' ');
    return button;
}

// Utility function to remove element with fade-out animation
function removeElementWithFadeOut(element, callback = null) {
    if (!element) {
        if (callback) callback();
        return;
    }

    // Check if element is still in the DOM
    if (!element.parentNode) {
        if (callback) callback();
        return;
    }

    // Apply fade out animation
    element.style.animation = 'pb-fadeOutButton 0.2s ease-out forwards';
    element.classList.add('closing');

    // Wait for animation to complete before removing
    setTimeout(() => {
        // Double-check element still exists and has a parent before removing
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
        if (callback) callback();
    }, 200); // Match animation duration
}


// Function to start prefetch for a prompt
async function startPrefetch(prompt, selectedText, storage) {
    const cacheKey = getPrefetchCacheKey(prompt.name, selectedText);

    // Don't start prefetch again for loading/ready states
    if (prefetchCache[cacheKey] && (prefetchCache[cacheKey].status === 'loading' || prefetchCache[cacheKey].status === 'ready')) {
        // Debug
        console.log('PREFETCH: already running or finished for', cacheKey);
        return;
    }
    // Mark as loading
    prefetchCache[cacheKey] = {
        status: 'loading',
        result: null,
        selectedText: selectedText,
        callbacks: [] // Array of callbacks to call when ready
    };

    const result = await storage.sync.get(['apiUrl', 'apiToken', 'modelName']);

    // Use prompt-specific model if available, otherwise use global model
    const modelName = prompt.modelName || result.modelName;

    if (!result.apiUrl || !result.apiToken || !modelName) {
        prefetchCache[cacheKey] = {
            status: 'error',
            result: 'API settings not configured',
            selectedText: selectedText,
            callbacks: []
        };
        // Call any waiting callbacks
        executePrefetchCallbacks(cacheKey);
        return;
    }

    try {
        const fullPrompt = prompt.text + '\n\n' + selectedText;

        // Call API through background script
        chrome.runtime.sendMessage({
            action: 'callAPI',
            apiUrl: result.apiUrl,
            apiToken: result.apiToken,
            modelName: modelName,
            fullPrompt: fullPrompt
        }, (response) => {
            // Only update cache if this is still the same selection session
            if (prefetchCache[cacheKey]?.selectedText === selectedText) {
                if (response.success) {
                    const data = response.data;
                    if (data.choices && data.choices[0] && data.choices[0].message) {
                        prefetchCache[cacheKey] = {
                            status: 'ready',
                            result: data.choices[0].message.content,
                            selectedText: selectedText,
                            callbacks: prefetchCache[cacheKey].callbacks
                        };

                        // Execute any waiting callbacks
                        executePrefetchCallbacks(cacheKey);
                    } else {
                        prefetchCache[cacheKey] = {
                            status: 'error',
                            result: 'Unexpected response format from API',
                            selectedText: selectedText,
                            callbacks: prefetchCache[cacheKey].callbacks
                        };
                        executePrefetchCallbacks(cacheKey);
                    }
                } else {
                    prefetchCache[cacheKey] = {
                        status: 'error',
                        result: `Error accessing API: ${response.error}`,
                        selectedText: selectedText,
                        callbacks: prefetchCache[cacheKey].callbacks
                    };
                    executePrefetchCallbacks(cacheKey);
                }
            }
        });
    } catch (error) {
        if (prefetchCache[cacheKey]?.selectedText === selectedText) {
            prefetchCache[cacheKey] = {
                status: 'error',
                result: `Error: ${error.message}`,
                selectedText: selectedText,
                callbacks: prefetchCache[cacheKey].callbacks
            };
            executePrefetchCallbacks(cacheKey);
        }
    }
}

// Function to execute callbacks waiting for prefetch result
function executePrefetchCallbacks(cacheKey) {
    const cached = prefetchCache[cacheKey];
    if (!cached || !cached.callbacks) return;

    // Execute all callbacks
    cached.callbacks.forEach(callback => {
        try {
            callback(cached.status, cached.result);
        } catch (error) {
            console.error('Error executing prefetch callback:', error);
        }
    });

    // Clear callbacks after execution
    cached.callbacks = [];
}

// Function to toggle prompt buttons visibility
function togglePromptButtons(shouldStartPrefetch = false) {
    if (!selectionMenu) return;

    const promptButtons = selectionMenu.querySelectorAll('.pb-prompt-button');
    const isVisible = promptButtons[0]?.style.display !== 'none';

    if (isVisible) {
        // Hide with animation
        promptButtons.forEach(button => {
            button.style.animation = 'pb-fadeOutButton 0.2s ease-out forwards';
        });

        setTimeout(() => {
            promptButtons.forEach(button => {
                button.style.display = 'none';
                button.style.animation = ''; // Reset animation
            });
        }, 200);
    } else {
        // Show with animation
        promptButtons.forEach(button => {
            button.style.display = 'block';
            button.style.animation = 'pb-fadeInButton 0.2s ease-out forwards';
        });

        // Start prefetch if requested (for on-menu timing)
        if (shouldStartPrefetch) {
            startPrefetchForVisiblePrompts();
        }
    }
}

// Function to start prefetch for all prompts with prefetch enabled
function startPrefetchForVisiblePrompts() {
    if (!selectionMenu) return;

    const selectedText = currentMenuSelectedText;
    if (!selectedText) return;

    const storage = getStorage();
    storage.sync.get(['prompts'], function (result) {
        const prompts = result.prompts || [];
        prompts.forEach((prompt) => {
            if (prompt.prefetch) {
                // Prevent starting prefetch for the same prompt + selectedText
                startPrefetch(prompt, selectedText, storage);
            }
        });
    });
}

// Function to calculate menu position based on user preference
function calculateMenuPosition(cursorX, cursorY, menuPosition) {
    // Button size is 36px + padding 8px = 44px container width/height
    // To center button on cursor, offset by half: 22px
    const buttonSize = 22; // Half of (36px button + 8px padding on each side)
    const offset = 50; // Offset from cursor for non-center positions

    let x = cursorX;
    let y = cursorY;

    switch (menuPosition) {
        case 'top-left':
            x = cursorX - offset;
            y = cursorY - offset;
            break;
        case 'top-center':
            x = cursorX - buttonSize;
            y = cursorY - offset;
            break;
        case 'top-right':
            x = cursorX + offset - 2 * buttonSize;
            y = cursorY - offset;
            break;
        case 'middle-left':
            x = cursorX - offset;
            y = cursorY - buttonSize;
            break;
        case 'middle-center':
            x = cursorX - buttonSize;
            y = cursorY - buttonSize;
            break;
        case 'middle-right':
            x = cursorX + offset - 2 * buttonSize;
            y = cursorY - buttonSize;
            break;
        case 'bottom-left':
            x = cursorX - offset;
            y = cursorY + offset - 2 * buttonSize;
            break;
        case 'bottom-center':
            x = cursorX - buttonSize;
            y = cursorY + offset - 2 * buttonSize;
            break;
        case 'bottom-right':
            x = cursorX + offset - 2 * buttonSize;
            y = cursorY + offset - 2 * buttonSize;
            break;
        default:
            // Default to middle-center
            x = cursorX - buttonSize;
            y = cursorY - buttonSize;
    }

    return { x, y };
}

// Function to forcefully remove all existing menus from DOM (prevents duplicates)
function removeAllExistingMenus() {
    // Find and remove all prompt-menu elements
    const existingMenus = document.querySelectorAll('.pb-prompt-menu');
    existingMenus.forEach(menu => {
        if (menu && menu.parentNode) {
            menu.parentNode.removeChild(menu);
        }
    });

    // Also find and remove any loading indicators
    const existingIndicators = document.querySelectorAll('.pb-loading-indicator');
    existingIndicators.forEach(indicator => {
        if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
        }
    });

    // Reset the selectionMenu reference if it was removed
    if (selectionMenu && !document.body.contains(selectionMenu)) {
        selectionMenu = null;
    }

    // Reset the loadingIndicator reference if it was removed
    if (loadingIndicator && !document.body.contains(loadingIndicator)) {
        loadingIndicator = null;
    }
}

// Function to create selection menu with toggle button and prompt buttons
function createSelectionMenu(x, y, targetElement) {
    // Don't create new menu while processing request
    if (isProcessing) {
        return;
    }

    // Increment creation ID to invalidate any pending creations
    menuCreationId++;
    const currentId = menuCreationId;

    // Force remove ALL existing menus from DOM (prevent duplicates on fast selection)
    removeAllExistingMenus();

    // Check if there is selected text
    const selectedText = getSelectedText();
    if (!selectedText) {
        return; // Don't create menu if no selection
    }

    // Clear prefetch cache for new session (remove only old values, keep cache of other selections if needed)
    prefetchCache = {};
    currentMenuSelectedText = selectedText;

    // Get menu position preference and create menu
    const storage = getStorage();
    storage.sync.get(['prompts', 'menuPosition', 'openOnHover', 'prefetchTiming', 'enableInInputs', 'minSelectionLength', 'enableFloatingButton'], function (result) {
        // Update global min selection length
        if (result.minSelectionLength !== undefined) {
            minSelectionLength = result.minSelectionLength;
        }

        // Check if floating button is enabled (default to true)
        const enableFloatingButton = result.enableFloatingButton !== undefined ? result.enableFloatingButton : true;
        if (!enableFloatingButton) {
            return; // Don't create menu if floating button is disabled
        }

        // Check if selection is in an input/textarea element
        if (targetElement) {
            const isInputField = targetElement.tagName === 'INPUT' ||
                targetElement.tagName === 'TEXTAREA' ||
                targetElement.isContentEditable;

            // If enableInInputs is false (default), don't show menu in input fields
            const enableInInputs = result.enableInInputs !== undefined ? result.enableInInputs : false;
            if (isInputField && !enableInInputs) {
                return; // Don't create menu in input fields when disabled
            }
        }
        // Check if this creation is still valid (i.e., no new creation started in the meantime)
        if (currentId !== menuCreationId) {
            return;
        }

        const prompts = result.prompts || [];
        const menuPosition = result.menuPosition || 'middle-center';
        const openOnHover = result.openOnHover || false;
        const prefetchTiming = result.prefetchTiming || 'on-button';

        // Calculate position based on preference
        const position = calculateMenuPosition(x, y, menuPosition);

        // Create menu container
        selectionMenu = createPositionedContainer('pb-prompt-menu', position.x, position.y);

        // Create toggle button (SelectionButton)
        const toggleButton = createStyledButton('✨', 'pb-selection-button');

        // Add click handler for manual toggle
        toggleButton.addEventListener('click', function (event) {
            // Prevent event from bubbling to document mouseup handler
            event.stopPropagation();
            // Mark interaction time
            lastMenuInteractionTime = Date.now();

            // Start prefetch on menu open if timing is set to on-menu
            const shouldStartPrefetch = (prefetchTiming === 'on-menu');
            togglePromptButtons(shouldStartPrefetch);
        });

        // Add hover handlers if enabled
        if (openOnHover) {
            toggleButton.addEventListener('mouseenter', function (event) {
                // Mark interaction time
                lastMenuInteractionTime = Date.now();

                const promptButtons = selectionMenu.querySelectorAll('.pb-prompt-button');
                promptButtons.forEach(button => {
                    button.style.display = 'block';
                    button.style.animation = 'pb-fadeInButton 0.2s ease-out forwards';
                });

                // Start prefetch on menu open if timing is set to on-menu
                if (prefetchTiming === 'on-menu') {
                    startPrefetchForVisiblePrompts();
                }
            });

            selectionMenu.addEventListener('mouseleave', function (event) {
                const promptButtons = selectionMenu.querySelectorAll('.pb-prompt-button');
                promptButtons.forEach(button => {
                    button.style.animation = 'pb-fadeOutButton 0.2s ease-out forwards';
                });

                setTimeout(() => {
                    if (!selectionMenu) return;
                    const promptButtons = selectionMenu.querySelectorAll('.pb-prompt-button');
                    promptButtons.forEach(button => {
                        button.style.display = 'none';
                        button.style.animation = ''; // Reset animation
                    });
                }, 200);
            });

            // Prevent mouseup events on the menu from creating new menus
            selectionMenu.addEventListener('mouseup', function (event) {
                event.stopPropagation();
                lastMenuInteractionTime = Date.now();
            });
        }

        // Always prevent mouseup events on the menu from creating new menus
        // (regardless of hover mode)
        selectionMenu.addEventListener('mouseup', function (event) {
            event.stopPropagation();
            lastMenuInteractionTime = Date.now();
        });

        selectionMenu.appendChild(toggleButton);

        if (prompts.length === 0) {
            const settingsButton = createStyledButton('Open Settings', 'pb-prompt-button');
            settingsButton.style.display = 'none';
            settingsButton.addEventListener('click', function (event) {
                // Prevent event from bubbling to document mouseup handler
                event.stopPropagation();
                // Mark interaction time
                lastMenuInteractionTime = Date.now();

                removeSelectionMenu();
                chrome.runtime.sendMessage({ action: 'openOptions' });
            });
            selectionMenu.appendChild(settingsButton);
        } else {
            prompts.forEach((prompt) => {
                const button = createPromptButton(prompt, storage);
                selectionMenu.appendChild(button);

                // Start prefetch for prompts that have it enabled and timing is on-button
                if (prompt.prefetch && prefetchTiming === 'on-button') {
                    startPrefetch(prompt, selectedText, storage);
                }
            });
        }

        // Add menu to document
        if (selectionMenu && selectionMenu.parentNode === null) {
            document.body.appendChild(selectionMenu);
        }

    });
}

// Function to remove selection menu
function removeSelectionMenu() {
    const menuToRemove = selectionMenu;
    removeElementWithFadeOut(selectionMenu, () => {
        // Only reset global state if the global selectionMenu is still the one we removed
        if (selectionMenu === menuToRemove) {
            selectionMenu = null;
            // Clear prefetch cache when menu is removed
            prefetchCache = {};
            currentMenuSelectedText = '';
        }
    });
}

// Function to handle mouse move during dragging
function onMouseMove(e) {
    if (isDragging && resultOverlay) {
        resultOverlay.style.left = `${e.clientX - dragOffsetX}px`;
        resultOverlay.style.top = `${e.clientY - dragOffsetY}px`;
    }
}

// Function to handle mouse up during dragging
function onMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
}

// Function to calculate overlay position based on selected text
function calculateOverlayPosition(overlayWidth) {
    const selection = window.getSelection();
    if (!selection.rangeCount) {
        return { x: lastMouseX + window.scrollX, y: lastMouseY + window.scrollY };
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Overlay width from settings
    const padding = 10; // Padding from edges
    const offsetY = 10; // Offset below selected text

    // Center horizontally relative to selected text
    let x = rect.left + window.scrollX + (rect.width / 2) - (overlayWidth / 2);

    // Place below selected text
    let y = rect.bottom + window.scrollY + offsetY;

    // Check window boundaries
    const viewportWidth = window.innerWidth;

    // Check right boundary
    if (x + overlayWidth > window.scrollX + viewportWidth - padding) {
        x = window.scrollX + viewportWidth - overlayWidth - padding;
    }

    // Check left boundary
    if (x < window.scrollX + padding) {
        x = window.scrollX + padding;
    }

    return { x, y };
}

// Function to set optimal overlay size based on content
function setOptimalOverlaySize(maxWidth, maxHeight) {
    if (!resultOverlay) return;

    const content = resultOverlay.querySelector('.pb-overlay-content');
    if (!content) return;

    // Temporarily set max dimensions to measure content
    resultOverlay.style.width = 'auto';
    resultOverlay.style.maxWidth = `${maxWidth}px`;
    content.style.maxHeight = 'none';

    // Get the natural content size
    const contentWidth = content.scrollWidth;
    const contentHeight = content.scrollHeight;

    // Get header height
    const header = resultOverlay.querySelector('.pb-overlay-header');
    const headerHeight = header ? header.offsetHeight : 0;
    const padding = 16; // 8px padding on each side

    // Calculate ideal dimensions with limits for initial display
    let idealWidth = Math.min(contentWidth + padding + 20, maxWidth); // +20 for potential scrollbar
    let idealHeight = Math.min(contentHeight + headerHeight + padding, maxHeight);

    // Apply minimum constraints
    idealWidth = Math.max(idealWidth, 200);
    idealHeight = Math.max(idealHeight, 100);

    // Set the calculated size
    resultOverlay.style.width = `${idealWidth}px`;
    resultOverlay.style.height = `${idealHeight}px`;
    resultOverlay.style.maxWidth = 'none';
}

// Function to adjust overlay position if it goes beyond viewport bottom
function adjustOverlayPosition() {
    if (!resultOverlay) return;

    const padding = 10; // Padding from edges
    const viewportHeight = window.innerHeight;
    const overlayHeight = resultOverlay.offsetHeight;
    const overlayTop = resultOverlay.offsetTop;

    // Check if overlay goes beyond viewport bottom boundary
    const overlayBottom = overlayTop + overlayHeight;
    const viewportBottom = window.scrollY + viewportHeight;

    if (overlayBottom > viewportBottom - padding) {
        // Align to bottom edge with 10px offset
        let newY = viewportBottom - overlayHeight - padding;

        // If overlay still doesn't fit after alignment (content too tall),
        // place it from top edge with offset
        if (newY < window.scrollY + padding) {
            newY = window.scrollY + padding;
        }

        resultOverlay.style.top = `${newY}px`;
    }
}

// Function to create overlay container
function createOverlayContainer(overlayWidth) {
    const position = calculateOverlayPosition(overlayWidth);
    resultOverlay = document.createElement('div');
    resultOverlay.className = 'pb-result-overlay';
    resultOverlay.style.left = `${position.x}px`;
    resultOverlay.style.top = `${position.y}px`;
    return resultOverlay;
}

// Function to create overlay header
function createOverlayHeader() {
    const header = document.createElement('div');
    header.className = 'pb-overlay-header';
    return header;
}

const ALLOWED_MARKDOWN_TAGS = new Set([
    'A', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HR', 'LI', 'OL', 'P', 'PRE', 'SPAN', 'STRONG', 'UL'
]);

const ALLOWED_MARKDOWN_ATTRIBUTES = {
    '*': ['class'],
    'A': ['href', 'title', 'target', 'rel'],
    'CODE': ['class'],
    'PRE': ['class']
};

const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function sanitizeMarkdownAttributes(element) {
    const allowedAttrNames = new Set([
        ...((ALLOWED_MARKDOWN_ATTRIBUTES['*'] || []).map(attr => attr.toLowerCase())),
        ...((ALLOWED_MARKDOWN_ATTRIBUTES[element.tagName] || []).map(attr => attr.toLowerCase()))
    ]);

    Array.from(element.attributes).forEach(attr => {
        const attrName = attr.name.toLowerCase();
        if (!allowedAttrNames.has(attrName)) {
            element.removeAttribute(attr.name);
            return;
        }

        if (element.tagName === 'A' && attrName === 'href') {
            const hrefValue = element.getAttribute('href') || '';
            try {
                const url = new URL(hrefValue, window.location.origin);
                if (!ALLOWED_URL_PROTOCOLS.has(url.protocol)) {
                    element.removeAttribute('href');
                } else {
                    element.setAttribute('rel', 'noopener noreferrer');
                    if (!element.getAttribute('target')) {
                        element.setAttribute('target', '_blank');
                    }
                }
            } catch (error) {
                element.removeAttribute('href');
            }
        }
    });
}

function sanitizeParsedMarkdown(unsafeHTML) {
    if (!unsafeHTML) {
        return '';
    }

    const parser = new DOMParser();
    const parsedDoc = parser.parseFromString(`<div>${unsafeHTML}</div>`, 'text/html');
    const container = parsedDoc.body.firstElementChild;

    if (!container) {
        return '';
    }

    const nodesToProcess = [container];

    while (nodesToProcess.length > 0) {
        const currentNode = nodesToProcess.pop();
        Array.from(currentNode.childNodes).forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                return;
            }

            if (child.nodeType === Node.COMMENT_NODE) {
                child.remove();
                return;
            }

            if (child.nodeType === Node.ELEMENT_NODE) {
                if (!ALLOWED_MARKDOWN_TAGS.has(child.tagName)) {
                    const textNode = parsedDoc.createTextNode(child.textContent || '');
                    child.replaceWith(textNode);
                } else {
                    sanitizeMarkdownAttributes(child);
                    nodesToProcess.push(child);
                }
                return;
            }

            child.remove();
        });
    }

    return container.innerHTML;
}

// Function to create overlay content
function createOverlayContent(text, enableMarkdown = true) {
    const content = document.createElement('div');
    content.className = 'pb-overlay-content';

    if (enableMarkdown) {
        const unsafeHtml = parseMarkdown(text);
        const sanitizedHtml = sanitizeParsedMarkdown(unsafeHtml);

        // Parse sanitized HTML safely using DOMParser to avoid innerHTML security issues
        const parser = new DOMParser();
        const doc = parser.parseFromString(sanitizedHtml, 'text/html');

        // Append all child nodes from parsed document body
        while (doc.body.firstChild) {
            content.appendChild(doc.body.firstChild);
        }
    } else {
        // Display as plain text without markdown parsing
        content.textContent = text;
    }

    return content;
}

// Function to add drag functionality to header
function addDragFunctionality(header) {
    header.addEventListener('mousedown', function (e) {
        isDragging = true;
        dragOffsetX = e.clientX - resultOverlay.offsetLeft;
        dragOffsetY = e.clientY - resultOverlay.offsetTop;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// Function to assemble and add overlay to document
function assembleAndAddOverlay(header, content) {
    resultOverlay.appendChild(header);
    resultOverlay.appendChild(content);
    document.body.appendChild(resultOverlay);
}

// Function to create result overlay
function createResultOverlay(text) {
    removeResultOverlay();

    // Load overlay size settings and markdown preference
    const storage = getStorage();
    storage.sync.get(['resultWidth', 'resultHeight', 'enableMarkdown'], function (result) {
        const resultWidth = result.resultWidth;
        const resultHeight = result.resultHeight;
        const enableMarkdown = result.enableMarkdown !== undefined ? result.enableMarkdown : true;

        const overlayContainer = createOverlayContainer(resultWidth);
        const header = createOverlayHeader();
        const content = createOverlayContent(text, enableMarkdown);
        addDragFunctionality(header);
        assembleAndAddOverlay(header, content);

        // Calculate optimal size based on content
        requestAnimationFrame(() => {
            setOptimalOverlaySize(resultWidth, resultHeight);
            adjustOverlayPosition();
        });
    });
}

// Function to create loading indicator for context menu requests
function createLoadingIndicator() {
    // Force remove ALL existing menus and indicators (prevent duplicates)
    removeAllExistingMenus();

    // Remove existing indicator if any
    removeLoadingIndicator();

    // Position at last known mouse position or center of viewport
    const x = (lastMouseX || window.innerWidth / 2) + window.scrollX;
    const y = (lastMouseY || window.innerHeight / 2) + window.scrollY;

    // Create loading indicator container
    loadingIndicator = createPositionedContainer('pb-loading-indicator', x, y);

    // Create spinner button
    const spinnerButton = createStyledButton('✨', 'pb-selection-button', ['loading', 'disabled']);
    loadingIndicator.appendChild(spinnerButton);

    document.body.appendChild(loadingIndicator);
}

// Function to remove loading indicator
function removeLoadingIndicator() {
    const indicatorToRemove = loadingIndicator;
    removeElementWithFadeOut(indicatorToRemove, () => {
        if (loadingIndicator === indicatorToRemove) {
            loadingIndicator = null;
        }
    });
}

// Function to remove result overlay
function removeResultOverlay() {
    const overlayToRemove = resultOverlay;
    removeElementWithFadeOut(overlayToRemove, () => {
        if (resultOverlay === overlayToRemove) {
            resultOverlay = null;
        }
    });
}


// Mouse button release event handler
document.addEventListener('mouseup', function (event) {
    // Ignore right click (context menu)
    if (event.button === 2) {
        return;
    }

    // If clicked on menu, don't recreate it
    if (selectionMenu && selectionMenu.contains(event.target)) {
        return;
    }

    // Check if clicked on result overlay
    if (resultOverlay && resultOverlay.contains(event.target)) {
        // Get setting for enabling floating button in result window
        const storage = getStorage();
        storage.sync.get(['enableFloatingButtonInResult'], function (result) {
            const enableFloatingButtonInResult = result.enableFloatingButtonInResult !== undefined ? result.enableFloatingButtonInResult : false;

            // If setting is disabled (default), don't create menu in result overlay
            if (!enableFloatingButtonInResult) {
                return;
            }

            // If setting is enabled, proceed with menu creation
            // Save cursor position
            lastMouseX = event.clientX;
            lastMouseY = event.clientY;

            // Use setTimeout to check selection after browser processes the click
            setTimeout(() => {
                // Check if there is selected text before creating menu
                const selectedText = getSelectedText();
                if (!selectedText) {
                    return; // Don't create menu if no selection
                }

                // Reset interaction time if this is a new selection (different text or no menu exists)
                const existingMenu = document.querySelector('.pb-prompt-menu');
                if (!existingMenu || !existingMenu.parentNode || currentMenuSelectedText !== selectedText) {
                    // This is a new selection, allow menu creation
                    lastMenuInteractionTime = 0;
                }

                // Don't create menu if we just interacted with existing menu (within 100ms)
                if (Date.now() - lastMenuInteractionTime < 100) {
                    return;
                }

                // Don't create new menu if one already exists in DOM and is not closing
                if (existingMenu && existingMenu.parentNode && !existingMenu.classList.contains('closing')) {
                    return;
                }

                // Position menu near cursor, pass the target element for input field detection
                createSelectionMenu(lastMouseX + window.scrollX, lastMouseY + window.scrollY, event.target);
            }, 10);
        });
        return;
    }

    // Save cursor position
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;

    // Use setTimeout to check selection after browser processes the click
    setTimeout(() => {
        // Check if there is selected text before creating menu
        const selectedText = getSelectedText();
        if (!selectedText) {
            return; // Don't create menu if no selection
        }

        // Reset interaction time if this is a new selection (different text or no menu exists)
        const existingMenu = document.querySelector('.pb-prompt-menu');
        if (!existingMenu || !existingMenu.parentNode || currentMenuSelectedText !== selectedText) {
            // This is a new selection, allow menu creation
            lastMenuInteractionTime = 0;
        }

        // Don't create menu if we just interacted with existing menu (within 100ms)
        if (Date.now() - lastMenuInteractionTime < 100) {
            return;
        }

        // Don't create new menu if one already exists in DOM (check actual DOM, not variable)
        // Don't create new menu if one already exists in DOM and is not closing
        if (existingMenu && existingMenu.parentNode && !existingMenu.classList.contains('closing')) {
            return;
        }

        // Position menu near cursor, pass the target element for input field detection
        createSelectionMenu(lastMouseX + window.scrollX, lastMouseY + window.scrollY, event.target);
    }, 10);
});

// Remove menu when clicking outside selection
document.addEventListener('mousedown', function (event) {
    // Check if we clicked on our menu
    // Don't remove menu while processing request
    if (selectionMenu && !selectionMenu.contains(event.target) && !isProcessing) {
        removeSelectionMenu();
    }
    if (resultOverlay && !resultOverlay.contains(event.target)) {
        removeResultOverlay();
    }
});

// Close overlay on Escape key
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        if (resultOverlay) {
            removeResultOverlay();
        }
        if (selectionMenu) {
            removeSelectionMenu();
        }
    }
});

// Remove menu when opening context menu (right click)
document.addEventListener('contextmenu', function (event) {
    if (selectionMenu && !isProcessing) {
        removeSelectionMenu();
    }
});



// Listen for messages from background script (context menu)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'executePrompt') {
        // Show loading indicator immediately
        createLoadingIndicator();

        const storage = getStorage();
        storage.sync.get(['prompts'], function (result) {
            const prompts = result.prompts || [];
            const prompt = prompts[request.promptIndex];

            if (prompt) {
                // Use model from context menu request if available, otherwise use prompt's model
                if (request.promptModel) {
                    prompt.modelName = request.promptModel;
                }

                // Determine what text to use
                let textToUse = (request.selectedText || '').trim();

                // Get min selection length from storage to ensure we have the latest value
                storage.sync.get(['minSelectionLength'], function (settings) {
                    const currentMinLength = settings.minSelectionLength !== undefined ? settings.minSelectionLength : 3;

                    if (textToUse.length <= currentMinLength) {
                        textToUse = '';
                    }

                    // If no selection and prompt supports full page, use full page text
                    if (!textToUse && prompt.useFullPage) {
                        textToUse = getFullPageText();
                    }

                    // Create a temporary button element for the loading state
                    const tempButton = document.createElement('button');
                    tempButton.textContent = prompt.name;

                    // Execute the prompt
                    handlePromptSelection(prompt, textToUse, storage, tempButton, prompt.name);
                });
            } else {
                // Remove loading indicator on error
                removeLoadingIndicator();
                createResultOverlay('Error: Prompt not found');
            }
        });
    }
});
