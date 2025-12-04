// Editing state
let editingIndex = null;

// Default result window size
const DEFAULT_RESULT_WIDTH = 500;
const DEFAULT_RESULT_HEIGHT = 600;

// Utility function to get storage API
function getStorage() {
    return typeof browser !== 'undefined' ? browser.storage : chrome.storage;
}

document.addEventListener('DOMContentLoaded', function () {
    const saveButton = document.getElementById('save-settings');
    const getModelsButton = document.getElementById('get-models');
    const settingsStatusMessage = document.getElementById('settings-status-message');
    const promptsStatusMessage = document.getElementById('prompts-status-message');
    const addPromptButton = document.getElementById('add-prompt');
    const cancelEditButton = document.getElementById('cancel-edit');
    const exportButton = document.getElementById('export-settings');
    const importButton = document.getElementById('import-settings');
    const importFileInput = document.getElementById('import-file');

    // Load saved settings when opening the page
    loadSettings();
    loadPrompts();
    loadVersion();

    // Save settings handler
    saveButton.addEventListener('click', saveSettings);

    // Get models handler
    getModelsButton.addEventListener('click', fetchModels);

    // Add/Update prompt handler
    addPromptButton.addEventListener('click', addPrompt);

    // Cancel edit handler
    cancelEditButton.addEventListener('click', cancelEdit);

    // Export settings handler
    exportButton.addEventListener('click', exportSettings);

    // Import settings handler
    importButton.addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', importSettings);
});

// Load settings function
function loadSettings() {
    const storage = getStorage();
    storage.sync.get(['apiUrl', 'apiToken', 'modelName', 'menuPosition', 'openOnHover', 'prefetchTiming', 'resultWidth', 'resultHeight', 'enableMarkdown'], function (result) {
        if (result.apiUrl) {
            document.getElementById('api-url').value = result.apiUrl;
        }
        if (result.apiToken) {
            document.getElementById('api-token').value = result.apiToken;
        }

        const modelSelect = document.getElementById('model-name');
        // Always disable the model select on load
        modelSelect.disabled = true;

        if (result.modelName) {
            // If there's a saved model, show it in the disabled select
            modelSelect.innerHTML = '';
            const option = document.createElement('option');
            option.value = result.modelName;
            option.textContent = result.modelName;
            option.selected = true;
            modelSelect.appendChild(option);
        } else {
            // If no saved model, show placeholder
            modelSelect.innerHTML = '<option value="" disabled selected>Select a model</option>';
        }

        // Load menu position setting (default to middle-center)
        const menuPosition = result.menuPosition || 'middle-center';
        // Safely find radio button by iterating through them
        const radioButtons = document.querySelectorAll('input[name="menu-position"]');
        const radioButton = Array.from(radioButtons).find(rb => rb.value === menuPosition);
        if (radioButton) {
            radioButton.checked = true;
        }

        // Load open on hover setting (default to false)
        const openOnHover = result.openOnHover || false;
        document.getElementById('open-on-hover').checked = openOnHover;

        // Load prefetch timing setting (default to on-button)
        const prefetchTiming = result.prefetchTiming || 'on-button';
        const timingRadioButtons = document.querySelectorAll('input[name="prefetch-timing"]');
        const timingRadioButton = Array.from(timingRadioButtons).find(rb => rb.value === prefetchTiming);
        if (timingRadioButton) {
            timingRadioButton.checked = true;
        }

        // Load result window size settings
        const resultWidth = result.resultWidth || DEFAULT_RESULT_WIDTH;
        const resultHeight = result.resultHeight || DEFAULT_RESULT_HEIGHT;
        document.getElementById('result-width').value = resultWidth;
        document.getElementById('result-height').value = resultHeight;

        // Load markdown parsing setting (default to true)
        const enableMarkdown = result.enableMarkdown !== undefined ? result.enableMarkdown : true;
        document.getElementById('enable-markdown').checked = enableMarkdown;
    });
}

// Save settings function
function saveSettings() {
    const apiUrl = document.getElementById('api-url').value;
    const apiToken = document.getElementById('api-token').value;
    const modelName = document.getElementById('model-name').value;
    const menuPosition = document.querySelector('input[name="menu-position"]:checked')?.value || 'middle-center';
    const openOnHover = document.getElementById('open-on-hover').checked;
    const prefetchTiming = document.querySelector('input[name="prefetch-timing"]:checked')?.value || 'on-button';
    const enableMarkdown = document.getElementById('enable-markdown').checked;

    const resultWidthInput = document.getElementById('result-width');
    const resultHeightInput = document.getElementById('result-height');
    const resultWidthValue = resultWidthInput.value;
    const resultHeightValue = resultHeightInput.value;

    // Validation
    if (!apiUrl || !apiToken || !modelName) {
        showStatus('All fields are required!', 'red', 'settings');
        return;
    }

    // Validate result width
    const resultWidth = parseInt(resultWidthValue);
    const widthMin = parseInt(resultWidthInput.min);
    const widthMax = parseInt(resultWidthInput.max);

    if (isNaN(resultWidth) || resultWidth <= 0) {
        showStatus('Width must be a positive number!', 'red', 'settings');
        return;
    }
    if (resultWidth < widthMin || resultWidth > widthMax) {
        showStatus(`Width must be between ${widthMin} and ${widthMax} pixels!`, 'red', 'settings');
        return;
    }

    // Validate result height
    const resultHeight = parseInt(resultHeightValue);
    const heightMin = parseInt(resultHeightInput.min);
    const heightMax = parseInt(resultHeightInput.max);

    if (isNaN(resultHeight) || resultHeight <= 0) {
        showStatus('Height must be a positive number!', 'red', 'settings');
        return;
    }
    if (resultHeight < heightMin || resultHeight > heightMax) {
        showStatus(`Height must be between ${heightMin} and ${heightMax} pixels!`, 'red', 'settings');
        return;
    }

    // Save to storage
    const storage = getStorage();
    storage.sync.set({
        apiUrl: apiUrl,
        apiToken: apiToken,
        modelName: modelName,
        menuPosition: menuPosition,
        openOnHover: openOnHover,
        prefetchTiming: prefetchTiming,
        resultWidth: resultWidth,
        resultHeight: resultHeight,
        enableMarkdown: enableMarkdown
    }, function () {
        // Check for errors (Chrome)
        const lastError = typeof chrome !== 'undefined' ? chrome.runtime.lastError : null;

        if (lastError) {
            showStatus('Save error: ' + lastError.message, 'red', 'settings');
        } else {
            showStatus('Settings saved successfully!', 'green', 'settings');
        }
    });
}

// Fetch models function
async function fetchModels() {
    const apiUrl = document.getElementById('api-url').value;
    const apiToken = document.getElementById('api-token').value;

    if (!apiUrl || !apiToken) {
        showStatus('Please provide URL and token for testing', 'red', 'settings');
        return;
    }

    // Validate URL format
    try {
        new URL(apiUrl);
    } catch (e) {
        showStatus('Invalid URL format', 'red', 'settings');
        return;
    }

    showStatus('Testing connection...', 'blue', 'settings');

    try {
        // Use OpenRouter-compatible endpoint /models
        const testUrl = apiUrl.endsWith('/')
            ? `${apiUrl}models`
            : `${apiUrl}/models`;

        const response = await fetch(testUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            showStatus(`Error: ${response.status} ${response.statusText}`, 'red', 'settings');
            return;
        }

        // Verify response structure matches OpenRouter API
        const data = await response.json();

        if (!data.data || !Array.isArray(data.data)) {
            showStatus('Response does not match OpenRouter API format', 'red', 'settings');
            return;
        }

        showStatus(`Found ${data.data.length} models`, 'green', 'settings');

        // Get currently saved model name to preserve selection
        const modelSelect = document.getElementById('model-name');
        const currentModelName = modelSelect.value;

        // Populate model dropdown
        modelSelect.innerHTML = '<option value="" disabled>Select a model</option>';

        // Sort models alphabetically by id
        const sortedModels = data.data.sort((a, b) => a.id.localeCompare(b.id));

        sortedModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id;
            modelSelect.appendChild(option);
        });

        // Restore previously selected model if it exists in the new list
        if (currentModelName) {
            modelSelect.value = currentModelName;
        }

        // Enable dropdown after models are loaded
        modelSelect.disabled = false;

    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            showStatus('Network error: check URL and CORS settings', 'red', 'settings');
        } else if (error instanceof SyntaxError) {
            showStatus('Invalid response format from server', 'red', 'settings');
        } else {
            showStatus('Connection error: ' + error.message, 'red', 'settings');
        }
    }
}

// Helper function to show status
function showStatus(message, color, target = 'settings') {
    let statusElementId;
    if (target === 'prompts') {
        statusElementId = 'prompts-status-message';
    } else if (target === 'import-export') {
        statusElementId = 'import-export-status';
    } else {
        statusElementId = 'settings-status-message';
    }

    const statusMessage = document.getElementById(statusElementId);

    if (!statusMessage) return;

    // Map color names to CSS variables
    const colorMap = {
        'red': 'var(--status-error)',
        'green': 'var(--status-success)',
        'blue': 'var(--status-info)'
    };

    statusMessage.textContent = message;
    statusMessage.style.color = colorMap[color] || color;

    // Auto-hide message after 3 seconds for successful operations
    if (color === 'green') {
        setTimeout(() => {
            statusMessage.textContent = '';
        }, 3000);
    }
}

// Load prompts function
function loadPrompts() {
    const storage = getStorage();
    storage.sync.get(['prompts'], function (result) {
        const prompts = result.prompts || [];
        displayPrompts(prompts);
    });
}

// Display prompts function
function displayPrompts(prompts) {
    const promptsList = document.getElementById('prompts-list');
    promptsList.innerHTML = '';

    if (prompts.length === 0) {
        promptsList.innerHTML = '<p>No prompts saved yet.</p>';
        return;
    }

    prompts.forEach((prompt, index) => {
        const promptArticle = document.createElement('article');

        const headerDiv = document.createElement('div');
        headerDiv.className = 'prompt-header';

        const nameLabel = document.createElement('strong');
        nameLabel.textContent = prompt.name;
        headerDiv.appendChild(nameLabel);

        if (prompt.useFullPage) {
            const fullPageBadge = document.createElement('span');
            fullPageBadge.className = 'full-page-badge';
            fullPageBadge.textContent = 'Full Page';
            headerDiv.appendChild(fullPageBadge);
        }

        if (prompt.prefetch) {
            const prefetchBadge = document.createElement('span');
            prefetchBadge.className = 'full-page-badge';
            prefetchBadge.textContent = 'Prefetch';
            headerDiv.appendChild(prefetchBadge);
        }

        promptArticle.appendChild(headerDiv);

        const textPara = document.createElement('p');
        textPara.className = 'prompt-text';
        textPara.textContent = prompt.text;
        promptArticle.appendChild(textPara);

        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', function () {
            editPrompt(index);
        });
        promptArticle.appendChild(editButton);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', function () {
            deletePrompt(index);
        });
        promptArticle.appendChild(deleteButton);

        promptsList.appendChild(promptArticle);
    });
}

// Add or update prompt function
function addPrompt() {
    const promptName = document.getElementById('prompt-name').value.trim();
    const promptText = document.getElementById('prompt-text').value.trim();
    const useFullPage = document.getElementById('use-full-page').checked;
    const prefetch = document.getElementById('prefetch').checked;

    if (!promptName || !promptText) {
        showStatus('Please provide both prompt name and text', 'red', 'prompts');
        return;
    }

    const storage = getStorage();
    storage.sync.get(['prompts'], function (result) {
        const prompts = result.prompts || [];

        if (editingIndex !== null) {
            // Update existing prompt
            prompts[editingIndex] = {
                name: promptName,
                text: promptText,
                useFullPage: useFullPage,
                prefetch: prefetch
            };
        } else {
            // Add new prompt
            prompts.push({
                name: promptName,
                text: promptText,
                useFullPage: useFullPage,
                prefetch: prefetch
            });
        }

        storage.sync.set({ prompts: prompts }, function () {
            const lastError = typeof chrome !== 'undefined' ? chrome.runtime.lastError : null;

            if (lastError) {
                showStatus('Error saving prompt: ' + lastError.message, 'red', 'prompts');
            } else {
                const message = editingIndex !== null ? 'Prompt updated successfully!' : 'Prompt added successfully!';
                showStatus(message, 'green', 'prompts');
                document.getElementById('prompt-name').value = '';
                document.getElementById('prompt-text').value = '';
                document.getElementById('use-full-page').checked = false;
                document.getElementById('prefetch').checked = false;
                editingIndex = null;
                document.getElementById('add-prompt').textContent = 'Add Prompt';
                document.getElementById('cancel-edit').style.display = 'none';
                loadPrompts();
            }
        });
    });
}

// Delete prompt function
function deletePrompt(index) {
    const storage = getStorage();
    storage.sync.get(['prompts'], function (result) {
        const prompts = result.prompts || [];
        prompts.splice(index, 1);

        storage.sync.set({ prompts: prompts }, function () {
            const lastError = typeof chrome !== 'undefined' ? chrome.runtime.lastError : null;

            if (lastError) {
                showStatus('Error deleting prompt: ' + lastError.message, 'red', 'prompts');
            } else {
                showStatus('Prompt deleted successfully!', 'green', 'prompts');
                loadPrompts();
            }
        });
    });
}

// Edit prompt function
function editPrompt(index) {
    const storage = getStorage();
    storage.sync.get(['prompts'], function (result) {
        const prompts = result.prompts || [];
        const prompt = prompts[index];

        if (prompt) {
            document.getElementById('prompt-name').value = prompt.name;
            document.getElementById('prompt-text').value = prompt.text;
            document.getElementById('use-full-page').checked = prompt.useFullPage || false;
            document.getElementById('prefetch').checked = prompt.prefetch || false;
            editingIndex = index;
            document.getElementById('add-prompt').textContent = 'Update Prompt';
            document.getElementById('cancel-edit').style.display = 'inline';
            showStatus('Editing prompt...', 'blue', 'prompts');
        }
    });
}

// Cancel edit function
function cancelEdit() {
    document.getElementById('prompt-name').value = '';
    document.getElementById('prompt-text').value = '';
    document.getElementById('use-full-page').checked = false;
    document.getElementById('prefetch').checked = false;
    editingIndex = null;
    document.getElementById('add-prompt').textContent = 'Add Prompt';
    document.getElementById('cancel-edit').style.display = 'none';
    showStatus('Edit cancelled', 'blue', 'prompts');
}

// Export settings function
function exportSettings() {
    const storage = getStorage();
    // Explicitly request all settings keys to ensure we get everything
    storage.sync.get([
        'apiUrl',
        'apiToken',
        'modelName',
        'menuPosition',
        'openOnHover',
        'prefetchTiming',
        'resultWidth',
        'resultHeight',
        'enableMarkdown',
        'prompts'
    ], function (result) {
        // Create a JSON object with all settings
        const exportData = {
            exportDate: new Date().toISOString(),
            settings: result
        };

        // Convert to JSON string
        const jsonString = JSON.stringify(exportData, null, 2);

        // Create a blob and download link
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `promptbridge-settings-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showStatus('Settings exported successfully!', 'green', 'import-export');
    });
}

// Import settings function
function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const importData = JSON.parse(e.target.result);

            // Validate the imported data
            if (!importData.settings) {
                showStatus('Invalid settings file format', 'red', 'import-export');
                return;
            }

            // Ask for confirmation
            const confirmMessage = `Import settings from ${importData.exportDate ? new Date(importData.exportDate).toLocaleString() : 'unknown date'}?\n\nThis will overwrite your current settings.`;
            if (!confirm(confirmMessage)) {
                showStatus('Import cancelled', 'blue', 'import-export');
                event.target.value = ''; // Reset file input
                return;
            }

            // Import the settings
            const storage = getStorage();
            storage.sync.set(importData.settings, function () {
                const lastError = typeof chrome !== 'undefined' ? chrome.runtime.lastError : null;

                if (lastError) {
                    showStatus('Error importing settings: ' + lastError.message, 'red', 'import-export');
                } else {
                    showStatus('Settings imported successfully!', 'green', 'import-export');
                    // Reload the page to reflect imported settings
                    setTimeout(() => {
                        location.reload();
                    }, 1000);
                }
            });

        } catch (error) {
            showStatus('Error parsing settings file: ' + error.message, 'red', 'import-export');
        }

        // Reset file input
        event.target.value = '';
    };

    reader.onerror = function () {
        showStatus('Error reading file', 'red', 'import-export');
        event.target.value = '';
    };

    reader.readAsText(file);
}

// Load and display version from manifest
function loadVersion() {
    // Fetch manifest.json to get version
    fetch(chrome.runtime.getURL('manifest.json'))
        .then(response => response.json())
        .then(manifest => {
            const versionElement = document.getElementById('version-info');
            if (versionElement) {
                versionElement.textContent = `Version ${manifest.version}`;
            }
        })
        .catch(error => {
            console.error('Error loading version:', error);
            const versionElement = document.getElementById('version-info');
            if (versionElement) {
                versionElement.textContent = 'Version: N/A';
            }
        });
}