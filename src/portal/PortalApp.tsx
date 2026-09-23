import {ArrowRight, HeartPulse, Home, Sun} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';

interface PortalLink {
  /** ビルド時の base に依存しないよう、ポータルからの相対パスで指定する */
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

const links: PortalLink[] = [
  {
    href: './index.html',
    title: '健康管理アプリ',
    description: '体重・食事・間食・筋トレ・サプリ・健診データを一元管理（データはこの端末にのみ保存）',
    icon: HeartPulse,
  },
  {
    href: './mortgage.html',
    title: '住宅ローン 金利シナリオ・シミュレーター',
    description: '変動金利が上昇した場合の月々返済額・総返済額を試算し、金利との相関をグラフで確認',
    icon: Home,
  },
];

export function PortalApp() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-2xl px-4 py-10">
        <header className="mb-8 flex items-center gap-3">
          <Sun className="h-8 w-8 text-amber-500" aria-hidden />
          <h1 className="text-2xl font-bold">太陽ポータル</h1>
        </header>
        <ul className="space-y-3">
          {links.map(({href, title, description, icon: Icon}) => (
            <li key={href}>
              <a
                href={href}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-400 hover:shadow"
              >
                <Icon className="h-6 w-6 shrink-0 text-slate-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-slate-600">{description}</p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
