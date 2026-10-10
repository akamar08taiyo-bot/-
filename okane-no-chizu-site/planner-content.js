// Generated from content/fp-checks.json and content/planner-learning.json.
// Static educational data. Load before the planner UI; preserve source field names.
"use strict";

window.PlannerContent = {
  "fpChecks": [
    {
      "id": "emergency-reserve",
      "title": "生活防衛資金を考える",
      "question": "収入が減ったり止まったりしたら、日々の支払いを何でつなぎますか？",
      "why": "必要な備えは、家計の支出や収入が戻るまでの期間で変わります。年齢や職種だけで月数を決めず、急な出費にも対応できるかを考えます。",
      "nextAction": "今の家計支出をもとに、備える期間を複数置いて必要額を比べます。使う予定のあるお金とは分け、必要時に引き出せる方法も確認します。",
      "guideHref": "guide.html#chapter-03",
      "sourceUrls": [
        "https://www.jafp.or.jp/personal_finance/fresh/anshinbook/files/anshinbook_1.pdf",
        "https://www.fsa.go.jp/policy/nisa2/invest/index.html"
      ]
    },
    {
      "id": "planned-spending",
      "title": "使う予定のお金を分ける",
      "question": "何に、いつ、いくら使う予定があり、そのお金はどこに分けてありますか？",
      "why": "支払う時期が決まったお金を運用していると、値下がりした時期でも売却が必要になることがあります。予定資金と緊急時の備えを区別しておくと、同じお金への二重の期待を防げます。",
      "nextAction": "用途・支払時期・金額を整理し、毎月支出・年払い・臨時支出のどこに入れたか確認します。同じ費用を複数の欄へ重ねて入れないようにします。",
      "guideHref": "guide.html#chapter-02",
      "sourceUrls": [
        "https://jafp.or.jp/personal_finance/fresh/workbook/files/wb_part6.pdf",
        "https://www.jafp.or.jp/personal_finance/fresh/anshinbook/files/anshinbook_1.pdf"
      ]
    },
    {
      "id": "debt-and-interest",
      "title": "負債と金利を確かめる",
      "question": "借入れの残高、金利、毎回の返済額、完済時期を把握していますか？",
      "why": "返済負担は借入額・金利・期間で変わります。この試算の現金と運用残高の合計は、負債を差し引いた家計全体の純資産ではありません。",
      "nextAction": "返済予定表で条件を整理します。支出に含めた返済額は二重に加えません。この試算は負債残高の推移や繰上返済効果を計算しないため、変更時は借入先でも確認します。",
      "guideHref": "guide.html#chapter-03",
      "sourceUrls": [
        "https://jafp.or.jp/personal_finance/fresh/workbook/files/wb_part1.pdf",
        "https://jafp.or.jp/personal_finance/fresh/workbook/files/wb_part3.pdf"
      ]
    },
    {
      "id": "insurance-and-benefits",
      "title": "保険と公的保障を確認する",
      "question": "病気や休業などのとき、公的制度と加入中の保険で、何がどの条件で対象になりますか？",
      "why": "必要な備えを考えるには、自己負担と保障の範囲の両方を知る必要があります。給付の条件や時期が不明なままでは、当面の支払いに足りるか判断できません。",
      "nextAction": "制度の公式窓口と保険の契約書類で、対象・申請・給付条件を確認します。不明な給付を確定収入として足さず、保険料と保障の重なりも整理します。",
      "guideHref": "guide.html#chapter-03",
      "sourceUrls": [
        "https://www.jafp.or.jp/personal_finance/fresh/anshinbook/files/anshinbook_1.pdf",
        "https://jafp.or.jp/personal_finance/fresh/workbook/files/wb_part4.pdf"
      ]
    },
    {
      "id": "family-life-events",
      "title": "教育・住居・介護を見通す",
      "question": "自分や家族の教育、住まい、介護で、支出や働き方が変わる時期はありますか？",
      "why": "大きな出費は同じ時期に重なることがあります。平均的な費用をそのまま本人の予定額にせず、続く支出、一度の支出、収入の変化を分けて考えます。",
      "nextAction": "該当する予定だけを時期と金額の仮定に分けます。支出が増える期間や積立を休む期間も比べ、未定の金額は確認事項として残します。",
      "guideHref": "guide.html#chapter-18",
      "sourceUrls": [
        "https://jafp.or.jp/personal_finance/fresh/workbook/",
        "https://jafp.or.jp/personal_finance/fresh/workbook/files/wb_part1.pdf",
        "https://jafp.or.jp/personal_finance/fresh/workbook/files/wb_part4.pdf"
      ]
    },
    {
      "id": "retirement-and-pension",
      "title": "老後の収入と年金を確認する",
      "question": "働く収入が変わる時期と、年金の受取見込み・開始時期を分けて確認できていますか？",
      "why": "退職と受給開始の間や、その後の生活で収支が変わることがあります。年金額の見込みと、税・社会保険料を考えた手取りは区別して整理します。",
      "nextAction": "年金の公式通知や照会で加入記録・受取見込み・開始時期を確認し、本人の生活費と並べます。未確認の年金や退職金は受取保証として加えず、仮定を変えて比べます。",
      "guideHref": "guide.html#chapter-32",
      "sourceUrls": [
        "https://jafp.or.jp/personal_finance/fresh/workbook/files/wb_part4.pdf",
        "https://www.fsa.go.jp/policy/nisa2/invest/index.html"
      ]
    },
    {
      "id": "loss-capacity",
      "title": "耐えられる損失を円で考える",
      "question": "投資が値下がりしたとき、生活への影響と気持ちの負担はそれぞれどのくらいですか？",
      "why": "気持ちとして受け入れられる損失と、支払いを続けられる範囲は一致するとは限りません。過去の最大下落だけでは、将来の損失の限界は分かりません。",
      "nextAction": "値下がりを円の金額に直し、収入減や支出増も重ねて比べます。入力した下落率を最悪ケースと決めつけず、積立の減額・休止を含めて検討します。運用に伴う税や費用は別途確認します。",
      "guideHref": "guide.html#chapter-18",
      "sourceUrls": [
        "https://jafp.or.jp/personal_finance/fresh/workbook/files/wb_part6.pdf",
        "https://www.fsa.go.jp/policy/nisa2/invest/index.html"
      ]
    },
    {
      "id": "prepare-for-consultation",
      "title": "相談に持参する情報をそろえる",
      "question": "確認できた事実、置いた仮定、まだ分からないことを分けて説明できますか？",
      "why": "収支・資産・負債と、実現したいことを一緒に示すと、相談で確認したい点が具体的になります。この試算だけで個別の判断が完結するわけではありません。",
      "nextAction": "家計の記録、残高、返済条件、保険・年金の資料、予定と質問を手元に整理します。必要資料と相談範囲・料金を相談先に確かめ、この試算では運用に伴う税金や負債残高の推移を計算していないことも伝えます。",
      "guideHref": "guide.html#chapter-37",
      "sourceUrls": [
        "https://jafp.or.jp/confer/fpsoudan/flow/",
        "https://jafp.or.jp/personal_finance/fresh/workbook/files/wb_part1.pdf"
      ]
    }
  ],
  "learning": [
    {
      "id": "cash",
      "title": "現金・円の預貯金",
      "description": "日常の支払いや近く使う予定のお金を、必要な時期に取り出せる形で持つ考え方です。株式や債券の値動きにさらさずに使う準備ができます。預金の種類ごとに引き出し条件を確かめます。",
      "fitQuestion": "近く使う予定のお金と、急な支払いに備えるお金は、必要な時期に取り出せる形で分けられていますか？",
      "risks": [
        "物価の上昇が利息を上回ると、同じ金額で買えるものが減ります。",
        "定期預金などは、満期や中途解約の条件を確認する必要があります。",
        "ここで扱う円の現金・預貯金と、為替で円換算額が動く外貨預金は性質が異なります。"
      ],
      "historyCaveat": "選定7ETFの中に円の現金・預貯金はありません。過去20年の年率や最大下落率を代用して表示せず、試算の0%も預金金利の予測とは扱いません。",
      "learnHref": "guide.html#chapter-03"
    },
    {
      "id": "global-equities",
      "title": "広く分散した株式・全世界の考え方",
      "description": "先進国や新興国など、国・地域と企業を広げて株式を持つ考え方です。全世界株式の指数にも対象範囲や配分のルールがあり、国や企業へ均等に投資するとは限りません。",
      "fitQuestion": "国や企業の偏りを確認したうえで、世界の株式が同時に下がる期間も見込めていますか？",
      "risks": [
        "国や企業を分けても、世界的な株安で大きく値下がりすることがあります。",
        "時価総額に応じた配分では、大きな市場や企業の影響が強くなります。",
        "海外資産の為替変動や各国の経済・政治情勢が、円で見た成果に影響します。"
      ],
      "historyCaveat": "選定7ETFには全世界株式をそのまま表す商品がないため、この項目に20年の参考数値は付けません。SPY、EFA、EEMの単独実績や単純平均を全世界株式の実績へ置き換えません。",
      "learnHref": "guide.html#chapter-15"
    },
    {
      "id": "us-large-cap",
      "title": "米国の大型株",
      "description": "米国の大型企業に業種をまたいで投資する考え方です。参考のSPYはS\u0026P 500への連動を目指す米国上場ETFです。企業の海外売上があることと、投資する株式市場の国別分散は別に考えます。",
      "fitQuestion": "いま持っている商品も含めて、米国の大型企業にどのくらい投資が重なるか確認しましたか？",
      "risks": [
        "米国の株式市場が下がると、複数の業種を持っていても大きな損失になることがあります。",
        "時価総額の大きい企業の影響が強く、全世界株式などと保有企業が重なる場合があります。",
        "米ドルで増えていても、為替の動きにより円で見た損益は異なります。"
      ],
      "referenceTicker": "SPY",
      "historyCaveat": "参考値はSPY自身の米ドル建て調整後終値による固定期間の結果です。米国株全体や、国内のS\u0026P 500連動投資信託を円で保有した成果ではありません。",
      "learnHref": "guide.html#chapter-15"
    },
    {
      "id": "growth-concentrated",
      "title": "成長企業への集中・NASDAQ100",
      "description": "参考のQQQは、NASDAQ市場の大型非金融企業を対象とするNASDAQ100への連動を目指します。成長企業が多い一方、対象市場や企業規模を絞ることで、特定業種や大型銘柄の影響が強くなります。",
      "fitQuestion": "大型企業や特定業種への偏りが、家計全体の値動きにどう影響するか確認しましたか？",
      "risks": [
        "企業の成長への期待が変わると、株価が大きく下がることがあります。",
        "全世界株式や米国大型株と保有企業が重なり、商品を増やしても分散が広がるとは限りません。",
        "米ドル建ての値動きに加え、円で使うときには為替の影響を受けます。"
      ],
      "referenceTicker": "QQQ",
      "historyCaveat": "QQQの過去実績は、成長株全体や将来成長する企業を見つける能力の実績ではありません。過去年率を国内投資信託の実績や、将来の仮定年率へそのまま移しません。",
      "learnHref": "guide.html#chapter-15"
    },
    {
      "id": "semiconductors",
      "title": "半導体への集中",
      "description": "半導体や製造装置の関連企業に投資するSOXXを参考に、一つの産業に集中する値動きを学びます。複数の企業を持っていても、同じ産業の変化から共通の影響を受けます。",
      "fitQuestion": "一つの業界が大きく下がったとき、使う予定のお金への影響はどのくらいになりますか？",
      "risks": [
        "特定産業の需要や企業への期待が変わると、関連企業が同時に大きく下がることがあります。",
        "米国大型株やNASDAQ100と保有企業が重なり、集中がさらに強まる場合があります。",
        "参考値より深い下落が将来起こる可能性があり、円で見た損益には為替も影響します。"
      ],
      "referenceTicker": "SOXX",
      "historyCaveat": "SOXXは2021年に連動指数を変更しています。20年間同じ指数設計だったとは扱わず、SOX指数に連動する国内投資信託の20年実績へも置き換えません。",
      "learnHref": "guide.html#chapter-24"
    },
    {
      "id": "bonds",
      "title": "債券・米国総合債券の例",
      "description": "国や企業などへの貸付に当たる債券を、複数組み合わせて持つ考え方です。参考のAGGは米国の投資適格債券を広く対象とします。債券にも市場価格の変動があり、円の現金と同じ役割にはなりません。",
      "fitQuestion": "債券価格の下落と為替変動が、円で支払う予定のお金にどう影響するか確認しましたか？",
      "risks": [
        "一般に金利が上がると、既存の債券価格は下がる傾向があります。",
        "発行体が利息や元本を支払えなくなる信用リスクがあり、投資適格という評価も保証ではありません。",
        "米ドル建て債券の価格変動が小さい時期でも、円換算額は為替で大きく変わることがあります。"
      ],
      "referenceTicker": "AGG",
      "historyCaveat": "AGGの米ドル建て実績を、日本の預金・個人向け国債・為替ヘッジ付き商品へ代用しません。債券ETFは元本保証ではなく、保有を続ければ一定額に戻るとは限りません。",
      "learnHref": "guide.html#chapter-23"
    }
  ],
  "overallNotes": [
    "この比較は投資先の範囲と値動きの違いを学ぶためのものです。米国上場ETFの直接購入や、特定の商品・配分があなたに最適だと勧めるものではありません。",
    "過去の年率は将来の期待リターンや推奨の入力値ではありません。仮定年率は自分で設定し、0%や下落の条件も比べます。長く持つことや分散することで利益が保証されるわけではありません。",
    "参考値の共通条件は、2005年12月30日から2025年12月31日までの20年、Yahoo Financeの米ドル建て調整後終値です。2026年途中の値動きは含みません。",
    "調整後終値は株式分割・分配金等の調整を反映した系列です。実際の分配金再投資や手取りを厳密に再現するものではありません。ETF経費の影響は系列に含まれますが、個人の税金・売買費用・円換算は加えていません。",
    "米ドル建ての過去数値と、この家計試算の円建ての将来残高は別の条件です。円で購入する国内投資信託でも、海外資産の為替変動がなくなるとは限りません。為替ヘッジの有無も商品ごとに確認します。",
    "年率換算は期間全体の増減を一定の複利年率へ置き換えた値で、毎年その率で増えたという意味ではありません。毎月一定の利率を使う将来試算は、実際の値動きの順番を再現しません。",
    "最大下落率は期間内の過去最高値から、その後の最も深い下落を日次で測った値です。1年の損失率や将来の最大損失の上限ではありません。さらに大きな下落や長い停滞も起こり得ます。",
    "過去比較は編集上選んだSOXX、QQQ、SPY、IWM、EFA、EEM、AGGの7本だけです。現在まで存続した商品を選ぶ偏りがあり、全商品を網羅した順位や将来の優劣は示しません。複数の商品を持つ場合は投資先の重なりも確認します。",
    "国内投資信託は、その商品自身の設定日、指数、通貨、費用、運用報告書を確認します。外国ETFの履歴を国内商品の20年実績として扱いません。現在の費用・取扱い・NISA対象枠は、運用会社や利用金融機関の公式資料で別途確認します。"
  ]
};
