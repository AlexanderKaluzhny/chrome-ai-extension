/**
 * Background service worker - main message router.
 *
 * Delegates to specialized modules:
 * - background/summarize.js - page summarization
 * - background/reader.js - content extraction and word lookup
 * - background/pronunciation.js - TTS word pronunciation
 */

import { debug } from './background/api.js';
import { summaryStore, handleSummarizeTab } from './background/summarize.js';
import { readerStore, extractContentForReader, handleReadFromHere, lookupWord } from './background/reader.js';
import { pronounceWord } from './background/pronunciation.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SUMMARIZE_TAB') {
    handleSummarizeTab(msg.customPrompt)
      .then(summary => sendResponse({ summary }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (msg.type === 'WORD_INFO') {
    const { word, context, customPrompt } = msg;
    debug("Word info request:", word, "with context:", context);
    lookupWord(word, context, customPrompt)
      .then(info => {
        debug("Word info response:", info);
        sendResponse({ info });
      })
      .catch(error => sendResponse({ error: error.message }));
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

  return false;
});
