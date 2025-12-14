// FreeVoice Reader - Popup Script (Firefox)

// Voice definitions for onboarding (top picks shown in grid)
const VOICES = {
  // American English - Female (top picks)
  af_heart: { name: "Heart", language: "American English", gender: "Female" },
  af_bella: { name: "Bella", language: "American English", gender: "Female" },
  af_nicole: { name: "Nicole", language: "American English", gender: "Female" },
  af_sarah: { name: "Sarah", language: "American English", gender: "Female" },
  // American English - Male
  am_fenrir: { name: "Fenrir", language: "American English", gender: "Male" },
  am_michael: { name: "Michael", language: "American English", gender: "Male" },
  am_puck: { name: "Puck", language: "American English", gender: "Male" },
  // British English
  bf_emma: { name: "Emma", language: "British English", gender: "Female" },
  bm_george: { name: "George", language: "British English", gender: "Male" },
  // Other Languages
  ef_dora: { name: "Dora", language: "Spanish", gender: "Female" },
  ff_siwis: { name: "Siwis", language: "French", gender: "Female" },
  hf_alpha: { name: "Alpha", language: "Hindi", gender: "Female" },
  if_sara: { name: "Sara", language: "Italian", gender: "Female" },
  pf_dora: { name: "Dora", language: "Portuguese", gender: "Female" },
};

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const onboarding = document.getElementById('onboarding');
  const mainPopup = document.getElementById('main-popup');
  const statusBadge = document.getElementById('status-badge');
  const statusDot = statusBadge.querySelector('.status-dot');
  const statusText = statusBadge.querySelector('.status-text');
  const modelSection = document.getElementById('model-section');
  const modelSubtitle = document.getElementById('model-subtitle');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const modelHint = document.getElementById('model-hint');
  const initBtn = document.getElementById('init-btn');
  const readSelectionBtn = document.getElementById('read-selection-btn');
  const readPageBtn = document.getElementById('read-page-btn');
  const textInput = document.getElementById('text-input');
  const readTextBtn = document.getElementById('read-text-btn');
  const voiceSelect = document.getElementById('voice-select');
  const optionsBtn = document.getElementById('options-btn');

  // Onboarding elements
  const onboardingStep1 = document.getElementById('onboarding-step-1');
  const onboardingStep2 = document.getElementById('onboarding-step-2');
  const onboardingStep3 = document.getElementById('onboarding-step-3');
  const onboardingNext1 = document.getElementById('onboarding-next-1');
  const onboardingBack2 = document.getElementById('onboarding-back-2');
  const onboardingDownload = document.getElementById('onboarding-download');
  const onboardingProgress = document.getElementById('onboarding-progress');
  const onboardingProgressBar = document.getElementById('onboarding-progress-bar');
  const onboardingStatus = document.getElementById('onboarding-status');
  const voiceGrid = document.getElementById('voice-grid');
  const onboardingFinish = document.getElementById('onboarding-finish');

  // State
  let isModelLoaded = false;
  let isLoading = false;
  let selectedVoice = 'af_heart';
  let selectedSpeed = 1;
  let currentDevice = null;

  // Initialize - check model status first
  await init();

  async function init() {
    // Load saved settings
    const settings = await browser.storage.sync.get(['selectedVoice', 'playbackSpeed', 'onboardingComplete']);
    if (settings.selectedVoice) {
      selectedVoice = settings.selectedVoice;
      voiceSelect.value = selectedVoice;
    }
    if (settings.playbackSpeed) {
      selectedSpeed = parseFloat(settings.playbackSpeed) || 1;
    }

    // Check model status from background
    try {
      const response = await browser.runtime.sendMessage({ type: "GET_STATUS" });

      if (response && response.isModelLoaded) {
        // Model is ready - skip onboarding entirely, show main UI
        isModelLoaded = true;
        currentDevice = response.device;
        // Ensure onboardingComplete is set since model is available
        browser.storage.sync.set({ onboardingComplete: true });
        await showReadyState();
      } else if (response && response.loadProgress > 0 && response.loadProgress < 100) {
        // Model is loading - show main popup with progress
        isLoading = true;
        showMainPopup();
        updateStatus('loading', `Loading ${Math.round(response.loadProgress)}%`);
        updateProgress(response.loadProgress);
      } else if (settings.onboardingComplete) {
        // Onboarding completed before but model not in memory - auto-init and show main UI
        showMainPopup();
        updateStatus('loading', 'Initializing...');
        browser.runtime.sendMessage({ type: "INIT_MODEL" });
      } else {
        // First time user - show onboarding
        showOnboarding();
      }
    } catch (err) {
      console.error("Error getting status:", err);
      // If onboarding was completed before, show main UI (model will auto-init)
      if (settings.onboardingComplete) {
        showMainPopup();
        updateStatus('loading', 'Initializing...');
        browser.runtime.sendMessage({ type: "INIT_MODEL" });
      } else {
        showOnboarding();
      }
    }
  }

  // Show the ready state - check for selected text
  async function showReadyState() {
    showMainPopup();

    // Hide the model download section since model is ready
    modelSection.style.display = 'none';

    updateStatus('ready', currentDevice === 'webgpu' ? 'GPU Ready' : 'CPU Ready');
    enableActionButtons();

    // Check if there's selected text on the page
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab && tab.id) {
      try {
        const results = await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.getSelection().toString().trim()
        });

        const selectedText = results?.[0]?.result;
        if (selectedText && selectedText.length > 0) {
          // Text is selected - auto-start reading
          browser.tabs.sendMessage(tab.id, { type: "READ_SELECTION" });
          window.close();
          return;
        }
      } catch (e) {
        // Can't execute script on this page (about:, etc)
        console.log("Cannot check selection on this page");
      }
    }

    // No text selected - show the textbox focused
    textInput.focus();
  }

  function showOnboarding() {
    onboarding.style.display = 'flex';
    mainPopup.style.display = 'none';
    setupOnboarding();
  }

  function showMainPopup() {
    onboarding.style.display = 'none';
    mainPopup.style.display = 'flex';
  }

  // Setup onboarding
  function setupOnboarding() {
    // Step 1 -> Step 2
    onboardingNext1.addEventListener('click', () => {
      onboardingStep1.style.display = 'none';
      onboardingStep2.style.display = 'flex';
    });

    // Step 2 -> Step 1
    onboardingBack2.addEventListener('click', () => {
      onboardingStep2.style.display = 'none';
      onboardingStep1.style.display = 'flex';
    });

    // Download model
    onboardingDownload.addEventListener('click', () => {
      onboardingDownload.disabled = true;
      onboardingDownload.textContent = 'Downloading...';
      onboardingProgress.style.display = 'block';
      onboardingStatus.textContent = 'Initializing...';

      browser.runtime.sendMessage({ type: "INIT_MODEL" });

      // Poll for status updates during download
      const pollInterval = setInterval(async () => {
        try {
          const response = await browser.runtime.sendMessage({ type: "GET_STATUS" });

          if (response) {
            if (response.isModelLoaded) {
              clearInterval(pollInterval);
              isModelLoaded = true;
              currentDevice = response.device;
              // Move to step 3
              onboardingStep2.style.display = 'none';
              onboardingStep3.style.display = 'flex';
            } else if (response.loadProgress > 0) {
              const progress = Math.round(response.loadProgress);
              onboardingProgressBar.style.width = `${progress}%`;
              onboardingStatus.textContent = progress < 100
                ? `Downloading... ${progress}% (one-time download)`
                : 'Finalizing...';
            }
          }
        } catch (err) {
          // Ignore polling errors
        }
      }, 300);
    });

    // Setup voice grid
    Object.entries(VOICES).forEach(([id, voice]) => {
      const option = document.createElement('div');
      option.className = 'voice-option' + (id === selectedVoice ? ' selected' : '');
      option.dataset.voice = id;
      option.innerHTML = `
        <span class="voice-name">${voice.name}</span>
        <span class="voice-lang">${voice.language}</span>
      `;
      option.addEventListener('click', () => {
        document.querySelectorAll('.voice-option').forEach(el => el.classList.remove('selected'));
        option.classList.add('selected');
        selectedVoice = id;
      });
      voiceGrid.appendChild(option);
    });

    // Setup speed options
    const speedOptions = document.querySelectorAll('.speed-option');
    speedOptions.forEach(option => {
      option.addEventListener('click', () => {
        speedOptions.forEach(el => el.classList.remove('selected'));
        option.classList.add('selected');
        selectedSpeed = parseFloat(option.dataset.speed);
      });
    });

    // Finish onboarding
    onboardingFinish.addEventListener('click', async () => {
      await browser.storage.sync.set({
        onboardingComplete: true,
        selectedVoice: selectedVoice,
        playbackSpeed: selectedSpeed
      });

      voiceSelect.value = selectedVoice;
      await showReadyState();
    });
  }

  // Update status badge
  function updateStatus(state, text) {
    statusDot.className = 'status-dot ' + state;
    const safeText = text.includes('NaN') ? text.replace(/NaN/g, '0') : text;
    statusText.textContent = safeText;
  }

  // Update progress bar
  function updateProgress(percent) {
    const safePercent = (typeof percent === 'number' && !isNaN(percent)) ? percent : 0;
    progressContainer.style.display = 'block';
    modelHint.style.display = 'block';
    progressBar.style.width = `${safePercent}%`;
    initBtn.textContent = `Downloading... ${Math.round(safePercent)}% (one-time)`;
    initBtn.disabled = true;
  }

  // Enable action buttons
  function enableActionButtons() {
    readSelectionBtn.disabled = false;
    readPageBtn.disabled = false;
    readTextBtn.disabled = !textInput.value.trim();
  }

  // Initialize model (from main popup if needed)
  initBtn.addEventListener('click', async () => {
    if (isModelLoaded || isLoading) return;

    isLoading = true;
    updateStatus('loading', 'Initializing...');
    initBtn.disabled = true;
    initBtn.textContent = 'Initializing...';

    try {
      const response = await browser.runtime.sendMessage({ type: "INIT_MODEL" });

      if (response?.loading) {
        progressContainer.style.display = 'block';
      }
    } catch (err) {
      updateStatus('error', 'Error');
      initBtn.textContent = 'Retry';
      initBtn.disabled = false;
      isLoading = false;
    }
  });

  // Read selection
  readSelectionBtn.addEventListener('click', async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab) {
      browser.tabs.sendMessage(tab.id, { type: "READ_SELECTION" });
      window.close();
    }
  });

  // Read page
  readPageBtn.addEventListener('click', async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab) {
      browser.tabs.sendMessage(tab.id, { type: "READ_ARTICLE" });
      window.close();
    }
  });

  // Read pasted text
  readTextBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) return;

    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab) {
      browser.tabs.sendMessage(tab.id, { type: "READ_TEXT", text });
      window.close();
    }
  });

  // Enable read text button when text is entered
  textInput.addEventListener('input', () => {
    readTextBtn.disabled = !isModelLoaded || !textInput.value.trim();
  });

  // Voice selection change
  voiceSelect.addEventListener('change', () => {
    browser.storage.sync.set({ selectedVoice: voiceSelect.value });
  });

  // Open options
  optionsBtn.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

  // Listen for model loading updates
  browser.runtime.onMessage.addListener((message) => {
    const progress = (typeof message.progress === 'number' && !isNaN(message.progress)) ? message.progress : 0;

    if (message.type === 'MODEL_LOADING') {
      isLoading = true;

      // Update main popup
      updateStatus('loading', `Loading ${Math.round(progress)}%`);
      updateProgress(progress);

      // Update onboarding if visible
      if (onboarding.style.display !== 'none') {
        onboardingProgressBar.style.width = `${progress}%`;
        onboardingStatus.textContent = `Downloading... ${Math.round(progress)}% (one-time download)`;
      }
    } else if (message.type === 'MODEL_READY') {
      isModelLoaded = true;
      isLoading = false;
      currentDevice = message.device;

      // Mark onboarding as complete once model is downloaded successfully
      browser.storage.sync.set({ onboardingComplete: true });

      // Model is ready - go straight to main UI, skip any remaining onboarding
      showMainPopup();
      updateStatus('ready', message.device === 'webgpu' ? 'GPU Ready' : 'CPU Ready');
      modelSection.style.display = 'none';
      progressContainer.style.display = 'none';
      modelHint.style.display = 'none';
      enableActionButtons();
      textInput.focus();
    }
  });
});
