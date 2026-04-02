// Detect API base URL - works both when served from the server and from extension
const API = window.P2P_CMS_API || window.location.origin;

let items = [];
let editingType = "text";
let selectedFile = null;

// --- DOM refs ---
const $ = (s) => document.querySelector(s);
const contentList = $("#content-list");
const emptyState = $("#empty-state");
const mainContent = $("#main-content");
const editorModal = $("#editor-modal");
const devicesModal = $("#devices-modal");
const syncModal = $("#sync-modal");
const backupModal = $("#backup-modal");
const statusBar = $("#status-bar");
const statusText = $("#status-text");
const deviceLabel = $("#device-label");

// --- API helpers ---
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function showStatus(msg, isError = false) {
  statusText.textContent = msg;
  statusBar.classList.remove("hidden", "error");
  if (isError) statusBar.classList.add("error");
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => statusBar.classList.add("hidden"), 3000);
}

// --- Content rendering ---
function renderItems() {
  if (items.length === 0) {
    contentList.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  contentList.innerHTML = items
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((item) => {
      const date = new Date(item.updatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const tagsHtml = (item.tags || [])
        .map((t) => `<span class="tag">${escHtml(t)}</span>`)
        .join("");

      let bodyHtml = "";
      if (item.type === "image" && item.filePath) {
        bodyHtml = `
          <div class="card-body">
            <img class="card-image" src="${API}/files/${item.filePath}" alt="${escHtml(item.title)}" loading="lazy">
          </div>`;
      } else if (item.content) {
        bodyHtml = `<div class="card-body"><p class="card-text">${escHtml(item.content)}</p></div>`;
      }

      return `
        <div class="content-card" data-id="${item.id}">
          <div class="card-header">
            <span class="card-title">${escHtml(item.title)}</span>
            <span class="card-type ${item.type}">${item.type}</span>
          </div>
          ${bodyHtml}
          ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ""}
          <div class="card-footer">
            <span class="card-date">${date}</span>
            <div class="card-actions">
              <button class="card-btn edit" data-id="${item.id}" title="Edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="card-btn delete" data-id="${item.id}" title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>`;
    })
    .join("");

  contentList.querySelectorAll(".card-btn.edit").forEach((btn) => {
    btn.addEventListener("click", () => openEditor(btn.dataset.id));
  });
  contentList.querySelectorAll(".card-btn.delete").forEach((btn) => {
    btn.addEventListener("click", () => deleteItem(btn.dataset.id));
  });
}

function escHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- CRUD ---
async function loadItems() {
  try {
    items = await api("/api/items");
    renderItems();
  } catch (e) {
    showStatus("Failed to load content", true);
  }
}

function openEditor(id = null) {
  const item = id ? items.find((i) => i.id === id) : null;
  $("#edit-id").value = id || "";
  $("#editor-title").textContent = item ? "Edit Content" : "New Content";
  $("#edit-title").value = item ? item.title : "";
  $("#edit-content").value = item ? item.content : "";
  $("#edit-tags").value = item ? (item.tags || []).join(", ") : "";

  editingType = item ? item.type : "text";
  selectedFile = null;

  document.querySelectorAll(".type-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.type === editingType);
  });
  $("#text-editor").classList.toggle("hidden", editingType !== "text");
  $("#image-editor").classList.toggle("hidden", editingType !== "image");
  $("#image-preview").classList.add("hidden");
  $("#edit-file").value = "";

  if (item && item.type === "image" && item.filePath) {
    $("#preview-img").src = `${API}/files/${item.filePath}`;
    $("#image-preview").classList.remove("hidden");
  }

  editorModal.classList.remove("hidden");
  $("#edit-title").focus();
}

function closeEditor() {
  editorModal.classList.add("hidden");
  selectedFile = null;
}

async function saveItem(e) {
  e.preventDefault();
  const id = $("#edit-id").value;
  const title = $("#edit-title").value.trim();
  const content = $("#edit-content").value;
  const tags = $("#edit-tags")
    .value.split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (!title) return;

  try {
    if (editingType === "image" && selectedFile) {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", title);
      formData.append("tags", JSON.stringify(tags));

      if (id) {
        await api(`/api/items/${id}`, {
          method: "PUT",
          body: JSON.stringify({ title, tags }),
        });
      } else {
        await fetch(`${API}/api/upload`, { method: "POST", body: formData });
      }
    } else if (id) {
      await api(`/api/items/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title, content, tags, type: editingType }),
      });
    } else {
      await api("/api/items", {
        method: "POST",
        body: JSON.stringify({ title, content, tags, type: editingType }),
      });
    }

    closeEditor();
    showStatus(id ? "Content updated" : "Content created");
    await loadItems();
  } catch (e) {
    showStatus("Failed to save", true);
  }
}

async function deleteItem(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  if (!confirm(`Delete "${item.title}"?`)) return;

  try {
    await api(`/api/items/${id}`, { method: "DELETE" });
    showStatus("Content deleted");
    await loadItems();
  } catch (e) {
    showStatus("Failed to delete", true);
  }
}

// --- Devices ---
async function openDevices() {
  devicesModal.classList.remove("hidden");
  const list = $("#devices-list");
  const noDevices = $("#no-devices");

  try {
    const devices = await api("/api/devices");
    if (devices.length === 0) {
      list.innerHTML = "";
      noDevices.classList.remove("hidden");
      return;
    }
    noDevices.classList.add("hidden");

    list.innerHTML = devices
      .map(
        (d) => `
        <div class="device-card">
          <div class="device-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          </div>
          <div class="device-info">
            <div class="device-name">${escHtml(d.name)}</div>
            <div class="device-ip">${d.ip}:${d.port}</div>
          </div>
          <div class="device-actions">
            <button class="sync-btn" data-id="${d.id}" data-name="${escHtml(d.name)}">Sync</button>
          </div>
        </div>`,
      )
      .join("");

    list.querySelectorAll(".sync-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        previewSync(btn.dataset.id, btn.dataset.name),
      );
    });
  } catch {
    list.innerHTML =
      '<p style="color:#e91e63;text-align:center;padding:20px;">Server not reachable</p>';
  }
}

async function previewSync(deviceId, deviceName) {
  devicesModal.classList.add("hidden");
  $("#sync-device-name").textContent = deviceName;
  syncModal.classList.remove("hidden");
  $("#sync-preview").innerHTML =
    '<p style="text-align:center;color:#adb5bd;padding:20px;">Loading...</p>';
  $("#sync-confirm").classList.add("hidden");

  try {
    const data = await api(`/api/preview/${deviceId}`);

    if (!data.items || data.items.length === 0) {
      $("#sync-preview").innerHTML =
        '<p style="text-align:center;color:#adb5bd;padding:20px;">No content on remote device</p>';
      return;
    }

    $("#sync-confirm").classList.remove("hidden");
    $("#sync-preview").innerHTML = data.items
      .map(
        (item) => `
        <div class="sync-item">
          <span class="sync-item-type">${item.type}</span>
          <span class="sync-item-title">${escHtml(item.title)}</span>
        </div>`,
      )
      .join("");

    $("#sync-confirm").onclick = async () => {
      try {
        const result = await api(`/api/pull/${deviceId}`, { method: "POST" });
        showStatus(
          `Synced ${result.itemsAdded} items from ${result.deviceName}`,
        );
        syncModal.classList.add("hidden");
        await loadItems();
      } catch (e) {
        showStatus("Sync failed: " + e.message, true);
      }
    };
  } catch (e) {
    $("#sync-preview").innerHTML =
      `<p style="color:#e91e63;text-align:center;padding:20px;">${escHtml(e.message)}</p>`;
  }
}

// --- Backup ---
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

async function openBackup() {
  backupModal.classList.remove("hidden");
  $("#import-options").classList.add("hidden");
  $("#git-log").classList.add("hidden");

  try {
    const status = await api("/api/backup/status");
    $("#backup-items").textContent = status.itemCount;
    $("#backup-size").textContent = formatBytes(status.totalSize);
    $("#backup-git-status").textContent = status.isGit
      ? status.lastCommit
        ? "active"
        : "init"
      : "off";
    if (status.remoteUrl) {
      $("#git-remote").value = status.remoteUrl;
    }
  } catch {
    $("#backup-items").textContent = "-";
    $("#backup-size").textContent = "-";
  }
}

// --- Event listeners ---
$("#btn-add").addEventListener("click", () => openEditor());
$("#btn-devices").addEventListener("click", openDevices);
$("#btn-backup").addEventListener("click", openBackup);
$("#editor-close").addEventListener("click", closeEditor);
$("#editor-cancel").addEventListener("click", closeEditor);
$("#devices-close").addEventListener("click", () =>
  devicesModal.classList.add("hidden"),
);
$("#sync-close").addEventListener("click", () =>
  syncModal.classList.add("hidden"),
);
$("#sync-cancel").addEventListener("click", () =>
  syncModal.classList.add("hidden"),
);
$("#backup-close").addEventListener("click", () =>
  backupModal.classList.add("hidden"),
);
$("#status-close").addEventListener("click", () =>
  statusBar.classList.add("hidden"),
);
$("#editor-form").addEventListener("submit", saveItem);

// Type tabs
document.querySelectorAll(".type-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    editingType = tab.dataset.type;
    document
      .querySelectorAll(".type-tab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    $("#text-editor").classList.toggle("hidden", editingType !== "text");
    $("#image-editor").classList.toggle("hidden", editingType !== "image");
  });
});

// File drop
const fileDrop = $("#file-drop");
const fileInput = $("#edit-file");

fileDrop.addEventListener("click", () => fileInput.click());
fileDrop.addEventListener("dragover", (e) => {
  e.preventDefault();
  fileDrop.style.borderColor = "#4361ee";
});
fileDrop.addEventListener("dragleave", () => {
  fileDrop.style.borderColor = "";
});
fileDrop.addEventListener("drop", (e) => {
  e.preventDefault();
  fileDrop.style.borderColor = "";
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    $("#preview-img").src = e.target.result;
    $("#image-preview").classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

$("#remove-image").addEventListener("click", () => {
  selectedFile = null;
  $("#image-preview").classList.add("hidden");
  fileInput.value = "";
});

// Export
$("#btn-export").addEventListener("click", () => {
  showStatus("Preparing backup download...");
  window.location.href = `${API}/api/export`;
  setTimeout(() => showStatus("Backup downloaded"), 1000);
});

// Import
$("#import-file").addEventListener("change", () => {
  if ($("#import-file").files.length) {
    $("#import-options").classList.remove("hidden");
  }
});

$("#btn-import-confirm").addEventListener("click", async () => {
  const file = $("#import-file").files[0];
  if (!file) return;

  const mode = document.querySelector(
    'input[name="import-mode"]:checked',
  ).value;
  const formData = new FormData();
  formData.append("backup", file);
  formData.append("merge", mode === "merge" ? "true" : "false");

  try {
    showStatus("Restoring backup...");
    const res = await fetch(`${API}/api/import`, {
      method: "POST",
      body: formData,
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    const msg =
      mode === "merge"
        ? `Merged: ${result.itemsAdded} new items added`
        : `Restored: ${result.itemsRestored} items`;
    showStatus(msg);
    $("#import-options").classList.add("hidden");
    $("#import-file").value = "";
    await loadItems();
    await openBackup();
  } catch (e) {
    showStatus("Import failed: " + e.message, true);
  }
});

// Git backup
$("#btn-git-backup").addEventListener("click", async () => {
  const remoteUrl = $("#git-remote").value.trim();
  try {
    showStatus("Running git backup...");
    const result = await api("/api/backup/git", {
      method: "POST",
      body: JSON.stringify({ remoteUrl: remoteUrl || undefined }),
    });

    if (result.log) {
      const logEl = $("#git-log");
      logEl.classList.remove("hidden");
      logEl.innerHTML = result.log
        .map((l) => `<div>${escHtml(l)}</div>`)
        .join("");
    }

    showStatus(
      result.pushed
        ? "Backed up & pushed"
        : result.message || "Backed up locally",
    );
  } catch (e) {
    showStatus("Git backup failed: " + e.message, true);
  }
});

// Close modals on backdrop click
[editorModal, devicesModal, syncModal, backupModal].forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
});

// Escape key closes modals
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    [editorModal, devicesModal, syncModal, backupModal].forEach((m) =>
      m.classList.add("hidden"),
    );
  }
});

// --- Init ---
async function init() {
  try {
    const health = await api("/health");
    deviceLabel.textContent = health.deviceName;
  } catch {
    deviceLabel.textContent = "offline";
    deviceLabel.style.background = "#fce4ec";
    deviceLabel.style.color = "#e91e63";
  }
  loadItems();
}

init();
