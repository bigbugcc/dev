/**
 * Live2D widget core.
 */

(function() {
  "use strict";

  const SCRIPT_ELEMENT = (function() {
    if (document.currentScript) return document.currentScript;

    const scripts = document.getElementsByTagName("script");
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src;
      if (src && src.indexOf("live2d-core.js") !== -1) {
        return scripts[i];
      }
    }

    return null;
  })();

  const BASE_PATH = (function() {
    if (SCRIPT_ELEMENT && SCRIPT_ELEMENT.src) {
      const src = SCRIPT_ELEMENT.src;
      return src.substring(0, src.lastIndexOf("/") + 1);
    }

    const scripts = document.getElementsByTagName("script");
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src;
      if (src && src.indexOf("live2d-core.js") !== -1) {
        return src.substring(0, src.lastIndexOf("/") + 1);
      }
    }

    return window.location.href.substring(0, window.location.href.lastIndexOf("/") + 1);
  })();

  const RESOURCES = {
    css: ["libs/live2d.css"],
    js: [
      "libs/live2d-i18n.js",
      "libs/live2d-context.js",
      "libs/live2dcubismcore.min.js",
      "libs/pixi.min.js",
      "libs/cubism4.min.js",
      "libs/TweenLite.js",
    ],
  };

  const CONFIG = {
    alignment: "left",
    hidden: true,
    tips: true,
    manifest: "models/manifest.json",
    languageFile: "locales/interactions.json",
    model: "",
    locale: "",
    fallbackLocale: "en",
    contextualTouchChance: 0.3,
    models: [],
  };

  const DEFAULT_MODEL_CONFIG = {
    welcomeKey: "models.default.welcome",
    touchList: [{ textKey: "models.default.touch" }],
  };

  const MODEL_LOAD_RETRY_DELAY = 1500;

  function toUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return BASE_PATH + path.replace(/^\/+/, "");
  }

  function loadCSS(href) {
    const fullUrl = toUrl(href);
    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = fullUrl;
      link.onload = resolve;
      link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    const fullUrl = toUrl(src);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.src = fullUrl;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load JS: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function fetchJSON(path) {
    const response = await fetch(toUrl(path), { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Failed to load JSON: ${path}`);
    }
    return response.json();
  }

  function getBrowserLocales() {
    const locales = [];
    const add = (locale) => {
      const value = String(locale || "").trim();
      if (value && !locales.includes(value)) locales.push(value);
    };

    if (Array.isArray(navigator.languages)) navigator.languages.forEach(add);
    add(navigator.language);
    add(navigator.userLanguage);
    return locales.length > 0 ? locales : ["en"];
  }

  function readExternalConfig() {
    const query = new URLSearchParams(window.location.search);
    const cssElement = document.querySelector(
      "link[data-live2d-model], link[data-model], style[data-live2d-model], style[data-model]"
    );
    const scriptDataset = SCRIPT_ELEMENT ? SCRIPT_ELEMENT.dataset : {};
    const cssDataset = cssElement ? cssElement.dataset : {};
    const globalConfig = window.Live2DWidgetConfig || {};

    return {
      ...globalConfig,
      model:
        query.get("live2dModel") ||
        query.get("live2d-model") ||
        query.get("model") ||
        scriptDataset.live2dModel ||
        scriptDataset.model ||
        cssDataset.live2dModel ||
        cssDataset.model ||
        globalConfig.model ||
        "",
      locale:
        query.get("live2dLang") ||
        query.get("live2d-lang") ||
        query.get("lang") ||
        scriptDataset.lang ||
        scriptDataset.locale ||
        cssDataset.lang ||
        cssDataset.locale ||
        globalConfig.locale ||
        getBrowserLocales(),
    };
  }

  async function loadAllResources() {
    await Promise.all(RESOURCES.css.map(loadCSS));
    for (const js of RESOURCES.js) {
      await loadScript(js);
    }
  }

  const Utils = {
    rand: (arr) => arr[Math.floor(Math.random() * arr.length)],
    isMobile: () => window.innerWidth < 500 || /mobile|android|ios/i.test(navigator.userAgent),
    create: (tag, className) => {
      const el = document.createElement(tag);
      if (className) el.className = className;
      return el;
    },
    normalizeModelEntry: (entry) => {
      if (typeof entry === "string") {
        const parts = entry.split("/");
        const file = parts[parts.length - 1] || "";
        const name = file.replace(/\.model3\.json$/i, "") || entry;
        return { name, model: entry, config: null };
      }
      return entry;
    },
  };

  class Live2DWidget {
    constructor(config = {}) {
      this.config = { ...CONFIG, ...readExternalConfig(), ...config };
      const requestedLocales = Live2DModules.normalizeLocales(this.config.locale);
      this.config.locale = requestedLocales[0];
      this.config.locales = requestedLocales;
      const contextChance = Number(this.config.contextualTouchChance);
      this.config.contextualTouchChance = Number.isFinite(contextChance)
        ? Math.min(1, Math.max(0, contextChance))
        : CONFIG.contextualTouchChance;
      this.textManager = new Live2DModules.TextManager(
        requestedLocales,
        this.config.fallbackLocale
      );
      this.currentModelIndex = 0;
      this.model = null;
      this.modelConfig = DEFAULT_MODEL_CONFIG;
      this.persistentParameters = null;
      this.persistentDrawables = null;
      this.app = null;
      this.dialogTimer = null;
      this.elements = {};

      this.ready = this.init();
      this.ready.catch((err) => {
        console.error("[Live2D] Widget initialization failed:", err);
      });
    }

    async init() {
      if (this.config.hidden && Utils.isMobile()) {
        console.log("[Live2D] Hidden on mobile.");
        return;
      }

      await Promise.all([this.loadLanguageData(), this.loadModels()]);
      if (this.config.models.length === 0) {
        console.error("[Live2D] No models found.");
        return;
      }
      this.selectInitialModel();

      this.createContainer();
      this.createPixiApp();
      this.createUI();
      await this.loadModel(this.config.models[0]);

      if (localStorage.getItem("live2d_hidden") === "1") {
        this.hide();
      } else {
        this.showWelcome();
      }
    }

    async loadModels() {
      if (this.config.models.length > 0) {
        this.config.models = this.config.models.map(Utils.normalizeModelEntry);
        return;
      }

      const manifest = await fetchJSON(this.config.manifest);
      this.config.models = (manifest.models || []).map(Utils.normalizeModelEntry);
    }

    async loadLanguageData() {
      try {
        this.textManager.setData(await fetchJSON(this.config.languageFile));
      } catch (err) {
        this.textManager.setData(null);
        console.warn("[Live2D] Interaction language file load failed:", this.config.languageFile, err);
      }
    }

    selectInitialModel() {
      if (!this.config.model) return;

      const target = String(this.config.model).toLowerCase();
      const idx = this.config.models.findIndex((entry) => {
        const model = Utils.normalizeModelEntry(entry);
        return (
          String(model.name || "").toLowerCase() === target ||
          String(model.model || "").toLowerCase() === target ||
          String(model.model || "").toLowerCase().endsWith(`/${target}.model3.json`)
        );
      });

      if (idx !== -1) {
        const [entry] = this.config.models.splice(idx, 1);
        this.config.models.unshift(entry);
        this.currentModelIndex = 0;
      } else {
        console.warn("[Live2D] Configured model was not found:", this.config.model);
      }
    }

    async loadModelConfig(entry) {
      if (!entry.config) {
        return { ...DEFAULT_MODEL_CONFIG, name: entry.name };
      }

      try {
        const config = await fetchJSON(`models/${entry.config}`);
        return { ...DEFAULT_MODEL_CONFIG, ...config, name: entry.name };
      } catch (err) {
        console.warn("[Live2D] Model config load failed:", entry.config, err);
        return { ...DEFAULT_MODEL_CONFIG, name: entry.name };
      }
    }

    createContainer() {
      const container = Utils.create("div", `pio-container ${this.config.alignment}`);
      container.id = "pio-container";

      const action = Utils.create("div", "pio-action");
      const canvas = Utils.create("canvas");
      canvas.id = "pio";
      const dialog = Utils.create("div", "pio-dialog");
      const showBtn = Utils.create("div", "pio-show");

      container.append(action, canvas, dialog, showBtn);
      document.body.appendChild(container);

      this.elements = { container, action, canvas, dialog, showBtn };
      showBtn.onclick = () => this.show();
    }

    createPixiApp() {
      this.app = new PIXI.Application({
        view: this.elements.canvas,
        transparent: true,
        autoStart: true,
      });
      this.app.ticker.add(() => {
        if (this.persistentParameters) {
          this.setParameters(this.persistentParameters);
        }
        if (this.persistentDrawables) {
          this.hideDrawables(this.persistentDrawables);
        }
      });
    }

    createUI() {
      const buttons = [
        { name: "home", textKey: "ui.home", click: () => (location.href = "/") },
        { name: "skin", textKey: "ui.skinPrompt", click: () => this.nextModel() },
        { name: "info", click: () => {} },
        { name: "close", textKey: "ui.close", click: () => this.hide() },
      ];

      buttons.forEach((btn) => {
        if (btn.name === "skin" && this.config.models.length <= 1) return;

        const span = Utils.create("span", `pio-${btn.name}`);
        span.onclick = btn.click;
        if (btn.textKey) span.onmouseover = () => this.showMessageByKey(btn.textKey);
        this.elements.action.appendChild(span);
      });
    }

    createModel(modelUrl) {
      return new Promise((resolve, reject) => {
        let model;
        model = PIXI.live2d.Live2DModel.fromSync(modelUrl, {
          onLoad: () => resolve(model),
          onError: (err) => {
            try {
              model.destroy({ children: true });
            } catch (destroyError) {
              console.warn("[Live2D] Failed to clean up an incomplete model:", destroyError);
            }
            reject(err);
          },
        });
      });
    }

    async loadModel(entry, showSwitchMessage = false) {
      const modelEntry = Utils.normalizeModelEntry(entry);
      this.modelConfig = await this.loadModelConfig(modelEntry);

      if (this.app.stage.children.length > 0) {
        this.app.stage.removeChildren();
      }

      const modelUrl = toUrl(`models/${modelEntry.model}`);
      let model;

      try {
        model = await this.createModel(modelUrl);
      } catch (err) {
        console.warn(
          `[Live2D] Model load failed; retrying in ${MODEL_LOAD_RETRY_DELAY}ms:`,
          modelEntry.name,
          err
        );
        await new Promise((resolve) => setTimeout(resolve, MODEL_LOAD_RETRY_DELAY));
        model = await this.createModel(modelUrl);
      }

      this.model = model;
      this.app.stage.addChild(model);

      const scale = this.elements.canvas.height / model.height;
      model.scale.set(scale);
      this.elements.canvas.width = this.modelConfig.scaleWidth
        ? model.width * this.modelConfig.scaleWidth
        : model.width;
      this.elements.canvas.height = model.height;
      model.x = this.config.alignment === "left" ? 0 : this.elements.canvas.width - model.width;

      this.applyModelConfig(model, this.modelConfig);
      this.setupModelInteraction(model, this.modelConfig);

      if (showSwitchMessage) {
        this.showModelWelcome(modelEntry.name, "ui.skinReady");
      }
    }

    applyModelConfig(model, cfg) {
      this.elements.container.dataset.model = cfg.name;

      if (cfg.hideParts) {
        const coreModel = model.internalModel.coreModel;
        cfg.hideParts.forEach((partId) => {
          const idx = coreModel._partIds.indexOf(partId);
          if (idx !== -1) coreModel._partOpacities[idx] = 0;
        });
      }

      if (cfg.hideDrawables) {
        this.persistentDrawables = cfg.hideDrawables;
        this.hideDrawables(cfg.hideDrawables, model);
      } else {
        this.persistentDrawables = null;
      }

      if (cfg.parameters) {
        this.persistentParameters = cfg.parameters;
        this.setParameters(cfg.parameters, model);
      } else {
        this.persistentParameters = null;
      }

      if (cfg.initMotion) {
        this.playAction(cfg.initMotion, model);
      }
    }

    setupModelInteraction(model, cfg) {
      const touchList = cfg.touchList || DEFAULT_MODEL_CONFIG.touchList;

      this.elements.canvas.onclick = (event) => {
        const motionManager = model.internalModel.motionManager;
        if (motionManager.state.currentGroup && motionManager.state.currentGroup !== "Idle") return;

        const hitAreas = this.getHitAreas(event, model);
        const action = this.selectTouchAction(touchList, hitAreas);
        this.playAction(action, model);
      };
    }

    getHitAreas(event, model = this.model) {
      if (!event || !model || typeof model.hitTest !== "function") return [];

      const rect = this.elements.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return [];

      const x = (event.clientX - rect.left) * (this.elements.canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (this.elements.canvas.height / rect.height);
      return model.hitTest(x, y).sort((left, right) => {
        const getAreaSize = (name) => {
          const internal = model.internalModel;
          const hitArea = internal && internal.hitAreas && internal.hitAreas[name];
          if (!hitArea || typeof internal.getDrawableBounds !== "function") return Infinity;
          const bounds = internal.getDrawableBounds(hitArea.index);
          return bounds ? bounds.width * bounds.height : Infinity;
        };
        return getAreaSize(left) - getAreaSize(right);
      });
    }

    selectTouchAction(touchList, hitAreas = []) {
      if (!touchList || touchList.length === 0) return null;

      for (const hitArea of hitAreas) {
        const matched = touchList.filter((action) => {
          if (!action || !action.hitArea) return false;
          const targets = Array.isArray(action.hitArea) ? action.hitArea : [action.hitArea];
          return targets.includes(hitArea);
        });
        if (matched.length > 0) return Utils.rand(matched);
      }

      const generic = touchList.filter((action) => action && !action.hitArea);
      return generic.length > 0 ? Utils.rand(generic) : null;
    }

    playAction(action, model = this.model) {
      if (!model || !action) return;

      if (typeof action === "string") {
        model.motion(action);
        return;
      }

      if (action.textKey) {
        let shown = false;
        if (Math.random() < this.config.contextualTouchChance) shown = this.showContextMessage("touch");
        if (!shown) shown = this.showMessageByKey(action.textKey);
        if (!shown) this.showContextMessage("touch");
      } else if (action.text) {
        this.showMessage(action.text);
      }
      if (action.parameters) this.setParameters(action.parameters, model);
      if (action.motion) model.motion(action.motion);

      if (action.from && action.to) {
        const coreModel = model.internalModel.coreModel;
        const motionManager = model.internalModel.motionManager;

        Object.entries(action.from).forEach(([id, val]) => {
          const idx = coreModel._partIds.indexOf(id);
          if (idx !== -1) TweenLite.to(coreModel._partOpacities, 0.6, { [idx]: val });
        });

        motionManager.once("motionFinish", () => {
          Object.entries(action.to).forEach(([id, val]) => {
            const idx = coreModel._partIds.indexOf(id);
            if (idx !== -1) TweenLite.to(coreModel._partOpacities, 0.6, { [idx]: val });
          });
        });
      }
    }

    setParameters(parameters, model = this.model) {
      if (!model || !parameters) return;

      const coreModel = model.internalModel.coreModel;
      Object.entries(parameters).forEach(([id, value]) => {
        if (typeof coreModel.setParameterValueById === "function") {
          coreModel.setParameterValueById(id, value);
          return;
        }

        const ids = coreModel._parameterIds || [];
        const values = coreModel._parameterValues || [];
        const idx = ids.indexOf(id);
        if (idx !== -1) values[idx] = value;
      });
    }

    hideDrawables(drawableIds, model = this.model) {
      if (!model || !drawableIds || drawableIds.length === 0) return;

      const coreModel = model.internalModel.coreModel;
      const ids = coreModel._drawableIds || [];
      const opacities = coreModel._drawableOpacities || [];

      drawableIds.forEach((id) => {
        const idx = ids.indexOf(id);
        if (idx !== -1) opacities[idx] = 0;
      });
    }

    nextModel() {
      this.currentModelIndex = (this.currentModelIndex + 1) % this.config.models.length;
      this.loadModel(this.config.models[this.currentModelIndex], true);
    }

    getText(key) {
      return this.textManager.getText(key);
    }

    pickMessage(value) {
      return this.textManager.pick(value, Utils.rand);
    }

    getContextState(date = new Date()) {
      return Live2DModules.Context.getState(date);
    }

    getContextPaths(kind) {
      return Live2DModules.Context.getWeightedPaths(
        kind,
        (key) => this.getText(key),
        Utils.rand
      );
    }

    showContextMessage(kind) {
      const paths = this.getContextPaths(kind);
      while (paths.length > 0) {
        const path = Utils.rand(paths);
        if (this.showMessage(this.getText(path))) return true;
        for (let i = paths.length - 1; i >= 0; i--) {
          if (paths[i] === path) paths.splice(i, 1);
        }
      }
      return false;
    }

    showMessageByKey(key) {
      return this.showMessage(this.getText(key));
    }

    showMessageByKeys(keys) {
      for (const key of keys) {
        const value = this.getText(key);
        if (value !== undefined && this.showMessage(value)) return true;
      }
      return false;
    }

    showModelWelcome(modelName, finalFallback = "ui.welcome") {
      if (this.modelConfig.welcome && this.showMessage(this.modelConfig.welcome)) return true;
      return this.showMessageByKeys([
        this.modelConfig.welcomeKey,
        modelName ? `models.${modelName}.welcome` : null,
        "models.default.welcome",
        finalFallback,
      ]);
    }

    showMessage(text) {
      const dialog = this.elements.dialog;
      const message = this.pickMessage(text);
      if (!message) return false;

      dialog.textContent = message;
      dialog.classList.add("active");

      this.textManager.remember(message);

      clearTimeout(this.dialogTimer);
      this.dialogTimer = setTimeout(() => dialog.classList.remove("active"), 3000);
      return true;
    }

    showWelcome() {
      if (this.config.tips && this.showContextMessage("welcome")) return;
      const current = this.config.models[this.currentModelIndex];
      this.showModelWelcome(current && current.name);
    }

    hide() {
      this.elements.container.classList.add("hidden");
      this.elements.dialog.classList.remove("active");
      localStorage.setItem("live2d_hidden", "1");
    }

    show() {
      this.elements.container.classList.remove("hidden");
      localStorage.setItem("live2d_hidden", "0");
      this.showWelcome();
    }
  }

  window.Live2DWidget = Live2DWidget;

  loadAllResources()
    .then(() => {
      if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", () => {
          window.live2d = new Live2DWidget();
        });
      } else {
        window.live2d = new Live2DWidget();
      }
    })
    .catch((err) => {
      console.error("[Live2D] Resource load failed:", err);
    });
})();
