// utils/tts.js - TTS utility functions for use outside the reader panel

import TTSApiClient from '../reader/ttsApiClient.js';

/**
 * Synthesize text to speech using stored API key and TTS settings.
 * Returns audio data as ArrayBuffer (supports structured cloning in message passing).
 * @param {string} text - Text to synthesize
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
 */
export async function synthesizeText(text) {
  const { openaiKey, ttsVoice, ttsSpeed } = await chrome.storage.local.get([
    'openaiKey',
    'ttsVoice',
    'ttsSpeed'
  ]);

  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const client = new TTSApiClient(openaiKey);
  const audioBuffer = await client.synthesize(text, {
    voice: ttsVoice || 'alloy',
    speed: ttsSpeed || 1.0
  });

  return audioBuffer;
}
