/**
 * GrowthPad - システム設計仕様書に基づく Google Apps Script バックエンド
 *
 * 構成:
 *   RAW_AiGROW        Ai GROW CSV 生データ（管理者アップロードで上書き）
 *   RAW_スタディサプリ  スタディサプリ CSV 生データ（管理者アップロードで上書き）
 *   DB_統合データ       上記2シートをメールアドレスで名寄せしたマスター（自動生成）
 *   LOG_リフレクション   生徒の振り返り入力ログ（追記）
 */

const SHEET_RAW_AIGROW = 'RAW_AiGROW';
const SHEET_RAW_STUDYSAPURI = 'RAW_スタディサプリ';
const SHEET_DB_INTEGRATED = 'DB_統合データ';
const SHEET_LOG_REFLECTION = 'LOG_リフレクション';

// Ai GROW CSV で探すヘッダー名（列順が変わっても動くよう名前で検索する）
const AIGROW_HEADERS = ['メールアドレス', '氏名', 'クラス', '計画性', '思考力', '自己効力感'];
// スタディサプリ CSV で探すヘッダー名
const STUDYSAPURI_HEADERS = ['メールアドレス', '氏名', '今週の学習時間(分)', '講義完了数'];

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
 * 管理者画面からアップロードされた CSV（ブラウザ側で Shift_JIS を解析済みの
 * UTF-8 文字列）を受け取り、該当の RAW シートを上書きしたのち、
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
  const sheet = getOrCreateSheet_(sheetName);
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

  const result = mergeData_();
  return {
    ok: true,
    rows: rows.length - 1,
    message: sheetName + ' を更新し、' + SHEET_DB_INTEGRATED + ' を再生成しました。',
    mergedCount: result.mergedCount
  };
}

/** シートの2次元配列を「メールアドレスキー -> {ヘッダー名: 値}」に変換する。 */
function sheetRowsToMapByEmail_(rows, wantedHeaders) {
  const map = {};
  if (!rows || rows.length < 2) return map;

  const header = rows[0];
  const colIndex = {};
  wantedHeaders.forEach(function (name) {
    const idx = header.findIndex(function (h) {
      return String(h).trim() === name;
    });
    colIndex[name] = idx; // 見つからなければ -1
  });

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const emailIdx = colIndex['メールアドレス'];
    if (emailIdx === -1) continue;
    const email = String(row[emailIdx] || '').trim().toLowerCase();
    if (!email) continue;

    const record = {};
    wantedHeaders.forEach(function (name) {
      const idx = colIndex[name];
      record[name] = idx >= 0 ? row[idx] : '';
    });
    map[email] = record;
  }
  return map;
}

/**
 * 非認知（自己効力感）× 認知（学習時間）の2軸で、学びタイプを判定する。
 * Looker Studio 側の散布図の4象限にそのまま対応する簡易ロジック。
 */
function judgeType_(selfEfficacy, studyMinutes) {
  const efficacyThreshold = 3.5; // 自己効力感は5段階想定
  const studyThreshold = 120; // 分/週

  const highEfficacy = Number(selfEfficacy) >= efficacyThreshold;
  const highStudy = Number(studyMinutes) >= studyThreshold;

  if (highEfficacy && highStudy) return '推進型（有言実行タイプ）';
  if (highEfficacy && !highStudy) return '潜在力型（エンジン始動待ちタイプ）';
  if (!highEfficacy && highStudy) return '努力型（縁の下の力持ちタイプ）';
  return '模索型（伴走が力になるタイプ）';
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
  const studySapuriMap = sheetRowsToMapByEmail_(studySapuriRows, STUDYSAPURI_HEADERS);

  const emails = Object.keys(aigrowMap);
  Object.keys(studySapuriMap).forEach(function (email) {
    if (emails.indexOf(email) === -1) emails.push(email);
  });

  const dbHeader = ['メールアドレス', '氏名', 'クラス', '計画性', '自己効力感', '学習時間', 'タイプ判定', '最終更新日時'];
  const outRows = [dbHeader];
  const now = new Date();

  emails.forEach(function (email) {
    const a = aigrowMap[email] || {};
    const s = studySapuriMap[email] || {};
    const name = a['氏名'] || s['氏名'] || '';
    const selfEfficacy = a['自己効力感'] || '';
    const studyMinutes = s['今週の学習時間(分)'] || 0;

    outRows.push([
      email,
      name,
      a['クラス'] || '',
      a['計画性'] || '',
      selfEfficacy,
      studyMinutes,
      judgeType_(selfEfficacy, studyMinutes),
      now
    ]);
  });

  const dbSheet = getOrCreateSheet_(SHEET_DB_INTEGRATED);
  dbSheet.clearContents();
  dbSheet.getRange(1, 1, outRows.length, dbHeader.length).setValues(outRows);

  return { mergedCount: outRows.length - 1 };
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
