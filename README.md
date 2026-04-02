# P2P CMS

Peer-to-peer content management system. Own your content, sync across devices on your local network — no cloud, no accounts.

## How It Works

```
┌─────────────┐     LAN (WiFi)     ┌─────────────┐
│   PC/Laptop  │◄──── UDP broadcast ───►│   Phone      │
│              │                       │              │
│ Node.js      │     HTTP sync        │ Any browser  │
│ server       │◄────────────────────►│ (no server   │
│ + extension  │                      │  needed)     │
└─────────────┘                       └─────────────┘
```

- **Each device** can run a companion Node.js server
- **Devices auto-discover** each other via UDP broadcasts on the same WiFi
- **Extension** (Chrome/Firefox) talks to your local server via `localhost`
- **Phone/tablet** — just open the server URL in any browser, no app needed
- **Content** is stored in `~/.p2p-cms/` on each device — you own it

## Quick Start

### 1. Install

```bash
git clone https://github.com/nd28/p2p-cms.git
cd p2p-cms
npm install
```

### 2. Run the server

```bash
npm run server
```

Output:
```
[P2P-CMS] Server running on http://0.0.0.0:41235
[P2P-CMS] Open on this device: http://localhost:41235
[P2P-CMS] Open from phone/other device: http://192.168.1.100:41235
```

### 3. Access the UI

| From | How |
|------|-----|
| **This PC** | Open `http://localhost:41235` in your browser |
| **Phone/tablet** | Open the URL shown in the terminal (e.g. `http://192.168.1.100:41235`) |
| **Browser extension** | Load the `extension/` folder (see below) |

### 4. Browser Extension (optional)

The extension adds a toolbar popup — same UI, embedded from your local server.

**Chrome:**
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `extension/` folder

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `extension/manifest.json`

## Usage

### Create content
- Click **+** to add a new item
- Choose **Text** (notes, code, markdown) or **Image**
- Add tags for organization
- Click **Save**

### Sync between devices

1. Run the server on both devices (PC + another PC, or PC + Termux on Android)
2. Click the **devices icon** in the header
3. See discovered devices on your network
4. Click **Sync** to pull content from another device

### Access from phone (no server needed)

Your phone doesn't need Node.js or a server. Just:
1. Run the server on your PC
2. Open the printed URL on your phone's browser
3. Use the full CMS — create, edit, delete content

All content is stored on the PC. Your phone is a remote UI.

## Project Structure

```
p2p-cms/
├── server/
│   ├── index.js          # Express server — REST API, file storage, sync proxy
│   └── discovery.js      # UDP broadcast for LAN device discovery
├── web/
│   ├── index.html        # Web UI (served by the server at /)
│   ├── style.css         # Responsive styles (desktop + mobile)
│   └── app.js            # Frontend logic
├── extension/
│   ├── manifest.json     # Cross-browser Manifest V3
│   ├── background.js     # Background service worker
│   └── popup/
│       └── popup.html    # Extension popup (iframes the server)
├── package.json
└── README.md
```

## API

The server exposes a REST API on port `41235`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server status and device info |
| `GET` | `/api/items` | List all content items |
| `POST` | `/api/items` | Create a text item |
| `PUT` | `/api/items/:id` | Update an item |
| `DELETE` | `/api/items/:id` | Delete an item |
| `POST` | `/api/upload` | Upload an image/file |
| `GET` | `/api/devices` | List discovered devices |
| `GET` | `/api/preview/:deviceId` | Preview remote device content |
| `POST` | `/api/pull/:deviceId` | Sync content from remote device |

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `P2P_CMS_PORT` | `41235` | Server port |
| `P2P_CMS_NAME` | hostname | Device name shown to peers |

```bash
P2P_CMS_PORT=5000 P2P_CMS_NAME="my-laptop" npm run server
```

## Data Storage

Content is stored in `~/.p2p-cms/`:

```
~/.p2p-cms/
├── metadata.json      # Item metadata (titles, tags, timestamps)
└── content/           # Uploaded files and images
    ├── uuid.jpg
    └── uuid.png
```

## Discovery

Devices find each other using UDP broadcast on port `41234`. This works automatically on any local WiFi network — no configuration needed.

If devices can't see each other, check:
- Both are on the same WiFi/subnet
- Firewall isn't blocking UDP port `41234` or TCP port `41235`

## License

MIT
