A Chrome extension that helps better understand web content through AI-powered summarization and contextual word definitions.

## Features

- **Page Summarization**: Instantly generate concise, well-structured summaries of any webpage
- **Word Definitions**: Double-click any word to get contextual definitions
- **Markdown Formatting**: Summaries are formatted with headings, lists, and emphasis for better readability
- **Popup Interface**: Simple, clean UI for quick interactions

## How It Works

### Page Summarization

1. Click the extension icon or use the popup interface
2. The extension parses the current page using Mozilla's Readability library 
3. Content is sent to OpenAI's API to generate a well-structured summary
4. The summary is displayed in a new tab with clean formatting

### Word Helper

1. Double-click any word on a webpage
2. The extension captures the word and surrounding context
3. OpenAI's API provides a contextual definition of the word
4. The definition appears in a small bubble near the selected word

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