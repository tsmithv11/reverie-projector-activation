const SCENES = [
  { id: 'heat', name: 'Audience / field study', color: '#f18c52' },
  { id: 'robots', name: 'Machine dreaming', color: '#a5c7d6' },
  { id: 'monsters', name: 'Small wonderful things', color: '#b4b3f6' },
  { id: 'lines', name: 'An outline of us', color: '#f3eedf' },
  { id: 'garden', name: 'A garden of possibility', color: '#ccdcb0' },
  { id: 'cartoon', name: 'Life in cartoon', color: '#ffa0d0' }
];
const defaults = { cameraId: '', displayId: '', duration: 60, quality: 'auto', intensity: 0.7, mirror: true, demo: false, fullscreen: true, robotEnabled: false, scenes: SCENES.map(s => ({ id: s.id, enabled: true })) };
function sanitize(input = {}) {
  const num = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
  const list = [], seen = new Set();
  for (const s of Array.isArray(input.scenes) ? input.scenes : defaults.scenes) if (SCENES.some(x => x.id === s?.id) && !seen.has(s.id)) { list.push({ id: s.id, enabled: s.enabled !== false }); seen.add(s.id); }
  for (const s of SCENES) if (!seen.has(s.id)) list.push({ id: s.id, enabled: true });
  if (!list.some(s => s.enabled)) list[0].enabled = true;
  return { ...defaults, scenes: list, cameraId: String(input.cameraId ?? '').slice(0, 256), displayId: String(input.displayId ?? '').slice(0, 30), duration: num(input.duration, 10, 60, 60), intensity: num(input.intensity, 0.1, 1, .7), quality: ['auto', 'high', 'balanced', 'low'].includes(input.quality) ? input.quality : 'auto', mirror: input.mirror !== false, demo: input.demo === true, fullscreen: input.fullscreen !== false, robotEnabled: input.robotEnabled === true };
}
module.exports = { SCENES, defaults, sanitize };
