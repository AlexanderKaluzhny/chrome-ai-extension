// reader/audioCache.js - Manages audio caching, fetching, and loading state

import { withMethodLogging } from './debug.js';

/**
 * AudioCache handles fetching and caching of synthesized audio data.
 * Centralizes cache management, API calls, and loading state callbacks.
 */
export default class AudioCache {
  /**
   * @param {TTSApiClient} apiClient - TTS API client instance
   * @param {Object} callbacks - Event callbacks
   * @param {Function} callbacks.onLoadingStart - Called when fetch starts (index)
   * @param {Function} callbacks.onLoadingEnd - Called when fetch ends (index)
   */
  constructor(apiClient, callbacks = {}) {
    this.apiClient = apiClient;
    this.callbacks = callbacks;
    this.options = {
      voice: 'alloy',
      speed: 1.0,
    };

    this.paragraphs = [];
    this.cache = [];
    this.pendingFetches = new Map();

    withMethodLogging(this, 'AudioCache');
  }

  /**
   * Initialize cache for content
   * @param {Array} paragraphs - Array of paragraph objects with { id, text, charCount }
   */
  init(paragraphs) {
    this.paragraphs = paragraphs;
    this.cache = new Array(paragraphs.length).fill(null);
    this.pendingFetches.clear();
  }

  /**
   * Get audio for a paragraph - returns from cache or fetches
   * @param {number} index - Paragraph index
   * @param {Function} shouldContinue - Optional callback to check if fetch should continue (for chunked paragraphs)
   * @returns {Promise<ArrayBuffer>} Audio data
   */
  async get(index, shouldContinue = () => true) {
    if (this.cache[index]) {
      return this.cache[index];
    }

    if (this.pendingFetches.has(index)) {
      return this.pendingFetches.get(index);
    }

    const promise = this.fetch(index, shouldContinue);
    this.pendingFetches.set(index, promise);
    return promise;
  }

  /**
   * Prefetch audio for a paragraph in background (non-blocking)
   * @param {number} index - Paragraph index
   */
  prefetch(index) {
    if (index < 0 || index >= this.paragraphs.length) {
      return;
    }

    if (this.cache[index] || this.pendingFetches.has(index)) {
      return;
    }

    const promise = this.fetch(index, () => true);
    this.pendingFetches.set(index, promise);
  }

  /**
   * Internal: fetch audio with loading callbacks
   * @param {number} index - Paragraph index
   * @param {Function} shouldContinue - Callback to check if fetch should continue
   * @returns {Promise<ArrayBuffer>} Audio data
   */
  async fetch(index, shouldContinue) {
    const paragraph = this.paragraphs[index];
    if (!paragraph) {
      throw new Error(`Invalid paragraph index: ${index}`);
    }

    this.callbacks.onLoadingStart?.(index);
    try {
      const audio = await this.synthesize(paragraph.text, shouldContinue);
      this.cache[index] = audio;
      return audio;
    } finally {
      this.callbacks.onLoadingEnd?.(index);
      this.pendingFetches.delete(index);
    }
  }

  /**
   * Synthesize audio for text, handling chunking for long text
   * @param {string} text - Text to synthesize
   * @param {Function} shouldContinue - Callback to check if synthesis should continue
   * @returns {Promise<ArrayBuffer>} Audio data
   */
  async synthesize(text, shouldContinue) {
    const chunks = this.apiClient.splitTextIntoChunks(text);

    if (chunks.length === 1) {
      return await this.apiClient.synthesize(text, this.options);
    }

    const audioBuffers = [];
    for (const chunk of chunks) {
      if (!shouldContinue()) break;
      const audioData = await this.apiClient.synthesize(chunk, this.options);
      audioBuffers.push(audioData);
    }

    return this.concatenateAudioBuffers(audioBuffers);
  }

  /**
   * Concatenate multiple ArrayBuffers into one
   * @param {ArrayBuffer[]} buffers - Array of ArrayBuffers
   * @returns {ArrayBuffer} Combined ArrayBuffer
   */
  concatenateAudioBuffers(buffers) {
    const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const buffer of buffers) {
      result.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    return result.buffer;
  }

  /**
   * Update synthesis options (clears cache since audio would differ)
   * @param {Object} options - Options to update
   * @param {string} options.voice - Voice name
   * @param {number} options.speed - Speed value
   */
  setOptions(options) {
    this.options = { ...this.options, ...options };
    this.clear();
  }

  /**
   * Clear all cached audio data
   */
  clear() {
    this.cache = new Array(this.paragraphs.length).fill(null);
  }
}
