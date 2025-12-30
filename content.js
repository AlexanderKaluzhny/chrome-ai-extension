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
    
    // Format and display the definition with preserved line breaks
    const formattedInfo = info
      .replace(/\n\n/g, '<br><br>')  // Convert double line breaks to HTML breaks
      .replace(/\n/g, '<br>');       // Convert single line breaks as well
    
    definitionContainer.innerHTML = formattedInfo;
    
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

  // Read from here button click handler
  const readFromHereBtn = bubble.querySelector('.read-from-here-btn');
  readFromHereBtn.addEventListener('click', async () => {
    const selection = window.getSelection();
    const anchorNode = selection.anchorNode;
    const clickedElement = anchorNode.nodeType === Node.TEXT_NODE
      ? anchorNode.parentElement
      : anchorNode;

    // Find nearest block-level ancestor
    const blockElement = clickedElement.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div, article, section');
    const targetElement = blockElement || clickedElement;

    // Create truncated document and count paragraphs using Readability
    const paragraphIndex = getParagraphIndexFromTruncatedDoc(targetElement);

    bubble.remove();
    await chrome.runtime.sendMessage({
      type: 'READ_FROM_HERE',
      paragraphIndex
    });
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

// ============================================================================
// Truncated HTML helpers for "Read from here" feature
// ============================================================================

/**
 * Creates a truncated document, runs Readability on it, and returns the
 * paragraph index (0-based) of the last paragraph. This index corresponds
 * to the paragraph containing the clicked element.
 * @param {Element} targetElement - The element user clicked on
 * @returns {number} Paragraph index (0 if no content found)
 */
function getParagraphIndexFromTruncatedDoc(targetElement) {
  // Create truncated HTML
  const truncatedHtml = createTruncatedHtml(targetElement);

  // Parse truncated HTML
  const parser = new DOMParser();
  const truncatedDoc = parser.parseFromString(truncatedHtml, 'text/html');

  // Run Readability on truncated document
  let article;
  try {
    article = new Readability(truncatedDoc).parse();
  } catch (e) {
    return 0;
  }

  if (!article || !article.content) {
    return 0;
  }

  // Extract paragraphs from Readability's output
  const contentDoc = parser.parseFromString(article.content, 'text/html');
  const blocks = contentDoc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre');

  // Count paragraphs
  let paragraphCount = 0;
  for (const el of blocks) {
    const text = el.textContent?.trim();
    if (text && text.length > 0) {
      paragraphCount++;
    }
  }

  // Return last paragraph index (0-based)
  return paragraphCount > 0 ? paragraphCount - 1 : 0;
}

/**
 * Creates a truncated copy of the document HTML where everything after
 * the target element is removed. This allows Readability to extract only
 * the content up to and including the clicked element.
 * @param {Element} targetElement - The element user clicked on
 * @returns {string} Truncated HTML string
 */
function createTruncatedHtml(targetElement) {
  // Clone the entire document
  const clone = document.documentElement.cloneNode(true);

  // Build path from root to target element (array of child indices)
  const path = getElementPath(targetElement);

  // Find the same element in the cloned document
  const targetInClone = followPath(clone, path);

  if (targetInClone) {
    // Remove all nodes that come after the target in document order
    removeNodesAfter(targetInClone);
  }

  return clone.outerHTML;
}

/**
 * Builds a path from document root to the given element.
 * Path is an array of child indices at each level.
 * @param {Element} element - Target element
 * @returns {number[]} Array of indices
 */
function getElementPath(element) {
  const path = [];
  let current = element;

  while (current && current !== document.documentElement) {
    const parent = current.parentElement;
    if (parent) {
      const index = Array.from(parent.children).indexOf(current);
      path.unshift(index);
    }
    current = parent;
  }

  return path;
}

/**
 * Follows a path of child indices from root to find an element.
 * @param {Element} root - Root element to start from
 * @param {number[]} path - Array of child indices
 * @returns {Element|null} Found element or null
 */
function followPath(root, path) {
  let current = root;
  for (const index of path) {
    if (current.children && current.children[index]) {
      current = current.children[index];
    } else {
      return null;
    }
  }
  return current;
}

/**
 * Removes all nodes that come after the given element in document order.
 * This includes: siblings after the element, and all "uncle" nodes
 * (siblings of ancestors that come after the ancestor).
 * @param {Element} element - The element to truncate after
 */
function removeNodesAfter(element) {
  let current = element;

  while (current && current.parentElement) {
    // Remove all siblings after current element
    while (current.nextElementSibling) {
      current.nextElementSibling.remove();
    }
    // Move up to parent and repeat (removes "uncle" nodes)
    current = current.parentElement;
  }
}