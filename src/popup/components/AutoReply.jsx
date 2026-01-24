import React, { useState, useEffect } from 'react';
import { storage } from '../../storage.js';

function AutoReply() {
  const [rules, setRules] = useState([]);
  const [settings, setSettings] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [newRule, setNewRule] = useState({
    name: '',
    keywords: [],
    responses: [],
    matchType: 'partial',
    enabled: true,
    priority: 1,
    businessHours: {
      enabled: false,
      start: '09:00',
      end: '18:00',
    },
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [responseInput, setResponseInput] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const ruleList = await storage.getAutoReplyRules();
    const settingsData = await storage.getSettings();
    setRules(ruleList);
    setSettings(settingsData);
  };

  const handleToggleAutoReply = async () => {
    const newSettings = {
      ...settings,
      autoReply: { ...settings.autoReply, enabled: !settings.autoReply.enabled },
    };
    await storage.setSettings(newSettings);
    setSettings(newSettings);
  };

  const handleAddKeyword = () => {
    if (keywordInput.trim()) {
      setNewRule({
        ...newRule,
        keywords: [...newRule.keywords, keywordInput.trim()],
      });
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (index) => {
    setNewRule({
      ...newRule,
      keywords: newRule.keywords.filter((_, i) => i !== index),
    });
  };

  const handleAddResponse = () => {
    if (responseInput.trim()) {
      setNewRule({
        ...newRule,
        responses: [...newRule.responses, responseInput.trim()],
      });
      setResponseInput('');
    }
  };

  const handleRemoveResponse = (index) => {
    setNewRule({
      ...newRule,
      responses: newRule.responses.filter((_, i) => i !== index),
    });
  };

  const handleCreateRule = async () => {
    if (newRule.keywords.length === 0 || newRule.responses.length === 0) {
      alert('Please add at least one keyword and one response');
      return;
    }

    if (editingRule) {
      await storage.updateAutoReplyRule(editingRule.id, newRule);
    } else {
      await storage.addAutoReplyRule(newRule);
    }

    resetForm();
    loadData();
  };

  const handleEditRule = (rule) => {
    setEditingRule(rule);
    setNewRule({
      name: rule.name,
      keywords: rule.keywords || [],
      responses: rule.responses || [],
      matchType: rule.matchType || 'partial',
      enabled: rule.enabled,
      priority: rule.priority || 1,
      businessHours: rule.businessHours || {
        enabled: false,
        start: '09:00',
        end: '18:00',
      },
    });
    setShowCreateForm(true);
  };

  const handleDeleteRule = async (id) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    await storage.deleteAutoReplyRule(id);
    loadData();
  };

  const handleToggleRule = async (rule) => {
    await storage.updateAutoReplyRule(rule.id, { enabled: !rule.enabled });
    loadData();
  };

  const resetForm = () => {
    setNewRule({
      name: '',
      keywords: [],
      responses: [],
      matchType: 'partial',
      enabled: true,
      priority: 1,
      businessHours: {
        enabled: false,
        start: '09:00',
        end: '18:00',
      },
    });
    setKeywordInput('');
    setResponseInput('');
    setEditingRule(null);
    setShowCreateForm(false);
  };

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2>Auto-Reply Bot</h2>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings?.autoReply?.enabled || false}
              onChange={handleToggleAutoReply}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        {!settings?.autoReply?.enabled && (
          <div className="alert alert-info">
            Auto-reply is currently disabled. Enable it to start responding to incoming messages automatically.
          </div>
        )}

        <button
          className="btn btn-primary btn-block"
          onClick={() => setShowCreateForm(!showCreateForm)}
          style={{ marginBottom: '16px' }}
        >
          + Create New Rule
        </button>

        {showCreateForm && (
          <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <h3>{editingRule ? 'Edit Rule' : 'Create New Rule'}</h3>

            <div className="form-group">
              <label>Rule Name</label>
              <input
                type="text"
                value={newRule.name}
                onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                placeholder="e.g., Price Inquiry Response"
              />
            </div>

            <div className="form-group">
              <label>Match Type</label>
              <select
                value={newRule.matchType}
                onChange={(e) => setNewRule({ ...newRule, matchType: e.target.value })}
              >
                <option value="partial">Partial Match (contains keyword)</option>
                <option value="exact">Exact Match (exact message)</option>
                <option value="regex">Regex Pattern</option>
              </select>
            </div>

            <div className="form-group">
              <label>Keywords (triggers)</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="Enter a keyword"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-secondary btn-sm" onClick={handleAddKeyword}>
                  Add
                </button>
              </div>
              <div className="rule-keywords">
                {newRule.keywords.map((keyword, index) => (
                  <span key={index} className="keyword-tag">
                    {keyword}
                    <button
                      onClick={() => handleRemoveKeyword(index)}
                      style={{ marginLeft: '4px', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <small style={{ color: '#6b7280' }}>
                Example keywords: "price", "cost", "how much", "pricing"
              </small>
            </div>

            <div className="form-group">
              <label>Responses (one will be randomly selected)</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <textarea
                  value={responseInput}
                  onChange={(e) => setResponseInput(e.target.value)}
                  placeholder="Enter a response message"
                  rows={2}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-secondary btn-sm" onClick={handleAddResponse}>
                  Add
                </button>
              </div>
              {newRule.responses.map((response, index) => (
                <div
                  key={index}
                  style={{
                    background: '#e5e7eb',
                    padding: '8px',
                    borderRadius: '4px',
                    marginBottom: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontSize: '12px', flex: 1 }}>{response}</span>
                  <button
                    onClick={() => handleRemoveResponse(index)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>

            <div className="form-group">
              <label>Priority (higher = checked first)</label>
              <input
                type="number"
                value={newRule.priority}
                onChange={(e) => setNewRule({ ...newRule, priority: parseInt(e.target.value) || 1 })}
                min="1"
                max="100"
              />
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={newRule.businessHours.enabled}
                  onChange={(e) =>
                    setNewRule({
                      ...newRule,
                      businessHours: { ...newRule.businessHours, enabled: e.target.checked },
                    })
                  }
                />
                Only reply during business hours
              </label>
              {newRule.businessHours.enabled && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <input
                    type="time"
                    value={newRule.businessHours.start}
                    onChange={(e) =>
                      setNewRule({
                        ...newRule,
                        businessHours: { ...newRule.businessHours, start: e.target.value },
                      })
                    }
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={newRule.businessHours.end}
                    onChange={(e) =>
                      setNewRule({
                        ...newRule,
                        businessHours: { ...newRule.businessHours, end: e.target.value },
                      })
                    }
                  />
                </div>
              )}
            </div>

            <div className="btn-group">
              <button className="btn btn-primary" onClick={handleCreateRule}>
                {editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
              <button className="btn btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <h3>Active Rules</h3>
        {rules.length > 0 ? (
          rules.map((rule) => (
            <div key={rule.id} className="rule-item">
              <div className="rule-header">
                <div>
                  <strong>{rule.name || 'Unnamed Rule'}</strong>
                  <span
                    className={`badge ${rule.enabled ? 'badge-success' : 'badge-danger'}`}
                    style={{ marginLeft: '8px' }}
                  >
                    {rule.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <label className="toggle" style={{ transform: 'scale(0.8)' }}>
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={() => handleToggleRule(rule)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                Match type: {rule.matchType} | Priority: {rule.priority}
              </div>

              <div style={{ marginBottom: '8px' }}>
                <strong style={{ fontSize: '11px' }}>Keywords:</strong>
                <div className="rule-keywords">
                  {rule.keywords?.map((keyword, index) => (
                    <span key={index} className="keyword-tag">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '8px' }}>
                <strong style={{ fontSize: '11px' }}>Responses:</strong>
                {rule.responses?.map((response, index) => (
                  <div
                    key={index}
                    style={{
                      background: '#e5e7eb',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      marginTop: '4px',
                      fontSize: '11px',
                    }}
                  >
                    {response.substring(0, 100)}
                    {response.length > 100 ? '...' : ''}
                  </div>
                ))}
              </div>

              <div className="btn-group">
                <button className="btn btn-secondary btn-sm" onClick={() => handleEditRule(rule)}>
                  Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteRule(rule.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <p>No auto-reply rules yet. Create your first rule!</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AutoReply;
