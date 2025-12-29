// reader/ttsEngine.js - Orchestrates reading flow using Playlist for state

import { withMethodLogging } from './debug.js';
import playlist from './playlist.js';

export default class TTSEngine {
  /**
   * @param {TTSApiClient} apiClient - TTS API client instance
   * @param {AudioPlayer} audioPlayer - Audio player instance
   * @param {Object} callbacks - Event callbacks
   * @param {Function} callbacks.onParagraphStart - Called when paragraph starts (index)
   * @param {Function} callbacks.onParagraphEnd - Called when paragraph ends (index)
   * @param {Function} callbacks.onProgress - Called on progress update (current, total)
   * @param {Function} callbacks.onStateChange - Called on state change (state)
   * @param {Function} callbacks.onError - Called on error (error)
   */
  constructor(apiClient, audioPlayer, callbacks = {}) {
    this.apiClient = apiClient;
    this.audioPlayer = audioPlayer;
    this.callbacks = callbacks;

    this.options = {
      voice: 'alloy',
      speed: 1.0,
    };

    // Register state change callback with playlist
    playlist.onStateChange((state) => {
      // Map 'stopping' to 'idle' for UI (UI doesn't need to know about stopping)
      const uiState = state === 'stopping' ? 'idle' : state;
      this.callbacks.onStateChange?.(uiState);
    });

    withMethodLogging(this, 'TTSEngine');
  }

  /**
   * Load content paragraphs
   * @param {Array} paragraphs - Array of paragraph objects with { id, text, charCount }
   */
  loadContent(paragraphs) {
    playlist.loadContent(paragraphs);
  }

  /**
   * Start or resume playback
   */
  async play() {
    const state = playlist.getState();

    if (state === 'paused') {
      this.audioPlayer.resume();
      playlist.requestPlay();
      return;
    }

    if (state === 'idle') {
      if (playlist.requestPlay()) {
        await this.readFromCurrent();
      }
    }
  }

  /**
   * Start reading from a specific paragraph
   * @param {number} index - Paragraph index to start from
   */
  async playFrom(index) {
    // Stop any current playback and wait for loop to exit
    await this.stop();

    // Jump to the specified index
    playlist.goTo(index);

    // Start playing
    await this.play();
  }

  /**
   * Main reading loop - reads from current position through all paragraphs
   */
  async readFromCurrent() {
    try {
      while (playlist.hasMore() && playlist.shouldContinue()) {
        const paragraph = playlist.getCurrentParagraph();
        const currentIndex = playlist.getCurrentIndex();

        // Notify paragraph start
        this.callbacks.onParagraphStart?.(currentIndex);

        // Synthesize audio for this paragraph
        const audioData = await this.synthesizeParagraph(paragraph.text);

        // Check if we should stop (might have been called during synthesis)
        if (!playlist.shouldContinue()) break;

        // Play the audio
        await this.audioPlayer.play(audioData);

        // Check if we should stop (might have been called during playback)
        if (!playlist.shouldContinue()) break;

        // Notify paragraph end
        this.callbacks.onParagraphEnd?.(currentIndex);

        // Move to next paragraph
        playlist.advance();

        // Update progress
        this.callbacks.onProgress?.(playlist.getCurrentIndex(), playlist.getTotal());
      }

      // Reading complete - only set idle if we finished naturally (not stopped)
      if (playlist.shouldContinue()) {
        playlist.requestStop();
      }
    } catch (error) {
      this.callbacks.onError?.(error);
      playlist.requestStop();
    } finally {
      // Always notify that loop has exited
      playlist.notifyLoopExit();
    }
  }

  /**
   * Synthesize audio for a paragraph, handling chunking if needed
   * @param {string} text - Paragraph text
   * @returns {Promise<ArrayBuffer>} Audio data
   */
  async synthesizeParagraph(text) {
    const chunks = this.apiClient.splitTextIntoChunks(text);

    if (chunks.length === 1) {
      return await this.apiClient.synthesize(text, this.options);
    }

    // For multiple chunks, synthesize each and concatenate
    const audioBuffers = [];
    for (const chunk of chunks) {
      if (!playlist.shouldContinue()) break;
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
   * Pause playback
   */
  pause() {
    if (playlist.getState() === 'playing') {
      this.audioPlayer.pause();
      playlist.requestPause();
    }
  }

  /**
   * Stop playback and reset to beginning
   * @returns {Promise} Resolves when fully stopped
   */
  async stop() {
    this.audioPlayer.stop();
    await playlist.requestStop();
    this.callbacks.onProgress?.(0, playlist.getTotal());
  }

  /**
   * Skip current paragraph and continue to next
   */
  async skip() {
    const state = playlist.getState();
    if (state !== 'playing' && state !== 'paused') return;

    // Save current and next index before stopping (stop resets index to 0)
    const currentIndex = playlist.getCurrentIndex();
    const nextIndex = currentIndex + 1;
    const total = playlist.getTotal();

    // Mark current as completed
    this.callbacks.onParagraphEnd?.(currentIndex);

    // Stop current playback and wait for old loop to exit
    this.audioPlayer.stop();
    await playlist.requestStop();

    if (nextIndex < total) {
      // Go to next paragraph and start playing
      playlist.goTo(nextIndex);
      this.callbacks.onProgress?.(nextIndex, total);
      await this.play();
    } else {
      // No more paragraphs
      this.callbacks.onProgress?.(total, total);
    }
  }

  /**
   * Set voice option
   * @param {string} voice - Voice name
   */
  setVoice(voice) {
    this.options.voice = voice;
  }

  /**
   * Set speed option
   * @param {number} speed - Speed value (0.25 to 4.0)
   */
  setSpeed(speed) {
    this.options.speed = speed;
  }
}
