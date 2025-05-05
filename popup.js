// --- START OF FILE popup.js ---

// Get references to HTML elements
const loginButton = document.getElementById('login-button');
const authStatus = document.getElementById('auth-status');
const codeSection = document.getElementById('code-section');
const codeText = document.getElementById('code-text');
const codeTimestamp = document.getElementById('code-timestamp');
const copyableCodeContainer = document.getElementById('copyable-code-container');
const errorMessage = document.getElementById('error-message');
const infoMessage = document.getElementById('info-message');
const copyIndicator = document.querySelector('.copy-indicator');
const statusIndicator = document.getElementById('status-indicator');
const pulseRing = document.getElementById('pulse-ring');
const radar = document.getElementById('radar');

// New/Updated Elements for Settings Panel
const settingsButton = document.getElementById('settings-button');
const settingsPanel = document.getElementById('settings-panel');
const aboutButton = document.getElementById('about-button'); // Assuming you add functionality later
const themeToggleButton = document.getElementById('theme-toggle-button');
const logoutButton = document.getElementById('logout-button'); // Moved reference
const websiteButton = document.getElementById('website-button'); // Added website button reference

let currentCode = null;
let isAuthInProgress = false; // Flag to prevent double auth attempts

// --- Theme Setup Based on System ---
let storedTheme = localStorage.getItem('theme');
let systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
let currentTheme = storedTheme || (systemPrefersDark ? 'dark' : 'light');

// Apply theme
document.documentElement.setAttribute('data-theme', currentTheme);

/**
 * Toggles between light and dark mode.
 */
function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('theme', currentTheme);
  updateThemeButton(); // Update button state after toggle
}

// Function to update the theme button icon/text based on current theme
function updateThemeButton() {
  // Example: Change icon based on theme (add your SVGs or logic here)
  // const icon = themeToggleButton.querySelector('svg path'); // Example selector
  // if (icon) {
  //   if (currentTheme === 'dark') {
  //     icon.setAttribute('d', 'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 0a.5.5 0 0 1-.707.707l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zm-9.193-9.193a.5.5 0 0 1-.707.707L1.634 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707z'); // Sun icon
  //   } else {
  //     icon.setAttribute('d', 'M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278zM4.858 1.311A7.269 7.269 0 0 0 1.025 7.71c0 4.021 3.278 7.277 7.318 7.277a7.316 7.316 0 0 0 5.205-2.162c-.337.042-.68.063-1.029.063-4.61 0-8.343-3.714-8.343-8.29 0-1.167.242-2.278.681-3.286z'); // Moon icon
  //   }
  // }
}

// Initialize theme and button
updateThemeButton(); // Call to update the button icon/text if needed

/**
 * Updates the UI to show the logged-out state.
 */
function showLoggedOutState(message = 'Please sign in to fetch codes.') {
  authStatus.textContent = message;
  loginButton.style.display = 'block';
  logoutButton.style.display = 'none'; // Ensure logout is hidden in panel
  codeSection.style.display = 'none';
  errorMessage.textContent = '';
  infoMessage.textContent = '';

  statusIndicator.classList.remove('active');
  pulseRing.style.display = 'none';
  radar.style.display = 'none';

  document.body.classList.remove('logged-in');
}

/**
 * Updates the UI to show the logged-in state.
 */
function showLoggedInState(codeData) {
  authStatus.textContent = '';
  loginButton.style.display = 'none';
  logoutButton.style.display = 'flex'; // Show logout button in panel (use flex/block as per CSS)
  codeSection.style.display = 'block';
  errorMessage.textContent = '';
  infoMessage.textContent = '';

  statusIndicator.classList.add('active');
  pulseRing.style.display = 'block';
  radar.style.display = 'block';

  document.body.classList.add('logged-in');

  if (codeData && codeData.code) {
    currentCode = codeData.code;
    codeText.textContent = currentCode;
    copyableCodeContainer.classList.add('has-code');
    copyableCodeContainer.classList.add('pulse-animation');

    setTimeout(() => {
      copyableCodeContainer.classList.remove('pulse-animation');
    }, 3000);

    const date = new Date(codeData.timestamp);
    codeTimestamp.textContent = `Found: ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    codeTimestamp.title = `Found: ${date.toLocaleString()}`;
  } else {
    currentCode = null;
    codeText.textContent = 'No code found recently.';
    copyableCodeContainer.classList.remove('has-code');
    copyableCodeContainer.classList.remove('pulse-animation');
    codeTimestamp.textContent = '';
    codeTimestamp.title = '';
  }
}

/**
 * Displays an error message.
 */
function showError(message) {
  errorMessage.textContent = `Error: ${message}`;
  infoMessage.textContent = '';
}

/**
 * Displays an informational message.
 */
function showInfo(message) {
  infoMessage.textContent = message;
  errorMessage.textContent = '';
}

/**
 * Copies the current code to the clipboard using the popup's context.
 */
async function copyCodeToClipboard() {
  if (currentCode) {
    try {
      await navigator.clipboard.writeText(currentCode);
      // Show visual feedback in popup
      copyIndicator.classList.add('show-copy-indicator');
      setTimeout(() => {
        copyIndicator.classList.remove('show-copy-indicator');
      }, 1500);
      console.log("Code copied successfully from popup:", currentCode);
    } catch (err) {
      console.error("Popup copy failed:", err);
      showError("Could not copy code. Permissions issue?");
      // Fallback attempt (optional, less reliable for popups):
      // try {
      //   const success = document.execCommand('copy'); // Legacy fallback
      //   if (success) {
      //      // Show feedback
      //   } else {
      //      showError("Copy failed.");
      //   }
      // } catch (execErr) {
      //   showError("Copy failed.");
      // }
    }
  }
}

/**
 * Toggles the visibility of the settings panel.
 */
function toggleSettingsPanel() {
  const isShown = settingsPanel.classList.toggle('show');
  // Add/remove a class to body for click outside detection
  document.body.classList.toggle('settings-panel-visible', isShown);
}

/**
 * Closes the settings panel if a click occurs outside of it.
 */
function handleClickOutside(event) {
  // Check if the panel is visible and the click was outside the panel and the toggle button
  if (settingsPanel.classList.contains('show') &&
      !settingsPanel.contains(event.target) &&
      !settingsButton.contains(event.target)) {
    settingsPanel.classList.remove('show');
    document.body.classList.remove('settings-panel-visible');
  }
}

/**
 * Attempts to authenticate the user, handling duplicative clicks.
 */
function attemptLogin() {
  // Prevent duplicate login attempts
  if (isAuthInProgress) {
    console.log("Auth already in progress, ignoring click");
    return;
  }
  
  isAuthInProgress = true;
  showInfo("Attempting sign in...");
  loginButton.disabled = true;
  loginButton.textContent = 'Signing In...';

  chrome.runtime.sendMessage({ action: 'login' }, (response) => {
    loginButton.disabled = false;
    loginButton.textContent = 'Sign In with Google';
    isAuthInProgress = false;
    
    if (response?.success) {
      showInfo("Sign in successful! Checking status...");
      setTimeout(checkStatus, 500);
    } else {
      showLoggedOutState();
      showError(response?.error || 'Login failed.');
    }
  });
}

// --- Event Listeners ---

// Login Button
loginButton.addEventListener('click', attemptLogin);

// Logout Button (inside panel)
logoutButton.addEventListener('click', () => {
  showInfo("Signing out...");
  logoutButton.disabled = true;

  chrome.runtime.sendMessage({ action: 'logout' }, () => {
    logoutButton.disabled = false;
    currentCode = null;
    showLoggedOutState("Signed out.");
    settingsPanel.classList.remove('show'); // Close panel on logout
    document.body.classList.remove('settings-panel-visible');
  });
});

// Copy Code Container
copyableCodeContainer.addEventListener('click', () => {
  if (currentCode) {
    copyCodeToClipboard(); // Call the updated function
  }
});

// Theme Toggle Button (inside panel)
themeToggleButton.addEventListener('click', () => {
  toggleTheme();
});

// Settings Gear Icon Button
settingsButton.addEventListener('click', (event) => {
  event.stopPropagation(); // Prevent click from immediately triggering the 'click outside' listener
  toggleSettingsPanel();
});

// About Button (inside panel) - Add functionality later if needed
if (aboutButton) {
  aboutButton.addEventListener('click', () => {
    console.log("About button clicked");
    alert("Password Pigeon v0.1.0\nCreated to fetch 2FA codes."); // Simple alert for now
    settingsPanel.classList.remove('show'); // Close panel
    document.body.classList.remove('settings-panel-visible');
  });
}

// Website Button (inside panel)
websiteButton.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://password-pigeon.web.app' });
  settingsPanel.classList.remove('show'); // Close panel
  document.body.classList.remove('settings-panel-visible');
});

// Listener for clicks outside the settings panel
document.addEventListener('click', handleClickOutside);

/**
 * Checks the current authentication status and updates the UI.
 */
function checkStatus() {
  console.log("Checking authentication status...");
  errorMessage.textContent = '';
  infoMessage.textContent = '';
  
  // Show a loading state while checking
  authStatus.textContent = "Checking authentication...";
  loginButton.style.display = 'none';
  
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error connecting to background:", chrome.runtime.lastError);
      showLoggedOutState("Error connecting.");
      showError("Try reloading the extension.");
      return;
    }
    
    console.log("Status response:", response);

    if (response?.loggedIn) {
      console.log("User is logged in, showing logged in state");
      // If logged in, ask background to clear the badge if the popup is opened
      chrome.runtime.sendMessage({ action: "clearBadge" });
      showLoggedInState(response.latestCodeData);
    } else {
      console.log("User is not logged in, showing login button");
      // Handle case where the user needs to log in
      showLoggedOutState();
    }
  });
}

// Initial setup when the popup is opened
document.addEventListener('DOMContentLoaded', () => {
  console.log("Popup opened, checking status");
  
  // Show a loading state while checking
  authStatus.textContent = "Checking authentication...";
  loginButton.style.display = 'none';
  
  // Add a small delay to ensure background script is ready
  setTimeout(() => {
    checkStatus();
  }, 100);
});

// Add event listener for the new copy button
const copyButton = document.getElementById('copy-button');
if (copyButton) {
  copyButton.addEventListener('click', () => {
    const codeText = document.getElementById('code-text').textContent;
    if (codeText && codeText !== 'No code found yet.') {
      copyToClipboard(codeText);
    }
  });
}

/**
 * Copies text to clipboard and shows confirmation
 * @param {string} text - The text to copy
 */
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    // Show the copy indicator
    const copyIndicator = document.querySelector('.copy-indicator');
    copyIndicator.classList.add('visible');
    
    // Hide the indicator after 2 seconds
    setTimeout(() => {
      copyIndicator.classList.remove('visible');
    }, 2000);
    
    console.log('Code copied to clipboard:', text);
  }).catch(err => {
    console.error('Failed to copy code:', err);
  });
}

// Initialize notification toggle state
let notificationsEnabled = true; // Default to enabled

// Load notification state
chrome.storage.local.get('notificationsEnabled', (data) => {
  notificationsEnabled = data.notificationsEnabled !== false; // Default to true if not set
  updateNotificationToggleUI();
});

// Add notification toggle button handler
document.getElementById('notifications-toggle-button').addEventListener('click', () => {
  notificationsEnabled = !notificationsEnabled;
  chrome.storage.local.set({ notificationsEnabled });
  updateNotificationToggleUI();
  
  // Send message to background script to update notification state
  chrome.runtime.sendMessage({ 
    action: 'setNotifications',
    enabled: notificationsEnabled 
  });
});

function updateNotificationToggleUI() {
  const button = document.getElementById('notifications-toggle-button');
  if (notificationsEnabled) {
    button.classList.remove('disabled');
    button.title = 'Disable Notifications';
  } else {
    button.classList.add('disabled');
    button.title = 'Enable Notifications';
  }
}
// --- END OF FILE popup.js ---