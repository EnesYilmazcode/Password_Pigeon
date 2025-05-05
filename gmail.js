import { ensureAuthToken, removeToken } from './auth.js';

// --- Constants ---
const GMAIL_API_URL = 'https://www.googleapis.com/gmail/v1/users/me/messages';
const MAX_MESSAGES_TO_CHECK = 5;

const CODE_PATTERNS = [
  /\b\d{6}\b/g,
  /\b[A-Z0-9]{6}\b/gi,
  /\b\d{4,8}\b/g,
  /\b[A-Z0-9]{4,8}\b/gi
];

const CONTEXTUAL_CODE_REGEX = /(?:code is|is:|code:|your code is|verification code)\s*:?[\s\n]*([A-Z0-9]{4,8})/gi;

const CODE_SOURCES = {
  senders: [
    'no-reply@', 'noreply@', 'account@', 'security@', 
    'google.com', 'microsoft.com', 'amazon.com', 'facebook.com',
    'twitter.com', 'apple.com', 'paypal.com', 'github.com'
  ],
  subjects: [
    'verification code', 'security code', 'login code',
    '2fa code', 'otp', 'one-time password', 'authentication code',
    'code', 'passcode', 'auth code', 'verification', '2-factor'
  ]
};

// --- Helper Functions ---

async function fetchWithAuth(url, token) {
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 401) {
      const newToken = await ensureAuthToken(false);
      if (!newToken) throw new Error('Authentication failed');
      return fetch(url, {
        headers: { 'Authorization': `Bearer ${newToken}` }
      });
    }
    return response;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

function stripHtmlTags(html) {
  return html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
             .replace(/<[^>]+>/g, ' ');
}

function extractTextFromPayload(payload) {
  if (!payload) return '';

  let extractedText = '';

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
  }

  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const raw = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    return stripHtmlTags(raw);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      extractedText += extractTextFromPayload(part) + '\n';
    }
  }

  if (!extractedText && payload.snippet) {
    extractedText = payload.snippet;
  }

  return extractedText;
}

function findBestCode(text) {
  if (!text) return null;

  const contextMatches = [...text.matchAll(CONTEXTUAL_CODE_REGEX)]
    .map(m => m[1])
    .filter(code => /\d/.test(code)); // Ensure at least one digit
  if (contextMatches.length > 0) {
    console.log("Contextual match found:", contextMatches[0]);
    return contextMatches[0];
  }

  const allMatches = [];
  for (const pattern of CODE_PATTERNS) {
    const matches = [...text.matchAll(pattern)];
    allMatches.push(...matches);
  }

  const uniqueMatches = [...new Set(allMatches.map(m => m[0]))]
    .filter(code => code.length >= 4 && !/^(19|20)\d{2}$/.test(code)) // Exclude years
    .filter(code => /\d/.test(code)) // Ensure at least one digit
    .sort((a, b) => b.length - a.length);

  for (const code of uniqueMatches) {
    const index = text.indexOf(code);
    const before = text.slice(0, index);
    const colonIndex = before.lastIndexOf(':');
    if (colonIndex !== -1 && index - colonIndex < 15) {
      return code;
    }
  }

  return uniqueMatches[0] || null;
}

// --- Main Function ---
export async function findLatestCode(token) {
  if (!token) throw new Error('Authentication required');

  try {
    const listUrl = `${GMAIL_API_URL}?maxResults=${MAX_MESSAGES_TO_CHECK}&labelIds=INBOX&q=is:unread OR newer_than:10m`;
    const response = await fetchWithAuth(listUrl, token);
    const { messages = [] } = await response.json();

    if (messages.length === 0) return null;

    for (const message of messages) {
      try {
        const detailUrl = `${GMAIL_API_URL}/${message.id}?format=full`;
        const detailRes = await fetchWithAuth(detailUrl, token);
        const messageData = await detailRes.json();

        const headers = messageData.payload.headers || [];
        const from = headers.find(h => h.name === 'From')?.value || '';
        const subject = headers.find(h => h.name === 'Subject')?.value || '';

        const isLikelyCode = CODE_SOURCES.senders.some(s => from.includes(s)) ||
                             CODE_SOURCES.subjects.some(s => subject.toLowerCase().includes(s));

        if (!isLikelyCode) continue;

        const text = extractTextFromPayload(messageData.payload);
        const code = findBestCode(text);

        if (code) {
          return {
            code,
            timestamp: parseInt(messageData.internalDate, 10),
            source: `${from} - ${subject}`
          };
        }

      } catch (error) {
        console.warn(`Error processing message ${message.id}:`, error);
      }
    }

    return null;

  } catch (error) {
    console.error('Error finding codes:', error);
    if (error.message.includes('Authentication')) {
      await removeToken();
    }
    return null;
  }
}