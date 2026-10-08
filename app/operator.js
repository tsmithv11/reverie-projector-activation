const api = window.installation, $ = id => document.getElementById(id);
let state = await api.state(), signature = '', deviceSignature = '';
const icons = { heat: '⌗', robots: '♙', monsters: '☁', lines: '⌖', garden: '✳' };
async function configure(patch) { try { state = await api.configure(patch); render(state); } catch { $('notice').textContent = 'Could not save settings. Check that the settings folder is writable.'; } }
function sceneList(s) {
  const key = JSON.stringify(s.settings.scenes); if (key === signature) return; signature = key;
  $('scene-list').replaceChildren();
  s.settings.scenes.forEach((entry, index) => {
    const scene = s.scenes.find(item => item.id === entry.id), card = document.createElement('div'); card.className = 'scene-card'; card.dataset.id = entry.id;
    const art = document.createElement('button'); art.className = `scene-art ${entry.id}`; art.title = `Show ${scene.name}`; art.disabled = !entry.enabled; const symbol = document.createElement('span'); symbol.textContent = icons[entry.id] || '✳'; art.append(symbol); art.onclick = () => api.command('select', entry.id);
    const content = document.createElement('div'); content.className = 'scene-card-content';
    const number = document.createElement('div'); number.className = 'scene-number'; number.textContent = `WORLD ${String(index + 1).padStart(2, '0')} · LIVE`;
    const title = document.createElement('div'); title.className = 'scene-title'; title.textContent = scene.name;
    const actions = document.createElement('div'); actions.className = 'scene-actions'; const label = document.createElement('label'); const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = entry.enabled; enabled.setAttribute('aria-label', `Enable ${scene.name}`); enabled.onchange = () => configure({ scenes: state.settings.scenes.map(item => item.id === entry.id ? { ...item, enabled: enabled.checked } : item) }); label.append(enabled, 'Enabled'); actions.append(label);
    const arrows = document.createElement('div');
    for (const direction of [-1, 1]) { const button = document.createElement('button'); button.textContent = direction < 0 ? '‹' : '›'; button.title = `${direction < 0 ? 'Earlier' : 'Later'} in rotation`; button.disabled = index + direction < 0 || index + direction >= s.settings.scenes.length; button.onclick = () => { const scenes = [...state.settings.scenes]; [scenes[index], scenes[index + direction]] = [scenes[index + direction], scenes[index]]; configure({ scenes }); }; arrows.append(button); }
    actions.append(arrows); content.append(number, title, actions); card.append(art, content); $('scene-list').append(card);
  });
}
function option(select, value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; select.append(o); }
function render(s) {
  state = s; sceneList(s);
  const ds = JSON.stringify([s.camera.devices, s.displays]);
  if (ds !== deviceSignature) { deviceSignature = ds; $('camera').replaceChildren(); option($('camera'), '', 'Default camera'); for (const d of s.camera.devices || []) option($('camera'), d.id, d.label); if (s.settings.cameraId && !(s.camera.devices || []).some(d => d.id === s.settings.cameraId)) option($('camera'), s.settings.cameraId, 'Selected camera · disconnected'); $('display').replaceChildren(); option($('display'), '', 'Auto · first external display'); for (const d of s.displays) option($('display'), d.id, `${d.label} · ${d.width} × ${d.height}${d.primary ? ' · primary' : ''}`); }
  for (const [id, key] of [['duration','duration'],['camera','cameraId'],['display','displayId'],['quality','quality'],['robot-minutes','robotMinutes'],['robot-cap','robotSessionCap']]) if (document.activeElement !== $(id)) $(id).value = s.settings[key];
  for (const [id, key] of [['mirror','mirror'],['auto-fullscreen','fullscreen'],['demo','demo'],['cloud-enabled','robotEnabled']]) $(id).checked = s.settings[key];
  if (document.activeElement !== $('intensity')) $('intensity').value = Math.round(s.settings.intensity * 100);
  $('intensity-value').textContent = `${Math.round(s.settings.intensity * 100)}%`;
  const sceneIndex = s.scenes.findIndex(x => x.id === s.active), scene = s.scenes[sceneIndex];
  $('active-name').textContent = scene?.name || 'Waiting for an available scene';
  $('scene-caption').textContent = scene ? `${String(sceneIndex + 1).padStart(2, '0')} / COLLECTIVE IMAGINATION` : 'A MOMENT OF POSSIBILITY';
  $('scene-title').textContent = scene?.name || 'The world is still dreaming.';
  $('remaining').textContent = Math.ceil(s.remaining / 1000); $('progress').style.width = `${100 - s.remaining / (s.settings.duration * 10)}%`;
  $('pause').textContent = s.paused ? '▶  Resume rotation' : 'Ⅱ  Pause rotation'; $('rotation-label').textContent = s.paused ? 'Rotation paused' : 'Automatic rotation';
  $('fps').textContent = s.rendering.fps || '—'; $('camera-health').textContent = s.camera.state; $('detector-health').textContent = s.camera.detector === 'ready' ? `${s.camera.boxes} · ${s.camera.detectorMs} ms` : s.camera.detector;
  $('quality-health').textContent = ['720p · reduced','900p · balanced','1080p · high'][s.rendering.quality || 0]; $('cloud-health').textContent = s.cloud.ready ? 'Live' : `Skipped · ${s.cloud.state}`;
  $('health-note').textContent = s.rendering.failure || s.camera.message; $('camera-pill').textContent = s.camera.state === 'demo' ? 'SYNTHETIC CROWD' : `CAMERA ${s.camera.state.toUpperCase()}`;
  $('key-status').textContent = s.cloud.configured ? 'Key configured' : 'Not configured'; $('key-path').textContent = `Stored privately: ${s.keyPath}`;
  $('cloud-note').textContent = `${s.cloud.message}${s.cloud.code ? ` [${s.cloud.code} · ${s.cloud.phase || 'image check'}]` : ''} ${s.cloud.blockReason && s.cloud.blockReason !== s.cloud.message ? s.cloud.blockReason : ''} · ${s.cloud.count}/${s.cloud.cap} connection attempts this session. Maximum 12/hour. No automatic retries.`;
  $('generate-robot').disabled = !s.cloud.canGenerate && !s.cloud.canRetry && !s.cloud.streaming;
  $('generate-robot').textContent = s.cloud.closing ? 'Closing connection…' : s.cloud.streaming ? `Stop live connection · ${s.cloud.secondsLeft}s left` : s.cloud.code === 'SESSION_BUSY' || s.cloud.canRetry ? 'Retry live connection' : 'Start live robot scene';
  document.querySelector('.privacy-pill').textContent = s.cloud.streaming ? '● Live camera → Lucy / Decart' : '● Local processing';
  $('robot-availability').textContent = s.cloud.display;
  const robotCard = document.querySelector('.scene-card[data-id=robots]');
  if (robotCard) { robotCard.querySelector('.scene-art').disabled = (!s.cloud.ready && !s.cloud.canGenerate && !s.cloud.canRetry) || !s.settings.scenes.find(x => x.id === 'robots').enabled; robotCard.querySelector('.scene-number').textContent = s.cloud.ready ? 'LIVE · LUCY 2.5' : s.cloud.streaming ? 'CONNECTING LIVE VIDEO' : 'LUCY 2.5 · LIVE VIDEO'; }
  $('log-lines').textContent = s.logs.join('\n');
  for (const card of document.querySelectorAll('.scene-card')) { card.classList.toggle('active', card.dataset.id === s.active); card.classList.toggle('disabled', !s.settings.scenes.find(x => x.id === card.dataset.id).enabled); }
}
api.onState(render); render(state);
for (const [id, name] of [['generate-robot','generate-robot'],['output','output'],['pause','pause'],['next','next'],['fullscreen','fullscreen'],['reconnect','reconnect'],['logs','logs'],['quit','quit']]) $(id).onclick = () => api.command(name === 'generate-robot' ? (state.cloud.streaming ? 'stop-robot' : state.cloud.canRetry ? 'retry-robot' : name) : name);
for (const [id, key] of [['duration','duration'],['camera','cameraId'],['display','displayId'],['quality','quality'],['robot-minutes','robotMinutes'],['robot-cap','robotSessionCap']]) $(id).onchange = () => configure({ [key]: $(id).value });
for (const [id, key] of [['mirror','mirror'],['auto-fullscreen','fullscreen'],['demo','demo'],['cloud-enabled','robotEnabled']]) $(id).onchange = () => configure({ [key]: $(id).checked });
$('intensity').oninput = () => { $('intensity-value').textContent = `${$('intensity').value}%`; }; $('intensity').onchange = () => configure({ intensity: Number($('intensity').value) / 100 });
$('save-key').onclick = async () => { try { await api.saveKey($('fal-key').value); $('fal-key').value = ''; $('notice').textContent = 'API key saved privately.'; } catch { $('notice').textContent = 'Could not save key. Check its format and the file permissions.'; } };
let previewBusy = false;
setInterval(async () => { if (previewBusy || document.hidden) return; previewBusy = true; try { const image = await api.preview(); $('preview').style.display = image ? 'block' : 'none'; $('no-preview').style.display = image ? 'none' : 'block'; if (image) $('preview').src = image; else $('preview').removeAttribute('src'); } finally { previewBusy = false; } }, 1000);
