---
name: live2d-add-model
description: Import new Live2D Cubism model folders into this repository. Use when Codex needs to copy a model from an external folder, normalize its files to the repository naming convention, add a per-model config JSON, regenerate live2d/models/manifest.json, and validate that the widget can discover the model.
---

# Live2D Add Model

## Naming Contract

Every model directory under `live2d/models/` should follow this convention:

```text
live2d/models/<Name>/
  <Name>.model3.json
  <Name>.moc3
  <Name>.physics3.json        optional
  <Name>.cdi3.json            optional
  <Name>.vtube.json           optional
  <Name>.config.json
  <Name>.<resolution>/texture_00.png
```

Use a stable ASCII folder name when the source folder or files contain spaces, punctuation, or non-ASCII names that may be awkward in URLs. Keep expression and motion files in their existing subfolders unless references require cleanup.

## Import Workflow

1. Inspect the source folder and identify its `.model3.json`.
2. Copy the source folder into `live2d/models/<Name>/`.
3. Rename the primary model files to match `<Name>`:
   - `.model3.json`
   - `.moc3`
   - `.physics3.json`
   - `.cdi3.json`
   - `.vtube.json`
   - texture directory
4. Update `FileReferences` inside `<Name>.model3.json` so `Moc`, `Textures`, `Physics`, and `DisplayInfo` point to the renamed files.
5. Create `<Name>.config.json`.
6. Run `npm run generate-model-manifest`.

## Config Guidance

Create a conservative config first:

```json
{
  "welcome": "<Name> is ready.",
  "touchList": [
    {
      "text": "<Name> says hello."
    }
  ]
}
```

Only add `motion` values after checking the model's `.model3.json` `FileReferences.Motions` groups. Omit motion actions if motions are missing, stored outside the model3 references, or use unclear group names.

Use:

- `parameters` for default Live2D parameter switches, such as model-provided toggles.
- `hideDrawables` for ArtMesh IDs that must remain invisible every frame.
- `initMotion` for an initial motion group.
- `hideParts` for part IDs confirmed from the model's part list.
- `scaleWidth` when the canvas needs extra width for a model.
- `from` and `to` for reversible part opacity changes.

## Validation

After importing:

1. Run `npm run generate-model-manifest`.
2. Check `live2d/models/manifest.json` includes the new model.
3. Parse every changed `.model3.json` as JSON.
4. Confirm every file path in `FileReferences` exists relative to the model folder.
5. Run `node --check live2d/live2d-core.js`.
6. Serve `live2d/index.html` over HTTP and switch through models when browser verification is requested or practical.
