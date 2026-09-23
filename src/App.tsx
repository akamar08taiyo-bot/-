import {useState} from 'react';
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
  const [screen, setScreen] = useState<ScreenKey>('home');

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav active={screen} onSelect={setScreen} />
      <main>
        {screen === 'home' && <HomePage onNavigate={setScreen} />}
        {screen === 'meals' && <MealsPage />}
        {screen === 'presets' && <PresetsPage />}
        {screen === 'snacks' && <SnacksPage />}
        {screen === 'workouts' && <WorkoutsPage />}
        {screen === 'supplements' && <SupplementsPage />}
        {screen === 'weight' && <WeightPage />}
        {screen === 'healthChecks' && <HealthChecksPage />}
        {screen === 'settings' && <SettingsPage />}
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
