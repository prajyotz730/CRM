console.log('WhatsApp CRM content script loaded');

const SELECTORS = {
  SEARCH_BOX: 'div[contenteditable="true"][data-tab="3"]',
  CHAT_SEARCH: 'div[contenteditable="true"][data-tab="3"]',
  MESSAGE_BOX: 'div[contenteditable="true"][data-tab="10"]',
  SEND_BUTTON: 'button[aria-label="Send"], span[data-icon="send"]',
  CHAT_HEADER: 'header',
  ATTACHMENT_BUTTON: 'div[title="Attach"], button[aria-label="Attach"], span[data-icon="attach-menu-plus"], span[data-icon="clip"]',
  ATTACHMENT_MENU: 'div[data-animate-modal-popup="true"], ul[role="menu"]',
  PHOTOS_VIDEOS_OPTION: 'button[aria-label="Photos & videos"], li[data-animate-dropdown-item="true"]:first-child, input[accept="image/*,video/mp4,video/3gpp,video/quicktime"]',
  DOCUMENT_OPTION: 'button[aria-label="Document"], li[data-animate-dropdown-item="true"]:nth-child(2)',
  IMAGE_INPUT: 'input[accept="image/*,video/mp4,video/3gpp,video/quicktime"]',
  DOCUMENT_INPUT: 'input[accept="*"]',
  SEND_ATTACHMENT_BUTTON: 'span[data-icon="send"], div[aria-label="Send"]',
  MESSAGE_STATUS_SENT: 'span[data-icon="msg-check"], span[data-icon="msg-dblcheck"]',
  MESSAGE_STATUS_DELIVERED: 'span[data-icon="msg-dblcheck"]',
  MESSAGE_STATUS_READ: 'span[data-icon="msg-dblcheck-ack"]',
  CHAT_LIST_ITEM: 'div[data-testid="cell-frame-container"]',
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
    case 'GET_CONTACTS':
      return await getWhatsAppContacts();
    case 'GET_LABELS':
      return await getWhatsAppLabels();
    default:
      return { error: 'Unknown message type' };
  }
}

function isWhatsAppConnected() {
  return document.querySelector(SELECTORS.SEARCH_BOX) !== null;
}

async function sendMessage(payload) {
  try {
    console.log('Sending message to:', payload.phone);

    const url = `https://web.whatsapp.com/send?phone=${sanitizePhone(payload.phone)}`;
    if (window.location.href !== url) {
      window.location.href = url;
      await waitForChatToLoad();
    }

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
      const messageSent = await waitForMessageSent(payload.queueItemId);
      
      await chrome.runtime.sendMessage({
        type: 'MESSAGE_SENT',
        payload: { queueItemId: payload.queueItemId },
        timestamp: Date.now(),
        id: crypto.randomUUID(),
      });
      return { success: true };
    } else {
      throw new Error('Failed to click send button');
    }
  } catch (error) {
    console.error('Error sending message:', error);
    await chrome.runtime.sendMessage({
      type: 'MESSAGE_FAILED',
      payload: { queueItemId: payload.queueItemId, error: error.message },
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });
    return { success: false, error: error.message };
  }
}

async function sendMessageWithAttachment(payload) {
  try {
    console.log('Sending message with attachment to:', payload.phone);

    const url = `https://web.whatsapp.com/send?phone=${sanitizePhone(payload.phone)}`;
    if (window.location.href !== url) {
      window.location.href = url;
      await waitForChatToLoad();
    }

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

    await chrome.runtime.sendMessage({
      type: 'MESSAGE_SENT',
      payload: { queueItemId: payload.queueItemId },
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending message with attachment:', error);
    await chrome.runtime.sendMessage({
      type: 'MESSAGE_FAILED',
      payload: { queueItemId: payload.queueItemId, error: error.message },
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });
    return { success: false, error: error.message };
  }
}

async function sendImageAsMedia(attachment) {
  try {
    const attachButton = await waitForElement(SELECTORS.ATTACHMENT_BUTTON, 5000);
    if (!attachButton) throw new Error('Attachment button not found');
    
    attachButton.click();
    await sleep(500);

    const imageInput = document.querySelector(SELECTORS.IMAGE_INPUT);
    if (!imageInput) throw new Error('Image input not found');

    const blob = base64ToBlob(attachment.data);
    const file = new File([blob], attachment.filename || 'image.jpg', { type: blob.type });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    imageInput.files = dataTransfer.files;

    const changeEvent = new Event('change', { bubbles: true });
    imageInput.dispatchEvent(changeEvent);

    await sleep(2000);

    const sendBtn = await waitForElement(SELECTORS.SEND_ATTACHMENT_BUTTON, 10000);
    if (sendBtn) {
      sendBtn.click();
      await sleep(1500);
    }
  } catch (error) {
    console.error('Error sending image as media:', error);
    throw error;
  }
}

async function sendDocument(attachment) {
  try {
    const attachButton = await waitForElement(SELECTORS.ATTACHMENT_BUTTON, 5000);
    if (!attachButton) throw new Error('Attachment button not found');
    
    attachButton.click();
    await sleep(500);

    const docInput = document.querySelector(SELECTORS.DOCUMENT_INPUT);
    if (!docInput) throw new Error('Document input not found');

    const blob = base64ToBlob(attachment.data);
    const file = new File([blob], attachment.filename || 'document.pdf', { type: blob.type });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    docInput.files = dataTransfer.files;

    const changeEvent = new Event('change', { bubbles: true });
    docInput.dispatchEvent(changeEvent);

    await sleep(2000);

    const sendBtn = await waitForElement(SELECTORS.SEND_ATTACHMENT_BUTTON, 10000);
    if (sendBtn) {
      sendBtn.click();
      await sleep(1500);
    }
  } catch (error) {
    console.error('Error sending document:', error);
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
  const sendButtonSelectors = [
    'button[aria-label="Send"]',
    'span[data-icon="send"]',
    'button[data-tab="11"]',
    'div[role="button"][aria-label="Send"]',
    '[data-testid="send"]',
    'button.send-button',
  ];

  for (const selector of sendButtonSelectors) {
    const button = document.querySelector(selector);
    if (button) {
      const clickTarget = button.closest('button') || button;
      clickTarget.click();
      await sleep(500);
      return true;
    }
  }

  const allButtons = document.querySelectorAll('button, span[data-icon], div[role="button"]');
  for (const btn of allButtons) {
    const ariaLabel = btn.getAttribute('aria-label') || '';
    const dataIcon = btn.getAttribute('data-icon') || '';
    if (ariaLabel.toLowerCase().includes('send') || dataIcon === 'send') {
      btn.click();
      await sleep(500);
      return true;
    }
  }

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

function base64ToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mimeType = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const base64 = atob(parts[1]);
  let length = base64.length;
  const bytes = new Uint8Array(length);
  while (length--) {
    bytes[length] = base64.charCodeAt(length);
  }
  return new Blob([bytes], { type: mimeType });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const messageObserver = new MutationObserver(() => {
  checkForNewMessages();
});

messageObserver.observe(document.body, { childList: true, subtree: true });

let lastMessageCount = 0;

function checkForNewMessages() {
  const messages = document.querySelectorAll('div[data-pre-plain-text]');
  if (messages.length > lastMessageCount) {
    const newMessages = Array.from(messages).slice(lastMessageCount);
    newMessages.forEach((msgElement) => {
      const textSpan = msgElement.querySelector('span.selectable-text');
      if (textSpan && textSpan.textContent) {
        const messageText = textSpan.textContent;
        const prePlainText = msgElement.getAttribute('data-pre-plain-text') || '';
        const phoneMatch = prePlainText.match(/\d+/);
        const from = phoneMatch ? phoneMatch[0] : 'unknown';

        chrome.runtime.sendMessage({
          type: 'INCOMING_MESSAGE',
          payload: {
            from: from,
            message: messageText,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
          id: crypto.randomUUID(),
        }).catch(() => {});
      }
    });
    lastMessageCount = messages.length;
  }
}

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
