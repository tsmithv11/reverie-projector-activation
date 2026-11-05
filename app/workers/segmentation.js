import { FilesetResolver, PoseLandmarker, ObjectDetector, ImageSegmenter } from '@mediapipe/tasks-vision';
import { PersonTracker, MAX_PEOPLE } from '../core/person-tracker.js';
import { composePersonMasks } from '../core/person-masks.js';
import { describePose, selectPersonCandidates, hasFullBodyEvidence } from '../core/person-candidates.js';
import { portraitCandidates, mergePortraitCandidates } from '../core/portrait-recovery.js';

let model, personDetector, portraitModel;
const tracker = new PersonTracker();
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const fileset = await FilesetResolver.forVisionTasks('../wasm');
      model = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '../models/pose_landmarker_full.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: MAX_PEOPLE, outputSegmentationMasks: true,
        minPoseDetectionConfidence: .45, minPosePresenceConfidence: .5, minTrackingConfidence: .5
      });
      personDetector = await ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '../models/efficientdet_lite0.tflite', delegate: 'CPU' },
        runningMode: 'VIDEO', scoreThreshold: .5, maxResults: MAX_PEOPLE, categoryAllowlist: ['person']
      });
      portraitModel = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '../models/selfie_segmenter.tflite', delegate: 'CPU' },
        runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false
      });
      self.postMessage({ ready: true }); return;
    }
    const start = performance.now(), { pixels, width, height } = data;
    const input = new ImageData(pixels, width, height);
    let candidates = [];
    // The callback owns masks only for its duration. Copy/process them here;
    // MediaPipe releases its native masks as soon as this callback returns.
    model.detectForVideo(input, data.time, result => {
      for (let i = 0; i < Math.min(MAX_PEOPLE, result.segmentationMasks?.length || 0); i++) {
        const source = result.segmentationMasks[i];
        if (source.width !== width || source.height !== height) throw Error('Unexpected mask size');
        const mask = source.getAsFloat32Array();
        const landmarks = result.landmarks[i];
        const description = describePose(mask, pixels, width, height, landmarks);
        if (description) candidates.push({ mask: mask.slice(), landmarks, description });
      }
    });
    if (!candidates.some(candidate => hasFullBodyEvidence(candidate, width, height))) {
      const boxes = personDetector.detectForVideo(input, data.time).detections.map(d => ({
        x: d.boundingBox.originX / width, y: d.boundingBox.originY / height,
        w: d.boundingBox.width / width, h: d.boundingBox.height / height, score: d.categories[0].score
      }));
      if (boxes.some(b => b.w * b.h >= .04 && b.h >= .25)) {
        portraitModel.segmentForVideo(input, data.time, result => {
          // The binary Selfie Segmenter has one foreground confidence output.
          const source = result.confidenceMasks[0];
          if (source.width !== width || source.height !== height) throw Error('Unexpected portrait mask size');
          candidates = mergePortraitCandidates(candidates, portraitCandidates(source.getAsFloat32Array(), pixels, width, height, boxes));
        });
      }
    }
    const selected = selectPersonCandidates(candidates, width, height);
    const tracks = tracker.update(selected.map(p => p.description), data.time);
    const masks = [], confirmed = [];
    tracks.forEach((track, i) => {
      if (track.confirmed) { masks.push(selected[i].mask); confirmed.push(track); }
    });
    const output = composePersonMasks(masks, confirmed, width, height);
    self.postMessage({ ...output, pixels, width, height, at: data.at, ms: performance.now() - start }, [pixels.buffer, output.fill.buffer, ...output.instances.map(p => p.contour.buffer)]);
  } catch { self.postMessage({ error: true }); }
};
