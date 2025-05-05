// --- START OF FILE auth.js ---

import { CLIENT_ID, CLIENT_SECRET } from './secrets.js';

const DEBUG = true;
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
const TOKEN_EXPIRY_MARGIN = 5 * 60 * 1000; // 5 minutes
const MAX_TOKEN_AGE = 60 * 60 * 1000; // 1 hour
const REFRESH_ALARM_NAME = 'proactiveTokenRefresh';

let currentAuthToken = null;


class AuthError extends Error {
  constructor(message, isPermanent = false) {
    super(message);
    this.name = 'AuthError';
    this.isPermanent = isPermanent;
  }
}

class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
  }
}

export async function initializeAuth() {
  if (DEBUG) console.log("Initializing auth system");
  try {
    const stored = await chrome.storage.local.get(['authToken', 'authTimestamp', 'refreshToken']);
    if (stored.authToken && stored.refreshToken) {
      currentAuthToken = stored.authToken;
    }
    await setupProactiveRefresh();
  } catch (e) {
    console.error("Initialization failed:", e);
  }
}

async function setupProactiveRefresh() {
  const { refreshToken } = await chrome.storage.local.get('refreshToken');
  if (refreshToken) {
    scheduleNextRefresh();
  }
}

function scheduleNextRefresh() {
  chrome.alarms.create(REFRESH_ALARM_NAME, {
    delayInMinutes: (MAX_TOKEN_AGE - TOKEN_EXPIRY_MARGIN) / (60 * 1000) - 1
  });
  if (DEBUG) console.log("Scheduled next token refresh");
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REFRESH_ALARM_NAME) {
    if (DEBUG) console.log("Token refresh alarm triggered");
    try {
      await ensureAuthToken(false);
      scheduleNextRefresh();
    } catch (e) {
      console.error("Proactive refresh failed:", e);
    }
  }
});

export async function ensureAuthToken(interactive = true) {
  try {
    console.log("ensureAuthToken called, interactive:", interactive);

    if (currentAuthToken) {
      console.log("Using existing token from memory");
      return currentAuthToken;
    }

    const { authToken, authTimestamp, refreshToken } = await chrome.storage.local.get(['authToken', 'authTimestamp', 'refreshToken']);
    const now = Date.now();

    console.log("Stored data:", { 
      hasAuthToken: !!authToken, 
      hasAuthTimestamp: !!authTimestamp, 
      hasRefreshToken: !!refreshToken,
      tokenAge: authTimestamp ? (now - authTimestamp) / 1000 : 'N/A'
    });

    if (authToken && authTimestamp && (now - authTimestamp < (MAX_TOKEN_AGE - TOKEN_EXPIRY_MARGIN))) {
      console.log("Using valid stored token");
      currentAuthToken = authToken;
      return currentAuthToken;
    }

    if (refreshToken) {
      try {
        console.log("Attempting to refresh token...");
        const newAccessToken = await refreshAccessToken(refreshToken);
        currentAuthToken = newAccessToken;
        await chrome.storage.local.set({
          authToken: newAccessToken,
          authTimestamp: Date.now()
        });
        console.log("Successfully refreshed token");
        return currentAuthToken;
      } catch (refreshError) {
        console.error("Error refreshing token:", refreshError);
        if (isTokenInvalidError(refreshError)) {
          console.warn("Refresh token invalid, removing");
          await removeToken();
          throw new AuthError("Session expired", true);
        }
        throw new NetworkError("Refresh failed: " + refreshError.message);
      }
    }

    if (!interactive) {
      console.log("No valid token and non-interactive mode, cannot authenticate");
      throw new AuthError("Authentication required", true);
    }

    return await attemptAuthenticationFlow(interactive);

  } catch (error) {
    console.error("Error ensuring auth token:", error);
    if (error instanceof AuthError && error.isPermanent) {
      await removeToken();
    }
    throw error;
  }
}

async function attemptAuthenticationFlow(interactive) {
  try {
    if (DEBUG) console.log(`Attempting ${interactive ? 'interactive' : 'silent'} auth flow`);
    const authCode = await launchOAuthFlow(interactive);
    const tokens = await exchangeCodeForTokens(authCode);
    currentAuthToken = tokens.accessToken;
    await storeTokens(tokens);
    if (DEBUG) console.log("Authentication flow completed successfully");
    return currentAuthToken;
  } catch (error) {
    console.error(`${interactive ? 'Interactive' : 'Non-interactive'} auth failed:`, error);
    throw error;
  }
}

async function storeTokens(tokens) {
  const storageData = {
    authToken: tokens.accessToken,
    authTimestamp: Date.now()
  };

  if (tokens.refreshToken) {
    if (DEBUG) console.log("Storing new refresh token");
    storageData.refreshToken = tokens.refreshToken;
  } else {
    const existing = await chrome.storage.local.get('refreshToken');
    if (existing.refreshToken) {
      if (DEBUG) console.log("Keeping existing refresh token");
      storageData.refreshToken = existing.refreshToken;
    }
  }

  await chrome.storage.local.set(storageData);
  if (DEBUG) console.log("Tokens stored successfully");
  if (storageData.refreshToken) scheduleNextRefresh();
}

async function launchOAuthFlow(interactive) {
  return new Promise((resolve, reject) => {
    const redirectUri = chrome.identity.getRedirectURL();
    if (DEBUG) console.log("OAuth redirect URI:", redirectUri);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive }, (redirectedToUrl) => {
      if (chrome.runtime.lastError) {
        console.error("Chrome auth flow error:", chrome.runtime.lastError);
        return reject(chrome.runtime.lastError);
      }
      try {
        const url = new URL(redirectedToUrl);
        const code = url.searchParams.get('code');
        if (code) {
          if (DEBUG) console.log("Received auth code");
          resolve(code);
        } else {
          console.error("No authorization code in redirect");
          reject(new Error('No authorization code'));
        }
      } catch (e) {
        console.error("Failed to parse redirect URL:", e);
        reject(new Error('Failed to parse redirect URL'));
      }
    });
  });
}

async function exchangeCodeForTokens(code) {
  if (DEBUG) console.log("Exchanging auth code for tokens");
  const tokenEndpoint = 'https://oauth2.googleapis.com/token';
  const redirectUri = chrome.identity.getRedirectURL();

  const formData = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Token exchange failed:", data);
    throw new Error(data.error_description || 'Token exchange failed');
  }

  if (DEBUG) console.log("Token exchange successful");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null
  };
}

async function refreshAccessToken(refreshToken) {
  if (DEBUG) console.log("Refreshing access token");
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Token refresh failed:", data);
    throw new Error(data.error_description || 'Token refresh failed');
  }

  if (DEBUG) console.log("Token refresh successful");
  return data.access_token;
}

function isTokenInvalidError(error) {
  return error.message.includes("invalid_grant") || error.status === 400 || error.status === 401;
}

export async function removeToken() {
  if (DEBUG) console.log("Removing tokens from storage");
  currentAuthToken = null;
  await chrome.storage.local.remove(['authToken', 'authTimestamp', 'refreshToken']);
  chrome.alarms.clear(REFRESH_ALARM_NAME);
}

export async function fullLogout() {
  if (DEBUG) console.log("Performing full logout");
  await removeToken();
}

export async function checkUserLoggedIn() {
  try {
    console.log("checkUserLoggedIn called");
    const { refreshToken } = await chrome.storage.local.get('refreshToken');
    if (refreshToken) {
      try {
        await ensureAuthToken(false);
        console.log("User is logged in with valid token");
        return true;
      } catch (error) {
        console.error("Silent login check failed:", error);
        return false;
      }
    }
    return false;
  } catch (error) {
    console.error("Error checking login status:", error);
    return false;
  }
}

export function getCurrentToken() {
  return currentAuthToken;
}

// --- END OF FILE auth.js ---