/**
 * Reader content extraction and word lookup.
 */

import { debug, callOpenAI } from './api.js';

export const readerStore = {
  content: null,
};

export async function extractContentForReader() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    // Inject Readability library first
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

export async function handleReadFromHere(paragraphIndex) {
  await chrome.runtime.sendMessage({ type: 'GO_TO_PARAGRAPH', paragraphIndex });
  return { success: true, paragraphIndex };
}

export async function lookupWord(word, context, customPrompt) {
  if (!context || context.length === 0) {
    return null;
  }

  let prompt;
  if (customPrompt) {
    prompt = `${customPrompt.trim()} <word>${word}</word><context>${context}</context>`;
  } else {
    prompt = `Explain the meaning of the word in the following context. Also add 2 examples of using this word in its current meaning. Format your response with proper paragraphs and line breaks for readability. \n\n<word>${word}</word><context>${context}</context>`;
  }

  const content = await callOpenAI({
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant who explains what the user asks. Keep explanations concise and clear. Return only the answer without the input data. You can use simple markdown-style formatting with line breaks and paragraphs for readability.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
  });

  return content.trim();
}

/**
 * Injected into the page to extract readable content.
 */
function extractPageContent() {
  try {
    let title = document.title || 'Untitled';
    let paragraphs = [];

    if (typeof Readability !== 'undefined') {
      try {
        const article = new Readability(document.cloneNode(true)).parse();
        if (article) {
          title = article.title || title;

          if (article.content) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(article.content, 'text/html');
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

    // Split very long paragraphs (>2000 chars) on sentence boundaries
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

    const result = finalParagraphs.map((text, index) => ({
      id: `p-${index}`,
      text: text,
      charCount: text.length,
    }));

    const totalCharCount = result.reduce((sum, p) => sum + p.charCount, 0);

    return { title, paragraphs: result, totalCharCount };
  } catch (error) {
    return { error: error.message };
  }
}
