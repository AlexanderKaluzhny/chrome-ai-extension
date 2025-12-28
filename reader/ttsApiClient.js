// reader/ttsApiClient.js - OpenAI TTS API wrapper

export default class TTSApiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1/audio/speech';
  }

  /**
   * Synthesize text to speech using OpenAI TTS API
   * @param {string} text - Text to convert to speech
   * @param {Object} options - TTS options
   * @param {string} options.voice - Voice to use (alloy, ash, coral, echo, fable, nova, onyx, sage, shimmer)
   * @param {number} options.speed - Playback speed (0.25 to 4.0)
   * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
   */
  async synthesize(text, options = {}) {
    const { voice = 'alloy', speed = 1.0 } = options;

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice,
        speed: speed,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.error?.message || response.statusText;
      throw new Error(`TTS API error (${response.status}): ${errorMessage}`);
    }

    return await response.arrayBuffer();
  }

  /**
   * Split text into chunks that fit within the API limit
   * @param {string} text - Text to split
   * @param {number} maxLength - Maximum chunk length (default 4096)
   * @returns {string[]} Array of text chunks
   */
  splitTextIntoChunks(text, maxLength = 4096) {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find a good break point within the limit
      let breakPoint = maxLength;

      // Try to break at sentence boundary (. followed by space)
      const sentenceBreak = remaining.lastIndexOf('. ', maxLength);
      if (sentenceBreak > maxLength * 0.5) {
        breakPoint = sentenceBreak + 1; // Include the period
      } else {
        // Fall back to word boundary
        const wordBreak = remaining.lastIndexOf(' ', maxLength);
        if (wordBreak > maxLength * 0.5) {
          breakPoint = wordBreak;
        }
      }

      chunks.push(remaining.substring(0, breakPoint).trim());
      remaining = remaining.substring(breakPoint).trim();
    }

    return chunks;
  }
}
