const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');

const DISCOVERY_PORT = 41234;
const BROADCAST_INTERVAL = 3000;
const DEVICE_TIMEOUT = 10000;

class DiscoveryService {
  constructor(serverPort, deviceName) {
    this.serverPort = serverPort;
    this.deviceId = crypto.randomUUID();
    this.deviceName = deviceName || os.hostname();
    this.peers = new Map();
    this.socket = null;
    this.broadcastTimer = null;
  }

  getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  start() {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.socket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'p2p-cms-announce' && data.deviceId !== this.deviceId) {
          this.peers.set(data.deviceId, {
            id: data.deviceId,
            name: data.deviceName,
            ip: data.ip,
            port: data.port,
            lastSeen: Date.now()
          });
        }
        if (data.type === 'p2p-cms-discover') {
          this._announce(rinfo.address, rinfo.port);
        }
      } catch {}
    });

    this.socket.on('error', (err) => {
      console.error('[Discovery] Socket error:', err.message);
    });

    this.socket.bind(DISCOVERY_PORT, () => {
      this.socket.setBroadcast(true);
      console.log(`[Discovery] Listening on UDP port ${DISCOVERY_PORT}`);
      this._startBroadcast();
    });

    this._cleanupTimer = setInterval(() => this._cleanupPeers(), DEVICE_TIMEOUT);
  }

  _announce(address, port) {
    const msg = Buffer.from(JSON.stringify({
      type: 'p2p-cms-announce',
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      ip: this.getLocalIP(),
      port: this.serverPort
    }));
    if (address && port) {
      this.socket.send(msg, 0, msg.length, port, address);
    } else {
      this.socket.send(msg, 0, msg.length, DISCOVERY_PORT, '255.255.255.255');
    }
  }

  _startBroadcast() {
    this._announce();
    this.broadcastTimer = setInterval(() => this._announce(), BROADCAST_INTERVAL);
  }

  _cleanupPeers() {
    const now = Date.now();
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > DEVICE_TIMEOUT) {
        this.peers.delete(id);
      }
    }
  }

  getPeers() {
    return Array.from(this.peers.values());
  }

  stop() {
    clearInterval(this.broadcastTimer);
    clearInterval(this._cleanupTimer);
    if (this.socket) this.socket.close();
  }
}

module.exports = DiscoveryService;
