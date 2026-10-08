// Both effects share one Lucy connection and the same provider fallback.
const LIVE_SCENE_IDS = ['robots', 'cartoon'];
const CARTOON_PROMPT = 'Transform the entire scene into a 2D cartoon with clean outlines, simple cel shading, and bright natural colors. Preserve the people, room, objects, composition, and movement.';
const isLiveScene = id => LIVE_SCENE_IDS.includes(id);
const liveSceneEnabled = (settings, id) => isLiveScene(id) && settings.scenes.some(scene => scene.id === id && scene.enabled);
// Rotation follows playlist order even while the next live scene is connecting.
function nextPlaylistScene(scheduler, lucyEnabled) {
  const ids = scheduler.enabled(true).filter(id => lucyEnabled || !isLiveScene(id));
  return ids[(ids.indexOf(scheduler.active) + 1) % ids.length] || null;
}
module.exports = { LIVE_SCENE_IDS, CARTOON_PROMPT, isLiveScene, liveSceneEnabled, nextPlaylistScene };
