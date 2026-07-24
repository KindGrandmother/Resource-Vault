const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  app,
  BrowserWindow,
  Notification,
  ipcMain,
  safeStorage,
  shell,
  clipboard,
} = require('electron');
const { ResourceDatabase, isAccountType } = require('./database.cjs');

let mainWindow;
let resourceDb;
let notificationTimer;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function isTrustedSender(event) {
  const url = event.senderFrame?.url || '';
  return url.startsWith('file://') || url.startsWith('http://127.0.0.1:5173');
}

function assertTrusted(event) {
  if (!isTrustedSender(event)) {
    throw new Error('Untrusted IPC sender.');
  }
}

async function encryptSecret(value) {
  const plain = String(value || '');
  if (!plain) return null;

  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('OS-backed encryption is unavailable on this computer.');
  }

  const encrypted = await safeStorage.encryptStringAsync(plain);
  return encrypted.toString('base64');
}

async function decryptSecret(base64Value) {
  if (!base64Value) return '';

  const decrypted = await safeStorage.decryptStringAsync(
    Buffer.from(base64Value, 'base64'),
  );
  return decrypted.result;
}

async function revealResource(raw) {
  if (!raw) return null;

  const result = structuredClone(raw);
  const d = result.details || {};

  if (result.type === 'proxy') {
    d.username = await decryptSecret(d.usernameSecret);
    d.password = await decryptSecret(d.passwordSecret);
    delete d.usernameSecret;
    delete d.passwordSecret;
  } else if (result.type === 'gift_card') {
    d.cardNumber = await decryptSecret(d.cardNumberSecret);
    d.uid = await decryptSecret(d.uidSecret);
    delete d.cardNumberSecret;
    delete d.uidSecret;
  } else if (isAccountType(result.type)) {
    d.dob = await decryptSecret(d.dobSecret);
    d.streetAddress = await decryptSecret(d.streetAddressSecret);
    d.ssn = await decryptSecret(d.ssnSecret);
    d.driverLicense = await decryptSecret(d.driverLicenseSecret);
    d.password = await decryptSecret(d.passwordSecret);

    delete d.dobSecret;
    delete d.streetAddressSecret;
    delete d.ssnSecret;
    delete d.driverLicenseSecret;
    delete d.passwordSecret;
  } else {
    d.phoneNumber = await decryptSecret(d.phoneNumberSecret);
    delete d.phoneNumberSecret;
  }

  return result;
}

async function prepareForSave(payload) {
  const resource = structuredClone(payload || {});
  resource.id = resource.id || randomUUID();
  resource.details = resource.details || {};
  const d = resource.details;

  if (resource.type === 'proxy') {
    d.usernameSecret = await encryptSecret(d.username);
    d.passwordSecret = await encryptSecret(d.password);
    delete d.username;
    delete d.password;
  } else if (resource.type === 'gift_card') {
    const digits = String(d.cardNumber || '').replace(/\D/g, '');
    d.cardLast4 = digits.slice(-4);
    d.cardNumberSecret = await encryptSecret(d.cardNumber);
    d.uidSecret = await encryptSecret(d.uid);
    d.depositAmountCents = Math.round(Number(d.depositAmount || 0) * 100);
    d.currentAmountCents = Math.round(Number(d.currentAmount || 0) * 100);

    delete d.cardNumber;
    delete d.uid;
    delete d.depositAmount;
    delete d.currentAmount;
  } else if (isAccountType(resource.type)) {
    const ssnDigits = String(d.ssn || '').replace(/\D/g, '');
    d.ssnLast4 = ssnDigits.slice(-4);
    d.profileUrl = d.profileUrl || d.linkedinUrl || d.upworkUrl || '';
    d.dobSecret = await encryptSecret(d.dob);
    d.streetAddressSecret = await encryptSecret(d.streetAddress);
    d.ssnSecret = await encryptSecret(d.ssn);
    d.driverLicenseSecret = await encryptSecret(d.driverLicense);
    d.passwordSecret = await encryptSecret(d.password);

    delete d.linkedinUrl;
    delete d.upworkUrl;
    delete d.dob;
    delete d.streetAddress;
    delete d.ssn;
    delete d.driverLicense;
    delete d.password;
  } else {
    const digits = String(d.phoneNumber || '').replace(/\D/g, '');
    d.phoneLast4 = digits.slice(-4);
    d.phoneNumberSecret = await encryptSecret(d.phoneNumber);
    delete d.phoneNumber;
  }

  return resource;
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function showExpirationNotifications() {
  if (!resourceDb || !Notification.isSupported()) return;

  const dueItems = resourceDb.getDueExpirationNotifications([7, 3]);

  dueItems.forEach((item) => {
    const plural = item.remainingDays === 1 ? 'day' : 'days';
    const notification = new Notification({
      title: `${item.remainingDays}-day expiration reminder`,
      body: `${item.label} expires in ${item.remainingDays} ${plural} (${item.expiresAt}).`,
      silent: false,
      timeoutType: 'default',
    });

    notification.on('click', focusMainWindow);
    notification.show();

    resourceDb.markExpirationNotificationSent(
      item.id,
      item.remainingDays,
      item.expiresAt,
    );
  });
}

function startNotificationScheduler() {
  showExpirationNotifications();

  if (notificationTimer) clearInterval(notificationTimer);
  notificationTimer = setInterval(
    showExpirationNotifications,
    60 * 60 * 1000,
  );
  notificationTimer.unref?.();
}

function registerIpcHandlers() {
  ipcMain.handle('dashboard:get', (event) => {
    assertTrusted(event);
    return resourceDb.getDashboard();
  });

  ipcMain.handle('resources:list', (event, filters) => {
    assertTrusted(event);
    return resourceDb.listResources(filters || {});
  });

  ipcMain.handle('resources:get', async (event, id) => {
    assertTrusted(event);
    return revealResource(resourceDb.getRawResource(String(id)));
  });

  ipcMain.handle('resources:save', async (event, payload) => {
    assertTrusted(event);
    const prepared = await prepareForSave(payload);
    const saved = resourceDb.saveResource(prepared);
    setTimeout(showExpirationNotifications, 250);
    return revealResource(saved);
  });

  ipcMain.handle('resources:delete', (event, id) => {
    assertTrusted(event);
    return resourceDb.deleteResource(String(id));
  });

  ipcMain.handle('clipboard:write', (event, value) => {
    assertTrusted(event);
    clipboard.writeText(String(value ?? ''));
    return { copied: true };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 720,
    minHeight: 600,
    title: 'Resource Vault',
    backgroundColor: '#0b1020',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed =
      url.startsWith('file://') ||
      url.startsWith('http://127.0.0.1:5173');

    if (!allowed) event.preventDefault();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.on('second-instance', focusMainWindow);

app.whenReady().then(() => {
  app.setAppUserModelId('com.local.resourcevault');

  resourceDb = new ResourceDatabase(
    path.join(app.getPath('userData'), 'resource-vault.sqlite'),
  );

  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
    });
  }

  registerIpcHandlers();
  createWindow();
  startNotificationScheduler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (notificationTimer) clearInterval(notificationTimer);
  resourceDb?.close();
});