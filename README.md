# SUS WhatsApp CRM Extension

A complete WhatsApp CRM Chrome Extension with bulk messaging, auto-reply bot, and contact management.

## Features

### Core Features
- **Bulk Messaging**: Send messages to multiple contacts with personalization
- **Attachment Support**: Send images (as viewable media) and PDFs
- **Auto-Reply Bot**: Rule-based automatic responses with keyword matching
- **Contact Management**: Import/export contacts with label support
- **Campaign Management**: Create, pause, resume, and track campaigns

### Security Features
- Randomized sending intervals (5-10 seconds default) to prevent account banning
- Daily and hourly message limits
- Safety mode with configurable limits

### Contact Features
- Import contacts from Excel/CSV files
- Auto-prefix country codes for numbers without one
- Export contacts by label or type
- Bulk labeling via file import

### Auto-Reply Bot
- Keyword-based triggers (partial, exact, or regex matching)
- Multiple response options (randomly selected)
- Business hours support
- Priority-based rule ordering

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Open Chrome and go to `chrome://extensions/`
5. Enable "Developer mode"
6. Click "Load unpacked" and select the `dist` folder

## Development

```bash
npm run dev    # Start development server
npm run build  # Build for production
npm run lint   # Run ESLint
```

## Usage

1. Open WhatsApp Web in your browser
2. Click the extension icon to open the CRM panel
3. Import your contacts or add them manually
4. Create a campaign with your message and attachments
5. Start the campaign and monitor progress

## File Structure

```
src/
├── background.js      # Service worker for campaign processing
├── content.js         # Content script for WhatsApp Web interaction
├── storage.js         # Chrome storage wrapper
└── popup/
    ├── main.jsx       # Entry point
    ├── App.jsx        # Main app component
    ├── styles.css     # Global styles
    └── components/
        ├── Dashboard.jsx
        ├── Contacts.jsx
        ├── Campaigns.jsx
        ├── AutoReply.jsx
        ├── ContactManager.jsx
        └── Settings.jsx
```

## Permissions

- `storage`: Store contacts, campaigns, and settings
- `tabs`: Access WhatsApp Web tab
- `alarms`: Keep service worker alive
- `notifications`: Campaign completion alerts
- `scripting`: Inject content scripts
- `activeTab`: Access current tab
- `unlimitedStorage`: Store large contact lists

## License

ISC
