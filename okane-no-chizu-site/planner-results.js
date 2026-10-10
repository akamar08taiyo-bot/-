(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const yen = value => Number.isFinite(value) ? Math.round(value).toLocaleString('ja-JP') + ' 円' : '—';
  const compact = value => !Number.isFinite(value) ? '—' : Math.abs(value) >= 1e8 ? (value / 1e8).toLocaleString('ja-JP',{maximumFractionDigits:2})+' 億円' : Math.abs(value) >= 1e4 ? (value / 1e4).toLocaleString('ja-JP',{maximumFractionDigits:1})+' 万円' : yen(value);
  const names = {assumed:'入力年率',zeroReturn:'0%',shock:'一度の下落'};
  const flow=(row,key)=>row.kind==='start'?0:row[key];
  function chart(analysis, view) {
    const keys=['zeroReturn','assumed','shock'], colors=['#939d9c','#387d56','#ca743a'];
    const arrays=keys.map(k=>analysis.comparison[k].annualRows);
    const values=arrays.flatMap(rows=>rows.map(r=>r[view.metric]));
    let low=Math.min(0,...values), high=Math.max(1,...values);
    const span=high-low; high+=span*.07;if(low<0)low-=span*.03;
    const mobile=root.innerWidth<760,width=mobile?360:860,height=mobile?300:340,left=mobile?54:88,right=20,top=20,bottom=52,plotW=width-left-right,plotH=height-top-bottom;
    const n=arrays[0].length-1, x=i=>left+i/n*plotW, y=v=>top+(high-v)/(high-low)*plotH;
    const unit=Math.max(Math.abs(low),Math.abs(high))>=1e8?1e8:1e4, label=unit===1e8?'億円':'万円';
    let svg='<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-labelledby="planner-chart-title"><title id="planner-chart-title">'+esc(view.metric==='investments'?'運用資産の時価':'現金と運用残高の合計')+'の3条件比較。年別表で数値を確認できます。</title><text x="'+(width-right)+'" y="14" text-anchor="end">'+label+'</text>';
    for(let i=0;i<=4;i++){const value=low+(high-low)*i/4, yy=y(value);svg+='<line x1="'+left+'" y1="'+yy+'" x2="'+(width-right)+'" y2="'+yy+'" stroke="#dde2d9"/><text x="'+(left-10)+'" y="'+(yy+5)+'" text-anchor="end">'+(value/unit).toLocaleString('ja-JP',{maximumFractionDigits:Math.abs(high/unit)<10?1:0})+'</text>';}
    const step=Math.max(1,Math.ceil(n/(mobile?4:6)));
    for(let i=0;i<=n;i++){if(i%step!==0&&i!==n)continue;if(i!==n&&i>n-step*.5)continue;svg+='<text x="'+x(i)+'" y="'+(height-19)+'" text-anchor="middle">'+arrays[0][i].age+'歳</text>';}
    arrays.forEach((rows,index)=>{svg+='<polyline fill="none" stroke="'+colors[index]+'" stroke-width="3" points="'+rows.map((r,i)=>x(i).toFixed(2)+','+y(r[view.metric]).toFixed(2)).join(' ')+'"/>';});
    svg+='<line x1="'+x(view.year)+'" y1="20" x2="'+x(view.year)+'" y2="'+(height-bottom)+'" stroke="#143e35" stroke-dasharray="4 5"/>';
    arrays.forEach((rows,index)=>{const row=rows[view.year];svg+='<circle cx="'+x(view.year)+'" cy="'+y(row[view.metric])+'" r="4" fill="'+colors[index]+'"/>';});
    return svg+'</svg>';
  }
  function yearSummary(analysis,view) {
    const r=analysis.comparison[view.scenario].annualRows[view.year];
    return '<p class="fine-print">'+r.age+'歳時点 ／ '+names[view.scenario]+'。現金確保の基準は同時点の'+yen(r.reserveBase)+'／月。</p><div class="planner-year-summary"><div><span>現金</span><strong>'+compact(r.cash)+'</strong></div><div><span>運用残高</span><strong>'+compact(r.investments)+'</strong></div><div><span>この年の最大支払不足</span><strong>'+compact(r.maxShortfall||0)+'</strong></div></div><p class="fine-print">確保する現金の目安 '+compact(r.protectedCash)+' ／ 目安との差 '+compact(Math.max(0,r.protectedCash-Math.max(0,r.cash)))+'</p>';
  }
  function table(analysis,view) {
    const rows=analysis.comparison[view.scenario].annualRows;
    const heads=['時点・期間','年の手取り','通常支出','臨時支出','初回振替','月末積立合計','取り崩し','現金','運用時価','確保する現金','最大支払不足'];
    return '<div class="table-scroll" tabindex="0" role="region" aria-label="年ごとの家計と残高。横にスクロールできます"><table><caption>'+names[view.scenario]+' ／ 金額は円。開始時は初回振替後の残高で、フロー欄は0。初回振替は初年度の年計に一度だけ載せます。残高は各区間の終了年齢に達した時点です。年齢区間ごとの集計で、NISAの暦年管理とは異なります。</caption><thead><tr>'+heads.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr><th scope="row">'+(r.kind==='start'?r.age+'歳 開始':r.startAge+'〜'+r.endAge+'歳未満')+'</th>'+[...['income','expenses','oneOff','initialInvestment','contribution','withdrawal'].map(k=>flow(r,k)),r.cash,r.investments,r.protectedCash,r.maxShortfall].map(v=>'<td>'+yen(v||0)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  function roadmap(analysis,view) {
    const rows=analysis.comparison[view.scenario].annualRows.slice(1);
    const groups=[];
    rows.forEach(r=>{
      const monthly=analysis.comparison[view.scenario].monthlyRows.filter(m=>m.age===r.startAge), amounts=monthly.map(m=>m.contribution);
      const min=Math.min(...amounts),max=Math.max(...amounts),hasDefence=monthly.some(m=>m.cash<m.protectedCash-0.01);
      const previous=groups.at(-1),shortfall=r.maxShortfall>0;
      if(previous&&Math.abs(previous.min-min)<0.01&&Math.abs(previous.max-max)<0.01&&previous.hasDefence===hasDefence&&previous.shortfall===shortfall){previous.endAge=r.endAge;previous.investments=r.investments;previous.maxShortfall=Math.max(previous.maxShortfall,r.maxShortfall);}
      else groups.push({...r,min,max,hasDefence,shortfall});
    });
    return '<ol class="planner-roadmap">'+groups.map(r=>{
      const {min,max,hasDefence}=r;
      const title=max===0?'積立を休む期間':min<max-0.01?'月ごとの積立額が変わる期間':'積立を続ける期間';
      return '<li><time>'+r.startAge+'〜'+r.endAge+'歳未満</time><div><strong>'+title+'</strong><p>月末積立 '+(Math.abs(max-min)<0.01?compact(max):compact(min)+'〜'+compact(max))+' ／ '+r.endAge+'歳時点の運用残高 '+compact(r.investments)+'</p>'+(hasDefence?'<p>確保したい現金を下回る月があります。</p>':'')+(r.maxShortfall>0?'<p class="planner-amount-negative">この期間の最大支払不足 '+compact(r.maxShortfall)+'</p>':'')+'</div></li>';
    }).join('')+'</ol>';
  }
  function nextSteps(analysis,fp) {
    const base=analysis.comparison.assumed, items=[];
    if(base.maxShortfall>0)items.push(['支払不足の時期を先に確認','最初の不足は'+base.firstShortfall.age+'歳の'+(base.firstShortfall.monthInYear+1)+'か月目。目標の達成とは別に、家計の予定を見直します。','guide.html#chapter-03']);
    if(fp.earmarkedShortfall>0||fp.emergencyShortfall>0)items.push(['暮らしを守る現金を整理','予定支出と生活防衛資金を分け、足りない額を先に確認しましょう。','library.html#bonus-02']);
    if(base.pauseIntervals.length)items.push(['休止・再開の条件を確認','入力した期間の家計と、再開した後の月額を見直しましょう。','guide.html#chapter-03']);
    if(analysis.hasGoal&&analysis.scenarios.assumed.gap<0)items.push(['月額・期限・目標を比べる','入力年率の試算では目標に届きません。条件を一つずつ変えて確認できます。','library.html#bonus-02']);
    items.push(['使う予定のお金を確認','年齢ごとの支出と、現金で確保する期間を確認しましょう。','guide.html#chapter-02']);
    items.push(['商品の違いを知る','資産範囲・値下がり・費用を同じ項目で比べます。','guide.html#chapter-15']);
    return items.slice(0,3).map((v,i)=>'<div class="planner-next-item"><span>0'+(i+1)+'</span><div><h3>'+v[0]+'</h3><p>'+v[1]+'</p><a href="'+v[2]+'">関連する無料資料を読む</a></div></div>').join('');
  }
  function learning() {
    return (root.PlannerContent?.learning||[]).map(item=>{
      const hist=item.referenceTicker?(root.MARKET_DATA?.series||[]).find(s=>s.ticker===item.referenceTicker):null;
      return '<details><summary>'+esc(item.title)+'</summary><p>'+esc(item.description)+'</p><p><strong>'+esc(item.fitQuestion)+'</strong></p><ul>'+item.risks.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>'+(hist?'<div class="planner-history">参考 '+esc(hist.ticker)+'／2005年末〜2025年末<br><strong>年率換算 '+(hist.cagr*100).toFixed(2)+'%</strong><strong>日次最大下落 '+(hist.maxDrawdownDaily*100).toFixed(2)+'%</strong><br>米ドル建て・調整後終値。ETF内部の経費は価格へ反映済み。円換算・個人の税・売買等の費用を含みません。</div>':'')+'<p class="fine-print">'+esc(item.historyCaveat)+'</p><a href="'+esc(item.learnHref)+'">ガイドで詳しく読む</a></details>';
    }).join('');
  }
  function render(analysis, fp, view) {
    const base=analysis.comparison.assumed, selected=analysis.comparison[view.scenario], goal=analysis.scenarios[view.scenario], ref=analysis.reference;
    const targetLabel=analysis.goal.kind==='contributions'?'新たな入金累計':'運用資産の時価';
    let html='<div class="planner-result-actions"><button type="button" class="button button-secondary" data-action="edit-assumptions">目標・仮定を調整</button><button type="button" class="button button-secondary" data-action="print">結果を印刷・PDF保存</button></div>';
    html+='<div class="planner-summary"><div><span>通常の月平均の残り</span><strong>'+compact(base.baseline.surplus)+'</strong></div><div><span>希望する月末積立</span><strong>'+compact(base.input.plan.monthlyInvestment)+'</strong></div><div><span>最初の月の実行額</span><strong>'+compact(base.monthlyRows[0].contribution)+'</strong></div></div>';
    if(selected.maxShortfall>0) html+='<div class="planner-notice warning"><strong>途中の支払いに不足があります。</strong><br>'+selected.firstShortfall.age+'歳の'+(selected.firstShortfall.monthInYear+1)+'か月目から。最大不足 '+yen(selected.maxShortfall)+'。マイナスの現金は不足の記録で、自動借入ではありません。</div>';
    const reserveGap=Math.max(0,...selected.monthlyRows.map(r=>r.protectedCash-Math.max(0,r.cash)),selected.initial.protectedCash-Math.max(0,selected.initial.cash));
    if(reserveGap>0.01)html+='<p class="planner-notice warning">現金確保の目安を下回る時期があります。目安との差の最大 '+compact(reserveGap)+'。支払不足とは別の指標です。</p>';
    const largestYear=Math.max(...selected.annualRows.filter(r=>r.kind!=='start').map(r=>r.totalContribution));
    if(largestYear>1200000)html+='<p class="planner-notice">初回と月末積立の12か月合計は、最大 '+yen(largestYear)+' です。'+(largestYear>3600000?'NISAの年間合計枠360万円を上回ります。':'NISAのつみたて投資枠の年間120万円を上回ります。')+' ここは年齢区間の年計で、暦年の枠判定ではありません。実際の取引年・対象商品・枠を別に確認してください。</p>';
    if(selected.actualInitial<base.input.plan.initialInvestment)html+='<p class="planner-notice">初回投資の希望額 '+yen(base.input.plan.initialInvestment)+' に対し、現金の確保を反映した実行額は '+yen(selected.actualInitial)+' です。</p>';
    if(analysis.hasGoal){
      html+='<section class="planner-panel"><h2>入力条件での目標到達試算</h2><p>'+analysis.endAge+'歳の'+targetLabel+'を '+yen(analysis.goal.amount)+' にする目標です。生活防衛資金・予定支出を達成額へ混ぜません。</p><div class="planner-goal-grid"><div><span>'+names[view.scenario]+'の試算額</span><strong>'+compact(goal.amount)+'</strong></div><div><span>目標との差</span><strong>'+compact(goal.gap)+'</strong></div><div><span>単純化した参考必要月額</span><strong>'+(ref.monthlyRequired===null?'算出できません':yen(ref.monthlyRequired))+'</strong></div></div><p class="fine-print">参考必要額は'+(analysis.goal.kind==='contributions'?'運用率を用いず、入金額だけで計算。':'入力年率・一度の下落なしで計算。')+'明示した休止'+(ref.months-ref.activeMonths)+'か月を除く'+ref.activeMonths+'回の月末積立です。家計・減額上限・取り崩しの制約を含めず、出せる額とは異なります。</p>';
      if(ref.canApply)html+='<button type="button" class="button button-secondary" data-action="apply-reference">参考月額で家計を再試算</button><p class="fine-print">希望月額だけを変更します。元の額へ戻すボタンが表示されます。ほかの家計条件は変えません。</p>';
      if(analysis.goal.kind==='contributions')html+='<div class="planner-summary"><div><span>新たな入金累計</span><strong>'+compact(selected.totals.contributions)+'</strong></div><div><span>取り崩し累計</span><strong>'+compact(selected.totals.withdrawals)+'</strong></div><div><span>'+analysis.endAge+'歳の運用時価</span><strong>'+compact(selected.final.investments)+'</strong></div></div>';
      html+='<p class="fine-print">'+(analysis.goal.kind==='contributions'?'入金累計は取り崩しても減りません。使える残高は運用時価で確認します。':'時価は売却後の手取りではありません。')+' 試算額が目標を上回っても、将来の到達や生活の安全を保証しません。</p></section>';
    }
    html+='<div class="planner-results-grid"><section class="planner-chart-panel"><h2>将来の幅を、自分で比べる</h2><div class="planner-chart-controls"><label>表・ロードマップの条件<select id="planner-scenario">'+Object.entries(names).map(([k,v])=>'<option value="'+k+'"'+(view.scenario===k?' selected':'')+'>'+v+'</option>').join('')+'</select></label><label>グラフの金額<select id="planner-metric"><option value="investments"'+(view.metric==='investments'?' selected':'')+'>運用資産の時価</option><option value="total"'+(view.metric==='total'?' selected':'')+'>現金＋運用残高</option></select></label></div><div class="planner-legend"><span class="line-zero"><i></i>0%</span><span class="line-assumed"><i></i>入力年率 '+base.input.plan.annualReturn+'%</span><span class="line-shock"><i></i>'+base.input.plan.shockAge+'歳で'+base.input.plan.shockPercent+'%下落</span></div><div id="planner-chart">'+chart(analysis,view)+'</div><p class="fine-print">試算は予測ではありません。線の間に確率の意味はありません。0%は損失の下限ではありません。下落後も同じ入力年率で運用する仮定で、最悪ケースや回復時期の予測ではありません。</p><label for="planner-year">見る年齢 <output id="planner-year-label">'+selected.annualRows[view.year].age+'歳</output></label><input id="planner-year" class="planner-slider" type="range" min="0" max="'+(selected.annualRows.length-1)+'" value="'+view.year+'" step="1"><div id="planner-year-summary">'+yearSummary(analysis,view)+'</div></section><aside class="planner-next-panel"><h2>最初に確認すること</h2><p class="fine-print">入力年率の家計試算をもとに表示。</p>'+nextSteps(analysis,fp)+'<a href="#planner-method">使った前提・計算方法</a></aside></div>';
    html+='<section class="planner-panel"><h2>わたしの積立ロードマップ</h2><p>'+names[view.scenario]+'。実際に計算された年齢別の月末積立です。初回振替 '+yen(selected.actualInitial)+' は別に集計します。</p>'+roadmap(analysis,view)+'</section>';
    html+='<details class="planner-details" id="planner-year-table"><summary>年ごとの内訳を見る</summary><button type="button" class="button button-secondary" data-action="csv">この条件の年別CSVを保存</button>'+table(analysis,view)+'</details>';
    html+='<details class="planner-details"><summary>投資先の違いと、過去20年の参考値</summary><p>過去の伸び率から将来の年率を自動設定しません。商品名は比較の参考で、個別の購入指示ではありません。</p><div class="planner-learning">'+learning()+'</div><details class="planner-details"><summary>過去データの共通条件を確認する</summary><ul>'+PlannerContent.overallNotes.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></details><p><a href="compare.html">選定7ETFの20年グラフへ</a></p></details>';
    html+='<section class="planner-panel" id="planner-method"><h2>使った前提・計算方法</h2><p>月初に一度の下落と臨時支出、その後に月利、月末に家計収支と積立を計算します。年払いの収入・支出は月割りです。実際の受取月・支払月の現金移動は再現しません。表示金額は丸めています。月利は (1＋年率) の12分の1乗 − 1。仮定年率 '+base.input.plan.annualReturn+'%、物価上昇率 '+base.input.plan.inflation+'%です。</p><p>税・手数料・不動産価値・負債残高を含みません。NISAの年間枠・非課税効果は自動判定せず、取得価額1,800万円の保有限度額管理もモデル外です。収入・支出を物価に合わせて自動増額せず、物価上昇は現在価値への換算だけに使います。</p><p>終了時の現金＋運用残高 '+compact(selected.final.total)+' ／ 現在の購買力への換算 '+compact(selected.final.presentValue)+'。家計全体の純資産ではありません。</p><p>生活防衛資金は選んだ基準×月数、近い支出と別に確保します。積立は毎月の黒字・期間上限・確保額を超えた現金の範囲。支払いで売却した月は積立しません。固定した最低生活費は自動で増減せず、期間ごとに変更します。</p><p>初期の運用時価は取得元本と区別します。途中で目標を上回っても、終了年齢の残高を確認します。年齢区間の年計はNISAの暦年枠の判定には使えません。</p><p class="fine-print">FPの考え方に沿う家計整理であり、資格者の監修・個別助言・適性診断を示すものではありません。<a href="sources.html">出典</a> ／ <a href="https://www.fsa.go.jp/policy/nisa2/lifeplan-simulator/" target="_blank" rel="noopener noreferrer">金融庁のライフプランシミュレーター</a></p></section>';
    html+='<section class="planner-panel"><h2>次の一歩を、自分で選ぶ。</h2><p>整理を続ける方は無料ガイドへ。口座を検討する方は、希望商品・費用・積立方法・サポートを同じ項目で確認できます。</p><div class="planner-actions"><a class="button button-secondary" href="library.html">無料特典を読む</a><a class="text-link" href="brokers.html">口座の比較項目を見る</a></div><p class="fine-print">現在の金融機関リンクは公式案内です。家計入力値をリンクへ付けて送信しません。</p></section>';
    return html;
  }
  function csv(analysis,view) {
    const rows=analysis.comparison[view.scenario].annualRows;
    const head=['データ種別','条件','開始年齢','時点年齢','区分','手取り円','通常支出円','臨時支出円','初回振替円','月末積立合計円','取り崩し円','現金円','運用時価円','確保する現金円','基準生活費円','最大支払不足円'];
    return '\uFEFF'+[head,...rows.map(r=>[analysis.example?'架空例からの試算':'入力した家計の試算',names[view.scenario],r.startAge??r.age,r.age,r.kind==='start'?'開始時（初回振替後残高・フロー0）':'年計',...['income','expenses','oneOff','initialInvestment','contribution','withdrawal'].map(k=>flow(r,k)),r.cash,r.investments,r.protectedCash,r.reserveBase,r.maxShortfall].map(v=>typeof v==='number'?Math.round(v):v??0))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  }
  root.PlannerView={render,chart,yearSummary,csv,esc,yen,compact};
}(window));
