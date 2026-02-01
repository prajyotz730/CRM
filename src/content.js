if (window.self !== window.top) {
  console.log('[WhatsApp CRM] Skipping - running in iframe, not main window');
  throw new Error('Content script should only run in main window');
}

console.log('[WhatsApp CRM] Content script loaded in main window');

const SELECTORS = {
  SEARCH_BOX: 'div[contenteditable="true"][data-tab="3"], div[contenteditable="true"][role="textbox"]',
  CHAT_SEARCH: 'div[contenteditable="true"][data-tab="3"], div[contenteditable="true"][role="textbox"]',
  MESSAGE_BOX: 'div[contenteditable="true"][data-tab="10"], div[contenteditable="true"][data-tab="6"], footer div[contenteditable="true"], div[data-testid="conversation-compose-box-input"]',
  SEND_BUTTON: 'button[aria-label="Send"], span[data-icon="send"], button[data-testid="send"], div[data-testid="send"]',
  CHAT_HEADER: 'header',
  ATTACHMENT_BUTTON: 'div[title="Attach"], button[aria-label="Attach"], span[data-icon="attach-menu-plus"], span[data-icon="clip"], span[data-icon="plus"], div[data-testid="attach-menu-plus"], button[data-testid="clip"]',
  ATTACHMENT_MENU: 'div[data-animate-modal-popup="true"], ul[role="menu"], div[data-testid="attach-menu"]',
  PHOTOS_VIDEOS_OPTION: 'button[aria-label="Photos & videos"], li[data-animate-dropdown-item="true"]:first-child, input[accept="image/*,video/mp4,video/3gpp,video/quicktime"], span[data-icon="image"], div[data-testid="mi-attach-media"]',
  DOCUMENT_OPTION: 'button[aria-label="Document"], li[data-animate-dropdown-item="true"]:nth-child(2), span[data-icon="document"], div[data-testid="mi-attach-document"]',
  IMAGE_INPUT: 'input[accept="image/*,video/mp4,video/3gpp,video/quicktime"], input[accept*="image"]',
  DOCUMENT_INPUT: 'input[accept="*"], input[type="file"]',
  SEND_ATTACHMENT_BUTTON: 'span[data-icon="send"], div[aria-label="Send"], button[data-testid="send"]',
  MESSAGE_STATUS_SENT: 'span[data-icon="msg-check"], span[data-icon="msg-dblcheck"]',
  MESSAGE_STATUS_DELIVERED: 'span[data-icon="msg-dblcheck"]',
  MESSAGE_STATUS_READ: 'span[data-icon="msg-dblcheck-ack"]',
  CHAT_LIST_ITEM: 'div[data-testid="cell-frame-container"], div[data-testid="list-item-container"]',
  CONTACT_NAME: 'span[data-testid="conversation-info-header-chat-title"]',
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => {
      console.error('Content script error:', error);
      sendResponse({ error: error.message });
    });
  return true;
});

async function handleMessage(message) {
  console.log('Content script received:', message.type);
  switch (message.type) {
    case 'SEND_MESSAGE':
      return await sendMessage(message.payload);
    case 'SEND_MESSAGE_WITH_ATTACHMENT':
      return await sendMessageWithAttachment(message.payload);
    case 'CHECK_WHATSAPP_CONNECTION':
      return { connected: isWhatsAppConnected() };
    case 'CHECK_CHAT_READY':
      return await checkChatReady();
    case 'TYPE_AND_SEND':
      return await typeAndSend(message.payload);
    case 'GET_CURRENT_PHONE':
      return await getCurrentPhoneWithRetry();
    case 'SET_AUTO_REPLY_PROCESSING':
      isProcessingAutoReply = message.payload?.processing || false;
      console.log('[WhatsApp CRM] Auto-reply processing set to:', isProcessingAutoReply);
      if (!isProcessingAutoReply) {
        isInitialized = false;
        processedMessageIds = captureExistingMessageIds();
        setTimeout(() => {
          isInitialized = true;
          console.log('[WhatsApp CRM] Re-initialized after auto-reply complete');
        }, INITIALIZATION_DELAY);
      }
      return { success: true };
    case 'RESET_MESSAGE_LISTENER':
      isInitialized = false;
      processedMessageIds = captureExistingMessageIds();
      setTimeout(() => {
        isInitialized = true;
        console.log('[WhatsApp CRM] Message listener reset and re-initialized');
      }, INITIALIZATION_DELAY);
      return { success: true };
    case 'GET_CONTACTS':
      return await getWhatsAppContacts();
    case 'GET_LABELS':
      return await getWhatsAppLabels();
    default:
      return { error: 'Unknown message type' };
  }
}

async function getCurrentPhoneWithRetry() {
  console.log('[WhatsApp CRM] Getting current phone with retry...');
  
  for (let attempt = 0; attempt < 5; attempt++) {
    const phone = getCurrentChatPhone();
    if (phone && phone !== 'unknown' && /^\+?\d{10,15}$/.test(phone.replace(/[\s\-()]/g, ''))) {
      console.log('[WhatsApp CRM] Got valid phone on attempt', attempt + 1, ':', phone);
      return { phone: phone, success: true };
    }
    
    console.log('[WhatsApp CRM] Phone extraction attempt', attempt + 1, 'failed, waiting...');
    await sleep(1000);
  }
  
  console.log('[WhatsApp CRM] Failed to get phone after 5 attempts');
  return { phone: 'unknown', success: false };
}

function isWhatsAppConnected() {
  return document.querySelector(SELECTORS.SEARCH_BOX) !== null;
}

async function checkChatReady() {
  try {
    const messageBox = await waitForElement(SELECTORS.MESSAGE_BOX, 15000);
    return { ready: messageBox !== null };
  } catch (error) {
    return { ready: false, error: error.message };
  }
}

async function typeAndSend(payload) {
  try {
    console.log('Typing and sending message for:', payload.queueItemId);

    await waitForElement(SELECTORS.MESSAGE_BOX, 15000);

    if (payload.attachments && payload.attachments.length > 0) {
      for (const attachment of payload.attachments) {
        if (attachment.type === 'image') {
          await sendImageAsMedia(attachment);
        } else {
          await sendDocument(attachment);
        }
        await sleep(1500);
      }
    }

    if (payload.message && payload.message.trim()) {
      await typeMessage(payload.message);
      await sleep(500);

      if (await clickSendButton()) {
        await waitForMessageSent(payload.queueItemId);
        return { success: true };
      } else {
        throw new Error('Failed to click send button');
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error in typeAndSend:', error);
    return { success: false, error: error.message };
  }
}

async function sendMessage(payload) {
  try {
    console.log('Sending message to:', payload.phone);

    await waitForElement(SELECTORS.MESSAGE_BOX, 15000);

    if (payload.attachments && payload.attachments.length > 0) {
      for (const attachment of payload.attachments) {
        await sendAttachment(attachment);
        await sleep(1000);
      }
    }

    await typeMessage(payload.message);
    await sleep(500);

    if (await clickSendButton()) {
      await waitForMessageSent(payload.queueItemId);
      return { success: true };
    } else {
      throw new Error('Failed to click send button');
    }
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: error.message };
  }
}

async function sendMessageWithAttachment(payload) {
  try {
    console.log('Sending message with attachment to:', payload.phone);

    await waitForElement(SELECTORS.MESSAGE_BOX, 15000);

    for (const attachment of payload.attachments) {
      if (attachment.type === 'image') {
        await sendImageAsMedia(attachment);
      } else {
        await sendDocument(attachment);
      }
      await sleep(1500);
    }

    if (payload.message && payload.message.trim()) {
      await typeMessage(payload.message);
      await sleep(500);
      await clickSendButton();
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending message with attachment:', error);
    return { success: false, error: error.message };
  }
}

async function sendImageAsMedia(attachment) {
  try {
    console.log('[WhatsApp CRM] Starting image attachment flow (as media, not sticker)...');
    
    const attachButtonSelectors = [
      'span[data-icon="plus"]',
      'span[data-icon="attach-menu-plus"]',
      'span[data-icon="clip"]',
      'div[title="Attach"]',
      'button[aria-label="Attach"]',
      'div[aria-label="Attach"]',
      '[data-testid="attach-menu-plus"]',
      '[data-testid="clip"]',
      '[data-testid="conversation-clip"]',
      'footer button[aria-label*="ttach"]',
    ];
    
    console.log('[WhatsApp CRM] Step 1: Looking for attach button...');
    
    let attachButton = null;
    for (const selector of attachButtonSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const isInFooter = el.closest('footer') !== null;
        const isVisible = el.offsetParent !== null;
        if (isVisible || isInFooter) {
          attachButton = el;
          console.log('[WhatsApp CRM] Found attach button with selector:', selector);
          break;
        }
      }
      if (attachButton) break;
    }
    
    if (!attachButton) {
      const footer = document.querySelector('footer');
      if (footer) {
        const buttons = footer.querySelectorAll('button, div[role="button"], span[data-icon]');
        for (const btn of buttons) {
          const icon = btn.querySelector('span[data-icon]') || btn;
          const dataIcon = icon.getAttribute('data-icon');
          if (dataIcon && (dataIcon.includes('plus') || dataIcon.includes('clip') || dataIcon.includes('attach'))) {
            attachButton = btn;
            console.log('[WhatsApp CRM] Found attach button via footer scan, data-icon:', dataIcon);
            break;
          }
        }
      }
    }
    
    if (!attachButton) {
      await sleep(2000);
      for (const selector of attachButtonSelectors) {
        attachButton = document.querySelector(selector);
        if (attachButton) {
          console.log('[WhatsApp CRM] Found attach button after wait:', selector);
          break;
        }
      }
    }
    
    if (!attachButton) {
      console.error('[WhatsApp CRM] Attach button not found. Available elements in footer:');
      const footer = document.querySelector('footer');
      if (footer) {
        const allIcons = footer.querySelectorAll('span[data-icon]');
        allIcons.forEach(icon => console.log('[WhatsApp CRM] Icon found:', icon.getAttribute('data-icon')));
      }
      throw new Error('Attachment button not found');
    }
    
    const clickTarget = attachButton.closest('div[role="button"]') || attachButton.closest('button') || attachButton;
    clickTarget.click();
    console.log('[WhatsApp CRM] Clicked attach button');
    await sleep(1200);
    
    console.log('[WhatsApp CRM] Step 2: Clicking Photos & videos option...');
    const photosOptionSelectors = [
      '[data-testid="mi-attach-media"]',
      'button[aria-label="Photos & videos"]',
      'span[data-icon="image"]',
      'span[data-icon="gallery"]',
      'div[role="button"][aria-label*="hoto"]',
    ];
    
    let photosOption = null;
    for (const selector of photosOptionSelectors) {
      photosOption = document.querySelector(selector);
      if (photosOption) {
        console.log('[WhatsApp CRM] Found photos option with selector:', selector);
        const optionClickTarget = photosOption.closest('div[role="button"]') || photosOption.closest('button') || photosOption.closest('li') || photosOption;
        optionClickTarget.click();
        console.log('[WhatsApp CRM] Clicked photos option');
        await sleep(800);
        break;
      }
    }
    
    if (!photosOption) {
      console.log('[WhatsApp CRM] Photos option not found, looking for menu items...');
      const menuItems = document.querySelectorAll('li, div[role="button"], button');
      for (const item of menuItems) {
        const text = item.textContent?.toLowerCase() || '';
        const ariaLabel = item.getAttribute('aria-label')?.toLowerCase() || '';
        if (text.includes('photo') || text.includes('image') || text.includes('media') ||
            ariaLabel.includes('photo') || ariaLabel.includes('image') || ariaLabel.includes('media')) {
          console.log('[WhatsApp CRM] Found photos option via text search');
          item.click();
          await sleep(800);
          break;
        }
      }
    }
    
    console.log('[WhatsApp CRM] Step 3: Finding image input...');
    const imageInputSelectors = [
      'input[accept="image/*,video/mp4,video/3gpp,video/quicktime"]',
      'input[accept*="image/*"]',
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
    ];
    
    let imageInput = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      for (const selector of imageInputSelectors) {
        const inputs = document.querySelectorAll(selector);
        for (const input of inputs) {
          if (input.accept && input.accept.includes('image')) {
            imageInput = input;
            console.log('[WhatsApp CRM] Found image input with selector:', selector, 'accept:', input.accept);
            break;
          }
        }
        if (imageInput) break;
      }
      if (imageInput) break;
      
      console.log('[WhatsApp CRM] Image input not found, attempt', attempt + 1);
      await sleep(500);
    }
    
    if (!imageInput) {
      const allInputs = document.querySelectorAll('input[type="file"]');
      for (const input of allInputs) {
        console.log('[WhatsApp CRM] Found file input:', input.accept);
        if (!imageInput) {
          imageInput = input;
        }
      }
    }
    
    if (!imageInput) {
      throw new Error('Image input not found after multiple attempts');
    }

    console.log('[WhatsApp CRM] Step 4: Creating and uploading image file with TRUE JPEG conversion...');
    const originalBlob = base64ToBlob(attachment.data, true);
    console.log('[WhatsApp CRM] Original blob type:', originalBlob.type, 'size:', originalBlob.size, 'bytes');
    
    const jpegBlob = await convertToJpegBlob(originalBlob);
    
    let filename = attachment.filename || 'photo_' + Date.now() + '.jpg';
    filename = filename.replace(/\.[^.]+$/, '') + '.jpg';
    
    console.log('[WhatsApp CRM] Creating JPEG file:', filename, 'MIME: image/jpeg', 'Size:', jpegBlob.size, 'bytes');
    
    const file = new File([jpegBlob], filename, { type: 'image/jpeg', lastModified: Date.now() });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    imageInput.files = dataTransfer.files;

    const inputEvent = new Event('input', { bubbles: true });
    imageInput.dispatchEvent(inputEvent);
    const changeEvent = new Event('change', { bubbles: true });
    imageInput.dispatchEvent(changeEvent);
    console.log('[WhatsApp CRM] Dispatched input and change events');

    console.log('[WhatsApp CRM] Step 5: Waiting for preview to load...');
    await sleep(3500);
    
    const previewSelectors = [
      'div[data-testid="media-canvas"]',
      'div[data-testid="image-preview"]',
      'div[data-testid="media-editor"]',
      'div[class*="media-viewer"]',
    ];
    
    let previewFound = false;
    for (const selector of previewSelectors) {
      if (document.querySelector(selector)) {
        previewFound = true;
        console.log('[WhatsApp CRM] Preview loaded:', selector);
        break;
      }
    }
    
    if (!previewFound) {
      console.log('[WhatsApp CRM] Preview not detected, waiting longer...');
      await sleep(2500);
    }
    
    console.log('[WhatsApp CRM] Step 6: Adding caption to ensure media (not sticker) mode...');
    const captionInputSelectors = [
      'div[data-testid="media-caption-input-container"] div[contenteditable="true"]',
      'div[data-testid="media-caption-input"] div[contenteditable="true"]',
      'div[contenteditable="true"][data-tab="6"]',
      'div[contenteditable="true"][data-tab="10"]',
      'footer div[contenteditable="true"]',
    ];
    
    let captionInput = null;
    for (const selector of captionInputSelectors) {
      captionInput = document.querySelector(selector);
      if (captionInput) {
        console.log('[WhatsApp CRM] Found caption input:', selector);
        captionInput.focus();
        document.execCommand('insertText', false, ' ');
        await sleep(300);
        break;
      }
    }

    console.log('[WhatsApp CRM] Step 7: Finding and clicking send button...');
    const sendButtonSelectors = [
      'span[data-icon="send"]',
      '[data-testid="send"]',
      '[data-testid="media-editor-send-button"]',
      'div[role="button"][aria-label="Send"]',
      'div[aria-label="Send"]',
      'button[aria-label="Send"]',
      'div[role="button"] span[data-icon="send"]',
      'span[data-icon="send-light"]',
      'span[data-icon="send-filled"]',
      '[data-testid="compose-btn-send"]',
      '[data-testid="media-send"]',
    ];
    
    let sendBtn = null;
    let attempts = 0;
    const maxAttempts = 20;
    
    while (!sendBtn && attempts < maxAttempts) {
      for (const selector of sendButtonSelectors) {
        const btn = document.querySelector(selector);
        if (btn) {
          sendBtn = btn;
          console.log('[WhatsApp CRM] Found send button with selector:', selector, 'on attempt', attempts + 1);
          break;
        }
      }
      
      if (!sendBtn) {
        const allIcons = document.querySelectorAll('span[data-icon]');
        for (const icon of allIcons) {
          const dataIcon = icon.getAttribute('data-icon');
          if (dataIcon && dataIcon.toLowerCase().includes('send')) {
            sendBtn = icon;
            console.log('[WhatsApp CRM] Found send button via icon scan:', dataIcon, 'on attempt', attempts + 1);
            break;
          }
        }
      }
      
      if (!sendBtn) {
        if (attempts === 10) {
          console.log('[WhatsApp CRM] Send button not found after 10 attempts, scanning all buttons...');
          const allButtons = document.querySelectorAll('div[role="button"], button, span[data-icon], [data-testid]');
          allButtons.forEach((btn, idx) => {
            const dataIcon = btn.getAttribute('data-icon');
            const ariaLabel = btn.getAttribute('aria-label');
            const testId = btn.getAttribute('data-testid');
            if (dataIcon || ariaLabel || testId) {
              console.log(`[WhatsApp CRM] Button ${idx}: data-icon=${dataIcon}, aria-label=${ariaLabel}, data-testid=${testId}`);
            }
          });
        }
        await sleep(500);
        attempts++;
      }
    }
    
    if (sendBtn) {
      const sendClickTarget = sendBtn.closest('div[role="button"]') || sendBtn.closest('button') || sendBtn;
      sendClickTarget.click();
      console.log('[WhatsApp CRM] Clicked send button for image attachment');
      await sleep(2500);
    } else {
      console.error('[WhatsApp CRM] Send button not found after', maxAttempts, 'attempts. Available icons:');
      const allIcons = document.querySelectorAll('span[data-icon]');
      allIcons.forEach(icon => console.log('[WhatsApp CRM] Icon:', icon.getAttribute('data-icon')));
      throw new Error('Send button not found for image attachment');
    }
    
    console.log('[WhatsApp CRM] Image attachment flow completed');
  } catch (error) {
    console.error('[WhatsApp CRM] Error sending image as media:', error);
    throw error;
  }
}

async function sendDocument(attachment) {
  try {
    console.log('[WhatsApp CRM] Starting document attachment flow...');
    
    const attachButtonSelectors = [
      'span[data-icon="plus"]',
      'span[data-icon="attach-menu-plus"]',
      'span[data-icon="clip"]',
      'div[title="Attach"]',
      'button[aria-label="Attach"]',
      'div[aria-label="Attach"]',
      '[data-testid="attach-menu-plus"]',
      '[data-testid="clip"]',
      '[data-testid="conversation-clip"]',
      'footer button[aria-label*="ttach"]',
      'footer span[data-icon]',
    ];
    
    console.log('[WhatsApp CRM] Looking for attach button for document...');
    
    let attachButton = null;
    for (const selector of attachButtonSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const isInFooter = el.closest('footer') !== null;
        const isVisible = el.offsetParent !== null;
        if (isVisible || isInFooter) {
          attachButton = el;
          console.log('[WhatsApp CRM] Found attach button with selector:', selector);
          break;
        }
      }
      if (attachButton) break;
    }
    
    if (!attachButton) {
      const footer = document.querySelector('footer');
      if (footer) {
        const buttons = footer.querySelectorAll('button, div[role="button"], span[data-icon]');
        for (const btn of buttons) {
          const icon = btn.querySelector('span[data-icon]') || btn;
          const dataIcon = icon.getAttribute('data-icon');
          if (dataIcon && (dataIcon.includes('plus') || dataIcon.includes('clip') || dataIcon.includes('attach'))) {
            attachButton = btn;
            console.log('[WhatsApp CRM] Found attach button via footer scan, data-icon:', dataIcon);
            break;
          }
        }
      }
    }
    
    if (!attachButton) {
      await sleep(2000);
      for (const selector of attachButtonSelectors) {
        attachButton = document.querySelector(selector);
        if (attachButton) {
          console.log('[WhatsApp CRM] Found attach button after wait:', selector);
          break;
        }
      }
    }
    
    if (!attachButton) {
      throw new Error('Attachment button not found');
    }
    
    const clickTarget = attachButton.closest('div[role="button"]') || attachButton.closest('button') || attachButton;
    clickTarget.click();
    console.log('[WhatsApp CRM] Clicked attach button for document');
    await sleep(1000);
    
    const docOptionSelectors = [
      'button[aria-label="Document"]',
      'li[data-animate-dropdown-item="true"]:nth-child(2)',
      'span[data-icon="document"]',
      '[data-testid="mi-attach-document"]',
    ];
    
    for (const selector of docOptionSelectors) {
      const option = document.querySelector(selector);
      if (option) {
        console.log('[WhatsApp CRM] Clicking document option:', selector);
        option.click();
        await sleep(500);
        break;
      }
    }
    
    const docInputSelectors = [
      'input[accept="*"]',
      'input[type="file"]:not([accept*="image"])',
      'input[type="file"]',
    ];
    
    let docInput = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      for (const selector of docInputSelectors) {
        docInput = document.querySelector(selector);
        if (docInput) {
          console.log('[WhatsApp CRM] Found document input with selector:', selector);
          break;
        }
      }
      if (docInput) break;
      await sleep(500);
    }
    
    if (!docInput) {
      throw new Error('Document input not found');
    }

    const blob = base64ToBlob(attachment.data);
    const file = new File([blob], attachment.filename || 'document.pdf', { type: blob.type });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    docInput.files = dataTransfer.files;

    const changeEvent = new Event('change', { bubbles: true });
    docInput.dispatchEvent(changeEvent);
    console.log('[WhatsApp CRM] Dispatched change event with document file');

    await sleep(2500);

    const sendButtonSelectors = [
      'span[data-icon="send"]',
      '[data-testid="send"]',
      '[data-testid="media-editor-send-button"]',
      'div[role="button"][aria-label="Send"]',
      'div[aria-label="Send"]',
      'button[aria-label="Send"]',
      'span[data-icon="send-light"]',
      'span[data-icon="send-filled"]',
    ];
    
    let sendBtn = null;
    let attempts = 0;
    const maxAttempts = 20;
    
    while (!sendBtn && attempts < maxAttempts) {
      for (const selector of sendButtonSelectors) {
        sendBtn = document.querySelector(selector);
        if (sendBtn) {
          console.log('[WhatsApp CRM] Found send button for document with selector:', selector);
          break;
        }
      }
      
      if (!sendBtn) {
        const allIcons = document.querySelectorAll('span[data-icon]');
        for (const icon of allIcons) {
          const dataIcon = icon.getAttribute('data-icon');
          if (dataIcon && dataIcon.toLowerCase().includes('send')) {
            sendBtn = icon;
            console.log('[WhatsApp CRM] Found send button for document via icon scan:', dataIcon);
            break;
          }
        }
      }
      
      if (!sendBtn) {
        await sleep(500);
        attempts++;
      }
    }
    
    if (sendBtn) {
      const sendClickTarget = sendBtn.closest('div[role="button"]') || sendBtn.closest('button') || sendBtn;
      sendClickTarget.click();
      console.log('[WhatsApp CRM] Clicked send button for document');
      await sleep(2000);
    } else {
      console.log('[WhatsApp CRM] Send button not found, trying Enter key fallback...');
      const activeElement = document.activeElement;
      if (activeElement) {
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });
        activeElement.dispatchEvent(enterEvent);
        console.log('[WhatsApp CRM] Dispatched Enter key event as fallback');
        await sleep(2000);
      } else {
        console.error('[WhatsApp CRM] Send button not found for document after', maxAttempts, 'attempts and Enter fallback failed');
        throw new Error('Send button not found for document attachment');
      }
    }
  } catch (error) {
    console.error('[WhatsApp CRM] Error sending document:', error);
    throw error;
  }
}

async function sendAttachment(attachment) {
  if (attachment.type === 'image') {
    await sendImageAsMedia(attachment);
  } else {
    await sendDocument(attachment);
  }
}

async function typeMessage(message) {
  const messageBox = await waitForElement(SELECTORS.MESSAGE_BOX, 10000);
  if (!messageBox) throw new Error('Message box not found');

  messageBox.focus();
  
  const lines = message.split('\n');
  for (let i = 0; i < lines.length; i++) {
    document.execCommand('insertText', false, lines[i]);
    if (i < lines.length - 1) {
      const shiftEnter = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        shiftKey: true,
        bubbles: true,
      });
      messageBox.dispatchEvent(shiftEnter);
    }
  }
  await sleep(300);
}

async function clickSendButton() {
  console.log('[WhatsApp CRM] Looking for send button...');
  
  const sendButtonSelectors = [
    'span[data-icon="send"]',
    'button[aria-label="Send"]',
    'button[data-tab="11"]',
    'div[role="button"][aria-label="Send"]',
    '[data-testid="send"]',
    '[data-testid="compose-btn-send"]',
    'footer button[aria-label*="end"]',
    'button.send-button',
  ];

  for (const selector of sendButtonSelectors) {
    const button = document.querySelector(selector);
    if (button) {
      console.log('[WhatsApp CRM] Found send button with selector:', selector);
      const clickTarget = button.closest('button') || button.closest('div[role="button"]') || button;
      clickTarget.click();
      await sleep(500);
      return true;
    }
  }

  const footer = document.querySelector('footer');
  if (footer) {
    const buttons = footer.querySelectorAll('button, span[data-icon], div[role="button"]');
    for (const btn of buttons) {
      const ariaLabel = btn.getAttribute('aria-label') || '';
      const dataIcon = btn.getAttribute('data-icon') || '';
      if (ariaLabel.toLowerCase().includes('send') || dataIcon === 'send') {
        console.log('[WhatsApp CRM] Found send button via footer scan');
        const clickTarget = btn.closest('button') || btn.closest('div[role="button"]') || btn;
        clickTarget.click();
        await sleep(500);
        return true;
      }
    }
  }

  const allButtons = document.querySelectorAll('button, span[data-icon], div[role="button"]');
  for (const btn of allButtons) {
    const ariaLabel = btn.getAttribute('aria-label') || '';
    const dataIcon = btn.getAttribute('data-icon') || '';
    if (ariaLabel.toLowerCase().includes('send') || dataIcon === 'send') {
      console.log('[WhatsApp CRM] Found send button via global scan');
      btn.click();
      await sleep(500);
      return true;
    }
  }

  console.error('[WhatsApp CRM] Send button not found');
  return false;
}

async function waitForMessageSent(queueItemId) {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 20;
    
    const checkInterval = setInterval(() => {
      attempts++;
      const statusIcons = document.querySelectorAll(SELECTORS.MESSAGE_STATUS_SENT);
      if (statusIcons.length > 0 || attempts >= maxAttempts) {
        clearInterval(checkInterval);
        resolve(true);
      }
    }, 500);
  });
}

async function waitForChatToLoad() {
  let attempts = 0;
  const maxAttempts = 30;
  while (attempts < maxAttempts) {
    if (document.querySelector(SELECTORS.MESSAGE_BOX)) {
      return;
    }
    await sleep(500);
    attempts++;
  }
  throw new Error('Chat failed to load');
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve) => {
    const selectors = selector.split(', ');
    
    for (const sel of selectors) {
      const element = document.querySelector(sel.trim());
      if (element) {
        resolve(element);
        return;
      }
    }

    const observer = new MutationObserver(() => {
      for (const sel of selectors) {
        const element = document.querySelector(sel.trim());
        if (element) {
          observer.disconnect();
          resolve(element);
          return;
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

function sanitizePhone(phone) {
  return phone.replace(/[^\d]/g, '');
}

function base64ToBlob(dataUrl, forceImageType = false) {
  const parts = dataUrl.split(',');
  let mimeType = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
  
  if (forceImageType && !mimeType.startsWith('image/')) {
    mimeType = 'image/jpeg';
  }
  
  if (mimeType === 'image/webp' || mimeType === 'image/gif') {
    mimeType = 'image/jpeg';
  }
  
  const base64 = atob(parts[1]);
  let length = base64.length;
  const bytes = new Uint8Array(length);
  while (length--) {
    bytes[length] = base64.charCodeAt(length);
  }
  return new Blob([bytes], { type: mimeType });
}

async function convertToJpegBlob(originalBlob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(originalBlob);
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob(
          (jpegBlob) => {
            URL.revokeObjectURL(url);
            if (jpegBlob) {
              console.log('[WhatsApp CRM] Converted image to JPEG:', jpegBlob.size, 'bytes');
              resolve(jpegBlob);
            } else {
              reject(new Error('Failed to convert image to JPEG'));
            }
          },
          'image/jpeg',
          0.95
        );
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for conversion'));
    };
    
    img.src = url;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const MESSAGE_SELECTORS = {
  INCOMING_MESSAGE: [
    'div.message-in',
    'div[data-testid="msg-container"].message-in',
    'div[class*="message-in"]',
  ],
  MESSAGE_TEXT: [
    'span.selectable-text span',
    'span[data-testid="conversation-text"]',
    'span.selectable-text',
    'div[data-testid="msg-text"] span',
    'div.copyable-text span',
  ],
  CHAT_HEADER_TITLE: [
    'span[data-testid="conversation-info-header-chat-title"]',
    'header span[title]',
    'div[data-testid="conversation-header"] span[title]',
  ],
  CHAT_LIST: [
    '[aria-label="Chat list"]',
    'div[data-testid="chat-list"]',
    '#pane-side',
  ],
  CHAT_LIST_ITEM: [
    'div[data-testid="cell-frame-container"]',
    'div[data-testid="list-item-container"]',
    'div[role="listitem"]',
  ],
  UNREAD_INDICATOR: [
    'span[data-testid="icon-unread-count"]',
    'span[aria-label*="unread"]',
    'div[data-testid="unread-count"]',
  ],
  CHAT_PREVIEW_TEXT: [
    'span[data-testid="last-msg-status"]',
    'span[title][dir="ltr"]',
    'div[data-testid="cell-frame-secondary"] span',
  ],
};

let processedMessageIds = new Set();
let isProcessingAutoReply = false;
let isInitialized = false;
let initializationTimestamp = 0;
const INITIALIZATION_DELAY = 3000;
const COOLDOWN_MS = 5000;
let lastProcessedTimestamp = 0;

function captureExistingMessageIds() {
  const existingIds = new Set();
  for (const selector of MESSAGE_SELECTORS.INCOMING_MESSAGE) {
    const messages = document.querySelectorAll(selector);
    messages.forEach((msg) => {
      const dataId = msg.getAttribute('data-id') || msg.closest('[data-id]')?.getAttribute('data-id');
      if (dataId) {
        existingIds.add(dataId);
      }
    });
  }
  console.log('[WhatsApp CRM] Captured', existingIds.size, 'existing message IDs to ignore');
  return existingIds;
}

let pendingMessageNodes = new Set();
let debounceTimer = null;
const DEBOUNCE_MS = 500;

function setupIncomingMessageObserver() {
  console.log('[WhatsApp CRM] Setting up real-time message listener (ignoring chat history)');
  
  processedMessageIds = captureExistingMessageIds();
  
  setTimeout(() => {
    isInitialized = true;
    initializationTimestamp = Date.now();
    console.log('[WhatsApp CRM] Initialization complete - now listening for NEW messages only');
    console.log('[WhatsApp CRM] Will ignore', processedMessageIds.size, 'existing messages');
  }, INITIALIZATION_DELAY);
  
  const processPendingMessages = () => {
    if (pendingMessageNodes.size === 0) return;
    
    const nodesToProcess = Array.from(pendingMessageNodes);
    pendingMessageNodes.clear();
    
    for (const node of nodesToProcess) {
      if (document.contains(node)) {
        checkForNewIncomingMessage(node);
      }
    }
  };
  
  const debouncedProcess = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(processPendingMessages, DEBOUNCE_MS);
  };
  
  const observer = new MutationObserver((mutations) => {
    if (!isInitialized || isProcessingAutoReply) {
      return;
    }
    
    let hasNewMessageNodes = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const isMessageIn = node.classList?.contains('message-in') || 
                               (node.querySelector && node.querySelector('.message-in'));
            if (isMessageIn) {
              pendingMessageNodes.add(node);
              hasNewMessageNodes = true;
            }
          }
        }
      }
    }
    
    if (hasNewMessageNodes) {
      debouncedProcess();
    }
  });

  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
    characterData: false,
    attributes: false,
  });
  
  console.log('[WhatsApp CRM] Real-time message observer active with debounce');
  return observer;
}

function checkForNewIncomingMessage(node) {
  for (const selector of MESSAGE_SELECTORS.INCOMING_MESSAGE) {
    if (node.matches && node.matches(selector)) {
      processLatestIncomingMessage(node);
      return;
    }
    if (node.querySelectorAll) {
      const found = node.querySelectorAll(selector);
      if (found.length > 0) {
        processLatestIncomingMessage(found[found.length - 1]);
        return;
      }
    }
  }
}

async function processLatestIncomingMessage(msgElement) {
  if (isProcessingAutoReply) {
    console.log('[WhatsApp CRM] Skipping - auto-reply in progress');
    return;
  }
  
  const now = Date.now();
  if (now - lastProcessedTimestamp < COOLDOWN_MS) {
    console.log('[WhatsApp CRM] Skipping - cooldown active');
    return;
  }
  
  const messageId = msgElement.getAttribute('data-id') || 
                    msgElement.closest('[data-id]')?.getAttribute('data-id');
  
  if (!messageId) {
    console.log('[WhatsApp CRM] No message ID found, skipping');
    return;
  }
  
  if (processedMessageIds.has(messageId)) {
    return;
  }
  
  if (msgElement.classList.contains('message-out') || 
      msgElement.closest('.message-out') ||
      msgElement.querySelector('[data-icon="msg-check"]') ||
      msgElement.querySelector('[data-icon="msg-dblcheck"]')) {
    return;
  }
  
  let messageText = null;
  for (const selector of MESSAGE_SELECTORS.MESSAGE_TEXT) {
    const textElement = msgElement.querySelector(selector);
    if (textElement && textElement.textContent) {
      messageText = textElement.textContent.trim();
      break;
    }
  }
  
  if (!messageText) {
    return;
  }
  
  processedMessageIds.add(messageId);
  lastProcessedTimestamp = now;
  
  if (processedMessageIds.size > 500) {
    const idsArray = Array.from(processedMessageIds);
    processedMessageIds = new Set(idsArray.slice(-250));
  }
  
  console.log('[WhatsApp CRM] === NEW MESSAGE DETECTED ===');
  console.log('[WhatsApp CRM] Message ID:', messageId);
  console.log('[WhatsApp CRM] Message Text:', messageText);
  
  await sleep(300);
  
  let phoneNumber = extractPhoneFromMessageElement(msgElement);
  
  if (!phoneNumber || phoneNumber === 'unknown') {
    console.log('[WhatsApp CRM] Waiting for phone number...');
    await sleep(800);
    phoneNumber = getCurrentChatPhone();
  }
  
  if (!phoneNumber || phoneNumber === 'unknown') {
    console.log('[WhatsApp CRM] Retrying phone extraction...');
    await sleep(1000);
    phoneNumber = getCurrentChatPhone();
  }
  
  if (!phoneNumber || phoneNumber === 'unknown') {
    console.log('[WhatsApp CRM] Could not get phone number, aborting');
    return;
  }
  
  console.log('[WhatsApp CRM] Phone Number:', phoneNumber);
  console.log('[WhatsApp CRM] Sending to background for rule matching...');
  
  chrome.runtime.sendMessage({
    type: 'INCOMING_MESSAGE',
    payload: {
      from: phoneNumber,
      message: messageText,
      timestamp: now,
      messageId: messageId,
    },
    timestamp: now,
    id: crypto.randomUUID(),
  }).then((response) => {
    console.log('[WhatsApp CRM] Background acknowledged:', response);
  }).catch((error) => {
    console.error('[WhatsApp CRM] Error sending to background:', error);
  });
}

function extractPhoneFromMessageElement(msgElement) {
  const phonePatterns = [
    /false_(\d+)@/,
    /true_(\d+)@/,
    /(\d{10,15})@c\.us/,
    /(\d{10,15})@s\.whatsapp\.net/,
  ];
  
  const dataId = msgElement.getAttribute('data-id');
  console.log('[WhatsApp CRM] Message element data-id:', dataId);
  
  if (dataId) {
    for (const pattern of phonePatterns) {
      const phoneMatch = dataId.match(pattern);
      if (phoneMatch && phoneMatch[1].length >= 10) {
        console.log('[WhatsApp CRM] Phone from message data-id:', phoneMatch[1]);
        return phoneMatch[1];
      }
    }
  }
  
  let parent = msgElement;
  for (let i = 0; i < 10 && parent; i++) {
    const parentDataId = parent.getAttribute('data-id');
    if (parentDataId) {
      for (const pattern of phonePatterns) {
        const phoneMatch = parentDataId.match(pattern);
        if (phoneMatch && phoneMatch[1].length >= 10) {
          console.log('[WhatsApp CRM] Phone from parent data-id:', phoneMatch[1]);
          return phoneMatch[1];
        }
      }
    }
    parent = parent.parentElement;
  }
  
  const messageRow = msgElement.closest('[data-id]');
  if (messageRow) {
    const rowDataId = messageRow.getAttribute('data-id');
    console.log('[WhatsApp CRM] Message row data-id:', rowDataId);
    if (rowDataId) {
      for (const pattern of phonePatterns) {
        const phoneMatch = rowDataId.match(pattern);
        if (phoneMatch && phoneMatch[1].length >= 10) {
          console.log('[WhatsApp CRM] Phone from row data-id:', phoneMatch[1]);
          return phoneMatch[1];
        }
      }
    }
  }
  
  const activeChatItem = document.querySelector('[data-testid="cell-frame-container"][aria-selected="true"]') ||
                         document.querySelector('[data-testid="list-item-container"][aria-selected="true"]') ||
                         document.querySelector('div[tabindex="-1"][data-id]');
  
  if (activeChatItem) {
    const chatDataId = activeChatItem.getAttribute('data-id');
    console.log('[WhatsApp CRM] Active chat data-id:', chatDataId);
    if (chatDataId) {
      for (const pattern of phonePatterns) {
        const phoneMatch = chatDataId.match(pattern);
        if (phoneMatch && phoneMatch[1].length >= 10) {
          console.log('[WhatsApp CRM] Phone from active chat:', phoneMatch[1]);
          return phoneMatch[1];
        }
      }
      const simpleMatch = chatDataId.match(/(\d{10,15})/);
      if (simpleMatch) {
        console.log('[WhatsApp CRM] Phone from active chat (simple):', simpleMatch[1]);
        return simpleMatch[1];
      }
    }
  }
  
  return null;
}

let lastKnownPhoneNumber = null;

function getCurrentChatPhone() {
  console.log('[WhatsApp CRM] getCurrentChatPhone called, URL:', window.location.href);
  
  const urlMatch = window.location.href.match(/phone=(\d+)/);
  if (urlMatch) {
    lastKnownPhoneNumber = urlMatch[1];
    console.log('[WhatsApp CRM] Phone from URL:', lastKnownPhoneNumber);
    return lastKnownPhoneNumber;
  }
  
  const conversationPanel = document.querySelector('[data-testid="conversation-panel-wrapper"]');
  if (conversationPanel) {
    const panelDataId = conversationPanel.getAttribute('data-id');
    console.log('[WhatsApp CRM] Conversation panel data-id:', panelDataId);
    if (panelDataId) {
      const phoneMatch = panelDataId.match(/(\d{10,15})/);
      if (phoneMatch) {
        lastKnownPhoneNumber = phoneMatch[1];
        console.log('[WhatsApp CRM] Phone from conversation panel:', lastKnownPhoneNumber);
        return lastKnownPhoneNumber;
      }
    }
  }
  
  const chatListItems = document.querySelectorAll('[data-testid="cell-frame-container"], [data-testid="list-item-container"]');
  for (const item of chatListItems) {
    if (item.getAttribute('aria-selected') === 'true' || item.classList.contains('_amjy')) {
      const itemDataId = item.getAttribute('data-id');
      console.log('[WhatsApp CRM] Selected chat item data-id:', itemDataId);
      if (itemDataId) {
        const phoneMatch = itemDataId.match(/(\d{10,15})@/);
        if (phoneMatch) {
          lastKnownPhoneNumber = phoneMatch[1];
          console.log('[WhatsApp CRM] Phone from selected chat item:', lastKnownPhoneNumber);
          return lastKnownPhoneNumber;
        }
      }
    }
  }
  
  const phoneSelectors = [
    'span[data-testid="conversation-info-header-chat-title"]',
    'header span[title]',
    'div[data-testid="conversation-header"] span[title]',
    'span._ao3e[title]',
    'div[data-testid="chat-title"] span[title]',
  ];
  
  for (const selector of phoneSelectors) {
    const headerElement = document.querySelector(selector);
    if (headerElement) {
      const title = headerElement.getAttribute('title') || headerElement.textContent || '';
      console.log('[WhatsApp CRM] Header element title:', title);
      const phoneMatch = title.match(/^\+?[\d\s\-()]{10,}$/);
      if (phoneMatch) {
        const cleanPhone = phoneMatch[0].replace(/[\s\-()]/g, '');
        if (cleanPhone.length >= 10 && /^\+?\d+$/.test(cleanPhone)) {
          lastKnownPhoneNumber = cleanPhone;
          console.log('[WhatsApp CRM] Phone from header:', lastKnownPhoneNumber);
          return lastKnownPhoneNumber;
        }
      }
    }
  }
  
  const aboutSection = document.querySelector('span[data-testid="about"]');
  if (aboutSection) {
    const parent = aboutSection.closest('[data-testid="contact-info-drawer"]');
    if (parent) {
      const phoneElement = parent.querySelector('span[data-testid="phone-number"]');
      if (phoneElement) {
        const phoneText = phoneElement.textContent || '';
        const cleanPhone = phoneText.replace(/[\s\-()]/g, '');
        if (cleanPhone.length >= 10 && /^\+?\d+$/.test(cleanPhone)) {
          lastKnownPhoneNumber = cleanPhone;
          console.log('[WhatsApp CRM] Phone from contact info:', lastKnownPhoneNumber);
          return lastKnownPhoneNumber;
        }
      }
    }
  }
  
  if (lastKnownPhoneNumber) {
    console.log('[WhatsApp CRM] Using last known phone:', lastKnownPhoneNumber);
    return lastKnownPhoneNumber;
  }
  
  console.log('[WhatsApp CRM] Could not extract phone number from any source');
  return 'unknown';
}

const incomingMessageObserver = setupIncomingMessageObserver();

let processedSidebarMessages = new Set();
let sidebarDebounceTimer = null;
const SIDEBAR_DEBOUNCE_MS = 1000;

function setupSidebarObserver() {
  console.log('[WhatsApp CRM] Setting up sidebar observer for background auto-reply');
  
  let chatListContainer = null;
  for (const selector of MESSAGE_SELECTORS.CHAT_LIST) {
    chatListContainer = document.querySelector(selector);
    if (chatListContainer) {
      console.log('[WhatsApp CRM] Found chat list container:', selector);
      break;
    }
  }
  
  if (!chatListContainer) {
    chatListContainer = document.querySelector('#pane-side') || document.body;
    console.log('[WhatsApp CRM] Using fallback container for sidebar observer');
  }
  
  const processSidebarChanges = () => {
    if (isProcessingAutoReply) return;
    
    for (const itemSelector of MESSAGE_SELECTORS.CHAT_LIST_ITEM) {
      const chatItems = document.querySelectorAll(itemSelector);
      
      for (const item of chatItems) {
        let hasUnread = false;
        for (const unreadSelector of MESSAGE_SELECTORS.UNREAD_INDICATOR) {
          if (item.querySelector(unreadSelector)) {
            hasUnread = true;
            break;
          }
        }
        
        if (!hasUnread) continue;
        
        let previewText = null;
        const secondaryContainer = item.querySelector('div[data-testid="cell-frame-secondary"]');
        if (secondaryContainer) {
          const spans = secondaryContainer.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent?.trim();
            if (text && text.length > 0 && !text.match(/^\d+:\d+/) && !text.includes('typing')) {
              previewText = text;
              break;
            }
          }
        }
        
        if (!previewText) {
          for (const previewSelector of MESSAGE_SELECTORS.CHAT_PREVIEW_TEXT) {
            const previewEl = item.querySelector(previewSelector);
            if (previewEl && previewEl.textContent) {
              previewText = previewEl.textContent.trim();
              break;
            }
          }
        }
        
        if (!previewText) continue;
        
        let phoneNumber = null;
        const dataId = item.getAttribute('data-id');
        if (dataId) {
          const phoneMatch = dataId.match(/(\d{10,15})@/);
          if (phoneMatch) {
            phoneNumber = phoneMatch[1];
          }
        }
        
        if (!phoneNumber) {
          const titleSpan = item.querySelector('span[title]');
          if (titleSpan) {
            const title = titleSpan.getAttribute('title');
            const cleanedTitle = title?.replace(/[^\d]/g, '');
            if (cleanedTitle && cleanedTitle.length >= 10 && cleanedTitle.length <= 15) {
              phoneNumber = cleanedTitle;
            }
          }
        }
        
        if (!phoneNumber) continue;
        
        const sidebarMsgId = `sidebar_${phoneNumber}_${previewText.substring(0, 50)}`;
        
        if (processedSidebarMessages.has(sidebarMsgId) || processedMessageIds.has(sidebarMsgId)) {
          continue;
        }
        
        processedSidebarMessages.add(sidebarMsgId);
        processedMessageIds.add(sidebarMsgId);
        
        if (processedSidebarMessages.size > 200) {
          const arr = Array.from(processedSidebarMessages);
          processedSidebarMessages = new Set(arr.slice(-100));
        }
        
        console.log('[WhatsApp CRM] === SIDEBAR MESSAGE DETECTED ===');
        console.log('[WhatsApp CRM] Phone:', phoneNumber);
        console.log('[WhatsApp CRM] Preview:', previewText);
        
        chrome.runtime.sendMessage({
          type: 'INCOMING_MESSAGE',
          payload: {
            from: phoneNumber,
            message: previewText,
            timestamp: Date.now(),
            messageId: sidebarMsgId,
            source: 'sidebar',
          },
          timestamp: Date.now(),
          id: crypto.randomUUID(),
        }).then((response) => {
          console.log('[WhatsApp CRM] Background acknowledged sidebar message:', response);
        }).catch((error) => {
          console.error('[WhatsApp CRM] Error sending sidebar message to background:', error);
        });
        
        return;
      }
    }
  };
  
  const debouncedSidebarProcess = () => {
    if (sidebarDebounceTimer) {
      clearTimeout(sidebarDebounceTimer);
    }
    sidebarDebounceTimer = setTimeout(processSidebarChanges, SIDEBAR_DEBOUNCE_MS);
  };
  
  const sidebarObserver = new MutationObserver((mutations) => {
    if (!isInitialized || isProcessingAutoReply) return;
    
    let hasRelevantChange = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        hasRelevantChange = true;
        break;
      }
      if (mutation.type === 'attributes' && 
          (mutation.attributeName === 'class' || mutation.attributeName === 'data-testid')) {
        hasRelevantChange = true;
        break;
      }
    }
    
    if (hasRelevantChange) {
      debouncedSidebarProcess();
    }
  });
  
  sidebarObserver.observe(chatListContainer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-testid'],
  });
  
  console.log('[WhatsApp CRM] Sidebar observer active');
  return sidebarObserver;
}

setTimeout(() => {
  setupSidebarObserver();
}, 5000);

const sentMessageObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      const sentIndicators = document.querySelectorAll(
        'span[data-icon="msg-check"], span[data-icon="msg-dblcheck"], span[data-icon="msg-dblcheck-ack"]'
      );
      if (sentIndicators.length > 0) {
        chrome.runtime.sendMessage({
          type: 'MESSAGE_STATUS_UPDATE',
          payload: {
            status: 'sent',
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
          id: crypto.randomUUID(),
        }).catch(() => {});
      }
    }
  }
});

sentMessageObserver.observe(document.body, { childList: true, subtree: true });

async function getWhatsAppContacts() {
  const contacts = [];
  const chatItems = document.querySelectorAll(SELECTORS.CHAT_LIST_ITEM);
  
  chatItems.forEach((item) => {
    const nameElement = item.querySelector('span[title]');
    if (nameElement) {
      const name = nameElement.getAttribute('title');
      contacts.push({
        name: name,
        phone: '',
        source: 'whatsapp',
      });
    }
  });
  
  return { contacts };
}

async function getWhatsAppLabels() {
  const labels = [];
  const labelElements = document.querySelectorAll('[data-testid="label"]');
  
  labelElements.forEach((el) => {
    const labelName = el.textContent;
    if (labelName) {
      labels.push({ name: labelName });
    }
  });
  
  return { labels };
}

console.log('WhatsApp CRM content script initialized');
