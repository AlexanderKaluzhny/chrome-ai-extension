// reader/audioPlayer.js - Audio playback using HTML5 Audio element

import { withMethodLogging } from './debug.js';

export default class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.currentObjectUrl = null;
    this.isPlaying = false;
    this.pendingResolve = null;
    this.pendingReject = null;

    withMethodLogging(this, 'AudioPlayer');
  }

  /**
   * Play audio from ArrayBuffer data
   * @param {ArrayBuffer} audioData - Audio data as ArrayBuffer
   * @returns {Promise} Resolves when audio finishes playing or is stopped
   */
  play(audioData) {
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      this.cleanup();

      const blob = new Blob([audioData], { type: 'audio/mpeg' });
      this.currentObjectUrl = URL.createObjectURL(blob);
      this.audio.src = this.currentObjectUrl;

      const onEnded = () => {
        this.isPlaying = false;
        this.audio.removeEventListener('ended', onEnded);
        this.audio.removeEventListener('error', onError);
        this.pendingResolve = null;
        this.pendingReject = null;
        resolve();
      };

      const onError = (e) => {
        this.isPlaying = false;
        this.audio.removeEventListener('ended', onEnded);
        this.audio.removeEventListener('error', onError);
        this.pendingResolve = null;
        this.pendingReject = null;
        reject(new Error(`Audio playback error: ${e.message || 'Unknown error'}`));
      };

      this.audio.addEventListener('ended', onEnded);
      this.audio.addEventListener('error', onError);

      this.audio.play()
        .then(() => {
          this.isPlaying = true;
        })
        .catch((err) => {
          this.pendingResolve = null;
          this.pendingReject = null;
          reject(err);
        });
    });
  }

  /**
   * Pause current audio playback
   */
  pause() {
    if (this.isPlaying) {
      this.audio.pause();
      this.isPlaying = false;
    }
  }

  /**
   * Resume paused audio playback
   */
  resume() {
    if (!this.isPlaying && this.audio.src) {
      this.audio.play()
        .then(() => {
          this.isPlaying = true;
        })
        .catch(console.error);
    }
  }

  /**
   * Stop audio playback and reset. Resolves any pending play() Promise.
   */
  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying = false;

    if (this.pendingResolve) {
      this.pendingResolve();
      this.pendingResolve = null;
      this.pendingReject = null;
    }

    this.cleanup();
  }

  /**
   * Cleanup object URL to prevent memory leaks
   */
  cleanup() {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }
}
