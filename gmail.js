import { ensureAuthToken, removeToken } from './auth.js'; // Import auth functions

// --- Constants ---
const GMAIL_API_URL = 'https://www.googleapis.com/gmail/v1/users/me/messages';
// ** NEW Regex: Alphanumeric, 4-12 chars, case-insensitive, word boundaries **
const CODE_REGEX = /\b([A-Z0-9]{4,12})\b/gi;
// ** Filter Regex: Avoids long numbers (like phone numbers) and decimals **
const NOISE_FILTER_REGEX = /^\d{10,}$|^\d+\.\d+$/;

// Keywords and senders likely containing 2FA codes
const COMMON_SUBJECTS = ['verification code', 'security code', '2fa', 'two factor', 'authentication code', 'login code', 'mã xác minh', '코드', 'koodi', 'verifizierungscode', 'código'];
const COMMON_SENDERS = ['google.com', 'microsoft.com', 'github.com', 'discord.com', 'amazon.com', 'twitter.com', 'facebook.com', 'apple.com', 'paypal.com', 'ebay.com', 'instagram.com', 'support@', 'noreply@', 'no-reply@', 'account@', 'service@', 'security@'];
const MAX_MESSAGES_TO_CHECK = 5; // How many recent emails to check

/**
 * Fetches data from a URL using the provided auth token, handling 401 errors by attempting refresh.
 * @param {string} url - The URL to fetch.
 * @param {string} token - The auth token to use.
 * @returns {Promise<Response>} The fetch Response object.
 * @throws {Error} If fetch fails or authentication cannot be re-established.
 */
async function fetchWithAuth(url, token) {
    let currentToken = token;
    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (res.status === 401) {
            console.warn("API request unauthorized (401). Attempting token refresh.");
            // Pass false to prevent interactive prompt during background fetch
            const refreshedToken = await ensureAuthToken(false);
            if (refreshedToken) {
                console.log("Token refreshed successfully. Retrying fetch.");
                currentToken = refreshedToken; // Update token for retry
                // Retry the fetch with the new token
                return await fetch(url, {
                    headers: { 'Authorization': `Bearer ${currentToken}` }
                });
            } else {
                console.error("Token refresh failed. Removing token.");
                await removeToken(); // Clear invalid token
                throw new Error("Unauthorized (401) and token refresh failed.");
            }
        }
        // If status is not 401, return the original response
        return res;
    } catch (error) {
        // Catch network errors or errors from ensureAuthToken/removeToken
        console.error(`Error during fetchWithAuth for ${url}:`, error);
        // Re-throw a more specific error if it's auth related, otherwise the original error
        if (error.message.includes("Unauthorized")) {
            throw new Error("Authentication failed during API call.");
        }
        throw error; // Re-throw other errors (e.g., network issues)
    }
}

/**
 * Extracts the plain text body from a Gmail message payload.
 * Prefers text/plain part, falls back to decoding base64 data.
 * @param {object} payload - The Gmail message payload.
 * @returns {string} The extracted plain text body or an empty string.
 */
function getEmailBody(payload) {
    if (!payload) return '';

    // 1. Look for explicit text/plain part
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
        try {
            return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } catch (e) {
            console.error("Error decoding base64 body:", e);
            return ''; // Return empty on decoding error
        }
    }

    // 2. If multipart, search parts recursively
    if (payload.parts && payload.parts.length > 0) {
        // Prioritize text/plain within multipart
        const plainPart = payload.parts.find(part => part.mimeType === 'text/plain');
        if (plainPart?.body?.data) {
            try {
                 return atob(plainPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            } catch (e) {
                 console.error("Error decoding base64 plain part:", e);
                 return '';
            }
        }
        // Fallback: recursively search other parts (might find nested text/plain)
        for (const part of payload.parts) {
            const bodyPart = getEmailBody(part);
            if (bodyPart) return bodyPart; // Return the first non-empty body found
        }
    }

    // 3. Fallback for top-level data if mimeType wasn't text/plain initially but has data
     if (payload.body?.data) {
         try {
            // Be cautious decoding if mimeType isn't known to be text
            if (payload.mimeType?.startsWith('text/')) {
                 return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            } else {
                // Maybe log a warning if decoding non-text mime type?
                // console.warn("Attempting to decode body with mimeType:", payload.mimeType);
                // return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                return ''; // Avoid decoding potentially binary data
            }
         } catch (e) {
             console.error("Error decoding fallback base64 body:", e);
             return '';
         }
     }


    // 4. Use snippet as a last resort if no body found
    if (payload.snippet) {
        // console.log("Using snippet as fallback body.");
        return payload.snippet;
    }


    return ''; // No suitable body found
}


/**
 * Checks recent Gmail messages for a potential 2FA code.
 * @param {string} token - The auth token.
 * @returns {Promise<{code: string, timestamp: number}|null>} The latest code found, or null.
 */
export async function findLatestCode(token) {
    if (!token) {
        throw new Error("Authentication token is required to find codes.");
    }

    try {
        // 1. Fetch IDs of recent messages
        const listUrl = `${GMAIL_API_URL}?maxResults=${MAX_MESSAGES_TO_CHECK}&labelIds=INBOX&q=is:unread OR newer_than:5m`; // Check unread OR recent (5 mins)
        const listRes = await fetchWithAuth(listUrl, token);
        if (!listRes.ok) {
            const errorData = await listRes.text();
            console.error(`Failed to list messages (${listRes.status}): ${errorData}`);
            throw new Error(`Gmail API error (${listRes.status}) while listing messages.`);
        }
        const listData = await listRes.json();
        const messages = listData.messages || [];

        if (messages.length === 0) {
            console.log("No recent/unread messages found to check.");
            return null;
        }

        // 2. Fetch full details for potentially relevant messages
        // Fetch metadata first to quickly filter by Subject/From
        const metadataPromises = messages.map(msg => {
            const metaUrl = `${GMAIL_API_URL}/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`;
            return fetchWithAuth(metaUrl, token).then(res => res.ok ? res.json() : Promise.reject(new Error(`Metadata fetch failed (${res.status})`))).catch(e => {
                console.warn(`Skipping message ${msg.id} due to metadata fetch error: ${e.message}`);
                return null; // Return null on error for this message
            });
        });

        const metadataResults = (await Promise.all(metadataPromises)).filter(Boolean); // Filter out nulls from errors

        const relevantMessageIds = metadataResults.filter(msgData => {
            if (!msgData?.payload?.headers) return false;
            const headers = msgData.payload.headers;
            const subject = headers.find(h => h.name.toLowerCase() === "subject")?.value?.toLowerCase() || "";
            const from = headers.find(h => h.name.toLowerCase() === "from")?.value?.toLowerCase() || "";

            const isRelevant = COMMON_SUBJECTS.some(keyword => subject.includes(keyword)) ||
                               COMMON_SENDERS.some(senderDomain => from.includes(senderDomain));

            // console.log(`Subject: "${subject}", From: "${from}", Relevant: ${isRelevant}`); // Debug relevance check
            return isRelevant;
        }).map(msgData => msgData.id);

        if (relevantMessageIds.length === 0) {
             console.log("No relevant messages found based on Subject/From headers.");
             return null;
        }

        // 3. Fetch full content only for relevant messages
        const detailPromises = relevantMessageIds.map(id => {
            const detailUrl = `${GMAIL_API_URL}/${id}?format=full`;
            return fetchWithAuth(detailUrl, token).then(res => res.ok ? res.json() : Promise.reject(new Error(`Detail fetch failed (${res.status})`))).catch(e => {
                 console.warn(`Skipping message ${id} due to detail fetch error: ${e.message}`);
                 return null; // Return null on error for this message
            });
        });

        const fullDetails = (await Promise.all(detailPromises)).filter(Boolean); // Filter out nulls

        // 4. Process messages to find the newest, longest code
        let newestCode = null;
        let newestTimestamp = 0;

        for (const msgData of fullDetails) {
            const internalTimestamp = parseInt(msgData.internalDate, 10);
            if (isNaN(internalTimestamp)) continue; // Skip if timestamp is invalid

            // Extract body (prefer text/plain)
            const body = getEmailBody(msgData.payload);
            if (!body) {
                // console.log(`No usable body found for message ID: ${msgData.id}. Snippet: ${msgData.snippet || 'N/A'}`);
                continue; // Skip if no body text found
            }

            // ** Find all potential codes, filter, and sort **
            const matches = (body.match(CODE_REGEX) || [])
                .filter(code => !NOISE_FILTER_REGEX.test(code)); // Filter out noise

            if (matches.length > 0) {
                 // Sort by length descending, then potentially by position if lengths are equal (though match() order might suffice)
                 matches.sort((a, b) => b.length - a.length);
                 const longestMatch = matches[0]; // Pick the longest

                 console.log(`Message ${msgData.id}: Found codes [${matches.join(', ')}], Longest: ${longestMatch}, Timestamp: ${internalTimestamp}`); // Debugging

                 // If this message is newer OR same age but code is longer, update
                 if (internalTimestamp > newestTimestamp || (internalTimestamp === newestTimestamp && longestMatch.length > (newestCode?.length || 0))) {
                     newestCode = longestMatch;
                     newestTimestamp = internalTimestamp;
                     console.log(`Updating newest code: ${newestCode} (Timestamp: ${newestTimestamp})`); // Debugging
                 }
            } else {
                 // console.log(`Message ${msgData.id}: No codes matching regex found in body.`); // Debugging
            }
        }

        if (newestCode) {
            return { code: newestCode, timestamp: newestTimestamp };
        } else {
            console.log("Checked relevant messages, but no suitable code found.");
            return null;
        }

    } catch (error) {
        console.error("Error in findLatestCode:", error.message, error.stack);
        if (error.message.includes("Authentication failed")) {
            // Specific handling for auth errors propagated from fetchWithAuth
            await removeToken(); // Ensure cleanup
        }
        // Don't re-throw here, let the caller (background.js) handle the null return
        return null;
    }
}