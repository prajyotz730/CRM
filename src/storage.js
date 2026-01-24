const STORAGE_KEYS = {
  CONTACTS: 'contacts',
  CAMPAIGNS: 'campaigns',
  QUEUE: 'queue',
  AUTO_REPLY_RULES: 'autoReplyRules',
  TEMPLATES: 'templates',
  SETTINGS: 'settings',
  STATISTICS: 'statistics',
  COUNTRY_CODE_SETTINGS: 'countryCodeSettings',
};

class Storage {
  async get(key) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] || null;
    } catch (error) {
      console.error('Storage get error:', error);
      return null;
    }
  }

  async set(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      console.error('Storage set error:', error);
      throw error;
    }
  }

  async getContacts() {
    return (await this.get(STORAGE_KEYS.CONTACTS)) || [];
  }

  async setContacts(contacts) {
    await this.set(STORAGE_KEYS.CONTACTS, contacts);
  }

  async addContact(contact) {
    const contacts = await this.getContacts();
    const newContact = {
      ...contact,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    contacts.push(newContact);
    await this.setContacts(contacts);
    return newContact;
  }

  async addContacts(contactsToAdd) {
    const contacts = await this.getContacts();
    const newContacts = contactsToAdd.map((contact) => ({
      ...contact,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    contacts.push(...newContacts);
    await this.setContacts(contacts);
    return newContacts;
  }

  async updateContact(id, updates) {
    const contacts = await this.getContacts();
    const index = contacts.findIndex((c) => c.id === id);
    if (index !== -1) {
      contacts[index] = { ...contacts[index], ...updates, updatedAt: Date.now() };
      await this.setContacts(contacts);
    }
  }

  async deleteContact(id) {
    const contacts = await this.getContacts();
    const filtered = contacts.filter((c) => c.id !== id);
    await this.setContacts(filtered);
  }

  async getCampaigns() {
    return (await this.get(STORAGE_KEYS.CAMPAIGNS)) || [];
  }

  async setCampaigns(campaigns) {
    await this.set(STORAGE_KEYS.CAMPAIGNS, campaigns);
  }

  async addCampaign(campaign) {
    const campaigns = await this.getCampaigns();
    const newCampaign = {
      ...campaign,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    campaigns.push(newCampaign);
    await this.setCampaigns(campaigns);
    return newCampaign;
  }

  async updateCampaign(id, updates) {
    const campaigns = await this.getCampaigns();
    const index = campaigns.findIndex((c) => c.id === id);
    if (index !== -1) {
      campaigns[index] = { ...campaigns[index], ...updates };
      await this.setCampaigns(campaigns);
    }
  }

  async getQueue() {
    return (await this.get(STORAGE_KEYS.QUEUE)) || [];
  }

  async setQueue(queue) {
    await this.set(STORAGE_KEYS.QUEUE, queue);
  }

  async addToQueue(items) {
    const queue = await this.getQueue();
    const newItems = items.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }));
    queue.push(...newItems);
    await this.setQueue(queue);
  }

  async updateQueueItem(id, updates) {
    const queue = await this.getQueue();
    const index = queue.findIndex((item) => item.id === id);
    if (index !== -1) {
      queue[index] = { ...queue[index], ...updates };
      await this.setQueue(queue);
    }
  }

  async getAutoReplyRules() {
    return (await this.get(STORAGE_KEYS.AUTO_REPLY_RULES)) || [];
  }

  async setAutoReplyRules(rules) {
    await this.set(STORAGE_KEYS.AUTO_REPLY_RULES, rules);
  }

  async addAutoReplyRule(rule) {
    const rules = await this.getAutoReplyRules();
    const newRule = {
      ...rule,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    rules.push(newRule);
    await this.setAutoReplyRules(rules);
    return newRule;
  }

  async updateAutoReplyRule(id, updates) {
    const rules = await this.getAutoReplyRules();
    const index = rules.findIndex((r) => r.id === id);
    if (index !== -1) {
      rules[index] = { ...rules[index], ...updates };
      await this.setAutoReplyRules(rules);
    }
  }

  async deleteAutoReplyRule(id) {
    const rules = await this.getAutoReplyRules();
    const filtered = rules.filter((r) => r.id !== id);
    await this.setAutoReplyRules(filtered);
  }

  async getTemplates() {
    return (await this.get(STORAGE_KEYS.TEMPLATES)) || [];
  }

  async setTemplates(templates) {
    await this.set(STORAGE_KEYS.TEMPLATES, templates);
  }

  async addTemplate(template) {
    const templates = await this.getTemplates();
    const newTemplate = {
      ...template,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    templates.push(newTemplate);
    await this.setTemplates(templates);
    return newTemplate;
  }

  async deleteTemplate(id) {
    const templates = await this.getTemplates();
    const filtered = templates.filter((t) => t.id !== id);
    await this.setTemplates(filtered);
  }

  async getSettings() {
    return (
      (await this.get(STORAGE_KEYS.SETTINGS)) || {
        sending: {
          minDelay: 5000,
          maxDelay: 10000,
          dailyLimit: 500,
        },
        safety: {
          enabled: true,
          warmupMode: false,
          maxPerHour: 60,
        },
        notifications: {
          enabled: true,
          sound: true,
          desktop: true,
        },
        autoReply: {
          enabled: false,
        },
      }
    );
  }

  async setSettings(settings) {
    await this.set(STORAGE_KEYS.SETTINGS, settings);
  }

  async getStatistics() {
    return (
      (await this.get(STORAGE_KEYS.STATISTICS)) || {
        totalSent: 0,
        totalFailed: 0,
        totalCampaigns: 0,
        lastActivity: Date.now(),
        messagesByDay: {},
      }
    );
  }

  async updateStatistics(updates) {
    const stats = await this.getStatistics();
    const updated = { ...stats, ...updates };
    await this.set(STORAGE_KEYS.STATISTICS, updated);
  }

  async incrementStatistic(key) {
    const stats = await this.getStatistics();
    stats[key]++;
    stats.lastActivity = Date.now();
    const today = new Date().toISOString().split('T')[0];
    stats.messagesByDay[today] = (stats.messagesByDay[today] || 0) + 1;
    await this.set(STORAGE_KEYS.STATISTICS, stats);
  }

  async getCountryCodeSettings() {
    return (
      (await this.get(STORAGE_KEYS.COUNTRY_CODE_SETTINGS)) || {
        defaultCode: '+1',
        autoPrefix: true,
      }
    );
  }

  async setCountryCodeSettings(settings) {
    await this.set(STORAGE_KEYS.COUNTRY_CODE_SETTINGS, settings);
  }

  async clearAllData() {
    await chrome.storage.local.clear();
  }

  async exportData() {
    const data = await chrome.storage.local.get(null);
    return JSON.stringify(data, null, 2);
  }

  async importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      await chrome.storage.local.set(data);
    } catch (error) {
      console.error('Import error:', error);
      throw new Error('Invalid import data');
    }
  }
}

export const storage = new Storage();
