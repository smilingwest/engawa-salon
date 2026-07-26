/**
 * デモ用の CSV 解析・名寄せロジック。
 * 本番の Google Apps Script 版 (../gas/Code.gs) の mergeData_ と
 * 同じルールをブラウザ JavaScript として実装したもの。
 *
 * Ai GROW（所見提案リスト）には数値スコアがなく、代わりに「特に高いコンピテンシー（1〜3）」と
 * その所見提案文が入っているため、これを生徒の「強み」として扱う。
 * スタディサプリの学習時間は「視聴時間(秒)」を分に変換して使用する。
 */
var GrowthPadLogic = (function () {
  var AIGROW_HEADERS = {
    'メールアドレス': ['メールアドレス'],
    '氏名': ['氏名', '受検者名'],
    'クラス': ['クラス']
  };
  var AIGROW_STRENGTH_LABELS = ['特に高いコンピテンシー（1）', '特に高いコンピテンシー（2）', '特に高いコンピテンシー（3）'];

  var STUDYSAPURI_HEADERS = {
    'メールアドレス': ['メールアドレス'],
    '氏名': ['氏名', '名前'],
    '視聴時間(秒)': ['視聴時間(秒)'],
    '講義完了数': ['講義完了数', '視聴した講義数']
  };

  function parseCsv(text) {
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(function (l) {
      return l.length > 0;
    });
    return lines.map(function (line) {
      return line.split(',').map(function (v) { return v.trim(); });
    });
  }

  function findColumnIndex(headerRow, fieldAliases) {
    for (var i = 0; i < fieldAliases.length; i++) {
      var idx = headerRow.indexOf(fieldAliases[i]);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function rowsToMapByEmail(rows, headerAliasMap) {
    var map = {};
    if (!rows || rows.length < 2) return map;

    var header = rows[0];
    var colIndex = {};
    Object.keys(headerAliasMap).forEach(function (canonicalName) {
      colIndex[canonicalName] = findColumnIndex(header, headerAliasMap[canonicalName]);
    });

    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var emailIdx = colIndex['メールアドレス'];
      if (emailIdx === -1) continue;
      var email = String(row[emailIdx] || '').trim().toLowerCase();
      if (!email) continue;

      var record = {};
      Object.keys(headerAliasMap).forEach(function (canonicalName) {
        var idx = colIndex[canonicalName];
        record[canonicalName] = idx >= 0 ? row[idx] : '';
      });
      map[email] = record;
    }
    return map;
  }

  function detectHeaderMatch(headerRow, headerAliasMap) {
    var found = [];
    var missing = [];
    Object.keys(headerAliasMap).forEach(function (canonicalName) {
      var idx = findColumnIndex(headerRow, headerAliasMap[canonicalName]);
      if (idx === -1) { missing.push(canonicalName); } else { found.push(canonicalName); }
    });
    return { found: found, missing: missing };
  }

  /** Ai GROW の1行分から「特に高いコンピテンシー（1〜3）」とその所見提案文を抽出する。 */
  function extractStrengths(headerRow, dataRow) {
    var strengths = [];
    AIGROW_STRENGTH_LABELS.forEach(function (label) {
      var idx = headerRow.indexOf(label);
      if (idx === -1) return;
      var competency = String(dataRow[idx] || '').trim();
      if (!competency) return;
      var comments = [dataRow[idx + 1], dataRow[idx + 2], dataRow[idx + 3]]
        .map(function (c) { return String(c || '').trim(); })
        .filter(function (c) { return c; });
      strengths.push({ competency: competency, comments: comments });
    });
    return strengths;
  }

  function buildStrengthsMapByEmail(rows) {
    var map = {};
    if (!rows || rows.length < 2) return map;

    var header = rows[0];
    var emailIdx = findColumnIndex(header, AIGROW_HEADERS['メールアドレス']);
    if (emailIdx === -1) return map;

    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var email = String(row[emailIdx] || '').trim().toLowerCase();
      if (!email) continue;
      map[email] = extractStrengths(header, row);
    }
    return map;
  }

  function mergeData(aigrowRows, studysapuriRows) {
    var aigrowMap = rowsToMapByEmail(aigrowRows, AIGROW_HEADERS);
    var strengthsMap = buildStrengthsMapByEmail(aigrowRows);
    var studySapuriMap = rowsToMapByEmail(studysapuriRows, STUDYSAPURI_HEADERS);

    var emails = Object.keys(aigrowMap);
    Object.keys(studySapuriMap).forEach(function (email) {
      if (emails.indexOf(email) === -1) emails.push(email);
    });

    var now = new Date().toISOString();
    return emails.map(function (email) {
      var a = aigrowMap[email] || {};
      var s = studySapuriMap[email] || {};
      var studySeconds = Number(s['視聴時間(秒)'] || 0);
      var studyMinutes = studySeconds > 0 ? Math.round(studySeconds / 60) : '';

      return {
        'メールアドレス': email,
        '氏名': a['氏名'] || s['氏名'] || '',
        'クラス': a['クラス'] || '',
        '学習時間(分)': studyMinutes,
        '講義完了数': s['講義完了数'] || '',
        '強み': strengthsMap[email] || [],
        '最終更新日時': now
      };
    });
  }

  return {
    parseCsv: parseCsv,
    mergeData: mergeData,
    detectHeaderMatch: detectHeaderMatch,
    AIGROW_HEADERS: AIGROW_HEADERS,
    STUDYSAPURI_HEADERS: STUDYSAPURI_HEADERS
  };
})();
