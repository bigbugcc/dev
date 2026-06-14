const fs = require("fs");
const path = require("path");

const modelsRoot = path.join(__dirname, "..", "live2d", "models");
const manifestPath = path.join(modelsRoot, "manifest.json");

function hasFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

const models = fs
  .readdirSync(modelsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const name = entry.name;
    const modelFile = `${name}.model3.json`;
    const configFile = `${name}.config.json`;
    const modelPath = path.join(modelsRoot, name, modelFile);
    const configPath = path.join(modelsRoot, name, configFile);

    if (!hasFile(modelPath)) {
      return null;
    }

    return {
      name,
      model: `${name}/${modelFile}`,
      config: hasFile(configPath) ? `${name}/${configFile}` : null,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(manifestPath, `${JSON.stringify({ models }, null, 2)}\n`, "utf8");

console.log(`Wrote ${models.length} models to ${path.relative(process.cwd(), manifestPath)}`);
