const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const DiscoveryService = require('./discovery');

const PORT = parseInt(process.env.P2P_CMS_PORT || '41235');
const DATA_DIR = path.join(os.homedir(), '.p2p-cms', 'content');
const META_FILE = path.join(os.homedir(), '.p2p-cms', 'metadata.json');
const WEB_DIR = path.join(__dirname, '..', 'web');

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
  } catch {
    return { items: [] };
  }
}

function saveMeta(data) {
  fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2));
}

const upload = multer({
  storage: multer.diskStorage({
    destination: DATA_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/files', express.static(DATA_DIR));
app.use(express.static(WEB_DIR));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    deviceId: discovery.deviceId,
    deviceName: discovery.deviceName,
    localIp: discovery.getLocalIP(),
    port: PORT
  });
});

app.get('/api/items', (req, res) => {
  const meta = loadMeta();
  res.json(meta.items);
});

app.post('/api/items', (req, res) => {
  const meta = loadMeta();
  const item = {
    id: crypto.randomUUID(),
    title: req.body.title || 'Untitled',
    type: req.body.type || 'text',
    content: req.body.content || '',
    filePath: req.body.filePath || null,
    originalName: req.body.originalName || null,
    tags: req.body.tags || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  meta.items.push(item);
  saveMeta(meta);
  res.status(201).json(item);
});

app.put('/api/items/:id', (req, res) => {
  const meta = loadMeta();
  const idx = meta.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const item = meta.items[idx];
  if (req.body.title !== undefined) item.title = req.body.title;
  if (req.body.content !== undefined) item.content = req.body.content;
  if (req.body.tags !== undefined) item.tags = req.body.tags;
  if (req.body.type !== undefined) item.type = req.body.type;
  item.updatedAt = new Date().toISOString();

  meta.items[idx] = item;
  saveMeta(meta);
  res.json(item);
});

app.delete('/api/items/:id', (req, res) => {
  const meta = loadMeta();
  const idx = meta.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const [removed] = meta.items.splice(idx, 1);
  if (removed.filePath) {
    const fullPath = path.join(DATA_DIR, removed.filePath);
    try { fs.unlinkSync(fullPath); } catch {}
  }
  saveMeta(meta);
  res.json({ success: true });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const meta = loadMeta();
  const item = {
    id: crypto.randomUUID(),
    title: req.body.title || req.file.originalname,
    type: req.file.mimetype.startsWith('image/') ? 'image' : 'file',
    content: '',
    filePath: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    tags: req.body.tags ? JSON.parse(req.body.tags) : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  meta.items.push(item);
  saveMeta(meta);
  res.status(201).json(item);
});

app.get('/api/devices', (req, res) => {
  res.json(discovery.getPeers());
});

app.get('/api/sync/:deviceId', (req, res) => {
  const peer = discovery.getPeers().find(p => p.id === req.params.deviceId);
  if (!peer) return res.status(404).json({ error: 'Device not found' });

  const meta = loadMeta();
  res.json({
    device: { id: discovery.deviceId, name: discovery.deviceName },
    items: meta.items.map(item => ({
      ...item,
      fileUrl: item.filePath
        ? `http://${discovery.getLocalIP()}:${PORT}/files/${item.filePath}`
        : null
    }))
  });
});

app.get('/api/preview/:deviceId', async (req, res) => {
  const peer = discovery.getPeers().find(p => p.id === req.params.deviceId);
  if (!peer) return res.status(404).json({ error: 'Device not found' });
  try {
    const response = await fetch(`http://${peer.ip}:${peer.port}/api/items`);
    const items = await response.json();
    res.json({ device: { id: peer.id, name: peer.name }, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pull/:deviceId', async (req, res) => {
  const peer = discovery.getPeers().find(p => p.id === req.params.deviceId);
  if (!peer) return res.status(404).json({ error: 'Device not found' });

  try {
    const response = await fetch(`http://${peer.ip}:${peer.port}/api/sync/${discovery.deviceId}`);
    const remoteData = await response.json();
    const meta = loadMeta();
    const existingIds = new Set(meta.items.map(i => i.id));
    let added = 0;

    for (const item of remoteData.items) {
      if (existingIds.has(item.id)) continue;

      if (item.fileUrl) {
        try {
          const fileResp = await fetch(item.fileUrl);
          const ext = path.extname(item.originalName || 'file');
          const filename = `${crypto.randomUUID()}${ext}`;
          const buffer = Buffer.from(await fileResp.arrayBuffer());
          fs.writeFileSync(path.join(DATA_DIR, filename), buffer);
          item.filePath = filename;
        } catch (e) {
          console.error('[Sync] Failed to download file:', e.message);
        }
      }
      delete item.fileUrl;
      meta.items.push(item);
      added++;
    }

    saveMeta(meta);
    res.json({ success: true, itemsAdded: added, deviceName: remoteData.device.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const discovery = new DiscoveryService(PORT, process.env.P2P_CMS_NAME);

app.listen(PORT, '0.0.0.0', () => {
  const ip = discovery.getLocalIP();
  console.log(`[P2P-CMS] Server running on http://0.0.0.0:${PORT}`);
  console.log(`[P2P-CMS] Device: ${discovery.deviceName} (${discovery.deviceId})`);
  console.log(`[P2P-CMS] Open on this device: http://localhost:${PORT}`);
  console.log(`[P2P-CMS] Open from phone/other device: http://${ip}:${PORT}`);
  console.log(`[P2P-CMS] Data dir: ${DATA_DIR}`);
  discovery.start();
});

process.on('SIGINT', () => {
  discovery.stop();
  process.exit(0);
});
