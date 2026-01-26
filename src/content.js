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
    case 'CHECK_CHAT_READY':
      return await checkChatReady();
    case 'TYPE_AND_SEND':
      return await typeAndSend(message.payload);
    case 'GET_CURRENT_PHONE':
      return await getCurrentPhoneWithRetry();
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
};

let processedMessageIds = new Set();
let lastProcessedTime = 0;
const MESSAGE_COOLDOWN = 2000;

function setupIncomingMessageObserver() {
  console.log('[WhatsApp CRM] Setting up incoming message observer');
  
  const observer = new MutationObserver((mutations) => {
    const now = Date.now();
    if (now - lastProcessedTime < MESSAGE_COOLDOWN) {
      return;
    }
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            checkNodeForIncomingMessage(node);
          }
        }
      }
    }
  });

  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
    characterData: false,
    attributes: false,
  });
  
  console.log('[WhatsApp CRM] Incoming message observer active');
  return observer;
}

function checkNodeForIncomingMessage(node) {
  let incomingMessages = [];
  
  for (const selector of MESSAGE_SELECTORS.INCOMING_MESSAGE) {
    if (node.matches && node.matches(selector)) {
      incomingMessages.push(node);
    }
    const found = node.querySelectorAll ? node.querySelectorAll(selector) : [];
    incomingMessages.push(...found);
  }
  
  for (const msgElement of incomingMessages) {
    processIncomingMessage(msgElement);
  }
}

function processIncomingMessage(msgElement) {
  const messageId = msgElement.getAttribute('data-id') || 
                    msgElement.getAttribute('data-testid') ||
                    `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  if (processedMessageIds.has(messageId)) {
    return;
  }
  
  if (msgElement.classList.contains('message-out') || 
      msgElement.closest('.message-out') ||
      msgElement.querySelector('[data-icon="msg-check"]') ||
      msgElement.querySelector('[data-icon="msg-dblcheck"]')) {
    console.log('[WhatsApp CRM] Skipping outgoing message');
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
    console.log('[WhatsApp CRM] No message text found in element');
    return;
  }
  
  let phoneNumber = extractPhoneFromMessageElement(msgElement);
  
  if (!phoneNumber || phoneNumber === 'unknown') {
    phoneNumber = getCurrentChatPhone();
  }
  
  console.log('[WhatsApp CRM] New incoming message detected:', {
    text: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : ''),
    from: phoneNumber,
    messageId: messageId,
  });
  
  processedMessageIds.add(messageId);
  lastProcessedTime = Date.now();
  
  if (processedMessageIds.size > 100) {
    const idsArray = Array.from(processedMessageIds);
    processedMessageIds = new Set(idsArray.slice(-50));
  }
  
  chrome.runtime.sendMessage({
    type: 'INCOMING_MESSAGE',
    payload: {
      from: phoneNumber,
      message: messageText,
      timestamp: Date.now(),
      messageId: messageId,
    },
    timestamp: Date.now(),
    id: crypto.randomUUID(),
  }).then((response) => {
    console.log('[WhatsApp CRM] Background acknowledged incoming message:', response);
  }).catch((error) => {
    console.error('[WhatsApp CRM] Error sending incoming message to background:', error);
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
