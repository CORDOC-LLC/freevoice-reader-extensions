// FreeVoice Reader - Options Page Script

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const defaultVoice = document.getElementById('default-voice');
  const defaultVolume = document.getElementById('default-volume');
  const volumeValue = document.getElementById('volume-value');
  const playerPosition = document.getElementById('player-position');
  const playbackMode = document.getElementById('playback-mode');
  const playbackSpeed = document.getElementById('playback-speed');
  const speedSection = document.getElementById('speed-section');
  const resetSettingsBtn = document.getElementById('reset-settings');
  const saveBtn = document.getElementById('save-btn');
  const saveStatus = document.getElementById('save-status');

  // Default settings
  const defaults = {
    selectedVoice: 'af_heart',
    volume: 1,
    playerPosition: 'bottom-right',
    playbackMode: 'streaming',  // 'streaming' or 'full'
    playbackSpeed: 1
  };

  // Load settings
  loadSettings();

  // Update volume display
  defaultVolume.addEventListener('input', () => {
    volumeValue.textContent = Math.round(defaultVolume.value * 100) + '%';
  });

  // Update speed section visibility based on playback mode
  playbackMode.addEventListener('change', () => {
    updateSpeedSectionVisibility();
  });

  // Save settings
  saveBtn.addEventListener('click', saveSettings);

  // Reset settings
  resetSettingsBtn.addEventListener('click', () => {
    chrome.storage.sync.set(defaults, () => {
      loadSettings();
      showSaveStatus('Reset to defaults');
    });
  });

  // Update speed section visibility
  function updateSpeedSectionVisibility() {
    const isFullMode = playbackMode.value === 'full';
    speedSection.classList.toggle('disabled', !isFullMode);
    playbackSpeed.disabled = !isFullMode;
  }

  // Load settings from storage
  function loadSettings() {
    chrome.storage.sync.get(Object.keys(defaults), (result) => {
      const settings = { ...defaults, ...result };

      defaultVoice.value = settings.selectedVoice;
      defaultVolume.value = settings.volume;
      volumeValue.textContent = Math.round(settings.volume * 100) + '%';
      playerPosition.value = settings.playerPosition;
      playbackMode.value = settings.playbackMode;
      playbackSpeed.value = settings.playbackSpeed;

      // Update speed section visibility
      updateSpeedSectionVisibility();
    });
  }

  // Save settings to storage
  function saveSettings() {
    const settings = {
      selectedVoice: defaultVoice.value,
      volume: parseFloat(defaultVolume.value),
      playerPosition: playerPosition.value,
      playbackMode: playbackMode.value,
      playbackSpeed: parseFloat(playbackSpeed.value)
    };

    chrome.storage.sync.set(settings, () => {
      showSaveStatus('Saved!');
    });
  }

  // Show save status message
  function showSaveStatus(message) {
    saveStatus.textContent = message;
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 2000);
  }
});
