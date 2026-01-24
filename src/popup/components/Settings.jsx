import React, { useState, useEffect } from 'react';
import { storage } from '../../storage.js';

const COUNTRY_CODES = [
  { code: '+1', country: 'USA/Canada' },
  { code: '+44', country: 'UK' },
  { code: '+91', country: 'India' },
  { code: '+61', country: 'Australia' },
  { code: '+49', country: 'Germany' },
  { code: '+33', country: 'France' },
  { code: '+81', country: 'Japan' },
  { code: '+86', country: 'China' },
  { code: '+55', country: 'Brazil' },
  { code: '+52', country: 'Mexico' },
  { code: '+971', country: 'UAE' },
  { code: '+966', country: 'Saudi Arabia' },
  { code: '+65', country: 'Singapore' },
  { code: '+60', country: 'Malaysia' },
  { code: '+62', country: 'Indonesia' },
];

function Settings() {
  const [settings, setSettings] = useState(null);
  const [countryCodeSettings, setCountryCodeSettings] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settingsData = await storage.getSettings();
    const ccSettings = await storage.getCountryCodeSettings();
    setSettings(settingsData);
    setCountryCodeSettings(ccSettings);
  };

  const handleSave = async () => {
    await storage.setSettings(settings);
    await storage.setCountryCodeSettings(countryCodeSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearData = async () => {
    if (!confirm('Are you sure you want to clear all data? This cannot be undone.')) return;
    await storage.clearAllData();
    alert('All data cleared. Please reload the extension.');
  };

  const handleExportData = async () => {
    const data = await storage.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp-crm-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        await storage.importData(e.target.result);
        alert('Data imported successfully. Please reload the extension.');
        loadSettings();
      } catch (error) {
        alert('Error importing data: ' + error.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  if (!settings) return <div>Loading...</div>;

  return (
    <div>
      {saved && <div className="alert alert-success">Settings saved successfully!</div>}

      <div className="card">
        <h2>Sending Settings</h2>
        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
          Configure message sending intervals to prevent account banning.
        </p>

        <div className="form-group">
          <label>Minimum Delay Between Messages (seconds)</label>
          <input
            type="number"
            value={settings.sending.minDelay / 1000}
            onChange={(e) =>
              setSettings({
                ...settings,
                sending: { ...settings.sending, minDelay: parseInt(e.target.value) * 1000 },
              })
            }
            min="1"
            max="60"
          />
          <small style={{ color: '#6b7280' }}>Recommended: 5-10 seconds</small>
        </div>

        <div className="form-group">
          <label>Maximum Delay Between Messages (seconds)</label>
          <input
            type="number"
            value={settings.sending.maxDelay / 1000}
            onChange={(e) =>
              setSettings({
                ...settings,
                sending: { ...settings.sending, maxDelay: parseInt(e.target.value) * 1000 },
              })
            }
            min="1"
            max="120"
          />
          <small style={{ color: '#6b7280' }}>Randomized delay between min and max</small>
        </div>

        <div className="form-group">
          <label>Daily Message Limit</label>
          <input
            type="number"
            value={settings.sending.dailyLimit}
            onChange={(e) =>
              setSettings({
                ...settings,
                sending: { ...settings.sending, dailyLimit: parseInt(e.target.value) },
              })
            }
            min="1"
            max="1000"
          />
        </div>
      </div>

      <div className="card">
        <h2>Safety Settings</h2>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={settings.safety.enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  safety: { ...settings.safety, enabled: e.target.checked },
                })
              }
            />
            Enable Safety Limits
          </label>
        </div>

        {settings.safety.enabled && (
          <div className="form-group">
            <label>Maximum Messages Per Hour</label>
            <input
              type="number"
              value={settings.safety.maxPerHour}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  safety: { ...settings.safety, maxPerHour: parseInt(e.target.value) },
                })
              }
              min="1"
              max="200"
            />
          </div>
        )}
      </div>

      <div className="card">
        <h2>Country Code Settings</h2>
        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
          Default country code to apply when importing contacts without one.
        </p>

        <div className="form-group">
          <label>Default Country Code</label>
          <select
            value={countryCodeSettings?.defaultCode || '+1'}
            onChange={(e) =>
              setCountryCodeSettings({ ...countryCodeSettings, defaultCode: e.target.value })
            }
          >
            {COUNTRY_CODES.map((cc) => (
              <option key={cc.code} value={cc.code}>
                {cc.code} {cc.country}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={countryCodeSettings?.autoPrefix || false}
              onChange={(e) =>
                setCountryCodeSettings({ ...countryCodeSettings, autoPrefix: e.target.checked })
              }
            />
            Auto-prefix country code to numbers without one
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Notifications</h2>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={settings.notifications.enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  notifications: { ...settings.notifications, enabled: e.target.checked },
                })
              }
            />
            Enable Notifications
          </label>
        </div>

        {settings.notifications.enabled && (
          <>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={settings.notifications.desktop}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, desktop: e.target.checked },
                    })
                  }
                />
                Desktop Notifications
              </label>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={settings.notifications.sound}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, sound: e.target.checked },
                    })
                  }
                />
                Sound Notifications
              </label>
            </div>
          </>
        )}
      </div>

      <button className="btn btn-primary btn-block" onClick={handleSave} style={{ marginBottom: '16px' }}>
        Save Settings
      </button>

      <div className="card">
        <h2>Data Management</h2>

        <div className="btn-group" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExportData}>
            Export All Data
          </button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            Import Data
            <input
              type="file"
              accept=".json"
              onChange={handleImportData}
              style={{ display: 'none' }}
            />
          </label>
          <button className="btn btn-danger" onClick={handleClearData}>
            Clear All Data
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;
