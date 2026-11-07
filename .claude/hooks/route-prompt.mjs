#!/usr/bin/env node
// UserPromptSubmit フック: 人間→AIのやり取りに毎回「ジェブ（判断AI）」の判断手順を割り込ませる。
// 依頼の種類を判定 → スキル選択 → 他AIへのルート判断 → 検品、の順で動くよう文脈を足す。
import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}
if (process.env.JEB_ROUTER === 'off') process.exit(0);

const prompt = String(input.prompt || '').trim();
// 「はい」「3」などの短い返答には差し込まない
if ([...prompt].length <= 4) process.exit(0);

const lines = [
  '【ジェブ判断プロトコル】',
  '1. 依頼の種類を判定する（動画／画像・サムネ／スライド／記事・文章／議事録・レポート／お金・事務／SNS／Webサイト・公開／開発／質問だけ）。',
  '2. .claude/skills から使うスキルを選ぶ。会社名・案件名が出たら、その案件用のスキルとデザインシステム（ai-ecosystem/design-systems/<案件>）を優先する。',
  '3. ルートを決める: 画像生成→Codex／長い資料・動画のレビュー・Google Workspace→Gemini（Antigravity）／それ以外→Claude Code。詳細は ask-other-ai スキル。',
  '4. 成果物を作る依頼は「段取り→実行（独立した作業はサブエージェントで並列）→jeb-judge で検品→FAILなら直して再検品」の順。質問に答えるだけなら検品は不要。',
];

if (/(請求|振込|振り込|支払|送金|入金|仕訳|見積|経費|invoice|payment)/i.test(prompt)) {
  lines.push('【お金】金額・宛先・日付が確定したら、実行前に必ず人間へ確認を挟む（invoice-moneyforward スキル）。');
}
if (/(投稿|公開|デプロイ|本番|送信|メール送|ツイート|ポスト|publish|deploy)/i.test(prompt)) {
  lines.push('【外部公開】公開・送信は下書きまで作り、リンクを人間に渡して確認してから実行する。');
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: lines.join('\n') },
  }),
);
