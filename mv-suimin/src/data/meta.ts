// Per-line direction: words to emphasise and which motif illustrates the line.
export type MotifName =
  | 'bars' | 'ledger' | 'chart' | 'face' | 'bench' | 'pullup' | 'shades' | 'toggles'
  | 'moon' | 'eye' | 'play' | 'mirror'
  | 'collab' | 'invoice' | 'thirteen' | 'muga' | 'camera' | 'tilt' | 'reply' | 'curtain'
  | 'invest' | 'live' | 'none';

export const LINE_META: Record<string, { hl: string[]; motif: MotifName }> = {
  'v1-1': { hl: ['ショート', 'ロング', '時間'], motif: 'bars' },
  'v1-2': { hl: ['黒字', 'クマ'], motif: 'ledger' },
  'v1-3': { hl: ['資本', '元本割れ'], motif: 'chart' },
  'v1-4': { hl: ['口座', '顔'], motif: 'face' },
  'v1-5': { hl: ['上がる', '下がる', '重い'], motif: 'bench' },
  'v1-6': { hl: ['引き上げ', '降ろせない'], motif: 'pullup' },
  'v1-7': { hl: ['白を切る', '夢'], motif: 'shades' },
  'v1-8': { hl: ['遮光', '実況', 'オン', 'オフ'], motif: 'toggles' },
  'hook-1': { hl: ['取り戻す', '返して'], motif: 'moon' },
  'hook-2': { hl: ['夢', '目を閉じる'], motif: 'eye' },
  'hook-3': { hl: ['再生', '選択'], motif: 'play' },
  'hook-4': { hl: ['見慣れた', 'いつだ'], motif: 'mirror' },
  'v2-1': { hl: ['高須', '二度', 'YouTube'], motif: 'collab' },
  'v2-2': { hl: ['すぐ', '未払い'], motif: 'invoice' },
  'v2-3': { hl: ['十三年', '十三', '仏教最高位'], motif: 'thirteen' },
  'v2-4': { hl: ['無我', '無理', 'どこだ'], motif: 'muga' },
  'v2-5': { hl: ['感謝', 'カメラ', '映らず'], motif: 'camera' },
  'v2-6': { hl: ['頭を下げた', '足元'], motif: 'tilt' },
  'v2-7': { hl: ['レイナ', '返済', '今から', '今夜'], motif: 'reply' },
  'v2-8': { hl: ['幕', 'まぶた'], motif: 'curtain' },
  'final-1': { hl: ['自分', 'ツケ'], motif: 'invest' },
  'final-2': { hl: ['顔'], motif: 'live' },
  'punch-1': { hl: [], motif: 'none' },
};

export const C = {
  ink: '#08090d',
  ink2: '#11131b',
  paper: '#ECE7DC',
  dim: 'rgba(236,231,220,0.38)',
  faint: 'rgba(236,231,220,0.08)',
  red: '#FF3B2F',
  redDeep: '#9e1b14',
  blue: '#7FA7FF',
  night: '#0b1533',
  moon: '#F4E2A1',
  gray: '#6b6f7b',
};
