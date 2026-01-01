# Architecture Overview

This Chrome extension ("AI Page Explorer") combines AI-powered page summarization with an interactive text-to-speech reading experience.

## Directory Structure

```
ai-ext/
├── reader/              # TTS reading panel subsystem
│   ├── reader.js        # Main side panel controller
│   ├── ttsEngine.js     # Reading flow orchestration
│   ├── ttsApiClient.js  # OpenAI TTS API wrapper
│   ├── audioCache.js    # Audio caching with prefetching
│   ├── audioPlayer.js   # Low-level playback control
│   ├── playlist.js      # Playback state machine
│   ├── debug.js         # Debugging utilities
│   ├── reader.html      # Side panel markup
│   └── reader.css       # Side panel styles
├── utils/               # Shared utilities
│   ├── tts.js           # TTS helper for any extension context
│   └── truncatedHtml.js # "Navigate in Reader" helpers
├── style/               # Stylesheets
│   ├── bubble.css       # Word definition bubble styles
│   ├── popup.css        # Popup interface styles
│   └── github-markdown-light.css
├── lib/                 # Third-party libraries
│   ├── Readability.min.js  # Mozilla content extraction
│   └── marked.umd.min.js   # Markdown rendering
├── icons/               # Extension icons (various sizes)
├── manifest.json        # Extension configuration
├── background.js        # Service worker
├── content.js           # Content script (injected into pages)
├── popup.html/js        # Extension popup UI
├── options.html/js      # Settings page
└── offscreen.html/js    # Audio playback (CSP workaround)
```

## Core Components

### 1. Background Service Worker (`background.js`)

The central coordinator that:
- Handles summarization requests via OpenAI API
- Manages word definition lookups
- Coordinates TTS synthesis requests
- Routes messages between content scripts and UI components

### 2. Content Script (`content.js`)

Injected into all web pages to:
- Detect word double-click selections
- Display definition bubbles with "Define", "Read", and "Pronounce" buttons
- Extract page content for the reader
- Handle "Navigate in Reader" by finding clicked paragraph index

### 3. Reader Subsystem (`/reader`)

A sophisticated TTS engine with clean separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                     reader.js                           │
│              (UI Controller & Orchestrator)             │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    ttsEngine.js                         │
│         (Reading Flow & Prefetch Coordination)          │
└─────────────────────────────────────────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│  audioCache.js  │ │ playlist.js │ │  audioPlayer.js │
│ (API & Caching) │ │   (State)   │ │   (Playback)    │
└─────────────────┘ └─────────────┘ └─────────────────┘
           │
           ▼
┌─────────────────┐
│ ttsApiClient.js │
│  (OpenAI TTS)   │
└─────────────────┘
```

**Module Responsibilities:**

| Module | Responsibility |
|--------|----------------|
| `reader.js` | Side panel UI, paragraph rendering, user interactions |
| `ttsEngine.js` | Orchestrates reading: play, pause, skip, prefetch next |
| `playlist.js` | State machine (idle → playing → paused → stopping) |
| `audioCache.js` | Caches audio blobs, manages pending fetches, tracks loading state |
| `ttsApiClient.js` | OpenAI TTS API wrapper, returns audio blobs |
| `audioPlayer.js` | Creates Audio elements, handles playback events |

### 4. Offscreen Document (`offscreen.js`)

Workaround for Content Security Policy restrictions. Pages with strict CSP block audio playback, so audio is played in the extension's offscreen document context instead.

## Data Flows

### Flow 1: Page Summarization

```
User clicks "Summarize"
        │
        ▼
    popup.js ──SUMMARIZE_TAB──► background.js
                                     │
                                     ▼
                              Extract content
                              (Readability.js)
                                     │
                                     ▼
                              OpenAI Chat API
                                     │
                                     ▼
                              New tab with summary
```

### Flow 2: Word Definition

```
User double-clicks word
        │
        ▼
    content.js
    (detect selection)
        │
        ▼
    Show bubble UI
        │
        ▼ (user clicks "Define")
        │
    background.js ──► OpenAI API
        │
        ▼
    Display definition in bubble
```

### Flow 3: Text-to-Speech Reading

```
User clicks "Read"
        │
        ▼
    popup.js opens side panel
        │
        ▼
    reader.js loads content (Readability)
        │
        ▼
    TTSEngine.play()
        │
        ├──► audioCache.get(index)
        │         │
        │         ▼
        │    ttsApiClient.synthesize()
        │         │
        │         ▼
        │    Cache audio blob
        │
        ├──► Prefetch next paragraph
        │
        └──► audioPlayer.play(blob)
                  │
                  ▼
             offscreen.js (if CSP blocked)
```

### Flow 4: Navigate in Reader

When user clicks a paragraph on the page and wants to jump to it in the reader:

```
User clicks paragraph on page
        │
        ▼
    content.js
        │
        ▼
    truncatedHtml.js
    (truncate DOM at clicked element)
        │
        ▼
    Run Readability on truncated HTML
        │
        ▼
    Count paragraphs to get index
        │
        ▼
    Send index to reader.js
        │
        ▼
    Reader scrolls & highlights paragraph
```

## State Management

### Playlist States (`playlist.js`)

```
        ┌─────────┐
        │  IDLE   │◄─────────────────┐
        └────┬────┘                  │
             │ play()                │ stop()
             ▼                       │
        ┌─────────┐            ┌─────────┐
        │ PLAYING │───pause()─►│ PAUSED  │
        └────┬────┘◄──resume()─└─────────┘
             │                       │
             │ stop()                │ stop()
             ▼                       │
        ┌──────────┐                 │
        │ STOPPING │─────────────────┘
        └──────────┘
```

### Audio Cache States

Each paragraph can be in one of these states:
- **Not cached** - No audio data
- **Pending** - Fetch in progress (shows loading indicator)
- **Cached** - Audio blob ready for playback

## External Dependencies

| Library | Purpose | Location |
|---------|---------|----------|
| Mozilla Readability | Extract article content from pages | `/lib/Readability.min.js` |
| Marked.js | Render markdown (summaries) | `/lib/marked.umd.min.js` |
| OpenAI API | Chat completions & TTS synthesis | External service |

## Chrome Extension APIs Used

- **storage.sync** - Persist settings (API key, voice, speed)
- **sidePanel** - Reader interface
- **offscreen** - Audio playback outside page context
- **scripting** - Inject content scripts
- **tabs** - Tab management and messaging
- **runtime** - Message passing between components

## Design Decisions

1. **Modular TTS Architecture** - Separating cache, player, state, and API concerns allows independent testing and modification.

2. **Prefetching** - AudioCache fetches the next paragraph while current one plays, minimizing gaps.

3. **Offscreen Audio** - Using Chrome's offscreen API bypasses CSP restrictions that would block audio on many sites.

4. **Readability for Navigation** - Truncating HTML and re-running Readability to find paragraph indices is clever but computationally heavy; works well for the use case.

5. **Cached Pronunciations** - Word pronunciations are cached to avoid repeated API calls for the same word.
