const { contextBridge, ipcRenderer } = require('electron');
const on = (channel, fn) => { const handler = (_, data) => fn(data); ipcRenderer.on(channel, handler); return () => ipcRenderer.removeListener(channel, handler); };
// Each window receives only its own narrow capability set; no renderer receives FAL_KEY.
const role = new URL(location.href).pathname.split('/').pop()?.replace('.html', '');
const shared = { state: () => ipcRenderer.invoke('state'), onState: fn => on('state', fn) };
const apis = {
  operator: { ...shared, configure: value => ipcRenderer.invoke('configure', value), command: (name, value) => ipcRenderer.invoke('command', name, value), saveKey: key => ipcRenderer.invoke('save-key', key), preview: () => ipcRenderer.invoke('preview') },
  audience: { ...shared, frame: seq => ipcRenderer.invoke('frame', seq), robotImage: () => ipcRenderer.invoke('robot-image'), report: status => ipcRenderer.send('render-status', status), command: (name, value) => ipcRenderer.invoke('audience-command', name, value) },
  engine: { ...shared, publish: frame => ipcRenderer.invoke('publish-frame', frame), health: status => ipcRenderer.send('camera-status', status), onSnapshot: fn => on('snapshot', fn) },
  robot: { job: () => ipcRenderer.invoke('robot-job'), token: () => ipcRenderer.invoke('robot-token'), complete: result => ipcRenderer.send('robot-result', result) }
};
contextBridge.exposeInMainWorld('installation', apis[role] || {});
