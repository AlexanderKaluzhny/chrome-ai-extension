// reader/reader.js - Main entry point for the side panel

import AudioPlayer from './audioPlayer.js';
import TTSApiClient from './ttsApiClient.js';
import TTSEngine from './ttsEngine.js';

class ReaderPanel {
  constructor() {
    this.content = null;
    this.elements = {};
    this.ttsEngine = null;
    this.init();
  }

  async init() {
    this.cacheElements();
    this.bindEvents();
    await this.loadContent();
    await this.initTTS();
  }

  cacheElements() {
    this.elements = {
      content: document.getElementById('content'),
      playBtn: document.getElementById('play-btn'),
      pauseBtn: document.getElementById('pause-btn'),
      stopBtn: document.getElementById('stop-btn'),
      skipBtn: document.getElementById('skip-btn'),
      voiceSelect: document.getElementById('voice-select'),
      speedSlider: document.getElementById('speed-slider'),
      speedValue: document.getElementById('speed-value'),
      timeEstimate: document.getElementById('time-estimate'),
      progress: document.getElementById('progress'),
    };
  }

  bindEvents() {
    // Play button
    this.elements.playBtn.addEventListener('click', () => this.play());

    // Pause button
    this.elements.pauseBtn.addEventListener('click', () => this.pause());

    // Stop button
    this.elements.stopBtn.addEventListener('click', () => this.stop());

    // Skip button
    this.elements.skipBtn.addEventListener('click', () => this.skip());

    // Voice selection
    this.elements.voiceSelect.addEventListener('change', (e) => {
      this.setVoice(e.target.value);
    });

    // Speed slider
    this.elements.speedSlider.addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      this.elements.speedValue.textContent = `${speed.toFixed(2)}x`;
      this.setSpeed(speed);
      this.updateTimeEstimate();
    });

    // Click on paragraph to play from there
    this.elements.content.addEventListener('click', (e) => {
      const paragraph = e.target.closest('.paragraph');
      if (paragraph) {
        const index = parseInt(paragraph.dataset.index, 10);
        this.playFromParagraph(index);
      }
    });
  }

  async initTTS() {
    try {
      // Get API key and saved preferences from storage
      const { openaiKey, ttsVoice, ttsSpeed } = await chrome.storage.local.get([
        'openaiKey',
        'ttsVoice',
        'ttsSpeed'
      ]);

      if (!openaiKey) {
        this.showError('OpenAI API key not found. Please set your API key in the extension options.');
        return;
      }

      // Apply saved preferences to UI
      if (ttsVoice) {
        this.elements.voiceSelect.value = ttsVoice;
      }
      if (ttsSpeed) {
        this.elements.speedSlider.value = ttsSpeed;
        this.elements.speedValue.textContent = `${parseFloat(ttsSpeed).toFixed(2)}x`;
        this.updateTimeEstimate();
      }

      // Create TTS components
      const apiClient = new TTSApiClient(openaiKey);
      const audioPlayer = new AudioPlayer();

      // Create TTS engine with callbacks
      this.ttsEngine = new TTSEngine(apiClient, audioPlayer, {
        onParagraphStart: (index) => this.highlightParagraph(index),
        onParagraphEnd: (index) => this.markParagraphCompleted(index),
        onProgress: (current, total) => this.updateProgress(current, total),
        onStateChange: (state) => this.updateControlsState(state),
        onError: (error) => this.showError(`Playback error: ${error.message}`),
      });

      // Apply saved preferences to engine
      if (ttsVoice) {
        this.ttsEngine.setVoice(ttsVoice);
      }
      if (ttsSpeed) {
        this.ttsEngine.setSpeed(parseFloat(ttsSpeed));
      }

      // Load content into engine
      if (this.content?.paragraphs) {
        this.ttsEngine.loadContent(this.content.paragraphs);
      }

      // Enable controls
      this.enableControls();

    } catch (error) {
      this.showError(`Failed to initialize TTS: ${error.message}`);
    }
  }

  enableControls() {
    this.elements.playBtn.disabled = false;
    this.elements.voiceSelect.disabled = false;
    this.elements.speedSlider.disabled = false;
  }

  async loadContent() {
    try {
      // First check if content is already cached
      let response = await chrome.runtime.sendMessage({ type: 'GET_READER_CONTENT' });

      // If no cached content, request extraction
      if (!response?.content) {
        this.showPlaceholder('Extracting content...');
        response = await chrome.runtime.sendMessage({ type: 'EXTRACT_CONTENT' });

        if (response?.error) {
          throw new Error(response.error);
        }
      }

      if (!response?.content) {
        this.showPlaceholder('No content found on this page.');
        return;
      }

      this.content = response.content;
      this.renderContent();
      this.updateTimeEstimate();
      this.updateProgress(0, this.content.paragraphs.length);

      // If TTS engine already exists, load content into it
      if (this.ttsEngine) {
        this.ttsEngine.loadContent(this.content.paragraphs);
      }
    } catch (error) {
      this.showError(`Failed to load content: ${error.message}`);
    }
  }

  renderContent() {
    if (!this.content?.paragraphs) return;

    // Add page title if available
    let html = '';
    if (this.content.title) {
      html += `<h1 class="page-title">${this.escapeHtml(this.content.title)}</h1>`;
    }

    // Render paragraphs
    html += this.content.paragraphs
      .map((p, index) => `<div class="paragraph" id="${p.id}" data-index="${index}">${this.escapeHtml(p.text)}</div>`)
      .join('');

    this.elements.content.innerHTML = html;
  }

  // TTS Control Methods

  play() {
    if (this.ttsEngine) {
      this.ttsEngine.play();
    }
  }

  pause() {
    if (this.ttsEngine) {
      this.ttsEngine.pause();
    }
  }

  stop() {
    if (this.ttsEngine) {
      this.ttsEngine.stop();
      this.resetHighlights();
    }
  }

  skip() {
    if (this.ttsEngine) {
      this.ttsEngine.skip();
    }
  }

  playFromParagraph(index) {
    if (this.ttsEngine) {
      // Reset highlights before starting from new position
      this.resetHighlights();
      // Mark all paragraphs before the selected one as completed
      for (let i = 0; i < index; i++) {
        this.markParagraphCompleted(i);
      }
      this.ttsEngine.playFrom(index);
    }
  }

  setVoice(voice) {
    if (this.ttsEngine) {
      this.ttsEngine.setVoice(voice);
    }
    // Save preference
    chrome.storage.local.set({ ttsVoice: voice });
  }

  setSpeed(speed) {
    if (this.ttsEngine) {
      this.ttsEngine.setSpeed(speed);
    }
    // Save preference
    chrome.storage.local.set({ ttsSpeed: speed });
  }

  // UI Update Methods

  highlightParagraph(index) {
    // Remove current highlight from all paragraphs
    const paragraphs = this.elements.content.querySelectorAll('.paragraph');
    paragraphs.forEach(p => p.classList.remove('current'));

    // Add highlight to current paragraph
    const currentParagraph = this.elements.content.querySelector(`[data-index="${index}"]`);
    if (currentParagraph) {
      currentParagraph.classList.add('current');
      currentParagraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  markParagraphCompleted(index) {
    const paragraph = this.elements.content.querySelector(`[data-index="${index}"]`);
    if (paragraph) {
      paragraph.classList.remove('current');
      paragraph.classList.add('completed');
    }
  }

  resetHighlights() {
    const paragraphs = this.elements.content.querySelectorAll('.paragraph');
    paragraphs.forEach(p => {
      p.classList.remove('current', 'completed');
    });
  }

  updateControlsState(state) {
    switch (state) {
      case 'idle':
        this.elements.playBtn.disabled = false;
        this.elements.playBtn.textContent = 'Play';
        this.elements.pauseBtn.disabled = true;
        this.elements.stopBtn.disabled = true;
        this.elements.skipBtn.disabled = true;
        break;
      case 'playing':
        this.elements.playBtn.disabled = true;
        this.elements.playBtn.textContent = 'Play';
        this.elements.pauseBtn.disabled = false;
        this.elements.stopBtn.disabled = false;
        this.elements.skipBtn.disabled = false;
        break;
      case 'paused':
        this.elements.playBtn.disabled = false;
        this.elements.playBtn.textContent = 'Resume';
        this.elements.pauseBtn.disabled = true;
        this.elements.stopBtn.disabled = false;
        this.elements.skipBtn.disabled = false;
        break;
    }
  }

  updateProgress(current, total) {
    this.elements.progress.textContent = `${current} / ${total}`;
  }

  updateTimeEstimate() {
    if (!this.content?.totalCharCount) return;

    const speed = parseFloat(this.elements.speedSlider.value);
    // ~150 words/min at speed 1.0, avg word = 5 chars
    const wordsPerMinute = 150 * speed;
    const totalWords = this.content.totalCharCount / 5;
    const minutes = totalWords / wordsPerMinute;

    const mins = Math.floor(minutes);
    const secs = Math.floor((minutes - mins) * 60);
    this.elements.timeEstimate.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  showPlaceholder(message) {
    this.elements.content.innerHTML = `<p class="placeholder">${message}</p>`;
  }

  showError(message) {
    this.elements.content.innerHTML = `<p class="error">${message}</p>`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ReaderPanel();
});
