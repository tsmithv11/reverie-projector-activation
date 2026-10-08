const { contextBridge, ipcRenderer } = require('electron');
const on = (channel, fn) => { const handler = (_, data) => fn(data); ipcRenderer.on(channel, handler); return () => ipcRenderer.removeListener(channel, handler); };
// Each window receives only its own narrow capability set; no renderer receives a permanent provider key.
const role = new URL(location.href).pathname.split('/').pop()?.replace('.html', '');
const shared = { state: () => ipcRenderer.invoke('state'), onState: fn => on('state', fn) };
const apis = {
  operator: { ...shared, configure: value => ipcRenderer.invoke('configure', value), command: (name, value) => ipcRenderer.invoke('command', name, value), saveKey: (key, provider = 'fal') => ipcRenderer.invoke('save-key', key, provider), preview: () => ipcRenderer.invoke('preview') },
  audience: { ...shared, frame: (seq, analysisOnly = false) => ipcRenderer.invoke('frame', seq, analysisOnly), robotFrame: seq => ipcRenderer.invoke('robot-frame', seq), robotDecoded: id => ipcRenderer.invoke('robot-decoded', id), report: status => ipcRenderer.send('render-status', status), command: (name, value) => ipcRenderer.invoke('audience-command', name, value) },
  engine: { ...shared, publish: frame => ipcRenderer.invoke('publish-frame', frame), health: status => ipcRenderer.send('camera-status', status), onSnapshot: fn => on('snapshot', fn) },
  robot: { onStop: fn => on('robot-stop', fn), closed: result => ipcRenderer.send('robot-closed', result), diagnostic: value => ipcRenderer.send('robot-diagnostic', value), job: () => ipcRenderer.invoke('robot-job'), frame: seq => ipcRenderer.invoke('robot-input', seq), publish: frame => ipcRenderer.invoke('robot-publish', frame), token: () => ipcRenderer.invoke('robot-token'), stage: phase => ipcRenderer.send('robot-stage', phase), complete: result => ipcRenderer.send('robot-result', result) }
};
contextBridge.exposeInMainWorld('installation', apis[role] || {});
