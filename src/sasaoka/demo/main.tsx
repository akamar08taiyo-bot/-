// イヤーズ（株）デモアプリの入口（years.html）。保存場所を分けてから（isolate.ts。いちばん先に読み込む）、止めるスイッチを確かめて（gate.ts）、
// 使えるときだけ住宅改修の申請書・見積書作成（今までのアプリの jutaku-mitsumori/ と同じ本体の App）を出す。
// estimate/main.tsx は読み込むとすぐに画面を出すので使わない（1つのファイルにまとめるビルドでは、あとから読み込む import() も初めに動く）
import './isolate.ts';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '../noZoom.ts';
import App from '../App.tsx';
import '../sasaoka.css';
import {startDemo} from './gate.ts';

startDemo(async () => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App start="estimate" />
    </StrictMode>,
  );
});
