/**
 * NavPage · 交互逻辑
 * 依赖 data.js 中的 SITE_DATA / ENGINES
 * 数据结构全部存在 localStorage，不上传任何服务器。
 */
(function () {
  'use strict';

  /* ---------------- 常量与状态 ---------------- */
  const KEY = {
    theme: 'navpage.theme',
    pins: 'navpage.pins',
    engine: 'navpage.engine',
    custom: 'navpage.custom',
    inited: 'navpage.inited'
  };

  const DEFAULT_ENGINE = 'bing';

  const state = {
    theme: 'light',
    pins: new Set(),
    engine: DEFAULT_ENGINE,
    custom: [],
    query: ''
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------------- 本地存储 ---------------- */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        /* 隐私模式下忽略 */
      }
    }
  };

  /* ---------------- 小工具 ---------------- */
  const hostOf = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (err) {
      return '';
    }
  };

  const normalizeUrl = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) return text;
    return 'https://' + text.replace(/^\/+/, '');
  };

  const originOf = (url) => {
    try {
      return new URL(url).origin;
    } catch (err) {
      return '';
    }
  };

  /** 由字符串生成稳定的色相，用于没有指定颜色的站点 */
  const hashHue = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash * 31 + str.charCodeAt(i)) % 360;
    }
    return hash;
  };

  /** 根据背景色亮度决定文字用黑还是白 */
  const readableText = (hex) => {
    const value = (hex || '').replace('#', '');
    if (value.length !== 6) return '#ffffff';
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.68 ? '#16202f' : '#ffffff';
  };

  const toastTimer = { id: 0 };
  const toast = (message) => {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-show'));
    clearTimeout(toastTimer.id);
    toastTimer.id = setTimeout(() => {
      el.classList.remove('is-show');
      setTimeout(() => { el.hidden = true; }, 260);
    }, 1800);
  };

  /* ---------------- 数据装配 ---------------- */
  /** 展开所有站点，附带分类 id 与是否自定义标记 */
  function getAllSites() {
    const list = [];
    SITE_DATA.forEach((cat) => {
      cat.sites.forEach((site) => {
        list.push({ ...site, category: cat.id, custom: false });
      });
    });
    state.custom.forEach((site) => {
      list.push({ ...site, custom: true });
    });
    return list;
  }

  const hotSites = () => getAllSites().filter((site) => site.hot).map((site) => site.url);

  function categoryName(id) {
    const cat = SITE_DATA.find((item) => item.id === id);
    return cat ? cat.name : id;
  }

  /* ---------------- 主题 ---------------- */
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    store.set(KEY.theme, theme);
  }

  function initTheme() {
    const saved = store.get(KEY.theme, null);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  }

  /* ---------------- 搜索引擎 ---------------- */
  function initEngines() {
    const select = $('#engineSelect');
    state.engine = store.get(KEY.engine, DEFAULT_ENGINE);

    ENGINES.forEach((engine) => {
      const option = document.createElement('option');
      option.value = engine.id;
      option.textContent = engine.name;
      select.appendChild(option);
    });

    if (!ENGINES.some((engine) => engine.id === state.engine)) {
      state.engine = DEFAULT_ENGINE;
    }
    select.value = state.engine;

    select.addEventListener('change', () => {
      state.engine = select.value;
      store.set(KEY.engine, state.engine);
      $('#searchInput').focus();
    });
  }

  function searchWith(keyword) {
    const text = String(keyword || '').trim();
    if (!text) {
      $('#searchInput').focus();
      return;
    }
    const engine = ENGINES.find((item) => item.id === state.engine) || ENGINES[0];
    window.open(engine.url.replace('{q}', encodeURIComponent(text)), '_blank', 'noopener');
  }

  /* ---------------- 卡片渲染 ---------------- */
  function createCard(site, options = {}) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.url = site.url;
    card.dataset.search = `${site.name} ${site.desc || ''} ${hostOf(site.url)} ${site.category || ''}`.toLowerCase();

    // 点击区域
    const hit = document.createElement('a');
    hit.className = 'card__hit';
    hit.href = site.url;
    hit.target = '_blank';
    hit.rel = 'noopener';
    hit.setAttribute('aria-label', `打开 ${site.name}`);
    card.appendChild(hit);

    // 图标（底色块 + 首字母，favicon 加载成功后覆盖）
    const icon = document.createElement('span');
    icon.className = 'card__icon';
    const color = site.color || `hsl(${hashHue(site.name)} 62% 46%)`;
    icon.style.setProperty('--c', color);
    icon.style.setProperty('--ct', readableText(color));

    const letter = document.createElement('span');
    letter.className = 'card__letter';
    letter.textContent = site.name.trim().charAt(0).toUpperCase();
    icon.appendChild(letter);

    const domain = hostOf(site.url);
    if (domain) {
      // favicon 依次尝试：站点自带的 /favicon.ico → 第三方图标服务 → 放弃（保留首字母色块）
      const candidates = site.icon
        ? [site.icon]
        : [`${originOf(site.url)}/favicon.ico`, `https://favicon.im/${domain}?larger=true`];

      const img = new Image();
      let attempt = 0;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';

      img.addEventListener('load', () => img.classList.add('is-loaded'));
      img.addEventListener('error', () => {
        attempt += 1;
        if (attempt < candidates.length) {
          img.src = candidates[attempt];
        } else {
          img.remove();
        }
      });

      icon.appendChild(img);
      img.src = candidates[0];
    }
    card.appendChild(icon);

    // 文字
    const body = document.createElement('div');
    body.className = 'card__body';

    const name = document.createElement('span');
    name.className = 'card__name';
    name.textContent = site.name;

    const desc = document.createElement('span');
    desc.className = 'card__desc';
    desc.textContent = site.desc || hostOf(site.url);

    body.append(name, desc);
    card.appendChild(body);

    // 收藏按钮
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'card__pin';
    pin.dataset.action = 'pin';
    pin.title = '收藏到「常用」';
    pin.textContent = '☆';
    card.appendChild(pin);

    // 自定义站点可删除
    if (site.custom && !options.inPinArea) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'card__del';
      del.dataset.action = 'delete';
      del.title = '删除这个自定义站点';
      del.textContent = '✕';
      card.appendChild(del);
    }

    syncPinState(card, site.url);
    return card;
  }

  function syncPinState(card, url) {
    const pinned = state.pins.has(url);
    card.classList.toggle('is-pinned', pinned);
    const pin = $('.card__pin', card);
    if (pin) {
      pin.textContent = pinned ? '★' : '☆';
      pin.title = pinned ? '取消收藏' : '收藏到「常用」';
    }
  }

  /* ---------------- 区域渲染 ---------------- */
  function renderSections() {
    const container = $('#sections');
    container.textContent = '';
    const all = getAllSites();

    SITE_DATA.forEach((cat, index) => {
      const sites = all.filter((site) => site.category === cat.id);
      if (!sites.length) return;

      const section = document.createElement('section');
      section.className = 'section';
      section.id = `cat-${cat.id}`;
      section.style.animationDelay = `${Math.min(index * 40, 240)}ms`;

      const head = document.createElement('header');
      head.className = 'section__head';

      const title = document.createElement('h2');
      title.className = 'section__title';
      const icon = document.createElement('span');
      icon.className = 'section__icon';
      icon.textContent = cat.icon;
      title.append(icon, document.createTextNode(cat.name));

      const count = document.createElement('span');
      count.className = 'section__count';
      count.textContent = `${sites.length} 个`;

      head.append(title, count);

      const grid = document.createElement('div');
      grid.className = 'grid';
      sites.forEach((site) => grid.appendChild(createCard(site)));

      section.append(head, grid);
      container.appendChild(section);
    });
  }

  function renderPins() {
    const grid = $('#pinGrid');
    const section = $('#pinSection');
    const all = getAllSites();

    // 同一网址可能存在于多个分类，常用区只保留一份
    const seen = new Set();
    const pinned = all.filter((site) => {
      if (!state.pins.has(site.url) || seen.has(site.url)) return false;
      seen.add(site.url);
      return true;
    });

    grid.textContent = '';
    section.hidden = pinned.length === 0;
    $('#pinCount').textContent = pinned.length ? `${pinned.length} 个` : '';

    pinned.forEach((site) => {
      const card = createCard(site, { inPinArea: true });
      // 常用区不重复显示删除按钮，但保留取消收藏
      grid.appendChild(card);
    });
  }

  function renderCategoryNav() {
    const nav = $('#catNav');
    nav.textContent = '';
    const all = getAllSites();

    SITE_DATA.forEach((cat) => {
      const count = all.filter((site) => site.category === cat.id).length;
      if (!count) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-nav__item';
      btn.dataset.target = `cat-${cat.id}`;

      const icon = document.createElement('span');
      icon.className = 'cat-nav__icon';
      icon.textContent = cat.icon;

      const name = document.createElement('span');
      name.className = 'cat-nav__name';
      name.textContent = cat.name;

      const num = document.createElement('span');
      num.className = 'cat-nav__num';
      num.textContent = count;

      btn.append(icon, name, num);
      btn.addEventListener('click', () => {
        clearFilter();
        const target = document.getElementById(`cat-${cat.id}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      nav.appendChild(btn);
    });

    $('#siteCount').textContent = `${all.length} 个站点`;
  }

  function renderAll() {
    renderCategoryNav();
    renderPins();
    renderSections();
    applyFilter(state.query);
    observeSections();
  }

  /* ---------------- 收藏 ---------------- */
  function savePins() {
    store.set(KEY.pins, Array.from(state.pins));
  }

  function togglePin(url) {
    if (state.pins.has(url)) {
      state.pins.delete(url);
      toast('已取消收藏');
    } else {
      state.pins.add(url);
      toast('已加入「常用」');
    }
    savePins();
    $$(`.card[data-url="${CSS.escape(url)}"]`).forEach((card) => syncPinState(card, url));
    renderPins();
    applyFilter(state.query);
  }

  function initPins() {
    if (!store.get(KEY.inited, false)) {
      // 首次访问：把标记为 hot 的站点放进常用区
      state.pins = new Set(hotSites());
      store.set(KEY.inited, true);
      savePins();
      return;
    }
    const saved = store.get(KEY.pins, []);
    state.pins = new Set(Array.isArray(saved) ? saved : []);
  }

  /* ---------------- 自定义站点 ---------------- */
  function initCustom() {
    const saved = store.get(KEY.custom, []);
    state.custom = Array.isArray(saved) ? saved : [];
  }

  function addCustomSite(data) {
    const site = {
      name: data.name.trim(),
      url: normalizeUrl(data.url),
      desc: data.desc.trim(),
      category: data.category,
      color: `hsl(${hashHue(data.name)} 60% 48%)`,
      custom: true
    };
    state.custom.push(site);
    store.set(KEY.custom, state.custom);
    renderAll();
    toast('已添加，别忘了点星标收藏');
  }

  function removeCustomSite(url) {
    state.custom = state.custom.filter((site) => site.url !== url);
    store.set(KEY.custom, state.custom);
    if (state.pins.delete(url)) savePins();
    renderAll();
    toast('已删除');
  }

  /* ---------------- 过滤（实时筛选） ---------------- */
  function applyFilter(raw) {
    state.query = String(raw || '').trim();
    const query = state.query.toLowerCase();

    let visibleTotal = 0;
    const all = getAllSites();

    $$('#sections .section').forEach((section) => {
      let visible = 0;
      $$('.card', section).forEach((card) => {
        const site = all.find((item) => item.url === card.dataset.url);
        const haystack = card.dataset.search + (site ? ` ${site.name}` : '');
        const match = !query || haystack.includes(query);
        card.hidden = !match;
        if (match) visible += 1;
      });
      section.hidden = visible === 0;
      const count = $('.section__count', section);
      if (count) {
        const total = $$('.card', section).length;
        count.textContent = query && visible !== total ? `${visible} / ${total} 个` : `${total} 个`;
      }
      visibleTotal += visible;
    });

    // 常用区同样参与筛选
    const pinSection = $('#pinSection');
    let pinVisible = 0;
    $$('.card', pinSection).forEach((card) => {
      const match = !query || card.dataset.search.includes(query);
      card.hidden = !match;
      if (match) pinVisible += 1;
    });
    pinSection.hidden = pinVisible === 0;
    visibleTotal += pinVisible;

    $('#empty').hidden = visibleTotal > 0;
    return visibleTotal;
  }

  function clearFilter() {
    const input = $('#searchInput');
    if (input.value) {
      input.value = '';
      applyFilter('');
    }
  }

  /* ---------------- 侧边栏滚动高亮 ---------------- */
  let observer = null;
  function observeSections() {
    if (observer) observer.disconnect();
    const items = $$('.cat-nav__item');
    if (!items.length) return;

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          items.forEach((item) => item.classList.toggle('is-active', item.dataset.target === id));
        });
      },
      { rootMargin: '-120px 0px -62% 0px', threshold: 0 }
    );

    $$('.section[id]').forEach((section) => observer.observe(section));
  }

  /* ---------------- 弹窗 ---------------- */
  const modal = {
    open() {
      const select = $('#modalCategory');
      select.textContent = '';
      SITE_DATA.forEach((cat) => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = `${cat.icon} ${cat.name}`;
        select.appendChild(option);
      });
      // 默认选中当前视野的分类
      const active = $('.cat-nav__item.is-active');
      if (active) {
        const id = active.dataset.target.replace('cat-', '');
        if (SITE_DATA.some((cat) => cat.id === id)) select.value = id;
      }

      $('#modal').hidden = false;
      document.body.style.overflow = 'hidden';
      setTimeout(() => $('#addForm').elements.name.focus(), 60);
    },
    close() {
      $('#modal').hidden = true;
      document.body.style.overflow = '';
      $('#addForm').reset();
    }
  };

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    // 搜索
    $('#searchForm').addEventListener('submit', (event) => {
      event.preventDefault();
      searchWith($('#searchInput').value);
    });

    // 输入即筛选
    const input = $('#searchInput');
    let timer = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => applyFilter(input.value), 60);
    });

    $('#emptySearchBtn').addEventListener('click', () => searchWith(state.query));

    // 主题
    $('#themeBtn').addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    // 添加 / 删除 / 收藏（事件委托）
    $('#addBtn').addEventListener('click', () => modal.open());

    $('#modal').addEventListener('click', (event) => {
      if (event.target.hasAttribute('data-close')) modal.close();
    });

    $('#addForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.target;
      const data = {
        name: form.elements.name.value,
        url: form.elements.url.value,
        desc: form.elements.desc.value,
        category: form.elements.category.value
      };
      if (!data.name.trim() || !data.url.trim()) return;
      addCustomSite(data);
      modal.close();
    });

    document.addEventListener('click', (event) => {
      const pinBtn = event.target.closest('[data-action="pin"]');
      if (pinBtn) {
        event.preventDefault();
        const card = pinBtn.closest('.card');
        if (card) togglePin(card.dataset.url);
        return;
      }
      const delBtn = event.target.closest('[data-action="delete"]');
      if (delBtn) {
        event.preventDefault();
        const card = delBtn.closest('.card');
        if (card && window.confirm(`确定删除「${$('.card__name', card).textContent}」吗？`)) {
          removeCustomSite(card.dataset.url);
        }
      }
    });

    // 重置
    $('#resetBtn').addEventListener('click', () => {
      if (!window.confirm('将「常用」恢复为默认推荐站点？自定义添加的网站不会被删除。')) return;
      state.pins = new Set(hotSites());
      savePins();
      renderPins();
      $$('.card').forEach((card) => syncPinState(card, card.dataset.url));
      applyFilter(state.query);
      toast('已恢复默认收藏');
    });

    // 快捷键
    document.addEventListener('keydown', (event) => {
      const tag = (event.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';

      if ((event.key === '/' && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        $('#searchInput').focus();
        $('#searchInput').select();
        return;
      }

      if (event.key === 'Escape') {
        if (!$('#modal').hidden) {
          modal.close();
          return;
        }
        if (typing) {
          event.target.blur();
          if (event.target === $('#searchInput')) {
            event.target.value = '';
            applyFilter('');
          }
        }
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    initTheme();
    initEngines();
    initPins();
    initCustom();
    bindEvents();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
