# WhatsApp Festival Management Bot

This project is a WhatsApp automation tool designed to integrate with the Festival Management system. It uses `whatsapp-web.js` to interact with WhatsApp and `firebase-admin` to sync data with the Firestore database.

## Features

- **WhatsApp Integration**: Automated messaging and response system.
- **Firebase Sync**: Real-time connection with Firestore for data management.
- **Scheduled Tasks**: Use of `node-cron` for periodic updates and notifications.
- **Local Authentication**: Remembers your WhatsApp session so you don't have to scan the QR code every time.

## Prerequisites

- Node.js (v16 or higher recommended)
- A Firebase project with a Service Account key (`serviceAccount.json`)
- WhatsApp account for scanning the QR code

## Installation

1.  **Clone the repository** (if you haven't already):
    ```bash
    git clone <repository-url>
    cd whatsapp
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Setup Firebase**:
    Ensure your `serviceAccount.json` is present in the root directory.

4.  **Configuration**:
    Create a `.env` file for any environment variables if needed (though the current setup uses defaults).

## Running the Application

To start the bot:

```bash
npm start
```

For development with auto-reload (requires `nodemon` installed globally or as a dev dependency):

```bash
npm run dev
```

## How to Link WhatsApp

1. Run the application.
2. A QR code will appear in your terminal.
3. Open WhatsApp on your phone.
4. Go to **Settings > Linked Devices > Link a Device**.
5. Scan the QR code in your terminal.

## Bot Commands (Default)

- `!ping`: Replies with "pong".
- `!status`: Shows the current server time.

## Project Structure

- `index.js`: Main entry point for the bot logic.
- `serviceAccount.json`: Firebase configuration.
- `.auth_info/`: Directory where WhatsApp session data is stored (created automatically).
- `package.json`: Project dependencies and scripts.
