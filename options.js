// Load saved settings when the options page is opened
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { openaiKey, openaiModel, basePrompt, customPrompt } = await chrome.storage.local.get([
      'openaiKey', 
      'openaiModel',
      'basePrompt',
      'customPrompt'
    ]);
    
    // Set API key if available
    if (openaiKey) {
      document.getElementById('openai-key').value = openaiKey;
    }
    
    // Set model if available, otherwise default will be used from placeholder
    if (openaiModel) {
      document.getElementById('openai-model').value = openaiModel;
    }

    // Set base prompt if available
    if (basePrompt) {
      document.getElementById('base-prompt').value = basePrompt;
    }

    // Set custom prompt if available
    if (customPrompt) {
      document.getElementById('custom-prompt').value = customPrompt;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
});

// Save settings when the save button is clicked
document.getElementById('save').addEventListener('click', async () => {
  const openaiKey = document.getElementById('openai-key').value.trim();
  const openaiModel = document.getElementById('openai-model').value.trim();
  const basePrompt = document.getElementById('base-prompt').value.trim();
  const customPrompt = document.getElementById('custom-prompt').value.trim();
  const statusEl = document.getElementById('status');
  
  try {
    if (!openaiKey) {
      showStatus('API key cannot be empty', 'error');
      return;
    }
    
    // Simple validation to make sure it looks like an OpenAI key
    if (!openaiKey.startsWith('sk-') || openaiKey.length < 20) {
      showStatus('API key format appears invalid. OpenAI keys typically start with "sk-"', 'error');
      return;
    }
    
    // Test the API key before saving it
    showStatus('Testing API key...', 'info');
    const isValid = await testApiKey(openaiKey);
    
    if (!isValid) {
      showStatus('API key is invalid or has insufficient permissions', 'error');
      return;
    }
    
    // Prepare settings object
    const settings = { openaiKey };
    
    // Add model if provided, otherwise use default
    if (openaiModel) {
      settings.openaiModel = openaiModel;
    } else {
      settings.openaiModel = 'gpt-4o-mini';
    }
    
    // Add base prompt if provided
    if (basePrompt) {
      settings.basePrompt = basePrompt;
    }
    
    // Add custom prompt if provided
    if (customPrompt) {
      settings.customPrompt = customPrompt;
    }
    
    // Save all settings
    await chrome.storage.local.set(settings);
    
    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus(`Error saving settings: ${error.message}`, 'error');
  }
});

// Test the API key with a simple request
async function testApiKey(apiKey) {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Test API key: ', { response});

    // If we get a 200 response, the key is valid
    return response.status === 200;
  } catch (error) {
    console.error('Error testing API key:', error);
    return false;
  }
}

// Helper to show status messages
function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  
  // Only hide success and error messages automatically
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
}