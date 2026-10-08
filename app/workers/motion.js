import { MotionField } from '../core/motion.js';
let field;
self.onmessage = ({ data }) => {
  if (!field || field.width !== data.width || field.height !== data.height) field = new MotionField(data.width, data.height);
  const result = field.analyze(data.pixels, data.boxes, data.dt);
  self.postMessage(result, [result.edges.buffer, result.energy.buffer]);
};
