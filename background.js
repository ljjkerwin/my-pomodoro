// background.js

// Defaults
const defaultState = {
  mode: 'work',
  status: 'paused',
  remainingTime: 25 * 60, 
  workDuration: 25 * 60, 
  breakDuration: 5 * 60,
  targetTime: null
};

// New Preset Structure: Separate lists for Work and Break
const defaultPresets = {
  work: {
    list: [10, 25, 40],
    default: 25
  },
  break: {
    list: [5, 10],
    default: 5
  }
};

// Helper to get state
async function getState() {
  const result = await chrome.storage.local.get(['timerState']);
  return result.timerState || defaultState;
}

// Helper to save state
async function saveState(state) {
  await chrome.storage.local.set({ timerState: state });
  updateBadge(state);
}

// Helper to get presets
async function getPresets() {
  const result = await chrome.storage.local.get(['presets']);
  
  // Create a base structure to ensure no undefined errors
  const mergedPresets = {
    work: {
      list: [...defaultPresets.work.list],
      default: defaultPresets.work.default
    },
    break: {
      list: [...defaultPresets.break.list],
      default: defaultPresets.break.default
    }
  };

  if (result.presets) {
    if (result.presets.work && Array.isArray(result.presets.work.list)) {
      // Merge and remove duplicates, then sort
      const mergedWorkList = [...new Set([...defaultPresets.work.list, ...result.presets.work.list])];
      mergedPresets.work.list = mergedWorkList.sort((a, b) => a - b);
      if (result.presets.work.default) {
         mergedPresets.work.default = result.presets.work.default;
      }
    }
    
    if (result.presets.break && Array.isArray(result.presets.break.list)) {
      // Merge and remove duplicates, then sort
      const mergedBreakList = [...new Set([...defaultPresets.break.list, ...result.presets.break.list])];
      mergedPresets.break.list = mergedBreakList.sort((a, b) => a - b);
      if (result.presets.break.default) {
         mergedPresets.break.default = result.presets.break.default;
      }
    }
  }

  return mergedPresets;
}

// Helper to save presets
async function savePresets(presets) {
  await chrome.storage.local.set({ presets });
}

// Helper to update badge
function updateBadge(state) {
  let text = '';
  let color = '#4688F1'; // Blue for Work

  if (state.mode === 'break') {
    color = '#0b703e'; // Darker Green for Break
  }

  // Only show badge if the timer is actually running
  if (state.status === 'running' && state.targetTime) {
    const now = Date.now();
    const timeLeft = Math.ceil((state.targetTime - now) / 1000);
    const displaySeconds = timeLeft > 0 ? timeLeft : 0;
    
    if (displaySeconds > 0) {
      const m = Math.ceil(displaySeconds / 60); // Show ceiling of minutes
      text = m.toString();
    }
  }

  chrome.action.setBadgeText({ text });
  if (text !== '') {
    chrome.action.setBadgeBackgroundColor({ color });
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Only set defaults on first install
    await saveState(defaultState);
    await savePresets(defaultPresets);
  } else if (details.reason === 'update') {
    // On update, ensure we have valid presets structure, but don't overwrite
    const currentPresets = await getPresets();
    await savePresets(currentPresets);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'pomodoroTimer') {
    const state = await getState();
    
    // Timer finished
    state.status = 'paused';
    state.targetTime = null;
    state.remainingTime = 0; // Explicitly 0
    
    const msg = state.mode === 'work' ? "Work session finished! Time for a break." : "Break finished! Back to work.";
    
    // Play a sound to ensure we notice it even if notifications are blocked
    // (This requires an audio file, but we can rely on system default notification sound if permissions allow)
    // Sometimes 'requireInteraction' blocks notification from appearing if system settings are strict.
    // Let's remove requireInteraction and ensure we use the correct API.
    chrome.notifications.create('pomodoro-notification', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Pomodoro Timer',
      message: msg,
      priority: 2
    }, (notificationId) => {
      if (chrome.runtime.lastError) {
        console.error("Notification error:", chrome.runtime.lastError);
      } else {
        console.log("Notification created:", notificationId);
      }
    });

    // Strong Visual Notification: Open an alert window
    chrome.windows.create({
        url: chrome.runtime.getURL(`alert.html?mode=${state.mode}`),
        type: 'popup',
        width: 900,
        height: 500,
        focused: true
    });

    // Switch mode
    if (state.mode === 'work') {
      state.mode = 'break';
      state.remainingTime = state.breakDuration;
    } else {
      state.mode = 'work';
      state.remainingTime = state.workDuration;
    }
    
    // Clear recurring badge alarm
    chrome.alarms.clear('badgeUpdate');
    
    await saveState(state);
  } else if (alarm.name === 'badgeUpdate') {
    const state = await getState();
    if (state.status === 'running') {
      updateBadge(state);
    }
  }
});

async function startTimer(state) {
  state.status = 'running';
  if (state.remainingTime <= 0) {
     state.remainingTime = state.mode === 'work' ? state.workDuration : state.breakDuration;
  }
  state.targetTime = Date.now() + state.remainingTime * 1000;
  
  chrome.alarms.create('pomodoroTimer', { when: state.targetTime });
  chrome.alarms.create('badgeUpdate', { periodInMinutes: 1 });
  
  await saveState(state);
}

async function pauseTimer(state) {
  state.status = 'paused';
  chrome.alarms.clear('pomodoroTimer');
  chrome.alarms.clear('badgeUpdate');
  
  state.targetTime = null;
  // Reset remaining time to DEFAULT duration based on current mode
  const presets = await getPresets();
  if (state.mode === 'work') {
    state.workDuration = presets.work.default * 60;
    state.remainingTime = state.workDuration;
  } else {
    state.breakDuration = presets.break.default * 60;
    state.remainingTime = state.breakDuration;
  }
  
  await saveState(state);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Use an async IIFE to handle the logic and sendResponse
  (async () => {
    let state = await getState();

    // Calculate current time if running (common logic)
    if (state.status === 'running' && state.targetTime) {
      const now = Date.now();
      const timeLeft = Math.ceil((state.targetTime - now) / 1000);
      if (timeLeft <= 0) {
         state.remainingTime = 0;
      } else {
        state.remainingTime = timeLeft;
      }
    }

    if (request.action === 'get-state') {
      sendResponse(state);
    } 
    else if (request.action === 'get-presets') {
      const presets = await getPresets();
      sendResponse(presets);
    }
    else if (request.action === 'save-presets') {
      await savePresets(request.presets);
      sendResponse({ success: true });
    }
    else if (request.action === 'start-work') {
      if (state.mode === 'work' && state.status === 'running') {
        // Pause/Stop
        await pauseTimer(state);
      } else {
        // Start from default preset if not resuming
        const presets = await getPresets();
        state.mode = 'work';
        state.workDuration = presets.work.default * 60;
        state.remainingTime = state.workDuration;
        await startTimer(state);
      }
      sendResponse(state);
    }
    else if (request.action === 'start-break') {
      if (state.mode === 'break' && state.status === 'running') {
        // Pause/Stop
        await pauseTimer(state);
      } else {
        // Start from default preset if not resuming
        const presets = await getPresets();
        state.mode = 'break';
        state.breakDuration = presets.break.default * 60;
        state.remainingTime = state.breakDuration;
        await startTimer(state);
      }
      sendResponse(state);
    }
    else if (request.action === 'set-duration') {
      const minutes = request.minutes;
      const type = request.type; // 'work' or 'break'
      
      // Stop current timer if it's running
      if (state.status === 'running') {
         await pauseTimer(state);
         // state is updated by pauseTimer, but we need to keep working with it
      }
      
      // Update durations and switch mode to match the clicked preset
      if (type === 'work') {
        state.workDuration = minutes * 60;
        state.mode = 'work';
        state.remainingTime = state.workDuration;
      } else {
        state.breakDuration = minutes * 60;
        state.mode = 'break';
        state.remainingTime = state.breakDuration;
      }
      
      // Immediately start the timer
      await startTimer(state);
      
      sendResponse(state);
    }
    else if (request.action === 'reset') {
      chrome.alarms.clear('pomodoroTimer');
      chrome.alarms.clear('badgeUpdate');
      
      state.status = 'paused';
      // Reset logic: keep current mode but reset time? Or reset to work?
      // Spec says "reset to work mode initial state".
      // But with separate buttons, maybe just reset current mode's time?
      // Let's stick to "Reset current mode's timer" if we are in that mode.
      // But standard "Reset" usually implies full reset. 
      // Let's make Reset simply stop and reset the time for the CURRENT mode.
      if (state.mode === 'work') {
        state.remainingTime = state.workDuration;
      } else {
        state.remainingTime = state.breakDuration;
      }
      state.targetTime = null;
      
      await saveState(state);
      sendResponse(state);
    } 
  })();

  return true; // Indicates we will respond asynchronously
});
