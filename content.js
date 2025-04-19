// Template cache to avoid fetching repeatedly
let bubbleTemplate = null;

async function fetchBubbleTemplate() {
  try {
    const templateUrl = chrome.runtime.getURL('content.html');
    const response = await fetch(templateUrl);
    const html = await response.text();
    
    // Create a temporary element to parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Store the template in our cache
    return bubbleTemplate = doc.getElementById('word-helper-template');
  } catch (error) {
    console.error('Error loading word helper template:', error);
    return null;
  }
}

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

  // Show the bubble with buttons instead of immediately fetching the definition
  showBubbleWithOptions(selection.getRangeAt(0).getBoundingClientRect(), word, context);
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

// Show bubble with "Define" and "Specify prompt" buttons
async function showBubbleWithOptions(rect, word, context) {
  // Make sure template is loaded
  if (!bubbleTemplate) {
    bubbleTemplate = await fetchBubbleTemplate();
    if (!bubbleTemplate) {
      console.error("Couldn't load bubble template");
      return;
    }
  }
  
  // Remove any existing bubbles
  removeExistingBubbles();
  
  // Create the bubble container
  const bubble = document.createElement("div");
  bubble.id = "word-helper-bubble";
  bubble.className = "word-bubble";
  
  // Clone the template content
  const templateContent = bubbleTemplate.content.cloneNode(true);
  bubble.appendChild(templateContent);
  
  // Set the selected word
  bubble.querySelector('.selected-word').textContent = word;
  
  document.body.appendChild(bubble);
  
  // Position the bubble
  Object.assign(bubble.style, {
    top: `${window.scrollY + rect.bottom + 4}px`,
    left: `${window.scrollX + rect.left}px`,
  });
  
  // Setup event listeners for the buttons
  const defineBtn = bubble.querySelector('.define-btn');
  const promptBtn = bubble.querySelector('.prompt-btn');
  const savePromptBtn = bubble.querySelector('.save-prompt-btn');
  const cancelPromptBtn = bubble.querySelector('.cancel-prompt-btn');
  const closeBtn = bubble.querySelector('.close-bubble');
  const promptContainer = bubble.querySelector('.prompt-container');
  const promptTextarea = bubble.querySelector('.prompt-textarea');
  const definitionContainer = bubble.querySelector('.definition-container');
  
  // Check for existing custom prompt for this word
  chrome.storage.local.get([`word_prompt_${word}`], (result) => {
    if (result[`word_prompt_${word}`]) {
      promptTextarea.value = result[`word_prompt_${word}`];
    }
  });
  
  // Define button click handler
  defineBtn.addEventListener('click', async () => {
    // Show loading indicator
    definitionContainer.innerHTML = 'Loading...';
    definitionContainer.style.display = 'block';
    
    // Get custom prompt if exists
    const { [`word_prompt_${word}`]: customPrompt } = await chrome.storage.local.get([`word_prompt_${word}`]);
    
    // Request definition from background script
    const { info } = await chrome.runtime.sendMessage({
      type: "WORD_INFO",
      word,
      context,
      customPrompt
    });
    
    // Display the definition
    definitionContainer.innerHTML = info;
    
    // Hide the action buttons once definition is shown
    bubble.querySelector('.bubble-actions').style.display = 'none';
  });
  
  // Specify prompt button click handler
  promptBtn.addEventListener('click', () => {
    promptContainer.style.display = 'block';
    bubble.querySelector('.bubble-actions').style.display = 'none';
  });
  
  // Save & Define button click handler
  savePromptBtn.addEventListener('click', async () => {
    const customPrompt = promptTextarea.value.trim();
    
    // Save custom prompt
    await chrome.storage.local.set({ [`word_prompt_${word}`]: customPrompt });
    
    // Show loading indicator
    definitionContainer.innerHTML = 'Loading...';
    definitionContainer.style.display = 'block';
    promptContainer.style.display = 'none';
    
    // Request definition with custom prompt
    const { info } = await chrome.runtime.sendMessage({
      type: "WORD_INFO",
      word,
      context,
      customPrompt
    });
    
    // Display the definition
    definitionContainer.innerHTML = info;
  });
  
  // Cancel button click handler
  cancelPromptBtn.addEventListener('click', () => {
    promptContainer.style.display = 'none';
    bubble.querySelector('.bubble-actions').style.display = 'block';
  });
  
  // Close button click handler
  closeBtn.addEventListener('click', () => {
    bubble.remove();
  });
  
  // Click outside to close
  document.addEventListener("click", handleClickOutside);
}

// Helper function to remove existing bubbles
function removeExistingBubbles() {
  const existingBubble = document.getElementById("word-helper-bubble");
  if (existingBubble) {
    existingBubble.remove();
  }
  // Remove the global click handler if it exists
  document.removeEventListener("click", handleClickOutside);
}

// Global click handler to close bubble when clicking outside
function handleClickOutside(e) {
  const bubble = document.getElementById("word-helper-bubble");
  if (!bubble) return;
  
  // If click was outside the bubble, remove it
  if (!bubble.contains(e.target)) {
    bubble.remove();
    document.removeEventListener("click", handleClickOutside);
  }
}