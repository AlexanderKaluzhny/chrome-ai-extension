/**
 * Word pronunciation via TTS with offscreen document for CSP bypass.
 */

import { synthesizeText } from '../utils/tts.js';

let creatingOffscreen = null;
const pronunciationCache = new Map();

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play TTS audio for word pronunciation'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

export async function pronounceWord(text) {
  let audioArray = pronunciationCache.get(text);

  if (!audioArray) {
    const audioBuffer = await synthesizeText(text);
    audioArray = Array.from(new Uint8Array(audioBuffer));
    pronunciationCache.set(text, audioArray);
  }

  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    type: 'PLAY_AUDIO',
    audio: audioArray
  });

  if (response?.error) {
    throw new Error(response.error);
  }
}
