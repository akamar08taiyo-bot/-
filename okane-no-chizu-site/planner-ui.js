(function () {
  'use strict';
  const $=id=>document.getElementById(id), esc=PlannerView.esc, yen=PlannerView.yen, money=PlannerView.compact;
  const steps=['いまの家計','支出の内訳','残しておくお金','変わる時期','目標と仮定','道しるべ'];
  const titles=['まずは、いまの家計から。','支出を並べると、余力が見える。','暮らしを守るお金を、先に。','お金が変わる時期を、地図に。','目標と仮定から、積立を考える。','あなたのお金の道しるべ。'];
  const descriptions=['世帯の手取りと、いま持っているお金を入力します。','月々・年払い・一度だけの支出を分けて整理します。','生活防衛資金と、使う予定のお金を分けて考えます。','休職・教育費・退職など、年齢ごとに調整できます。','月額からでも、目標額からでも。条件を変えて比べます。','収支と使う時期から、次の一歩を考えます。'];
  const categories=['住居','食費','電気・ガス・水道','通信','日用品','交通','保険','ローン返済','車・駐車場','医療','教育','娯楽・サブスク','衣服・美容','交際','家族への支援','その他'];
  const annualCategories=['税・保険の年払い','旅行・帰省','車検・修繕','その他の年払い'];
  const STORAGE='okane-planner-v1'; let current=0,maxVisited=0,analysis=null,fpResult=null,undoMonthly=null,savedSnapshot=null;
  let view={scenario:'assumed',metric:'investments',year:0};
  function fresh(){return {profile:{currentAge:'',endAge:'',monthlyIncome:'',annualIncome:'',cash:'',investments:''},expenses:categories.map((label,i)=>({id:'m'+i,label,monthly:''})),annualExpenses:annualCategories.map((label,i)=>({id:'a'+i,label,annual:''})),expensesConfirmed:false,reserve:{months:6,extraCash:0,lookaheadYears:3},fp:{essentialMonthly:'',essentialConfirmed:false,basis:'total',remainingIncome:0,stressMonths:6},periods:[],oneOffs:[],plan:{monthlyInvestment:'',initialInvestment:0,annualReturn:0,inflation:0,shockAge:'',shockPercent:30},goal:{kind:'value',amount:''},example:false};}
  let state=fresh();
  function num(value){return value===null||value===undefined||String(value).trim()===''?null:Number(value);}
  function get(path){return path.split('.').reduce((v,k)=>v?.[k],state);}
  function set(path,value){const parts=path.split('.');let at=state;parts.slice(0,-1).forEach(k=>{at=at[k];});at[parts.at(-1)]=value;}
  function dotPath(path){return path.replace(/\[(\d+)\]/g,'.$1');}
  function id(path){return 'p-'+dotPath(path).replaceAll('.','-');}
  function field(path,label,unit='円',hint='',options={}){
    const value=get(path), attr=options.signed?' min="-1000000000000"':' min="'+(options.min??0)+'"';
    return '<div class="planner-field" data-field="'+path+'"><label for="'+id(path)+'">'+label+'</label><div class="planner-input"><input id="'+id(path)+'" data-path="'+path+'" type="number" inputmode="'+(options.step===0.1?'decimal':'numeric')+'"'+attr+' max="'+(options.max??1e12)+'" step="'+(options.step??1)+'" value="'+esc(value??'')+'"'+(options.placeholder?' placeholder="'+esc(options.placeholder)+'"':'')+(hint?' aria-describedby="'+id(path)+'-hint"':'')+'><span>'+unit+'</span></div>'+(hint?'<small id="'+id(path)+'-hint">'+hint+'</small>':'')+'</div>';
  }
  function textField(path,label){return '<div class="planner-field"><label for="'+id(path)+'">'+label+'</label><input id="'+id(path)+'" data-path="'+path+'" type="text" maxlength="80" value="'+esc(get(path))+'"></div>';}
  function check(path,label){return '<label class="planner-check"><input id="'+id(path)+'" type="checkbox" data-path="'+path+'"'+(get(path)?' checked':'')+'><span>'+label+'</span></label>';}
  function radio(path,value,label){return '<label><input type="radio" name="'+path+'" data-path="'+path+'" value="'+value+'"'+(get(path)===value?' checked':'')+'>'+label+'</label>';}
  function profile(){return '<div class="planner-example"><button type="button" class="button button-secondary" data-action="example">架空の入力例を読み込む</button></div><div id="profile-fields" class="planner-grid">'+field('profile.currentAge','いまの年齢','歳','18〜99歳。',{min:18,max:99})+field('profile.endAge','何歳まで見る？','歳','現在より先、100歳まで。',{min:19,max:100})+field('profile.monthlyIncome','毎月の手取り')+field('profile.annualIncome','年間の賞与など','円','月収に含めた分は重ねず、なければ0。年間額を月割りし、実際の受取月は再現しません。')+field('profile.cash','現預金')+field('profile.investments','投資の現在時価','円','現在の評価額です。保有がなければ0。')+'</div>';}
  function expenseRows(rows,key){return rows.map((r,i)=>{const path=key+'.'+i;return '<div>'+((key==='expenses'&&i>=16)||(key==='annualExpenses'&&i>=4)?textField(path+'.label','項目名'):'')+field(path+'.'+(key==='expenses'?'monthly':'annual'),esc(r.label||'追加項目'))+((key==='expenses'&&i>=16)||(key==='annualExpenses'&&i>=4)?'<button type="button" class="text-button danger" data-action="remove" data-collection="'+key+'" data-index="'+i+'">この項目を削除</button>':'')+'</div>';}).join('');}
  function expenses(){return '<p class="fine-print">すべて世帯の金額です。手取りに反映済みの税・社会保険料は重ねません。</p><div class="expense-list">'+expenseRows(state.expenses.slice(0,8),'expenses')+'</div><details class="planner-details"'+(state.expenses.slice(8).some(r=>r.monthly!=='')?' open':'')+'><summary>車・医療・教育など、ほかの支出</summary><div class="expense-list">'+state.expenses.slice(8).map((r,j)=>{const i=j+8;return '<div>'+(i>=16?textField('expenses.'+i+'.label','項目名'):'')+field('expenses.'+i+'.monthly',esc(r.label||'追加項目'))+(i>=16?'<button type="button" class="text-button danger" data-action="remove" data-collection="expenses" data-index="'+i+'">この項目を削除</button>':'')+'</div>';}).join('')+'</div></details><button type="button" class="text-button" data-action="add-expense">月の項目を追加</button><details class="planner-details" open><summary>年に数回・年払いの支出</summary><p>年間合計を月割りします。実際の支払月の現金移動は再現しません。毎月の欄に入れた額は重ねません。</p><div class="expense-list">'+expenseRows(state.annualExpenses,'annualExpenses')+'</div><button type="button" class="text-button" data-action="add-annual">年払いの項目を追加</button></details>'+check('expensesConfirmed','支出を確認しました。空欄の金額は0円として計算します。')+'<p class="fine-print">教育費や修繕など一度だけの予定は、次の「変わる時期」に入力できます。</p>';}
  function fpChecks(){return '<details class="planner-details"><summary>返済・保障・年金も確認する</summary><p class="fine-print">FPの考え方に沿う家計整理です。資格者による監修・個別診断ではありません。</p>'+PlannerContent.fpChecks.map(item=>'<details class="planner-details"><summary>'+esc(item.title)+'</summary><p><strong>'+esc(item.question)+'</strong></p><p>'+esc(item.why)+'</p><p>'+esc(item.nextAction)+'</p><a href="'+esc(item.guideHref)+'">関連するガイド</a></details>').join('')+'</details>';}
  function reserves(){const budget=budgetValues();return '<section class="planner-panel"><h2>FPの視点で確認</h2><div class="planner-grid"><div class="planner-field"><span>基礎家計の月平均支出</span><div class="planner-readonly">'+yen(budget.expenses)+'</div></div>'+field('fp.essentialMonthly','最低限必要な月の生活費','円','住居費・食費・返済など、急に止められない支出。任意。')+'</div>'+check('fp.essentialConfirmed','最低生活費の金額と内訳を確認した')+'<fieldset class="planner-fieldset"><legend>防衛資金の基準にする金額</legend><div class="planner-option-row">'+radio('fp.basis','total','今の生活費全体')+radio('fp.basis','essential','確認した最低生活費')+'</div></fieldset><div id="planner-month-comparison"></div><div class="planner-grid">'+field('reserve.months','備えておく期間','か月','月数は選び直せます。安全を保証する基準ではありません。',{max:24})+field('reserve.extraCash','その他に残す現金','円','防衛資金や、次の予定支出と重ねない金額。')+field('reserve.lookaheadYears','何年先までの予定支出を確保？','年','「変わる時期」の予定から取り分けます。',{max:10})+'</div></section><section class="planner-panel"><h2>収入が止まったら？</h2><div class="planner-grid">'+field('fp.remainingIncome','その間も続く月の手取り','円','受給が未確認の給付は見込みに入れません。')+field('fp.stressMonths','確認する期間','か月','通常の人生計画とは別に試算します。',{min:1,max:24})+'</div><div id="planner-stress"></div></section>'+fpChecks();}
  function periodRows(){return state.periods.map((r,i)=>{const path='periods.'+i;return '<section class="planner-period"><div class="period-top">'+textField(path+'.label','期間の名前')+field(path+'.startAge','この年齢から','歳','',{min:18,max:99})+field(path+'.endAge','この年齢になるまで','歳','',{min:19,max:100})+'<button type="button" class="text-button danger" data-action="remove" data-collection="periods" data-index="'+i+'">期間を削除</button></div><div class="period-values">'+field(path+'.monthlyIncome','月平均手取りの上書き','円','賞与込み。空欄＝変更なし。')+field(path+'.expenseDelta','月の支出の増減','円','減らすときはマイナス。',{signed:true})+field(path+'.investmentCap','月の積立上限','円','0＝休止。空欄＝上限なし。')+field(path+'.reserveBase','防衛資金の基準月額','円','空欄＝通常の基準。支出とは別。')+'</div></section>';}).join('');}
  function periods(){return '<div id="planner-period-timeline" class="planner-timeline" role="region" aria-label="年齢別期間の図。横にスクロールできます" tabindex="0"></div><p class="fine-print">スマートフォンでは年齢の図を左右にスクロールできます。「40歳から43歳になるまで」は40・41・42歳の3年間です。年齢だけで投資の可否を判断しません。例えば月3万円から5万円へ増やす場合、希望月額を5万円にして、増やす前の期間の上限を3万円にします。</p><div>'+periodRows()+'</div><div class="planner-row-actions"><button type="button" class="text-button" data-action="add-period">期間を追加</button><button type="button" class="text-button" data-action="add-pause">積立を休む期間を追加</button></div><details class="planner-details" open><summary>一度だけ使うお金</summary><p>指定年齢の年の初めに支払う仮定です。月の支出・年払いと重複させません。</p>'+state.oneOffs.map((r,i)=>{const path='oneOffs.'+i;return '<div class="planner-oneoff">'+field(path+'.age','使う年齢','歳','',{min:18,max:99})+textField(path+'.label','用途')+field(path+'.amount','予定金額')+'<button type="button" class="text-button danger" data-action="remove" data-collection="oneOffs" data-index="'+i+'">予定を削除</button></div>';}).join('')+'<button type="button" class="text-button" data-action="add-oneoff">予定を追加</button></details>'+(state.periods.length===0&&state.oneOffs.length===0?'<p class="planner-empty">予定がなければ、そのまま次へ進めます。後から追加できます。</p>':'');}
  function assumptions(){return '<section class="planner-panel"><h2>月額から、目標から。</h2><div class="planner-grid">'+field('plan.monthlyInvestment','希望する毎月の積立額','円','家計と現金確保を反映して、実行できる額を別に表示します。')+field('plan.initialInvestment','現金からの初回投資希望額','円','現在の投資時価に追加する額。確保したい現金を超える範囲で実行。')+'</div><fieldset class="planner-fieldset"><legend>目標額の意味</legend><div class="planner-option-row">'+radio('goal.kind','value','運用資産の時価')+radio('goal.kind','contributions','新たな入金累計')+'</div></fieldset><div class="planner-grid">'+field('goal.amount','目標額（任意）','円','空欄なら月額からの試算。防衛資金は含めません。',{min:1})+field('profile.endAge','到達したい年齢','歳','試算の終了年齢と同じです。',{min:19,max:100})+'</div><p class="fine-print">入金累計は、今回の初回振替と月末積立の合計。既存投資の取得元本ではなく、売却しても減らない履歴です。</p></section><section class="planner-panel"><h2>リターンは、仮定を変えて比べる。</h2><div class="planner-grid">'+field('plan.annualReturn','仮定の年率','%','−20〜20%。過去年率を自動では採用しません。',{min:-20,max:20,step:0.1})+field('plan.inflation','物価上昇の仮定','%','現在価値表示だけに反映。生活費は自動増額しません。',{max:10,step:0.1})+field('plan.shockAge','一度下落する年齢','歳','比較用の仮定。年の初めに一度下がります。',{min:18,max:99})+field('plan.shockPercent','一度の下落幅','%','初期値30%は予測や損失の下限ではありません。',{max:80,step:0.1})+'</div><p class="planner-block-note">3つの線は0%・入力年率・一度の下落の条件比較です。税・費用・NISA枠の最適化は計算に含めません。</p></section>';}
  function budgetValues(){
    const incomeFields=[num(state.profile.monthlyIncome),num(state.profile.annualIncome)], values=[...state.expenses.map(x=>num(x.monthly)),...state.annualExpenses.map(x=>num(x.annual))];
    const valid=v=>v===null||Number.isFinite(v)&&v>=0&&v<=1e12;
    const expenseKnown=values.every(valid)&&(state.expensesConfirmed||values.some(v=>v!==null));
    const expenseAnnual=state.expenses.reduce((s,r)=>s+(num(r.monthly)||0)*12,0)+state.annualExpenses.reduce((s,r)=>s+(num(r.annual)||0),0);
    const annualIncome=incomeFields.every(v=>v!==null&&valid(v))?incomeFields[0]*12+incomeFields[1]:null;
    return {income:annualIncome===null?null:annualIncome/12,expenses:expenseKnown?expenseAnnual/12:null,surplus:annualIncome===null||!expenseKnown?null:(annualIncome-expenseAnnual)/12};
  }
  function inputData(){
    return {profile:{...state.profile},expenses:state.expenses.map(r=>({...r,monthly:num(r.monthly)??0})),annualExpenses:state.annualExpenses.map(r=>({...r,annual:num(r.annual)??0})),reserve:{...state.reserve,monthlyBase:state.fp.basis==='essential'?num(state.fp.essentialMonthly):null},periods:state.periods.map(r=>({...r})),oneOffs:state.oneOffs.map(r=>({...r})),plan:{...state.plan}};
  }
  function fpInput(){
    const age=num(state.profile.currentAge),years=num(state.reserve.lookaheadYears);
    const planned=state.oneOffs.reduce((sum,r)=>{const a=num(r.age),v=num(r.amount);return a!==null&&a>=age&&a<=age+years&&v!==null?sum+v:sum;},0);
    return {cash:num(state.profile.cash),monthlyExpenses:budgetValues().expenses,essentialMonthly:num(state.fp.essentialMonthly),essentialConfirmed:state.fp.essentialConfirmed,basis:state.fp.basis,months:num(state.reserve.months),plannedCash:planned,otherReservedCash:num(state.reserve.extraCash),remainingIncome:num(state.fp.remainingIncome),stressMonths:num(state.fp.stressMonths)};
  }
  function currentFP(){try{return PlannerBridge.calculateFP(inputData(),fpInput());}catch{return null;}}
  function rail(){
    if(current===3||current===5){$('planner-rail').hidden=true;return;}
    $('planner-rail').hidden=false;
    const b=budgetValues(),row=(label,v,total=false)=>'<div'+(total?' class="rail-total"':'')+'><dt>'+label+'</dt><dd>'+ (v===null?'未入力':money(v))+'</dd></div>';
    if(current===2){
      const f=currentFP(); $('planner-rail').innerHTML='<h2>現金の置き分け</h2>'+(f?'<dl>'+row('現預金',num(state.profile.cash))+row('生活防衛資金',f.emergencyTarget)+row('近く使うお金',f.plannedCash)+row('その他に残す現金',f.otherReservedCash)+row('取り分け後の差額',f.unallocatedCash,true)+'</dl><p>この差額だけで、投資額は決められません。</p>'+(f.earmarkedShortfall>0?'<p class="planner-amount-negative">予定資金等だけで '+money(f.earmarkedShortfall)+' 不足。</p>':'')+(f.emergencyShortfall>0?'<p class="planner-amount-negative">防衛資金の目標まで '+money(f.emergencyShortfall)+' 不足。</p>':''):'<p>生活費と基準を確認すると、現金の内訳を表示します。</p>');
      $('planner-month-comparison').innerHTML=f?'<div class="planner-compare-months">'+f.comparisons.map(v=>'<button type="button" data-action="reserve-months" data-months="'+v.months+'" aria-pressed="'+(num(state.reserve.months)===v.months)+'">'+v.months+'か月分<b>'+money(v.target)+'</b></button>').join('')+'</div>':'<p class="fine-print">基準を確認すると3・6・12か月分を比較できます。</p>';
      $('planner-stress').innerHTML=f?'<p class="planner-notice">'+f.stress.months+'か月後の現金 '+money(f.stress.closingCash)+(f.stress.firstShortfallMonth===null?' ／ この条件での支払不足なし。':' ／ '+f.stress.firstShortfallMonth+'か月目に不足。')+'</p><p class="fine-print">初回投資前の現金から予定資金等を除いた '+money(f.stress.openingCash)+' で確認。生活費は'+(f.stress.basis==='essential'?'確認した最低生活費':'現在の生活費全体')+' '+yen(f.stress.monthlyExpenses)+'／月です。防衛資金はここから生活費に使うため二度引きません。投資の売却・運用益は含まず、通常の期間計画へ自動挿入しません。</p>':'<p class="fine-print">金額と確認状態を入力すると、残高を表示します。</p>';
      if(f){$('planner-rail').insertAdjacentHTML('beforeend','<p class="fine-print">'+esc(f.meta.currentAge)+'歳の開始時点。期間反映後の生活費全体 '+yen(f.meta.actualMonthlyExpenses)+'／月。確保基準は'+(f.meta.reserveSource==='period'?'期間で指定した額':f.meta.reserveSource==='essential'?'確認した最低生活費':'期間反映後の生活費全体')+' '+yen(f.monthlyBase)+'／月です。</p>');$('planner-month-comparison').insertAdjacentHTML('beforeend',f.meta.explanations.map(x=>'<p class="fine-print">'+esc(x.message)+'</p>').join(''));}
    }else $('planner-rail').innerHTML='<h2>いまの月平均</h2><dl>'+row('収入',b.income)+row(state.expensesConfirmed?'支出':'支出（入力済み）',b.expenses)+row('残るお金',b.surplus,true)+'</dl><p>'+(state.expensesConfirmed?'この差額の全額を投資に回すとは限りません。予定支出と現金の備えを次に確認します。':'支出を入れると、残るお金が見えます。')+'</p>';
  }
  function periodTimeline(){
    if(current!==3)return;const start=num(state.profile.currentAge),end=num(state.profile.endAge);
    if(start===null||end===null||end<=start){$('planner-period-timeline').innerHTML='';return;}
    const rows=state.periods.filter(p=>num(p.startAge)!==null&&num(p.endAge)!==null&&num(p.startAge)>=start&&num(p.endAge)<=end&&num(p.startAge)<num(p.endAge));
    const h=55+rows.length*38,x=a=>30+(a-start)/(end-start)*1120;
    let svg='<svg viewBox="0 0 1180 '+h+'" role="img" aria-label="入力した年齢別期間"><line x1="30" y1="15" x2="1150" y2="15" stroke="#bac6bd"/>';
    for(let i=0;i<=5;i++){const a=start+(end-start)*i/5;svg+='<text x="'+x(a)+'" y="39" text-anchor="middle" fill="#143e35" font-size="15">'+Math.round(a)+'歳</text>';}
    rows.forEach((r,i)=>{const xx=x(num(r.startAge)),yy=59+i*38,w=x(num(r.endAge))-xx;svg+='<rect x="'+xx+'" y="'+(yy-15)+'" width="'+w+'" height="24" rx="3" fill="'+(num(r.investmentCap)===0?'#f0d6c0':'#d5e4d5')+'"/><text x="'+xx+'" y="'+yy+'" fill="#143e35" font-size="14">'+esc(r.label||'期間')+' '+r.startAge+'〜'+r.endAge+'歳未満</text>';});
    $('planner-period-timeline').innerHTML=svg+'</svg>';
  }
  function progress(){ $('planner-progress').innerHTML=steps.map((s,i)=>'<button type="button" data-step="'+i+'"'+(i===current?' aria-current="step"':'')+(i>maxVisited?' disabled':'')+' class="'+(i<current?'is-complete':'')+'"><span>'+ (i+1)+'</span>'+s+'</button>').join('');}
  function render(focus=false){
    $('planner-status').textContent='';
    $('planner-errors').hidden=true;progress(); $('planner-title').textContent=titles[current];$('planner-description').textContent=descriptions[current];
    $('planner-example-note').hidden=!state.example;
    $('planner-stage').classList.toggle('is-wide',current===3||current===5);
    $('planner-fields').innerHTML=current===5?PlannerView.render(analysis,fpResult,view):[profile,expenses,reserves,periods,assumptions][current]();
    $('planner-next').hidden=current===5;$('planner-back').hidden=current===0;$('planner-next').textContent=current===4?'この条件で道しるべを見る':steps[current+1]+'へ';
    rail();periodTimeline();storageStatus();
    if(current===5&&undoMonthly!==null){const button=document.createElement('button');button.type='button';button.className='text-button';button.dataset.action='undo-reference';button.textContent='前の希望月額 '+yen(num(undoMonthly))+' に戻す';$('planner-fields').prepend(button);}
    if(focus){$('planner-title').focus({preventScroll:true});$('planner-progress').scrollIntoView({block:'start'});}
  }
  function stageFor(path){if(path==='profile.endAge')return 0;if(path.startsWith('profile.'))return 0;if(path.startsWith('expenses')||path.startsWith('annualExpenses'))return 1;if(path.startsWith('reserve')||path.startsWith('fp.'))return 2;if(path.startsWith('periods')||path.startsWith('oneOffs'))return 3;return 4;}
  function errorsAll(){
    const input=inputData(), errors=PlannerGoal.validateInput(input,state.goal).map(e=>({...e}));
    document.querySelectorAll('#planner-form input[data-path]').forEach(el=>{if(el.validity.badInput)errors.unshift({field:el.dataset.path,message:'「'+(document.querySelector('label[for="'+el.id+'"]')?.textContent||'入力欄')+'」を有効な数値として入力してください。'});});
    if(!state.expensesConfirmed)errors.push({field:'expensesConfirmed',message:'空欄を0円として扱うことも含め、支出の確認欄をチェックしてください。'});
    const f=fpInput();
    const fpNames={cash:'現預金',monthlyExpenses:'月平均支出',essentialMonthly:'最低生活費',essentialConfirmed:'最低生活費の確認',basis:'防衛資金の基準',months:'備えておく期間',plannedCash:'近い予定支出',otherReservedCash:'その他に残す現金',remainingIncome:'その間も続く手取り',stressMonths:'収入停止を確認する期間'};
    const mapping={cash:'profile.cash',monthlyExpenses:'expensesConfirmed',months:'reserve.months',otherReservedCash:'reserve.extraCash',plannedCash:'oneOffs'};
    PlannerBridge.validateFP(input,f).forEach(e=>errors.push({field:mapping[e.field]||(/^(profile\.|periods)/.test(e.field)?e.field:'fp.'+e.field),message:e.message.replaceAll(e.field,fpNames[e.field]||e.field)}));
    return errors.filter((e,i,a)=>a.findIndex(z=>z.field===e.field&&z.message===e.message)===i);
  }
  function showErrors(errors){
    const box=$('planner-errors');box.hidden=false;box.innerHTML='<p>入力を確認してください。</p><ul>'+errors.map(e=>'<li><button type="button" data-error-field="'+esc(e.field)+'">'+esc(e.message)+'</button></li>').join('')+'</ul>';
    errors.forEach(e=>{const el=$(id(e.field));if(el)el.setAttribute('aria-invalid','true');});box.focus({preventScroll:true});box.scrollIntoView({block:'start'});
  }
  function calculate(){
    const errors=errorsAll();if(errors.length){current=stageFor(errors[0].field);maxVisited=Math.max(maxVisited,current);render();showErrors(errors);return false;}
    try{analysis=PlannerGoal.analyze(inputData(),state.goal);analysis.example=state.example;fpResult=PlannerBridge.calculateFP(inputData(),fpInput());view.year=Math.min(view.year,analysis.comparison.assumed.annualRows.length-1);return true;}catch(e){showErrors(e.errors||[{field:'input',message:'計算できませんでした。入力を見直してください。'}]);return false;}
  }
  function next(){
    if(num(state.profile.currentAge)!==null&&num(state.plan.shockAge)===null)state.plan.shockAge=state.profile.currentAge;
    const errors=errorsAll().filter(e=>stageFor(e.field)<=current);if(errors.length){showErrors(errors);return;}
    if(current===4&&!calculate())return;
    current=Math.min(5,current+1);maxVisited=Math.max(maxVisited,current);render(true);
  }
  function example(){
    state=fresh();state.profile={currentAge:35,endAge:65,monthlyIncome:320000,annualIncome:600000,cash:2000000,investments:0};
    const amounts=[80000,50000,20000,10000,10000,10000,10000,0,10000,5000,15000,10000,5000,5000,0,0];state.expenses.forEach((r,i)=>r.monthly=amounts[i]);state.annualExpenses.forEach(r=>r.annual=0);
    state.expensesConfirmed=true;state.fp={essentialMonthly:180000,essentialConfirmed:true,basis:'essential',remainingIncome:0,stressMonths:6};state.oneOffs=[{id:'example-spend',label:'予定する支出',age:37,amount:600000}];
    state.periods=[{id:'example-pause',label:'教育費が増える時期',startAge:40,endAge:43,monthlyIncome:null,expenseDelta:50000,investmentCap:0,reserveBase:null},{id:'example-retirement',label:'退職後',startAge:60,endAge:65,monthlyIncome:180000,expenseDelta:-30000,investmentCap:null,reserveBase:null}];
    state.plan={monthlyInvestment:50000,initialInvestment:0,annualReturn:3,inflation:2,shockAge:50,shockPercent:30};state.goal={kind:'value',amount:20000000};state.example=true;maxVisited=4;analysis=null;undoMonthly=null;render();$('planner-status').textContent='架空の入力例です。本人の家計や推奨値ではありません。必要な欄を自分の数字へ変更できます。';
  }
  function storageStatus(){try{const raw=localStorage.getItem(STORAGE);$('planner-storage-state').textContent=raw?'このブラウザに保存があります。自動では読み込みません。':'まだ保存していません。';}catch{$('planner-storage-state').textContent='この環境では端末への保存を利用できません。試算は続けられます。';}}
  function safeState(saved){
    if(!saved||saved.format!=='okane-planner'||saved.version!==1||!saved.state||typeof saved.state!=='object')throw Error('format');
    const src=saved.state,out=fresh(), scalar=v=>v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=300;
    for(const group of ['profile','reserve','fp','plan','goal']){if(!src[group]||typeof src[group]!=='object'||Array.isArray(src[group]))throw Error('group');for(const key of Object.keys(out[group])){if(!scalar(src[group][key]))throw Error('value');out[group][key]=src[group][key];}}
    const fields={expenses:['id','label','monthly'],annualExpenses:['id','label','annual'],periods:['id','label','startAge','endAge','monthlyIncome','expenseDelta','investmentCap','reserveBase'],oneOffs:['id','label','age','amount']};
    for(const [group,keys] of Object.entries(fields)){if(!Array.isArray(src[group])||src[group].length>(['periods','oneOffs'].includes(group)?12:100))throw Error('array');out[group]=src[group].map(row=>{const item={};for(const key of keys){if(!scalar(row?.[key]))throw Error('row');item[key]=row[key];}return item;});}
    if(typeof src.expensesConfirmed!=='boolean'||typeof src.fp.essentialConfirmed!=='boolean'||!['total','essential'].includes(src.fp.basis)||!['value','contributions'].includes(src.goal.kind))throw Error('flags');
    out.expensesConfirmed=src.expensesConfirmed;out.example=src.example===true;return out;
  }
  function downloadCSV(){const blob=new Blob([PlannerView.csv(analysis,view)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='okane-roadmap-'+view.scenario+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('planner-status').textContent='年別CSVを作成しました。保存先の家計情報はご自身で管理してください。';}
  $('planner-form').addEventListener('submit',e=>{e.preventDefault();next();});
  $('planner-back').addEventListener('click',()=>{current=Math.max(0,current-1);render(true);});
  $('planner-form').addEventListener('input',e=>{
    const target=e.target,path=target.dataset.path;if(!path)return;
    set(path,target.type==='checkbox'?target.checked:target.value);target.removeAttribute('aria-invalid');analysis=null;
    if(path.startsWith('expenses.')||path.startsWith('annualExpenses.')){state.expensesConfirmed=false;const c=$('p-expensesConfirmed');if(c)c.checked=false;}
    rail();periodTimeline();
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='planner-scenario'){view.scenario=e.target.value;render();}
    if(e.target.id==='planner-metric'){view.metric=e.target.value;$('planner-chart').innerHTML=PlannerView.chart(analysis,view);}
  });
  document.addEventListener('input',e=>{if(e.target.id==='planner-year'){view.year=Number(e.target.value);$('planner-chart').innerHTML=PlannerView.chart(analysis,view);$('planner-year-summary').innerHTML=PlannerView.yearSummary(analysis,view);$('planner-year-label').textContent=analysis.comparison.assumed.annualRows[view.year].age+'歳';}});
  document.addEventListener('click',e=>{
    const step=e.target.closest('[data-step]');if(step){const index=Number(step.dataset.step);if(index<=maxVisited){if(index===5&&!calculate())return;current=index;render(true);}return;}
    const error=e.target.closest('[data-error-field]');if(error){const path=dotPath(error.dataset.errorField);current=stageFor(path);render();const el=$(id(path));if(el){let p=el.parentElement;while(p){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;}el.focus();}else $('planner-title').focus();return;}
    const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action;
    if(action==='example'){if((num(state.profile.currentAge)!==null||num(state.profile.cash)!==null)&&!confirm('現在の入力を架空の例に置き換えます。保存済みデータは変わりません。'))return;example();return;}
    if(action==='reserve-months'){state.reserve.months=Number(b.dataset.months);$(id('reserve.months')).value=state.reserve.months;rail();return;}
    if(action==='add-expense'||action==='add-annual'){const key=action==='add-expense'?'expenses':'annualExpenses';if(state[key].length>=100){$('planner-status').textContent='項目は各100件までです。';return;}const item={id:'custom-'+Date.now(),label:'追加項目',[key==='expenses'?'monthly':'annual']:''};state[key].push(item);state.expensesConfirmed=false;render();const target=$(id(key+'.'+(state[key].length-1)+'.label'));target.closest('details')?.setAttribute('open','');target.focus();return;}
    if(action==='add-period'||action==='add-pause'){if(state.periods.length>=12){$('planner-status').textContent='期間は12件までです。';return;}state.periods.push({id:'period-'+Date.now(),label:action==='add-pause'?'積立を休む期間':'収支が変わる期間',startAge:state.profile.currentAge,endAge:state.profile.endAge,monthlyIncome:null,expenseDelta:0,investmentCap:action==='add-pause'?0:null,reserveBase:null});render();$(id('periods.'+(state.periods.length-1)+'.label')).focus();return;}
    if(action==='add-oneoff'){if(state.oneOffs.length>=12){$('planner-status').textContent='一度だけの支出は12件までです。';return;}state.oneOffs.push({id:'spend-'+Date.now(),label:'予定する支出',age:state.profile.currentAge,amount:''});render();$(id('oneOffs.'+(state.oneOffs.length-1)+'.label')).focus();return;}
    if(action==='remove'){state[b.dataset.collection].splice(Number(b.dataset.index),1);if(['expenses','annualExpenses'].includes(b.dataset.collection))state.expensesConfirmed=false;render();return;}
    if(action==='edit-assumptions'){current=4;render(true);return;}
    if(action==='apply-reference'){if(!analysis.reference.canApply)return;const amount=analysis.reference.monthlyRequired;undoMonthly=state.plan.monthlyInvestment;state.plan.monthlyInvestment=amount;if(calculate()){current=5;render();$('planner-status').textContent='参考月額 '+yen(amount)+' を希望額にして家計を再計算しました。実行額は家計条件で制限されます。';}return;}
    if(action==='undo-reference'){state.plan.monthlyInvestment=undoMonthly;undoMonthly=null;if(calculate()){current=5;render();$('planner-status').textContent='前の希望月額へ戻しました。';}return;}
    if(action==='csv'){downloadCSV();return;}
    if(action==='print'){const details=[...document.querySelectorAll('#planner-fields details')],prev=details.map(d=>d.open);details.forEach(d=>d.open=true);window.print();details.forEach((d,i)=>d.open=prev[i]);}
  });
  $('planner-save').addEventListener('click',()=>{try{localStorage.setItem(STORAGE,JSON.stringify({format:'okane-planner',version:1,savedAt:new Date().toISOString(),state}));savedSnapshot=JSON.stringify(state);$('planner-status').textContent='この端末のブラウザに入力を保存しました。変更後はもう一度保存してください。';}catch{$('planner-status').textContent='保存できませんでした。端末の保存設定・容量を確認してください。入力と試算はこの画面に残っています。';}storageStatus();});
  $('planner-load').addEventListener('click',()=>{try{const raw=localStorage.getItem(STORAGE);if(!raw){$('planner-status').textContent='このブラウザに保存された入力はありません。';return;}if(raw.length>1e6)throw Error('size');const loaded=safeState(JSON.parse(raw));if(!confirm('現在の入力を保存した内容に置き換えますか？'))return;state=loaded;savedSnapshot=JSON.stringify(state);analysis=null;undoMonthly=null;current=0;maxVisited=4;render(true);$('planner-status').textContent='保存した入力を読み込みました。例のデータは例として表示し、結果は入力確認後に再計算します。';}catch{$('planner-status').textContent='保存データを読み込めませんでした。現在の入力は変更していません。';}});
  $('planner-delete').addEventListener('click',()=>{if(!confirm('このブラウザに保存した家計データを削除しますか？画面の入力は残ります。'))return;try{localStorage.removeItem(STORAGE);$('planner-status').textContent='保存データを削除しました。画面の入力も消す場合は「入力を最初から」を押してください。';}catch{$('planner-status').textContent='保存データを削除できませんでした。ブラウザのサイトデータ設定から確認してください。';}storageStatus();});
  $('planner-reset').addEventListener('click',()=>{if(!confirm('画面の入力を消して最初から始めますか？保存済みデータは残ります。'))return;state=fresh();current=0;maxVisited=0;analysis=null;undoMonthly=null;view={scenario:'assumed',metric:'investments',year:0};render(true);$('planner-status').textContent='画面の入力を消去しました。保存済みデータの削除は別の操作です。';});
  window.addEventListener('beforeunload',e=>{if(num(state.profile.currentAge)!==null&&JSON.stringify(state)!==savedSnapshot){e.preventDefault();e.returnValue='';}});
  window.addEventListener('resize',()=>{if(current===5&&analysis)$('planner-chart').innerHTML=PlannerView.chart(analysis,view);});
  render();
}());
