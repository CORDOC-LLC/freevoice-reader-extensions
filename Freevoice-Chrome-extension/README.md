# FreeVoice Reader Chrome Extension

High-quality AI Text-to-Speech that runs 100% locally in your browser using WebGPU.

## Features

- 50+ natural AI voices in 7 languages
- WebGPU accelerated for fast generation
- Falls back to WASM on unsupported systems
- 100% private - text never leaves your device
- No character limits
- Download audio as WAV

## Installation (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this `kokoro-reader-extension` folder
5. The extension icon should appear in your toolbar

## Usage

1. Click the extension icon to initialize the TTS model (~80MB download, cached after first time)
2. Select text on any webpage
3. Right-click and choose "Read with FreeVoice" or press Ctrl+Shift+K (Cmd+Shift+K on Mac)
4. The floating player will appear with playback controls

## Keyboard Shortcut

- **Ctrl+Shift+K** (Windows/Linux) / **Cmd+Shift+K** (Mac): Read selected text

## Supported Languages

- American English (19 voices)
- British English (8 voices)
- Spanish (3 voices)
- French (1 voice)
- Hindi (4 voices)
- Italian (2 voices)
- Portuguese Brazilian (3 voices)

## Technical Details

- Uses Kokoro TTS ONNX model (~80MB)
- WebGPU backend for GPU acceleration
- WASM fallback for systems without WebGPU
- Model is cached in IndexedDB after first download

## File Structure

```
kokoro-reader-extension/
├── manifest.json           # Extension configuration
├── background/
│   └── service-worker.js   # Background script
├── content/
│   └── content-script.js   # Page injection script
├── offscreen/
│   ├── offscreen.html      # Offscreen document for TTS worker
│   └── offscreen.js        # Offscreen script
├── popup/
│   ├── popup.html/css/js   # Extension popup UI
├── options/
│   ├── options.html/css/js # Settings page
├── lib/
│   ├── kokoro-worker.js    # TTS web worker
│   ├── kokoro.js           # TTS core library
│   ├── transformers.min.js # ML runtime
│   ├── phonemizer.min.js   # Text phonemization
│   ├── semantic-split.js   # Text chunking
│   └── voices.js           # Voice definitions
├── styles/
│   └── player.css          # Floating player styles
├── icons/
│   └── *.png               # Extension icons
└── _locales/
    └── en/messages.json    # i18n strings
```
