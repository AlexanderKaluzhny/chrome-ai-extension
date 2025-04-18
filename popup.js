document.addEventListener('DOMContentLoaded', () => {
  const summaryElement = document.getElementById('summary');
  const summarizeButton = document.getElementById('summarizeBtn');
  
  function summarizeTab() {
    summaryElement.textContent = 'Loading...';
    
    // Send message to background script
    chrome.runtime.sendMessage({ type: 'SUMMARIZE_TAB' }, ({ error }) => {
      if (error) {
        console.error('Error summarizing tab:', error);
        summaryElement.textContent = 'Error: ' + error;
        return;
      }
    });
  }
  
  // Add click event listener to the button
  summarizeButton.addEventListener('click', summarizeTab);
});