importScripts('/lib/Readability.min.js');
// importScripts('/lib/DOMPurify.min.js');

const CONFIG = {
  MAX_TEXT_LENGTH: 15000,
  OPENAI_MODEL: 'gpt-4o-mini',
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

// Debug logging function
function debug(...args) {
  if (CONFIG.DEBUG_MODE) {
    console.log(...args);
  }
}

// Message listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SUMMARIZE_TAB') {
    handleSummarizeTab()
      .then(summary => sendResponse({ summary }))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep the message channel open for async response
  }

  if (msg.type === 'WORD_INFO') {
    debug('Word info request:', msg.word);
    lookupWord(msg.word)
      .then(info => {
        debug('Word info response:', info);
        sendResponse({ info });
      })
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep the message channel open for async response
  }
  
  return false; // No async response expected for other message types
});

// Handle summarization request
async function handleSummarizeTab() {
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
          // TODO: When DOMPurify is available, use it like this:
          // const purifiedHtml = DOMPurify.sanitize(document.documentElement.outerHTML);
          // const cleanDoc = new DOMParser().parseFromString(purifiedHtml, 'text/html');
          // const article = new Readability(cleanDoc).parse();
          
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

    // Get API key
    const apiKey = await getKeyFromStorage();

    // Apply rate limiting
    await apiRateLimiter.throttle();

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: CONFIG.OPENAI_MODEL,
        messages: [{ 
          role: 'user', 
          content: `Summarize:\n${pageText}` 
        }],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(`OpenAI API error: ${response.status} ${errorData?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response from OpenAI API');
    }

    return data.choices[0].message.content;
  } catch (error) {
    debug('Error in handleSummarizeTab:', error);
    throw error;
  }
}

// Look up word definition
async function lookupWord(word) {
  if (!word || typeof word !== 'string') {
    return 'Invalid word provided';
  }
  
  const sanitizedWord = word.trim().toLowerCase();
  if (!sanitizedWord) {
    return 'Empty word provided';
  }

  try {
    // Try dictionary API first
    await apiRateLimiter.throttle();
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(sanitizedWord)}`);
    
    if (response.ok) {
      const data = await response.json();
      if (data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition) {
        return data[0].meanings[0].definitions[0].definition;
      }
      debug('Dictionary API response had unexpected structure:', data);
    } else {
      debug('Dictionary API request failed with status:', response.status);
    }
  } catch (error) {
    debug('Exception during fetching from Dictionary API:', error);
  }
}

// Get API key from storage
async function getKeyFromStorage() {
  try {
    const { openaiKey } = await chrome.storage.local.get('openaiKey');
    if (!openaiKey) {
      throw new Error('OpenAI API key not found. Please set your API key in the extension options.');
    }
    return openaiKey;
  } catch (error) {
    debug('Error retrieving API key:', error);
    throw error;
  }
}