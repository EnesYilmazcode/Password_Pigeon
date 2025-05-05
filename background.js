// --- START OF FILE background.js ---

import { ensureAuthToken, removeToken, checkUserLoggedIn, initializeAuth } from './auth.js'; // Use more functions from auth.js
import { findLatestCode } from './gmail.js'; // Use gmail module

// --- Constants ---
const GMAIL_API_URL = 'https://www.googleapis.com/gmail/v1/users/me/messages';
const MAX_MESSAGES_TO_CHECK = 5;
const CHECK_ALARM_NAME = 'checkForCodeAlarm';
const CHECK_INTERVAL_MINUTES = 0.25; // Check every 15 seconds
const NOTIFICATION_PREFIX = 'password-pigeon-code-'; // Prefix for notification IDs

// --- State ---
let isChecking = false; // Prevent overlapping checks
let lastNotifiedCode = null; // Store the last code we showed a notification for
let notificationsEnabled = true; // Default to enabled

const ICONS = {
  inactive: {
    "16": "images/logo16.png",
    "48": "images/logo48.png",
    "128": "images/logo128.png"
  },
  active: { // Use a visually distinct icon when logged in/active check
    "16": "images/logo16_active.png", // You need to create this icon
    "48": "images/logo48_active.png", // You need to create this icon
    "128": "images/logo128.png" // Keep 128 same or make active too
  }
};

// Load notification state on startup
chrome.storage.local.get('notificationsEnabled', (data) => {
  notificationsEnabled = data.notificationsEnabled !== false; // Default to true if not set
  console.log('Notifications enabled:', notificationsEnabled);
});

// --- Initialization ---
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`Password Pigeon ${details.reason} (v${chrome.runtime.getManifest().version})`);
  
  try {
    // Initialize auth system first
    await initializeAuth();
    
    // Then initialize our extension state
    await initializeState();
    
    // Start the monitoring alarm
    startAlarm();
    
    console.log("Initialization complete");
  } catch (error) {
    console.error("Initialization failed:", error);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("Password Pigeon starting up after browser restart");
  
  try {
    // Reinitialize auth (checks for existing refresh token)
    await initializeAuth();
    
    // Restore state
    await initializeState();
    
    // Ensure alarm is running
    startAlarm();
    
    // Check if user is logged in and start checking for codes
    const isLoggedIn = await checkUserLoggedIn();
    if (isLoggedIn) {
      console.log("User is logged in, starting code checks");
      // Trigger an immediate check
      checkForCode().catch(console.error);
    } else {
      console.log("User is not logged in");
      // Make sure we're not showing any active state
      updateIcon(false);
    }
    
    console.log("Startup initialization complete");
  } catch (error) {
    console.error("Startup initialization failed:", error);
    // Ensure we're in a clean state even if initialization fails
    updateIcon(false);
  }
});

async function initializeState() {
  console.log("Initializing extension state...");
  
  try {
    // Restore last notified code from storage
    const data = await chrome.storage.local.get([
      'lastNotifiedCode',
      'latestCodeData',
      'refreshToken'
    ]);
    
    lastNotifiedCode = data.lastNotifiedCode || null;
    console.log("Restored last notified code:", lastNotifiedCode);
    
    // Set initial icon based on login status
    const loggedIn = await checkUserLoggedIn();
    updateIcon(loggedIn);
    
    // If logged in but no alarm is running, start one
    if (loggedIn) {
      chrome.alarms.get(CHECK_ALARM_NAME, (alarm) => {
        if (!alarm) {
          console.log("No active alarm found for logged-in user, starting one");
          startAlarm();
        }
      });
    }
    
    console.log("State initialization complete");
  } catch (error) {
    console.error("State initialization error:", error);
    throw error;
  }
}
// --- Icon Management ---
function updateIcon(isLoggedIn) {
  const path = isLoggedIn ? ICONS.active : ICONS.inactive;
  chrome.action.setIcon({ path }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error setting icon:", chrome.runtime.lastError.message);
    } else {
      console.log("Icon updated, loggedIn:", isLoggedIn);
    }
  });
}

// --- Badge Management ---
function showNewCodeBadge() {
    chrome.action.setBadgeText({ text: "NEW" });
    chrome.action.setBadgeBackgroundColor({ color: "#d93025" }); // Google Red
    console.log("Set 'NEW' badge.");
}

function clearBadge() {
    chrome.action.setBadgeText({ text: "" });
    console.log("Cleared badge.");
}

// --- Alarm Management ---
function startAlarm() {
  chrome.alarms.get(CHECK_ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(CHECK_ALARM_NAME, {
        delayInMinutes: 0.1, // Start quickly after install/startup
        periodInMinutes: CHECK_INTERVAL_MINUTES
      });
      console.log(`Alarm '${CHECK_ALARM_NAME}' created with interval ${CHECK_INTERVAL_MINUTES} minutes.`);
    } else {
      console.log(`Alarm '${CHECK_ALARM_NAME}' already exists.`);
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECK_ALARM_NAME) {
    console.log(`Alarm '${CHECK_ALARM_NAME}' triggered.`);
    checkForCode();
  }
});

// --- Gmail Monitor & Notification ---
async function checkForCode() {
  if (isChecking) {
    console.log("Check already in progress, skipping.");
    return;
  }
  isChecking = true;
  console.log("Starting code check...");

  try {
    // Ensure we have a valid token non-interactively first
    console.log("Ensuring auth token (non-interactive)...");
    const token = await ensureAuthToken(false); // false = non-interactive
    if (!token) {
      console.log("Not logged in or token invalid, cannot check for codes.");
      updateIcon(false); // Ensure icon shows logged-out state
      isChecking = false;
      return;
    }
    console.log("Got valid token, updating icon to active state");
    updateIcon(true); // Token valid, show active icon

    // Find the latest code using the gmail module
    console.log("Finding latest code...");
    const latestCodeData = await findLatestCode(token);

    if (latestCodeData && latestCodeData.code) {
      console.log("Found potential code:", latestCodeData.code, "Timestamp:", latestCodeData.timestamp);

      // Compare with the last *notified* code
      if (!lastNotifiedCode || lastNotifiedCode.code !== latestCodeData.code || lastNotifiedCode.timestamp !== latestCodeData.timestamp) {
        console.log("New code detected! Previous:", lastNotifiedCode);
        lastNotifiedCode = latestCodeData; // Update internal state
        await chrome.storage.local.set({ latestCodeData: latestCodeData, lastNotifiedCode: lastNotifiedCode }); // Store both
        showNewCodeBadge();
        showNotification(latestCodeData.code);
      } else {
        console.log("Code found is the same as the last notified one. No new notification.");
        // Still store it in latestCodeData in case the popup needs the absolute latest
        await chrome.storage.local.set({ latestCodeData: latestCodeData });
      }
    } else {
      console.log("No new code found in this check.");
      // Optionally clear latestCodeData if null? Depends on desired popup behavior
      // await chrome.storage.local.remove('latestCodeData');
    }

  } catch (error) {
    console.error("Error during code check:", error);
    if (error.message.includes("Authentication failed") || error.message.includes("Unauthorized")) {
        console.log("Authentication error detected, updating icon to inactive state");
        updateIcon(false); // Update icon if auth specifically failed
        await removeToken(); // Clear the bad token
    }
    // Don't clear lastNotifiedCode on error, maybe it was temporary
  } finally {
    isChecking = false;
    console.log("Code check finished.");
  }
}

async function showNotification(code) {
  if (!notificationsEnabled) {
    console.log('Notifications disabled, skipping notification for code:', code);
    return;
  }

  const notificationId = `${NOTIFICATION_PREFIX}${code}-${Date.now()}`;
  try {
    chrome.permissions.contains({ permissions: ['notifications'] }, (hasPermission) => {
      if (!hasPermission) {
        console.warn("Notification permission not granted.");
        return;
      }

      chrome.storage.local.set({ [notificationId]: code });

      chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: chrome.runtime.getURL(ICONS.active["128"]),
        title: "Password Pigeon Found Code",
        message: `Code: ${code}\nClick here to copy.`,
        priority: 2,
        requireInteraction: false
      }, (createdId) => {
        if (chrome.runtime.lastError) {
          console.error("Notification creation error:", chrome.runtime.lastError.message);
          chrome.storage.local.remove(notificationId);
        } else {
          console.log("Notification created:", createdId);
        }
      });
    });
  } catch (error) {
    console.error("Error showing notification:", error);
    chrome.storage.local.remove(notificationId);
  }
}

// --- Notification Click Handler (Uses Scripting Fallback) ---
chrome.notifications.onClicked.addListener(async (notificationId) => {
  console.log("Notification clicked:", notificationId);
  if (!notificationId.startsWith(NOTIFICATION_PREFIX)) {
      console.log("Clicked notification not from this extension.");
      return;
  }

  // Retrieve the code stored for this specific notification ID
  const data = await chrome.storage.local.get(notificationId);
  const code = data[notificationId];

  if (code) {
    try {
      console.log(`Attempting to copy code "${code}" from notification click.`);
      await copyTextToClipboardInBackground(code); // Use the background copy function
      console.log("Code copy initiated via scripting.");
      // Optionally show a brief confirmation notification?
       chrome.notifications.create({
           type: "basic",
           iconUrl: chrome.runtime.getURL(ICONS.active["48"]),
           title: "Password Pigeon",
           message: `Code ${code} copied!`,
           priority: 1,
           eventTime: Date.now() + 2000 // Show for ~2 seconds
       });
    } catch (err) {
      console.error("Background clipboard copy failed:", err);
      // Notify user copy failed
       chrome.notifications.create({
           type: "basic",
           iconUrl: chrome.runtime.getURL(ICONS.inactive["48"]),
           title: "Password Pigeon - Copy Failed",
           message: `Could not copy code "${code}". Please copy manually from the popup. Error: ${err.message}`,
           priority: 1
       });
    } finally {
        // Clear the clicked notification and its stored code
        chrome.notifications.clear(notificationId);
        chrome.storage.local.remove(notificationId);
        console.log("Cleared notification and associated storage:", notificationId);
    }
  } else {
    console.warn("No code found in storage for notification ID:", notificationId);
    // Clear the notification anyway if the data is missing
    chrome.notifications.clear(notificationId);
  }
});

// --- Background Clipboard Helper (Uses Scripting Injection) ---
async function copyTextToClipboardInBackground(text) {
  try {
    // Find a suitable tab to inject the script
    // Prioritize the last focused non-popup window's active tab
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true, status: 'complete' });
    let targetTab = tabs.find(tab => !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')); // Avoid special pages

    if (!targetTab) {
        // Fallback: query all windows for a suitable active tab
        const allTabs = await chrome.tabs.query({ active: true, status: 'complete'});
        targetTab = allTabs.find(tab => !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:'));
    }

    if (targetTab?.id) {
      console.log(`Injecting copy script into tab ${targetTab.id} (${targetTab.url})`);
      await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: attemptCopyToClipboard, // Inject the function below
        args: [text]
      });
       // The injected script handles success/failure logging/confirmation internally
    } else {
      console.error("No suitable active tab found to inject clipboard script.");
      throw new Error("No active tab available for copying.");
    }
  } catch (err) {
    console.error("Error executing script for clipboard copy:", err);
    throw new Error(`Scripting execution failed: ${err.message}`);
  }
}

// This function is injected into the target tab by copyTextToClipboardInBackground
function attemptCopyToClipboard(textToCopy) {
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        console.log('[Content Script] Text copied to clipboard successfully:', textToCopy);
        // Optional: Add a brief visual confirmation on the page itself
        // Example:
        // const confirmation = document.createElement('div');
        // confirmation.textContent = 'Code Copied!';
        // Object.assign(confirmation.style, { position: 'fixed', top: '10px', right: '10px', background: 'lightgreen', padding: '8px', borderRadius: '4px', zIndex: '9999' });
        // document.body.appendChild(confirmation);
        // setTimeout(() => confirmation.remove(), 2000);
      })
      .catch(err => {
        console.error('[Content Script] Failed to copy text to clipboard:', err);
        // Cannot directly throw back to background, but log is visible in tab's console
      });
}


// --- Messaging ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message:", request.action);

  if (request.action === "login") {
    // Use interactive auth flow from popup request
    ensureAuthToken(true) // true = interactive
      .then(token => {
          updateIcon(true); // Update icon on successful login
          startAlarm(); // Ensure alarm is running after login
          sendResponse({ success: true, token });
          checkForCode(); // Trigger an immediate check after login
      })
      .catch(error => {
          console.error("Interactive login failed:", error);
          updateIcon(false);
          sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates asynchronous response
  }

  if (request.action === "logout") {
    removeToken()
      .then(() => {
        // Stop the alarm on logout
        chrome.alarms.clear(CHECK_ALARM_NAME, (wasCleared) => {
            console.log(`Alarm ${CHECK_ALARM_NAME} cleared on logout:`, wasCleared);
        });
        updateIcon(false); // Update icon
        lastNotifiedCode = null; // Clear internal state
        // Clear stored codes as well
        return chrome.storage.local.remove(['latestCodeData', 'lastNotifiedCode']);
      })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error("Logout failed:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Indicates asynchronous response
  }

  if (request.action === "getStatus") {
    // Use checkUserLoggedIn for consistency, get latest code data too
    console.log("Background received getStatus request, checking login status");
    Promise.all([
        checkUserLoggedIn(),
        chrome.storage.local.get('latestCodeData')
    ]).then(([loggedIn, data]) => {
        console.log("Login status check result:", loggedIn);
        updateIcon(loggedIn); // Sync icon state with actual status
        
        // If logged in, make sure we have a running alarm
        if (loggedIn) {
          chrome.alarms.get(CHECK_ALARM_NAME, (alarm) => {
            if (!alarm) {
              console.log("No active alarm found during status check, starting one");
              startAlarm();
            }
          });
        }
        
        sendResponse({
            loggedIn: loggedIn,
            latestCodeData: data.latestCodeData || null
        });
    }).catch(error => {
        console.error("Error getting status:", error);
        updateIcon(false); // Assume not logged in on error
        sendResponse({ loggedIn: false, latestCodeData: null, error: error.message });
    });
    return true; // Indicates asynchronous response
  }

  if (request.action === "clearBadge") {
    clearBadge();
    sendResponse({ success: true });
    // No return true needed as it's synchronous
  }

  if (request.action === 'setNotifications') {
    notificationsEnabled = request.enabled;
    console.log('Notifications ' + (notificationsEnabled ? 'enabled' : 'disabled'));
  }

  // REMOVED: copyCode action - popup handles its own copy now
  // if (request.action === "copyCode") { ... }

  console.log("Unknown message action:", request.action);
  return false; // Indicate synchronous response or unknown action
});
// --- END OF FILE background.js ---