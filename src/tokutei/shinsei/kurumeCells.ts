// 久留米市の特定福祉用具の原本（kurume.xlsx）の、PDF の様式から作ったシートの欄の番地。スキルの scripts/make_kurume_oita_tokutei.py が原本と一緒に書く
// （手で直さない。原本を作り直すと番地が変わるので、原本とこのファイルはいつも一緒に置きかえる）
export const KU_SHEETS = ["申請書", "委任状（受領委任払用）", "請求書", "委任状（提出用）"] as const;
export const KU_CELLS = {
  proxy: {"sellerAddress": "X8", "sellerTel": "AG12", "seller": "X21", "benefit": "J41", "address": "AD50"},
  claim: {"d0": "N8", "d1": "U8", "d2": "AD8", "d3": "AM8", "d4": "AU8", "d5": "BH8", "d6": "BQ8", "d7": "BV8", "d8": "CG8", "d9": "CN8", "d10": "CV8", "z0": "X20", "z1": "AB20", "z2": "AG20", "z3": "AR20", "z4": "AW20", "z5": "BC20", "z6": "BI20", "sellerAddress": "V25", "seller": "V31", "telA": "T35", "telB": "AK35", "telC": "BE35", "name": "AF44"},
  teisyutu: {"visitor": "N6", "office": "N11", "sellerAddress": "N16", "sellerTel": "N20", "address": "K39", "kind": "L27"},
} as const;
