import React, { useState, useEffect } from 'react';
import { storage } from '../storage.js';
import Dashboard from './components/Dashboard';
import Contacts from './components/Contacts';
import Campaigns from './components/Campaigns';
import AutoReply from './components/AutoReply';
import Settings from './components/Settings';
import ContactManager from './components/ContactManager';

const TABS = {
  DASHBOARD: 'dashboard',
  CONTACTS: 'contacts',
  CAMPAIGNS: 'campaigns',
  AUTO_REPLY: 'autoReply',
  CONTACT_MANAGER: 'contactManager',
  SETTINGS: 'settings',
};

function App() {
  const [activeTab, setActiveTab] = useState(TABS.DASHBOARD);
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    checkConnection();
    loadStats();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkConnection = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_WHATSAPP_CONNECTION',
        payload: {},
        timestamp: Date.now(),
        id: crypto.randomUUID(),
      });
      setIsConnected(response?.connected || false);
    } catch (error) {
      setIsConnected(false);
    }
  };

  const loadStats = async () => {
    const statistics = await storage.getStatistics();
    setStats(statistics);
  };

  const renderContent = () => {
    switch (activeTab) {
      case TABS.DASHBOARD:
        return <Dashboard stats={stats} isConnected={isConnected} />;
      case TABS.CONTACTS:
        return <Contacts />;
      case TABS.CAMPAIGNS:
        return <Campaigns />;
      case TABS.AUTO_REPLY:
        return <AutoReply />;
      case TABS.CONTACT_MANAGER:
        return <ContactManager />;
      case TABS.SETTINGS:
        return <Settings />;
      default:
        return <Dashboard stats={stats} isConnected={isConnected} />;
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>SUS WhatsApp CRM</h1>
        <div className="connection-status">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>

      <nav className="nav">
        <button
          className={activeTab === TABS.DASHBOARD ? 'active' : ''}
          onClick={() => setActiveTab(TABS.DASHBOARD)}
        >
          Dashboard
        </button>
        <button
          className={activeTab === TABS.CONTACTS ? 'active' : ''}
          onClick={() => setActiveTab(TABS.CONTACTS)}
        >
          Contacts
        </button>
        <button
          className={activeTab === TABS.CAMPAIGNS ? 'active' : ''}
          onClick={() => setActiveTab(TABS.CAMPAIGNS)}
        >
          Campaigns
        </button>
        <button
          className={activeTab === TABS.AUTO_REPLY ? 'active' : ''}
          onClick={() => setActiveTab(TABS.AUTO_REPLY)}
        >
          Auto-Reply
        </button>
        <button
          className={activeTab === TABS.CONTACT_MANAGER ? 'active' : ''}
          onClick={() => setActiveTab(TABS.CONTACT_MANAGER)}
        >
          Import/Export
        </button>
        <button
          className={activeTab === TABS.SETTINGS ? 'active' : ''}
          onClick={() => setActiveTab(TABS.SETTINGS)}
        >
          Settings
        </button>
      </nav>

      <main className="content">{renderContent()}</main>
    </div>
  );
}

export default App;
