// --- Constants ---
const CLIENT_ID = '150823808984-d7pcq090c9r3743m2506msjtdssthl7u.apps.googleusercontent.com'; // Replace with your actual Client ID if different
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
const TOKEN_EXPIRY_MARGIN = 5 * 60 * 1000; // Refresh token 5 minutes before nominal expiry (Google tokens last 60 mins)

let currentAuthToken = null; // In-memory cache

/**
 * Retrieves the current valid auth token, attempting to refresh or re-authenticate if necessary.
 * @param {boolean} interactive - Whether to allow interactive login prompt.
 * @returns {Promise<string|null>} The auth token or null if authentication fails.
 */
export async function ensureAuthToken(interactive = true) {
    const { authToken: storedToken, authTimestamp } = await chrome.storage.local.get(['authToken', 'authTimestamp']);
    const now = Date.now();

    if (storedToken && authTimestamp && (now - authTimestamp < (60 * 60 * 1000 - TOKEN_EXPIRY_MARGIN))) {
        console.log("Using stored, valid token.");
        currentAuthToken = storedToken;
        return currentAuthToken;
    }

    console.log("Stored token missing, expired, or nearing expiry. Attempting non-interactive refresh.");
    try {
        const token = await launchOAuthFlow(false); // Try non-interactive first
        console.log("Non-interactive token fetch successful.");
        currentAuthToken = token;
        await chrome.storage.local.set({ authToken: token, authTimestamp: Date.now() });
        return currentAuthToken;
    } catch (error) {
        console.warn("Non-interactive auth failed:", error.message);
        if (interactive) {
            console.log("Attempting interactive auth.");
            try {
                const token = await launchOAuthFlow(true); // Fallback to interactive
                console.log("Interactive token fetch successful.");
                currentAuthToken = token;
                await chrome.storage.local.set({ authToken: token, authTimestamp: Date.now() });
                return currentAuthToken;
            } catch (interactiveError) {
                console.error("Interactive auth failed:", interactiveError.message);
                await removeToken(); // Clear any potentially invalid stored token
                return null;
            }
        } else {
            console.log("Interactive auth skipped.");
            await removeToken();
            return null;
        }
    }
}

/**
 * Initiates the Google OAuth flow.
 * @param {boolean} interactive - Whether to prompt the user for login/consent.
 * @returns {Promise<string>} The access token.
 * @throws {Error} If authentication fails or is cancelled.
 */
async function launchOAuthFlow(interactive) {
    return new Promise((resolve, reject) => {
        const redirectUri = chrome.identity.getRedirectURL();
        if (!redirectUri) {
            return reject(new Error("Unable to get redirect URL. Check extension ID configuration."));
        }

        const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
        authUrl.searchParams.set('client_id', CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'token');
        authUrl.searchParams.set('scope', SCOPES);
        // Consider adding 'prompt: consent' or 'prompt: select_account' if needed, especially for interactive=true

        chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive }, (redirectedTo) => {
            if (chrome.runtime.lastError || !redirectedTo) {
                return reject(chrome.runtime.lastError || new Error('Auth flow failed or was cancelled by the user.'));
            }

            try {
                // Use URL constructor for robust parsing
                const url = new URL(redirectedTo);
                const params = new URLSearchParams(url.hash.substring(1)); // Get params from hash fragment
                const accessToken = params.get('access_token');
                const error = params.get('error');

                if (error) {
                    return reject(new Error(`OAuth error: ${error}`));
                }

                if (accessToken) {
                    resolve(accessToken);
                } else {
                    reject(new Error('Authentication successful, but no access token received in redirect.'));
                }
            } catch (e) {
                console.error("Error parsing redirect URL:", redirectedTo, e);
                reject(new Error('Failed to parse OAuth redirect URL.'));
            }
        });
    });
}

/**
 * Removes the stored authentication token and clears the in-memory cache.
 * @returns {Promise<void>}
 */
export async function removeToken() {
    currentAuthToken = null;
    await chrome.storage.local.remove(['authToken', 'authTimestamp']);
    console.log("Auth token removed.");
}

/**
 * Checks if the user is currently considered logged in (valid token exists).
 * @returns {Promise<boolean>}
 */
export async function checkUserLoggedIn() {
    const { authToken: storedToken, authTimestamp } = await chrome.storage.local.get(['authToken', 'authTimestamp']);
    const now = Date.now();
    const isValid = !!(storedToken && authTimestamp && (now - authTimestamp < (60 * 60 * 1000 - TOKEN_EXPIRY_MARGIN)));
    if (isValid) {
        currentAuthToken = storedToken; // Update cache if valid
    }
    return isValid;
}

/**
 * Gets the current token from cache - useful for synchronous checks after ensuring it's valid.
 * Do not rely on this without calling ensureAuthToken first.
 * @returns {string|null}
 */
export function getCurrentToken() {
    return currentAuthToken;
}