// Configure transformers.js environment before loading
// This sets up paths to use local ONNX runtime files instead of CDN

import { env } from "./transformers.min.js";

// Disable remote models - we'll load from HuggingFace Hub for the model
// but use local ONNX runtime
env.allowRemoteModels = true;
env.allowLocalModels = false;

// Point to local ONNX runtime files
const extensionUrl = self.location?.origin || '';
const libPath = extensionUrl.includes('chrome-extension://')
  ? chrome.runtime.getURL('lib/')
  : './';

// Configure ONNX runtime paths to use local files
env.backends.onnx.wasm.wasmPaths = libPath;

// Disable remote host check for extension context
env.useBrowserCache = true;

console.log('[EnvConfig] Transformers.js configured with local ONNX runtime at:', libPath);

export { env };
