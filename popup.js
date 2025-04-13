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

function showLoggedOutState(message = 'Please sign in to fetch codes.') {
  authStatus.textContent = message;
  loginButton.style.display = 'block';
  logoutButton.style.display = 'none';
  codeSection.style.display = 'none';
  errorMessage.textContent = '';
  infoMessage.textContent = '';
  logo.src = "images/logo48.png";
  document.body.classList.remove('logged-in');
}

function showLoggedInState(codeData) {
  authStatus.textContent = 'Monitoring Gmail for codes...';
  loginButton.style.display = 'none';
  logoutButton.style.display = 'block';
  codeSection.style.display = 'block';
  errorMessage.textContent = '';
  infoMessage.textContent = '';
  logo.src = "images/logo48_active.png";
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

function showError(message) {
  errorMessage.textContent = `Error: ${message}`;
  infoMessage.textContent = '';
}

function showInfo(message) {
  infoMessage.textContent = message;
  errorMessage.textContent = '';
}

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

logoutButton.addEventListener('click', () => {
  showInfo("Signing out...");
  logoutButton.disabled = true;

  chrome.runtime.sendMessage({ action: 'logout' }, () => {
    logoutButton.disabled = false;
    currentCode = null;
    showLoggedOutState("Signed out.");
  });
});

// Add event listener for clickable code container
copyableCodeContainer.addEventListener('click', () => {
  if (currentCode) {
    copyCodeToClipboard();
  }
});

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

document.addEventListener('DOMContentLoaded', checkStatus);