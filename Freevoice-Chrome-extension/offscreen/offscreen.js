// Offscreen document for TTS processing
// This runs the TTS worker in a context that supports web workers

let ttsWorker = null;
let currentTabId = null;
let isModelLoaded = false;
let currentDevice = null;

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "OFFSCREEN_INIT":
      initializeWorker();
      break;

    case "OFFSCREEN_GET_STATUS":
      // Allow service worker to query model status
      sendResponse({
        isModelLoaded,
        device: currentDevice
      });
      return true;

    case "OFFSCREEN_GENERATE":
      currentTabId = message.tabId;
      console.log("[Offscreen] Generate request for tab", currentTabId, "text length:", message.text?.length);
      if (ttsWorker) {
        ttsWorker.postMessage({
          type: "generate",
          text: message.text,
          voice: message.voice
        });
      } else {
        console.error("[Offscreen] No worker available for generation");
      }
      break;

    case "OFFSCREEN_STOP":
      if (ttsWorker) {
        ttsWorker.postMessage({ type: "stop" });
      }
      break;
  }
});

function initializeWorker() {
  if (ttsWorker) {
    console.log("[Offscreen] Worker already exists, isModelLoaded:", isModelLoaded);
    // If model is already loaded, notify service worker immediately
    if (isModelLoaded) {
      chrome.runtime.sendMessage({
        source: "offscreen",
        type: "MODEL_READY",
        device: currentDevice
      });
    } else {
      // Worker exists but model not loaded - re-send init to worker
      ttsWorker.postMessage({ type: "init" });
    }
    return;
  }

  try {
    const workerUrl = chrome.runtime.getURL("lib/kokoro-worker.js");
    ttsWorker = new Worker(workerUrl, { type: "module" });

    ttsWorker.addEventListener("message", handleWorkerMessage);
    ttsWorker.addEventListener("error", (e) => {
      console.error("[Offscreen] Worker error:", e);
      chrome.runtime.sendMessage({
        source: "offscreen",
        type: "TTS_ERROR",
        error: e.message,
        tabId: currentTabId
      });
    });

    // Initialize the model
    ttsWorker.postMessage({ type: "init" });
    console.log("[Offscreen] Worker created and init sent");
  } catch (error) {
    console.error("[Offscreen] Failed to create worker:", error);
    chrome.runtime.sendMessage({
      source: "offscreen",
      type: "TTS_ERROR",
      error: error.message,
      tabId: currentTabId
    });
  }
}

function handleWorkerMessage(event) {
  const { status, progress, audio, text, device, error } = event.data;

  switch (status) {
    case "worker_ready":
      console.log("[Offscreen] Worker is ready");
      break;

    case "loading_model_start":
      currentDevice = device;
      chrome.runtime.sendMessage({
        source: "offscreen",
        type: "MODEL_LOADING",
        progress: 0,
        device
      });
      break;

    case "loading_model_progress":
      // Handle various progress formats from transformers.js
      let progressValue = 0;
      if (typeof progress === "number") {
        progressValue = progress;
      } else if (progress && typeof progress === "object") {
        // transformers.js sends { status: 'progress', progress: number, ... }
        if (typeof progress.progress === "number") {
          progressValue = progress.progress;
        } else if (typeof progress.loaded === "number" && typeof progress.total === "number" && progress.total > 0) {
          progressValue = (progress.loaded / progress.total) * 100;
        }
      }
      console.log("[Offscreen] Loading progress:", progressValue, "raw:", progress);
      chrome.runtime.sendMessage({
        source: "offscreen",
        type: "MODEL_LOADING",
        progress: progressValue,
        device
      });
      break;

    case "loading_model_ready":
      isModelLoaded = true;
      currentDevice = device;
      chrome.runtime.sendMessage({
        source: "offscreen",
        type: "MODEL_READY",
        device
      });
      break;

    case "stream_audio_data":
      if (audio) {
        console.log("[Offscreen] Received audio chunk, size:", audio.byteLength);
        // Convert ArrayBuffer to array for message passing
        const audioArray = Array.from(new Float32Array(audio));
        chrome.runtime.sendMessage({
          source: "offscreen",
          type: "AUDIO_CHUNK",
          audio: audioArray,
          text,
          tabId: currentTabId
        });

        // Notify worker that buffer was processed
        if (ttsWorker) {
          ttsWorker.postMessage({ type: "buffer_processed" });
        }
      }
      break;

    case "chunk_count":
      console.log("[Offscreen] Total chunks to process:", event.data.count);
      break;

    case "complete":
      chrome.runtime.sendMessage({
        source: "offscreen",
        type: "GENERATION_COMPLETE",
        tabId: currentTabId
      });
      break;

    case "error":
      chrome.runtime.sendMessage({
        source: "offscreen",
        type: "TTS_ERROR",
        error: error || "An unknown error occurred",
        tabId: currentTabId
      });
      break;
  }
}

console.log("[Offscreen] Document loaded");
