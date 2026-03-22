// popup.js

const timerDisplay = document.getElementById('timer');
const statusDisplay = document.getElementById('status');
const startWorkBtn = document.getElementById('start-work-btn');
const startBreakBtn = document.getElementById('start-break-btn');

const workPresetList = document.getElementById('work-preset-list');
const breakPresetList = document.getElementById('break-preset-list');

const newWorkInput = document.getElementById('new-work');
const addWorkBtn = document.getElementById('add-work-btn');
const newBreakInput = document.getElementById('new-break');
const addBreakBtn = document.getElementById('add-break-btn');

let timerInterval;
let currentState = null;
let currentPresets = { 
  work: { list: [], default: null },
  break: { list: [], default: null }
};

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateUI(state) {
  currentState = state;
  timerDisplay.textContent = formatTime(state.remainingTime);
  
  // Status & Background
  if (state.mode === 'work') {
    statusDisplay.textContent = 'Work Time';
    statusDisplay.style.color = '#4688F1';
    document.body.style.backgroundColor = '#fff'; 
    timerDisplay.style.color = '#4688F1';
  } else {
    statusDisplay.textContent = 'Break Time';
    statusDisplay.style.color = '#0F9D58';
    document.body.style.backgroundColor = '#fff';
    timerDisplay.style.color = '#0F9D58';
  }

  // Buttons State
  if (state.status === 'running') {
    if (state.mode === 'work') {
      startWorkBtn.textContent = 'Stop';
      startBreakBtn.textContent = 'Start Break';
      startWorkBtn.style.opacity = '1';
      startBreakBtn.style.opacity = '0.6';
    } else {
      startWorkBtn.textContent = 'Start Work';
      startBreakBtn.textContent = 'Stop';
      startWorkBtn.style.opacity = '0.6';
      startBreakBtn.style.opacity = '1';
    }
  } else {
    startWorkBtn.textContent = 'Start Work';
    startBreakBtn.textContent = 'Start Break';
    startWorkBtn.style.opacity = '1';
    startBreakBtn.style.opacity = '1';
  }
}

function renderPresetList(type, container) {
  const presets = currentPresets[type];
  container.innerHTML = '';
  
  presets.list.forEach(minutes => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    // Removed the addition of the 'active' class
    
    // Star/Default toggle
    const star = document.createElement('span');
    star.className = `default-indicator ${presets.default === minutes ? 'is-default' : ''}`;
    star.textContent = '★';
    star.title = 'Set as Default';
    star.onclick = (e) => {
      e.stopPropagation();
      setDefaultPreset(type, minutes);
    };
    
    // Preset Button (Minutes)
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = `${minutes}min`;
    btn.onclick = () => {
      applyPreset(type, minutes);
    };
    
    // Delete Button
    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.textContent = '✕';
    del.title = 'Delete Preset';
    del.onclick = (e) => {
      e.stopPropagation();
      deletePreset(type, minutes);
    };
    
    item.appendChild(star);
    item.appendChild(btn);
    item.appendChild(del);
    container.appendChild(item);
  });
}

function renderPresets(presets) {
  currentPresets = presets;
  renderPresetList('work', workPresetList);
  renderPresetList('break', breakPresetList);
}

function fetchState() {
  chrome.runtime.sendMessage({ action: 'get-state' }, (state) => {
    if (state) {
      updateUI(state);
    }
  });
}

function fetchPresets() {
  chrome.runtime.sendMessage({ action: 'get-presets' }, (presets) => {
    if (presets) {
      renderPresets(presets);
    }
  });
}

function savePresets(newPresets) {
  chrome.runtime.sendMessage({ action: 'save-presets', presets: newPresets }, (response) => {
    if (response && response.success) {
      fetchPresets();
    }
  });
}

function applyPreset(type, minutes) {
  chrome.runtime.sendMessage({ 
    action: 'set-duration', 
    type: type, 
    minutes: minutes 
  }, (state) => {
    updateUI(state);
    // Auto-start logic is now handled in the background script for a smoother transition
  });
}

function setDefaultPreset(type, minutes) {
  const newPresets = JSON.parse(JSON.stringify(currentPresets)); // Deep copy
  newPresets[type].default = minutes;
  savePresets(newPresets);
  
  // Also update background setting so next Reset uses this
  if (type === 'work') {
      // We only update duration, we don't change mode or time unless idle
      chrome.runtime.sendMessage({ 
          action: 'update-settings', 
          workDuration: minutes,
          breakDuration: currentState.breakDuration / 60 // Keep existing
      }, updateUI);
  } else {
      chrome.runtime.sendMessage({ 
          action: 'update-settings', 
          workDuration: currentState.workDuration / 60, // Keep existing
          breakDuration: minutes
      }, updateUI);
  }
}

function addPreset(type, inputEl) {
  const minutes = parseInt(inputEl.value, 10);
  
  if (minutes > 0) {
    const newPresets = JSON.parse(JSON.stringify(currentPresets));
    
    if (!newPresets[type].list.includes(minutes)) {
      newPresets[type].list.push(minutes);
      newPresets[type].list.sort((a, b) => a - b);
      
      // If list was empty, set as default
      if (newPresets[type].list.length === 1) {
          newPresets[type].default = minutes;
      }
      
      savePresets(newPresets);
    }
    
    inputEl.value = '';
  } else {
    alert('Please enter valid duration.');
  }
}

function deletePreset(type, minutes) {
  if (confirm(`Delete ${minutes}min preset?`)) {
    const newPresets = JSON.parse(JSON.stringify(currentPresets));
    newPresets[type].list = newPresets[type].list.filter(m => m !== minutes);
    
    if (newPresets[type].default === minutes) {
      newPresets[type].default = newPresets[type].list.length > 0 ? newPresets[type].list[0] : null;
    }
    
    savePresets(newPresets);
  }
}

// Initial load
fetchState();
fetchPresets();

// Poll every second to update timer
timerInterval = setInterval(fetchState, 1000);

startWorkBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'start-work' }, updateUI);
});

startBreakBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'start-break' }, updateUI);
});

addWorkBtn.addEventListener('click', () => addPreset('work', newWorkInput));
addBreakBtn.addEventListener('click', () => addPreset('break', newBreakInput));
