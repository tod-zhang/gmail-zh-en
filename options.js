const D = globalThis.ZHEN_DEFAULTS;
const $ = (id) => document.getElementById(id);
const TEXT_FIELDS = ['apiKey', 'model', 'tone', 'about', 'glossary'];
const CHECK_FIELDS = ['interceptSend', 'useContext'];

for (const [value, note] of Object.entries(ZHEN_MODELS)) {
  $('model').append(new Option(`${value} — ${note}`, value));
}
for (const [value, { label }] of Object.entries(ZHEN_TONES)) {
  $('tone').append(new Option(label, value));
}

function setMsg(text, kind = '') {
  $('msg').textContent = text;
  $('msg').className = kind;
}

async function load() {
  const s = { ...D, ...(await chrome.storage.local.get(null)) };
  for (const k of TEXT_FIELDS) $(k).value = s[k];
  for (const k of CHECK_FIELDS) $(k).checked = !!s[k];
  const cmds = await chrome.commands.getAll();
  $('shortcut').textContent = cmds.find((c) => c.name === 'translate')?.shortcut || '未设置';
}

async function save() {
  const data = {};
  for (const k of TEXT_FIELDS) data[k] = $(k).value.trim();
  for (const k of CHECK_FIELDS) data[k] = $(k).checked;
  await chrome.storage.local.set(data);
  setMsg('已保存', 'ok');
  return data;
}

$('save').addEventListener('click', save);

$('test').addEventListener('click', async () => {
  const data = await save();
  const out = $('testOut');
  if (!data.apiKey) {
    setMsg('请先填写 API Key', 'err');
    return;
  }
  $('test').disabled = true;
  setMsg('正在测试…');
  out.style.display = 'none';
  const sample = '<div>您好，</div><div>样品已经寄出，预计下周三到。图纸我们收到了，报价明天发给您。</div>';
  const res = await chrome.runtime.sendMessage({ type: 'translate', html: sample, context: '' });
  $('test').disabled = false;
  if (!res?.ok) {
    setMsg(res?.error || '测试失败', 'err');
    return;
  }
  const doc = new DOMParser().parseFromString(res.html, 'text/html');
  doc.querySelectorAll('div, p, br').forEach((el) => el.after('\n'));
  out.textContent = `原文：您好，样品已经寄出，预计下周三到。图纸我们收到了，报价明天发给您。\n\n译文：\n${doc.body.textContent.trim()}`;
  out.style.display = 'block';
  const tokens = res.usage?.total_tokens;
  setMsg(`连接正常${tokens ? `，本次用了 ${tokens} tokens` : ''}`, 'ok');
});

$('reset').addEventListener('click', () => {
  for (const k of ['model', 'tone', 'about', 'glossary']) $(k).value = D[k];
  for (const k of CHECK_FIELDS) $(k).checked = D[k];
  setMsg('已恢复默认值，点「保存」生效');
});

$('toggleKey').addEventListener('click', () => {
  const show = $('apiKey').type === 'password';
  $('apiKey').type = show ? 'text' : 'password';
  $('toggleKey').textContent = show ? '隐藏' : '显示';
});

$('editShortcut').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

load();
