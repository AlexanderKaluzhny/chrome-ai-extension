chrome.runtime.sendMessage({ type: 'SUMMARIZE_TAB' }, ({ summary }) => {
  document.getElementById('summary').textContent = summary;
});