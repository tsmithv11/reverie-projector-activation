// Scene identity controls the model, token scope and operator label together.
const CARTOON_PROMPT = 'Studio Ghibli watercolor style with gentle hand-painted colors and clean, restrained linework. Preserve each person\'s identity, facial proportions, eye and mouth positions, expression, and natural anatomy. Keep faces consistent from frame to frame as people move. Preserve the number of people, their positions, and the original composition. Apply the style mainly through color, shading, and texture.';
const LIVE_SCENES = {
  robots: { model: 'lucy-latest', label: 'Lucy Latest', selfAnchor: false, prompt: 'Transform each visible person into a realistic ceramic and brushed-metal humanoid robot. Only transform the people and nothing one else.' },
  // Keep the existing cartoon ID so saved playlist order and toggles survive.
  cartoon: { model: 'lucy-restyle-2', label: 'Lucy Restyle 2', prompt: CARTOON_PROMPT },
  // Keep the saved ghibli25 ID when upgrading the model; Restyle 2 stays separate.
  ghibli25: { model: 'lucy-latest', label: 'Lucy Latest', selfAnchor: false, enhance: true, prompt: 'Restyle the entire scene as hand-drawn Japanese animation with watercolor backgrounds, soft painted colors, and clean character linework. Preserve each person\'s facial proportions, expression, pose, and movement.' }
};
const LIVE_SCENE_IDS = Object.keys(LIVE_SCENES);
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
