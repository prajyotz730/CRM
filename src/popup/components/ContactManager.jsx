import React, { useState, useEffect } from 'react';
import { storage } from '../../storage.js';
import * as XLSX from 'xlsx';

function ContactManager() {
  const [contacts, setContacts] = useState([]);
  const [labels, setLabels] = useState([]);
  const [selectedLabel, setSelectedLabel] = useState('all');
  const [exportFormat, setExportFormat] = useState('xlsx');
  const [exportType, setExportType] = useState('all');
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [bulkLabelAction, setBulkLabelAction] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const contactList = await storage.getContacts();
    setContacts(contactList);

    const uniqueLabels = new Set();
    contactList.forEach((contact) => {
      if (contact.labels) {
        contact.labels.forEach((label) => uniqueLabels.add(label));
      }
    });
    setLabels(Array.from(uniqueLabels));
  };

  const handleExport = () => {
    let dataToExport = contacts;

    if (exportType === 'unsaved') {
      dataToExport = contacts.filter((c) => !c.name || c.name === 'Unknown');
    } else if (exportType === 'label' && selectedLabel !== 'all') {
      dataToExport = contacts.filter((c) => c.labels?.includes(selectedLabel));
    }

    const exportData = dataToExport.map((contact) => ({
      Name: contact.name || '',
      Phone: contact.phone || '',
      Email: contact.email || '',
      Labels: contact.labels?.join(', ') || '',
      'Created At': contact.createdAt ? new Date(contact.createdAt).toLocaleDateString() : '',
    }));

    if (exportFormat === 'xlsx') {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');
      XLSX.writeFile(workbook, `contacts-export-${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImportLabels = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        let updatedCount = 0;
        const currentContacts = await storage.getContacts();

        for (const row of jsonData) {
          const phone = String(row.phone || row.Phone || row.PHONE || row.mobile || row.Mobile || '').replace(/[^\d+]/g, '');
          const labelsStr = row.labels || row.Labels || row.LABELS || row.label || row.Label || '';
          const newLabels = labelsStr.split(',').map((l) => l.trim()).filter(Boolean);

          if (phone && newLabels.length > 0) {
            const contactIndex = currentContacts.findIndex((c) => c.phone.replace(/[^\d+]/g, '') === phone);
            if (contactIndex !== -1) {
              const existingLabels = currentContacts[contactIndex].labels || [];
              const mergedLabels = [...new Set([...existingLabels, ...newLabels])];
              currentContacts[contactIndex].labels = mergedLabels;
              updatedCount++;
            }
          }
        }

        await storage.setContacts(currentContacts);
        loadData();
        alert(`Updated labels for ${updatedCount} contacts`);
      } catch (error) {
        console.error('Error importing labels:', error);
        alert('Error importing file. Please ensure it is a valid Excel or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const handleAddLabel = async () => {
    if (!newLabel.trim()) return;

    const updatedContacts = contacts.map((contact) => {
      if (selectedContacts.includes(contact.id)) {
        const existingLabels = contact.labels || [];
        if (!existingLabels.includes(newLabel.trim())) {
          return { ...contact, labels: [...existingLabels, newLabel.trim()] };
        }
      }
      return contact;
    });

    await storage.setContacts(updatedContacts);
    setNewLabel('');
    setShowLabelModal(false);
    setSelectedContacts([]);
    loadData();
  };

  const handleBulkLabelAction = async () => {
    if (!bulkLabelAction || selectedContacts.length === 0) return;

    const updatedContacts = contacts.map((contact) => {
      if (selectedContacts.includes(contact.id)) {
        const existingLabels = contact.labels || [];
        if (!existingLabels.includes(bulkLabelAction)) {
          return { ...contact, labels: [...existingLabels, bulkLabelAction] };
        }
      }
      return contact;
    });

    await storage.setContacts(updatedContacts);
    setBulkLabelAction('');
    setSelectedContacts([]);
    loadData();
  };

  const handleRemoveLabel = async (contactId, labelToRemove) => {
    const contact = contacts.find((c) => c.id === contactId);
    if (contact) {
      const updatedLabels = (contact.labels || []).filter((l) => l !== labelToRemove);
      await storage.updateContact(contactId, { labels: updatedLabels });
      loadData();
    }
  };

  const handleSelectContact = (id) => {
    if (selectedContacts.includes(id)) {
      setSelectedContacts(selectedContacts.filter((cId) => cId !== id));
    } else {
      setSelectedContacts([...selectedContacts, id]);
    }
  };

  const handleSelectAll = () => {
    const filteredIds = getFilteredContacts().map((c) => c.id);
    if (selectedContacts.length === filteredIds.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(filteredIds);
    }
  };

  const getFilteredContacts = () => {
    if (selectedLabel === 'all') return contacts;
    if (selectedLabel === 'unsaved') return contacts.filter((c) => !c.name || c.name === 'Unknown');
    return contacts.filter((c) => c.labels?.includes(selectedLabel));
  };

  const filteredContacts = getFilteredContacts();

  return (
    <div>
      <div className="card">
        <h2>Export Contacts</h2>
        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
          Export your contacts to Excel or CSV format.
        </p>

        <div className="form-group">
          <label>Export Type</label>
          <select value={exportType} onChange={(e) => setExportType(e.target.value)}>
            <option value="all">All Contacts ({contacts.length})</option>
            <option value="unsaved">
              Unsaved Contacts ({contacts.filter((c) => !c.name || c.name === 'Unknown').length})
            </option>
            <option value="label">By Label</option>
          </select>
        </div>

        {exportType === 'label' && (
          <div className="form-group">
            <label>Select Label</label>
            <select value={selectedLabel} onChange={(e) => setSelectedLabel(e.target.value)}>
              <option value="all">All Labels</option>
              {labels.map((label) => (
                <option key={label} value={label}>
                  {label} ({contacts.filter((c) => c.labels?.includes(label)).length})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label>Format</label>
          <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
        </div>

        <button className="btn btn-primary btn-block" onClick={handleExport}>
          Export Contacts
        </button>
      </div>

      <div className="card">
        <h2>Import Labels</h2>
        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
          Import a file with phone numbers and labels to bulk-label your contacts. The file should have
          "phone" and "labels" columns.
        </p>

        <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer', textAlign: 'center' }}>
          Import Labels from File
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportLabels}
            style={{ display: 'none' }}
          />
        </label>

        <div style={{ marginTop: '12px', fontSize: '12px', color: '#6b7280' }}>
          <strong>Expected format:</strong>
          <table style={{ width: '100%', marginTop: '8px', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: '4px', textAlign: 'left' }}>Phone</th>
                <th style={{ padding: '4px', textAlign: 'left' }}>Labels</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '4px' }}>+1234567890</td>
                <td style={{ padding: '4px' }}>VIP, Customer</td>
              </tr>
              <tr>
                <td style={{ padding: '4px' }}>+0987654321</td>
                <td style={{ padding: '4px' }}>Lead</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Manage Labels</h2>

        <div className="form-group">
          <label>Filter by Label</label>
          <select value={selectedLabel} onChange={(e) => setSelectedLabel(e.target.value)}>
            <option value="all">All Contacts</option>
            <option value="unsaved">Unsaved Contacts</option>
            {labels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {selectedContacts.length > 0 && (
          <div style={{ marginBottom: '12px', padding: '12px', background: '#f3f4f6', borderRadius: '8px' }}>
            <div style={{ marginBottom: '8px' }}>{selectedContacts.length} contacts selected</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={bulkLabelAction}
                onChange={(e) => setBulkLabelAction(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">Select label to add...</option>
                {labels.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm" onClick={handleBulkLabelAction}>
                Apply
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowLabelModal(true)}>
                New Label
              </button>
            </div>
          </div>
        )}

        <ul className="list" style={{ maxHeight: '300px', overflow: 'auto' }}>
          {filteredContacts.length > 0 && (
            <li className="list-item" style={{ background: '#f3f4f6' }}>
              <input
                type="checkbox"
                className="contact-checkbox"
                checked={selectedContacts.length === filteredContacts.length && filteredContacts.length > 0}
                onChange={handleSelectAll}
              />
              <span style={{ fontSize: '12px', color: '#6b7280' }}>Select All</span>
            </li>
          )}
          {filteredContacts.map((contact) => (
            <li key={contact.id} className="list-item">
              <input
                type="checkbox"
                className="contact-checkbox"
                checked={selectedContacts.includes(contact.id)}
                onChange={() => handleSelectContact(contact.id)}
              />
              <div className="list-item-content">
                <div className="list-item-title">{contact.name || 'Unknown'}</div>
                <div className="list-item-subtitle">{contact.phone}</div>
                {contact.labels && contact.labels.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    {contact.labels.map((label) => (
                      <span
                        key={label}
                        className="badge badge-info"
                        style={{ marginRight: '4px', cursor: 'pointer' }}
                        onClick={() => handleRemoveLabel(contact.id, label)}
                        title="Click to remove"
                      >
                        {label} &times;
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
          {filteredContacts.length === 0 && (
            <div className="empty-state">
              <p>No contacts found</p>
            </div>
          )}
        </ul>
      </div>

      {showLabelModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '300px' }}>
            <div className="modal-header">
              <h2>Add New Label</h2>
              <button className="modal-close" onClick={() => setShowLabelModal(false)}>
                &times;
              </button>
            </div>

            <div className="form-group">
              <label>Label Name</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g., VIP, Customer, Lead"
              />
            </div>

            <div className="btn-group">
              <button className="btn btn-primary" onClick={handleAddLabel}>
                Add Label to {selectedContacts.length} Contacts
              </button>
              <button className="btn btn-secondary" onClick={() => setShowLabelModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ContactManager;
