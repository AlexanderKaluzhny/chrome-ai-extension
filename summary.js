// Fetch the summary data from the background script
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Request the summary from the background script
    chrome.runtime.sendMessage({ type: 'GET_SUMMARY' }, (response) => {
      if (response && response.summary) {
        document.getElementById('original-title').textContent = response.summary.title;
        
        // Use marked.js to parse and render markdown content
        const summaryContent = document.getElementById('summary-content');
        summaryContent.innerHTML = marked.parse(response.summary.content);
        
        document.title = `Summary: ${response.summary.title}`;
      } else {
        document.getElementById('error-container').style.display = 'block';
        document.getElementById('error-container').textContent = 'No summary data available. Please try summarizing the page again.';
        document.getElementById('summary-content').textContent = '';
      }
    });
  } catch (error) {
    console.error('Error loading summary:', error);
    document.getElementById('error-container').style.display = 'block';
    document.getElementById('error-container').textContent = `Error: ${error.message}`;
    document.getElementById('summary-content').textContent = '';
  }
});