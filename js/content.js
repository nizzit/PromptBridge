// This script is injected into the page.
console.log("Content script loaded.");

let selectionMenu = null;
let resultOverlay = null;
let lastMouseX = 0;
let lastMouseY = 0;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let isProcessing = false; // Flag to indicate if a request is being processed.


// Creates a button for a given prompt.
function createPromptButton(prompt, storage) {
    const button = document.createElement('button');
    button.textContent = prompt.name;
    button.className = 'prompt-button';
    button.style.display = 'none'; // Initially hidden
    button.addEventListener('click', async function () {
        const selectedText = window.getSelection().toString();

        // Hide all other prompt buttons
        const allButtons = selectionMenu.querySelectorAll('.prompt-button');
        allButtons.forEach(btn => {
            btn.style.display = 'none';
        });

        // Show spinner on selection button
        const selectionButton = selectionMenu.querySelector('.selection-button');
        selectionButton.classList.add('disabled');
        selectionButton.innerHTML = '<div class="spinner"></div>';

        // Set processing flag.
        isProcessing = true;

        const originalText = button.textContent;
        await handlePromptSelection(prompt, selectedText, storage, button, originalText);
    });
    return button;
}

// Handles the selection of a prompt and the subsequent API call.
async function handlePromptSelection(prompt, selectedText, storage, button, originalText) {
    const result = await storage.sync.get(['apiUrl', 'apiToken', 'modelName']);
    if (!result.apiUrl || !result.apiToken || !result.modelName) {
        alert('Error: API settings are not configured. Please configure the extension.');
        // Restore button
        button.textContent = originalText;
        return;
    }

    try {
        const fullPrompt = prompt.text + '\n\n' + selectedText;

        // Call API through background script to bypass CSP
        chrome.runtime.sendMessage({
            action: 'callAPI',
            apiUrl: result.apiUrl,
            apiToken: result.apiToken,
            modelName: result.modelName,
            fullPrompt: fullPrompt
        }, (response) => {
            // Remove menu after receiving response
            isProcessing = false;
            removeSelectionMenu();

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
        createResultOverlay(`Error: ${error.message}`);
        console.error('Error:', error);
    }
}

// Function to toggle prompt buttons visibility
function togglePromptButtons() {
    if (!selectionMenu) return;

    const promptButtons = selectionMenu.querySelectorAll('.prompt-button');
    const isVisible = promptButtons[0]?.style.display !== 'none';

    promptButtons.forEach(button => {
        button.style.display = isVisible ? 'none' : 'block';
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

// Creates the selection menu with a toggle button and prompt buttons.
function createSelectionMenu(x, y) {
    // Do not create a new menu while a request is being processed.
    if (isProcessing) {
        return;
    }

    // Remove existing menu if it exists
    removeSelectionMenu();

    // Check if there is selected text
    const selectedText = window.getSelection().toString().trim();
    if (!selectedText) {
        return; // Don't create menu if no selection
    }

    // Get menu position preference and create menu
    const storage = getStorage();
    storage.sync.get(['prompts', 'menuPosition', 'openOnHover'], function (result) {
        const prompts = result.prompts || [];
        const menuPosition = result.menuPosition || 'middle-center';
        const openOnHover = result.openOnHover || false;

        // Calculate position based on preference
        const position = calculateMenuPosition(x, y, menuPosition);

        // Create menu container
        selectionMenu = document.createElement('div');
        selectionMenu.className = 'prompt-menu';
        selectionMenu.style.left = `${position.x}px`;
        selectionMenu.style.top = `${position.y}px`;

        // Create toggle button (SelectionButton)
        const toggleButton = document.createElement('button');
        toggleButton.textContent = '✨';
        toggleButton.className = 'selection-button';

        // Add click handler for manual toggle
        toggleButton.addEventListener('click', togglePromptButtons);

        // Add hover handlers if enabled
        if (openOnHover) {
            toggleButton.addEventListener('mouseenter', function () {
                const promptButtons = selectionMenu.querySelectorAll('.prompt-button');
                promptButtons.forEach(button => {
                    button.style.display = 'block';
                });
            });

            selectionMenu.addEventListener('mouseleave', function () {
                const promptButtons = selectionMenu.querySelectorAll('.prompt-button');
                promptButtons.forEach(button => {
                    button.style.display = 'none';
                });
            });
        }

        selectionMenu.appendChild(toggleButton);

        if (prompts.length === 0) {
            const settingsButton = document.createElement('button');
            settingsButton.textContent = 'Open Settings';
            settingsButton.className = 'prompt-button';
            settingsButton.style.display = 'none';
            settingsButton.addEventListener('click', function () {
                removeSelectionMenu();
                chrome.runtime.sendMessage({ action: 'openOptions' });
            });
            selectionMenu.appendChild(settingsButton);
        } else {
            prompts.forEach((prompt) => {
                const button = createPromptButton(prompt, storage);
                selectionMenu.appendChild(button);
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
    if (selectionMenu) {
        document.body.removeChild(selectionMenu);
        selectionMenu = null;
    }
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
function calculateOverlayPosition() {
    const selection = window.getSelection();
    if (!selection.rangeCount) {
        return { x: lastMouseX + window.scrollX, y: lastMouseY + window.scrollY };
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Overlay width (as defined below).
    const overlayWidth = 500;
    const padding = 10; // Padding from the edges.
    const offsetY = 10; // Offset below the selected text.

    // Center horizontally relative to the selected text.
    let x = rect.left + window.scrollX + (rect.width / 2) - (overlayWidth / 2);

    // Position below the selected text.
    let y = rect.bottom + window.scrollY + offsetY;

    // Check window boundaries.
    const viewportWidth = window.innerWidth;

    // Check the right boundary.
    if (x + overlayWidth > window.scrollX + viewportWidth - padding) {
        x = window.scrollX + viewportWidth - overlayWidth - padding;
    }

    // Check the left boundary.
    if (x < window.scrollX + padding) {
        x = window.scrollX + padding;
    }

    return { x, y };
}

// Adjusts the overlay position if it goes beyond the viewport bottom.
function adjustOverlayPosition() {
    if (!resultOverlay) return;

    const padding = 10; // Padding from the edges.
    const viewportHeight = window.innerHeight;
    const overlayHeight = resultOverlay.offsetHeight;
    const overlayTop = resultOverlay.offsetTop;

    // Check if the overlay goes beyond the bottom of the viewport.
    const overlayBottom = overlayTop + overlayHeight;
    const viewportBottom = window.scrollY + viewportHeight;

    if (overlayBottom > viewportBottom - padding) {
        // Align to the bottom edge with a 10px margin.
        let newY = viewportBottom - overlayHeight - padding;

        // If the overlay still doesn't fit (content is too tall),
        // position it from the top with padding.
        if (newY < window.scrollY + padding) {
            newY = window.scrollY + padding;
        }

        resultOverlay.style.top = `${newY}px`;
    }
}

// Creates the overlay container.
function createOverlayContainer() {
    const position = calculateOverlayPosition();
    resultOverlay = document.createElement('div');
    resultOverlay.className = 'result-overlay';
    resultOverlay.style.left = `${position.x}px`;
    resultOverlay.style.top = `${position.y}px`;
    resultOverlay.style.width = '500px';
    return resultOverlay;
}

// Function to create overlay header
function createOverlayHeader() {
    const header = document.createElement('div');
    header.className = 'overlay-header';

    const title = document.createElement('span');
    title.textContent = '';
    header.appendChild(title);

    return header;
}

// Function to create overlay content
function createOverlayContent(text) {
    const content = document.createElement('div');
    content.className = 'overlay-content';
    content.textContent = text;
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

    // Adjust the position after adding to the DOM, when the browser has calculated its dimensions.
    requestAnimationFrame(() => {
        adjustOverlayPosition();
    });
}

// Creates the result overlay.
function createResultOverlay(text) {
    removeResultOverlay();
    const overlayContainer = createOverlayContainer();
    const header = createOverlayHeader();
    const content = createOverlayContent(text);
    addDragFunctionality(header);
    assembleAndAddOverlay(header, content);
}

// Function to remove result overlay
function removeResultOverlay() {
    if (resultOverlay) {
        document.body.removeChild(resultOverlay);
        resultOverlay = null;
    }
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

    // Save cursor position
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;

    // Use setTimeout to check selection after browser processes the click
    setTimeout(() => {
        // Check if there is selected text before creating menu
        const selectedText = window.getSelection().toString().trim();
        if (!selectedText) {
            return; // Don't create menu if no selection
        }

        // Position menu near cursor
        createSelectionMenu(lastMouseX + window.scrollX, lastMouseY + window.scrollY);
    }, 10);
});

// Remove menu when clicking outside selection
document.addEventListener('mousedown', function (event) {
    // Check if we clicked on our menu.
    // Do not remove the menu while a request is being processed.
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
        const storage = getStorage();
        storage.sync.get(['prompts'], function (result) {
            const prompts = result.prompts || [];
            const prompt = prompts[request.promptIndex];

            if (prompt) {
                // Create a temporary button element for the loading state
                const tempButton = document.createElement('button');
                tempButton.textContent = prompt.name;

                // Execute the prompt
                handlePromptSelection(prompt, request.selectedText, storage, tempButton, prompt.name);
            } else {
                createResultOverlay('Error: Prompt not found');
            }
        });
    }
});
