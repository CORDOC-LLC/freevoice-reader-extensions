# FreeVoice Reader - Firefox Extension

Convert any text on the web to natural speech. 50+ voices, 7 languages. Runs 100% locally - your text stays private.

## Features

- **50+ AI Voices**: Natural-sounding voices across 7 languages
- **100% Private**: All processing happens locally on your device
- **Streaming & Full Audio Modes**: Listen as audio generates or wait for full audio with speed control
- **Keyboard Shortcut**: Cmd+Shift+K (Mac) / Ctrl+Shift+K (Windows/Linux)
- **Context Menu**: Right-click to read selected text or entire article
- **Download Audio**: Save generated speech as WAV files

## Installation

### Temporary Installation (Development)

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on..."
4. Navigate to this folder and select the `manifest.json` file
5. The extension will be installed temporarily (until Firefox restarts)

### Permanent Installation

1. Package the extension as an XPI file (ZIP with .xpi extension)
2. Sign the extension through [Firefox Add-ons](https://addons.mozilla.org/)
3. Install the signed XPI

## Usage

1. **First Time Setup**: Click the extension icon and download the AI model (~87MB, one-time)
2. **Read Selected Text**:
   - Select text on any webpage
   - Click the extension icon, or
   - Use keyboard shortcut Cmd/Ctrl+Shift+K, or
   - Right-click and select "Read with FreeVoice"
3. **Read Entire Article**: Right-click on any page and select "Read entire article"
4. **Paste Text**: Click the extension icon and paste text directly

## Supported Languages

- American English (20 voices)
- British English (8 voices)
- Spanish (3 voices)
- French (1 voice)
- Hindi (4 voices)
- Italian (2 voices)
- Portuguese (Brazilian) (3 voices)

## Technical Notes

### Firefox-Specific Adaptations

This extension is adapted from the Chrome version with the following changes:

- Uses `browser.*` APIs instead of `chrome.*` APIs
- Uses a background page with direct worker support instead of Chrome's offscreen document API
- Uses `browser.menus` instead of `browser.contextMenus`
- Uses `options_ui` instead of `options_page` in manifest
- Includes `browser_specific_settings` with gecko ID for Firefox Add-ons

### Requirements

- Firefox 109.0 or later
- WebGPU support recommended for faster processing (falls back to CPU)

## Privacy

- All text-to-speech processing happens locally in your browser
- No data is sent to external servers
- The AI model is downloaded once and cached locally

## License

See the main project license file.
