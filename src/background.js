import { storage } from './storage.js';

class MessageBus {
  constructor() {
    this.listeners = new Map();
    this.responseHandlers = new Map();
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    }
  }

  handleMessage(message, sender, sendResponse) {
    const handlers = this.listeners.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error('Error in message listener:', error);
        }
      });
    }

    if (this.responseHandlers.has(message.id)) {
      const handler = this.responseHandlers.get(message.id);
      if (handler) {
        handler(message.payload);
        this.responseHandlers.delete(message.id);
      }
    }
    return true;
  }

  on(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(handler);
    return () => {
      const handlers = this.listeners.get(type);
      if (handlers) handlers.delete(handler);
    };
  }

  off(type, handler) {
    const handlers = this.listeners.get(type);
    if (handlers) handlers.delete(handler);
  }

  async send(type, payload) {
    const message = {
      type,
      payload,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    };
    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        return await chrome.runtime.sendMessage(message);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async sendToTab(tabId, type, payload) {
    const message = {
      type,
      payload,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    };
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      console.error('Error sending message to tab:', error);
      throw error;
    }
  }

  broadcast(type, payload) {
    const message = {
      type,
      payload,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    };
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        }
      });
    });
    chrome.runtime.sendMessage(message).catch(() => {});
  }

  async sendAndWaitForResponse(type, payload, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const message = {
        type,
        payload,
        timestamp: Date.now(),
        id: crypto.randomUUID(),
      };

      const timeoutId = setTimeout(() => {
        this.responseHandlers.delete(message.id);
        reject(new Error('Message response timeout'));
      }, timeout);

      this.responseHandlers.set(message.id, (response) => {
        clearTimeout(timeoutId);
        resolve(response);
      });

      chrome.runtime.sendMessage(message).catch((error) => {
        clearTimeout(timeoutId);
        this.responseHandlers.delete(message.id);
        reject(error);
      });
    });
  }

  async getWhatsAppTab() {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      return tabs.length > 0 ? tabs[0] : null;
    } catch (error) {
      console.error('Error getting WhatsApp tab:', error);
      return null;
    }
  }

  async ensureWhatsAppTab() {
    let tab = await this.getWhatsAppTab();
    if (!tab) {
      tab = await chrome.tabs.create({ url: 'https://web.whatsapp.com', active: false });
    }
    return tab;
  }
}

const messageBus = new MessageBus();

class CampaignManager {
  constructor() {
    this.isProcessing = false;
    this.currentCampaignId = null;
    this.isPaused = false;
    this.messagesSentToday = 0;
    this.lastResetDate = new Date().toDateString();
    this.messagesSentThisHour = 0;
    this.hourStartTime = Date.now();
  }

  async startCampaign(campaignId) {
    if (this.isProcessing && this.currentCampaignId !== campaignId) {
      throw new Error('Another campaign is already running');
    }

    const campaign = await this.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status === 'completed') throw new Error('Campaign already completed');

    const contacts = await storage.getContacts();
    const queueItems = campaign.contacts
      .map((contactId, index) => {
        const contact = contacts.find((c) => c.id === contactId);
        if (!contact) return null;
        return {
          campaignId,
          contactId,
          phone: contact.phone,
          message: this.personalizeMessage(campaign.message, contact),
          status: 'pending',
          retries: 0,
          attachments: campaign.attachments,
        };
      })
      .filter(Boolean);

    await storage.addToQueue(queueItems);
    await storage.updateCampaign(campaignId, {
      status: 'running',
      startedAt: Date.now(),
      progress: { total: queueItems.length, sent: 0, failed: 0, current: 0 },
    });

    this.currentCampaignId = campaignId;
    this.isProcessing = true;
    this.isPaused = false;

    await messageBus.ensureWhatsAppTab();
    this.processQueue();
  }

  async pauseCampaign(campaignId) {
    if (this.currentCampaignId === campaignId) {
      this.isPaused = true;
      await storage.updateCampaign(campaignId, { status: 'paused' });
    }
  }

  async resumeCampaign(campaignId) {
    if (this.currentCampaignId === campaignId) {
      this.isPaused = false;
      await storage.updateCampaign(campaignId, { status: 'running' });
      this.processQueue();
    }
  }

  async cancelCampaign(campaignId) {
    if (this.currentCampaignId === campaignId) {
      this.isProcessing = false;
      this.currentCampaignId = null;
      await storage.updateCampaign(campaignId, { status: 'failed', completedAt: Date.now() });

      const queue = await storage.getQueue();
      const updatedQueue = queue.map((item) => {
        if (item.campaignId === campaignId && item.status === 'pending') {
          return { ...item, status: 'failed', error: 'Campaign cancelled' };
        }
        return item;
      });
      await storage.setQueue(updatedQueue);
    }
  }

  async processQueue() {
    if (!this.isProcessing || this.isPaused || !this.currentCampaignId) return;

    this.resetDailyCountIfNeeded();
    this.resetHourlyCountIfNeeded();

    const settings = await storage.getSettings();
    if (!this.canSendMore(settings)) {
      console.log('Rate limit reached, waiting...');
      setTimeout(() => this.processQueue(), 60000);
      return;
    }

    const queue = await storage.getQueue();
    const pendingItems = queue.filter(
      (item) => item.campaignId === this.currentCampaignId && item.status === 'pending'
    );

    if (pendingItems.length === 0) {
      await this.completeCampaign();
      return;
    }

    const item = pendingItems[0];
    await this.processQueueItem(item, settings);
  }

  async processQueueItem(item, settings) {
    try {
      await storage.updateQueueItem(item.id, { status: 'processing' });

      const tab = await messageBus.getWhatsAppTab();
      if (!tab || !tab.id) throw new Error('WhatsApp tab not found');

      const sanitizedPhone = item.phone.replace(/[^\d]/g, '');
      const targetUrl = `https://web.whatsapp.com/send?phone=${sanitizedPhone}`;

      console.log('Navigating to:', targetUrl);
      await chrome.tabs.update(tab.id, { url: targetUrl });

      await this.waitForTabLoad(tab.id);
      await this.sleep(3000);

      let chatReady = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!chatReady && attempts < maxAttempts) {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            type: 'CHECK_CHAT_READY',
            payload: {},
            timestamp: Date.now(),
            id: crypto.randomUUID(),
          });
          chatReady = response && response.ready;
          if (!chatReady) {
            await this.sleep(2000);
            attempts++;
          }
        } catch (error) {
          console.log('Waiting for content script...', attempts);
          await this.sleep(2000);
          attempts++;
        }
      }

      if (!chatReady) {
        throw new Error('Chat failed to load after navigation');
      }

      const payload = {
        phone: item.phone,
        message: item.message,
        attachments: item.attachments,
        queueItemId: item.id,
      };

      console.log('Sending TYPE_AND_SEND message');
      const result = await chrome.tabs.sendMessage(tab.id, {
        type: 'TYPE_AND_SEND',
        payload: payload,
        timestamp: Date.now(),
        id: crypto.randomUUID(),
      });

      if (result && result.success) {
        await this.handleMessageSent(item.id);
      } else {
        throw new Error(result?.error || 'Failed to send message');
      }

      const delay = this.getRandomDelay(settings.sending.minDelay, settings.sending.maxDelay);
      await this.sleep(delay);
    } catch (error) {
      console.error('Error processing queue item:', error);
      await this.handleFailedItem(item, error.message);
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  async waitForTabLoad(tabId) {
    return new Promise((resolve) => {
      const checkTab = () => {
        chrome.tabs.get(tabId, (tab) => {
          if (tab && tab.status === 'complete') {
            resolve();
          } else {
            setTimeout(checkTab, 500);
          }
        });
      };
      checkTab();
    });
  }

  async handleMessageSent(queueItemId) {
    await storage.updateQueueItem(queueItemId, { status: 'sent', processedAt: Date.now() });
    this.messagesSentToday++;
    this.messagesSentThisHour++;
    await storage.incrementStatistic('totalSent');
    await this.updateCampaignProgress();
    setTimeout(() => this.processQueue(), 100);
  }

  async handleMessageFailed(queueItemId, error) {
    const queue = await storage.getQueue();
    const item = queue.find((i) => i.id === queueItemId);
    if (item) {
      await this.handleFailedItem(item, error);
      await this.updateCampaignProgress();
      setTimeout(() => this.processQueue(), 100);
    }
  }

  async handleFailedItem(item, error) {
    if (item.retries < 3) {
      await storage.updateQueueItem(item.id, {
        status: 'pending',
        retries: item.retries + 1,
        error: error,
      });
    } else {
      await storage.updateQueueItem(item.id, {
        status: 'failed',
        processedAt: Date.now(),
        error: error || 'Max retries reached',
      });
      await storage.incrementStatistic('totalFailed');
    }
  }

  async updateCampaignProgress() {
    if (!this.currentCampaignId) return;

    const queue = await storage.getQueue();
    const campaignItems = queue.filter((item) => item.campaignId === this.currentCampaignId);
    const sent = campaignItems.filter((item) => item.status === 'sent').length;
    const failed = campaignItems.filter((item) => item.status === 'failed').length;
    const total = campaignItems.length;
    const current = sent + failed;

    await storage.updateCampaign(this.currentCampaignId, {
      progress: { total, sent, failed, current },
    });

    messageBus.broadcast('CAMPAIGN_PROGRESS', {
      campaignId: this.currentCampaignId,
      progress: { total, sent, failed, current },
    });
  }

  async completeCampaign() {
    if (!this.currentCampaignId) return;

    await storage.updateCampaign(this.currentCampaignId, {
      status: 'completed',
      completedAt: Date.now(),
    });

    const campaign = await this.getCampaign(this.currentCampaignId);
    if (campaign) {
      const stats = await storage.getStatistics();
      await storage.updateStatistics({ totalCampaigns: stats.totalCampaigns + 1 });

      messageBus.broadcast('CAMPAIGN_COMPLETE', {
        campaignId: this.currentCampaignId,
        progress: campaign.progress,
      });

      const settings = await storage.getSettings();
      if (settings.notifications.enabled && settings.notifications.desktop) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'Campaign Completed',
          message: `${campaign.name} completed. Sent: ${campaign.progress.sent}, Failed: ${campaign.progress.failed}`,
        });
      }
    }

    this.isProcessing = false;
    this.currentCampaignId = null;
  }

  personalizeMessage(message, contact) {
    let result = message;
    result = result.replace(/\{name\}/gi, contact.name || contact.phone);
    result = result.replace(/\{phone\}/gi, contact.phone);
    result = result.replace(/\{email\}/gi, contact.email || '');

    if (contact.customFields) {
      Object.entries(contact.customFields).forEach(([key, value]) => {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), value);
      });
    }
    return result;
  }

  getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  resetDailyCountIfNeeded() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.messagesSentToday = 0;
      this.lastResetDate = today;
    }
  }

  resetHourlyCountIfNeeded() {
    const now = Date.now();
    if (now - this.hourStartTime >= 3600000) {
      this.messagesSentThisHour = 0;
      this.hourStartTime = now;
    }
  }

  canSendMore(settings) {
    if (this.messagesSentToday >= settings.sending.dailyLimit) return false;
    if (settings.safety.enabled && this.messagesSentThisHour >= settings.safety.maxPerHour) return false;
    return true;
  }

  async getCampaign(campaignId) {
    const campaigns = await storage.getCampaigns();
    return campaigns.find((c) => c.id === campaignId) || null;
  }

  getStatus() {
    return {
      isProcessing: this.isProcessing,
      currentCampaignId: this.currentCampaignId,
      isPaused: this.isPaused,
      messagesSentToday: this.messagesSentToday,
      messagesSentThisHour: this.messagesSentThisHour,
    };
  }
}

const campaignManager = new CampaignManager();

console.log('Background service worker started');

let keepAliveInterval;

function setupKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      if (chrome.runtime.lastError) {
        console.log('Keep alive check');
      }
    });
  }, 20000);
}

setupKeepAlive();

chrome.runtime.onStartup.addListener(() => {
  console.log('Extension startup');
  setupKeepAlive();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed:', details.reason);
  setupKeepAlive();

  if (details.reason === 'install') {
    const settings = await storage.getSettings();
    await storage.setSettings(settings);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleBackgroundMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => {
      console.error('Error handling message:', error);
      sendResponse({ error: error.message });
    });
  return true;
});

async function handleBackgroundMessage(message, sender) {
  console.log('Background received message:', message.type);

  switch (message.type) {
    case 'START_CAMPAIGN':
      await campaignManager.startCampaign(message.payload.campaignId);
      return { success: true };

    case 'PAUSE_CAMPAIGN':
      await campaignManager.pauseCampaign(message.payload.campaignId);
      return { success: true };

    case 'RESUME_CAMPAIGN':
      await campaignManager.resumeCampaign(message.payload.campaignId);
      return { success: true };

    case 'CANCEL_CAMPAIGN':
      await campaignManager.cancelCampaign(message.payload.campaignId);
      return { success: true };

    case 'GET_CAMPAIGN_STATUS':
      return campaignManager.getStatus();

    case 'MESSAGE_SENT':
      await campaignManager.handleMessageSent(message.payload.queueItemId);
      return { success: true };

    case 'MESSAGE_FAILED':
      await campaignManager.handleMessageFailed(message.payload.queueItemId, message.payload.error);
      return { success: true };

    case 'INCOMING_MESSAGE':
      await handleIncomingMessage(message.payload);
      return { success: true };

    case 'CHECK_WHATSAPP_CONNECTION':
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      return { connected: tabs.length > 0 };

    default:
      return { error: 'Unknown message type' };
  }
}

async function handleIncomingMessage(payload) {
  console.log('[WhatsApp CRM Background] Received incoming message:', {
    from: payload.from,
    message: payload.message?.substring(0, 50),
    timestamp: payload.timestamp,
  });

  try {
    const settings = await storage.getSettings();
    console.log('[WhatsApp CRM Background] Auto-reply enabled:', settings.autoReply?.enabled);
    
    if (!settings.autoReply?.enabled) {
      console.log('[WhatsApp CRM Background] Auto-reply is disabled, skipping');
      return;
    }

    const rules = await storage.getAutoReplyRules();
    console.log('[WhatsApp CRM Background] Found', rules.length, 'auto-reply rules');
    
    const activeRules = rules.filter((r) => r.enabled).sort((a, b) => (b.priority || 0) - (a.priority || 0));
    console.log('[WhatsApp CRM Background] Active rules:', activeRules.length);

    for (const rule of activeRules) {
      console.log('[WhatsApp CRM Background] Checking rule:', rule.name, 'keywords:', rule.keywords);
      if (await matchesRule(rule, payload)) {
        console.log('[WhatsApp CRM Background] Rule matched:', rule.name);
        await triggerAutoReply(rule, payload.from);
        break;
      }
    }
  } catch (error) {
    console.error('[WhatsApp CRM Background] Error handling incoming message:', error);
  }
}

async function matchesRule(rule, payload) {
  if (rule.blacklist && rule.blacklist.includes(payload.from)) {
    console.log('[WhatsApp CRM Background] Sender in blacklist, skipping rule:', rule.name);
    return false;
  }
  if (rule.whitelist && rule.whitelist.length > 0 && !rule.whitelist.includes(payload.from)) {
    console.log('[WhatsApp CRM Background] Sender not in whitelist, skipping rule:', rule.name);
    return false;
  }

  if (rule.businessHours?.enabled) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    if (currentTime < rule.businessHours.start || currentTime > rule.businessHours.end) {
      console.log('[WhatsApp CRM Background] Outside business hours, skipping rule:', rule.name);
      return false;
    }
  }

  const messageText = payload.message.toLowerCase();
  const matchType = rule.matchType || 'partial';
  
  for (const keyword of rule.keywords) {
    let matches = false;
    const keywordLower = keyword.toLowerCase();
    
    switch (matchType) {
      case 'exact':
        matches = messageText === keywordLower;
        console.log('[WhatsApp CRM Background] Exact match check:', messageText, '===', keywordLower, ':', matches);
        break;
      case 'partial':
        matches = messageText.includes(keywordLower);
        console.log('[WhatsApp CRM Background] Partial match check:', messageText, 'includes', keywordLower, ':', matches);
        break;
      case 'regex':
        try {
          matches = new RegExp(keyword, 'i').test(messageText);
          console.log('[WhatsApp CRM Background] Regex match check:', keyword, 'on', messageText, ':', matches);
        } catch (e) {
          console.error('[WhatsApp CRM Background] Invalid regex:', keyword, e);
        }
        break;
      default:
        matches = messageText.includes(keywordLower);
        console.log('[WhatsApp CRM Background] Default partial match check:', messageText, 'includes', keywordLower, ':', matches);
    }
    if (matches) {
      console.log('[WhatsApp CRM Background] Keyword matched:', keyword);
      return true;
    }
  }
  console.log('[WhatsApp CRM Background] No keywords matched for rule:', rule.name);
  return false;
}

async function triggerAutoReply(rule, phoneNumber) {
  console.log('[WhatsApp CRM Background] Triggering auto-reply for rule:', rule.name, 'to:', phoneNumber);
  
  try {
    const response = rule.responses[Math.floor(Math.random() * rule.responses.length)];
    console.log('[WhatsApp CRM Background] Selected response:', response.substring(0, 50));
    
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });

    if (tabs.length === 0 || !tabs[0].id) {
      console.error('[WhatsApp CRM Background] WhatsApp tab not found');
      return;
    }

    const tab = tabs[0];
    const sanitizedPhone = phoneNumber.replace(/[^\d+]/g, '').replace(/^\+/, '');
    
    if (!sanitizedPhone || sanitizedPhone === 'unknown' || sanitizedPhone.length < 10 || sanitizedPhone.length > 15 || !/^\d+$/.test(sanitizedPhone)) {
      console.error('[WhatsApp CRM Background] Invalid phone number for auto-reply:', phoneNumber, '(cleaned:', sanitizedPhone, ')');
      console.error('[WhatsApp CRM Background] Phone must be 10-15 digits. Got:', sanitizedPhone.length, 'digits');
      return;
    }
    
    const targetUrl = `https://web.whatsapp.com/send?phone=${sanitizedPhone}`;
    console.log('[WhatsApp CRM Background] Navigating to:', targetUrl);
    
    await chrome.tabs.update(tab.id, { url: targetUrl });
    
    await new Promise((resolve) => {
      const checkTab = () => {
        chrome.tabs.get(tab.id, (t) => {
          if (t && t.status === 'complete') {
            resolve();
          } else {
            setTimeout(checkTab, 500);
          }
        });
      };
      checkTab();
    });
    
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    let chatReady = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!chatReady && attempts < maxAttempts) {
      try {
        const checkResponse = await chrome.tabs.sendMessage(tab.id, {
          type: 'CHECK_CHAT_READY',
          payload: {},
          timestamp: Date.now(),
          id: crypto.randomUUID(),
        });
        chatReady = checkResponse && checkResponse.ready;
        if (!chatReady) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          attempts++;
        }
      } catch (error) {
        console.log('[WhatsApp CRM Background] Waiting for content script...', attempts);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts++;
      }
    }

    if (!chatReady) {
      console.error('[WhatsApp CRM Background] Chat failed to load for auto-reply');
      return;
    }

    console.log('[WhatsApp CRM Background] Chat ready, sending TYPE_AND_SEND');
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: 'TYPE_AND_SEND',
      payload: {
        phone: sanitizedPhone,
        message: response,
        attachments: [],
        queueItemId: `auto-reply-${Date.now()}`,
      },
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });

    if (result && result.success) {
      console.log('[WhatsApp CRM Background] Auto-reply sent successfully:', rule.name);
    } else {
      console.error('[WhatsApp CRM Background] Auto-reply failed:', result?.error);
    }
  } catch (error) {
    console.error('[WhatsApp CRM Background] Error triggering auto-reply:', error);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  console.log('Alarm triggered:', alarm.name);
  setupKeepAlive();
});

chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
    if (tabs.length === 0 && campaignManager.getStatus().isProcessing) {
      console.warn('WhatsApp tab closed while campaign is running');
    }
  });
});

console.log('Background service worker initialized');
