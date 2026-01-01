// ES module - Readability is injected into pages, not used directly here
import { synthesizeText } from './utils/tts.js';

const CONFIG = {
  DEFAULT_OPENAI_MODEL: 'gpt-4o-mini',
  DEFAULT_BASE_PROMPT: 'Summarize the following text in a concise and comprehensive way. Format your response using Markdown with appropriate headings, bullet points, and emphasis where helpful.',
  DEBUG_MODE: true, // Set to true for development
  MIN_TIME_BETWEEN_REQUESTS: 1000 // 1 second in milliseconds
};

// Simple rate limiter
const apiRateLimiter = {
  lastRequestTime: 0,
  
  async throttle() {
    const now = Date.now();
    const timeElapsed = now - this.lastRequestTime;
    
    if (timeElapsed < CONFIG.MIN_TIME_BETWEEN_REQUESTS) {
      debug('Rate limiting in effect. Waiting for', CONFIG.MIN_TIME_BETWEEN_REQUESTS - timeElapsed, 'ms');
      const waitTime = CONFIG.MIN_TIME_BETWEEN_REQUESTS - timeElapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
};

const summaryStore = {
  currentSummary: null,
};

const readerStore = {
  content: null,
};

// Debug logging function
function debug(...args) {
  if (CONFIG.DEBUG_MODE) {
    console.log(...args);
  }
}

// Message listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SUMMARIZE_TAB') {
    handleSummarizeTab(msg.customPrompt)
      .then(summary => sendResponse({ summary }))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep the message channel open for async response
  }

  if (msg.type === 'WORD_INFO') {
    const { word, context, customPrompt } = msg;
    debug("Word info request:", word, "with context:", context);
    debug("Custom prompt:", customPrompt);
    lookupWord(word, context, customPrompt)
      .then((info) => {
        debug("Word info response:", info);
        sendResponse({ info });
      })
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (msg.type === 'GET_SUMMARY') {
    sendResponse({ summary: summaryStore.currentSummary });
    return true;
  }

  if (msg.type === 'GET_READER_CONTENT') {
    sendResponse({ content: readerStore.content });
    return true;
  }

  if (msg.type === 'EXTRACT_CONTENT') {
    extractContentForReader()
      .then(content => sendResponse({ content }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (msg.type === 'READ_FROM_HERE') {
    handleReadFromHere(msg.paragraphIndex)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (msg.type === 'SYNTHESIZE_WORD') {
    pronounceWord(msg.text)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  return false; // No async response expected for other message types
});

// Get API key and model from storage
async function getConfigFromStorage() {
  try {
    const { openaiKey, openaiModel, basePrompt } = await chrome.storage.local.get([
      'openaiKey', 
      'openaiModel',
      'basePrompt'
    ]);
    
    if (!openaiKey) {
      throw new Error('OpenAI API key not found. Please set your API key in the extension options.');
    }
    
    // Use user-specified model or fall back to default
    const model = openaiModel || CONFIG.DEFAULT_OPENAI_MODEL;
    // Use user-specified base prompt or fall back to default
    const prompt = basePrompt || CONFIG.DEFAULT_BASE_PROMPT;
    
    return { apiKey: openaiKey, model, basePrompt: prompt };
  } catch (error) {
    debug('Error retrieving config:', error);
    throw error;
  }
}

// Handle summarization request
async function handleSummarizeTab(customPrompt = '') {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    // Execute script to extract page content
    const scriptResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        try {
          const article = new Readability(document.cloneNode(true)).parse();
          return article?.textContent || document.body.innerText || '';
        } catch (error) {
          return { error: error.message };
        }
      }
    });

    if (!scriptResults || scriptResults.length === 0) {
      throw new Error('Script execution failed');
    }

    const { result: pageText } = scriptResults[0];
    if (typeof pageText === 'object' && pageText.error) {
      throw new Error(`Error extracting page content: ${pageText.error}`);
    }

    // Get API key, model, and base prompt
    const { apiKey, model, basePrompt } = await getConfigFromStorage();
    // Apply rate limiting
    await apiRateLimiter.throttle();

    // Build the prompt based on base prompt and custom prompt
    let promptContent = basePrompt;
    
    // Add custom prompt if provided
    if (customPrompt) {
      promptContent += ` ${customPrompt}`;
    }
    promptContent += ` <text>${pageText}</text>`;

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: promptContent,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(`OpenAI API error: ${response.status} ${errorData?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response from OpenAI API');
    }

    const summary = data.choices[0].message.content;

    // Store the summary for later retrieval
    summaryStore.currentSummary = {
      title: tab.title,
      content: summary,
      url: tab.url,
      timestamp: new Date().toISOString()
    };

    // If set to open in new tab, create a new tab with the summary
    await openSummaryInNewTab(tab.title, summary);

    return summary;
  } catch (error) {
    debug('Error in handleSummarizeTab:', error);
    throw error;
  }
}

// Function to open the summary in a new tab
async function openSummaryInNewTab(originalTitle, summary) {
  try {
    // Create a new tab with a basic HTML page
    const newTab = await chrome.tabs.create({
      url: chrome.runtime.getURL('summary.html'),
      active: true
    });

    return true;
  } catch (error) {
    debug('Error opening summary in new tab:', error);
    throw error;
  }
}

// Look up word definition
async function lookupWord(word, context, customPrompt) {
  // If context is available, ask OpenAI for contextual explanation
  if (context && context.length > 0) {
    // Rate limit and retrieve API key and model
    await apiRateLimiter.throttle();
    const { apiKey, model } = await getConfigFromStorage();

    // Build OpenAI request
    // Use custom prompt if provided, otherwise use default
    let prompt;
    if (customPrompt) {
      // Ensure the custom prompt includes the word and context tags
      prompt = `${customPrompt.trim()} <word>${word}</word><context>${context}</context>`;
    } else {
      prompt = `Explain the meaning of the word in the following context. Also add 2 examples of using this word in its current meaning. Format your response with proper paragraphs and line breaks for readability. \n\n<word>${word}</word><context>${context}</context>`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant who explains what the user asks. Keep explanations concise and clear. Return only the answer without the input data. You can use simple markdown-style formatting with line breaks and paragraphs for readability.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    const data = await response.json();
    return data.choices[0].message.content.trim();
  }
}

// Extract content for the reader panel
async function extractContentForReader() {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    // Inject Readability library first, then extract content
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['/lib/Readability.min.js'],
    });

    // Extract page content
    const scriptResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContent,
    });

    if (!scriptResults || scriptResults.length === 0) {
      throw new Error('Failed to extract content');
    }

    const { result } = scriptResults[0];
    if (result.error) {
      throw new Error(result.error);
    }


    // Store content for side panel
    readerStore.content = {
      title: result.title,
      paragraphs: result.paragraphs,
      totalCharCount: result.totalCharCount,
      url: tab.url,
    };

    return readerStore.content;

  } catch (error) {
    debug('Error in extractContentForReader:', error);
    throw error;
  }
}

async function handleReadFromHere(paragraphIndex) {
  // Notify reader panel to navigate to the paragraph
  await chrome.runtime.sendMessage({ type: 'GO_TO_PARAGRAPH', paragraphIndex });
  return { success: true, paragraphIndex };
}

// Offscreen document management for audio playback
let creatingOffscreen = null;

// Cache for pronounced words (cleared on voice/speed change)
const pronunciationCache = new Map();

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play TTS audio for word pronunciation'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

async function pronounceWord(text) {
  let audioArray = pronunciationCache.get(text);

  if (!audioArray) {
    const audioBuffer = await synthesizeText(text);
    // Convert ArrayBuffer to regular array for message passing and caching
    audioArray = Array.from(new Uint8Array(audioBuffer));
    pronunciationCache.set(text, audioArray);
  }

  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    type: 'PLAY_AUDIO',
    audio: audioArray
  });

  if (response?.error) {
    throw new Error(response.error);
  }
}

// Function to be injected for content extraction
function extractPageContent() {
  try {
    let title = document.title || 'Untitled';
    let paragraphs = [];

    // Try Readability if available - use its HTML content to preserve structure
    if (typeof Readability !== 'undefined') {
      try {
        const article = new Readability(document.cloneNode(true)).parse();
        if (article) {
          title = article.title || title;

          // Parse the HTML content to extract paragraphs properly
          if (article.content) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(article.content, 'text/html');

            // Get all block-level text elements
            const blockElements = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre');

            for (const el of blockElements) {
              const text = el.textContent?.trim();
              if (text && text.length > 0) {
                paragraphs.push(text);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Readability failed:', e);
      }
    }

    // Split any very long paragraphs (>2000 chars) on sentence boundaries
    const finalParagraphs = [];
    for (const para of paragraphs) {
      if (para.length > 2000) {
        const sentences = para.split(/(?<=\.)\s+(?=[A-Z])/);
        let chunk = '';
        for (const sentence of sentences) {
          if (chunk.length + sentence.length > 1500 && chunk.length > 0) {
            finalParagraphs.push(chunk.trim());
            chunk = sentence;
          } else {
            chunk += (chunk ? ' ' : '') + sentence;
          }
        }
        if (chunk.trim()) {
          finalParagraphs.push(chunk.trim());
        }
      } else {
        finalParagraphs.push(para);
      }
    }

    // Create paragraph objects with IDs
    const result = finalParagraphs.map((text, index) => ({
      id: `p-${index}`,
      text: text,
      charCount: text.length,
    }));

    const totalCharCount = result.reduce((sum, p) => sum + p.charCount, 0);

    return {
      title,
      paragraphs: result,
      totalCharCount,
    };
  } catch (error) {
    return { error: error.message };
  }
}