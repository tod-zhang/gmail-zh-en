(() => {
  'use strict';
  if (window.top !== window || window.__zhenLoaded) return;
  window.__zhenLoaded = true;

  // ---------------------------------------------------------------------------
  // Gmail selectors. Gmail's class names are obfuscated; these are the ones that
  // have stayed stable for years. If Gmail changes, this block is what to fix.
  // ---------------------------------------------------------------------------
  const BODY_SEL = 'div[contenteditable="true"][role="textbox"]:is([g_editable="true"], .editable)';
  const SEND_SEL = 'div[role="button"].aoO';
  const SEND_LABEL = /^\s*(发送|傳送|送出|Send)(\s|\(|‪|$)/;
  // Everything from the first of these onward is signature / quoted mail and is never translated.
  const BOUNDARY_SEL = [
    '.gmail_signature_prefix',
    '.gmail_signature',
    '[data-smartmail="gmail_signature"]',
    '.gmail_quote_container',
    '.gmail_quote',
  ].join(',');
  const MESSAGE_SEL = '.a3s'; // rendered body of a message in the thread
  const HAN = /[㐀-䶿一-鿿豈-﫿]/;
  const LOG = '[Gmail 中译英]';

  const settings = { ...globalThis.ZHEN_DEFAULTS };
  const recs = new Set(); // { body, root, cell, allowUntil }
  let lastFocused = null;
  let panel = null;
  let ui = null;
  let shortcutLabel = /Mac/i.test(navigator.platform) ? '⌃⇧Y' : 'Ctrl+Shift+Y';

  // ---------------------------------------------------------------------------
  // Settings & background
  // ---------------------------------------------------------------------------
  chrome.storage.local.get(['interceptSend', 'useContext']).then((v) => Object.assign(settings, v));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [k, { newValue }] of Object.entries(changes)) {
      settings[k] = newValue === undefined ? globalThis.ZHEN_DEFAULTS[k] : newValue;
    }
  });

  function callBackground(msg) {
    return new Promise((resolve) => {
      if (!chrome.runtime?.id) {
        resolve({ ok: false, code: 'INVALIDATED', error: '插件刚更新过，请刷新 Gmail 页面' });
        return;
      }
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          const err = chrome.runtime.lastError;
          if (err) resolve({ ok: false, code: 'RUNTIME', error: err.message });
          else resolve(res);
        });
      } catch (e) {
        resolve({ ok: false, code: 'INVALIDATED', error: '插件刚更新过，请刷新 Gmail 页面' });
      }
    });
  }

  callBackground({ type: 'getShortcut' }).then((s) => {
    if (typeof s === 'string') shortcutLabel = s || '未设置快捷键';
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'shortcut') onShortcut();
  });

  // ---------------------------------------------------------------------------
  // Trusted Types: Gmail enforces them. Every HTML string that becomes DOM goes
  // through trusted(). Our own UI is built with createElement/textContent only.
  // ---------------------------------------------------------------------------
  let ttPolicy;
  function trusted(html) {
    if (ttPolicy === undefined) {
      ttPolicy = null;
      try {
        if (window.trustedTypes?.createPolicy) {
          ttPolicy = window.trustedTypes.createPolicy('zhen-translate', { createHTML: (s) => s });
        }
      } catch (e) {
        console.warn(LOG, 'Trusted Types policy unavailable:', e);
      }
    }
    return ttPolicy ? ttPolicy.createHTML(html) : html;
  }

  function parseHtml(html) {
    return new DOMParser().parseFromString(trusted(`<!doctype html><body>${html}</body>`), 'text/html').body;
  }

  function fragmentFrom(html) {
    const frag = document.createDocumentFragment();
    for (const n of [...parseHtml(html).childNodes]) frag.appendChild(document.importNode(n, true));
    return frag;
  }

  // ---------------------------------------------------------------------------
  // Finding compose boxes
  // ---------------------------------------------------------------------------
  function isSendButton(el) {
    if (!el || el.getAttribute?.('role') !== 'button') return false;
    if (el.matches(SEND_SEL)) return true;
    const label = el.getAttribute('data-tooltip') || el.getAttribute('aria-label') || '';
    return SEND_LABEL.test(label);
  }

  function findSendButton(root) {
    const direct = root.querySelector(SEND_SEL);
    if (direct) return direct;
    for (const b of root.querySelectorAll('div[role="button"]')) if (isSendButton(b)) return b;
    return null;
  }

  function findRoot(body) {
    let el = body.parentElement;
    for (let i = 0; el && i < 30; i++, el = el.parentElement) {
      if (findSendButton(el)) return el;
    }
    return null;
  }

  function recFor(el) {
    if (!el) return null;
    let best = null;
    for (const r of recs) {
      if (!r.root.contains(el)) continue;
      if (!best || best.root.contains(r.root)) best = r;
    }
    return best;
  }

  function isVisible(el) {
    return !!el && el.isConnected && el.getClientRects().length > 0;
  }

  function scan() {
    for (const r of recs) {
      if (!r.body.isConnected) {
        recs.delete(r);
        if (lastFocused === r) lastFocused = null;
      }
    }
    for (const body of document.querySelectorAll(BODY_SEL)) {
      let rec = null;
      for (const r of recs) if (r.body === body) rec = r;
      if (rec && !(rec.root.isConnected && findSendButton(rec.root))) {
        recs.delete(rec);
        rec = null;
      }
      if (!rec) {
        const root = findRoot(body);
        if (!root) continue;
        // A send button belongs to one compose only; anything else reaching it is not a reply box.
        const send = findSendButton(root);
        if ([...recs].some((r) => findSendButton(r.root) === send)) continue;
        rec = { body, root, cell: null, allowUntil: 0 };
        recs.add(rec);
      }
      injectButton(rec);
    }
  }

  let scanTimer = 0;
  new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      scan();
    }, 300);
  }).observe(document.body, { childList: true, subtree: true });
  scan();

  document.addEventListener(
    'focusin',
    (e) => {
      const rec = recFor(e.target);
      if (rec && rec.body.contains(e.target)) lastFocused = rec;
    },
    true,
  );

  // ---------------------------------------------------------------------------
  // Toolbar button
  // ---------------------------------------------------------------------------
  function injectButton(rec) {
    if (rec.cell?.isConnected) return;
    const send = findSendButton(rec.root);
    if (!send) return;

    const btn = document.createElement('div');
    btn.className = 'zhen-btn';
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;
    btn.title = `把中文翻译成英文（${shortcutLabel}）`;
    const mark = document.createElement('span');
    mark.className = 'zhen-btn-mark';
    mark.textContent = '译';
    btn.append(mark, document.createTextNode('英文'));
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret in the editor
    btn.addEventListener('click', () => openPanel(rec, 'manual'));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        openPanel(rec, 'manual');
      }
    });

    const sendCell = send.closest('td');
    let holder;
    if (sendCell && rec.root.contains(sendCell) && sendCell.parentElement?.tagName === 'TR') {
      holder = document.createElement('td');
      holder.className = 'zhen-cell';
      holder.append(btn);
      sendCell.after(holder);
    } else {
      holder = btn;
      holder.classList.add('zhen-inline');
      (send.parentElement || send).after(holder);
    }
    rec.cell = holder;
  }

  // ---------------------------------------------------------------------------
  // The user's own text: from the top of the editor to the signature / quote.
  // ---------------------------------------------------------------------------
  function isBlank(node) {
    if (node.nodeType === Node.TEXT_NODE) return !node.data.trim();
    return node.nodeType === Node.COMMENT_NODE;
  }

  function regionRange(body) {
    const range = document.createRange();
    const stop = body.querySelector(BOUNDARY_SEL);
    if (!stop) {
      range.selectNodeContents(body);
      return range;
    }
    // Gmail often wraps everything (text + signature) in <div dir="ltr">. Start the
    // range inside such wrappers so they are not cloned and nested on write-back.
    let start = body;
    for (;;) {
      const child = [...start.childNodes].find((n) => !isBlank(n));
      if (!child || child === stop || child.nodeType !== Node.ELEMENT_NODE || !child.contains(stop)) break;
      start = child;
    }
    range.setStart(start, 0);
    range.setEndBefore(stop);
    return range;
  }

  function regionText(body) {
    return regionRange(body).toString();
  }

  // Strip all attributes before sending HTML to the model and tag each element
  // with data-k, so the original attributes (styles, links, images) can be put back.
  function prepare(range) {
    const holder = document.createElement('div');
    holder.appendChild(range.cloneContents());
    const work = holder.cloneNode(true);
    const attrs = [];
    work.querySelectorAll('*').forEach((el, i) => {
      attrs.push({ tag: el.tagName, list: [...el.attributes].map((a) => [a.name, a.value]) });
      for (const a of [...el.attributes]) el.removeAttribute(a.name);
      el.setAttribute('data-k', String(i));
    });
    return { holder, originalHtml: holder.innerHTML, modelHtml: work.innerHTML, attrs };
  }

  const ALLOWED = new Set(
    ('DIV P BR SPAN B STRONG I EM U S STRIKE A UL OL LI BLOCKQUOTE FONT IMG TABLE THEAD TBODY TFOOT ' +
      'TR TD TH H1 H2 H3 H4 H5 H6 SUB SUP PRE CODE HR WBR SMALL BIG CENTER').split(' '),
  );
  const DROP = new Set('SCRIPT STYLE IFRAME FRAME OBJECT EMBED LINK META BASE FORM INPUT BUTTON TEXTAREA SELECT SVG MATH TEMPLATE NOSCRIPT'.split(' '));

  // Sanitize the model's HTML and restore the original attributes by data-k.
  function restore(html, attrs) {
    const root = parseHtml(html);
    for (const el of [...root.querySelectorAll('*')]) {
      if (!el.isConnected) continue;
      const tag = el.tagName.toUpperCase();
      if (DROP.has(tag)) {
        el.remove();
        continue;
      }
      if (!ALLOWED.has(tag)) {
        el.replaceWith(...el.childNodes);
        continue;
      }
      const k = el.getAttribute('data-k');
      const orig = k !== null && /^\d+$/.test(k) ? attrs[Number(k)] : null;
      for (const a of [...el.attributes]) el.removeAttribute(a.name);
      if (orig && orig.tag === tag) {
        for (const [name, value] of orig.list) {
          if (!/^on/i.test(name)) el.setAttribute(name, value);
        }
      } else if (tag === 'IMG') {
        el.remove(); // the model must not invent images
      } else if (tag === 'A') {
        el.replaceWith(...el.childNodes); // nor links
      }
    }
    return root;
  }

  // Text of the message being replied to, used as translation context.
  function threadContext(rec) {
    const inDialog = rec.root.closest('[role="dialog"]');
    if (inDialog && isVisible(rec.root.querySelector('input[name="subjectbox"]'))) return ''; // new mail
    const before = [...document.querySelectorAll(MESSAGE_SEL)].filter(
      (m) =>
        !rec.root.contains(m) &&
        m.compareDocumentPosition(rec.body) & Node.DOCUMENT_POSITION_FOLLOWING &&
        m.textContent.trim(),
    );
    const last = before[before.length - 1];
    if (!last) return '';

    const clone = last.cloneNode(true);
    clone
      .querySelectorAll('.gmail_quote, .gmail_quote_container, blockquote, .gmail_signature, [data-smartmail="gmail_signature"], style, script')
      .forEach((n) => n.remove());
    clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    clone.querySelectorAll('div, p, li, tr, h1, h2, h3').forEach((d) => d.append('\n'));
    let text = clone.textContent.replace(/[ \t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) text = last.textContent.trim();

    const subject = document.querySelector('h2.hP')?.textContent.trim();
    if (subject) text = `Subject: ${subject}\n\n${text}`;
    return text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
  }

  // ---------------------------------------------------------------------------
  // Writing back into Gmail's editor
  // ---------------------------------------------------------------------------
  // Direct DOM replacement rather than execCommand('insertHTML'): Chrome's editing
  // command merges the inserted blocks into the signature that follows and strips
  // the gmail_signature_prefix span. Undo is offered through our own toast.
  function replaceRegion(rec, html) {
    const body = rec.body;
    const range = regionRange(body);
    const frag = fragmentFrom(html);
    const last = frag.lastChild;
    range.deleteContents();
    range.insertNode(frag);
    body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));

    body.focus();
    if (last?.isConnected) {
      const caret = document.createRange();
      caret.setStartAfter(last);
      caret.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(caret);
    }
  }

  function clickSend(rec) {
    const btn = findSendButton(rec.root);
    if (!btn) {
      toast('没找到发送按钮，请手动点「发送」');
      return;
    }
    // These events are untrusted, so our own interceptor lets them through.
    const opts = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
    btn.dispatchEvent(new PointerEvent('pointerdown', opts));
    btn.dispatchEvent(new MouseEvent('mousedown', opts));
    btn.dispatchEvent(new PointerEvent('pointerup', opts));
    btn.dispatchEvent(new MouseEvent('mouseup', opts));
    btn.dispatchEvent(new MouseEvent('click', opts));
    setTimeout(() => {
      if (isVisible(rec.body)) toast('好像还没发出去，请再点一次「发送」');
    }, 2000);
  }

  // ---------------------------------------------------------------------------
  // Send interception
  // ---------------------------------------------------------------------------
  function shouldIntercept(rec) {
    if (!settings.interceptSend || Date.now() < rec.allowUntil) return false;
    return HAN.test(regionText(rec.body));
  }

  function inOurUI(e) {
    return !!ui && e.composedPath().includes(ui.host);
  }

  function onPointer(e) {
    if (!e.isTrusted || inOurUI(e)) return;
    const btn = e.target.closest?.('div[role="button"]');
    if (!isSendButton(btn)) return;
    const rec = recFor(btn);
    if (!rec || !shouldIntercept(rec)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'click') openPanel(rec, 'send');
  }
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    window.addEventListener(t, onPointer, true);
  }

  let swallowKeyUntil = 0;
  function onKeydown(e) {
    if (!e.isTrusted || e.isComposing || inOurUI(e)) return;
    const t = e.target;
    const combo = e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey;
    const onSend = (e.key === 'Enter' || e.key === ' ') && isSendButton(t.closest?.('div[role="button"]'));
    if (!combo && !onSend) return;
    const rec = recFor(t);
    if (!rec || !shouldIntercept(rec)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    swallowKeyUntil = Date.now() + 500;
    openPanel(rec, 'send');
  }
  function swallowKey(e) {
    if (Date.now() < swallowKeyUntil && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
  window.addEventListener('keydown', onKeydown, true);
  window.addEventListener('keypress', swallowKey, true);
  window.addEventListener('keyup', swallowKey, true);

  function onShortcut() {
    if (panel) return;
    const active = document.activeElement;
    let rec = active && recFor(active);
    if (!rec && lastFocused?.body.isConnected) rec = lastFocused;
    if (!rec) {
      const visible = [...recs].filter((r) => isVisible(r.body));
      if (visible.length === 1) rec = visible[0];
    }
    if (!rec) {
      toast('先点一下要翻译的回复框，再按快捷键');
      return;
    }
    openPanel(rec, 'manual');
  }

  // ---------------------------------------------------------------------------
  // UI: panel + toast in a shadow root
  // ---------------------------------------------------------------------------
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c);
    return el;
  }

  function getUI() {
    if (ui?.host.isConnected) return ui;
    const host = h('div', { id: 'zhen-translate-ui' });
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadow.append(style);
    // Keep typing in our panel away from Gmail's keyboard shortcuts.
    for (const t of ['keydown', 'keypress', 'keyup']) host.addEventListener(t, (e) => e.stopPropagation());
    document.body.append(host);
    ui = { host, shadow };
    return ui;
  }

  function toast(message, action) {
    const { shadow } = getUI();
    shadow.querySelector('.toast')?.remove();
    const el = h(
      'div',
      { class: 'toast', role: 'status' },
      h('span', {}, message),
      action &&
        h(
          'button',
          {
            onclick: () => {
              el.remove();
              action.run();
            },
          },
          action.label,
        ),
    );
    shadow.append(el);
    setTimeout(() => el.remove(), action ? 8000 : 4000);
  }

  function openPanel(rec, mode) {
    if (panel) return;
    const text = regionText(rec.body);
    if (!text.trim()) {
      toast('回复框里还没有内容');
      return;
    }
    if (mode === 'manual' && !HAN.test(text)) {
      toast('没有发现需要翻译的中文');
      return;
    }

    const prep = prepare(regionRange(rec.body));
    const context = settings.useContext ? threadContext(rec) : '';
    const isSend = mode === 'send';
    const mod = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+';

    const src = h('div', { class: 'src' });
    src.append(...prep.holder.cloneNode(true).childNodes);
    const out = h('div', { class: 'out', contenteditable: 'true', spellcheck: 'true', 'aria-label': '英文译文' });
    const status = h('div', { class: 'status' });
    const retryBtn = h('button', { class: 'text', onclick: () => runTranslate() }, '重新翻译');
    const primary = h(
      'button',
      { class: 'primary', onclick: () => apply(isSend) },
      isSend ? '替换并发送' : '替换为英文',
      h('span', { class: 'kbd' }, `${mod}↵`),
    );
    const replaceOnly = isSend && h('button', { onclick: () => apply(false) }, '只替换，不发送');
    const sendAnyway =
      isSend &&
      h(
        'button',
        {
          class: 'text',
          onclick: () => {
            close();
            rec.allowUntil = Date.now() + 15000;
            clickSend(rec);
          },
        },
        '不翻译，直接发送',
      );

    const card = h(
      'div',
      { class: 'card', role: 'dialog', 'aria-modal': 'true', 'aria-label': '翻译预览', tabindex: '-1' },
      h(
        'div',
        { class: 'head' },
        h(
          'div',
          {},
          h('div', { class: 'title' }, isSend ? '邮件里还有中文' : '翻译成英文'),
          h('div', { class: 'sub' }, isSend ? '先帮你翻成英文，确认后再发送。' : '确认译文后替换到回复框里，签名和引用的原邮件不会动。'),
        ),
        h('button', { class: 'x', 'aria-label': '关闭', onclick: () => close() }, '×'),
      ),
      h(
        'div',
        { class: 'main' },
        h('div', { class: 'label' }, '中文原文'),
        src,
        h('div', { class: 'label' }, '英文译文', h('span', { class: 'hint' }, '可以直接在这里修改')),
        out,
        status,
      ),
      h('div', { class: 'foot' }, retryBtn, sendAnyway, h('div', { class: 'spacer' }), h('button', { onclick: () => close() }, '取消'), replaceOnly, primary),
    );
    const backdrop = h('div', { class: 'backdrop', onmousedown: (e) => e.target === backdrop && close() }, card);

    card.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!primary.disabled) apply(isSend);
      }
    });

    getUI().shadow.append(backdrop);
    card.focus();

    const p = { rec, prep, context, out, status, primary, replaceOnly, retryBtn, busy: false, ready: false };
    panel = p;

    function setButtons() {
      const can = p.ready && !p.busy;
      primary.disabled = !can;
      if (replaceOnly) replaceOnly.disabled = !can;
      retryBtn.disabled = p.busy;
    }

    function setStatus(message, opts = {}) {
      status.className = `status${opts.error ? ' error' : ''}`;
      status.replaceChildren(
        opts.spinner ? h('span', { class: 'spinner' }) : '',
        message,
        opts.action ? h('button', { class: 'link', onclick: opts.action.run }, opts.action.label) : '',
      );
    }

    async function runTranslate() {
      if (p.busy) return;
      p.busy = true;
      setButtons();
      out.setAttribute('aria-busy', 'true');
      setStatus('正在翻译…', { spinner: true });
      const started = Date.now();
      const res = await callBackground({ type: 'translate', html: prep.modelHtml, context });
      if (panel !== p) return;
      p.busy = false;
      out.removeAttribute('aria-busy');

      if (!res?.ok) {
        const needsKey = res?.code === 'NO_KEY' || res?.code === 'BAD_KEY';
        setStatus(res?.error || '翻译失败', {
          error: true,
          action: needsKey ? { label: '打开设置', run: () => callBackground({ type: 'openOptions' }) } : null,
        });
        setButtons();
        return;
      }

      let nodes;
      try {
        nodes = [...restore(res.html, prep.attrs).childNodes].map((n) => document.importNode(n, true));
      } catch (e) {
        console.error(LOG, e);
        setStatus(`处理译文出错：${e.message}`, { error: true });
        setButtons();
        return;
      }
      out.replaceChildren(...nodes);
      p.ready = !!out.textContent.trim();
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const leftover = HAN.test(out.textContent) ? ' · 注意：译文里还有中文' : '';
      setStatus(`用时 ${secs} 秒${leftover}`);
      setButtons();
      primary.focus();
    }

    function apply(andSend) {
      if (!p.ready || p.busy) return;
      const html = out.innerHTML;
      close({ refocus: false });
      try {
        replaceRegion(rec, html);
      } catch (e) {
        console.error(LOG, e);
        toast(`替换失败：${e.message}`);
        return;
      }
      if (andSend) {
        rec.allowUntil = Date.now() + 15000; // in case a Chinese name etc. was kept on purpose
        setTimeout(() => clickSend(rec), 400);
      } else {
        toast('已替换为英文', {
          label: '撤销',
          run: () => {
            try {
              replaceRegion(rec, prep.originalHtml);
            } catch (e) {
              console.error(LOG, e);
              toast('撤销失败');
            }
          },
        });
      }
    }

    function close({ refocus = true } = {}) {
      if (panel !== p) return;
      panel = null;
      backdrop.remove();
      if (refocus && rec.body.isConnected) rec.body.focus();
    }

    setButtons();
    runTranslate();
  }

  const PANEL_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .backdrop {
      position: fixed; inset: 0; z-index: 2147483000;
      display: flex; align-items: center; justify-content: center; padding: 16px;
      background: rgba(32, 33, 36, .36);
      font: 14px/1.5 "Google Sans", Roboto, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
      color: #1f1f1f;
    }
    .card {
      width: min(760px, 100%); max-height: calc(100vh - 32px);
      display: flex; flex-direction: column; overflow: hidden;
      background: #fff; border-radius: 16px; outline: none;
      box-shadow: 0 16px 48px rgba(0, 0, 0, .28);
    }
    .head { display: flex; align-items: flex-start; gap: 12px; padding: 20px 20px 4px; }
    .title { font-size: 18px; font-weight: 500; }
    .sub { margin-top: 2px; font-size: 13px; color: #5e5e5e; }
    .x {
      margin-left: auto; width: 32px; height: 32px; padding: 0; border: none; border-radius: 50%;
      font-size: 22px; line-height: 1; color: #444746; background: transparent;
    }
    .x:hover { background: #f1f3f4; }
    .main { display: flex; flex-direction: column; gap: 6px; padding: 12px 20px; overflow: auto; }
    .label { display: flex; justify-content: space-between; margin-top: 6px; font-size: 12px; font-weight: 500; color: #5e5e5e; }
    .hint { font-weight: 400; }
    .src {
      max-height: 160px; overflow: auto; padding: 10px 12px;
      border-radius: 10px; background: #f6f8fc; color: #444746;
    }
    .out {
      min-height: 140px; max-height: 42vh; overflow: auto; padding: 10px 12px;
      border: 1px solid #c4c7c5; border-radius: 10px; outline: none; background: #fff;
    }
    .out:focus { border-color: #0b57d0; box-shadow: 0 0 0 1px #0b57d0; }
    .out[aria-busy="true"] { opacity: .5; }
    .src img, .out img { max-width: 100%; height: auto; }
    .status { display: flex; align-items: center; gap: 8px; min-height: 22px; font-size: 13px; color: #5e5e5e; }
    .status.error { color: #b3261e; }
    .foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 20px 20px; }
    .spacer { flex: 1; }
    button {
      display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 16px;
      font: inherit; font-weight: 500; color: #0b57d0; cursor: pointer;
      border: 1px solid #c4c7c5; border-radius: 18px; background: #fff;
    }
    button:hover { background: #f0f4f9; }
    button:focus-visible { outline: 2px solid #0b57d0; outline-offset: 2px; }
    button.primary { color: #fff; background: #0b57d0; border-color: #0b57d0; }
    button.primary:hover { background: #0a4fbf; }
    button.text { border-color: transparent; padding: 0 12px; }
    button.link { height: auto; padding: 0; border: none; background: none; text-decoration: underline; color: #0b57d0; }
    button:disabled { opacity: .45; cursor: default; }
    .kbd { font-size: 12px; font-weight: 400; opacity: .8; }
    .spinner {
      width: 14px; height: 14px; border-radius: 50%;
      border: 2px solid #c4c7c5; border-top-color: #0b57d0;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .toast {
      position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483001;
      display: flex; align-items: center; gap: 20px; max-width: calc(100vw - 32px);
      padding: 12px 16px; border-radius: 8px; background: #303030; color: #f2f2f2;
      font: 14px/1.4 "Google Sans", Roboto, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
      box-shadow: 0 4px 16px rgba(0, 0, 0, .3);
    }
    .toast button { height: auto; padding: 0; border: none; background: none; color: #a8c7fa; }
  `;
})();
