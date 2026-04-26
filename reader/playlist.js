// reader/playlist.js - Singleton playlist with state machine for guarded playback

import { withMethodLogging } from './debug.js';

class Playlist {
  constructor() {
    // Content
    this.paragraphs = [];

    // Position
    this.currentIndex = 0;

    // State machine: 'idle' | 'playing' | 'paused' | 'stopping'
    this.state = 'idle';

    // Promise that resolves when the active loop exits
    this.loopExitPromise = null;
    this.loopExitResolve = null;

    // State change callback
    this.onStateChangeCallback = null;

    withMethodLogging(this, 'Playlist');
  }

  /**
   * Load content into the playlist
   * @param {Array} paragraphs - Array of paragraph objects
   */
  loadContent(paragraphs) {
    this.paragraphs = paragraphs;
    this.currentIndex = 0;
    this.setState('idle');
  }

  /**
   * Request to start playing
   * @returns {boolean} True if play request accepted
   */
  requestPlay() {
    if (this.state === 'stopping') {
      return false;
    }

    if (this.state === 'paused') {
      this.setState('playing');
      return true;
    }

    if (this.state === 'idle') {
      this.setState('playing');
      this.loopExitPromise = new Promise(resolve => {
        this.loopExitResolve = resolve;
      });
      return true;
    }

    return false;
  }

  /**
   * Request to pause playback
   */
  requestPause() {
    if (this.state === 'playing') {
      this.setState('paused');
    }
  }

  /**
   * Request to stop playback - waits for loop to exit
   * @returns {Promise} Resolves when fully stopped
   */
  async requestStop() {
    if (this.state === 'idle') {
      return;
    }

    if (this.state === 'playing' || this.state === 'paused') {
      this.setState('stopping');
    }

    if (this.loopExitPromise) {
      await this.loopExitPromise;
    }

    this.currentIndex = 0;
    this.setState('idle');
  }

  /**
   * Called by TTSEngine when its playback loop exits
   */
  notifyLoopExit() {
    if (this.loopExitResolve) {
      this.loopExitResolve();
      this.loopExitResolve = null;
      this.loopExitPromise = null;
    }
  }

  /**
   * Check if the playback loop should continue
   * @returns {boolean} True if loop should continue
   */
  shouldContinue() {
    return this.state === 'playing';
  }

  /**
   * Check if there are more paragraphs to play
   * @returns {boolean} True if more paragraphs available
   */
  hasMore() {
    return this.currentIndex < this.paragraphs.length;
  }

  /**
   * Get the current paragraph
   * @returns {Object|null} Current paragraph or null
   */
  getCurrentParagraph() {
    if (this.currentIndex < this.paragraphs.length) {
      return this.paragraphs[this.currentIndex];
    }
    return null;
  }

  /**
   * Get current index
   * @returns {number} Current paragraph index
   */
  getCurrentIndex() {
    return this.currentIndex;
  }

  /**
   * Get total paragraph count
   * @returns {number} Total paragraphs
   */
  getTotal() {
    return this.paragraphs.length;
  }

  /**
   * Advance to the next paragraph
   * @returns {boolean} True if advanced, false if at end
   */
  advance() {
    if (this.currentIndex < this.paragraphs.length) {
      this.currentIndex++;
      return true;
    }
    return false;
  }

  /**
   * Jump to a specific paragraph index
   * @param {number} index - Target index
   */
  goTo(index) {
    if (index >= 0 && index < this.paragraphs.length) {
      this.currentIndex = index;
    }
  }

  /**
   * Get current state
   * @returns {string} Current state
   */
  getState() {
    return this.state;
  }

  /**
   * Set state and notify callback
   * @param {string} newState - New state
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;

    if (oldState !== newState && this.onStateChangeCallback) {
      this.onStateChangeCallback(newState);
    }
  }

  /**
   * Register state change callback
   * @param {Function} callback - Called with new state
   */
  onStateChange(callback) {
    this.onStateChangeCallback = callback;
  }
}

// Module-level singleton instance
const playlist = new Playlist();
export default playlist;
