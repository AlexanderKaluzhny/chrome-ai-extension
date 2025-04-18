document.addEventListener("DOMContentLoaded", () => {
  const summaryElement = document.getElementById("summary");
  const summarizeButton = document.getElementById("summarizeBtn");
  const customPromptElement = document.getElementById("customPrompt");

  // Load saved custom prompt from storage
  chrome.storage.local.get(["customPrompt"], (result) => {
    if (result.customPrompt) {
      customPromptElement.value = result.customPrompt;
    }
  });

  // Save custom prompt when it changes
  customPromptElement.addEventListener("input", () => {
    chrome.storage.local.set({ customPrompt: customPromptElement.value });
  });

  // Function to handle the summarization process
  function summarizeTab() {
    // 1. Change button text & disable it to prevent double‑clicks
    summarizeButton.disabled = true;
    summarizeButton.textContent = "Loading...";
    // 2. Clear any old summary
    summaryElement.textContent = "";

    // Get the custom prompt
    const customPrompt = customPromptElement.value.trim();

    // 3. Fire the message with the custom prompt
    chrome.runtime.sendMessage(
      {
        type: "SUMMARIZE_TAB",
        customPrompt: customPrompt,
      },
      (response) => {
        if (response.error) {
          console.error("Error summarizing tab:", response.error);
          summaryElement.textContent = "Error: " + response.error;
        } else {
          // render the returned summary
          summaryElement.textContent = response.summary;
        }

        // 4. Restore button text & re‑enable
        summarizeButton.textContent = "Summarize";
        summarizeButton.disabled = false;
      }
    );
  }

  // Add click event listener to the button
  summarizeButton.addEventListener("click", summarizeTab);
});
