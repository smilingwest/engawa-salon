/**
 * GrowthPad - Google Apps Script バックエンド
 *
 * 構成:
 *   RAW_AiGROW        Ai GROW CSV（所見提案リスト）生データ（管理者アップロードで上書き）
 *   RAW_スタディサプリ  スタディサプリ CSV（学習データ）生データ（管理者アップロードで上書き）
 *   DB_統合データ       上記2シートをメールアドレスで名寄せしたマスター（自動生成）
 *   LOG_リフレクション   生徒の振り返り入力ログ（追記）
 *
 * 実データの列名は当初の仕様書の想定と異なっていたため、以下の実際のエクスポート形式に
 * 合わせている:
 *   Ai GROW（所見提案リスト）: ログインID / 学年 / クラス / 出席番号 / 受検者名 / メールアドレス /
 *     受検日時 / 特に高いコンピテンシー（1） / 所見提案1 / 所見提案2 / 所見提案3 /
 *     特に高いコンピテンシー（2） / 所見提案1 / 所見提案2 / 所見提案3 /
 *     特に高いコンピテンシー（3） / 所見提案1 / 所見提案2 / 所見提案3
 *     → 数値スコアは含まれないため、上位3つの「特に高いコンピテンシー」とその所見提案文を
 *       生徒の「強み」として扱う。
 *   スタディサプリ（学習データ）: 学年 / 組 / 番 / 名前 / メールアドレス / 視聴した講義数 /
 *     視聴時間 / 視聴時間(秒) / 確認テスト完了数 / 確認テストマスター数 / 平均初回正答率
 *     → 学習時間は「視聴時間(秒)」を分に変換して使用する。
 */

const SHEET_RAW_AIGROW = 'RAW_AiGROW';
const SHEET_RAW_STUDYSAPURI = 'RAW_スタディサプリ';
const SHEET_DB_INTEGRATED = 'DB_統合データ';
const SHEET_LOG_REFLECTION = 'LOG_リフレクション';

// Ai GROW CSV で探すヘッダー名。キーが DB_統合データ 上での項目名、
// 値がCSV側で許容する実際の列名（別名）の候補。
const AIGROW_HEADERS = {
  'メールアドレス': ['メールアドレス'],
  '氏名': ['氏名', '受検者名'],
  'クラス': ['クラス']
};
// 「特に高いコンピテンシー（N）」は所見提案リスト特有の繰り返し構造で、
// 「所見提案1〜3」という同名の列がブロックごとに3回登場するため、
// 別名マップではなくラベル名を起点に位置で読み取る（extractStrengths_ 参照）。
const AIGROW_STRENGTH_LABELS = ['特に高いコンピテンシー（1）', '特に高いコンピテンシー（2）', '特に高いコンピテンシー（3）'];

// スタディサプリ CSV で探すヘッダー名
const STUDYSAPURI_HEADERS = {
  'メールアドレス': ['メールアドレス'],
  '氏名': ['氏名', '名前'],
  '視聴時間(秒)': ['視聴時間(秒)'],
  '講義完了数': ['講義完了数', '視聴した講義数']
};

/**
 * Web App エントリポイント。
 * ?page=admin -> 管理者・先生用画面 (Admin.html)
 * それ以外    -> 生徒用画面 (Student.html)
 */
function doGet(e) {
  const page = e && e.parameter && e.parameter.page;
  if (page === 'admin') {
    return HtmlService.createHtmlOutputFromFile('Admin')
      .setTitle('GrowthPad 管理者画面')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutputFromFile('Student')
    .setTitle('GrowthPad マイページ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** データベースとして使うスプレッドシートを取得する。 */
function getDatabase_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(name, headers) {
  const ss = getDatabase_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (headers && sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}

/**
 * 管理者画面からアップロードされた CSV（ブラウザ側で文字コードを解析済みの
 * テキスト）を受け取り、該当の RAW シートを上書きしたのち、
 * DB_統合データ を再生成する。
 *
 * @param {'AiGROW'|'StudySapuri'} type
 * @param {string} csvText 解析済み CSV テキスト（UTF-8）
 * @return {{ok: boolean, rows: number, message: string}}
 */
function processCsvUpload(type, csvText) {
  const rows = Utilities.parseCsv(csvText);
  if (!rows || rows.length === 0) {
    throw new Error('CSVが空です。');
  }

  const sheetName = type === 'AiGROW' ? SHEET_RAW_AIGROW : SHEET_RAW_STUDYSAPURI;
  const wantedHeaders = type === 'AiGROW' ? AIGROW_HEADERS : STUDYSAPURI_HEADERS;
  const sheet = getOrCreateSheet_(sheetName);
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

  const headerMatch = detectHeaderMatch_(rows[0], wantedHeaders);
  const result = mergeData_();

  let message = sheetName + ' を更新し（' + (rows.length - 1) + '件）、' + SHEET_DB_INTEGRATED +
    ' を再生成しました（統合済み: ' + result.mergedCount + '名）。';
  if (headerMatch.missing.length > 0) {
    message += '\n⚠ CSVのヘッダーに見つからなかった項目: ' + headerMatch.missing.join('、') +
      '\n  実際のCSVの1行目: ' + rows[0].join(' / ');
  }

  return {
    ok: true,
    rows: rows.length - 1,
    message: message,
    mergedCount: result.mergedCount,
    headerMatch: headerMatch
  };
}

/** CSVの1行目の中から、fieldAliases（別名候補の配列）のいずれかが最初に見つかった列番号を返す。見つからなければ -1。 */
function findColumnIndex_(headerRow, fieldAliases) {
  for (let i = 0; i < fieldAliases.length; i++) {
    const idx = headerRow.findIndex(function (h) { return String(h).trim() === fieldAliases[i]; });
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * アップロードされたCSVの1行目に、期待する項目（別名のいずれか）がいくつ見つかったかを調べる。
 * @param {Array} headerRow
 * @param {Object} headerAliasMap 項目名 -> 許容する列名候補の配列
 */
function detectHeaderMatch_(headerRow, headerAliasMap) {
  const found = [];
  const missing = [];
  Object.keys(headerAliasMap).forEach(function (canonicalName) {
    const idx = findColumnIndex_(headerRow, headerAliasMap[canonicalName]);
    if (idx === -1) {
      missing.push(canonicalName);
    } else {
      found.push(canonicalName);
    }
  });
  return { found: found, missing: missing };
}

/** シートの2次元配列を「メールアドレスキー -> {項目名: 値}」に変換する。 */
function sheetRowsToMapByEmail_(rows, headerAliasMap) {
  const map = {};
  if (!rows || rows.length < 2) return map;

  const header = rows[0];
  const colIndex = {};
  Object.keys(headerAliasMap).forEach(function (canonicalName) {
    colIndex[canonicalName] = findColumnIndex_(header, headerAliasMap[canonicalName]); // 見つからなければ -1
  });

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const emailIdx = colIndex['メールアドレス'];
    if (emailIdx === -1) continue;
    const email = String(row[emailIdx] || '').trim().toLowerCase();
    if (!email) continue;

    const record = {};
    Object.keys(headerAliasMap).forEach(function (canonicalName) {
      const idx = colIndex[canonicalName];
      record[canonicalName] = idx >= 0 ? row[idx] : '';
    });
    map[email] = record;
  }
  return map;
}

/**
 * Ai GROW の1行分から「特に高いコンピテンシー（1〜3）」とその所見提案文を抽出する。
 * 所見提案リストは同名の列（所見提案1〜3）が3ブロック繰り返される構造のため、
 * ヘッダー名検索ではなく「特に高いコンピテンシー（N）」列の位置を起点に、
 * その直後3列を所見提案として読み取る。
 */
function extractStrengths_(headerRow, dataRow) {
  const strengths = [];
  AIGROW_STRENGTH_LABELS.forEach(function (label) {
    const idx = headerRow.findIndex(function (h) { return String(h).trim() === label; });
    if (idx === -1) return;
    const competency = String(dataRow[idx] || '').trim();
    if (!competency) return;
    const comments = [dataRow[idx + 1], dataRow[idx + 2], dataRow[idx + 3]]
      .map(function (c) { return String(c || '').trim(); })
      .filter(function (c) { return c; });
    strengths.push({ competency: competency, comments: comments });
  });
  return strengths;
}

/** RAW_AiGROW の全行から「メールアドレス -> 強みリスト」のマップを作る。 */
function buildStrengthsMapByEmail_(rows) {
  const map = {};
  if (!rows || rows.length < 2) return map;

  const header = rows[0];
  const emailIdx = findColumnIndex_(header, AIGROW_HEADERS['メールアドレス']);
  if (emailIdx === -1) return map;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const email = String(row[emailIdx] || '').trim().toLowerCase();
    if (!email) continue;
    map[email] = extractStrengths_(header, row);
  }
  return map;
}

/** JSON文字列として保存された強みリストを安全にパースする。壊れていれば空配列を返す。 */
function parseStrengthsJson_(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

/**
 * RAW_AiGROW と RAW_スタディサプリ をメールアドレスで名寄せし、
 * DB_統合データ を作成・更新する。
 */
function mergeData_() {
  const ss = getDatabase_();
  const aigrowSheet = ss.getSheetByName(SHEET_RAW_AIGROW);
  const studySapuriSheet = ss.getSheetByName(SHEET_RAW_STUDYSAPURI);

  const aigrowRows = aigrowSheet ? aigrowSheet.getDataRange().getValues() : [];
  const studySapuriRows = studySapuriSheet ? studySapuriSheet.getDataRange().getValues() : [];

  const aigrowMap = sheetRowsToMapByEmail_(aigrowRows, AIGROW_HEADERS);
  const strengthsMap = buildStrengthsMapByEmail_(aigrowRows);
  const studySapuriMap = sheetRowsToMapByEmail_(studySapuriRows, STUDYSAPURI_HEADERS);

  const emails = Object.keys(aigrowMap);
  Object.keys(studySapuriMap).forEach(function (email) {
    if (emails.indexOf(email) === -1) emails.push(email);
  });

  const dbHeader = ['メールアドレス', '氏名', 'クラス', '学習時間(分)', '講義完了数', '強み_JSON', '最終更新日時'];
  const outRows = [dbHeader];
  const now = new Date();

  emails.forEach(function (email) {
    const a = aigrowMap[email] || {};
    const s = studySapuriMap[email] || {};
    const name = a['氏名'] || s['氏名'] || '';
    const studySeconds = Number(s['視聴時間(秒)'] || 0);
    const studyMinutes = studySeconds > 0 ? Math.round(studySeconds / 60) : '';
    const strengths = strengthsMap[email] || [];

    outRows.push([
      email,
      name,
      a['クラス'] || '',
      studyMinutes,
      s['講義完了数'] || '',
      JSON.stringify(strengths),
      now
    ]);
  });

  const dbSheet = getOrCreateSheet_(SHEET_DB_INTEGRATED);
  dbSheet.clearContents();
  dbSheet.getRange(1, 1, outRows.length, dbHeader.length).setValues(outRows);

  return { mergedCount: outRows.length - 1 };
}

/**
 * 管理者画面向け: DB_統合データ の全件を返す（先生・管理者は全生徒を見てよいため）。
 * 生徒用の getStudentData() とは異なり、本人以外のデータも含む点に注意。
 */
function getIntegratedPreview() {
  const ss = getDatabase_();
  const dbSheet = ss.getSheetByName(SHEET_DB_INTEGRATED);
  if (!dbSheet || dbSheet.getLastRow() < 1) {
    return { header: [], rows: [] };
  }

  const values = dbSheet.getDataRange().getValues();
  const header = values[0];
  const rows = values.slice(1).map(function (row) {
    const record = {};
    header.forEach(function (h, i) { record[h] = row[i]; });
    record['強み'] = parseStrengthsJson_(record['強み_JSON']);
    return record;
  });
  return { header: header, rows: rows };
}

/**
 * ログイン中の生徒本人のデータのみを DB_統合データ から取得する。
 * 他人のデータは一切返さない。
 */
function getStudentData() {
  const email = Session.getActiveUser().getEmail().trim().toLowerCase();
  if (!email) {
    throw new Error('ログインユーザーのメールアドレスを取得できませんでした。');
  }

  const ss = getDatabase_();
  const dbSheet = ss.getSheetByName(SHEET_DB_INTEGRATED);
  if (!dbSheet) {
    return { found: false, email: email };
  }

  const rows = dbSheet.getDataRange().getValues();
  const header = rows[0];
  const emailIdx = header.indexOf('メールアドレス');

  for (let r = 1; r < rows.length; r++) {
    if (String(rows[r][emailIdx]).trim().toLowerCase() === email) {
      const record = {};
      header.forEach(function (h, i) {
        record[h] = rows[r][i];
      });
      record['強み'] = parseStrengthsJson_(record['強み_JSON']);
      return { found: true, email: email, data: record };
    }
  }

  return { found: false, email: email };
}

/**
 * 生徒の振り返り（集中度スコア + 工夫した点）を LOG_リフレクション に追記する。
 * @param {{concentration: number, message: string}} payload
 */
function submitReflection(payload) {
  const email = Session.getActiveUser().getEmail().trim().toLowerCase();
  if (!email) {
    throw new Error('ログインユーザーのメールアドレスを取得できませんでした。');
  }
  if (!payload || !payload.concentration) {
    throw new Error('集中度を選択してください。');
  }

  const sheet = getOrCreateSheet_(SHEET_LOG_REFLECTION, [
    'タイムスタンプ',
    'メールアドレス',
    '集中度スコア',
    '工夫点・メッセージ'
  ]);

  sheet.appendRow([new Date(), email, payload.concentration, payload.message || '']);
  return { ok: true };
}
