/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { 
  Trash2, 
  TrendingDown, 
  Plus,
  Calculator,
  BarChart3,
  X as MultiplyIcon,
  PackagePlus,
  ToggleLeft,
  ToggleRight,
  Percent,
  LayoutTemplate,
  ArrowUpDown,
  X,
  AlertTriangle,
  Camera,
  Eye,
  EyeOff,
  Coins,
  Package
} from 'lucide-react';

// --- Gemini API Configuration ---
const apiKey = process.env.GEMINI_API_KEY;

export default function App() {
  // --- 基本情報 ---
  const [staff, setStaff] = useState('久保'); 

  // --- 表示設定 ---
  const [showSimulation, setShowSimulation] = useState(false); 
  const [showCost, setShowCost] = useState(false); 
  const [showCaseMode, setShowCaseMode] = useState(false); // ★新設：ケースモード
  const [isPreviewMode, setIsPreviewMode] = useState(false); 

  // --- AI機能用ステート ---
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetGroupIdForImage, setTargetGroupIdForImage] = useState<string | null>(null);

  // --- 単位設定 ---
  const unitOptions = [
    { label: '容量 (ml)', value: 'ml', defaultBase: 100 },
    { label: '容量 (L)', value: 'L', defaultBase: 1 },
    { label: '重量 (g)', value: 'g', defaultBase: 100 },
    { label: '重量 (kg)', value: 'kg', defaultBase: 1 },
    { label: '長さ (m)', value: 'm', defaultBase: 1 },
    { label: '長さ (cm)', value: 'cm', defaultBase: 100 },
    { label: '枚数 (枚)', value: '枚', defaultBase: 1 },
    { label: '個数 (個)', value: '個', defaultBase: 1 },
    { label: 'セット (組)', value: '組', defaultBase: 1 },
    { label: '本数 (本)', value: '本', defaultBase: 1 },
    { label: 'ケース (箱)', value: '箱', defaultBase: 1 },
  ];

  // --- データ構造 ---
  const [groups, setGroups] = useState<any[]>([
    {
      id: 'g-1',
      title: '', 
      baseVolume: 100,
      baseQuantity: 1,
      unit: 'ml',        
      baseScale: 100,    
      items: [] 
    }
  ]);

  // ★拡張：packSize(入数), casePrice(ケース価格), caseCost(ケース仕入) を追加
  const getEmptyItem = () => ({ name: '', volume: '', packSize: '1', price: '', casePrice: '', cost: '', caseCost: '', targetMargin: '' });
  
  const [newItems, setNewItems] = useState<Record<string, any>>({
    'g-1': getEmptyItem()
  }); 
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [deleteConfirmMap, setDeleteConfirmMap] = useState<Record<string, boolean>>({});

  // --- ★純粋関数: 双方向バインディング計算エンジン ---
  // 変更されたフィールドを起点に、関連するすべての数値を再計算して返す
  const calculatePrices = (item: any, changedField: string) => {
    let { packSize, price, casePrice, cost, caseCost, targetMargin } = item;
    
    // 入数が未入力・0の場合は安全のため内部的に1として計算（ゼロ除算防止）
    const ps = Math.max(Number(packSize) || 1, 1); 
    
    if (changedField === 'packSize') {
      // 入数が変わった場合：バラ価格を基準にケース価格を再計算
      casePrice = (Number(price) || 0) * ps;
      caseCost = (Number(cost) || 0) * ps;
    } 
    else if (changedField === 'casePrice') {
      // ケース価格が変わった場合：バラ価格を逆算
      price = Math.round((Number(casePrice) || 0) / ps);
      targetMargin = ''; // 手動入力とみなし利益率リセット
    } 
    else if (changedField === 'caseCost') {
      // ケース仕入が変わった場合：バラ仕入を逆算
      cost = Math.round((Number(caseCost) || 0) / ps);
      // 目標利益率が設定されていれば売価も連動
      if (targetMargin !== '' && Number(targetMargin) < 100) {
        price = Math.round(cost / (1 - Number(targetMargin) / 100));
        casePrice = price * ps;
      }
    } 
    else if (changedField === 'price') {
      // バラ売価が変わった場合：ケース価格を算出
      casePrice = (Number(price) || 0) * ps;
      targetMargin = ''; // 手動入力とみなし利益率リセット
    } 
    else if (changedField === 'cost') {
      // バラ仕入が変わった場合：ケース仕入を算出
      caseCost = (Number(cost) || 0) * ps;
      if (targetMargin !== '' && Number(targetMargin) < 100) {
        price = Math.round(cost / (1 - Number(targetMargin) / 100));
        casePrice = price * ps;
      }
    } 
    else if (changedField === 'targetMargin') {
      // 利益率が変わった場合：仕入から売価を再計算
      if (targetMargin !== '' && Number(targetMargin) < 100) {
        const c = Number(cost) || 0;
        price = Math.round(c / (1 - Number(targetMargin) / 100));
        casePrice = price * ps;
      }
    }

    return { ...item, packSize, price, casePrice, cost, caseCost, targetMargin };
  };

  // --- 計算ロジック ---
  const computedGroups = useMemo(() => {
    return groups.map(group => {
      const monthlyUsage = (group.baseVolume || 0) * (group.baseQuantity || 0);
      const cleanTitle = group.title ? group.title.replace(/\s*[（(].*?[)）]/g, '').trim() : '';

      const calculatedItems = group.items.map((item: any) => {
        const vol = Number(item.volume);
        const pri = Number(item.price);
        const costVal = Number(item.cost) || 0; 
        
        // 利益計算 (バラ単位ベース)
        const profit = pri - costVal; 
        const margin = pri > 0 ? (profit / pri) * 100 : 0; 

        // 比較単価の計算
        const unitPrice = vol > 0 ? (pri / vol) * group.baseScale : 0;
        const monthlyCost = vol > 0 ? (monthlyUsage / vol) * pri : 0;
        
        return {
          ...item,
          profit,
          margin: Math.round(margin * 10) / 10,
          unitPrice: Math.round(unitPrice * 10) / 10,
          unitPriceRaw: unitPrice,
          monthlyCost: Math.round(monthlyCost),
          yearlyCost: Math.round(monthlyCost * 12)
        };
      });

      if (calculatedItems.length === 0) return { ...group, cleanTitle, items: [], stats: null };

      const sortedForStats = [...calculatedItems].sort((a, b) => b.unitPriceRaw - a.unitPriceRaw);
      const best = sortedForStats[sortedForStats.length - 1]; 
      const worst = sortedForStats[0]; 
      
      const discountRate = worst.unitPriceRaw > 0 ? Math.round(((worst.unitPriceRaw - best.unitPriceRaw) / worst.unitPriceRaw) * 100) : 0;
      const yearlyReduction = worst.yearlyCost - best.yearlyCost;

      return {
        ...group,
        cleanTitle,
        items: calculatedItems,
        stats: { minItem: best, maxItem: worst, discountRate, yearlyReduction, monthlyUsage }
      };
    });
  }, [groups]);

  const totalReduction = useMemo(() => {
    return computedGroups.reduce((sum, g) => sum + (g.stats?.yearlyReduction || 0), 0);
  }, [computedGroups]);

  // --- Gemini API ---
  const callGeminiAPI = async (payload: any) => {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  };

  const handleImageSelect = (groupId: string) => {
    setTargetGroupIdForImage(groupId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetGroupIdForImage) return;

    setIsAiLoading(true);
    setAiError(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const resultStr = reader.result as string;
        const base64Data = resultStr.split(',')[1];
        const prompt = `この画像は商品リストや見積書です。「商品名 (name)」「バラ価格 (price)」「容量 (volume)」を読み取り、JSON配列形式で返してください。`;
        const payload = {
          contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64Data } }] }],
          generationConfig: { responseMimeType: "application/json" }
        };
        const result = await callGeminiAPI(payload);
        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (textResponse) {
          const items = JSON.parse(textResponse);
          if (Array.isArray(items)) {
            setGroups(prevGroups => prevGroups.map(g => {
              if (g.id !== targetGroupIdForImage) return g;
              const newAiItems = items.map(item => ({
                id: `i-ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: item.name || '名称不明',
                volume: Number(item.volume) || 0,
                packSize: 1,
                price: Number(item.price) || 0,
                casePrice: Number(item.price) || 0,
                cost: 0,
                caseCost: 0,
                targetMargin: ''
              }));
              return { ...g, items: [...g.items, ...newAiItems] };
            }));
          }
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setAiError("画像の読み取りに失敗しました。");
    } finally {
      setIsAiLoading(false);
      setTargetGroupIdForImage(null);
      e.target.value = ''; 
    }
  };

  // --- Handlers ---
  const addGroup = () => {
    const newId = `g-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setGroups(prev => [...prev, {
      id: newId, title: '', baseVolume: 100, baseQuantity: 1, unit: 'ml', baseScale: 100, items: []
    }]);
    setNewItems(prev => ({ ...prev, [newId]: getEmptyItem() }));
  };

  const removeGroup = (groupId: string) => {
    if (!deleteConfirmMap[groupId]) {
      setDeleteConfirmMap(prev => ({ ...prev, [groupId]: true }));
      setTimeout(() => setDeleteConfirmMap(prev => ({ ...prev, [groupId]: false })), 3000);
      return;
    }
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setDeleteConfirmMap(prev => {
      const newMap = { ...prev };
      delete newMap[groupId];
      return newMap;
    });
  };

  const guessUnitFromTitle = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('トイレット')) return { unit: '個', baseScale: 1 };
    if (t.includes('アルコール') || t.includes('消毒')) return { unit: 'ml', baseScale: 100 };
    if (t.includes('石鹸') || t.includes('ソープ') || t.includes('洗剤') || t.includes('シャンプー') || t.includes('液')) return { unit: 'ml', baseScale: 100 };
    if (t.includes('ゴミ袋') || t.includes('ポリ袋') || t.includes('手袋') || t.includes('マスク') || t.includes('枚')) return { unit: '枚', baseScale: 1 };
    if (t.includes('ペーパー') || t.includes('タオル') || t.includes('ティッシュ')) return { unit: '枚', baseScale: 1 }; 
    if (t.includes('ラップ') || t.includes('ホイル')) return { unit: 'm', baseScale: 1 };
    return null;
  };

  const updateGroupField = (id: string, field: string, value: any) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== id) return g;
      const updatedGroup = { ...g, [field]: value };
      if (field === 'title') {
        const guess = guessUnitFromTitle(value);
        if (guess) {
          updatedGroup.unit = guess.unit;
          updatedGroup.baseScale = guess.baseScale;
        }
      }
      return updatedGroup;
    }));
  };

  const changeGroupUnit = (groupId: string, newUnitValue: string) => {
    const unitDef = unitOptions.find(u => u.value === newUnitValue);
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, unit: newUnitValue, baseScale: unitDef ? unitDef.defaultBase : 1 } : g));
  };

  const sortGroupItems = (groupId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const sortedItems = [...g.items].sort((a, b) => {
        const unitPriceA = Number(a.volume) > 0 ? (Number(a.price) / Number(a.volume)) : 0;
        const unitPriceB = Number(b.volume) > 0 ? (Number(b.price) / Number(b.volume)) : 0;
        return unitPriceB - unitPriceA;
      });
      return { ...g, items: sortedItems };
    }));
  };

  // ★統合された入力ハンドラ (計算エンジンを経由)
  const handleInputChange = (groupId: string, field: string, value: any) => {
    setNewItems(prevItems => {
      const currentInput = prevItems[groupId] || getEmptyItem();
      // まず値を更新したテンポラリオブジェクトを作成
      const updatedInput = { ...currentInput, [field]: value };
      // 計算エンジンに通して整合性を取る
      const calculatedInput = calculatePrices(updatedInput, field);
      return { ...prevItems, [groupId]: calculatedInput };
    });
  };

  const handleAddItem = (groupId: string) => {
    const input = newItems[groupId];
    // 必須チェック (バラ価格またはケース価格のどちらかがあればOKとするが、基本はprice)
    if (!input || !input.name.trim() || String(input.volume).trim() === '' || String(input.price).trim() === '') return;

    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          items: [...g.items, {
            id: `i-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ...input, // 計算済みの値をすべて展開
            volume: Number(input.volume),
            packSize: Number(input.packSize) || 1,
            price: Number(input.price),
            casePrice: Number(input.casePrice),
            cost: Number(input.cost) || 0,
            caseCost: Number(input.caseCost) || 0
          }]
        };
      }
      return g;
    }));
    setNewItems(prev => ({ ...prev, [groupId]: getEmptyItem() }));
  };

  // ★統合された編集ハンドラ (計算エンジンを経由)
  const updateItem = (groupId: string, itemId: string, field: string, value: any) => {
    setGroups(prevGroups => prevGroups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          items: g.items.map((i: any) => {
            if (i.id !== itemId) return i;
            const updatedItem = { ...i, [field]: value };
            // 計算エンジンに通して整合性を取る
            return calculatePrices(updatedItem, field);
          })
        };
      }
      return g;
    }));
  };

  const deleteItem = (groupId: string, itemId: string) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, items: g.items.filter((i: any) => i.id !== itemId) } : g));
  };

  const handleClearAll = () => {
    if (confirmClearAll) { 
      setGroups([]); setNewItems({}); setConfirmClearAll(false); 
    } else { 
      setConfirmClearAll(true); setTimeout(() => setConfirmClearAll(false), 3000); 
    }
  };

  // --- CSV Logic ---
  const generateCSV = () => {
    let csv = `\ufeff`;
    // Excelで数値として正しく認識・抽出できるように、桁区切りカンマを使用せず生の数値のまま出力します。
    const formatPrice = (num: any) => (num || 0).toString();
    const formatUnitPrice = (num: any) => Number(num || 0).toFixed(1);

    computedGroups.forEach(group => {
      csv += `"商品項目：${group.cleanTitle}",,,,\n`;
      const baseLabel = group.baseScale === 1 ? `1${group.unit}` : `${group.baseScale}${group.unit}`;
      
      // 見積もり用に提出できるお客様向けの項目のみをヘッダーにセット（原価・利益は除外）
      let headers = ['商品名'];
      if (showCaseMode) headers.push('入数');
      headers.push(`容量/数量(${group.unit})`);
      if (showCaseMode) headers.push('ケース価格(円)');
      headers.push('バラ価格(円)');
      headers.push(`${baseLabel}/単価(円)`, '価格差(円)');
      
      csv += headers.join(',') + '\n';

      const baselineItem = group.items[0];
      const baselinePrice = baselineItem ? baselineItem.unitPriceRaw : 0;

      group.items.forEach((item: any) => {
        // 現状品（一番上のアイテム）との差額を計算
        const diffRaw = baselinePrice - item.unitPriceRaw;
        
        const safeName = `"${item.name.replace(/"/g, '""')}"`;
        const volumeStr = item.volume; // 数値のみ出力
        const unitPriceStr = formatUnitPrice(item.unitPriceRaw); 
        const diffStr = formatUnitPrice(diffRaw); 

        // データ行も見出しに合わせて、お客様向けの項目のみをセット
        let row = [safeName];
        if (showCaseMode) row.push(item.packSize);
        row.push(volumeStr);
        if (showCaseMode) row.push(formatPrice(item.casePrice));
        row.push(formatPrice(item.price));
        row.push(unitPriceStr, diffStr);

        csv += row.join(',') + '\n';
      });
      csv += `\n`; 
    });

    return csv;
  };

  const downloadFile = () => {
    const content = generateCSV();
    const blob = new Blob([content], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = '提案書データ.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col print:bg-white text-base">
      
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-[#1f497d] to-[#10253f] text-white shadow-lg sticky top-0 z-50 print:hidden">
        <div className="max-w-[1400px] mx-auto px-4 py-2">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-2">
            <div className="flex items-center gap-3 shrink-0">
              <TrendingDown className="w-8 h-8 text-yellow-400" />
              <div className="flex items-center">
                <h1 className="text-xl font-bold leading-none">お見積書・ご提案書作成</h1>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3 justify-center lg:justify-end items-center text-base w-full">
              {/* モード切替・アクションボタン群 */}
              <div className="flex items-center gap-2 ml-2">
                
                {/* ★新設: ケースモードトグル */}
                <button 
                  onClick={() => setShowCaseMode(!showCaseMode)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded shadow text-sm font-bold transition-all border ${showCaseMode ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-slate-700 border-slate-600 text-slate-400'}`}
                  title="ケース入数とケース価格の入力を有効にします"
                >
                  <Package className="w-4 h-4" />
                  {showCaseMode ? 'ケース入力' : 'ケースOFF'}
                </button>

                <button 
                  onClick={() => setShowCost(!showCost)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded shadow text-sm font-bold transition-all border ${showCost ? 'bg-orange-500 border-orange-600 text-white' : 'bg-slate-700 border-slate-600 text-slate-400'}`}
                  title="仕入・利益率から販売価格を自動計算します"
                >
                  <Coins className="w-4 h-4" />
                  {showCost ? '原価モード' : '原価OFF'}
                </button>

                <div className="h-6 w-px bg-white/20 mx-1"></div>

                <button 
                  onClick={() => setIsPreviewMode(!isPreviewMode)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded shadow text-sm font-bold transition-all border ${isPreviewMode ? 'bg-teal-500 border-teal-600 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}
                >
                  {isPreviewMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {isPreviewMode ? '編集へ' : 'プレビュー'}
                </button>

                <button 
                  onClick={() => setShowSimulation(!showSimulation)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded shadow text-sm font-bold transition-all border ${showSimulation ? 'bg-yellow-500 border-yellow-600 text-white' : 'bg-slate-700 border-slate-600 text-slate-400'}`}
                >
                  {showSimulation ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {showSimulation ? '試算ON' : '試算OFF'}
                </button>
              </div>

              {/* ダウンロードボタン */}
              <div className="flex gap-2 ml-1">
                <button onClick={downloadFile} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white px-4 py-2.5 rounded shadow text-sm font-bold whitespace-nowrap">
                  <LayoutTemplate className="w-4 h-4" /> CSV保存
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto w-full p-4 space-y-4 flex-grow print:p-0 print:w-full">
        
        {/* 全削除ボタン */}
        {groups.length > 0 && !isPreviewMode && (
          <div className="flex justify-end mb-1 print:hidden">
            <button onClick={handleClearAll} className={`text-sm flex items-center gap-1.5 px-4 py-1.5 rounded border transition-all ${confirmClearAll ? 'bg-red-600 text-white font-bold' : 'text-slate-400 hover:text-red-600 border-transparent'}`}>
              <Trash2 className="w-4 h-4" /> {confirmClearAll ? '本当に削除しますか？' : '全データをリセット'}
            </button>
          </div>
        )}

        {/* グループリスト */}
        {computedGroups.map((group) => {
          const inputState = newItems[group.id] || getEmptyItem();
          const canAdd = inputState.name.trim() !== '' && String(inputState.volume).trim() !== '' && String(inputState.price).trim() !== '';

          return (
          <div key={group.id} className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none print:mb-8 ${isPreviewMode ? 'border-slate-300' : ''}`}>
            
            {/* カテゴリヘッダー */}
            <div className={`px-4 py-3 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 print:bg-slate-100 print:border-slate-300 ${isPreviewMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-100 border-slate-200'}`}>
              <div className="flex items-center gap-3 flex-grow">
                <PackagePlus className="w-6 h-6 text-[#1f497d]" />
                <div className="flex flex-col w-full md:w-auto">
                  <div className="relative w-full md:w-72">
                    {isPreviewMode ? (
                      <div className="font-bold text-slate-800 text-xl border-b border-transparent py-1">
                        {group.title || '（カテゴリ名未入力）'}
                      </div>
                    ) : (
                      <input 
                        type="text" 
                        value={group.title}
                        onChange={(e) => updateGroupField(group.id, 'title', e.target.value)}
                        placeholder="商品カテゴリ名"
                        className="bg-white border border-slate-300 rounded px-2 py-1 font-bold text-slate-700 text-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none w-full shadow-sm transition-all print:border-none print:bg-transparent print:p-0 print:text-black"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* 操作ボタン群 */}
              {!isPreviewMode && (
                <div className="flex flex-wrap items-center gap-3 print:hidden">
                  <button 
                    onClick={() => handleImageSelect(group.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-purple-200 text-purple-600 rounded hover:bg-purple-50 text-sm transition shadow-sm"
                  >
                    <Camera className="w-4 h-4" /> <span className="font-bold">AI読取</span>
                  </button>

                  <button 
                    onClick={() => sortGroupItems(group.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-sm text-slate-600 transition shadow-sm"
                  >
                    <ArrowUpDown className="w-4 h-4" /> 並び替え
                  </button>

                  <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded border border-blue-200 text-sm shadow-sm">
                    <span className="text-sm font-bold text-slate-500">単位:</span>
                    <select 
                      value={group.unit} 
                      onChange={(e) => changeGroupUnit(group.id, e.target.value)}
                      className="bg-transparent border-b border-slate-300 outline-none text-[#1f497d] font-bold"
                    >
                      {unitOptions.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                    <div className="h-4 w-px bg-slate-200"></div>
                    <span className="text-sm font-bold text-slate-500">計算基準:</span>
                    <select 
                      value={group.baseScale} 
                      onChange={(e) => updateGroupField(group.id, 'baseScale', Number(e.target.value))}
                      className="bg-transparent border-b border-slate-300 outline-none text-[#1f497d] font-bold"
                    >
                      <option value="1">1{group.unit}あたり</option>
                      <option value="100">100{group.unit}あたり</option>
                      <option value="1000">1000{group.unit}あたり</option>
                    </select>
                  </div>

                  <button 
                    onClick={() => removeGroup(group.id)} 
                    className={`p-1.5 rounded transition-colors ${deleteConfirmMap[group.id] ? 'bg-red-600 text-white animate-pulse' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
                  >
                    {deleteConfirmMap[group.id] ? <AlertTriangle className="w-5 h-5" /> : <X className="w-5 h-5" />}
                  </button>
                </div>
              )}
            </div>

            <div className={`grid grid-cols-1 ${showSimulation ? 'xl:grid-cols-4' : ''}`}>
              {/* 商品リストテーブル */}
              <div className={`${showSimulation ? 'xl:col-span-3' : 'w-full'} overflow-x-auto border-r border-slate-100`}>
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b">
                    <tr>
                      <th className="px-3 py-2 font-semibold min-w-[180px]">商品名</th>
                      
                      {/* ケースモードON時：入数 */}
                      {showCaseMode && <th className="px-2 py-2 text-right font-semibold bg-indigo-50/30 text-indigo-700 min-w-[60px] border-l border-indigo-100">入数</th>}
                      
                      <th className="px-2 py-2 text-right font-semibold min-w-[80px]">容量/数量</th>
                      
                      {/* 原価モードON時：仕入・利益率 */}
                      {showCost && !isPreviewMode && (
                        <>
                          {showCaseMode && <th className="px-2 py-2 text-right font-semibold text-orange-600 bg-orange-50 border-l border-orange-200">C仕入(円)</th>}
                          <th className={`px-2 py-2 text-right font-semibold text-orange-600 bg-orange-50 ${!showCaseMode ? 'border-l border-orange-200' : ''}`}>バラ仕入(円)</th>
                          <th className="px-2 py-2 text-right font-semibold text-orange-600 bg-orange-50">利益率(%)</th>
                        </>
                      )}

                      {/* 販売価格（ケース・バラ） */}
                      {showCaseMode && <th className="px-2 py-2 text-right font-semibold bg-blue-50/50 text-blue-800 min-w-[90px] border-l border-blue-100">C価格(円)</th>}
                      <th className={`px-2 py-2 text-right font-semibold min-w-[90px] ${showCost && !isPreviewMode && !showCaseMode ? 'border-l border-orange-200 bg-blue-50/30' : ''}`}>バラ価格(円)</th>
                      
                      {/* 原価モードON時：実利益表示 */}
                      {showCost && !isPreviewMode && (
                        <th className="px-2 py-2 text-right font-semibold text-orange-600 bg-orange-50 border-l border-orange-200">バラ利益(円)</th>
                      )}

                      <th className="px-2 py-2 text-right text-slate-400 font-semibold min-w-[100px] border-l border-slate-200">
                        単価 (/{group.baseScale === 1 ? '' : group.baseScale}{group.unit})
                      </th>
                      {showSimulation && <th className="px-3 py-2 text-right text-[#1f497d] font-semibold min-w-[100px]">年間コスト</th>}
                      {!isPreviewMode && <th className="px-2 py-2 text-center w-10"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.items.map((item: any, index: number) => {
                      const isBest = item.id === group.stats?.minItem?.id;
                      const isBaseline = index === 0;
                      
                      return (
                        <tr key={item.id} className={`hover:bg-slate-50 ${isBest ? 'bg-blue-50/40' : ''}`}>
                          <td className="px-3 py-2 relative">
                             {isBaseline && <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-300" title="比較基準（現状）"></div>}
                             {isPreviewMode ? (
                               <div className="font-medium text-slate-800">{item.name}</div>
                             ) : (
                               <input 
                                 className="w-full bg-white border border-slate-300 rounded px-2 py-1 outline-none font-medium text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-200"
                                 value={item.name}
                                 onChange={(e) => updateItem(group.id, item.id, 'name', e.target.value)}
                               />
                             )}
                          </td>
                          
                          {/* 入数 */}
                          {showCaseMode && (
                            <td className="px-2 py-2 bg-indigo-50/10 border-l border-indigo-50">
                              <div className="flex justify-end">
                                {isPreviewMode ? <span>{item.packSize}</span> : (
                                  <input type="number" className="w-14 bg-white border border-indigo-200 rounded px-1.5 py-1 text-right outline-none focus:ring-2 focus:ring-indigo-200 text-indigo-800 font-bold"
                                    value={item.packSize} onChange={(e) => updateItem(group.id, item.id, 'packSize', e.target.value)} />
                                )}
                              </div>
                            </td>
                          )}

                          <td className="px-2 py-2">
                            <div className="flex items-center justify-end">
                              {isPreviewMode ? <span>{item.volume} <span className="text-xs text-slate-400">{group.unit}</span></span> : (
                                <>
                                  <input type="number" className="w-16 bg-white border border-slate-300 rounded px-1.5 py-1 text-right outline-none font-bold"
                                    value={item.volume} onChange={(e) => updateItem(group.id, item.id, 'volume', e.target.value)} />
                                  <span className="text-[10px] ml-1 text-slate-400">{group.unit}</span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* 原価入力 */}
                          {showCost && !isPreviewMode && (
                            <>
                              {showCaseMode && (
                                <td className="px-2 py-2 bg-orange-50/50 border-l border-orange-100">
                                  <input type="number" className="w-20 bg-white border border-orange-300 rounded px-1.5 py-1 text-right outline-none text-orange-800 font-bold ml-auto block"
                                    value={item.caseCost === 0 ? '' : item.caseCost} onChange={(e) => updateItem(group.id, item.id, 'caseCost', e.target.value)} placeholder="0" />
                                </td>
                              )}
                              <td className={`px-2 py-2 bg-orange-50/50 ${!showCaseMode ? 'border-l border-orange-100' : ''}`}>
                                <input type="number" className="w-20 bg-white border border-orange-300 rounded px-1.5 py-1 text-right outline-none text-orange-800 font-bold ml-auto block"
                                  value={item.cost === 0 ? '' : item.cost} onChange={(e) => updateItem(group.id, item.id, 'cost', e.target.value)} placeholder="0" />
                              </td>
                              <td className="px-2 py-2 bg-orange-50/50">
                                <div className="flex items-center justify-end">
                                  <input type="number" className="w-14 bg-white border border-orange-300 rounded px-1.5 py-1 text-right outline-none text-orange-800 font-bold"
                                    value={item.targetMargin} onChange={(e) => updateItem(group.id, item.id, 'targetMargin', e.target.value)} placeholder={item.margin} />
                                </div>
                              </td>
                            </>
                          )}

                          {/* 販売価格 */}
                          {showCaseMode && (
                            <td className="px-2 py-2 bg-blue-50/30 border-l border-blue-100">
                              {isPreviewMode ? <div className="text-right font-bold text-blue-800">{item.casePrice.toLocaleString()}</div> : (
                                <input type="number" className="w-20 bg-white border border-blue-300 rounded px-1.5 py-1 text-right outline-none text-blue-800 font-bold ml-auto block"
                                  value={item.casePrice} onChange={(e) => updateItem(group.id, item.id, 'casePrice', e.target.value)} />
                              )}
                            </td>
                          )}

                          <td className={`px-2 py-2 ${showCost && !isPreviewMode && !showCaseMode ? 'border-l border-orange-100' : ''}`}>
                            <div className="flex items-center justify-end">
                              {isPreviewMode ? <span className="font-bold">{item.price.toLocaleString()} <span className="text-xs text-slate-400">円</span></span> : (
                                <>
                                  <input type="number" className="w-20 bg-white border border-slate-300 rounded px-1.5 py-1 text-right outline-none font-bold"
                                    value={item.price} onChange={(e) => updateItem(group.id, item.id, 'price', e.target.value)} />
                                  <span className="text-[10px] ml-1 text-slate-400">円</span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* 原価モードON時：実利益表示 */}
                          {showCost && !isPreviewMode && (
                            <td className="px-2 py-2 text-right font-medium text-orange-700 bg-orange-50/50 border-l border-orange-100">
                              {item.profit.toLocaleString()}円
                            </td>
                          )}

                          <td className="px-2 py-2 text-right text-slate-500 font-medium border-l border-slate-100">
                            {item.unitPrice.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-[9px]">円</span>
                          </td>
                          {showSimulation && (
                            <td className={`px-3 py-2 text-right font-bold ${isBest ? 'text-red-600' : 'text-[#1f497d]'}`}>
                              {item.yearlyCost.toLocaleString()}
                            </td>
                          )}
                          {!isPreviewMode && (
                            <td className="px-2 py-2 text-center">
                              <button onClick={() => deleteItem(group.id, item.id)} className="text-slate-300 hover:text-red-600 hover:bg-red-50 p-1.5 rounded">
                                <Trash2 className="w-4 h-4"/>
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}

                    {/* 新規追加行 */}
                    {!isPreviewMode && (
                      <tr className="bg-slate-50">
                        <td className="px-3 py-2">
                          <input placeholder="商品名を追加..." className="w-full bg-white border border-slate-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-200"
                            value={inputState.name} onChange={(e) => handleInputChange(group.id, 'name', e.target.value)} />
                        </td>
                        
                        {showCaseMode && (
                          <td className="px-2 py-2 bg-indigo-50/30 border-l border-indigo-100">
                            <input type="number" placeholder="入数" className="w-14 bg-white border border-indigo-300 rounded px-1.5 py-1 text-right outline-none text-indigo-800 font-bold ml-auto block"
                              value={inputState.packSize} onChange={(e) => handleInputChange(group.id, 'packSize', e.target.value)} />
                          </td>
                        )}

                        <td className="px-2 py-2">
                          <input type="number" placeholder="容量" className="w-16 bg-white border border-slate-300 rounded px-1.5 py-1 text-right outline-none ml-auto block"
                            value={inputState.volume} onChange={(e) => handleInputChange(group.id, 'volume', e.target.value)} />
                        </td>

                        {showCost && (
                          <>
                            {showCaseMode && (
                              <td className="px-2 py-2 bg-orange-50/30 border-l border-orange-100">
                                <input type="number" placeholder="C仕入" className="w-20 bg-white border border-orange-300 rounded px-1.5 py-1 text-right outline-none text-orange-800 ml-auto block"
                                  value={inputState.caseCost} onChange={(e) => handleInputChange(group.id, 'caseCost', e.target.value)} />
                              </td>
                            )}
                            <td className={`px-2 py-2 bg-orange-50/30 ${!showCaseMode ? 'border-l border-orange-100' : ''}`}>
                              <input type="number" placeholder="B仕入" className="w-20 bg-white border border-orange-300 rounded px-1.5 py-1 text-right outline-none text-orange-800 ml-auto block"
                                value={inputState.cost} onChange={(e) => handleInputChange(group.id, 'cost', e.target.value)} />
                            </td>
                            <td className="px-2 py-2 bg-orange-50/30">
                              <input type="number" placeholder="利益%" className="w-14 bg-white border border-orange-300 rounded px-1.5 py-1 text-right outline-none text-orange-800 ml-auto block"
                                value={inputState.targetMargin} onChange={(e) => handleInputChange(group.id, 'targetMargin', e.target.value)} />
                            </td>
                          </>
                        )}

                        {showCaseMode && (
                          <td className="px-2 py-2 bg-blue-50/10 border-l border-blue-100">
                            <input type="number" placeholder="C価格" className="w-20 bg-white border border-blue-300 rounded px-1.5 py-1 text-right outline-none text-blue-800 font-bold ml-auto block"
                              value={inputState.casePrice} onChange={(e) => handleInputChange(group.id, 'casePrice', e.target.value)} />
                          </td>
                        )}

                        <td className={`px-2 py-2 ${showCost && !showCaseMode ? 'border-l border-orange-100' : ''}`}>
                          <input type="number" placeholder="B価格" className="w-20 bg-white border border-slate-300 rounded px-1.5 py-1 text-right outline-none font-bold ml-auto block"
                            value={inputState.price} onChange={(e) => handleInputChange(group.id, 'price', e.target.value)} />
                        </td>

                        {showCost && <td className="bg-orange-50/30 border-l border-orange-100"></td>}

                        <td colSpan={showSimulation ? 2 : 1} className="px-3 py-2 text-right border-l border-slate-100">
                           <button 
                             onClick={() => handleAddItem(group.id)} disabled={!canAdd}
                             className={`px-3 py-1.5 rounded text-xs font-bold transition flex items-center justify-end w-full ml-auto shadow-sm ${canAdd ? 'bg-[#1f497d] hover:bg-[#10253f] text-white active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                           >
                             <Plus className="w-3 h-3 mr-1" /> 追加
                           </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* グラフエリア */}
              {showSimulation && (
              <div className="xl:col-span-1 p-4 bg-white flex flex-col justify-center border-t xl:border-t-0 xl:border-l border-slate-100">
                <div className="text-xs font-bold text-slate-400 mb-3 text-center flex items-center justify-center gap-1">
                  <BarChart3 className="w-3 h-3" /> 年間コスト比較
                </div>
                <div className="space-y-3">
                  {group.items.map((item: any) => {
                    const isBest = item.id === group.stats?.minItem?.id;
                    const maxVal = Math.max(...group.items.map((i: any) => i.yearlyCost));
                    const widthPercent = maxVal > 0 ? (item.yearlyCost / maxVal) * 100 : 0;
                    return (
                      <div key={item.id} className="text-xs">
                        <div className="flex justify-between mb-1">
                          <span className={`truncate w-24 ${isBest ? 'font-bold text-red-600' : 'text-slate-600'}`}>{item.name}</span>
                          <span className="font-bold">{item.yearlyCost.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden w-full">
                          <div className={`h-full rounded-full transition-all duration-500 ${isBest ? 'bg-red-500' : 'bg-slate-400'}`} style={{ width: `${widthPercent}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}
            </div>
            
            {/* シミュレーションフッター */}
            {showSimulation && (
              <div className="bg-blue-50/50 px-4 py-3 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-bold text-slate-500">試算条件:</span>
                  <div className={`flex items-center px-2 py-1 rounded border ${isPreviewMode ? 'border-transparent' : 'bg-white border-blue-200'}`}>
                    <Calculator className="w-3 h-3 text-slate-400 mr-1" />
                    {isPreviewMode ? <span className="font-bold text-[#1f497d]">{group.baseVolume}</span> : (
                      <input type="number" className="w-16 text-right outline-none font-bold text-[#1f497d]" value={group.baseVolume} onChange={(e) => updateGroupField(group.id, 'baseVolume', e.target.value)} />
                    )}
                    <span className="text-xs text-slate-500 mx-1">{group.unit}</span>
                    <MultiplyIcon className="w-3 h-3 text-slate-400" />
                    {isPreviewMode ? <span className="font-bold text-[#1f497d] ml-1">{group.baseQuantity}</span> : (
                      <input type="number" className="w-12 text-right outline-none font-bold text-[#1f497d] ml-1" value={group.baseQuantity} onChange={(e) => updateGroupField(group.id, 'baseQuantity', e.target.value)} />
                    )}
                    <span className="text-xs text-slate-500 ml-1">個/月</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {group.stats?.discountRate > 0 && (
                    <div className="flex items-center text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100">
                      <Percent className="w-3 h-3 mr-1" />
                      <span className="text-xs font-bold">約 {group.stats.discountRate}% ダウン</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500">削減見込:</span>
                    <span className={`font-bold text-lg ${group.stats?.yearlyReduction > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      ¥{(group.stats?.yearlyReduction || 0).toLocaleString()} <span className="text-xs font-normal">/年</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        })}

        {!isPreviewMode && (
          <button onClick={addGroup} className="w-full py-5 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 hover:text-[#1f497d] hover:border-[#1f497d] hover:bg-blue-50 transition flex flex-col items-center justify-center gap-1">
            <Plus className="w-6 h-6" />
            <span className="font-bold">＋ 新しい商品カテゴリを追加</span>
          </button>
        )}

        <div className="pt-8 pb-4 flex justify-end">
          <span className="text-sm font-bold text-slate-500">太陽シルバーサービス（株）</span>
        </div>
      </div>

      {showSimulation && (
        <div className="bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] sticky bottom-0 z-40 p-4 print:static print:shadow-none print:border-t-2 print:mt-4">
          <div className="max-w-[1400px] mx-auto flex justify-end items-center">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-slate-600">年間削減総額:</span>
              <span className="text-2xl font-bold text-red-600">¥{totalReduction.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
    </div>
  );
}
