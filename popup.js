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

let currentCode = null;
let currentTheme = localStorage.getItem('theme') || 'light';

// Function to update theme button icon/text based on current theme
function updateThemeButton() {
  if (currentTheme === 'dark') {
    // Example: Update SVG or text if needed
    // themeToggleButton.querySelector('svg')... // Modify SVG attributes or replace innerHTML
    // For simplicity, we just ensure the main attribute is set
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

// Initialize theme and button
if (currentTheme === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark');
} else {
  document.documentElement.setAttribute('data-theme', 'light');
}
// updateThemeButton(); // Call if you want to update the icon inside the button initially

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
 * Copies the current code to the clipboard.
 */
function copyCodeToClipboard() {
  if (currentCode) {
    navigator.clipboard.writeText(currentCode)
      .then(() => {
        copyIndicator.classList.add('show-copy-indicator');
        setTimeout(() => {
          copyIndicator.classList.remove('show-copy-indicator');
        }, 2000);
      })
      .catch(err => showError("Clipboard access failed."));
  }
}

/**
 * Toggles between light and dark mode.
 */
function toggleTheme() {
  if (currentTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
    currentTheme = 'dark';
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');
    currentTheme = 'light';
  }
  // updateThemeButton(); // Update button visual if needed
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


// --- Event Listeners ---

// Login Button
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
    copyCodeToClipboard();
  }
});

// Theme Toggle Button (inside panel)
themeToggleButton.addEventListener('click', () => {
    toggleTheme();
    // Optionally close panel after selection
    // settingsPanel.classList.remove('show');
    // document.body.classList.remove('settings-panel-visible');
});

// Settings Gear Icon Button
settingsButton.addEventListener('click', (event) => {
    event.stopPropagation(); // Prevent click from immediately triggering the 'click outside' listener
    toggleSettingsPanel();
});

// About Button (inside panel) - Add functionality later if needed
aboutButton.addEventListener('click', () => {
    // Placeholder for About action (e.g., open a new tab or show info)
    console.log("About button clicked");
    alert("Password Pigeon v0.1.0\nCreated to fetch 2FA codes."); // Simple alert for now
    settingsPanel.classList.remove('show'); // Close panel
    document.body.classList.remove('settings-panel-visible');
});

// Listener for clicks outside the settings panel
document.addEventListener('click', handleClickOutside);


/**
 * Checks the current authentication status and updates the UI.
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

// Initial check when the popup is opened
document.addEventListener('DOMContentLoaded', () => {
    checkStatus();
    // updateThemeButton(); // Set initial theme button state if complex icons are used
});