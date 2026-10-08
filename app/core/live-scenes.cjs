// Both effects share one bounded Lucy connection and the same provider fallback.
const LIVE_SCENE_IDS = ['robots', 'cartoon'];
const CARTOON_PROMPT = 'Transform the entire scene into a 2D cartoon with clean outlines, simple cel shading, and bright natural colors. Preserve the people, room, objects, composition, and movement.';
const isLiveScene = id => LIVE_SCENE_IDS.includes(id);
const liveSceneEnabled = (settings, id) => isLiveScene(id) && settings.scenes.some(scene => scene.id === id && scene.enabled);
function nextLiveScene(scheduler, now) {
  return scheduler.enabled(true).filter(isLiveScene).reduce((next, id) =>
    scheduler.until(id, now, true) < scheduler.until(next, now, true) ? id : next, null);
}
module.exports = { LIVE_SCENE_IDS, CARTOON_PROMPT, isLiveScene, liveSceneEnabled, nextLiveScene };
