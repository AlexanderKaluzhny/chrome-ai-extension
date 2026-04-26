// offscreen.js - Handles audio playback in extension context (bypasses page CSP)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PLAY_AUDIO') {
    playAudio(msg.audio)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

async function playAudio(audioArray) {
  // Convert array back to Uint8Array for Blob creation
  const audioData = new Uint8Array(audioArray);
  const blob = new Blob([audioData], { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);

  try {
    const audio = new Audio(url);
    await audio.play();

    // Wait for audio to finish
    await new Promise((resolve, reject) => {
      audio.onended = resolve;
      audio.onerror = reject;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
