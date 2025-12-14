// FreeVoice Reader - Content Script
// Handles text selection, floating player, and audio playback

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__freeVoiceReaderInjected) return;
  window.__freeVoiceReaderInjected = true;

  const SAMPLE_RATE = 24000;

  // State
  let player = null;
  let audioContext = null;
  let audioQueue = [];
  let isPlaying = false;
  let isPaused = false;
  let currentSource = null;
  let allAudioChunks = [];
  let selectedVoice = 'af_heart';
  let volume = 1;
  let playbackSpeed = 1;
  let playerPosition = 'bottom-right';
  let audioElement = null;  // HTMLAudioElement for full audio playback with speed control
  let audioBlobUrl = null;  // Blob URL for the audio element
  let playbackMode = 'streaming';  // 'streaming' or 'full'
  let currentSessionMode = 'streaming';  // Mode for the current playback session (can be changed per session)
  let isModelLoaded = false;
  let isLoading = false;
  let loadProgress = 0;
  let currentDevice = null;
  let isGenerating = false;
  let generationComplete = false;
  let chunksGenerated = 0;
  let playbackStartTime = 0;
  let totalPlaybackTime = 0;
  let playbackTimeInterval = null;
  let currentGeneratingText = null;  // Track the text being generated for restart

  // Load saved settings
  chrome.storage.sync.get(['selectedVoice', 'volume', 'playbackSpeed', 'playerPosition', 'playbackMode'], (result) => {
    if (result.selectedVoice) selectedVoice = result.selectedVoice;
    if (result.volume) volume = parseFloat(result.volume) || 1;
    if (result.playbackSpeed) playbackSpeed = parseFloat(result.playbackSpeed) || 1;
    if (result.playerPosition) playerPosition = result.playerPosition;
    if (result.playbackMode) playbackMode = result.playbackMode;
  });

  // Get initial status
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (response) {
      isModelLoaded = response.isModelLoaded;
      currentDevice = response.device;
      loadProgress = response.loadProgress || 0;
    }
  });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[FreeVoiceReader] Content script received message:", message.type);

    switch (message.type) {
      case "READ_TEXT":
        console.log("[FreeVoiceReader] READ_TEXT received, text length:", message.text?.length);
        showPlayer();
        startGeneration(message.text);
        break;

      case "READ_SELECTION":
        const selection = window.getSelection().toString().trim();
        if (selection) {
          showPlayer();
          startGeneration(selection);
        } else {
          showNotification("Please select some text first");
        }
        break;

      case "READ_ARTICLE":
        const articleText = extractArticleText();
        if (articleText) {
          showPlayer();
          startGeneration(articleText);
        } else {
          showNotification("Could not extract article text");
        }
        break;

      case "MODEL_LOADING":
        isLoading = true;
        loadProgress = message.progress || 0;
        currentDevice = message.device;
        updatePlayerStatus();
        break;

      case "MODEL_READY":
        isModelLoaded = true;
        isLoading = false;
        loadProgress = 100;
        currentDevice = message.device;
        updatePlayerStatus();
        break;

      case "AUDIO_CHUNK":
        if (message.audio) {
          handleAudioChunk(message.audio, message.text);
        }
        break;

      case "GENERATION_COMPLETE":
        handleGenerationComplete();
        break;

      case "TTS_ERROR":
        handleError(message.error);
        break;
    }
  });

  // Extract article text from the page
  function extractArticleText() {
    const selectors = [
      'article',
      '[role="article"]',
      '.article-body',
      '.post-content',
      '.entry-content',
      '.story-body',
      'main p'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element.innerText.trim();
      }
    }

    const paragraphs = document.querySelectorAll('p');
    let text = '';
    paragraphs.forEach(p => {
      const pText = p.innerText.trim();
      if (pText.length > 50) {
        text += pText + '\n\n';
      }
    });

    return text.trim() || null;
  }

  // Apply player position from settings
  function applyPlayerPosition() {
    if (!player) return;

    // Reset all position properties
    player.style.top = 'auto';
    player.style.bottom = 'auto';
    player.style.left = 'auto';
    player.style.right = 'auto';

    switch (playerPosition) {
      case 'top-left':
        player.style.top = '20px';
        player.style.left = '20px';
        break;
      case 'top-right':
        player.style.top = '20px';
        player.style.right = '20px';
        break;
      case 'bottom-left':
        player.style.bottom = '20px';
        player.style.left = '20px';
        break;
      case 'bottom-right':
      default:
        player.style.bottom = '20px';
        player.style.right = '20px';
        break;
    }
  }

  // Create and show the floating player
  function showPlayer() {
    if (player) {
      player.style.display = 'flex';
      return;
    }

    // Initialize session mode from default setting
    currentSessionMode = playbackMode;

    player = document.createElement('div');
    player.id = 'freevoice-reader-player';
    player.innerHTML = createPlayerHTML();
    document.body.appendChild(player);

    // Apply position from settings
    applyPlayerPosition();

    setupPlayerEvents();
    updateModeToggleUI();
    updatePlayerStatus();
    makeDraggable(player, player.querySelector('.kokoro-player-header'));
  }

  // Create simplified player HTML
  function createPlayerHTML() {
    return `
      <div class="kokoro-player-container">
        <div class="kokoro-player-header">
          <div class="kokoro-player-title">
            <svg class="kokoro-icon" viewBox="0 0 24 24" fill="none" stroke="#EAB308" stroke-width="2">
              <path d="m3 11 18-5v12L3 14v-3z"/>
              <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
              <path d="M21 15s-2.2 2-4.5 2"/>
            </svg>
            <span>FreeVoice Reader</span>
            <span class="kokoro-device-badge" id="kokoro-device-badge"></span>
          </div>
          <div class="kokoro-player-actions">
            <button class="kokoro-btn-icon" id="kokoro-minimize" title="Minimize">
              <svg viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <button class="kokoro-btn-icon" id="kokoro-close" title="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="kokoro-player-body" id="kokoro-player-body">
          <div class="kokoro-status" id="kokoro-status">
            <div class="kokoro-status-row">
              <div class="kokoro-status-indicator">
                <span class="kokoro-status-dot" id="kokoro-status-dot"></span>
                <span class="kokoro-status-text" id="kokoro-status-text">Ready</span>
              </div>
              <span class="kokoro-playback-time" id="kokoro-playback-time">0:00</span>
            </div>
            <div class="kokoro-progress-container" id="kokoro-progress-container" style="display: none;">
              <div class="kokoro-progress-bar" id="kokoro-progress-bar"></div>
            </div>
            <div class="kokoro-generation-info" id="kokoro-generation-info" style="display: none;">
              <span id="kokoro-chunks-info">Generating...</span>
            </div>
          </div>

          <!-- Playback Mode Toggle -->
          <div class="kokoro-mode-toggle" id="kokoro-mode-toggle">
            <button class="kokoro-mode-btn ${currentSessionMode === 'streaming' ? 'active' : ''}" id="kokoro-mode-streaming" title="Play audio as it's generated">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
              </svg>
              Stream
            </button>
            <button class="kokoro-mode-btn ${currentSessionMode === 'full' ? 'active' : ''}" id="kokoro-mode-full" title="Wait for full audio before playing">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 8l6 4-6 4V8z"/>
              </svg>
              Full Audio
            </button>
          </div>

          <div class="kokoro-controls">
            <button class="kokoro-btn kokoro-btn-primary kokoro-btn-large" id="kokoro-play-pause">
              <span id="kokoro-play-icon" style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" style="fill: #1a1a2e;">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </span>
              <span id="kokoro-pause-icon" style="display: none; align-items: center; justify-content: center; width: 28px; height: 28px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" style="fill: #1a1a2e;">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              </span>
            </button>
            <button class="kokoro-btn kokoro-btn-stop" id="kokoro-stop" style="display: none;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="fill: currentColor;">
                <rect x="6" y="6" width="12" height="12" rx="1"/>
              </svg>
              Stop
            </button>
          </div>

          <!-- Speed Control (only visible in full audio mode when generation is complete) -->
          <div class="kokoro-speed-control" id="kokoro-speed-control" style="display: none;">
            <label class="kokoro-speed-label">Speed:</label>
            <select class="kokoro-speed-select" id="kokoro-speed-select">
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1" selected>1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
          </div>

          <div class="kokoro-settings-row">
            <button class="kokoro-btn kokoro-btn-secondary" id="kokoro-download" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download Audio
            </button>
            <button class="kokoro-btn kokoro-btn-secondary" id="kokoro-settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Settings
            </button>
          </div>

          <a href="https://freevoicereader.com" target="_blank" class="kokoro-website-link">freevoicereader.com</a>
        </div>
      </div>
    `;
  }

  // Setup player event listeners
  function setupPlayerEvents() {
    const closeBtn = document.getElementById('kokoro-close');
    const minimizeBtn = document.getElementById('kokoro-minimize');
    const playPauseBtn = document.getElementById('kokoro-play-pause');
    const stopBtn = document.getElementById('kokoro-stop');
    const downloadBtn = document.getElementById('kokoro-download');
    const settingsBtn = document.getElementById('kokoro-settings');
    const playerBody = document.getElementById('kokoro-player-body');
    const modeStreamingBtn = document.getElementById('kokoro-mode-streaming');
    const modeFullBtn = document.getElementById('kokoro-mode-full');

    closeBtn.addEventListener('click', () => {
      handleStop();
      player.style.display = 'none';
    });

    minimizeBtn.addEventListener('click', () => {
      playerBody.style.display = playerBody.style.display === 'none' ? 'flex' : 'none';
      player.classList.toggle('kokoro-minimized');
    });

    playPauseBtn.addEventListener('click', handlePlayPause);

    stopBtn.addEventListener('click', handleStop);

    downloadBtn.addEventListener('click', downloadAudio);

    settingsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
    });

    // Mode toggle buttons
    modeStreamingBtn.addEventListener('click', () => {
      if (currentSessionMode === 'streaming') return; // Already in this mode
      switchPlaybackMode('streaming');
    });

    modeFullBtn.addEventListener('click', () => {
      if (currentSessionMode === 'full') return; // Already in this mode
      switchPlaybackMode('full');
    });

    // Speed control (only works in full audio mode with HTMLAudioElement)
    const speedSelect = document.getElementById('kokoro-speed-select');
    if (speedSelect) {
      speedSelect.value = playbackSpeed.toString();
      speedSelect.addEventListener('change', (e) => {
        playbackSpeed = parseFloat(e.target.value);
        // Apply speed to audio element if it exists (preservesPitch prevents helium audio)
        if (audioElement) {
          audioElement.preservesPitch = true;
          audioElement.playbackRate = playbackSpeed;
        }
        // Save to storage
        chrome.storage.sync.set({ playbackSpeed: playbackSpeed });
      });
    }
  }

  // Update mode toggle button UI
  function updateModeToggleUI() {
    const modeStreamingBtn = document.getElementById('kokoro-mode-streaming');
    const modeFullBtn = document.getElementById('kokoro-mode-full');

    if (modeStreamingBtn && modeFullBtn) {
      modeStreamingBtn.classList.toggle('active', currentSessionMode === 'streaming');
      modeFullBtn.classList.toggle('active', currentSessionMode === 'full');
    }

    // Mode toggle is always enabled - switching mid-generation will restart
  }

  // Switch playback mode (and restart generation if in progress)
  function switchPlaybackMode(newMode) {
    console.log("[FreeVoiceReader] Switching mode from", currentSessionMode, "to", newMode, "isGenerating:", isGenerating);

    // Capture state before stopping
    const wasGenerating = isGenerating;
    const wasPlaying = isPlaying;
    const textToRegenerate = currentGeneratingText;

    // Stop everything first
    if (wasGenerating || wasPlaying) {
      // Stop playback
      stopPlayback();
      // Stop generation in backend
      chrome.runtime.sendMessage({ type: "STOP_GENERATION" });
      // Reset state
      isGenerating = false;
      generationComplete = false;
      chunksGenerated = 0;
      audioQueue = [];
      allAudioChunks = [];
    }

    // Clean up audio element when switching modes
    cleanupAudioElement();

    // Switch mode
    currentSessionMode = newMode;
    updateModeToggleUI();
    updatePlayerUI();

    // Restart generation with new mode if we were generating
    if (wasGenerating && textToRegenerate) {
      console.log("[FreeVoiceReader] Restarting generation with new mode:", newMode);
      // Give the worker more time to properly stop the current generation
      setTimeout(() => {
        startGeneration(textToRegenerate);
      }, 500);
    }
  }

  // Handle play/pause button click
  function handlePlayPause() {
    // In streaming mode during generation, play/pause is disabled (only stop works)
    if (currentSessionMode === 'streaming' && isGenerating) {
      return; // In streaming mode, only stop is available during generation
    }

    // Full audio mode with audio element (after generation complete)
    if (currentSessionMode === 'full' && generationComplete && audioElement) {
      if (isPlaying && !isPaused) {
        // Pause the audio element
        pauseAudioElement();
      } else if (isPaused) {
        // Resume the audio element
        playWithAudioElement();
      } else {
        // Start playing from beginning or current position
        if (audioElement.ended) {
          audioElement.currentTime = 0;
        }
        playWithAudioElement();
      }
      return;
    }

    // Streaming mode or full mode during generation (uses AudioBufferSourceNode)
    if (isPlaying && !isPaused) {
      // Pause - stop current source and suspend context
      // Pause is only fully effective in 'full' mode after generation complete
      if (currentSessionMode === 'streaming' && isGenerating) {
        return; // Can't pause while streaming
      }
      isPaused = true;
      stopPlaybackTimer();
      if (currentSource) {
        try {
          currentSource.stop();
        } catch (e) {}
        currentSource = null;
      }
      updatePlayerUI();
    } else if (isPaused) {
      // Resume - restart playback from queue
      isPaused = false;
      startPlaybackTimer();
      playAudioQueue();
    } else if (audioQueue.length > 0 || allAudioChunks.length > 0) {
      // Start playing from queue or replay
      if (audioQueue.length === 0 && allAudioChunks.length > 0) {
        // Replay - rebuild queue from all chunks
        rebuildAudioQueue();
        totalPlaybackTime = 0;
      }
      playAudioQueue();
    }
  }

  // Handle stop button click
  function handleStop() {
    stopPlayback();
    chrome.runtime.sendMessage({ type: "STOP_GENERATION" });
    isGenerating = false;
    generationComplete = false;
    chunksGenerated = 0;
    updatePlayerUI();
  }

  // Start playback time tracking
  function startPlaybackTimer() {
    if (playbackTimeInterval) return;
    playbackStartTime = Date.now();
    playbackTimeInterval = setInterval(() => {
      if (isPlaying && !isPaused) {
        const elapsed = (Date.now() - playbackStartTime) / 1000;
        updatePlaybackTimeDisplay(totalPlaybackTime + elapsed);
      }
    }, 100);
  }

  // Stop playback time tracking
  function stopPlaybackTimer() {
    if (playbackTimeInterval) {
      const elapsed = (Date.now() - playbackStartTime) / 1000;
      totalPlaybackTime += elapsed;
      clearInterval(playbackTimeInterval);
      playbackTimeInterval = null;
    }
  }

  // Update playback time display
  function updatePlaybackTimeDisplay(seconds) {
    const timeEl = document.getElementById('kokoro-playback-time');
    if (timeEl) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      timeEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    }
  }

  // Rebuild audio queue from all chunks (for replay)
  function rebuildAudioQueue() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    audioQueue = [];
    for (const chunk of allAudioChunks) {
      const buffer = audioContext.createBuffer(1, chunk.length, SAMPLE_RATE);
      buffer.getChannelData(0).set(chunk);
      audioQueue.push({ buffer, text: '' });
    }
  }

  // Update entire player UI (status, buttons, progress)
  function updatePlayerUI() {
    if (!player) return;

    const statusText = document.getElementById('kokoro-status-text');
    const statusDot = document.getElementById('kokoro-status-dot');
    const progressContainer = document.getElementById('kokoro-progress-container');
    const progressBar = document.getElementById('kokoro-progress-bar');
    const generationInfo = document.getElementById('kokoro-generation-info');
    const chunksInfo = document.getElementById('kokoro-chunks-info');
    const deviceBadge = document.getElementById('kokoro-device-badge');
    const stopBtn = document.getElementById('kokoro-stop');
    const playPauseBtn = document.getElementById('kokoro-play-pause');
    const playIcon = document.getElementById('kokoro-play-icon');
    const pauseIcon = document.getElementById('kokoro-pause-icon');
    const speedControl = document.getElementById('kokoro-speed-control');

    // Determine if play/pause should be visible/enabled based on mode
    const canPause = currentSessionMode === 'full' || generationComplete;

    // Update play/pause button visibility and state
    if (playPauseBtn) {
      // In streaming mode during generation, hide play/pause entirely (only stop works)
      if (currentSessionMode === 'streaming' && isGenerating) {
        playPauseBtn.style.display = 'none';
      } else {
        playPauseBtn.style.display = 'flex';
      }
    }

    // Update play/pause icons
    if (playIcon && pauseIcon) {
      if (isPlaying && !isPaused) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = canPause ? 'flex' : 'none';
        // If we can't pause, show play icon but disabled
        if (!canPause) {
          playIcon.style.display = 'flex';
          playIcon.style.opacity = '0.5';
        }
      } else {
        playIcon.style.display = 'flex';
        playIcon.style.opacity = '1';
        pauseIcon.style.display = 'none';
      }
    }

    // Show/hide stop button
    // In streaming mode: show during generation/playback
    // In full mode: show during generation
    if (stopBtn) {
      const showStop = isGenerating || (currentSessionMode === 'streaming' && isPlaying);
      stopBtn.style.display = showStop ? 'flex' : 'none';
    }

    // Show/hide speed control
    // Only show in 'full' mode when generation is complete (uses HTMLAudioElement with preservesPitch)
    if (speedControl) {
      const showSpeed = currentSessionMode === 'full' && generationComplete;
      speedControl.style.display = showSpeed ? 'flex' : 'none';
    }

    // Update device badge
    if (currentDevice && deviceBadge) {
      deviceBadge.textContent = currentDevice === 'webgpu' ? 'GPU' : 'CPU';
      deviceBadge.style.display = 'inline-block';
    }

    if (!statusText || !statusDot) return;

    // Update status based on current state
    if (isLoading) {
      statusDot.className = 'kokoro-status-dot loading';
      statusText.textContent = `Downloading... ${Math.round(loadProgress)}% (one-time)`;
      if (progressContainer) {
        progressContainer.style.display = 'block';
        progressBar.style.width = `${loadProgress}%`;
      }
      if (generationInfo) generationInfo.style.display = 'none';
    } else if (isGenerating && !isPlaying) {
      statusDot.className = 'kokoro-status-dot generating';
      // Different status text based on mode
      if (currentSessionMode === 'full') {
        statusText.textContent = 'Generating audio...';
      } else {
        statusText.textContent = 'Generating...';
      }
      if (progressContainer) progressContainer.style.display = 'none';
      if (generationInfo) {
        generationInfo.style.display = 'block';
        chunksInfo.textContent = currentSessionMode === 'full'
          ? `Processing: ${chunksGenerated} chunks`
          : `Chunks: ${chunksGenerated}`;
      }
    } else if (isPlaying && !isPaused) {
      statusDot.className = 'kokoro-status-dot playing';
      statusText.textContent = isGenerating ? 'Streaming...' : 'Playing...';
      if (progressContainer) progressContainer.style.display = 'none';
      if (generationInfo && isGenerating) {
        generationInfo.style.display = 'block';
        chunksInfo.textContent = `Chunks: ${chunksGenerated}`;
      } else if (generationInfo) {
        generationInfo.style.display = 'none';
      }
    } else if (isPaused) {
      statusDot.className = 'kokoro-status-dot paused';
      statusText.textContent = 'Paused';
      if (progressContainer) progressContainer.style.display = 'none';
      if (generationInfo && isGenerating) {
        generationInfo.style.display = 'block';
        chunksInfo.textContent = `Chunks: ${chunksGenerated}`;
      }
    } else if (generationComplete && allAudioChunks.length > 0) {
      statusDot.className = 'kokoro-status-dot complete';
      statusText.textContent = 'Ready to play';
      if (progressContainer) progressContainer.style.display = 'none';
      if (generationInfo) generationInfo.style.display = 'none';
    } else if (isModelLoaded) {
      statusDot.className = 'kokoro-status-dot ready';
      statusText.textContent = 'Ready';
      if (progressContainer) progressContainer.style.display = 'none';
      if (generationInfo) generationInfo.style.display = 'none';
    } else {
      statusDot.className = 'kokoro-status-dot';
      statusText.textContent = 'Initializing...';
      if (progressContainer) progressContainer.style.display = 'none';
      if (generationInfo) generationInfo.style.display = 'none';
    }
  }

  // Backward compatibility aliases
  function updatePlayerStatus() {
    updatePlayerUI();
  }

  function updatePlayPauseButton() {
    updatePlayerUI();
  }

  // Start TTS generation
  function startGeneration(text) {
    if (!text.trim()) {
      console.log("[FreeVoiceReader] Empty text, skipping");
      return;
    }

    console.log("[FreeVoiceReader] Starting generation, text length:", text.length);

    // Save text for potential restart on mode change
    currentGeneratingText = text;

    // Clean up any existing audio element from previous generation
    cleanupAudioElement();

    // Reset state
    audioQueue = [];
    allAudioChunks = [];
    isPlaying = false;
    isPaused = false;
    isGenerating = true;
    generationComplete = false;
    chunksGenerated = 0;
    totalPlaybackTime = 0;
    stopPlaybackTimer();
    updatePlaybackTimeDisplay(0);

    // Set the session mode from the default playback mode (or keep current if user changed it)
    // On new generation, reset to default unless user has explicitly changed mode this session
    if (!player) {
      // First time showing player - use default mode
      currentSessionMode = playbackMode;
    }
    // If player already visible, keep the currentSessionMode that user may have toggled

    // Initialize audio context if needed
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Disable download button until generation is complete
    const downloadBtn = document.getElementById('kokoro-download');
    if (downloadBtn) {
      downloadBtn.disabled = true;
    }

    updateModeToggleUI();
    updatePlayerUI();

    // Send generation request
    console.log("[FreeVoiceReader] Sending GENERATE_SPEECH request");
    chrome.runtime.sendMessage({
      type: "GENERATE_SPEECH",
      text: text,
      voice: selectedVoice
    }, (response) => {
      console.log("[FreeVoiceReader] GENERATE_SPEECH response:", response);
    });
  }

  // Handle incoming audio chunk
  function handleAudioChunk(audioArray, text) {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const audioData = new Float32Array(audioArray);
    allAudioChunks.push(audioData);
    chunksGenerated++;

    const buffer = audioContext.createBuffer(1, audioData.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(audioData);

    audioQueue.push({ buffer, text });

    // Update UI with new chunk count
    updatePlayerUI();

    // In streaming mode, start playing immediately as chunks arrive
    // In full mode, wait until generation is complete before playing
    if (currentSessionMode === 'streaming') {
      if (!isPlaying && !isPaused) {
        playAudioQueue();
      }
    }
    // In 'full' mode, we don't auto-play during generation

    // Note: Download button is enabled in handleGenerationComplete, not here
  }

  // Play audio queue
  async function playAudioQueue() {
    if (isPlaying || audioQueue.length === 0) return;
    if (!audioContext) return;

    isPlaying = true;
    isPaused = false;
    startPlaybackTimer();
    updatePlayerUI();

    try {
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      while (audioQueue.length > 0 && isPlaying && !isPaused) {
        // Peek at the item first (don't remove until it's played successfully)
        const item = audioQueue[0];
        if (!item) {
          audioQueue.shift();
          continue;
        }

        const source = audioContext.createBufferSource();
        currentSource = source;
        source.buffer = item.buffer;
        // Note: playbackRate is not used as it causes pitch shifting (helium audio)

        const gainNode = audioContext.createGain();
        gainNode.gain.value = volume;

        source.connect(gainNode);
        gainNode.connect(audioContext.destination);

        const wasCompleted = await new Promise((resolve) => {
          source.onended = () => {
            currentSource = null;
            // Only mark as completed if we weren't paused/stopped
            resolve(!isPaused && isPlaying);
          };
          source.start();
        });

        // Remove the item from queue only if it completed successfully
        if (wasCompleted) {
          audioQueue.shift();
        }

        // Check if paused after each chunk
        if (isPaused) break;
      }
    } catch (error) {
      console.error("Error during audio playback:", error);
    } finally {
      // Only stop if queue is empty and generation is complete
      if (audioQueue.length === 0 && !isGenerating) {
        isPlaying = false;
        stopPlaybackTimer();
        updatePlayerUI();
      } else if (audioQueue.length === 0 && isGenerating) {
        // Queue empty but still generating - wait for more chunks
        isPlaying = false;
        // Don't stop timer, will restart when new chunks arrive
      } else if (!isPaused) {
        isPlaying = false;
        stopPlaybackTimer();
        updatePlayerUI();
      }
    }
  }

  // Stop playback
  function stopPlayback() {
    isPlaying = false;
    isPaused = false;
    isGenerating = false;
    audioQueue = [];

    // Stop AudioBufferSourceNode if active
    if (currentSource) {
      try {
        currentSource.stop();
      } catch (e) {}
      currentSource = null;
    }

    // Stop and clean up audio element if active
    cleanupAudioElement();

    stopPlaybackTimer();
    updatePlayPauseButton();
  }

  // Handle generation complete
  function handleGenerationComplete() {
    isGenerating = false;
    generationComplete = true;
    console.log("[FreeVoiceReader] Generation complete, chunks:", chunksGenerated);

    // Enable download button now that all audio is available
    const downloadBtn = document.getElementById('kokoro-download');
    if (downloadBtn && allAudioChunks.length > 0) {
      downloadBtn.disabled = false;
    }

    // Update mode toggle (re-enable it)
    updateModeToggleUI();
    updatePlayerUI();

    // In 'full' mode, create audio element for playback with speed control
    if (currentSessionMode === 'full' && allAudioChunks.length > 0) {
      createAudioElementFromChunks();
      // Auto-start playback
      if (!isPlaying) {
        playWithAudioElement();
      }
    }
  }

  // Create HTMLAudioElement from all audio chunks for full audio mode
  // This enables speed control with preservesPitch (no helium audio)
  function createAudioElementFromChunks() {
    // Clean up previous audio element if exists
    cleanupAudioElement();

    if (allAudioChunks.length === 0) return;

    // Combine all chunks into one Float32Array
    const totalLength = allAudioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of allAudioChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    // Create WAV blob
    const wavBlob = createWavBlob(combined, SAMPLE_RATE);
    audioBlobUrl = URL.createObjectURL(wavBlob);

    // Create audio element
    audioElement = new Audio(audioBlobUrl);
    audioElement.preservesPitch = true;
    audioElement.playbackRate = playbackSpeed;
    audioElement.volume = volume;

    // Setup event listeners
    audioElement.addEventListener('ended', () => {
      isPlaying = false;
      isPaused = false;
      stopPlaybackTimer();
      updatePlayerUI();
    });

    audioElement.addEventListener('pause', () => {
      if (!audioElement.ended) {
        isPaused = true;
        stopPlaybackTimer();
        updatePlayerUI();
      }
    });

    audioElement.addEventListener('play', () => {
      isPlaying = true;
      isPaused = false;
      startPlaybackTimer();
      updatePlayerUI();
    });

    audioElement.addEventListener('timeupdate', () => {
      updatePlaybackTimeDisplay(audioElement.currentTime);
    });

    console.log("[FreeVoiceReader] Created audio element with duration:", audioBlobUrl);
  }

  // Clean up audio element and blob URL
  function cleanupAudioElement() {
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
      audioElement = null;
    }
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      audioBlobUrl = null;
    }
  }

  // Play using HTMLAudioElement (for full audio mode with speed control)
  function playWithAudioElement() {
    if (!audioElement) {
      console.log("[FreeVoiceReader] No audio element available");
      return;
    }

    // Apply current settings
    audioElement.preservesPitch = true;
    audioElement.playbackRate = playbackSpeed;
    audioElement.volume = volume;

    audioElement.play().then(() => {
      isPlaying = true;
      isPaused = false;
      startPlaybackTimer();
      updatePlayerUI();
    }).catch(err => {
      console.error("[FreeVoiceReader] Audio playback error:", err);
    });
  }

  // Pause audio element
  function pauseAudioElement() {
    if (audioElement && !audioElement.paused) {
      audioElement.pause();
      isPaused = true;
      stopPlaybackTimer();
      updatePlayerUI();
    }
  }

  // Handle error
  function handleError(error) {
    isGenerating = false;
    const statusText = document.querySelector('.kokoro-status-text');
    if (statusText) {
      statusText.textContent = `Error: ${error}`;
    }
    isPlaying = false;
    isPaused = false;
    updatePlayPauseButton();
  }

  // Download audio
  function downloadAudio() {
    if (allAudioChunks.length === 0) return;

    const totalLength = allAudioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of allAudioChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const wavBlob = createWavBlob(combined, SAMPLE_RATE);

    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freevoice-tts-${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Create WAV blob from Float32Array
  function createWavBlob(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, samples.length * 2, true);

    let o = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(o, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      o += 2;
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  // Make element draggable
  function makeDraggable(element, handle) {
    let offsetX = 0, offsetY = 0, isDragging = false;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      offsetX = e.clientX - element.getBoundingClientRect().left;
      offsetY = e.clientY - element.getBoundingClientRect().top;
      element.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      element.style.transition = '';
    });
  }

  // Show notification
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'kokoro-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('kokoro-notification-fade');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  console.log("[FreeVoiceReader] Content script loaded");
})();
