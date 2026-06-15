document.addEventListener('DOMContentLoaded', function () {
    const openSettingsButton = document.getElementById('openSettings');

    if (openSettingsButton) {
        openSettingsButton.addEventListener('click', function () {
            chrome.runtime.openOptionsPage();
        });
    } else {
        console.error("Element with id 'openSettings' not found in popup.html");
    }
});
