document.addEventListener("dblclick", async () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  // Extract the clicked word
  const word = selection.toString().trim().split(/\s+/)[0];
  if (!word) return;

  // Determine context from nearest block-level container
  let node = selection.anchorNode;
  while (node && node.nodeType !== Node.ELEMENT_NODE) {
    node = node.parentNode;
  }
  const blockEl = node ? findBlockAncestor(node) : null;
  const context = blockEl
    ? blockEl.textContent.trim()
    : document.body.innerText.trim();

  // Send both word and context to background for explanation
  const { info } = await chrome.runtime.sendMessage({
    type: "WORD_INFO",
    word,
    context,
  });

  showBubble(selection.getRangeAt(0).getBoundingClientRect(), info);
});

// Helper to find the nearest block-level ancestor for broader context
function findBlockAncestor(el) {
  while (el) {
    if (el.nodeType === Node.ELEMENT_NODE) {
      const display = window.getComputedStyle(el).display;
      if (["block", "flex", "grid", "table", "list-item"].includes(display)) {
        return el;
      }
    }
    el = el.parentNode;
  }
  return null;
}

function showBubble(rect, info) {
  let bubble = document.getElementById("word-helper-bubble");
  if (!bubble) {
    bubble = document.createElement("div");
    bubble.id = "word-helper-bubble";
    bubble.className = "word-bubble";
    document.body.appendChild(bubble);
  }
  bubble.textContent = info;
  Object.assign(bubble.style, {
    top: `${window.scrollY + rect.bottom + 4}px`,
    left: `${window.scrollX + rect.left}px`,
  });
}

document.addEventListener("click", (e) => {
  const bubble = document.getElementById("word-helper-bubble");
  if (!bubble) return;

  // if the click was inside the bubble, ignore it
  if (bubble.contains(e.target)) return;

  // otherwise remove
  bubble.remove();
});
