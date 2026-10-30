// ブラウザのテストの共通の手順：様邸の画面の上の段の「📗 Excelで保存」（DocsDialog.tsx。書類を選ぶ画面が開き、初めは開いているタブの書類だけにチェック）
// で保存する。前はタブごとの「📗 〇〇をExcelで保存」を押すとすぐ保存された（ユーザーの指示「Excel で保存っていうので、一つに」2026-10-30 で変えた）

/** 「📗 Excelで保存」を押して、書類を選ぶ画面の「📗 1つ保存する」などを押す（scope：ボタンを探す所。上の段の group など） */
export async function excelSave(page, scope = page) {
  await scope.getByRole('button', {name: '📗 Excelで保存', exact: true}).click();
  await page.getByRole('dialog', {name: 'Excelで保存'}).getByRole('button', {name: /^📗 \d+つ保存する$/}).click();
}
