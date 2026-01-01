/**
 * Page summarization - extracts content and generates AI summary.
 */

import { debug, getConfigFromStorage, callOpenAI } from './api.js';

export const summaryStore = {
  currentSummary: null,
};

export async function handleSummarizeTab(customPrompt = '') {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    // Extract page content via Readability
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

    const { basePrompt } = await getConfigFromStorage();

    let promptContent = basePrompt;
    if (customPrompt) {
      promptContent += ` ${customPrompt}`;
    }
    promptContent += ` <text>${pageText}</text>`;

    const summary = await callOpenAI({
      messages: [{ role: "user", content: promptContent }],
      temperature: 0.3,
    });

    summaryStore.currentSummary = {
      title: tab.title,
      content: summary,
      url: tab.url,
      timestamp: new Date().toISOString()
    };

    await openSummaryInNewTab(tab.title, summary);

    return summary;
  } catch (error) {
    debug('Error in handleSummarizeTab:', error);
    throw error;
  }
}

async function openSummaryInNewTab(originalTitle, summary) {
  try {
    await chrome.tabs.create({
      url: chrome.runtime.getURL('summary.html'),
      active: true
    });
    return true;
  } catch (error) {
    debug('Error opening summary in new tab:', error);
    throw error;
  }
}
