importScripts('/lib/Readability.min.js');
// importScripts('/lib/DOMPurify.min.js');

const CONFIG = {
  MAX_TEXT_LENGTH: 15000,
  DEFAULT_OPENAI_MODEL: 'gpt-4o-mini',
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
    const { word, context } = msg;
    debug("Word info request:", word, "with context:", context);
    lookupWord(word, context)
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
  
  return false; // No async response expected for other message types
});

// Get API key and model from storage
async function getConfigFromStorage() {
  try {
    const { openaiKey, openaiModel } = await chrome.storage.local.get(['openaiKey', 'openaiModel']);
    
    if (!openaiKey) {
      throw new Error('OpenAI API key not found. Please set your API key in the extension options.');
    }
    
    // Use user-specified model or fall back to default
    const model = openaiModel || CONFIG.DEFAULT_OPENAI_MODEL;
    
    return { apiKey: openaiKey, model };
  } catch (error) {
    debug('Error retrieving config:', error);
    throw error;
  }
}

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

    // Get API key and model
    const { apiKey, model } = await getConfigFromStorage();

    // Apply rate limiting
    await apiRateLimiter.throttle();

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
            content: `Summarize the following text in a concise and comprehensive way. Format your response using Markdown with appropriate headings, bullet points, and emphasis where helpful.  <text>${pageText}</text>`,
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
async function lookupWord(word, context) {
  // If context is available, ask OpenAI for contextual explanation
  if (context && context.length > 0) {
    // Rate limit and retrieve API key and model
    await apiRateLimiter.throttle();
    const { apiKey, model } = await getConfigFromStorage();

    // Build OpenAI request
    const prompt = `Explain the meaning of the word "${word}" in the context of the following paragraph:\n\n${context}`;
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
              "You are a helpful assistant that explains word meanings in context. Keep explanations concise and clear.",
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