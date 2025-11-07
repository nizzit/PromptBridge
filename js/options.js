// State variable to track the index of the prompt being edited.
let editingIndex = null;


// Sets up event listeners once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', function () {
    const saveButton = document.getElementById('save-settings');
    const getModelsButton = document.getElementById('get-models');
    const settingsStatusMessage = document.getElementById('settings-status-message');
    const promptsStatusMessage = document.getElementById('prompts-status-message');
    const addPromptButton = document.getElementById('add-prompt');
    const cancelEditButton = document.getElementById('cancel-edit');

    // Load saved settings and prompts when the options page is opened.
    loadSettings();
    loadPrompts();

    // Event handler for saving the main settings.
    saveButton.addEventListener('click', saveSettings);

    // Event handler for fetching available models from the API.
    getModelsButton.addEventListener('click', fetchModels);

    // Event handler for adding or updating a prompt.
    addPromptButton.addEventListener('click', addPrompt);

    // Event handler for canceling the edit of a prompt.
    cancelEditButton.addEventListener('click', cancelEdit);
});

// Loads API and UI settings from storage and populates the form fields.
function loadSettings() {
    const storage = getStorage();
    storage.sync.get(['apiUrl', 'apiToken', 'modelName', 'menuPosition', 'openOnHover'], function (result) {
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
            modelSelect.innerHTML = `<option value="${result.modelName}" selected>${result.modelName}</option>`;
        } else {
            // If no saved model, show placeholder
            modelSelect.innerHTML = '<option value="" disabled selected>Select a model</option>';
        }

        // Load menu position setting (default to middle-center)
        const menuPosition = result.menuPosition || 'middle-center';
        const radioButton = document.querySelector(`input[name="menu-position"][value="${menuPosition}"]`);
        if (radioButton) {
            radioButton.checked = true;
        }

        // Load open on hover setting (default to false)
        const openOnHover = result.openOnHover || false;
        document.getElementById('open-on-hover').checked = openOnHover;
    });
}

// Saves the main settings to storage.
function saveSettings() {
    const apiUrl = document.getElementById('api-url').value;
    const apiToken = document.getElementById('api-token').value;
    const modelName = document.getElementById('model-name').value;
    const menuPosition = document.querySelector('input[name="menu-position"]:checked')?.value || 'middle-center';
    const openOnHover = document.getElementById('open-on-hover').checked;

    // Validation
    if (!apiUrl || !apiToken || !modelName) {
        showStatus('All fields are required!', 'red', 'settings');
        return;
    }

    // Save to storage
    const storage = getStorage();
    storage.sync.set({
        apiUrl: apiUrl,
        apiToken: apiToken,
        modelName: modelName,
        menuPosition: menuPosition,
        openOnHover: openOnHover
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

// Fetches available models from the specified API endpoint.
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

// Helper function to display status messages to the user.
function showStatus(message, color, target = 'settings') {
    const statusElementId = target === 'prompts' ? 'prompts-status-message' : 'settings-status-message';
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

// Loads prompts from storage and displays them.
function loadPrompts() {
    const storage = getStorage();
    storage.sync.get(['prompts'], function (result) {
        const prompts = result.prompts || [];
        displayPrompts(prompts);
    });
}

// Renders the list of prompts on the page.
function displayPrompts(prompts) {
    const promptsList = document.getElementById('prompts-list');
    promptsList.innerHTML = '';

    if (prompts.length === 0) {
        promptsList.innerHTML = '<p>No prompts saved yet.</p>';
        return;
    }

    prompts.forEach((prompt, index) => {
        const promptArticle = document.createElement('article');
        const nameLabel = document.createElement('strong');
        nameLabel.textContent = prompt.name;
        promptArticle.appendChild(nameLabel);

        const textPara = document.createElement('p');
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

// Adds a new prompt or updates an existing one.
function addPrompt() {
    const promptName = document.getElementById('prompt-name').value.trim();
    const promptText = document.getElementById('prompt-text').value.trim();

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
                text: promptText
            };
        } else {
            // Add new prompt
            prompts.push({
                name: promptName,
                text: promptText
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
                editingIndex = null;
                document.getElementById('add-prompt').textContent = 'Add Prompt';
                document.getElementById('cancel-edit').style.display = 'none';
                loadPrompts();
            }
        });
    });
}

// Deletes a prompt at a specific index.
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

// Populates the form with the data of the prompt to be edited.
function editPrompt(index) {
    const storage = getStorage();
    storage.sync.get(['prompts'], function (result) {
        const prompts = result.prompts || [];
        const prompt = prompts[index];

        if (prompt) {
            document.getElementById('prompt-name').value = prompt.name;
            document.getElementById('prompt-text').value = prompt.text;
            editingIndex = index;
            document.getElementById('add-prompt').textContent = 'Update Prompt';
            document.getElementById('cancel-edit').style.display = 'inline';
            showStatus('Editing prompt...', 'blue', 'prompts');
        }
    });
}

// Cancels the prompt editing process and clears the form.
function cancelEdit() {
    document.getElementById('prompt-name').value = '';
    document.getElementById('prompt-text').value = '';
    editingIndex = null;
    document.getElementById('add-prompt').textContent = 'Add Prompt';
    document.getElementById('cancel-edit').style.display = 'none';
    showStatus('Edit cancelled', 'blue', 'prompts');
}