# Chrome Web Store Submission Guide

## Quick Start

Your extension ZIP is ready at:
```
/Users/kaustubh/Documents/Projects/free-voice-reader/FreeVoiceReader/freevoice-reader-extension.zip
```

To regenerate the ZIP:
```bash
cd /Users/kaustubh/Documents/Projects/free-voice-reader/FreeVoiceReader/kokoro-reader-extension
zip -r ../freevoice-reader-extension.zip . -x "*.DS_Store" -x "chrome_extension_submission.md"
```

---

## Step 1: Developer Account Setup

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with your Google account
3. Pay the one-time **$5 registration fee** (if not already registered)
4. Verify your email address

---

## Step 2: Store Listing Details

### Basic Information

| Field | Value |
|-------|-------|
| **Name** | FreeVoice Reader - AI Text to Speech |
| **Short Description** (132 chars max) | Convert any text to natural speech with 50+ AI voices. Runs 100% locally - your text stays completely private. |
| **Category** | Accessibility |
| **Language** | English |

### Full Description

```
Transform any webpage into an audiobook with FreeVoice Reader - the most private text-to-speech extension available.

KEY FEATURES

- 50+ Natural AI Voices - Choose from a diverse collection of male and female voices across 7 languages
- 100% Private - Everything runs locally on your device. Your text never leaves your browser.
- Works Offline - After initial setup, read text without an internet connection
- WebGPU Accelerated - Lightning-fast speech generation on supported devices
- Multiple Languages - English (US & UK), Spanish, French, Hindi, Italian, and Portuguese

HOW TO USE

1. Select any text on a webpage and click the extension icon - reading starts automatically
2. Or paste text directly into the extension popup
3. Use the floating player to pause, resume, or download audio
4. Customize voice, speed, and volume in Settings

PERFECT FOR

- Listening to articles while multitasking
- Proofreading your own writing
- Accessibility needs
- Language learning
- Reducing eye strain

PRIVACY FIRST

Unlike cloud-based TTS services, FreeVoice Reader uses on-device AI. Your text is never sent to any server. No accounts, no tracking, no data collection.

TECHNICAL DETAILS

- Uses the Kokoro TTS model (~80MB one-time download)
- Leverages WebGPU for GPU acceleration (falls back to CPU/WASM)
- Supports streaming playback while generating
- Export audio as WAV files

KEYBOARD SHORTCUTS

- Ctrl+Shift+K (Cmd+Shift+K on Mac): Read selected text

FREE & OPEN SOURCE

FreeVoice Reader is completely free with no ads, subscriptions, or hidden fees.

---

Questions or feedback? Visit our GitHub repository or leave a review!
```

---

## Step 3: Required Assets

### Icon
- **128x128 PNG** - Already included at `icons/icon128.png`

### Screenshots (Required: 1-5)
Dimensions: **1280x800** or **640x400** PNG/JPEG

Suggested screenshots:
1. **Main popup** - Show the voice selector and text input
2. **Floating player** - Show the player on a webpage with streaming status
3. **Onboarding** - Show the welcome/download screen
4. **Settings page** - Show voice and speed options
5. **Text selection** - Show selected text on a webpage with extension icon

### Promotional Images (Optional but Recommended)

| Type | Dimensions |
|------|------------|
| Small promo tile | 440x280 |
| Large promo tile | 920x680 |
| Marquee | 1400x560 |

---

## Step 4: Privacy Practices

### Single Purpose Description
```
This extension converts text on webpages to natural-sounding speech using on-device AI, enabling users to listen to any web content.
```

### Permission Justifications

| Permission | Justification |
|------------|---------------|
| **activeTab** | Required to read selected text from the current webpage when the user activates the extension |
| **contextMenus** | Enables right-click "Read with FreeVoice" option for selected text |
| **storage** | Saves user preferences (voice, speed, volume) locally |
| **offscreen** | Required to run the AI model in a background document for audio generation |
| **scripting** | Needed to detect text selection and inject the audio player into webpages |
| **host_permissions (all_urls)** | Required to inject the floating audio player and read text from any webpage |

### Data Usage Disclosure

Select the following in the privacy practices form:

- **Does not collect user data**
- **Does not sell data to third parties**
- **Does not use data for purposes unrelated to the extension's functionality**
- **Does not use data for creditworthiness or lending purposes**

### Privacy Policy (Optional but Recommended)

If you need a privacy policy URL, create a simple page stating:

```
FreeVoice Reader Privacy Policy

FreeVoice Reader does not collect, store, or transmit any user data.

- All text-to-speech processing happens locally on your device
- No text you read is ever sent to any server
- No analytics or tracking is used
- No account or sign-up is required
- User preferences are stored locally in your browser

This extension requires no internet connection after the initial model download.

Last updated: December 2024
```

---

## Step 5: Submit for Review

1. Click **"Submit for Review"** in the developer dashboard
2. Review typically takes **1-3 business days**
3. You'll receive an email when approved or if changes are needed

### Common Rejection Reasons to Avoid

- Missing or low-quality screenshots
- Description doesn't match functionality
- Requesting unnecessary permissions
- Missing privacy policy (for extensions requesting host permissions)

---

## Post-Launch Checklist

- [ ] Create screenshots (1280x800 or 640x400)
- [ ] Create promotional images (optional)
- [ ] Set up privacy policy page
- [ ] Submit to Chrome Web Store
- [ ] Monitor reviews and respond promptly
- [ ] Plan regular updates to maintain ranking

---

## Remote Code Declaration

**Question:** Are you using remote code?

**Answer:** Yes, I am using Remote code

**Justification:**
```
This extension downloads AI model files (ONNX weights) and voice data from Hugging Face (huggingface.co) at runtime. These are static binary data files required for the on-device text-to-speech functionality, not executable JavaScript. The model is from the open-source Kokoro TTS project (onnx-community/Kokoro-82M-v1.0-ONNX). All actual code execution happens locally using JavaScript/WASM bundled within the extension. The remote resources are:
1. ONNX model weights (~80MB) - Binary neural network weights
2. Voice embedding files - Binary audio synthesis parameters
These files are cached locally after first download for offline use.
```

---

## Useful Links

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Store Listing Requirements](https://developer.chrome.com/docs/webstore/publish/)
- [Extension Icon Generator](https://icon.kitchen) - Create store assets
