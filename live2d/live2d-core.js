/**
 * Live2D 核心模块
 */

(function() {
  'use strict';

  // ==================== 资源加载器 ====================
  // 获取当前脚本的基础路径
  const BASE_PATH = (function() {
    // document.currentScript
    if (document.currentScript && document.currentScript.src) {
      const src = document.currentScript.src;
      return src.substring(0, src.lastIndexOf('/') + 1);
    }
    
    // 遍历查找 live2d-core.js
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src;
      if (src && src.indexOf('live2d-core.js') !== -1) {
        return src.substring(0, src.lastIndexOf('/') + 1);
      }
    }
    
    // 回退到当前页面路径
    return window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
  })();

  const RESOURCES = {
    css: [
      'libs/live2d.css'
    ],
    js: [
      'libs/live2dcubismcore.min.js',
      'libs/pixi.min.js',
      'libs/cubism4.min.js',
      'libs/TweenLite.js'
    ]
  };

  // 加载 CSS
  function loadCSS(href) {
    const fullUrl = BASE_PATH + href;
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = fullUrl;
      link.onload = resolve;
      link.onerror = () => {
        console.error('[Live2D] CSS 加载失败:', fullUrl);
        reject(new Error(`Failed to load CSS: ${href}`));
      };
      document.head.appendChild(link);
    });
  }

  // 加载 JS
  function loadScript(src) {
    const fullUrl = BASE_PATH + src;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = fullUrl;
      script.onload = resolve;
      script.onerror = () => {
        console.error('[Live2D] JS 加载失败:', fullUrl);
        reject(new Error(`Failed to load: ${src}`));
      };
      document.head.appendChild(script);
    });
  }

  // 顺序加载所有资源
  async function loadAllResources() {
    try {
      // 并行加载 CSS
      await Promise.all(RESOURCES.css.map(loadCSS));
      // 顺序加载 JS (有依赖关系)
      for (const js of RESOURCES.js) {
        await loadScript(js);
      }

      console.log('%c Live2D %c 资源加载完成 ', 
        'color: #fff; padding: 5px 0; background: #85a7d4;',
        'padding: 5px 0; background: #b8d9e8;');

    } catch (err) {
      console.error('[Live2D] 资源加载错误:', err);
      throw err;
    }
  }

  // ==================== 配置 ====================
  const CONFIG = {
    alignment: 'left',      // 位置: 'left' | 'right'
    hidden: true,           // 移动端隐藏
    tips: true,             // 显示时间问候
    models: [
      BASE_PATH + 'models/Diana/Diana.model3.json',
      BASE_PATH + 'models/Ava/Ava.model3.json',
      BASE_PATH + 'models/MiSide/MiSide.model3.json',
      BASE_PATH + 'models/HuDie/HuDie.model3.json'
    ],
    messages: {
      welcome: ['Hi!'],
      skin: ['诶，想看看其他团员吗？', '替换后入场文本'],
      close: 'QWQ 下次再见吧~',
      home: '点击这里回到首页！'
    }
  };

  // ==================== 模型配置 ====================
  const MODEL_CONFIG = {
    Diana: {
      welcome: '我是吃货担当 嘉然 Diana~',
      initMotion: 'Tap抱阿草-左手',
      touchList: [
        { text: '嘉心糖屁用没有', motion: 'Tap生气 -领结' },
        { text: '有人急了，但我不说是谁~', motion: 'Tap= =  左蝴蝶结' },
        { text: '呜呜...呜呜呜....', motion: 'Tap哭 -眼角' },
        { text: '想然然了没有呀~', motion: 'Tap害羞-中间刘海' },
        { text: '阿草好软呀~', motion: 'Tap抱阿草-左手' },
        { text: '不要再戳啦！好痒！', motion: 'Tap摇头- 身体' },
        { text: '嗷呜~~~', motion: 'Tap耳朵-发卡' },
        { text: 'zzZ。。。', motion: 'Leave' },
        { text: '哇！好吃的！', motion: 'Tap右头发' }
      ]
    },
    Ava: {
      welcome: '我是<s>拉胯</s>Gamer担当 向晚 AvA~',
      initMotion: { motion: 'Tap左眼', from: { Part15: 1 }, to: { Part15: 0 } },
      hideParts: ['Part5', 'neko', 'game', 'Part15', 'Part21', 'Part22', 'Part', 'Part16', 'Part12'],
      scaleWidth: 1.2,
      touchList: [
        { text: '水母 水母~ 只是普通的生物', motion: 'Tap右手' },
        { text: '可爱的鸽子鸽子~我喜欢你~', motion: 'Tap胸口项链', from: { Part12: 1 }, to: { Part12: 0 } },
        { text: '好...好兄弟之间喜欢很正常啦', motion: 'Tap中间刘海', from: { Part12: 1 }, to: { Part12: 0 } },
        { text: '啊啊啊！怎么推流辣', motion: 'Tap右眼', from: { Part16: 1 }, to: { Part16: 0 } },
        { text: '你怎么老摸我，我的身体是不是可有魅力', motion: 'Tap嘴' },
        { text: 'AAAAAAAAAAvvvvAAA 向晚！', motion: 'Tap左眼', from: { Part15: 1 }, to: { Part15: 0 } }
      ]
    }
  };

  // ==================== 工具函数 ====================
  const Utils = {
    rand: arr => arr[Math.floor(Math.random() * arr.length)],
    isMobile: () => window.innerWidth < 500 || /mobile|android|ios/i.test(navigator.userAgent),
    create: (tag, className) => {
      const el = document.createElement(tag);
      if (className) el.className = className;
      return el;
    },
    getTimeGreeting: () => {
      const hour = new Date().getHours();
      if (hour > 22 || hour <= 5) return '你是夜猫子呀？这么晚还不睡觉，明天起的来嘛';
      if (hour <= 8) return '早上好！';
      if (hour <= 11) return '上午好！工作顺利嘛，多起来走动走动哦！';
      if (hour <= 14) return '中午了，现在是午餐时间！';
      if (hour <= 17) return '午后很容易犯困呢，今天的运动目标完成了吗？';
      if (hour <= 19) return '傍晚了！窗外夕阳的景色很美丽呢~';
      if (hour <= 21) return '晚上好，今天过得怎么样？';
      return '已经这么晚了呀，早点休息吧，晚安~';
    }
  };

  // ==================== Live2D 核心类 ====================
  class Live2DWidget {
    constructor(config = {}) {
      this.config = { ...CONFIG, ...config };
      this.currentModelIndex = 0;
      this.model = null;
      this.app = null;
      this.dialogTimer = null;
      this.elements = {};
      
      this.init();
    }

    init() {
      if (this.config.hidden && Utils.isMobile()) {
        console.log('[Live2D] 移动端已隐藏');
        return;
      }

      this.createContainer();
      this.createPixiApp();
      this.createUI();
      this.loadModel(this.config.models[0]);
      
      // 检查是否被用户关闭
      if (localStorage.getItem('live2d_hidden') === '1') {
        this.hide();
      } else {
        this.showWelcome();
      }
    }

    createContainer() {
      const container = Utils.create('div', `pio-container ${this.config.alignment}`);
      container.id = 'pio-container';
      
      const action = Utils.create('div', 'pio-action');
      const canvas = Utils.create('canvas');
      canvas.id = 'pio';
      const dialog = Utils.create('div', 'pio-dialog');
      const showBtn = Utils.create('div', 'pio-show');
      
      container.append(action, canvas, dialog, showBtn);
      document.body.appendChild(container);
      
      this.elements = { container, action, canvas, dialog, showBtn };
      
      showBtn.onclick = () => this.show();
    }

    createPixiApp() {
      this.app = new PIXI.Application({
        view: this.elements.canvas,
        transparent: true,
        autoStart: true
      });
    }

    createUI() {
      const buttons = [
        { name: 'home', title: this.config.messages.home, click: () => location.href = '/' },
        { name: 'skin', title: this.config.messages.skin[0], click: () => this.nextModel() },
        { name: 'info', title: '想了解更多关于我的信息吗？', click: () => {} },
        { name: 'close', title: this.config.messages.close, click: () => this.hide() }
      ];

      buttons.forEach(btn => {
        if (btn.name === 'skin' && this.config.models.length <= 1) return;
        
        const span = Utils.create('span', `pio-${btn.name}`);
        span.onclick = btn.click;
        span.onmouseover = () => this.showMessage(btn.title);
        this.elements.action.appendChild(span);
      });
    }

    loadModel(url) {
      // 移除旧模型
      if (this.app.stage.children.length > 0) {
        this.app.stage.removeChildAt(0);
      }

      const model = PIXI.live2d.Live2DModel.fromSync(url);
      
      model.once('load', () => {
        this.model = model;
        this.app.stage.addChild(model);
        
        // 缩放适配
        const scale = this.elements.canvas.height / model.height;
        model.scale.set(scale);
        this.elements.canvas.width = model.width;
        this.elements.canvas.height = model.height;
        
        // 对齐
        model.x = this.config.alignment === 'left' ? 0 : this.elements.canvas.width - model.width;
        
        // 应用模型特定配置
        this.applyModelConfig(model);
        this.setupModelInteraction(model);
      });
    }

    applyModelConfig(model) {
      const modelName = model.internalModel.settings.name;
      const cfg = MODEL_CONFIG[modelName];
      
      if (!cfg) return;
      
      this.elements.container.dataset.model = modelName;
      this.config.messages.skin[1] = cfg.welcome;
      
      // 隐藏特定部件
      if (cfg.hideParts) {
        const coreModel = model.internalModel.coreModel;
        cfg.hideParts.forEach(partId => {
          const idx = coreModel._partIds.indexOf(partId);
          if (idx !== -1) coreModel._partOpacities[idx] = 0;
        });
      }
      
      // 调整宽度
      if (cfg.scaleWidth) {
        this.elements.canvas.width = model.width * cfg.scaleWidth;
      }
      
      // 初始动作
      if (cfg.initMotion) {
        this.playAction(cfg.initMotion, model);
      }
    }

    setupModelInteraction(model) {
      const modelName = model.internalModel.settings.name;
      const cfg = MODEL_CONFIG[modelName];
      const touchList = cfg?.touchList || [
        { text: 'Hey there!', motion: 'Idle' },
        { text: "Hey, what's up?", motion: 'Idle' }
      ];

      this.elements.canvas.onclick = () => {
        const motionManager = model.internalModel.motionManager;
        if (motionManager.state.currentGroup !== 'Idle') return;
        
        const action = Utils.rand(touchList);
        this.playAction(action, model);
      };
    }

    playAction(action, model = this.model) {
      if (!model) return;
      
      if (typeof action === 'string') {
        model.motion(action);
        return;
      }
      
      if (action.text) this.showMessage(action.text);
      if (action.motion) model.motion(action.motion);
      
      if (action.from && action.to) {
        const coreModel = model.internalModel.coreModel;
        const motionManager = model.internalModel.motionManager;
        
        Object.entries(action.from).forEach(([id, val]) => {
          const idx = coreModel._partIds.indexOf(id);
          if (idx !== -1) TweenLite.to(coreModel._partOpacities, 0.6, { [idx]: val });
        });
        
        motionManager.once('motionFinish', () => {
          Object.entries(action.to).forEach(([id, val]) => {
            const idx = coreModel._partIds.indexOf(id);
            if (idx !== -1) TweenLite.to(coreModel._partOpacities, 0.6, { [idx]: val });
          });
        });
      }
    }

    nextModel() {
      this.currentModelIndex = (this.currentModelIndex + 1) % this.config.models.length;
      this.loadModel(this.config.models[this.currentModelIndex]);
      this.showMessage(this.config.messages.skin[1] || '新衣服真漂亮~');
    }

    showMessage(text) {
      const dialog = this.elements.dialog;
      dialog.innerHTML = Array.isArray(text) ? Utils.rand(text) : text;
      dialog.classList.add('active');
      
      clearTimeout(this.dialogTimer);
      this.dialogTimer = setTimeout(() => dialog.classList.remove('active'), 3000);
    }

    showWelcome() {
      if (this.config.tips) {
        this.showMessage(Utils.getTimeGreeting());
      } else {
        this.showMessage(this.config.messages.welcome);
      }
    }

    hide() {
      this.elements.container.classList.add('hidden');
      this.elements.dialog.classList.remove('active');
      localStorage.setItem('live2d_hidden', '1');
    }

    show() {
      this.elements.container.classList.remove('hidden');
      localStorage.setItem('live2d_hidden', '0');
      this.showWelcome();
    }
  }

  // ==================== 导出 ====================
  window.Live2DWidget = Live2DWidget;
  
  // 自动加载资源并初始化
  loadAllResources().then(() => {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => {
        window.live2d = new Live2DWidget();
      });
    } else {
      window.live2d = new Live2DWidget();
    }
  }).catch(err => {
    console.error('[Live2D] 资源加载失败:', err);
  });
})();
