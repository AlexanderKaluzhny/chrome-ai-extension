// reader/audioPlayer.js - Audio playback using HTML5 Audio element

export default class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.currentObjectUrl = null;
    this.isPlaying = false;
  }

  /**
   * Play audio from ArrayBuffer data
   * @param {ArrayBuffer} audioData - Audio data as ArrayBuffer
   * @returns {Promise} Resolves when audio finishes playing
   */
  play(audioData) {
    return new Promise((resolve, reject) => {
      // Cleanup previous object URL
      this.cleanup();

      // Create blob and object URL
      const blob = new Blob([audioData], { type: 'audio/mpeg' });
      this.currentObjectUrl = URL.createObjectURL(blob);

      // Set up audio element
      this.audio.src = this.currentObjectUrl;

      // Handle completion
      const onEnded = () => {
        this.isPlaying = false;
        this.audio.removeEventListener('ended', onEnded);
        this.audio.removeEventListener('error', onError);
        resolve();
      };

      // Handle errors
      const onError = (e) => {
        this.isPlaying = false;
        this.audio.removeEventListener('ended', onEnded);
        this.audio.removeEventListener('error', onError);
        reject(new Error(`Audio playback error: ${e.message || 'Unknown error'}`));
      };

      this.audio.addEventListener('ended', onEnded);
      this.audio.addEventListener('error', onError);

      // Start playback
      this.audio.play()
        .then(() => {
          this.isPlaying = true;
        })
        .catch(reject);
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
   * Stop audio playback and reset
   */
  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying = false;
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
