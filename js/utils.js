// Shared utility functions

/**
 * Gets the appropriate storage API (browser or chrome).
 * This function is shared across different scripts to avoid code duplication.
 * @returns {object} The storage API object.
 */
function getStorage() {
    return typeof browser !== 'undefined' ? browser.storage : chrome.storage;
}