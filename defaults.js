// Shared by background.js, content.js and options.js.
globalThis.ZHEN_DEFAULTS = {
  apiKey: '',
  model: 'deepseek-flash',
  tone: 'professional',
  about: '我是机械密封制造商 Cowseal 的销售经理，收件人主要是海外客户、经销商和采购。',
  glossary: [
    '# 每行一条：中文 = English。以 # 开头的行会被忽略。',
    '机械密封 = mechanical seal',
    '集装式机械密封 = cartridge mechanical seal',
    '单端面密封 = single seal',
    '双端面密封 = double seal',
    '静环 = stationary ring',
    '动环 = rotating ring',
    '密封面 = seal face',
    '碳化硅 = silicon carbide (SiC)',
    '碳化钨 = tungsten carbide (TC)',
    '石墨 = carbon',
    '波纹管 = bellows',
    'O型圈 = O-ring',
    '氟橡胶 = FKM',
    '三元乙丙 = EPDM',
    '轴套 = shaft sleeve',
    '压盖 = gland',
    '冲洗方案 = flush plan',
    '图纸 = drawing',
    '报价 = quotation',
    '交期 = lead time',
    '样品 = sample',
    '最小起订量 = MOQ',
  ].join('\n'),
  interceptSend: true,
  useContext: true,
};

globalThis.ZHEN_TONES = {
  professional: {
    label: '专业友好（推荐）',
    prompt: 'Professional and warm, like an experienced export sales manager writing to a valued customer. Natural, not stiff.',
  },
  formal: {
    label: '正式',
    prompt: 'Formal and polite, suitable for first contact, quotations, contracts and complaints.',
  },
  concise: {
    label: '简洁',
    prompt: 'Short and direct plain business English. No filler phrases.',
  },
};

globalThis.ZHEN_MODELS = {
  'deepseek-flash': '快、便宜，适合翻译（推荐）',
  'deepseek-v4-pro': '更强但更慢、更贵',
};
