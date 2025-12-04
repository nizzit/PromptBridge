// Editing state
let editingIndex = null;
let addingNewPrompt = false;

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
    const exportButton = document.getElementById('export-settings');
    const importButton = document.getElementById('import-settings');
    const importFileInput = document.getElementById('import-file');

    // Load saved settings when opening the page
    loadSettings();
    loadPrompts();
    loadVersion();

    // Add event listeners for auto-fetching models when URL or token changes
    const apiUrlInput = document.getElementById('api-url');
    const apiTokenInput = document.getElementById('api-token');

    apiUrlInput.addEventListener('input', handleApiCredentialsChange);
    apiTokenInput.addEventListener('input', handleApiCredentialsChange);

    // Save settings handler
    saveButton.addEventListener('click', saveSettings);

    // Get models handler
    getModelsButton.addEventListener('click', fetchModels);

    // Add prompt handler
    addPromptButton.addEventListener('click', addPrompt);

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

        // Auto-fetch models if URL and token are available
        if (result.apiUrl && result.apiToken) {
            // Small delay to ensure UI is ready
            setTimeout(() => {
                fetchModels();
            }, 100);
        }
    });
}

// Handle API credentials change
function handleApiCredentialsChange() {
    const apiUrl = document.getElementById('api-url').value;
    const apiToken = document.getElementById('api-token').value;

    // Clear any previous error highlights
    clearApiFieldErrors();

    // Auto-fetch models if both URL and token are provided
    if (apiUrl && apiToken) {
        // Validate URL format before fetching
        try {
            new URL(apiUrl);
            fetchModels();
        } catch (e) {
            // Invalid URL format, don't fetch
            return;
        }
    }
}

// Clear API field error highlights
function clearApiFieldErrors() {
    document.getElementById('api-url').classList.remove('border-error');
    document.getElementById('api-token').classList.remove('border-error');
}

// Highlight API field with error
function highlightApiFieldError(fieldType, message) {
    clearApiFieldErrors();

    const fieldMap = {
        'url': 'api-url',
        'token': 'api-token',
        'both': ['api-url', 'api-token']
    };

    const fieldsToHighlight = fieldMap[fieldType] || fieldMap['both'];

    if (Array.isArray(fieldsToHighlight)) {
        fieldsToHighlight.forEach(fieldId => {
            document.getElementById(fieldId).classList.add('border-error');
        });
    } else {
        document.getElementById(fieldsToHighlight).classList.add('border-error');
    }

    // Show error message
    showStatus(message, 'red', 'settings');
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
            // Clear any field errors on successful save
            clearApiFieldErrors();
            showStatus('Settings saved successfully!', 'green', 'settings');
        }
    });
}

// Fetch models function
async function fetchModels() {
    const apiUrl = document.getElementById('api-url').value;
    const apiToken = document.getElementById('api-token').value;

    if (!apiUrl || !apiToken) {
        highlightApiFieldError('both', 'Please provide URL and token for testing');
        return;
    }

    // Validate URL format
    try {
        new URL(apiUrl);
    } catch (e) {
        highlightApiFieldError('url', 'Invalid URL format');
        return;
    }

    showStatus('Testing connection...', 'blue', 'settings');

    try {
        // Use OpenRouter-compatible endpoint /models
        const testUrl = apiUrl.endsWith('/')
            ? `${apiUrl}models/user`
            : `${apiUrl}/models/user`;

        const response = await fetch(testUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            // If 401, highlight token field (authentication error)
            // Otherwise, highlight URL field (connection/server error)
            const fieldToHighlight = response.status === 401 ? 'token' : 'url';
            highlightApiFieldError(fieldToHighlight, `Error: ${response.status} ${response.statusText}`);
            return;
        }

        // Verify response structure matches OpenRouter API
        const data = await response.json();

        if (!data.data || !Array.isArray(data.data)) {
            highlightApiFieldError('both', 'Response does not match OpenRouter API format');
            return;
        }

        showStatus(`Found ${data.data.length} models`, 'green', 'settings');

        // Clear any previous field errors on success
        clearApiFieldErrors();

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
            highlightApiFieldError('both', 'Network error: check URL and CORS settings');
        } else if (error instanceof SyntaxError) {
            highlightApiFieldError('both', 'Invalid response format from server');
        } else {
            highlightApiFieldError('both', 'Connection error: ' + error.message);
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

    // Map color names to CSS classes
    const colorClassMap = {
        'red': 'status-error',
        'green': 'status-success',
        'blue': 'status-info'
    };

    statusMessage.textContent = message;

    // Remove existing status classes
    statusMessage.classList.remove('status-error', 'status-success', 'status-info');

    // Add the appropriate class if it exists in the map
    if (colorClassMap[color]) {
        statusMessage.classList.add(colorClassMap[color]);
    } else {
        // If no class mapping exists, set the color directly
        statusMessage.style.color = color;
    }

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

    // If we're adding a new prompt, show the add form
    if (addingNewPrompt) {
        displayAddForm(promptsList);
        return;
    }

    if (prompts.length === 0) {
        promptsList.innerHTML = '<p>No prompts saved yet.</p>';
        return;
    }

    prompts.forEach((prompt, index) => {
        // Check if this prompt is currently being edited
        if (editingIndex === index) {
            displayEditForm(promptsList, prompt, index);
        } else {
            displayPromptCard(promptsList, prompt, index);
        }
    });
}

// Display a single prompt card
function displayPromptCard(container, prompt, index) {
    const promptArticle = document.createElement('article');
    promptArticle.id = `prompt-${index}`;

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
    deleteButton.className = 'delete-button';
    deleteButton.addEventListener('click', function () {
        handleDeleteClick(this, index);
    });
    deleteButton.addEventListener('mouseleave', function () {
        resetDeleteButton(this);
    });
    promptArticle.appendChild(deleteButton);

    container.appendChild(promptArticle);
}

// Display edit form for a prompt
function displayEditForm(container, prompt, index) {
    const editArticle = document.createElement('article');
    editArticle.id = `prompt-edit-${index}`;
    editArticle.className = 'edit-form';

    // Form title
    const titleHeader = document.createElement('h3');
    titleHeader.textContent = 'Edit Prompt';
    editArticle.appendChild(titleHeader);

    // Name field
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Prompt Name:';
    nameLabel.htmlFor = `edit-name-${index}`;
    editArticle.appendChild(nameLabel);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = `edit-name-${index}`;
    nameInput.value = prompt.name;
    nameInput.addEventListener('focus', function () {
        this.classList.remove('border-error');
    });
    editArticle.appendChild(nameInput);

    // Text field
    const textLabel = document.createElement('label');
    textLabel.textContent = 'Prompt Text:';
    textLabel.htmlFor = `edit-text-${index}`;
    editArticle.appendChild(textLabel);

    const textInput = document.createElement('textarea');
    textInput.id = `edit-text-${index}`;
    textInput.rows = 5;
    textInput.value = prompt.text;
    textInput.addEventListener('focus', function () {
        this.classList.remove('border-error');
    });
    editArticle.appendChild(textInput);

    // Full page option with tooltip on separate row
    const fullPageRow = document.createElement('div');
    fullPageRow.className = 'form-row';

    const fullPageContainer = document.createElement('div');
    fullPageContainer.className = 'tooltip-container';

    const fullPageLabel = document.createElement('label');
    fullPageLabel.textContent = 'Use Full Page';
    fullPageLabel.htmlFor = `edit-fullpage-${index}`;

    const fullPageTooltipIcon = document.createElement('span');
    fullPageTooltipIcon.className = 'tooltip-icon';
    fullPageTooltipIcon.textContent = '?';

    const fullPageTooltipText = document.createElement('span');
    fullPageTooltipText.className = 'tooltip-text';
    fullPageTooltipText.textContent = 'Use entire page text when nothing is selected';

    fullPageTooltipIcon.appendChild(fullPageTooltipText);
    fullPageContainer.appendChild(fullPageLabel);
    fullPageContainer.appendChild(fullPageTooltipIcon);

    const fullPageInput = document.createElement('input');
    fullPageInput.type = 'checkbox';
    fullPageInput.id = `edit-fullpage-${index}`;
    fullPageInput.checked = prompt.useFullPage || false;
    fullPageInput.className = 'align-right';

    fullPageRow.appendChild(fullPageContainer);
    fullPageRow.appendChild(fullPageInput);
    editArticle.appendChild(fullPageRow);

    // Prefetch option with tooltip on separate row
    const prefetchRow = document.createElement('div');
    prefetchRow.className = 'form-row';

    const prefetchContainer = document.createElement('div');
    prefetchContainer.className = 'tooltip-container';

    const prefetchLabel = document.createElement('label');
    prefetchLabel.textContent = 'Prefetch Result';
    prefetchLabel.htmlFor = `edit-prefetch-${index}`;

    const prefetchTooltipIcon = document.createElement('span');
    prefetchTooltipIcon.className = 'tooltip-icon';
    prefetchTooltipIcon.textContent = '?';

    const prefetchTooltipText = document.createElement('span');
    prefetchTooltipText.className = 'tooltip-text';
    prefetchTooltipText.textContent = 'Send request immediately when menu appears (result loads faster)';

    prefetchTooltipIcon.appendChild(prefetchTooltipText);
    prefetchContainer.appendChild(prefetchLabel);
    prefetchContainer.appendChild(prefetchTooltipIcon);

    const prefetchInput = document.createElement('input');
    prefetchInput.type = 'checkbox';
    prefetchInput.id = `edit-prefetch-${index}`;
    prefetchInput.checked = prompt.prefetch || false;
    prefetchInput.className = 'align-right';

    prefetchRow.appendChild(prefetchContainer);
    prefetchRow.appendChild(prefetchInput);
    editArticle.appendChild(prefetchRow);

    // Buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'button-with-status';

    // Save button
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', function () {
        saveEditedPrompt(index);
    });
    buttonsContainer.appendChild(saveButton);

    // Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'secondary';
    cancelButton.addEventListener('click', function () {
        cancelInlineEdit();
    });
    buttonsContainer.appendChild(cancelButton);


    editArticle.appendChild(buttonsContainer);
    container.appendChild(editArticle);
}

// Display add form for a new prompt
function displayAddForm(container) {
    const addArticle = document.createElement('article');
    addArticle.id = 'prompt-add-form';
    addArticle.className = 'edit-form';

    // Form title
    const titleHeader = document.createElement('h3');
    titleHeader.textContent = 'Add New Prompt';
    addArticle.appendChild(titleHeader);

    // Name field
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Prompt Name:';
    nameLabel.htmlFor = 'add-name';
    addArticle.appendChild(nameLabel);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'add-name';
    nameInput.placeholder = 'Enter prompt name';
    nameInput.addEventListener('focus', function () {
        this.classList.remove('border-error');
    });
    addArticle.appendChild(nameInput);

    // Text field
    const textLabel = document.createElement('label');
    textLabel.textContent = 'Prompt Text:';
    textLabel.htmlFor = 'add-text';
    addArticle.appendChild(textLabel);

    const textInput = document.createElement('textarea');
    textInput.id = 'add-text';
    textInput.rows = 5;
    textInput.placeholder = 'Enter prompt text';
    textInput.addEventListener('focus', function () {
        this.classList.remove('border-error');
    });
    addArticle.appendChild(textInput);

    // Full page option with tooltip on separate row
    const fullPageRow = document.createElement('div');
    fullPageRow.className = 'form-row';

    const fullPageContainer = document.createElement('div');
    fullPageContainer.className = 'tooltip-container';

    const fullPageLabel = document.createElement('label');
    fullPageLabel.textContent = 'Use Full Page';
    fullPageLabel.htmlFor = 'add-fullpage';

    const fullPageTooltipIcon = document.createElement('span');
    fullPageTooltipIcon.className = 'tooltip-icon';
    fullPageTooltipIcon.textContent = '?';

    const fullPageTooltipText = document.createElement('span');
    fullPageTooltipText.className = 'tooltip-text';
    fullPageTooltipText.textContent = 'Use entire page text when nothing is selected';

    fullPageTooltipIcon.appendChild(fullPageTooltipText);
    fullPageContainer.appendChild(fullPageLabel);
    fullPageContainer.appendChild(fullPageTooltipIcon);

    const fullPageInput = document.createElement('input');
    fullPageInput.type = 'checkbox';
    fullPageInput.id = 'add-fullpage';
    fullPageInput.checked = false;
    fullPageInput.className = 'align-right';

    fullPageRow.appendChild(fullPageContainer);
    fullPageRow.appendChild(fullPageInput);
    addArticle.appendChild(fullPageRow);

    // Prefetch option with tooltip on separate row
    const prefetchRow = document.createElement('div');
    prefetchRow.className = 'form-row';

    const prefetchContainer = document.createElement('div');
    prefetchContainer.className = 'tooltip-container';

    const prefetchLabel = document.createElement('label');
    prefetchLabel.textContent = 'Prefetch Result';
    prefetchLabel.htmlFor = 'add-prefetch';

    const prefetchTooltipIcon = document.createElement('span');
    prefetchTooltipIcon.className = 'tooltip-icon';
    prefetchTooltipIcon.textContent = '?';

    const prefetchTooltipText = document.createElement('span');
    prefetchTooltipText.className = 'tooltip-text';
    prefetchTooltipText.textContent = 'Send request immediately when menu appears (result loads faster)';

    prefetchTooltipIcon.appendChild(prefetchTooltipText);
    prefetchContainer.appendChild(prefetchLabel);
    prefetchContainer.appendChild(prefetchTooltipIcon);

    const prefetchInput = document.createElement('input');
    prefetchInput.type = 'checkbox';
    prefetchInput.id = 'add-prefetch';
    prefetchInput.checked = false;
    prefetchInput.className = 'align-right';

    prefetchRow.appendChild(prefetchContainer);
    prefetchRow.appendChild(prefetchInput);
    addArticle.appendChild(prefetchRow);

    // Buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'button-with-status';

    // Save button
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', function () {
        saveNewPrompt();
    });
    buttonsContainer.appendChild(saveButton);

    // Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'secondary';
    cancelButton.addEventListener('click', function () {
        cancelAddForm();
    });
    buttonsContainer.appendChild(cancelButton);

    addArticle.appendChild(buttonsContainer);
    container.appendChild(addArticle);
}

// Add or update prompt function
function addPrompt() {
    if (addingNewPrompt) {
        // If we're already adding a new prompt, do nothing
        return;
    }

    // Set flag to indicate we're adding a new prompt
    addingNewPrompt = true;
    editingIndex = null; // Reset editing index

    // Reload prompts to show the add form
    loadPrompts();
}

// Handle delete button click with confirmation
function handleDeleteClick(button, index) {
    if (button.dataset.confirmState === 'true') {
        // Second click - actually delete
        deletePrompt(index);
    } else {
        // First click - show confirmation
        button.dataset.confirmState = 'true';
        // Styles are now handled by CSS class in global.css
    }
}

// Reset delete button to original state
function resetDeleteButton(button) {
    if (button.dataset.confirmState === 'true') {
        button.dataset.confirmState = 'false';
        // Styles are now handled by CSS class in global.css
    }
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
                console.error('Error deleting prompt:', lastError.message);
            } else {
                loadPrompts();
            }
        });
    });
}

// Edit prompt function
function editPrompt(index) {
    editingIndex = index;
    loadPrompts(); // Reload prompts to show the edit form
}

// Cancel edit function
function cancelEdit() {
    editingIndex = null;
    loadPrompts();
}

// Cancel add form function
function cancelAddForm() {
    addingNewPrompt = false;
    loadPrompts();
}

// Helper function to clear and show field errors
function showFieldErrors(nameInput, textInput) {
    // Clear previous error classes
    nameInput.classList.remove('border-error');
    textInput.classList.remove('border-error');

    // Add error classes to empty fields
    if (!nameInput.value.trim()) {
        nameInput.classList.add('border-error');
    }
    if (!textInput.value.trim()) {
        textInput.classList.add('border-error');
    }
}

// Save new prompt function
function saveNewPrompt() {
    const nameInput = document.getElementById('add-name');
    const textInput = document.getElementById('add-text');
    const fullPageInput = document.getElementById('add-fullpage');
    const prefetchInput = document.getElementById('add-prefetch');

    const promptName = nameInput.value.trim();
    const promptText = textInput.value.trim();
    const useFullPage = fullPageInput.checked;
    const prefetch = prefetchInput.checked;

    if (!promptName || !promptText) {
        showFieldErrors(nameInput, textInput);
        console.error('Please provide both prompt name and text');
        return;
    }

    const storage = getStorage();
    storage.sync.get(['prompts'], function (result) {
        const prompts = result.prompts || [];

        // Add new prompt
        prompts.push({
            name: promptName,
            text: promptText,
            useFullPage: useFullPage,
            prefetch: prefetch
        });

        storage.sync.set({ prompts: prompts }, function () {
            const lastError = typeof chrome !== 'undefined' ? chrome.runtime.lastError : null;

            if (lastError) {
                console.error('Error saving prompt:', lastError.message);
            } else {
                addingNewPrompt = false;
                loadPrompts();
            }
        });
    });
}

// Cancel inline edit function
function cancelInlineEdit() {
    editingIndex = null;
    loadPrompts();
}

// Save edited prompt function
function saveEditedPrompt(index) {
    const nameInput = document.getElementById(`edit-name-${index}`);
    const textInput = document.getElementById(`edit-text-${index}`);
    const fullPageInput = document.getElementById(`edit-fullpage-${index}`);
    const prefetchInput = document.getElementById(`edit-prefetch-${index}`);

    const promptName = nameInput.value.trim();
    const promptText = textInput.value.trim();
    const useFullPage = fullPageInput.checked;
    const prefetch = prefetchInput.checked;

    if (!promptName || !promptText) {
        showFieldErrors(nameInput, textInput);
        console.error('Please provide both prompt name and text');
        return;
    }

    const storage = getStorage();
    storage.sync.get(['prompts'], function (result) {
        const prompts = result.prompts || [];

        // Update the prompt at the specified index
        prompts[index] = {
            name: promptName,
            text: promptText,
            useFullPage: useFullPage,
            prefetch: prefetch
        };

        storage.sync.set({ prompts: prompts }, function () {
            const lastError = typeof chrome !== 'undefined' ? chrome.runtime.lastError : null;

            if (lastError) {
                console.error('Error saving prompt:', lastError.message);
            } else {
                editingIndex = null;
                loadPrompts();
            }
        });
    });
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