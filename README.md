# FreeVoice Reader - Browser Extensions

Open-source AI-powered text-to-speech browser extensions. Convert any text on the web to natural speech with 50+ voices across 7 languages. Runs 100% locally - your text stays private.

## Extensions

| Browser | Folder | Status |
|---------|--------|--------|
| Chrome | `Freevoice-Chrome-extension/` | Ready |
| Firefox | `Freevoice-Firefox-Extension/` | Ready |

## Features

- **50+ AI Voices**: Natural-sounding voices powered by Kokoro TTS
- **7 Languages**: English (US/UK), Spanish, French, Hindi, Italian, Portuguese
- **100% Private**: All processing happens locally on your device
- **Streaming Mode**: Listen as audio generates in real-time
- **Full Audio Mode**: Wait for complete audio with speed control (0.5x - 2x)
- **Context Menu**: Right-click to read selected text or entire article
- **Keyboard Shortcuts**: Cmd/Ctrl+Shift+K to read selection
- **Download Audio**: Save generated speech as WAV files

## Installation

### Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `Freevoice-Chrome-extension` folder

### Firefox

1. Open Firefox and go to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on..."
4. Select `Freevoice-Firefox-Extension/manifest.json`

## Building Your Own Extension

This project is open-source to help developers build their own TTS extensions. Here's the architecture:

### Core Components

```
extension/
├── manifest.json          # Extension configuration
├── background/            # Background scripts (handles TTS worker)
├── content/               # Content script (floating player UI)
├── popup/                 # Extension popup UI
├── options/               # Settings page
├── lib/                   # TTS libraries (Kokoro, ONNX Runtime)
│   ├── kokoro-worker.js   # Web Worker for TTS processing
│   ├── kokoro.js          # Main TTS library
│   ├── transformers.min.js # ONNX Runtime
│   └── ...
├── styles/                # CSS for floating player
└── icons/                 # Extension icons
```

### Key Differences Between Chrome & Firefox

| Feature | Chrome | Firefox |
|---------|--------|---------|
| API Namespace | `chrome.*` | `browser.*` |
| Background | Service Worker | Background Page |
| Worker Support | Offscreen Document | Direct in Background |
| Context Menus | `chrome.contextMenus` | `browser.menus` |
| Options | `options_page` | `options_ui` |

### TTS Engine

The extensions use [Kokoro TTS](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) - an 82M parameter model that runs entirely in the browser via ONNX Runtime WebAssembly.

## Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Add support for new browsers (Safari, Edge)

## License

MIT License - Feel free to use this code for your own projects.

## Links

- Website: [freevoicereader.com](https://freevoicereader.com)
- Kokoro TTS Model: [HuggingFace](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
