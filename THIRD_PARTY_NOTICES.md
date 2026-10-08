# Third-party components

Runtime dependency license notices remain included in the packaged dependency tree and bundled assets. The package lock pins versions.

- Electron / Chromium: MIT plus Chromium and its included third-party licenses; Electron packages include LICENSE and LICENSES.chromium.html.
- MediaPipe Tasks Vision 0.10.32 and EfficientDet-Lite0: Google, Apache-2.0. Model source and SHA-256 are in `assets/model-manifest.json`. The model was trained on COCO; person labels are not identities, and scores are not calibrated confidence guarantees.
- Decart JavaScript SDK 0.2.5 and LiveKit client: MIT. Decart usage is governed separately by its terms and billing. Provider credentials are not included.
- FAL JavaScript client 1.10.1: MIT. FAL/Decart usage is governed separately by the provider's terms and billing. Provider credentials are not included.
- dotenv 17.2.3: BSD-2-Clause.

Reference direction was supplied by the user. The application draws its local visual elements in Canvas; it does not ship the supplied reference screenshots as textures or transmit them to any provider. Brand colors were sampled from the public Reverie website; no remote brand assets, fonts, analytics or webpage code are loaded at runtime.

The garden's flower and butterfly atlas is original artwork generated with the built-in image generation tool on October 8, 2026, and bundled locally. Its prompt and provenance are retained in `assets/scenes/garden/provenance.json`. The visual direction draws on immersive botanical installations; no teamLab images or other installation artwork are included. All garden animation runs locally.
