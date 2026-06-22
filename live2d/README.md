# Live2D Widget

Static Live2D Cubism 4 widget assets for CDN or local website usage.

## Features

- Load with one script tag.
- Auto-load widget CSS and Cubism/Pixi dependencies from this directory.
- Discover models from `models/manifest.json`.
- Keep model-specific messages, motions, hidden parts, scaling, and parameter presets in each model folder.
- Localize widget and character interaction messages with automatic locale detection and fallback.
- Route configured model hit areas to location-specific motions and dialog.
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

## Language

The widget chooses its language in this order: URL query, script attributes, global config,
the page's `<html lang>`, then the browser language. English is the default fallback.

```html
<script src="./live2d-core.js" data-lang="zh-CN"></script>
```

Equivalent URL and JavaScript options:

```text
?live2dLang=zh-CN
?live2d-lang=en
?lang=zh-CN
```

```html
<script>
  window.Live2DWidgetConfig = { locale: "zh-CN", fallbackLocale: "en" };
</script>
<script src="./live2d-core.js"></script>
```

All visible widget and character text lives in `locales/interactions.json`. The file is split into
`ui`, `context`, and `models` under each locale. Model configs reference that file with text keys:

```json
{
  "welcomeKey": "models.Ava.welcome",
  "touchList": [
    {
      "textKey": "models.Ava.touch.rightHand",
      "motion": "Idle"
    }
  ]
}
```

Language file values are arrays, and the widget avoids repeating any of the last five displayed
messages. Regional locales fall back to the matching base language (for example, `zh-TW` can use
`zh-CN`), then to `fallbackLocale`, English, and finally the default model text. Existing model
configs using plain `welcome` and `text` values remain supported.

The language file path can be overridden without editing the core:

```html
<script>
  window.Live2DWidgetConfig = {
    languageFile: "locales/interactions.json",
    contextualTouchChance: 0.3
  };
</script>
<script src="./live2d-core.js"></script>
```

Context messages use only the local clock, browser language, and IANA time zone. They cover time
of day, weekday, northern/southern seasons, broad geographic regions, fixed international dates,
and rotating geography, culture, literature, history, astronomy, and everyday-life topics. No
location permission or external API is used. Context appears for welcomes and replaces roughly
30% of character click messages by default.

The custom runtime is deliberately split into three layers: `live2d-core.js` owns widget assembly,
UI, model lifecycle, and actions; `libs/live2d-i18n.js` owns locale fallback and message history;
`libs/live2d-context.js` owns local time, season, and broad time-zone context. Vendor libraries
remain unchanged.

To add a language, copy one locale object in `locales/interactions.json`, translate every key while
keeping the same structure, and select it with `locale`, `data-lang`, or a supported URL parameter.
If the language file cannot be loaded, the model and its motions continue to work without dialog.

For a quick regression check, serve the directory and open `tests/interaction-tests.html`. A
successful run displays `TESTS_OK 23`; it covers locale and empty-value fallback, time boundaries,
both hemispheres, broad region mapping, default model text, deduplication, missing language data,
hit-area routing, and canvas coordinate conversion.

`tests/hit-area-tests.html?model=Diana` and `?model=Ava` load the real models, find every configured
hit area, and invoke the installed canvas click handler. They should report `TESTS_OK Diana 6 hit
areas` and `TESTS_OK Ava 3 hit areas` respectively.

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
  "welcomeKey": "models.Ava.welcome",
  "parameters": {
    "Param85": 1
  },
  "hideDrawables": ["ArtMesh84"],
  "initMotion": "Idle",
  "hideParts": ["Part15"],
  "scaleWidth": 1.2,
  "touchList": [
    {
      "textKey": "models.Ava.touch.rightHand",
      "hitArea": "右手",
      "motion": "Idle"
    }
  ]
}
```

Config fields:

- `welcomeKey`: language-file path shown after switching to the model.
- `parameters`: Live2D parameter values kept active every frame.
- `hideDrawables`: drawable ArtMesh IDs whose opacity should be forced to `0` every frame.
- `initMotion`: motion group played after the model loads.
- `hideParts`: part IDs whose opacity should be forced to `0` on load.
- `scaleWidth`: optional canvas width multiplier.
- `touchList`: random actions used when the model is clicked; `textKey` points to its dialog pool.
- `hitArea`: optional `HitAreas[].Name` from the model file; matching locations take priority.
  Models or actions without hit areas retain random fallback behavior, while unmatched locations
  do nothing when every action is location-specific.

`YouXiaoMiao` uses `parameters.Param85 = 1` plus `hideDrawables` for the remaining watermark ArtMeshes.

## Recommended Next Optimizations

1. Add a model-switch load token and destroy superseded Live2D instances. Rapid switching can
   otherwise let an older asynchronous load win and retained models may keep GPU resources alive.
2. Add a small validation script to CI for manifest entries, language keys, motion groups, and hit
   area names. The browser tests cover behavior, while schema checks would catch content mistakes
   before assets reach the CDN.
3. Provide lower-resolution texture variants for mobile and constrained devices. Several current
   models use 4096 or 8192 pixel textures, which dominate download size and GPU memory.
4. Wrap private Cubism fields such as `_partIds`, `_partOpacities`, and `_drawableIds` behind one
   compatibility adapter before upgrading the renderer libraries.
5. Replace toolbar spans with accessible buttons, including labels, keyboard focus, and a
   reduced-motion option.
6. Add load/error lifecycle events and optional lightweight timing metrics so sites embedding the
   widget can observe model, texture, and language-file failures.

## CDN Refresh

Changes under `live2d/**` trigger `.github/workflows/cdn-refresh.yml` on `main` or `master`.
The workflow runs `scripts/refresh-cdn.js` and requires these GitHub secrets:

- `TENCENT_SECRET_ID`
- `TENCENT_SECRET_KEY`
- `TEO_ZONE_ID`
- `TEO_DOMAIN`
