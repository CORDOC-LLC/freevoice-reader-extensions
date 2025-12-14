// FreeVoice Reader - Background Service Worker
// Handles context menus, keyboard shortcuts, and TTS worker management

let ttsWorker = null;
let isModelLoaded = false;
let currentDevice = null;
let loadProgress = 0;

// Voice definitions
const KOKORO_VOICES = {
  af_heart: { name: "Heart", language: "en-us", gender: "Female", quality: "A" },
  af_alloy: { name: "Alloy", language: "en-us", gender: "Female", quality: "C" },
  af_aoede: { name: "Aoede", language: "en-us", gender: "Female", quality: "C+" },
  af_bella: { name: "Bella", language: "en-us", gender: "Female", quality: "A-" },
  af_jessica: { name: "Jessica", language: "en-us", gender: "Female", quality: "D" },
  af_kore: { name: "Kore", language: "en-us", gender: "Female", quality: "C+" },
  af_nicole: { name: "Nicole", language: "en-us", gender: "Female", quality: "B-" },
  af_nova: { name: "Nova", language: "en-us", gender: "Female", quality: "C" },
  af_river: { name: "River", language: "en-us", gender: "Female", quality: "D" },
  af_sarah: { name: "Sarah", language: "en-us", gender: "Female", quality: "C+" },
  af_sky: { name: "Sky", language: "en-us", gender: "Female", quality: "C-" },
  am_adam: { name: "Adam", language: "en-us", gender: "Male", quality: "F+" },
  am_echo: { name: "Echo", language: "en-us", gender: "Male", quality: "D" },
  am_eric: { name: "Eric", language: "en-us", gender: "Male", quality: "D" },
  am_fenrir: { name: "Fenrir", language: "en-us", gender: "Male", quality: "C+" },
  am_liam: { name: "Liam", language: "en-us", gender: "Male", quality: "D" },
  am_michael: { name: "Michael", language: "en-us", gender: "Male", quality: "C+" },
  am_onyx: { name: "Onyx", language: "en-us", gender: "Male", quality: "D" },
  am_puck: { name: "Puck", language: "en-us", gender: "Male", quality: "C+" },
  am_santa: { name: "Santa", language: "en-us", gender: "Male", quality: "D-" },
  bf_emma: { name: "Emma", language: "en-gb", gender: "Female", quality: "B-" },
  bf_isabella: { name: "Isabella", language: "en-gb", gender: "Female", quality: "C" },
  bf_alice: { name: "Alice", language: "en-gb", gender: "Female", quality: "D" },
  bf_lily: { name: "Lily", language: "en-gb", gender: "Female", quality: "D" },
  bm_george: { name: "George", language: "en-gb", gender: "Male", quality: "C" },
  bm_lewis: { name: "Lewis", language: "en-gb", gender: "Male", quality: "D+" },
  bm_daniel: { name: "Daniel", language: "en-gb", gender: "Male", quality: "D" },
  bm_fable: { name: "Fable", language: "en-gb", gender: "Male", quality: "C" },
  ef_dora: { name: "Dora", language: "es", gender: "Female", quality: "C" },
  em_alex: { name: "Alex", language: "es", gender: "Male", quality: "C" },
  em_santa: { name: "Santa", language: "es", gender: "Male", quality: "D" },
  ff_siwis: { name: "Siwis", language: "fr", gender: "Female", quality: "B-" },
  hf_alpha: { name: "Alpha", language: "hi", gender: "Female", quality: "C" },
  hf_beta: { name: "Beta", language: "hi", gender: "Female", quality: "C" },
  hm_omega: { name: "Omega", language: "hi", gender: "Male", quality: "C" },
  hm_psi: { name: "Psi", language: "hi", gender: "Male", quality: "C" },
  if_sara: { name: "Sara", language: "it", gender: "Female", quality: "C" },
  im_nicola: { name: "Nicola", language: "it", gender: "Male", quality: "C" },
  pf_dora: { name: "Dora", language: "pt-br", gender: "Female", quality: "C" },
  pm_alex: { name: "Alex", language: "pt-br", gender: "Male", quality: "C" },
  pm_santa: { name: "Santa", language: "pt-br", gender: "Male", quality: "D" },
};

// Track active content script ports
const activePorts = new Map();

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "read-with-kokoro",
    title: "Read with FreeVoice",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "read-page-article",
    title: "Read entire article",
    contexts: ["page"]
  });

  console.log("[FreeVoiceReader] Extension installed, context menus created");
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("[FreeVoiceReader] Context menu clicked:", info.menuItemId, "tab:", tab?.id, "selection:", info.selectionText?.substring(0, 50));

  if (info.menuItemId === "read-with-kokoro" && info.selectionText) {
    console.log("[FreeVoiceReader] Sending READ_TEXT to tab", tab.id);
    sendToContentScript(tab.id, {
      type: "READ_TEXT",
      text: info.selectionText
    });
  } else if (info.menuItemId === "read-page-article") {
    console.log("[FreeVoiceReader] Sending READ_ARTICLE to tab", tab.id);
    sendToContentScript(tab.id, {
      type: "READ_ARTICLE"
    });
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "read-selection") {
    sendToContentScript(tab.id, {
      type: "READ_SELECTION"
    });
  }
});

// Send message to content script (with auto-injection fallback)
async function sendToContentScript(tabId, message) {
  if (!tabId) {
    console.log("[FreeVoiceReader] sendToContentScript: No tabId provided");
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      console.log("[FreeVoiceReader] sendToContentScript: Skipping invalid URL:", tab?.url);
      return;
    }

    console.log("[FreeVoiceReader] sendToContentScript: Sending", message.type, "to tab", tabId);

    try {
      await chrome.tabs.sendMessage(tabId, message);
      console.log("[FreeVoiceReader] sendToContentScript: Message sent successfully");
    } catch (err) {
      console.log("[FreeVoiceReader] sendToContentScript: Content script not found, injecting...");

      // Inject content script and CSS
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ["styles/player.css"]
      });

      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/content-script.js"]
      });

      console.log("[FreeVoiceReader] sendToContentScript: Content script injected, retrying message...");

      // Wait a moment for script to initialize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Retry sending message
      await chrome.tabs.sendMessage(tabId, message);
      console.log("[FreeVoiceReader] sendToContentScript: Message sent after injection");
    }
  } catch (err) {
    console.log("[FreeVoiceReader] sendToContentScript: Error:", err.message);
  }
}

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  console.log("[FreeVoiceReader] Received message:", message.type, "from tab:", tabId);

  switch (message.type) {
    case "GET_STATUS":
      sendResponse({
        isModelLoaded,
        device: currentDevice,
        loadProgress,
        voices: KOKORO_VOICES
      });
      return true;

    case "INIT_MODEL":
      initializeModel(tabId, sendResponse);
      return true;

    case "GENERATE_SPEECH":
      generateSpeech(message.text, message.voice, tabId);
      sendResponse({ success: true });
      return true;

    case "STOP_GENERATION":
      stopGeneration();
      sendResponse({ success: true });
      return true;

    case "GET_VOICES":
      sendResponse({ voices: KOKORO_VOICES });
      return true;

    case "GET_SETTINGS":
      chrome.storage.sync.get(['selectedVoice', 'playbackSpeed', 'volume'], (result) => {
        sendResponse(result);
      });
      return true;

    case "SAVE_SETTINGS":
      chrome.storage.sync.set(message.settings, () => {
        sendResponse({ success: true });
      });
      return true;

    case "OPEN_OPTIONS":
      chrome.runtime.openOptionsPage();
      sendResponse({ success: true });
      return true;
  }
});

// Initialize TTS model using offscreen document
async function initializeModel(tabId, sendResponse) {
  if (isModelLoaded) {
    sendResponse({ success: true, device: currentDevice });
    return;
  }

  try {
    // Create offscreen document for TTS worker
    await createOffscreenDocument();

    // Send init message to offscreen
    chrome.runtime.sendMessage({ type: "OFFSCREEN_INIT" });

    sendResponse({ success: true, loading: true });
  } catch (error) {
    console.error("[FreeVoiceReader] Failed to initialize model:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// Create offscreen document for TTS processing
async function createOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Run TTS model in web worker'
  });
}

// Generate speech
async function generateSpeech(text, voice, tabId) {
  console.log("[FreeVoiceReader] generateSpeech called, isModelLoaded:", isModelLoaded, "text length:", text?.length);

  // Auto-initialize model if not loaded
  if (!isModelLoaded) {
    console.log("[FreeVoiceReader] Model not loaded, auto-initializing...");
    try {
      await createOffscreenDocument();
      chrome.runtime.sendMessage({ type: "OFFSCREEN_INIT" });

      // Wait for model to load with polling
      let attempts = 0;
      while (!isModelLoaded && attempts < 120) { // Wait up to 2 minutes
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
        console.log("[FreeVoiceReader] Waiting for model... attempt", attempts, "isModelLoaded:", isModelLoaded);
      }

      if (!isModelLoaded) {
        sendToContentScript(tabId, {
          type: "TTS_ERROR",
          error: "Model loading timed out. Please try again."
        });
        return;
      }
    } catch (error) {
      console.error("[FreeVoiceReader] Failed to auto-initialize:", error);
      sendToContentScript(tabId, {
        type: "TTS_ERROR",
        error: "Failed to initialize model: " + error.message
      });
      return;
    }
  }

  console.log("[FreeVoiceReader] Sending OFFSCREEN_GENERATE for tab", tabId);

  // Send to offscreen document
  chrome.runtime.sendMessage({
    type: "OFFSCREEN_GENERATE",
    text,
    voice,
    tabId
  });
}

// Stop generation
function stopGeneration() {
  chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP" });
}

// Handle messages from offscreen document
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.source !== "offscreen") return;

  switch (message.type) {
    case "MODEL_LOADING":
      loadProgress = message.progress || 0;
      currentDevice = message.device;
      // Broadcast to all tabs
      broadcastToTabs({ type: "MODEL_LOADING", progress: loadProgress, device: currentDevice });
      break;

    case "MODEL_READY":
      isModelLoaded = true;
      currentDevice = message.device;
      loadProgress = 100;
      broadcastToTabs({ type: "MODEL_READY", device: currentDevice });
      break;

    case "AUDIO_CHUNK":
      // Forward to specific tab
      if (message.tabId) {
        sendToContentScript(message.tabId, {
          type: "AUDIO_CHUNK",
          audio: message.audio,
          text: message.text
        });
      }
      break;

    case "GENERATION_COMPLETE":
      if (message.tabId) {
        sendToContentScript(message.tabId, { type: "GENERATION_COMPLETE" });
      }
      break;

    case "TTS_ERROR":
      if (message.tabId) {
        sendToContentScript(message.tabId, { type: "TTS_ERROR", error: message.error });
      }
      break;
  }
});

// Broadcast message to all tabs
function broadcastToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        sendToContentScript(tab.id, message);
      }
    });
  });

  // Also notify popup if open
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup may not be open, that's fine
  });
}

console.log("[FreeVoiceReader] Background service worker loaded");
