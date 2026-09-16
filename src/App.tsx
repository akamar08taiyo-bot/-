import {useState} from 'react';
import {useAuthUser} from './lib/useAuthUser';
import {Nav} from './components/Nav';
import {HomePage} from './pages/HomePage';
import {WeightPage} from './pages/WeightPage';
import {MealsPage} from './pages/MealsPage';
import {PresetsPage} from './pages/PresetsPage';
import {SnacksPage} from './pages/SnacksPage';
import {WorkoutsPage} from './pages/WorkoutsPage';
import {SupplementsPage} from './pages/SupplementsPage';
import {HealthChecksPage} from './pages/HealthChecksPage';
import {SettingsPage} from './pages/SettingsPage';
import {ComingSoon} from './components/ui';

export type ScreenKey =
  | 'home'
  | 'meals'
  | 'presets'
  | 'snacks'
  | 'workouts'
  | 'supplements'
  | 'weight'
  | 'healthChecks'
  | 'mealSuggestion'
  | 'assistant'
  | 'weeklyReport'
  | 'preCheckupMode'
  | 'settings';

export default function App() {
  const {user, error} = useAuthUser();
  const [screen, setScreen] = useState<ScreenKey>('home');

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <p className="mb-2 text-lg font-bold text-slate-800">Firebaseの設定が必要です</p>
          <p className="text-sm text-slate-600">
            <code>.env.example</code> を <code>.env.local</code> にコピーし、Firebaseプロジェクトの
            Web SDK設定値を入力してから開発サーバーを再起動してください。
          </p>
          <p className="mt-3 text-xs text-slate-400">{String(error)}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        読み込み中…
      </div>
    );
  }

  const uid = user.uid;

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav active={screen} onSelect={setScreen} />
      <main>
        {screen === 'home' && <HomePage uid={uid} onNavigate={setScreen} />}
        {screen === 'meals' && <MealsPage uid={uid} />}
        {screen === 'presets' && <PresetsPage uid={uid} />}
        {screen === 'snacks' && <SnacksPage uid={uid} />}
        {screen === 'workouts' && <WorkoutsPage uid={uid} />}
        {screen === 'supplements' && <SupplementsPage uid={uid} />}
        {screen === 'weight' && <WeightPage uid={uid} />}
        {screen === 'healthChecks' && <HealthChecksPage uid={uid} />}
        {screen === 'settings' && <SettingsPage uid={uid} />}
        {screen === 'mealSuggestion' && (
          <div className="mx-auto max-w-2xl p-4">
            <ComingSoon label="献立提案" />
          </div>
        )}
        {screen === 'assistant' && (
          <div className="mx-auto max-w-2xl p-4">
            <ComingSoon label="AIアシスタント" />
          </div>
        )}
        {screen === 'weeklyReport' && (
          <div className="mx-auto max-w-2xl p-4">
            <ComingSoon label="週次レポート" />
          </div>
        )}
        {screen === 'preCheckupMode' && (
          <div className="mx-auto max-w-2xl p-4">
            <ComingSoon label="健診前モード" />
          </div>
        )}
      </main>
    </div>
  );
}
