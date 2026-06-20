# Live2D Widget

Static Live2D Cubism 4 widget assets for CDN or local website usage.

## Features

- Load with one script tag.
- Auto-load widget CSS and Cubism/Pixi dependencies from this directory.
- Discover models from `models/manifest.json`.
- Keep model-specific messages, motions, hidden parts, scaling, and parameter presets in each model folder.
- Switch between all registered models from the widget UI.

## Quick Start

Use the hosted script:

```html
<script src="https://cdn.bughero.net/d/dev/live2d/live2d-core.js"></script>
```

Or use the local script from this repository:

```html
<script src="./live2d-core.js"></script>
```

Serve the files over HTTP. Direct `file://` loading is not recommended because the widget fetches JSON files.

## Choose The Initial Model

Choose the first model without editing `live2d-core.js`:

```html
<script src="./live2d-core.js" data-model="YouXiaoMiao"></script>
```

Equivalent options:

```html
<script src="./live2d-core.js" data-live2d-model="Ava"></script>
```

```html
<script>
  window.Live2DWidgetConfig = { model: "Green" };
</script>
<script src="./live2d-core.js"></script>
```

URL query parameters are also supported:

```text
?live2dModel=YouXiaoMiao
?live2d-model=YouXiaoMiao
?model=YouXiaoMiao
```

The model name must match a `name` in `models/manifest.json`.

## Model Layout

Model folders use this convention:

```text
models/<Name>/
  <Name>.model3.json
  <Name>.moc3
  <Name>.physics3.json
  <Name>.cdi3.json
  <Name>.config.json
  <Name>.<resolution>/texture_00.png
```

After adding or renaming a model, regenerate the manifest:

```bash
npm run generate-model-manifest
```

## Model Config

Each model can define runtime behavior in `<Name>.config.json`:

```json
{
  "welcome": "Model is ready.",
  "parameters": {
    "Param85": 1
  },
  "hideDrawables": ["ArtMesh84"],
  "initMotion": "Idle",
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

Config fields:

- `welcome`: message shown after switching to the model.
- `parameters`: Live2D parameter values kept active every frame.
- `hideDrawables`: drawable ArtMesh IDs whose opacity should be forced to `0` every frame.
- `initMotion`: motion group played after the model loads.
- `hideParts`: part IDs whose opacity should be forced to `0` on load.
- `scaleWidth`: optional canvas width multiplier.
- `touchList`: random actions used when the model is clicked.

`YouXiaoMiao` uses `parameters.Param85 = 1` plus `hideDrawables` for the remaining watermark ArtMeshes.

## CDN Refresh

Changes under `live2d/**` trigger `.github/workflows/cdn-refresh.yml` on `main` or `master`.
The workflow runs `scripts/refresh-cdn.js` and requires these GitHub secrets:

- `TENCENT_SECRET_ID`
- `TENCENT_SECRET_KEY`
- `TEO_ZONE_ID`
- `TEO_DOMAIN`
