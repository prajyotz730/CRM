import React, { useState, useEffect } from 'react';
import { storage } from '../../storage.js';

function Dashboard({ stats, isConnected }) {
  const [campaigns, setCampaigns] = useState([]);
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const campaignList = await storage.getCampaigns();
    const contactList = await storage.getContacts();
    setCampaigns(campaignList);
    setContacts(contactList);
  };

  const activeCampaigns = campaigns.filter((c) => c.status === 'running').length;
  const completedCampaigns = campaigns.filter((c) => c.status === 'completed').length;

  return (
    <div>
      <div className="card">
        <h2>Overview</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats?.totalSent || 0}</div>
            <div className="stat-label">Messages Sent</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats?.totalFailed || 0}</div>
            <div className="stat-label">Failed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{contacts.length}</div>
            <div className="stat-label">Contacts</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats?.totalCampaigns || 0}</div>
            <div className="stat-label">Campaigns</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Connection Status</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}
            style={{ width: '12px', height: '12px' }}
          ></span>
          <span>
            {isConnected
              ? 'WhatsApp Web is connected and ready'
              : 'Please open WhatsApp Web to start sending messages'}
          </span>
        </div>
        {!isConnected && (
          <button
            className="btn btn-primary"
            style={{ marginTop: '12px' }}
            onClick={() => window.open('https://web.whatsapp.com', '_blank')}
          >
            Open WhatsApp Web
          </button>
        )}
      </div>

      <div className="card">
        <h2>Active Campaigns</h2>
        {activeCampaigns > 0 ? (
          <div>
            {campaigns
              .filter((c) => c.status === 'running')
              .map((campaign) => (
                <div key={campaign.id} className="list-item">
                  <div className="list-item-content">
                    <div className="list-item-title">{campaign.name}</div>
                    <div className="list-item-subtitle">
                      {campaign.progress?.sent || 0} / {campaign.progress?.total || 0} sent
                    </div>
                    <div className="progress-bar" style={{ marginTop: '8px' }}>
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${
                            campaign.progress?.total
                              ? (campaign.progress.sent / campaign.progress.total) * 100
                              : 0
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>
                  <span className="badge badge-info">Running</span>
                </div>
              ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No active campaigns</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Quick Actions</h2>
        <div className="btn-group" style={{ flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => window.open('https://web.whatsapp.com', '_blank')}
          >
            Open WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
