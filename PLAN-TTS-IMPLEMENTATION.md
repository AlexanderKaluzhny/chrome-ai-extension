# Text-to-Speech Feature Implementation Plan

## Overview

Add a "Read Aloud" feature to the Chrome extension that extracts page content, displays it in a side panel, and reads it aloud using OpenAI's TTS-1 API with streaming audio playback.

## OpenAI TTS API Reference

**Endpoint:** `POST https://api.openai.com/v1/audio/speech`

**Key Parameters:**
- `model`: `tts-1` (optimized for real-time, lower latency)
- `input`: Text to convert (max 4096 characters per request)
- `voice`: `alloy`, `ash`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage`, `shimmer`
- `response_format`: `mp3`, `opus`, `aac`, `flac`, `wav`, `pcm`
- `speed`: 0.25 to 4.0 (default 1.0)

**Streaming:** Supports chunk transfer encoding for real-time audio playback.

**Recommended format for streaming:** `mp3` (good balance) or `wav`/`pcm` (fastest, no decoding overhead)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         popup.js                                 │
│  [Summarize] [Read]  ←── New "Read" button                      │
└─────────────────────┬───────────────────────────────────────────┘
                      │ OPEN_READER message
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      background.js                               │
│  - Routes messages                                               │
│  - Injects reader content script                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Inject reader scripts
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Content Scripts (Reader)                      │
├─────────────────────────────────────────────────────────────────┤
│  reader/                                                         │
│  ├── readerPanel.js      # Panel UI rendering & management       │
│  ├── textExtractor.js    # Extract & format page content         │
│  ├── ttsEngine.js        # Orchestrates reading flow             │
│  ├── ttsApiClient.js     # OpenAI TTS API wrapper                │
│  ├── audioPlayer.js      # Audio playback & queue management     │
│  └── readerPanel.css     # Panel styles                          │
└─────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `readerPanel.js` | Creates/destroys the side panel, renders HTML content, handles UI interactions (play/pause/stop), shows progress |
| `textExtractor.js` | Uses Readability to extract page content, splits into paragraphs, wraps each in `<div id="p-{n}">`, calculates reading time |
| `ttsEngine.js` | Coordinates the reading flow: iterates through paragraphs, manages state (playing/paused/stopped), handles paragraph transitions |
| `ttsApiClient.js` | Handles OpenAI TTS API calls, manages streaming responses, handles errors and retries |
| `audioPlayer.js` | Web Audio API wrapper, plays audio chunks, manages playback state, emits events on completion |

---

## Implementation Steps

### Phase 1: Panel UI & Text Extraction

#### Step 1.1: Create Reader Panel Module (`reader/readerPanel.js`)

**Responsibilities:**
- Create a fixed side panel (right side, ~400px width)
- Panel structure:
  ```html
  <div id="reader-panel">
    <div class="reader-header">
      <h3>Reader</h3>
      <div class="reader-controls">
        <button id="reader-play-btn">▶ Play</button>
        <button id="reader-pause-btn" disabled>⏸ Pause</button>
        <button id="reader-stop-btn" disabled>⏹ Stop</button>
        <select id="reader-voice-select">...</select>
        <input type="range" id="reader-speed" min="0.5" max="2" step="0.25" value="1">
      </div>
      <div class="reader-info">
        <span id="reader-time-estimate">Est. reading time: --:--</span>
        <span id="reader-progress">0 / 0 paragraphs</span>
      </div>
      <button id="reader-close-btn">✕</button>
    </div>
    <div class="reader-content" id="reader-content">
      <!-- Paragraphs rendered here -->
    </div>
  </div>
  ```
- Methods:
  - `open()` - Show panel with animation
  - `close()` - Hide and cleanup
  - `renderContent(paragraphs)` - Render paragraph divs
  - `highlightParagraph(id)` - Add highlight class, scroll into view
  - `updateProgress(current, total)` - Update progress display
  - `setPlaybackState(state)` - Update button states (idle/playing/paused)

#### Step 1.2: Create Text Extractor Module (`reader/textExtractor.js`)

**Responsibilities:**
- Extract clean text using Readability (already available in the project)
- Split content into paragraphs (by double newlines, `<p>` tags, etc.)
- Return structured data:
  ```javascript
  {
    title: "Article Title",
    paragraphs: [
      { id: "p-0", text: "First paragraph...", charCount: 150 },
      { id: "p-1", text: "Second paragraph...", charCount: 200 },
      // ...
    ],
    totalCharCount: 5000,
    estimatedReadingTime: "5:30" // Based on ~150 words/min or TTS speed
  }
  ```
- Methods:
  - `extractContent()` - Main extraction function
  - `splitIntoParagraphs(text)` - Split and filter empty paragraphs
  - `calculateReadingTime(charCount, speed)` - Estimate TTS duration

#### Step 1.3: Create Panel Styles (`reader/readerPanel.css`)

- Fixed position panel on right side
- Smooth slide-in animation
- Paragraph styling with hover states
- Current paragraph highlight (e.g., light blue background)
- Responsive controls
- Scrollable content area

#### Step 1.4: Update Popup UI (`popup.html`, `popup.js`)

- Add "Read" button next to "Summarize"
- On click, send `OPEN_READER` message to background script

#### Step 1.5: Update Background Script (`background.js`)

- Handle `OPEN_READER` message
- Inject reader content scripts into active tab
- Handle `GET_TTS_CONFIG` message to provide API key

---

### Phase 2: Add Playback Controls

#### Step 2.1: Create Audio Player Module (`reader/audioPlayer.js`)

**Responsibilities:**
- Manage Web Audio API context
- Play audio blobs/arraybuffers
- Handle playback events
- Methods:
  - `play(audioData)` - Play audio data, return Promise that resolves on completion
  - `pause()` - Pause current playback
  - `resume()` - Resume paused playback
  - `stop()` - Stop and reset
  - `setVolume(level)` - Volume control (0-1)
  - Event callbacks: `onEnded`, `onError`

#### Step 2.2: Wire Up Panel Controls

- Connect Play/Pause/Stop buttons to TTS engine
- Voice selector populated with available voices
- Speed slider updates TTS speed parameter
- Close button properly cleans up resources

---

### Phase 3: TTS API Integration

#### Step 3.1: Create TTS API Client (`reader/ttsApiClient.js`)

**Responsibilities:**
- Make requests to OpenAI TTS API
- Handle streaming responses
- Error handling and rate limiting

```javascript
class TTSApiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1/audio/speech';
  }

  async synthesize(text, options = {}) {
    const {
      model = 'tts-1',
      voice = 'alloy',
      speed = 1.0,
      responseFormat = 'mp3'
    } = options;

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        speed,
        response_format: responseFormat
      })
    });

    if (!response.ok) {
      throw new Error(`TTS API error: ${response.status}`);
    }

    // Return audio as ArrayBuffer for Web Audio API
    return await response.arrayBuffer();
  }
}
```

**Notes:**
- TTS-1 has a 4096 character limit per request
- For paragraphs exceeding this, split into smaller chunks
- Consider prefetching next paragraph while current is playing

#### Step 3.2: Create TTS Engine (`reader/ttsEngine.js`)

**Responsibilities:**
- Coordinate reading flow
- Manage reading state
- Handle paragraph transitions

```javascript
class TTSEngine {
  constructor(apiClient, audioPlayer, panel) {
    this.apiClient = apiClient;
    this.audioPlayer = audioPlayer;
    this.panel = panel;
    this.paragraphs = [];
    this.currentIndex = 0;
    this.state = 'idle'; // idle, playing, paused
    this.options = { voice: 'alloy', speed: 1.0 };
  }

  async loadContent(paragraphs) {
    this.paragraphs = paragraphs;
    this.currentIndex = 0;
  }

  async play() {
    if (this.state === 'paused') {
      this.audioPlayer.resume();
      this.state = 'playing';
      return;
    }

    this.state = 'playing';
    await this.readFromCurrent();
  }

  async readFromCurrent() {
    while (this.currentIndex < this.paragraphs.length && this.state === 'playing') {
      const paragraph = this.paragraphs[this.currentIndex];

      // Highlight current paragraph in panel
      this.panel.highlightParagraph(paragraph.id);
      this.panel.updateProgress(this.currentIndex + 1, this.paragraphs.length);

      try {
        // Synthesize audio for current paragraph
        const audioData = await this.apiClient.synthesize(
          paragraph.text,
          this.options
        );

        // Play and wait for completion
        await this.audioPlayer.play(audioData);

        this.currentIndex++;
      } catch (error) {
        console.error('TTS error:', error);
        this.state = 'idle';
        throw error;
      }
    }

    if (this.currentIndex >= this.paragraphs.length) {
      this.state = 'idle';
      this.currentIndex = 0;
    }
  }

  pause() {
    this.audioPlayer.pause();
    this.state = 'paused';
  }

  stop() {
    this.audioPlayer.stop();
    this.state = 'idle';
    this.currentIndex = 0;
  }

  setVoice(voice) {
    this.options.voice = voice;
  }

  setSpeed(speed) {
    this.options.speed = speed;
  }
}
```

---

### Phase 4: Polish & Enhancements

#### Step 4.1: Prefetching (Performance Optimization)

- While playing paragraph N, prefetch audio for paragraph N+1
- Store in a small buffer (1-2 paragraphs ahead)
- Reduces perceived latency between paragraphs

#### Step 4.2: Progress Persistence

- Save reading position to localStorage
- Option to resume from where user left off

#### Step 4.3: Error Handling

- Handle API errors gracefully (rate limits, network issues)
- Show user-friendly error messages
- Retry logic for transient failures

#### Step 4.4: Accessibility

- Keyboard shortcuts (Space for play/pause, Escape to close)
- ARIA labels for screen readers

---

## File Structure

```
chrome-ai-extension/
├── manifest.json              # Add reader scripts to web_accessible_resources
├── background.js              # Add OPEN_READER, GET_TTS_CONFIG handlers
├── popup.html                 # Add "Read" button
├── popup.js                   # Handle "Read" button click
├── reader/
│   ├── index.js               # Main entry point, initializes modules
│   ├── readerPanel.js         # Panel UI component
│   ├── readerPanel.html       # Panel HTML template
│   ├── readerPanel.css        # Panel styles
│   ├── textExtractor.js       # Content extraction
│   ├── ttsEngine.js           # Reading orchestration
│   ├── ttsApiClient.js        # OpenAI TTS API wrapper
│   └── audioPlayer.js         # Audio playback
└── style/
    └── ... (existing styles)
```

---

## Manifest.json Updates

```json
{
  "web_accessible_resources": [
    {
      "resources": [
        "reader/*",
        "summary.html",
        "content.html",
        "style/*",
        "lib/*"
      ],
      "matches": ["<all_urls>"]
    }
  ]
}
```

---

## Message Protocol

| Message Type | Direction | Payload | Purpose |
|--------------|-----------|---------|---------|
| `OPEN_READER` | popup → background | `{}` | Request to open reader panel |
| `GET_TTS_CONFIG` | content → background | `{}` | Get API key for TTS |
| `TTS_CONFIG` | background → content | `{ apiKey, voice, speed }` | Return TTS configuration |

---

## Reading Time Estimation

Formula based on TTS-1 characteristics:
- Average TTS speed: ~150 words per minute at speed 1.0
- Average word length: ~5 characters
- Calculation: `(totalChars / 5) / 150 * (1 / speed)` minutes

---

## Testing Checklist

- [ ] Panel opens and closes correctly
- [ ] Text extraction works on various page types
- [ ] Paragraphs are correctly split and rendered
- [ ] Play/Pause/Stop controls work as expected
- [ ] Current paragraph is highlighted during playback
- [ ] Panel scrolls to show current paragraph
- [ ] Voice and speed settings are applied
- [ ] Reading time estimate is accurate
- [ ] Error handling works (no API key, network error, etc.)
- [ ] Panel doesn't interfere with page functionality
- [ ] Works across different websites

---

## Implementation Order Summary

1. **Phase 1: Panel UI & Text Extraction**
   - 1.1 Create `readerPanel.js` with basic UI
   - 1.2 Create `textExtractor.js` for content extraction
   - 1.3 Create `readerPanel.css` for styling
   - 1.4 Update `popup.html/js` with "Read" button
   - 1.5 Update `background.js` to handle messages & inject scripts

2. **Phase 2: Playback Controls**
   - 2.1 Create `audioPlayer.js` for audio playback
   - 2.2 Wire up panel controls to engine

3. **Phase 3: TTS API Integration**
   - 3.1 Create `ttsApiClient.js` for API calls
   - 3.2 Create `ttsEngine.js` for orchestration

4. **Phase 4: Polish & Enhancements**
   - 4.1 Add prefetching
   - 4.2 Progress persistence
   - 4.3 Error handling
   - 4.4 Accessibility features

---

## Notes

- **4096 character limit**: TTS-1 has a max input of 4096 chars. Long paragraphs need chunking.
- **Rate limiting**: Reuse existing `apiRateLimiter` from background.js or create similar in content script.
- **Voice options for TTS-1**: `alloy`, `ash`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage`, `shimmer`
- **Best format for streaming**: `mp3` (good compression, widely supported) or `wav` (fastest, no decode overhead)
