// utils/truncatedHtml.js - Truncated HTML helpers for "Navigate in Reader" feature
// Injected as content script (not ES module) to work alongside content.js

/**
 * Creates a truncated document, runs Readability on it, and returns the
 * paragraph index (0-based) of the last paragraph. This index corresponds
 * to the paragraph containing the clicked element.
 * @param {Element} targetElement - The element user clicked on
 * @returns {number} Paragraph index (0 if no content found)
 */
function getParagraphIndexFromTruncatedDoc(targetElement) {
  const truncatedHtml = createTruncatedHtml(targetElement);

  const parser = new DOMParser();
  const truncatedDoc = parser.parseFromString(truncatedHtml, 'text/html');

  let article;
  try {
    article = new Readability(truncatedDoc).parse();
  } catch (e) {
    return 0;
  }

  if (!article || !article.content) {
    return 0;
  }

  const contentDoc = parser.parseFromString(article.content, 'text/html');
  const blocks = contentDoc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre');

  let paragraphCount = 0;
  for (const el of blocks) {
    const text = el.textContent?.trim();
    if (text && text.length > 0) {
      paragraphCount++;
    }
  }

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
  const clone = document.documentElement.cloneNode(true);
  const path = getElementPath(targetElement);
  const targetInClone = followPath(clone, path);

  if (targetInClone) {
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
    while (current.nextElementSibling) {
      current.nextElementSibling.remove();
    }
    current = current.parentElement;
  }
}
