// Background script
// Can be used for long-running tasks, like listening for events.

// Utility function to get storage API
function getStorage() {
    return typeof browser !== 'undefined' ? browser.storage : chrome.storage;
}

// Function to create context menu
function createContextMenu() {
    // Remove all existing context menus
    chrome.contextMenus.removeAll(() => {
        const storage = getStorage();
        storage.sync.get(['prompts'], function (result) {
            const prompts = result.prompts || [];

            // Create parent menu - shown with or without text selection
            chrome.contextMenus.create({
                id: 'promptbridge-parent',
                title: 'PromptBridge',
                contexts: ['selection', 'page']
            });

            // Add prompt items - only shown when text is selected
            if (prompts.length > 0) {
                prompts.forEach((prompt, index) => {
                    chrome.contextMenus.create({
                        id: `prompt-${index}`,
                        parentId: 'promptbridge-parent',
                        title: prompt.name,
                        contexts: ['selection']
                    });
                });

                // Add separator before settings - only when text is selected
                chrome.contextMenus.create({
                    id: 'separator',
                    parentId: 'promptbridge-parent',
                    type: 'separator',
                    contexts: ['selection']
                });
            }

            // Add settings item - always available
            chrome.contextMenus.create({
                id: 'settings',
                parentId: 'promptbridge-parent',
                title: 'Settings',
                contexts: ['selection', 'page']
            });
        });
    });
}

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
    createContextMenu();
});

// Listen for storage changes to update context menu
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.prompts) {
        createContextMenu();
    }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'settings') {
        chrome.runtime.openOptionsPage();
    } else if (info.menuItemId.startsWith('prompt-')) {
        const promptIndex = parseInt(info.menuItemId.replace('prompt-', ''));
        const selectedText = info.selectionText;

        // Send message to content script to handle prompt
        chrome.tabs.sendMessage(tab.id, {
            action: 'executePrompt',
            promptIndex: promptIndex,
            selectedText: selectedText
        });
    }
});

// Function to call API from background script (bypasses CSP)
async function callAPI(apiUrl, apiToken, modelName, fullPrompt) {
    try {
        const apiEndpoint = apiUrl.endsWith('/')
            ? `${apiUrl}chat/completions`
            : `${apiUrl}/chat/completions`;

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    {
                        role: 'user',
                        content: fullPrompt
                    }
                ]
            }),
            referrerPolicy: 'no-referrer'
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openOptions') {
        chrome.runtime.openOptionsPage();
    } else if (request.action === 'callAPI') {
        // Handle API call request from content script
        callAPI(request.apiUrl, request.apiToken, request.modelName, request.fullPrompt)
            .then(result => {
                sendResponse(result);
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep message channel open for async response
    }
});
