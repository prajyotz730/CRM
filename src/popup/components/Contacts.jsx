import React, { useState, useEffect } from 'react';
import { storage } from '../../storage.js';
import * as XLSX from 'xlsx';

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
  { code: '+34', country: 'Spain' },
  { code: '+39', country: 'Italy' },
  { code: '+7', country: 'Russia' },
  { code: '+82', country: 'South Korea' },
  { code: '+31', country: 'Netherlands' },
  { code: '+46', country: 'Sweden' },
  { code: '+47', country: 'Norway' },
  { code: '+45', country: 'Denmark' },
  { code: '+41', country: 'Switzerland' },
  { code: '+43', country: 'Austria' },
  { code: '+48', country: 'Poland' },
  { code: '+351', country: 'Portugal' },
  { code: '+353', country: 'Ireland' },
  { code: '+32', country: 'Belgium' },
  { code: '+27', country: 'South Africa' },
  { code: '+234', country: 'Nigeria' },
  { code: '+254', country: 'Kenya' },
  { code: '+20', country: 'Egypt' },
  { code: '+971', country: 'UAE' },
  { code: '+966', country: 'Saudi Arabia' },
  { code: '+65', country: 'Singapore' },
  { code: '+60', country: 'Malaysia' },
  { code: '+62', country: 'Indonesia' },
  { code: '+63', country: 'Philippines' },
  { code: '+66', country: 'Thailand' },
  { code: '+84', country: 'Vietnam' },
  { code: '+64', country: 'New Zealand' },
  { code: '+92', country: 'Pakistan' },
  { code: '+880', country: 'Bangladesh' },
  { code: '+94', country: 'Sri Lanka' },
];

function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone: '', email: '', labels: [] });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [defaultCountryCode, setDefaultCountryCode] = useState('+1');
  const [importPreview, setImportPreview] = useState([]);
  const [applyCountryCode, setApplyCountryCode] = useState(true);

  useEffect(() => {
    loadContacts();
    loadCountryCodeSettings();
  }, []);

  const loadContacts = async () => {
    const contactList = await storage.getContacts();
    setContacts(contactList);
  };

  const loadCountryCodeSettings = async () => {
    const settings = await storage.getCountryCodeSettings();
    setDefaultCountryCode(settings.defaultCode);
  };

  const handleAddContact = async () => {
    if (!newContact.phone) return;

    let phone = newContact.phone.replace(/[^\d+]/g, '');
    if (!phone.startsWith('+') && applyCountryCode) {
      phone = defaultCountryCode + phone;
    }

    await storage.addContact({
      ...newContact,
      phone,
    });
    setNewContact({ name: '', phone: '', email: '', labels: [] });
    setShowAddForm(false);
    loadContacts();
  };

  const handleDeleteContact = async (id) => {
    await storage.deleteContact(id);
    loadContacts();
  };

  const handleFileUpload = async (event) => {
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

        const preview = jsonData.map((row) => {
          const name = row.name || row.Name || row.NAME || '';
          let phone = String(row.phone || row.Phone || row.PHONE || row.mobile || row.Mobile || '');
          const email = row.email || row.Email || row.EMAIL || '';

          phone = phone.replace(/[^\d+]/g, '');

          const needsCountryCode = phone && !phone.startsWith('+') && !phone.startsWith('00');

          return {
            name,
            phone,
            email,
            originalPhone: phone,
            needsCountryCode,
          };
        });

        setImportPreview(preview);
        setShowImportModal(true);
      } catch (error) {
        console.error('Error parsing file:', error);
        alert('Error parsing file. Please ensure it is a valid Excel or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const handleImportConfirm = async () => {
    const contactsToAdd = importPreview.map((contact) => {
      let phone = contact.phone;
      if (contact.needsCountryCode && applyCountryCode) {
        phone = defaultCountryCode + phone.replace(/^0+/, '');
      }
      return {
        name: contact.name,
        phone,
        email: contact.email,
        labels: [],
      };
    });

    await storage.addContacts(contactsToAdd);
    setShowImportModal(false);
    setImportPreview([]);
    loadContacts();
  };

  const handleSelectAll = () => {
    if (selectedContacts.length === filteredContacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(filteredContacts.map((c) => c.id));
    }
  };

  const handleSelectContact = (id) => {
    if (selectedContacts.includes(id)) {
      setSelectedContacts(selectedContacts.filter((cId) => cId !== id));
    } else {
      setSelectedContacts([...selectedContacts, id]);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedContacts.length} contacts?`)) return;
    for (const id of selectedContacts) {
      await storage.deleteContact(id);
    }
    setSelectedContacts([]);
    loadContacts();
  };

  const filteredContacts = contacts.filter(
    (contact) =>
      contact.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.phone?.includes(searchTerm)
  );

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2>Contacts ({contacts.length})</h2>
          <div className="btn-group">
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(!showAddForm)}>
              + Add
            </button>
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              Import
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        <div className="form-group">
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {showAddForm && (
          <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
            <h3>Add New Contact</h3>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <div className="country-code-select">
                <select
                  value={defaultCountryCode}
                  onChange={(e) => setDefaultCountryCode(e.target.value)}
                >
                  {COUNTRY_CODES.map((cc) => (
                    <option key={cc.code} value={cc.code}>
                      {cc.code} {cc.country}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newContact.phone}
                  onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                  placeholder="Phone number"
                  style={{ flex: 1 }}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Email (optional)</label>
              <input
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
              />
            </div>
            <div className="btn-group">
              <button className="btn btn-primary" onClick={handleAddContact}>
                Save Contact
              </button>
              <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {selectedContacts.length > 0 && (
          <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span>{selectedContacts.length} selected</span>
            <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>
              Delete Selected
            </button>
          </div>
        )}

        <ul className="list">
          {filteredContacts.length > 0 && (
            <li className="list-item" style={{ background: '#f3f4f6' }}>
              <input
                type="checkbox"
                className="contact-checkbox"
                checked={selectedContacts.length === filteredContacts.length}
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
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDeleteContact(contact.id)}
              >
                Delete
              </button>
            </li>
          ))}
          {filteredContacts.length === 0 && (
            <div className="empty-state">
              <p>No contacts found</p>
            </div>
          )}
        </ul>
      </div>

      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '400px' }}>
            <div className="modal-header">
              <h2>Import Contacts</h2>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>
                &times;
              </button>
            </div>

            <div className="form-group">
              <label>Default Country Code</label>
              <select
                value={defaultCountryCode}
                onChange={(e) => setDefaultCountryCode(e.target.value)}
                style={{ width: '100%' }}
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
                  checked={applyCountryCode}
                  onChange={(e) => setApplyCountryCode(e.target.checked)}
                />
                Auto-prefix country code to numbers without one
              </label>
            </div>

            <div style={{ maxHeight: '200px', overflow: 'auto', marginBottom: '12px' }}>
              <table style={{ width: '100%', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Will become</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 10).map((contact, index) => (
                    <tr key={index}>
                      <td>{contact.name}</td>
                      <td>{contact.originalPhone}</td>
                      <td>
                        {contact.needsCountryCode && applyCountryCode
                          ? defaultCountryCode + contact.phone.replace(/^0+/, '')
                          : contact.phone}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.length > 10 && (
                <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '12px' }}>
                  ... and {importPreview.length - 10} more contacts
                </p>
              )}
            </div>

            <div className="alert alert-info">
              {importPreview.filter((c) => c.needsCountryCode).length} contacts will have country code
              added
            </div>

            <div className="btn-group">
              <button className="btn btn-primary" onClick={handleImportConfirm}>
                Import {importPreview.length} Contacts
              </button>
              <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Contacts;
