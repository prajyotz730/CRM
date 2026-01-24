import React, { useState, useEffect } from 'react';
import { storage } from '../../storage.js';

function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    message: '',
    contacts: [],
    attachments: [],
  });
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [attachments, setAttachments] = useState([]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const campaignList = await storage.getCampaigns();
    const contactList = await storage.getContacts();
    setCampaigns(campaignList);
    setContacts(contactList);
  };

  const handleCreateCampaign = async () => {
    if (!newCampaign.name || !newCampaign.message || selectedContacts.length === 0) {
      alert('Please fill in all required fields and select at least one contact');
      return;
    }

    await storage.addCampaign({
      name: newCampaign.name,
      message: newCampaign.message,
      contacts: selectedContacts,
      attachments: attachments,
      status: 'draft',
      progress: { total: selectedContacts.length, sent: 0, failed: 0, current: 0 },
    });

    setNewCampaign({ name: '', message: '', contacts: [], attachments: [] });
    setSelectedContacts([]);
    setAttachments([]);
    setShowCreateForm(false);
    loadData();
  };

  const handleStartCampaign = async (campaignId) => {
    try {
      await chrome.runtime.sendMessage({
        type: 'START_CAMPAIGN',
        payload: { campaignId },
        timestamp: Date.now(),
        id: crypto.randomUUID(),
      });
      loadData();
    } catch (error) {
      console.error('Error starting campaign:', error);
      alert('Error starting campaign: ' + error.message);
    }
  };

  const handlePauseCampaign = async (campaignId) => {
    await chrome.runtime.sendMessage({
      type: 'PAUSE_CAMPAIGN',
      payload: { campaignId },
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });
    loadData();
  };

  const handleResumeCampaign = async (campaignId) => {
    await chrome.runtime.sendMessage({
      type: 'RESUME_CAMPAIGN',
      payload: { campaignId },
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });
    loadData();
  };

  const handleCancelCampaign = async (campaignId) => {
    if (!confirm('Are you sure you want to cancel this campaign?')) return;
    await chrome.runtime.sendMessage({
      type: 'CANCEL_CAMPAIGN',
      payload: { campaignId },
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });
    loadData();
  };

  const handleSelectContact = (contactId) => {
    if (selectedContacts.includes(contactId)) {
      setSelectedContacts(selectedContacts.filter((id) => id !== contactId));
    } else {
      setSelectedContacts([...selectedContacts, contactId]);
    }
  };

  const handleSelectAllContacts = () => {
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts.map((c) => c.id));
    }
  };

  const handleFileUpload = async (event, type) => {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const attachment = {
          type: type,
          filename: file.name,
          data: e.target.result,
          mimeType: file.type,
        };
        setAttachments((prev) => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    }
    event.target.value = '';
  };

  const handleRemoveAttachment = (index) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: 'badge-info',
      running: 'badge-warning',
      paused: 'badge-warning',
      completed: 'badge-success',
      failed: 'badge-danger',
    };
    return badges[status] || 'badge-info';
  };

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2>Campaigns</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(!showCreateForm)}>
            + New Campaign
          </button>
        </div>

        {showCreateForm && (
          <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <h3>Create New Campaign</h3>
            
            <div className="form-group">
              <label>Campaign Name *</label>
              <input
                type="text"
                value={newCampaign.name}
                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                placeholder="e.g., New Year Promotion"
              />
            </div>

            <div className="form-group">
              <label>Message *</label>
              <textarea
                value={newCampaign.message}
                onChange={(e) => setNewCampaign({ ...newCampaign, message: e.target.value })}
                placeholder="Type your message here. Use {name} for personalization."
                rows={4}
              />
              <small style={{ color: '#6b7280' }}>
                Variables: {'{name}'}, {'{phone}'}, {'{email}'}
              </small>
            </div>

            <div className="form-group">
              <label>Attachments</label>
              <div className="btn-group" style={{ marginBottom: '8px' }}>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  + Image
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFileUpload(e, 'image')}
                    style={{ display: 'none' }}
                  />
                </label>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  + PDF
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={(e) => handleFileUpload(e, 'document')}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              {attachments.length > 0 && (
                <div className="attachment-preview">
                  {attachments.map((att, index) => (
                    <div key={index} className="attachment-item">
                      {att.type === 'image' ? (
                        <img src={att.data} alt={att.filename} />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '10px', padding: '4px', textAlign: 'center' }}>
                          {att.filename}
                        </div>
                      )}
                      <button className="remove-btn" onClick={() => handleRemoveAttachment(index)}>
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <small style={{ color: '#6b7280', display: 'block', marginTop: '4px' }}>
                Images will be sent as viewable photos, not documents.
              </small>
            </div>

            <div className="form-group">
              <label>Select Contacts * ({selectedContacts.length} selected)</label>
              <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #d1d5db', borderRadius: '6px' }}>
                <div
                  className="list-item"
                  style={{ background: '#f3f4f6', cursor: 'pointer' }}
                  onClick={handleSelectAllContacts}
                >
                  <input
                    type="checkbox"
                    checked={selectedContacts.length === contacts.length && contacts.length > 0}
                    onChange={handleSelectAllContacts}
                  />
                  <span style={{ marginLeft: '8px', fontSize: '12px' }}>Select All</span>
                </div>
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="list-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSelectContact(contact.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(contact.id)}
                      onChange={() => handleSelectContact(contact.id)}
                    />
                    <div style={{ marginLeft: '8px' }}>
                      <div style={{ fontSize: '13px' }}>{contact.name || 'Unknown'}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>{contact.phone}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="btn-group">
              <button className="btn btn-primary" onClick={handleCreateCampaign}>
                Create Campaign
              </button>
              <button className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <ul className="list">
          {campaigns.map((campaign) => (
            <li key={campaign.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="list-item-content">
                  <div className="list-item-title">{campaign.name}</div>
                  <div className="list-item-subtitle">
                    {campaign.progress?.sent || 0} / {campaign.progress?.total || 0} messages sent
                  </div>
                </div>
                <span className={`badge ${getStatusBadge(campaign.status)}`}>
                  {campaign.status}
                </span>
              </div>

              {campaign.progress && (
                <div className="progress-bar" style={{ marginTop: '8px' }}>
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${campaign.progress.total ? (campaign.progress.sent / campaign.progress.total) * 100 : 0}%`,
                    }}
                  ></div>
                </div>
              )}

              <div className="btn-group" style={{ marginTop: '8px' }}>
                {campaign.status === 'draft' && (
                  <button className="btn btn-primary btn-sm" onClick={() => handleStartCampaign(campaign.id)}>
                    Start
                  </button>
                )}
                {campaign.status === 'running' && (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => handlePauseCampaign(campaign.id)}>
                      Pause
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleCancelCampaign(campaign.id)}>
                      Cancel
                    </button>
                  </>
                )}
                {campaign.status === 'paused' && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => handleResumeCampaign(campaign.id)}>
                      Resume
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleCancelCampaign(campaign.id)}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
          {campaigns.length === 0 && (
            <div className="empty-state">
              <p>No campaigns yet. Create your first campaign!</p>
            </div>
          )}
        </ul>
      </div>
    </div>
  );
}

export default Campaigns;
