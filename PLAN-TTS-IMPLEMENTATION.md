# Text-to-Speech Feature Implementation Plan

## Overview

Add a "Read Aloud" feature to the Chrome extension that extracts page content, displays it in Chrome's native Side Panel, and reads it aloud using OpenAI's TTS-1 API with streaming audio playback.

---

## OpenAI TTS API Reference

**Endpoint:** `POST https://api.openai.com/v1/audio/speech`

**Key Parameters:**
- `model`: `tts-1` (optimized for real-time, lower latency)
- `input`: Text to convert (max 4096 characters per request)
- `voice`: `alloy`, `ash`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage`, `shimmer`
- `response_format`: `mp3`, `opus`, `aac`, `flac`, `wav`, `pcm`
- `speed`: 0.25 to 4.0 (default 1.0)

**Streaming:** Supports chunk transfer encoding for real-time audio playback.

**Recommended format:** `mp3` (good balance) or `wav`/`pcm` (fastest, no decoding overhead)

---

## Chrome Side Panel API

Chrome's native Side Panel API (available since Chrome 114, Manifest V3) provides a built-in side panel UI that's superior to custom injected panels.

### Manifest Configuration

- Add `side_panel` key with `default_path` pointing to reader HTML
- Add `sidePanel` to permissions array

### Key API Methods

| Method | Purpose |
|--------|---------|
| `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` | Open panel when toolbar icon clicked |
| `chrome.sidePanel.open({ windowId })` | Programmatically open the panel |
| `chrome.sidePanel.setOptions({ tabId, path, enabled })` | Enable/disable panel for specific tabs |

### Benefits Over Custom Injected Panel

| Native Side Panel | Custom Injected Panel |
|-------------------|----------------------|
| Native Chrome UI | Injected DOM element |
| Persists across tab switches | Lost on navigation |
| Full Chrome API access | Limited to content script APIs |
| User can resize/dock | Fixed position |
| No CSS conflicts with page | Potential style conflicts |
| Works on all pages including chrome:// | Can't work on restricted pages |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         popup.html/js                            │
│  [Summarize] [Read]  ←── New "Read" button                      │
└─────────────────────┬───────────────────────────────────────────┘
                      │ OPEN_READER message
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      background.js                               │
│  - Opens side panel via chrome.sidePanel.open()                  │
│  - Extracts page content via scripting.executeScript()           │
│  - Stores extracted content for side panel retrieval             │
│  - Provides API key to side panel                                │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                Chrome Side Panel (reader/)                       │
├─────────────────────────────────────────────────────────────────┤
│  reader/                                                         │
│  ├── reader.html         # Side panel HTML structure             │
│  ├── reader.js           # Main entry, initializes modules       │
│  ├── reader.css          # Side panel styles                     │
│  ├── ttsEngine.js        # Orchestrates reading flow             │
│  ├── ttsApiClient.js     # OpenAI TTS API wrapper                │
│  └── audioPlayer.js      # Audio playback & queue management     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `reader.html` | Side panel HTML structure with controls and content area |
| `reader.js` | Main entry point, initializes modules, handles UI interactions, renders paragraphs |
| `reader.css` | Side panel styling, paragraph highlights, controls |
| `ttsEngine.js` | Coordinates reading flow: iterates through paragraphs, manages state (playing/paused/stopped), handles paragraph transitions |
| `ttsApiClient.js` | Handles OpenAI TTS API calls, returns audio as ArrayBuffer, handles errors |
| `audioPlayer.js` | Plays audio blobs via HTML5 Audio element, manages playback state, emits events on completion |

---

## File Structure

```
ai-ext/
├── manifest.json              # Add side_panel + sidePanel permission
├── background.js              # Add OPEN_READER handler, text extraction
├── popup.html                 # Add "Read" button
├── popup.js                   # Handle "Read" button click
├── reader/
│   ├── reader.html            # Side panel HTML (loaded by Chrome)
│   ├── reader.js              # Main entry point (ES module)
│   ├── reader.css             # Side panel styles
│   ├── ttsEngine.js           # Reading orchestration (ES module)
│   ├── ttsApiClient.js        # OpenAI TTS API wrapper (ES module)
│   └── audioPlayer.js         # Audio playback (ES module)
├── content.js                 # Existing (word helper)
└── ... (existing files)
```

---

## Implementation Steps

### Phase 1: Side Panel Setup & Text Extraction

#### Step 1.1: Update Manifest (`manifest.json`)

- Add `side_panel.default_path` pointing to `reader/reader.html`
- Add `sidePanel` to the permissions array

#### Step 1.2: Create Side Panel HTML (`reader/reader.html`)

Structure:
- Header with title and reading info (time estimate, progress)
- Controls section with:
  - Play/Pause/Stop/Skip buttons
  - Voice selector dropdown (all TTS-1 voices)
  - Speed slider (0.5x to 2x, step 0.25)
- Content area for rendered paragraphs
  - Each paragraph has a "Play from here" button (visible on hover or always visible)
- Load reader.js as ES module

#### Step 1.3: Create Side Panel Styles (`reader/reader.css`)

- Full-height flexbox layout
- Header and controls with border separators
- Control buttons with hover/disabled states
- Paragraph styling:
  - Default state with subtle styling
  - `.current` class: blue background, left border highlight
  - `.completed` class: dimmed text
  - Hover state for interactivity
  - "Play from here" button: small icon button, visible on hover or inline
- Placeholder and error message styles

#### Step 1.4: Update Popup UI (`popup.html`)

- Wrap buttons in a `.button-group` container
- Add "Read" button next to existing "Summarize" button

#### Step 1.5: Update Popup Script (`popup.js`)

- Add click handler for "Read" button
- Send `OPEN_READER` message to background script
- Close popup after sending message

#### Step 1.6: Update Background Script (`background.js`)

Add:
- `readerStore` object to hold extracted content
- `OPEN_READER` message handler that:
  1. Gets active tab
  2. Executes script to extract content using Readability
  3. Splits text into paragraphs (by double newlines)
  4. Creates paragraph objects with `id`, `text`, `charCount`
  5. Stores in `readerStore`
  6. Opens side panel via `chrome.sidePanel.open()`
- `GET_READER_CONTENT` message handler that returns stored content

---

### Phase 2: Side Panel Core Logic

#### Step 2.1: Create Main Reader Module (`reader/reader.js`)

Class `ReaderPanel` with:

**Properties:**
- `content` - extracted page content
- `ttsEngine` - TTS engine instance
- `elements` - cached DOM element references

**Methods:**
- `init()` - initialize panel (cache elements, bind events, load content, init TTS)
- `cacheElements()` - store references to DOM elements
- `bindEvents()` - attach event listeners to controls and paragraph "play from here" buttons
- `loadContent()` - request content from background via message
- `initTTS()` - get API key from storage, create TTSApiClient, AudioPlayer, TTSEngine
- `renderContent()` - render paragraphs as divs with IDs, data-index attributes, and "play from here" buttons
- `highlightParagraph(index)` - add `.current` class, scroll into view
- `markParagraphCompleted(index)` - add `.completed` class
- `updateProgress(current, total)` - update progress display
- `updateTimeEstimate()` - calculate and display estimated reading time
- `updateControlsState(state)` - enable/disable buttons based on state
- `play()`, `pause()`, `stop()`, `skip()` - delegate to TTS engine
- `playFromParagraph(index)` - stop current playback and start from specified paragraph
- `setVoice(voice)`, `setSpeed(speed)` - update TTS options
- `showPlaceholder(message)`, `showError(message)` - display messages
- `escapeHtml(text)` - sanitize text for HTML rendering

---

### Phase 3: TTS Engine & API Integration

#### Step 3.1: Create Audio Player Module (`reader/audioPlayer.js`)

Class `AudioPlayer` with:

**Properties:**
- `audio` - HTML5 Audio element instance
- `isPlaying` - current playback state

**Methods:**
- `play(audioData)` - create Blob from ArrayBuffer, create object URL, play audio, return Promise that resolves on `ended` event
- `pause()` - pause current audio
- `resume()` - resume paused audio
- `stop()` - stop and reset audio element
- `setVolume(level)` - set volume (0-1)

**Behavior:**
- Clean up object URLs after playback to prevent memory leaks
- Handle playback errors gracefully

#### Step 3.2: Create TTS API Client (`reader/ttsApiClient.js`)

Class `TTSApiClient` with:

**Constructor:**
- Takes API key as parameter
- Stores base URL for TTS endpoint

**Methods:**
- `synthesize(text, options)` - make POST request to OpenAI TTS API:
  - Parameters: model, input, voice, speed, response_format
  - Return ArrayBuffer of audio data
  - Throw error on API failure with status and message
- `splitTextIntoChunks(text, maxLength)` - split text longer than 4096 chars:
  - Find sentence boundaries (`. `) or word boundaries as break points
  - Return array of chunks

#### Step 3.3: Create TTS Engine (`reader/ttsEngine.js`)

Class `TTSEngine` with:

**Constructor:**
- Takes apiClient, audioPlayer, callbacks object
- Callbacks: `onParagraphStart`, `onParagraphEnd`, `onProgress`, `onStateChange`, `onError`

**Properties:**
- `paragraphs` - array of paragraph objects
- `currentIndex` - current reading position
- `state` - `'idle'` | `'playing'` | `'paused'`
- `options` - voice and speed settings
- `prefetchedAudio` - buffer for next paragraph's audio
- `prefetchIndex` - index of prefetched paragraph

**Methods:**
- `loadContent(paragraphs)` - store paragraphs, reset state
- `play()` - if paused, resume; otherwise start reading from current position
- `playFrom(index)` - stop current playback, set currentIndex to specified index, start playing
- `readFromCurrent()` - loop through paragraphs:
  1. Notify paragraph start via callback
  2. Use prefetched audio or synthesize new
  3. Start prefetching next paragraph (non-blocking)
  4. Play audio and wait for completion
  5. Notify paragraph end, increment index
  6. Handle errors, update state
- `synthesizeParagraph(text)` - handle chunking for long paragraphs, concatenate audio buffers
- `concatenateAudioBuffers(buffers)` - combine multiple ArrayBuffers into one
- `prefetchNext()` - synthesize next paragraph in background
- `pause()` - pause audio, update state
- `skip()` - stop current paragraph audio, increment index, continue playing from next paragraph
- `stop()` - stop audio, reset index and state, clear prefetch
- `setVoice(voice)`, `setSpeed(speed)` - update options, clear prefetch cache

---

### Phase 4: Polish & Enhancements

#### Step 4.1: Update Popup Styles (`style/popup.css`)

- Add `.button-group` styling for horizontal button layout
- Ensure consistent button sizing

#### Step 4.2: Error Handling

- Display user-friendly error for missing API key
- Handle network errors with clear messages
- Handle rate limiting gracefully

#### Step 4.3: State Persistence

- Save voice preference to chrome.storage
- Save speed preference to chrome.storage
- Load saved preferences on panel init

#### Step 4.4: Accessibility

- Add keyboard shortcut: Space for play/pause
- Add ARIA labels to controls
- Ensure focus management

---

## Message Protocol

| Message Type | Direction | Payload | Purpose |
|--------------|-----------|---------|---------|
| `OPEN_READER` | popup → background | `{}` | Request to extract content and open side panel |
| `GET_READER_CONTENT` | sidepanel → background | `{}` | Retrieve extracted content |

---

## Data Structures

### Extracted Content (stored in `readerStore.content`)

```
{
  title: string,           // Page title
  paragraphs: [            // Array of paragraph objects
    {
      id: string,          // "p-0", "p-1", etc.
      text: string,        // Paragraph text content
      charCount: number    // Character count for time estimation
    }
  ],
  totalCharCount: number,  // Sum of all paragraph char counts
  url: string              // Source page URL
}
```

---

## Reading Time Estimation

Formula based on TTS-1 characteristics:
- Average TTS speed: ~150 words per minute at speed 1.0
- Average word length: ~5 characters
- Calculation: `(totalChars / 5) / (150 * speed)` minutes

---

## Testing Checklist

- [x] Side panel opens correctly from popup "Read" button
- [x] Text extraction works on various page types (articles, blogs, docs)
- [x] Paragraphs render correctly in side panel with proper IDs
- [x] Play/Pause/Stop controls work as expected
- [x] Skip button skips current paragraph and continues to next
- [x] Current paragraph is highlighted during playback
- [x] Panel scrolls to show current paragraph
- [x] Voice selection changes the TTS voice
- [x] Speed slider adjusts playback speed
- [x] Reading time estimate updates with speed changes
- [x] Voice/Speed preferences are persisted to storage
- [x] "Play from here" (click paragraph) - Fixed with Playlist state machine
- [ ] Error handling works (no API key, network error, rate limit)
- [ ] Prefetching reduces latency between paragraphs
- [ ] Long paragraphs (>4096 chars) are properly chunked

---

## Implementation Order Summary

1. **Phase 1: Side Panel Setup & Text Extraction**
   - 1.1 Update manifest.json with side_panel config
   - 1.2 Create reader/reader.html
   - 1.3 Create reader/reader.css
   - 1.4 Update popup.html with "Read" button
   - 1.5 Update popup.js with read handler
   - 1.6 Update background.js with OPEN_READER handler

2. **Phase 2: Side Panel Core Logic**
   - 2.1 Create reader/reader.js (main entry point)

3. **Phase 3: TTS Engine & API Integration**
   - 3.1 Create reader/audioPlayer.js
   - 3.2 Create reader/ttsApiClient.js
   - 3.3 Create reader/ttsEngine.js

4. **Phase 4: Polish & Enhancements**
   - 4.1 Update popup styles
   - 4.2 Error handling
   - 4.3 State persistence
   - 4.4 Accessibility

---

## Current Implementation Status

**Last Updated:** 2025-12-29

### Completed
- Phase 1: Side Panel Setup & Text Extraction ✅
- Phase 2: Side Panel Core Logic ✅
- Phase 3: TTS Engine & API Integration ✅
- Phase 4.1: Popup styles ✅
- Phase 4.3: State persistence (voice/speed) ✅

### Bug Fixes Completed
- **Race condition in `playFrom()`** - Fixed by introducing Playlist component with state machine
- **Race condition in `skip()`** - Fixed by waiting for old loop to exit before advancing
- **`audioPlayer.stop()` not resolving pending Promise** - Fixed by storing and calling pendingResolve

### Architecture Improvements
- **Playlist component** (`reader/playlist.js`) - Singleton that manages playback state:
  - Owns: `paragraphs[]`, `currentIndex`, `state`
  - State machine: `idle` → `playing` ↔ `paused` → `stopping` → `idle`
  - Guards against race conditions with `loopExitPromise`
  - See `PROBLEM-STATE-MACHINE.md` for detailed analysis

- **TTSEngine refactored** - Now delegates state management to Playlist:
  - Removed: `paragraphs`, `currentIndex`, `state`, `shouldStop`
  - Uses `playlist.shouldContinue()` in loops
  - Calls `playlist.notifyLoopExit()` when loop exits

- **Enhanced debug logging** (`reader/debug.js`):
  - Call depth indentation showing nested calls
  - Entry (`→`) and exit (`←`) markers
  - Arguments and return values formatted
  - Async-aware (handles Promises correctly)

### Not Started
- Phase 4.2: Error handling improvements
- Phase 4.4: Accessibility
- Prefetching optimization

### Files Created/Modified
- `reader/playlist.js` - NEW: Singleton playlist with state machine
- `reader/debug.js` - Enhanced with call depth, args, return values
- `reader/ttsEngine.js` - Refactored to use Playlist
- `reader/audioPlayer.js` - Fixed stop() to resolve pending play()
- `PROBLEM-STATE-MACHINE.md` - Documents the race condition analysis

---

## Notes

- **4096 character limit**: TTS-1 has a max input of 4096 chars. Long paragraphs are automatically chunked.
- **Voice options for TTS-1**: `alloy`, `ash`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage`, `shimmer`
- **Prefetching**: Next paragraph is prefetched while current is playing to reduce latency.
- **ES Modules**: All reader modules use ES module syntax (`import`/`export`).
- **Content extraction**: Uses Readability library (already in project) via `chrome.scripting.executeScript()`.
