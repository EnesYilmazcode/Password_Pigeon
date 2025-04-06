const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const authStatus = document.getElementById('auth-status');
const codeSection = document.getElementById('code-section');
const codeText = document.getElementById('code-text');
const codeTimestamp = document.getElementById('code-timestamp');
const copyButton = document.getElementById('copy-button');
const errorMessage = document.getElementById('error-message');
const infoMessage = document.getElementById('info-message'); // Added for non-error messages
const logo = document.getElementById('logo');

let currentCode = null;
let copyTimeout = null;

// --- UI Update Functions ---

function showLoggedOutState(message = 'Please sign in to fetch codes.') {
    authStatus.textContent = message;
    loginButton.style.display = 'block';
    logoutButton.style.display = 'none';
    codeSection.style.display = 'none';
    errorMessage.textContent = ''; // Clear error on state change
    infoMessage.textContent = '';
    loginButton.disabled = false; // Ensure login button is enabled
    logoutButton.disabled = false; // Ensure logout button is enabled
    logo.src = "images/logo48.png"; // Use inactive logo
    document.body.classList.remove('logged-in');
}

function showLoggedInState(codeData) {
    authStatus.textContent = 'Monitoring Gmail for codes...';
    loginButton.style.display = 'none';
    logoutButton.style.display = 'block';
    codeSection.style.display = 'block';
    errorMessage.textContent = ''; // Clear error on state change
    infoMessage.textContent = ''; // Clear info message too
    loginButton.disabled = false; // Ensure login button is enabled
    logoutButton.disabled = false; // Ensure logout button is enabled
    logo.src = "images/logo48_active.png"; // Use active logo
    document.body.classList.add('logged-in');


    if (codeData && codeData.code) {
        currentCode = codeData.code;
        codeText.textContent = currentCode;
        copyButton.disabled = false;
        copyButton.title = "Copy Code";
        // Format timestamp
        try {
            const date = new Date(codeData.timestamp);
            const timeString = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const dateString = date.toLocaleDateString([], { month: 'short', day: 'numeric'});
            codeTimestamp.textContent = `Found: ${timeString}`;
            codeTimestamp.title = `Found: ${date.toLocaleString()}`; // Full date/time on hover
        } catch (e) {
             console.error("Error formatting date:", e);
             codeTimestamp.textContent = 'Timestamp unavailable';
             codeTimestamp.title = '';
        }

    } else {
        currentCode = null;
        codeText.textContent = 'No code found recently.';
        copyButton.disabled = true;
         copyButton.title = "No code to copy";
        codeTimestamp.textContent = '';
        codeTimestamp.title = '';
    }
}

function showError(message) {
    errorMessage.textContent = `Error: ${message}`;
    infoMessage.textContent = ''; // Clear info when error occurs
}

function showInfo(message) {
    infoMessage.textContent = message;
     errorMessage.textContent = ''; // Clear error when info is shown
}

// --- Event Listeners ---

loginButton.addEventListener('click', () => {
    errorMessage.textContent = '';
    infoMessage.textContent = 'Attempting sign in...'; // Use info message
    loginButton.disabled = true;
    loginButton.textContent = 'Signing In...';

    chrome.runtime.sendMessage({ action: 'login' }, (response) => {
        loginButton.disabled = false; // Re-enable regardless of outcome
        loginButton.textContent = 'Sign In with Google'; // Restore text
        if (response && response.success) {
            console.log("Popup: Login successful message received.");
            showInfo("Sign in successful! Checking status...");
            // Re-check status to update UI correctly
             setTimeout(checkStatus, 500); // Small delay to allow background state update
        } else {
            // Keep logged out state
            showLoggedOutState(); // Reset to logged out UI
            showError(response?.error || 'Login failed. Check background logs or try again.');
            console.error("Popup: Login failed.", response?.error);
        }
    });
});

logoutButton.addEventListener('click', () => {
     errorMessage.textContent = '';
     infoMessage.textContent = 'Signing out...';
     logoutButton.disabled = true;
     logoutButton.textContent = 'Signing Out...';

     chrome.runtime.sendMessage({ action: 'logout' }, (response) => {
        logoutButton.disabled = false; // Re-enable regardless of outcome
        logoutButton.textContent = 'Sign Out'; // Restore text
        // We expect logout to succeed locally even if revoke fails. Update UI immediately.
        console.log("Popup: Logout message sent.");
        currentCode = null; // Clear code on logout attempt
        showLoggedOutState("Signed out."); // Assume success for UI

        // Optional: Check response for errors, though UI is already logged out
        if (!(response && response.success)) {
            console.warn("Popup: Logout message response indicated failure or no response.", response?.error);
            // You could show a non-blocking warning here if needed
            // showError(response?.error || 'Logout confirmation failed. Already signed out locally.');
        }
     });
});

copyButton.addEventListener('click', () => {
    if (currentCode && !copyButton.disabled) {
         console.log("Popup: Copy button clicked. Code:", currentCode); // SHOULD log in popup console
         // Ask background script to copy
        chrome.runtime.sendMessage({ action: 'copyCode', code: currentCode }, (response) => {
            console.log("Popup: Received response from background for copyCode:", response); // SHOULD log in popup console after background replies
            if (response && response.success) {
                console.log("Popup: Code copy request successful (according to background). Updating UI."); // SHOULD log if background says success
                 // Visual feedback logic...
            } else {
                 console.error('Popup: Failed to copy code via background script. Response:', response); // SHOULD log if background says failure or no response
                 showError('Failed to copy code.');
            }
        });
        // ... commented out direct copy code ...
    }
});

// --- Initial Status Check ---
function checkStatus() {
     console.log("Popup: Checking status...");
     errorMessage.textContent = ''; // Clear messages on refresh
     infoMessage.textContent = '';

     // Tell background script the popup was opened to potentially clear the badge
     chrome.runtime.sendMessage({ action: "clearBadge" });

     // Get login status and latest code
     chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        if (chrome.runtime.lastError) {
             console.error("Popup Error: Cannot communicate with background script:", chrome.runtime.lastError.message);
             showLoggedOutState("Error connecting to background service."); // Assume logged out
             showError("Cannot connect. Try reloading the extension.");
             return;
        }

        if (response) {
             if (response.loggedIn) {
                 console.log("Popup: User is logged in.");
                 showLoggedInState(response.latestCodeData);
             } else {
                 console.log("Popup: User is logged out.");
                 showLoggedOutState(); // Show default logged out message
             }
              if (response.error) {
                  console.warn("Popup: Status response contained an error:", response.error);
                  // Show a non-critical error if needed, but UI state should be set correctly
                  // showError(`Status check issue: ${response.error}`);
              }
        } else {
             console.error("Popup: No response received from getStatus message.");
             showLoggedOutState("Failed to get status from background."); // Assume logged out
             showError("No response from background. Try reloading.");
        }
    });
}

// Check status when the popup is opened
document.addEventListener('DOMContentLoaded', checkStatus);