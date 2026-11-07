#!/usr/bin/env node
// ジェブ（判断AI）の API 版。Claude API で段取りや成果物を採点し、PASS / FAIL を JSON で返す。
// Claude Code の jeb-judge サブエージェントが「別のAIの意見」として呼ぶほか、
// Discord ボットや定期実行など Claude Code の外からも使える。
//
// 使い方:
//   node scripts/judge-text.mjs --task "依頼文" --file 成果物.md [--file 元資料.txt] [--stage plan|deliverable]
// 終了コード: 0=PASS, 1=FAIL, 2=使い方の誤り, 3=APIエラー・判定不能
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const { values } = parseArgs({
  options: {
    task: { type: 'string' },
    file: { type: 'string', multiple: true },
    stage: { type: 'string', default: 'deliverable' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !values.task || !values.file?.length) {
  console.error('使い方: node scripts/judge-text.mjs --task "依頼文" --file 成果物.md [--file 元資料] [--stage plan|deliverable]');
  process.exit(2);
}

const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const rules = ['writing', 'design', 'review']
  .map((n) => readIf(path.join(root, 'knowledge', 'rules', `${n}.md`)))
  .join('\n\n');
const ngPhrases = readIf(path.join(root, 'knowledge', 'dictionary', 'ng-phrases.md'));

const files = values.file.map((f) => {
  if (!existsSync(f)) {
    console.error(`ファイルが見つかりません: ${f}`);
    process.exit(2);
  }
  return `<file path="${f}">\n${readFileSync(f, 'utf8')}\n</file>`;
});

const SYSTEM = `あなたは「ジェブ」という判断AIです。作った本人ではない第三者として、日本語の成果物や段取りを厳しく採点します。
各項目を0〜5の整数で採点し、該当しない項目は -1 にしてください。
対象の全項目が4以上で、ブロッカー（そのまま出すと困る問題）が0件なら PASS、それ以外は FAIL です。
指摘は「場所: 問題 → 直し方」の形で、具体的に書いてください。推測で事実を補わないでください。

# 守るべきルール
${rules}

# AIっぽい言い回しの一覧
${ngPhrases}`;

const schema = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    scores: {
      type: 'object',
      properties: {
        requirements: { type: 'integer', description: '依頼どおりか' },
        accuracy: { type: 'integer', description: '正確さ' },
        japanese: { type: 'integer', description: '日本語' },
        design: { type: 'integer', description: 'デザイン' },
        safety: { type: 'integer', description: '安全' },
        plan: { type: 'integer', description: '段取り（plan のときのみ）' },
      },
      required: ['requirements', 'accuracy', 'japanese', 'design', 'safety', 'plan'],
      additionalProperties: false,
    },
    blockers: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['verdict', 'scores', 'blockers', 'improvements', 'summary'],
  additionalProperties: false,
};

try {
  // Claude Code 本体の課金と分けたい場合は JUDGE_ANTHROPIC_API_KEY にキーを入れる。
  // 未設定なら ANTHROPIC_API_KEY や `ant auth login` の認証を SDK が自動で使う。
  const client = process.env.JUDGE_ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.JUDGE_ANTHROPIC_API_KEY })
    : new Anthropic();
  const response = await client.beta.messages.create({
    model: process.env.JUDGE_MODEL ?? 'claude-opus-5-5',
    max_tokens: 16000,
    // 安全分類器に断られたとき、サーバー側で推奨モデルに切り替えて続行する
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `段階: ${values.stage}\n\n# 人間の依頼\n${values.task}\n\n# 判定する対象\n${files.join('\n\n')}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    console.error('判定AIが回答を断りました:', response.stop_details?.category ?? '', response.stop_details?.explanation ?? '');
    process.exit(3);
  }
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const verdict = JSON.parse(text);
  console.log(JSON.stringify({ model: response.model, ...verdict }, null, 2));
  process.exit(verdict.verdict === 'PASS' ? 0 : 1);
} catch (error) {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error('Claude API の認証に失敗しました。1Password の参照（.env）か `ant auth login` を確認してください。');
  } else if (error instanceof Anthropic.RateLimitError) {
    console.error('Claude API の利用上限に達しました。少し待ってから再実行してください。');
  } else if (error instanceof Anthropic.APIError) {
    console.error(`Claude API エラー ${error.status}: ${error.message}`);
  } else if (error instanceof SyntaxError) {
    console.error('判定結果を JSON として読めませんでした:', error.message);
  } else {
    console.error(`判定できませんでした（Claude API の認証情報がない可能性があります。.env の JUDGE_ANTHROPIC_API_KEY を with-secrets.sh 経由で渡すか、ant auth login を確認）: ${error?.message ?? error}`);
  }
  process.exit(3);
}
