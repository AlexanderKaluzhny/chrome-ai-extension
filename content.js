document.addEventListener('dblclick', async () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  const word = selection.toString().trim().split(/\s+/)[0];
  if (!word) return;

  const { info } = await chrome.runtime.sendMessage({ type: 'WORD_INFO', word });

  showBubble(selection.getRangeAt(0).getBoundingClientRect(), info);
});

function showBubble(rect, info) {
  let bubble = document.getElementById('word-helper-bubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.id = 'word-helper-bubble';
    bubble.className = 'word-bubble';
    document.body.appendChild(bubble);
  }
  bubble.textContent = info;
  Object.assign(bubble.style, {
    top: `${window.scrollY + rect.bottom + 4}px`,
    left: `${window.scrollX + rect.left}px`
  });
}

document.addEventListener('click', (e) => {
  const bubble = document.getElementById('word-helper-bubble');
  if (!bubble) return;

  // if the click was inside the bubble, ignore it
  if (bubble.contains(e.target)) return;

  // otherwise remove
  bubble.remove();
});