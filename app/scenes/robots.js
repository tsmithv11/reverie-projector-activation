import { Scene, camera } from './base.js';

export default class Robots extends Scene {
  render(ctx, { w, h, robotVideo }) { if (robotVideo) camera(ctx, robotVideo, w, h); }
}
