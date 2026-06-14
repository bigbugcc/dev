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
    model: "",
    models: [],
    messages: {
      welcome: ["Hi!"],
      skin: ["Want to switch models?", "The new model is ready."],
      close: "See you next time.",
      home: "Back to home.",
    },
  };

  const DEFAULT_MODEL_CONFIG = {
    welcome: "Hi!",
    touchList: [
      { text: "Hey there!" },
      { text: "What's up?" },
    ],
  };

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
    getTimeGreeting: () => {
      const hour = new Date().getHours();
      if (hour > 22 || hour <= 5) return "It is late. Remember to rest.";
      if (hour <= 8) return "Good morning!";
      if (hour <= 11) return "Hope your morning is going well.";
      if (hour <= 14) return "Lunch time is a good time to take a break.";
      if (hour <= 17) return "Good afternoon!";
      if (hour <= 19) return "Good evening!";
      return "How was your day?";
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
      this.currentModelIndex = 0;
      this.model = null;
      this.modelConfig = DEFAULT_MODEL_CONFIG;
      this.persistentParameters = null;
      this.persistentDrawables = null;
      this.app = null;
      this.dialogTimer = null;
      this.elements = {};

      this.init();
    }

    async init() {
      if (this.config.hidden && Utils.isMobile()) {
        console.log("[Live2D] Hidden on mobile.");
        return;
      }

      await this.loadModels();
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
        { name: "home", title: this.config.messages.home, click: () => (location.href = "/") },
        { name: "skin", title: this.config.messages.skin[0], click: () => this.nextModel() },
        { name: "info", title: "Live2D", click: () => {} },
        { name: "close", title: this.config.messages.close, click: () => this.hide() },
      ];

      buttons.forEach((btn) => {
        if (btn.name === "skin" && this.config.models.length <= 1) return;

        const span = Utils.create("span", `pio-${btn.name}`);
        span.onclick = btn.click;
        span.onmouseover = () => this.showMessage(btn.title);
        this.elements.action.appendChild(span);
      });
    }

    async loadModel(entry, showSwitchMessage = false) {
      const modelEntry = Utils.normalizeModelEntry(entry);
      this.modelConfig = await this.loadModelConfig(modelEntry);

      if (this.app.stage.children.length > 0) {
        this.app.stage.removeChildren();
      }

      const model = PIXI.live2d.Live2DModel.fromSync(toUrl(`models/${modelEntry.model}`));

      model.once("load", () => {
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
          this.showMessage(this.modelConfig.welcome || this.config.messages.skin[1]);
        }
      });
    }

    applyModelConfig(model, cfg) {
      this.elements.container.dataset.model = cfg.name;
      this.config.messages.skin[1] = cfg.welcome || this.config.messages.skin[1];

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

      this.elements.canvas.onclick = () => {
        const motionManager = model.internalModel.motionManager;
        if (motionManager.state.currentGroup && motionManager.state.currentGroup !== "Idle") return;

        const action = Utils.rand(touchList);
        this.playAction(action, model);
      };
    }

    playAction(action, model = this.model) {
      if (!model || !action) return;

      if (typeof action === "string") {
        model.motion(action);
        return;
      }

      if (action.text) this.showMessage(action.text);
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

    showMessage(text) {
      const dialog = this.elements.dialog;
      dialog.innerHTML = Array.isArray(text) ? Utils.rand(text) : text;
      dialog.classList.add("active");

      clearTimeout(this.dialogTimer);
      this.dialogTimer = setTimeout(() => dialog.classList.remove("active"), 3000);
    }

    showWelcome() {
      if (this.config.tips) {
        this.showMessage(Utils.getTimeGreeting());
      } else {
        this.showMessage(this.config.messages.welcome);
      }
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
