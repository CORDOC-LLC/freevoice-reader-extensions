// Kokoro TTS Web Worker - Adapted for Chrome Extension
// This worker handles the TTS model loading and audio generation

let KokoroTTS = null;
let splitTextSmart = null;
let tts = null;
let isModelLoaded = false;
let modulesLoaded = false;

// Track buffer queue for backpressure
let bufferQueueSize = 0;
const MAX_QUEUE_SIZE = 6;
let shouldStop = false;
let currentGenerationId = 0;  // Track which generation is active
let isGenerating = false;  // Track if we're currently generating

async function loadModules() {
  if (modulesLoaded) return true;

  try {
    // First, configure the transformers.js environment to use local ONNX files
    const transformersModule = await import("./transformers.min.js");
    if (transformersModule.env) {
      // Get the base URL for the extension
      const scriptUrl = self.location.href;
      const libPath = scriptUrl.substring(0, scriptUrl.lastIndexOf('/') + 1);

      // Configure ONNX runtime to use local files
      transformersModule.env.backends.onnx.wasm.wasmPaths = libPath;
      transformersModule.env.allowRemoteModels = true;
      transformersModule.env.useBrowserCache = true;

      console.log("[KokoroWorker] Configured ONNX WASM paths to:", libPath);
    }

    const kokoroModule = await import("./kokoro.js");
    KokoroTTS = kokoroModule.KokoroTTS;

    const splitModule = await import("./semantic-split.js");
    splitTextSmart = splitModule.splitTextSmart;

    modulesLoaded = true;
    return true;
  } catch (importError) {
    console.error("[KokoroWorker] Failed to load modules:", importError);
    self.postMessage({
      status: "error",
      error: `Failed to load TTS modules: ${importError.message}`
    });
    return false;
  }
}

// Detect if running on Android Chrome where WebGPU is unstable for Kokoro TTS
function isAndroidChrome() {
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isChrome = /Chrome/i.test(ua) && !/Edge|Edg|OPR|Opera/i.test(ua);
  return isAndroid && isChrome;
}

async function detectWebGPU() {
  try {
    // Force WASM on Android Chrome due to WebGPU instability causing crashes/corrupted audio
    if (isAndroidChrome()) {
      console.log("[KokoroWorker] Android Chrome detected - forcing WASM backend for stability");
      return false;
    }

    if (!navigator.gpu) {
      console.log("[KokoroWorker] WebGPU not available (navigator.gpu is undefined)");
      return false;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (adapter) {
      console.log("[KokoroWorker] WebGPU adapter available");
      return true;
    } else {
      console.log("[KokoroWorker] WebGPU adapter request failed");
      return false;
    }
  } catch (e) {
    console.log("[KokoroWorker] WebGPU detection error:", e.message);
    return false;
  }
}

async function initializeModel() {
  if (isModelLoaded) return true;

  // First load the modules
  const modulesOk = await loadModules();
  if (!modulesOk) return false;

  const hasWebGPU = await detectWebGPU();
  const device = hasWebGPU ? "webgpu" : "wasm";
  console.log(`[KokoroWorker] Using ${device.toUpperCase()} backend (WebGPU available: ${hasWebGPU})`);
  self.postMessage({ status: "loading_model_start", device });

  const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX";

  try {
    tts = await KokoroTTS.from_pretrained(model_id, {
      dtype: device === "wasm" ? "q8" : "fp32",
      device,
      progress_callback: (progress) => {
        self.postMessage({ status: "loading_model_progress", progress });
      }
    });

    isModelLoaded = true;
    self.postMessage({ status: "loading_model_ready", voices: tts.voices, device });
    return true;
  } catch (e) {
    self.postMessage({ status: "error", error: e?.message || "Failed to load model" });
    return false;
  }
}

self.addEventListener("message", async (e) => {
  const { type, text, voice } = e.data;

  // Handle init request
  if (type === "init") {
    try {
      await initializeModel();
    } catch (err) {
      self.postMessage({ status: "error", error: err?.message || "Initialization failed" });
    }
    return;
  }

  // Handle stop command
  if (type === "stop") {
    console.log("[KokoroWorker] Stop command received, isGenerating:", isGenerating);
    bufferQueueSize = 0;
    shouldStop = true;
    // Increment generation ID to invalidate any in-progress generation
    currentGenerationId++;
    return;
  }

  // Handle buffer processed notification (for backpressure)
  if (type === "buffer_processed") {
    bufferQueueSize = Math.max(0, bufferQueueSize - 1);
    return;
  }

  // Handle generate request
  if (type === "generate" && text) {
    console.log("[KokoroWorker] Generate request received, text length:", text.length, "isGenerating:", isGenerating);

    // If already generating, stop the current one first
    if (isGenerating) {
      console.log("[KokoroWorker] Already generating, stopping current generation first");
      shouldStop = true;
      currentGenerationId++;
      // Wait a bit for the current generation to stop
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Ensure model is loaded
    if (!isModelLoaded) {
      console.log("[KokoroWorker] Model not loaded, initializing...");
      const initOk = await initializeModel();
      if (!initOk) return;
    }

    // Capture the generation ID for this request
    currentGenerationId++;
    const myGenerationId = currentGenerationId;
    shouldStop = false;
    isGenerating = true;

    let chunks = splitTextSmart(text, 300);
    console.log("[KokoroWorker] Split into", chunks.length, "chunks (before filtering), generationId:", myGenerationId);

    // Filter out chunks that are likely to cause errors (code, stack traces, etc.)
    chunks = chunks.filter(chunk => {
      // Skip very short chunks
      if (chunk.trim().length < 3) return false;
      // Skip chunks that look like code/stack traces
      if (/^\s*(at |@|import |export |const |let |var |function |class |=>|{|}|\[|\]|;$)/.test(chunk)) return false;
      // Skip chunks with too many special characters (likely code)
      const specialCharRatio = (chunk.match(/[{}()\[\];:@#$%^&*<>=/\\|`~]/g) || []).length / chunk.length;
      if (specialCharRatio > 0.15) return false;
      // Skip chunks that are mostly numbers/symbols (but allow non-Latin scripts)
      // Match letters from any script (Latin, Devanagari, Arabic, CJK, etc.)
      const letterMatches = chunk.match(/[\p{L}]/gu) || [];
      const letterRatio = letterMatches.length / chunk.length;
      if (letterRatio < 0.3) return false;
      return true;
    });

    console.log("[KokoroWorker] After filtering:", chunks.length, "chunks to process");
    self.postMessage({ status: "chunk_count", count: chunks.length });

    let chunkIndex = 0;
    for (const chunk of chunks) {
      chunkIndex++;

      // Check if this generation was cancelled
      if (shouldStop || myGenerationId !== currentGenerationId) {
        console.log("[KokoroWorker] Generation cancelled, myId:", myGenerationId, "currentId:", currentGenerationId);
        break;
      }

      // Backpressure: wait if buffer queue is full
      while (bufferQueueSize >= MAX_QUEUE_SIZE && !shouldStop && myGenerationId === currentGenerationId) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Check again after waiting
      if (shouldStop || myGenerationId !== currentGenerationId) {
        console.log("[KokoroWorker] Generation cancelled after backpressure wait");
        break;
      }

      try {
        console.log(`[KokoroWorker] Generating chunk ${chunkIndex}/${chunks.length}: "${chunk.substring(0, 50)}..."`);
        const startTime = Date.now();
        const audio = await tts.generate(chunk, { voice: voice || "af_heart" });
        const elapsed = Date.now() - startTime;

        // Check if still valid after generation (which can take a while)
        if (shouldStop || myGenerationId !== currentGenerationId) {
          console.log("[KokoroWorker] Generation cancelled after tts.generate");
          break;
        }

        console.log(`[KokoroWorker] Chunk ${chunkIndex} generated in ${elapsed}ms, audio length: ${audio.audio.length}`);

        let ab = audio.audio.buffer;

        bufferQueueSize++;
        self.postMessage({ status: "stream_audio_data", audio: ab, text: chunk }, [ab]);
      } catch (err) {
        console.error(`[KokoroWorker] Chunk ${chunkIndex} failed:`, err.message);
        // If this generation was cancelled, don't continue
        if (shouldStop || myGenerationId !== currentGenerationId) {
          break;
        }
        // Skip individual chunk failures for other errors
      }
    }

    // Only send complete if this is still the active generation
    if (myGenerationId === currentGenerationId) {
      isGenerating = false;
      if (!shouldStop) {
        self.postMessage({ status: "complete" });
      }
    }
  }
});

// Signal that worker is ready to receive messages
self.postMessage({ status: "worker_ready" });
