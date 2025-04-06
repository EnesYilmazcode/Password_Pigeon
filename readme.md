# 🕊️ Password Pigeon (WIP)

A Chrome extension that automatically monitors your Gmail inbox for security codes and 2FA messages, then shows them instantly in the popup UI.

> ⚠️ **This project is still in progress. Features and code may change frequently.**

## ✨ Features
- Detects recent verification/2FA codes in Gmail.
- Shows codes directly in the extension popup.
- Displays a red `NEW` badge when a new code is detected.
- Sends a desktop notification for new codes.
- Silent re-authentication with Google (no constant sign-ins!).
- Auto-clears badge after viewing the popup.

## 🔧 Setup
1. Clone this repository:
   ```bash
   git clone https://github.com/enesyilmazcode/password_pigeon.git
   ```

2. Open Chrome and navigate to `chrome://extensions`.

3. Enable **Developer mode**.

4. Click **Load unpacked** and select the project folder.

5. Click the extension icon → Sign in with Google → You're good to go!