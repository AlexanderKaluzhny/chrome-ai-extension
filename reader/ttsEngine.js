// reader/ttsEngine.js - Orchestrates reading flow and manages state

import { withMethodLogging } from './debug.js';

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

    this.paragraphs = [];
    this.currentIndex = 0;
    this.state = 'idle'; // 'idle' | 'playing' | 'paused'
    this.options = {
      voice: 'alloy',
      speed: 1.0,
    };

    this.shouldStop = false;

    withMethodLogging(this, 'TTSEngine');
  }

  /**
   * Load content paragraphs
   * @param {Array} paragraphs - Array of paragraph objects with { id, text, charCount }
   */
  loadContent(paragraphs) {
    this.paragraphs = paragraphs;
    this.currentIndex = 0;
    this.setState('idle');
  }

  /**
   * Start or resume playback
   */
  async play() {
    if (this.state === 'paused') {
      this.audioPlayer.resume();
      this.setState('playing');
      return;
    }

    if (this.state === 'idle') {
      await this.readFromCurrent();
    }
  }

  /**
   * Start reading from a specific paragraph
   * @param {number} index - Paragraph index to start from
   */
  async playFrom(index) {
    this.stop();
    this.currentIndex = index;
    await this.readFromCurrent();
  }

  /**
   * Main reading loop - reads from current position through all paragraphs
   */
  async readFromCurrent() {
    this.shouldStop = false;
    this.setState('playing');

    try {
      while (this.currentIndex < this.paragraphs.length && !this.shouldStop) {
        const paragraph = this.paragraphs[this.currentIndex];

        // Notify paragraph start
        this.callbacks.onParagraphStart?.(this.currentIndex);

        // Synthesize audio for this paragraph
        const audioData = await this.synthesizeParagraph(paragraph.text);

        // Check if we should stop (might have been called during synthesis)
        if (this.shouldStop) break;

        // Play the audio
        await this.audioPlayer.play(audioData);

        // Check if we should stop (might have been called during playback)
        if (this.shouldStop) break;

        // Notify paragraph end
        this.callbacks.onParagraphEnd?.(this.currentIndex);

        // Move to next paragraph
        this.currentIndex++;

        // Update progress
        this.callbacks.onProgress?.(this.currentIndex, this.paragraphs.length);
      }

      // Reading complete
      if (!this.shouldStop) {
        this.setState('idle');
      }
    } catch (error) {
      this.callbacks.onError?.(error);
      this.setState('idle');
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
      if (this.shouldStop) break;
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
    if (this.state === 'playing') {
      this.audioPlayer.pause();
      this.setState('paused');
    }
  }

  /**
   * Stop playback and reset to beginning
   */
  stop() {
    this.shouldStop = true;
    this.audioPlayer.stop();
    this.currentIndex = 0;
    this.setState('idle');
    this.callbacks.onProgress?.(0, this.paragraphs.length);
  }

  /**
   * Skip current paragraph and continue to next
   */
  async skip() {
    if (this.state !== 'playing' && this.state !== 'paused') return;

    // Stop current audio
    this.audioPlayer.stop();

    // Mark current as completed and move to next
    this.callbacks.onParagraphEnd?.(this.currentIndex);
    this.currentIndex++;

    if (this.currentIndex < this.paragraphs.length) {
      this.callbacks.onProgress?.(this.currentIndex, this.paragraphs.length);
      // Continue reading from next paragraph
      await this.readFromCurrent();
    } else {
      // No more paragraphs
      this.setState('idle');
      this.callbacks.onProgress?.(this.currentIndex, this.paragraphs.length);
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

  /**
   * Update state and notify via callback
   * @param {string} state - New state
   */
  setState(state) {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }
}
