// reader/reader.js - Main entry point for the side panel

import AudioPlayer from './audioPlayer.js';
import TTSApiClient from './ttsApiClient.js';
import TTSEngine from './ttsEngine.js';
import playlist from './playlist.js';
import { withMethodLogging } from './debug.js';

class ReaderPanel {
  constructor() {
    this.content = null;
    this.elements = {};
    this.ttsEngine = null;
    withMethodLogging(this, 'ReaderPanel');
    this.init();
  }

  async init() {
    this.cacheElements();
    this.bindEvents();
    this.listenForMessages();
    await this.loadContent();
    await this.initTTS();
  }

  listenForMessages() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'READER_PING') {
        sendResponse({ open: true });
        return true;
      }
      if (msg.type === 'GO_TO_PARAGRAPH' && typeof msg.paragraphIndex === 'number') {
        this.goToParagraph(msg.paragraphIndex);
        sendResponse({ success: true, paragraphIndex: msg.paragraphIndex });
      }
      return true;
    });
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
      const { openaiKey, ttsVoice, ttsSpeed } = await chrome.storage.local.get([
        'openaiKey',
        'ttsVoice',
        'ttsSpeed'
      ]);

      if (!openaiKey) {
        this.showError('OpenAI API key not found. Please set your API key in the extension options.');
        return;
      }

      if (ttsVoice) {
        this.elements.voiceSelect.value = ttsVoice;
      }
      if (ttsSpeed) {
        this.elements.speedSlider.value = ttsSpeed;
        this.elements.speedValue.textContent = `${parseFloat(ttsSpeed).toFixed(2)}x`;
        this.updateTimeEstimate();
      }

      const apiClient = new TTSApiClient(openaiKey);
      const audioPlayer = new AudioPlayer();

      this.ttsEngine = new TTSEngine(apiClient, audioPlayer, {
        onParagraphStart: (index) => this.highlightParagraph(index),
        onParagraphEnd: (index) => this.markParagraphCompleted(index),
        onProgress: (current, total) => this.updateProgress(current, total),
        onStateChange: (state) => this.updateControlsState(state),
        onLoadingStart: (index) => this.showParagraphLoading(index),
        onLoadingEnd: (index) => this.hideParagraphLoading(index),
        onError: (error) => this.showError(`Playback error: ${error.message}`),
      });

      if (ttsVoice) {
        this.ttsEngine.setVoice(ttsVoice);
      }
      if (ttsSpeed) {
        this.ttsEngine.setSpeed(parseFloat(ttsSpeed));
      }

      if (this.content?.paragraphs) {
        this.ttsEngine.loadContent(this.content.paragraphs);
      }

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
      let response = await chrome.runtime.sendMessage({ type: 'GET_READER_CONTENT' });

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

      if (this.ttsEngine) {
        this.ttsEngine.loadContent(this.content.paragraphs);
      }
    } catch (error) {
      this.showError(`Failed to load content: ${error.message}`);
    }
  }

  renderContent() {
    if (!this.content?.paragraphs) return;

    let html = '';
    if (this.content.title) {
      html += `<h1 class="page-title">${this.escapeHtml(this.content.title)}</h1>`;
    }

    html += this.content.paragraphs
      .map((p, index) => `<div class="paragraph" id="${p.id}" data-index="${index}">${this.escapeHtml(p.text)}</div>`)
      .join('');

    this.elements.content.innerHTML = html;
  }

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
      this.resetHighlights();
      this.markParagraphsCompletedBefore(index);
      this.ttsEngine.playFrom(index);
    }
  }

  goToParagraph(index) {
    this.resetHighlights();
    this.markParagraphsCompletedBefore(index);
    this.highlightParagraph(index);
    playlist.goTo(index);
    this.updateProgress(index, this.content.paragraphs.length);
  }

  markParagraphsCompletedBefore(index) {
    const paragraphs = this.elements.content.querySelectorAll('.paragraph');
    paragraphs.forEach((p, i) => {
      if (i < index) p.classList.add('completed');
    });
  }

  setVoice(voice) {
    if (this.ttsEngine) {
      this.ttsEngine.setVoice(voice);
    }
    chrome.storage.local.set({ ttsVoice: voice });
  }

  setSpeed(speed) {
    if (this.ttsEngine) {
      this.ttsEngine.setSpeed(speed);
    }
    chrome.storage.local.set({ ttsSpeed: speed });
  }

  highlightParagraph(index) {
    const paragraphs = this.elements.content.querySelectorAll('.paragraph');
    paragraphs.forEach(p => p.classList.remove('current'));

    const currentParagraph = this.elements.content.querySelector(`[data-index="${index}"]`);
    if (currentParagraph) {
      currentParagraph.classList.add('current');
      currentParagraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  showParagraphLoading(index) {
    const paragraph = this.elements.content.querySelector(`[data-index="${index}"]`);
    if (paragraph) {
      paragraph.classList.add('loading');
    }
  }

  hideParagraphLoading(index) {
    const paragraph = this.elements.content.querySelector(`[data-index="${index}"]`);
    if (paragraph) {
      paragraph.classList.remove('loading');
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
