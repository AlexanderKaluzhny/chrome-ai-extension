// reader/reader.js - Main entry point for the side panel

class ReaderPanel {
  constructor() {
    this.content = null;
    this.elements = {};
    this.init();
  }

  async init() {
    this.cacheElements();
    await this.loadContent();
  }

  cacheElements() {
    this.elements = {
      content: document.getElementById('content'),
      playBtn: document.getElementById('play-btn'),
      pauseBtn: document.getElementById('pause-btn'),
      stopBtn: document.getElementById('stop-btn'),
      voiceSelect: document.getElementById('voice-select'),
      speedSlider: document.getElementById('speed-slider'),
      speedValue: document.getElementById('speed-value'),
      timeEstimate: document.getElementById('time-estimate'),
      progress: document.getElementById('progress'),
    };
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
