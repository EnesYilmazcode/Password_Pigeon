// Get references to HTML elements
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const authStatus = document.getElementById('auth-status');
const codeSection = document.getElementById('code-section');
const codeText = document.getElementById('code-text');
const codeTimestamp = document.getElementById('code-timestamp');
const copyableCodeContainer = document.getElementById('copyable-code-container');
const errorMessage = document.getElementById('error-message');
const infoMessage = document.getElementById('info-message');
const logo = document.getElementById('logo');
const copyIndicator = document.querySelector('.copy-indicator');

let currentCode = null;

/**
 * Updates the UI to show the logged-out state.
 * @param {string} [message='Please sign in to fetch codes.'] - The message to display when logged out.
 */
function showLoggedOutState(message = 'Please sign in to fetch codes.') {
  authStatus.textContent = message;
  loginButton.style.display = 'block';
  logoutButton.style.display = 'none';
  codeSection.style.display = 'none';
  errorMessage.textContent = '';
  infoMessage.textContent = '';
  logo.src = "images/logo48.png"; // Set the logo to the default image
  document.body.classList.remove('logged-in');
}

/**
 * Updates the UI to show the logged-in state and displays the latest code if available.
 * @param {Object} codeData - The data containing the latest code and its timestamp.
 * @param {string} codeData.code - The latest security code.
 * @param {number} codeData.timestamp - The timestamp when the code was found.
 */
function showLoggedInState(codeData) {
  authStatus.textContent = 'Monitoring Gmail for codes...';
  loginButton.style.display = 'none';
  logoutButton.style.display = 'block';
  codeSection.style.display = 'block';
  errorMessage.textContent = '';
  infoMessage.textContent = '';
  logo.src = "images/logo48_active.png"; // Set the logo to the active image
  document.body.classList.add('logged-in');

  if (codeData && codeData.code) {
    currentCode = codeData.code;
    codeText.textContent = currentCode;
    copyableCodeContainer.classList.add('has-code');
    
    const date = new Date(codeData.timestamp);
    codeTimestamp.textContent = `Found: ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    codeTimestamp.title = `Found: ${date.toLocaleString()}`;
  } else {
    currentCode = null;
    codeText.textContent = 'No code found recently.';
    copyableCodeContainer.classList.remove('has-code');
    codeTimestamp.textContent = '';
    codeTimestamp.title = '';
  }
}

/**
 * Displays an error message in the UI.
 * @param {string} message - The error message to display.
 */
function showError(message) {
  errorMessage.textContent = `Error: ${message}`;
  infoMessage.textContent = '';
}

/**
 * Displays an informational message in the UI.
 * @param {string} message - The informational message to display.
 */
function showInfo(message) {
  infoMessage.textContent = message;
  errorMessage.textContent = '';
}

/**
 * Copies the current code to the clipboard and shows a visual indicator.
 */
function copyCodeToClipboard() {
  if (currentCode) {
    navigator.clipboard.writeText(currentCode)
      .then(() => {
        // Show the copy indicator
        copyIndicator.classList.add('show-copy-indicator');
        
        // Hide it after 2 seconds
        setTimeout(function() {
          copyIndicator.classList.remove('show-copy-indicator');
        }, 2000);
      })
      .catch(err => showError("Clipboard access failed."));
  }
}

// Event listener for the login button
loginButton.addEventListener('click', () => {
  showInfo("Attempting sign in...");
  loginButton.disabled = true;
  loginButton.textContent = 'Signing In...';

  chrome.runtime.sendMessage({ action: 'login' }, (response) => {
    loginButton.disabled = false;
    loginButton.textContent = 'Sign In with Google';
    if (response?.success) {
      showInfo("Sign in successful! Checking status...");
      setTimeout(checkStatus, 500);
    } else {
      showLoggedOutState();
      showError(response?.error || 'Login failed.');
    }
  });
});

// Event listener for the logout button
logoutButton.addEventListener('click', () => {
  showInfo("Signing out...");
  logoutButton.disabled = true;

  chrome.runtime.sendMessage({ action: 'logout' }, () => {
    logoutButton.disabled = false;
    currentCode = null;
    showLoggedOutState("Signed out.");
  });
});

// Event listener for the code container to copy the code
copyableCodeContainer.addEventListener('click', () => {
  if (currentCode) {
    copyCodeToClipboard();
  }
});

/**
 * Checks the current authentication status and updates the UI accordingly.
 */
function checkStatus() {
  errorMessage.textContent = '';
  infoMessage.textContent = '';
  chrome.runtime.sendMessage({ action: "clearBadge" });

  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (chrome.runtime.lastError) {
      showLoggedOutState("Error connecting.");
      showError("Try reloading the extension.");
      return;
    }

    if (response?.loggedIn) {
      showLoggedInState(response.latestCodeData);
    } else {
      showLoggedOutState();
    }
  });
}

// Check the status when the popup is opened
document.addEventListener('DOMContentLoaded', checkStatus);