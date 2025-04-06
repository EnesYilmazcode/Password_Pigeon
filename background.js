// --- Constants ---
const GMAIL_API_URL = 'https://www.googleapis.com/gmail/v1/users/me/messages';
const POLLING_INTERVAL_MINUTES = 1;
const ALARM_NAME = 'gmailCheckAlarm';
const CODE_REGEX = /\b(\d{4,8})\b/g;
const COMMON_SUBJECTS = ['verification code', 'security code', '2fa', 'two factor', 'authentication code', 'login code', 'mã xác minh', '코드', 'koodi'];
const COMMON_SENDERS = ['google.com', 'microsoft.com', 'github.com', 'discord.com', 'amazon.com', 'twitter.com', 'facebook.com', 'apple.com', 'paypal.com', 'ebay.com', 'instagram.com', 'support@'];

const CLIENT_ID = '150823808984-d7pcq090c9r3743m2506msjtdssthl7u.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

let authToken = null;
let isChecking = false;

const ICONS = {
  inactive: {
    "16": "images/logo16.png",
    "48": "images/logo48.png",
    "128": "images/logo128.png"
  },
  active: {
    "16": "images/logo16_active.png",
    "48": "images/logo48_active.png",
    "128": "images/logo128_active.png"
  }
};

// --- Token Management ---
async function ensureAuthToken() {
  const { authToken: storedToken, authTimestamp } = await chrome.storage.local.get(['authToken', 'authTimestamp']);
  const now = Date.now();

  if (storedToken && authTimestamp && (now - authTimestamp < 55 * 60 * 1000)) {
    authToken = storedToken;
    return storedToken;
  }

  try {
    const token = await launchOAuthFlow(false); // Try silent login first
    authToken = token;
    await chrome.storage.local.set({ authToken: token, authTimestamp: Date.now() });
    return token;
  } catch (silentErr) {
    console.warn("Silent login failed, trying interactive login...");
    const token = await launchOAuthFlow(true); // Fallback to interactive login
    authToken = token;
    await chrome.storage.local.set({ authToken: token, authTimestamp: Date.now() });
    return token;
  }
}

async function launchOAuthFlow(interactive = true) {
  return new Promise((resolve, reject) => {
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl =
      `https://accounts.google.com/o/oauth2/auth?` +
      `client_id=${CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token&` +
      `scope=${encodeURIComponent(SCOPES)}`;

    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, async function (redirectedTo) {
      if (chrome.runtime.lastError || !redirectedTo) {
        if (chrome.runtime.lastError?.message === "The user did not approve access.") {
          return reject(new Error("Sign-in canceled by user."));
        }
        return reject(chrome.runtime.lastError || new Error('Auth failed or was cancelled'));
      }

      try {
        const params = new URLSearchParams(new URL(redirectedTo).hash.substring(1));
        const accessToken = params.get('access_token');

        if (accessToken) {
          authToken = accessToken;
          await chrome.storage.local.set({ authToken, authTimestamp: Date.now() });
          updateIcon(true);
          resolve(accessToken);
        } else {
          reject(new Error('No access token received'));
        }
      } catch (e) {
        reject(new Error('Failed to parse OAuth redirect URL'));
      }
    });
  });
}

async function removeToken() {
  authToken = null;
  await chrome.storage.local.remove(['authToken', 'authTimestamp']);
  updateIcon(false);
}

// --- Gmail Fetching ---
async function fetchWithAuth(url, token = authToken) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (res.status === 401) {
    console.warn("Authorization failed (401). Trying silent re-auth...");

    try {
      const refreshedToken = await launchOAuthFlow(false);
      if (refreshedToken) {
        authToken = refreshedToken;
        await chrome.storage.local.set({ authToken: refreshedToken, authTimestamp: Date.now() });
        return await fetchWithAuth(url, refreshedToken);
      }
    } catch (e) {
      console.warn("Silent re-auth failed:", e.message);
    }

    await removeToken();
    throw new Error("Unauthorized");
  }

  return res;
}

function updateIcon(active = true) {
  chrome.action.setIcon({ path: active ? ICONS.active : ICONS.inactive });
}

// --- Gmail Monitor ---
async function checkForCode() {
  if (isChecking) return;
  isChecking = true;

  try {
    await ensureAuthToken();

    const res = await fetchWithAuth(`${GMAIL_API_URL}?maxResults=5&labelIds=INBOX`);
    const data = await res.json();

    const messages = data.messages || [];
    for (const msg of messages) {
      const detailRes = await fetchWithAuth(`${GMAIL_API_URL}/${msg.id}?format=full`);
      const msgData = await detailRes.json();

      const headers = msgData.payload.headers || [];
      const subject = headers.find(h => h.name === "Subject")?.value?.toLowerCase() || "";
      const from = headers.find(h => h.name === "From")?.value?.toLowerCase() || "";

      const shouldCheck = COMMON_SUBJECTS.some(keyword => subject.includes(keyword)) ||
        COMMON_SENDERS.some(sender => from.includes(sender));

      if (shouldCheck) {
        const body = msgData.snippet || "";
        const match = body.match(CODE_REGEX);
        if (match) {
          const code = match[0];
          const timestamp = Date.now();
          await chrome.storage.local.set({ latestCode: { code, timestamp } });
          updateIcon(true);
          
          // Show badge text
          chrome.action.setBadgeText({ text: "NEW" });
          chrome.action.setBadgeBackgroundColor({ color: "#d93025" }); // Red
          
          // Ask for permission if needed
          if (Notification.permission === "default") {
            Notification.requestPermission();
          }
          
          // Show desktop notification if allowed
          if (Notification.permission === "granted") {
            chrome.notifications.create({
              type: "basic",
              iconUrl: "images/logo128.png",
              title: "Password Pigeon",
              message: `New code detected: ${code}`,
              priority: 2
            });
          }
          
        }
      }
    }
  } catch (err) {
    console.error("Code check failed:", err.message);
  }

  isChecking = false;
}

// --- Alarm ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLLING_INTERVAL_MINUTES });
  console.log("Password Pigeon installed. Alarm set.");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkForCode();
  }
});

// --- Messaging ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "login") {
    ensureAuthToken()
      .then(token => sendResponse({ success: true, token }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "logout") {
    removeToken()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "getStatus") {
    chrome.storage.local.get('latestCode', data => {
      sendResponse({
        loggedIn: !!authToken,
        latestCodeData: data.latestCode || null
      });
    });
    return true;
  }

  if (request.action === "clearBadge") {
    chrome.action.setBadgeText({ text: "" });
    sendResponse({ success: true });
    return true;
  }
  

  if (request.action === "copyCode") {
    navigator.clipboard.writeText(request.code)
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
});
