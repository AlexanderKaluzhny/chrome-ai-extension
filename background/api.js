/**
 * OpenAI API utilities - rate limiting, config, and API calls.
 */

const CONFIG = {
  DEFAULT_OPENAI_MODEL: 'gpt-4o-mini',
  DEFAULT_BASE_PROMPT: 'Summarize the following text in a concise and comprehensive way. Format your response using Markdown with appropriate headings, bullet points, and emphasis where helpful.',
  DEBUG_MODE: true,
  MIN_TIME_BETWEEN_REQUESTS: 1000
};

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

export function debug(...args) {
  if (CONFIG.DEBUG_MODE) {
    console.log(...args);
  }
}

export async function getConfigFromStorage() {
  try {
    const { openaiKey, openaiModel, basePrompt } = await chrome.storage.local.get([
      'openaiKey',
      'openaiModel',
      'basePrompt'
    ]);

    if (!openaiKey) {
      throw new Error('OpenAI API key not found. Please set your API key in the extension options.');
    }

    const model = openaiModel || CONFIG.DEFAULT_OPENAI_MODEL;
    const prompt = basePrompt || CONFIG.DEFAULT_BASE_PROMPT;

    return { apiKey: openaiKey, model, basePrompt: prompt };
  } catch (error) {
    debug('Error retrieving config:', error);
    throw error;
  }
}

/**
 * Call OpenAI Chat Completions API with rate limiting.
 */
export async function callOpenAI({ messages, temperature = 0.3 }) {
  await apiRateLimiter.throttle();
  const { apiKey, model } = await getConfigFromStorage();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
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

  return data.choices[0].message.content;
}

export { CONFIG };
