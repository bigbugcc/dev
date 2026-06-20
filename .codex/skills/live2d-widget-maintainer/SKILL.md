---
name: live2d-widget-maintainer
description: Maintain and extend this repository's static Live2D Cubism 4 widget runtime. Use when Codex needs to change live2d-core.js, model manifest loading, per-model config JSON, widget CSS/UI behavior, README usage docs, or the Tencent Cloud TEO CDN refresh workflow.
---

# Live2D Widget Maintainer

## Project Shape

Treat this as a static CDN-friendly Live2D widget. Do not introduce a bundler or server runtime unless the user explicitly asks.

Key files:

- `live2d/live2d-core.js`: browser runtime, dependency loading, manifest loading, model switching, UI, interactions.
- `live2d/libs/live2d.css`: `.pio-*` widget styles.
- `live2d/models/manifest.json`: generated model registry consumed by the runtime.
- `live2d/models/<Name>/<Name>.model3.json`: normalized model entry file.
- `live2d/models/<Name>/<Name>.config.json`: per-model widget behavior, messages, motions, hidden parts, scaling.
- `scripts/generate-model-manifest.js`: scans `live2d/models/*` and writes `manifest.json`.
- `.github/workflows/cdn-refresh.yml` and `scripts/refresh-cdn.js`: CDN invalidation path.

## Runtime Rules

Preserve the one-script integration model: external pages should only need to include `live2d-core.js`.

`live2d-core.js` must:

1. Resolve assets from `BASE_PATH`.
2. Load CSS and JS dependencies before creating `Live2DWidget`.
3. Fetch `models/manifest.json`.
4. Fetch each selected model's `<Name>.config.json` if present.
5. Load model files from `models/<Name>/<Name>.model3.json`.
6. Keep `window.Live2DWidget` and auto-create `window.live2d`.

Do not hard-code the model list in `live2d-core.js`. Update the model directories and rerun `npm run generate-model-manifest`.

External pages may choose the initial model without editing source code:

```html
<script src="https://example.com/live2d/live2d-core.js" data-model="YouXiaoMiao"></script>
```

Also support `data-live2d-model`, URL query parameters `?live2dModel=<Name>` / `?live2d-model=<Name>` / `?model=<Name>`, and `window.Live2DWidgetConfig = { model: "<Name>" }` before loading the script.

## Model Config JSON

Use `<Name>.config.json` for runtime behavior that does not belong in core code:

```json
{
  "welcome": "Model is ready.",
  "initMotion": "Idle",
  "parameters": {
    "Param85": 1
  },
  "hideDrawables": ["ArtMesh84"],
  "hideParts": ["Part15"],
  "scaleWidth": 1.2,
  "touchList": [
    {
      "text": "Hello.",
      "motion": "Idle"
    }
  ]
}
```

Rules:

- Use motion group names defined in the model's `.model3.json`.
- Omit `motion` when a model has no usable `Motions` entry.
- Use `from` and `to` only for part opacity transitions already supported by `playAction`.
- Use `parameters` for default Live2D parameter switches.
- Use `hideDrawables` for ArtMesh IDs that must remain invisible every frame.
- Keep model-specific messages and part IDs out of `live2d-core.js`.

## Validation

After edits:

1. Run `npm run generate-model-manifest`.
2. Run `node --check live2d/live2d-core.js`.
3. Run `node --check scripts/generate-model-manifest.js` if the scanner changed.
4. Confirm `live2d/models/manifest.json` contains every intended model.
5. Confirm each manifest entry points to files that exist.

For browser verification, serve the repository over HTTP and open `live2d/index.html`; do not rely on direct `file://` loading because `fetch()` may be blocked.
