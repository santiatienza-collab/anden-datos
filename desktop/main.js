// Andén para escritorio (macOS): una ventana que abre la web app publicada, para que siempre esté al día sin reinstalar.
// Es el mismo sitio que se abre en el navegador: https://santiatienza-collab.github.io/anden-datos/
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

const URL_APP = 'https://santiatienza-collab.github.io/anden-datos/';
const ORIGIN = new URL(URL_APP).origin;
const TEST = process.env.ANDEN_TEST === '1'; // prueba automática: no muestra la ventana y sale al cargar

// Una sola ventana: si se abre otra vez, se enfoca la que ya existe
if (!app.requestSingleInstanceLock()) app.quit();

let win;
function create() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 420, minHeight: 560,
    title: 'Andén', backgroundColor: '#1c1c1f', show: !TEST,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });

  // Solo este sitio puede pedir notificaciones y micrófono (el dictado de la web app)
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    const ok = wc.getURL().startsWith(ORIGIN) && ['notifications', 'media', 'audioCapture'].includes(permission);
    cb(ok);
  });

  // Los enlaces externos (fuentes, mapas, GitHub…) se abren en el navegador, no dentro de la app
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(ORIGIN)) shell.openExternal(url); return { action: url.startsWith(ORIGIN) ? 'allow' : 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN) && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });

  // Sin conexión: pantalla propia con botón de reintentar, en lugar de una página en blanco
  win.webContents.on('did-fail-load', (_e, code, _d, url, isMainFrame) => {
    if (isMainFrame && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'));
  });
  if (TEST) {
    win.webContents.on('did-finish-load', async () => {
      const t = await win.webContents.executeJavaScript('document.title + " | " + (typeof S !== "undefined" ? "S:" + S.trains.length : "sin S")').catch((e) => 'error ' + e);
      console.log('CARGADO:', win.webContents.getURL(), '→', t);
      app.quit();
    });
    setTimeout(() => { console.log('TIEMPO AGOTADO'); app.exit(2); }, 45000);
  }
  win.loadURL(URL_APP);
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'Ver', submenu: [{ role: 'reload', label: 'Recargar' }, { role: 'togglefullscreen', label: 'Pantalla completa' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]));
  create();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) create(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
