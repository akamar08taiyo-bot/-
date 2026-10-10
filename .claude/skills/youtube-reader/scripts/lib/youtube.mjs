// YouTube の視聴ページ・字幕・ストーリーボードの中身を読む部品（通信しない純粋な関数だけ）
import { fmtTime } from './common.mjs';

/** ページ内の chapterRenderer（投稿者のチャプター・自動チャプター）を拾う */
export function chaptersFromHtml(html) {
  const out = [];
  const re = /"chapterRenderer":\{"title":\{"simpleText":("(?:[^"\\]|\\.)*")\},"timeRangeStartMillis":(\d+)/g;
  let m;
  while ((m = re.exec(String(html || '')))) {
    try {
      out.push({ start: Number(m[2]) / 1000, title: JSON.parse(m[1]) });
    } catch {
      /* 壊れた断片は飛ばす */
    }
  }
  const seen = new Set();
  return out.filter((c) => {
    const k = `${c.start}|${c.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 概要欄の「0:00 はじめに」形式の行からチャプターを拾う */
export function chaptersFromDescription(desc) {
  const out = [];
  for (const line of String(desc || '').split(/\r?\n/)) {
    const m = line.match(/^\s*[[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})[\])]?\s*[-–—:：|｜]?\s*(.+?)\s*$/);
    if (!m) continue;
    const t = m[1]
      .split(':')
      .map(Number)
      .reduce((a, n) => a * 60 + n, 0);
    out.push({ start: t, title: m[2] });
  }
  // 0:00 から始まり 3 つ以上あるときだけチャプターとみなす（YouTube と同じ考え方）
  return out.length >= 3 && out[0].start === 0 ? out : [];
}

export function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** 字幕の中身（json3 / srv1 / srv3 / WebVTT のどれでも）→ [{t, text}]（t は秒） */
export function parseCaptionBody(body) {
  const text = String(body || '').replace(/^﻿/, '').trim();
  if (!text) return [];
  if (text.startsWith('{')) {
    try {
      const j = JSON.parse(text);
      const lines = [];
      for (const ev of j.events || []) {
        if (!ev.segs) continue;
        const s = ev.segs
          .map((g) => g.utf8 || '')
          .join('')
          .replace(/\s*\n\s*/g, ' ')
          .trim();
        if (s) lines.push({ t: (ev.tStartMs || 0) / 1000, text: s });
      }
      return lines;
    } catch {
      return [];
    }
  }
  if (text.startsWith('WEBVTT')) return parseVtt(text);
  const lines = [];
  let m;
  const srv1 = /<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  while ((m = srv1.exec(text))) {
    const s = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (s) lines.push({ t: Number(m[1]), text: s });
  }
  if (lines.length) return lines;
  const srv3 = /<p t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  while ((m = srv3.exec(text))) {
    const s = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (s) lines.push({ t: Number(m[1]) / 1000, text: s });
  }
  return lines;
}

/** WebVTT（yt-dlp の字幕など）→ [{t, text}]。自動字幕の「前の行の繰り返し」は落とす */
export function parseVtt(text) {
  const lines = [];
  const blocks = String(text).replace(/\r/g, '').split(/\n\n+/);
  let prev = '';
  for (const b of blocks) {
    const m = b.match(/(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})\s+-->/);
    if (!m) continue;
    const t = (Number(m[1]?.replace(':', '') || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    const body = b
      .split('\n')
      .slice(b.split('\n').findIndex((l) => l.includes('-->')) + 1)
      .map((l) => decodeEntities(l.replace(/<[^>]+>/g, '')).trim())
      .filter(Boolean);
    for (const s of body) {
      if (s === prev) continue;
      lines.push({ t, text: s });
      prev = s;
    }
  }
  return lines;
}

export function captionTracks(pr) {
  const list = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  return list.map((c) => ({
    lang: c.languageCode,
    name: c.name?.simpleText || (c.name?.runs || []).map((r) => r.text).join('') || c.languageCode,
    auto: c.kind === 'asr',
    baseUrl: c.baseUrl,
    needsPoToken: /[?&]exp=xpe/.test(c.baseUrl || ''),
  }));
}

/** 指定の言語順に、手動字幕 → 自動字幕の順で選ぶ */
export function pickTrack(tracks, langs) {
  for (const auto of [false, true]) {
    for (const l of langs) {
      const t = tracks.find((x) => x.auto === auto && (x.lang === l || x.lang.startsWith(`${l}-`)));
      if (t) return t;
    }
  }
  return tracks.find((x) => !x.auto) || tracks[0] || null;
}

/**
 * ストーリーボード（シークバーのプレビュー画像）の仕様を読む。yt-dlp と同じ解釈。
 * spec = "ベースURL|段0|段1|…"、段 = "幅#高さ#コマ数#列#行#間隔ms#名前#sigh"
 * URL の $L は段の番号、$N は名前、名前の中の $M はシートの番号。
 */
export function parseStoryboardSpec(spec, duration) {
  if (!spec || typeof spec !== 'string') return [];
  const parts = spec.split('|');
  const base = parts.shift();
  if (!base) return [];
  const baseUrl = /^https?:/.test(base) ? base : `https://i.ytimg.com/${base.replace(/^\//, '')}`;
  const levels = [];
  parts.forEach((argStr, k) => {
    const a = argStr.split('#');
    if (a.length !== 8) return;
    const [w, h, count, cols, rows] = a.slice(0, 5).map(Number);
    if (![w, h, count, cols, rows].every((n) => Number.isFinite(n) && n > 0)) return;
    const intervalMs = Number(a[5]) || 0;
    const url = `${baseUrl.replace('$L', String(k)).replace('$N', a[6])}&sigh=${a[7]}`;
    const perSheet = cols * rows;
    const frameDur = intervalMs > 0 ? intervalMs / 1000 : duration && count ? duration / count : null;
    levels.push({ level: k, width: w, height: h, count, cols, rows, perSheet, sheets: Math.ceil(count / perSheet), frameDur, url });
  });
  return levels;
}

/** シート数の上限に収まる中で一番大きいコマの段を選ぶ。収まらなければ一番大きい段を間引く */
export function chooseStoryboardLevel(levels, sbMax) {
  if (!levels.length) return null;
  const byWidth = [...levels].sort((a, b) => b.width - a.width);
  const lv = byWidth.find((l) => l.sheets <= sbMax) || byWidth[0];
  let sheets = [...Array(lv.sheets).keys()];
  let thinned = false;
  if (sheets.length > sbMax) {
    const step = sheets.length / sbMax;
    sheets = [...Array(sbMax).keys()].map((i) => Math.floor(i * step));
    thinned = true;
  }
  return { lv, sheets, thinned };
}

/** シート j の時間帯 */
export function sheetRange(lv, j) {
  const first = j * lv.perSheet;
  const last = Math.min(lv.count, first + lv.perSheet) - 1;
  const t0 = lv.frameDur != null ? first * lv.frameDur : null;
  const t1 = lv.frameDur != null ? (last + 1) * lv.frameDur : null;
  return { first, last, t0, t1, label: t0 != null ? `${fmtTime(t0)}〜${fmtTime(t1)}` : '不明' };
}

/** 配信形式の一覧から最大解像度と fps を拾う */
export function formatInfo(pr) {
  const fm = [...(pr?.streamingData?.adaptiveFormats || []), ...(pr?.streamingData?.formats || [])].filter(
    (f) => /^video\//.test(f.mimeType || '') && f.width && f.height,
  );
  if (!fm.length) return null;
  const best = fm.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  const fpsList = [...new Set(fm.map((f) => f.fps).filter(Boolean))].sort((a, b) => a - b);
  return { width: best.width, height: best.height, fps: fpsList };
}
