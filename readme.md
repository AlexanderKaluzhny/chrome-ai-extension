# AI Page Explorer

A Chrome extension that helps you better understand web content through AI-powered summarization, contextual word definitions, and text-to-speech reading.

## Features

- **Page Summarization**: Instantly generate concise, well-structured summaries of any webpage
- **Word Definitions**: Double-click any word to get contextual definitions
- **Text-to-Speech Reader**: Listen to articles with a built-in reader panel
- **Word Pronunciation**: Hear how words are pronounced
- **Navigate in Reader**: Click any paragraph on the page to jump to it in the reader

## How It Works

### Page Summarization

1. Click the extension icon and select "Summarize Page"
2. The extension parses the current page using Mozilla's Readability library
3. Content is sent to OpenAI's API to generate a well-structured summary
4. The summary is displayed in a new tab with clean formatting

### Word Explorer

1. Double-click any word on a webpage
2. The extension captures the word and surrounding context
3. Click "Define" to get a contextual definition from OpenAI
4. Click the speaker icon to hear the pronunciation
5. Use "Navigate in Reader" to jump to that section in the reader panel

## Installation

### From Source

1. Clone this repository

2. Open Chrome/Edge and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top-right corner

4. Click "Load unpacked" and select the repository folder

### Configuration

1. After installation, click on the extension icon and select "Options"
2. Enter your OpenAI API key
3. The API key is stored locally in your browser

## Privacy & Security Notes

- Your API key is stored locally (not encrypted) and only sent to OpenAI's servers
- Page content is processed locally using Readability before sending to OpenAI
- Only the text content of pages is sent to OpenAI, not your browsing history or personal data

## Technologies Used

- OpenAI API - For generating summaries and word definitions
- [Mozilla's Readability](https://github.com/mozilla/readability) - For extracting clean article content
- [Marked](https://github.com/markedjs/marked) - For rendering Markdown in summary pages

## License

### Third-Party Libraries

This project uses third-party open-source libraries that maintain their original licenses:

- **Mozilla's Readability**: [Mozilla Public License 2.0](https://github.com/mozilla/readability/blob/master/LICENSE)
- **Marked**: [MIT License](https://github.com/markedjs/marked/blob/master/LICENSE.md)

The full license texts are included in the respective library files. Using this project requires compliance with all included library licenses.