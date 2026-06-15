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

            // Add prompt items
            if (prompts.length > 0) {
                let hasSelectionOnlyPrompts = false;
                let hasFullPagePrompts = false;

                prompts.forEach((prompt, index) => {
                    // Determine contexts based on useFullPage flag
                    const contexts = prompt.useFullPage ? ['selection', 'page'] : ['selection'];

                    chrome.contextMenus.create({
                        id: `prompt-${index}`,
                        parentId: 'promptbridge-parent',
                        title: prompt.name,
                        contexts: contexts
                    });

                    if (prompt.useFullPage) {
                        hasFullPagePrompts = true;
                    } else {
                        hasSelectionOnlyPrompts = true;
                    }
                });

                // Add separator before settings
                // Show on page context only if there are full page prompts
                const separatorContexts = hasFullPagePrompts ? ['selection', 'page'] : ['selection'];
                chrome.contextMenus.create({
                    id: 'separator',
                    parentId: 'promptbridge-parent',
                    type: 'separator',
                    contexts: separatorContexts
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
        const selectedText = (info.selectionText || '').trim();

        // Get the prompt to determine if it has a specific model
        const storage = getStorage();
        storage.sync.get(['prompts'], function (result) {
            const prompts = result.prompts || [];
            const prompt = prompts[promptIndex];

            if (prompt) {
                // Send message to content script to handle prompt
                chrome.tabs.sendMessage(tab.id, {
                    action: 'executePrompt',
                    promptIndex: promptIndex,
                    selectedText: selectedText,
                    useFullPageIfNoSelection: true,
                    promptModel: prompt.modelName || null
                });
            }
        });
    }
});

// Function to call API with streaming from background script (bypasses CSP)
async function callAPIStreaming(apiUrl, apiToken, modelName, fullPrompt, tabId, streamId) {
    const apiEndpoint = apiUrl.endsWith('/')
        ? `${apiUrl}chat/completions`
        : `${apiUrl}/chat/completions`;

    let response;
    try {
        response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelName,
                stream: true,
                messages: [
                    {
                        role: 'user',
                        content: fullPrompt
                    }
                ]
            }),
            referrerPolicy: 'no-referrer'
        });
    } catch (error) {
        chrome.tabs.sendMessage(tabId, {
            action: 'streamError',
            streamId,
            error: error.message
        });
        return;
    }

    if (!response.ok) {
        chrome.tabs.sendMessage(tabId, {
            action: 'streamError',
            streamId,
            error: `API error: ${response.status} ${response.statusText}`
        });
        return;
    }

    // Notify content script that streaming has started
    chrome.tabs.sendMessage(tabId, { action: 'streamStart', streamId });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE lines from buffer
            let newlineIdx;
            while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIdx).trim();
                buffer = buffer.slice(newlineIdx + 1);

                if (!line.startsWith('data:')) continue;

                const data = line.slice(5).trim();
                if (data === '[DONE]') break;

                let parsed;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    continue;
                }

                const delta = parsed?.choices?.[0]?.delta?.content;
                if (delta != null) {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'streamChunk',
                        streamId,
                        chunk: delta
                    });
                }
            }
        }
    } catch (error) {
        chrome.tabs.sendMessage(tabId, {
            action: 'streamError',
            streamId,
            error: error.message
        });
        return;
    }

    chrome.tabs.sendMessage(tabId, { action: 'streamEnd', streamId });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openOptions') {
        chrome.runtime.openOptionsPage();
    } else if (request.action === 'callAPI') {
        // Handle streaming API call request from content script
        const tabId = sender.tab?.id;
        if (!tabId) {
            sendResponse({ success: false, error: 'No tab ID available' });
            return;
        }
        // Acknowledge immediately so content script doesn't wait
        sendResponse({ success: true, streaming: true });

        callAPIStreaming(
            request.apiUrl,
            request.apiToken,
            request.modelName,
            request.fullPrompt,
            tabId,
            request.streamId
        );
        return true; // Keep channel open for sendResponse
    }
});
