import {
  Home,
  Utensils,
  Star,
  Cookie,
  Dumbbell,
  Pill,
  Scale,
  ClipboardList,
  ChefHat,
  Bot,
  CalendarClock,
  Stethoscope,
  Settings,
} from 'lucide-react';
import type {ScreenKey} from '../App';

export const NAV_ITEMS: {key: ScreenKey; label: string; icon: typeof Home; mvp: boolean}[] = [
  {key: 'home', label: 'ホーム', icon: Home, mvp: true},
  {key: 'meals', label: '食事記録', icon: Utensils, mvp: true},
  {key: 'presets', label: 'よく食べるメニュー', icon: Star, mvp: true},
  {key: 'snacks', label: '間食管理', icon: Cookie, mvp: true},
  {key: 'workouts', label: '筋トレ記録', icon: Dumbbell, mvp: true},
  {key: 'supplements', label: 'サプリ管理', icon: Pill, mvp: true},
  {key: 'weight', label: '体重・体組成', icon: Scale, mvp: true},
  {key: 'healthChecks', label: '健診データ', icon: ClipboardList, mvp: true},
  {key: 'mealSuggestion', label: '献立提案', icon: ChefHat, mvp: false},
  {key: 'assistant', label: 'AIアシスタント', icon: Bot, mvp: false},
  {key: 'weeklyReport', label: '週次レポート', icon: CalendarClock, mvp: false},
  {key: 'preCheckupMode', label: '健診前モード', icon: Stethoscope, mvp: false},
  {key: 'settings', label: '設定', icon: Settings, mvp: true},
];

export function Nav({
  active,
  onSelect,
}: {
  active: ScreenKey;
  onSelect: (key: ScreenKey) => void;
}) {
  return (
    <nav className="w-full overflow-x-auto border-b border-slate-200 bg-white">
      <ul className="flex min-w-max gap-1 px-2 py-2">
        {NAV_ITEMS.map(({key, label, icon: Icon, mvp}) => (
          <li key={key}>
            <button
              onClick={() => onSelect(key)}
              className={`flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs whitespace-nowrap transition-colors ${
                active === key
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-500 hover:bg-slate-50'
              } ${!mvp ? 'opacity-50' : ''}`}
            >
              <Icon size={18} />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
