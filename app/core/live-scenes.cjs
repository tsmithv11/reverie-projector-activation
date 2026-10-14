// Scene identity controls the model, token scope and operator label together.
const LIVE_SCENE_IDS = ['robots', 'cartoon'];
const CARTOON_PROMPT = 'Transform the entire scene into a 2D cartoon with clean outlines, simple cel shading, and bright natural colors. Preserve the people, room, objects, composition, and movement.';
const LIVE_SCENES = {
  robots: { model: 'lucy-2.5', label: 'Lucy 2.5', prompt: 'Transform each visible person into a realistic ceramic and brushed-metal humanoid robot. Only transform the people and nothing one else.' },
  cartoon: { model: 'lucy-restyle-2', label: 'Lucy Restyle 2', prompt: CARTOON_PROMPT }
};
function liveScene(id) {
  if (!LIVE_SCENE_IDS.includes(id)) throw Error('Unknown live scene');
  return LIVE_SCENES[id];
}
const isLiveScene = id => LIVE_SCENE_IDS.includes(id);
const liveSceneEnabled = (settings, id) => isLiveScene(id) && settings.scenes.some(scene => scene.id === id && scene.enabled);
// Rotation follows playlist order even while the next live scene is connecting.
function nextPlaylistScene(scheduler, lucyEnabled) {
  const ids = scheduler.enabled(true).filter(id => lucyEnabled || !isLiveScene(id));
  return ids[(ids.indexOf(scheduler.active) + 1) % ids.length] || null;
}
module.exports = { LIVE_SCENE_IDS, CARTOON_PROMPT, liveScene, isLiveScene, liveSceneEnabled, nextPlaylistScene };
