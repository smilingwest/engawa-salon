/**
 * デモ用の CSV 解析・名寄せロジック。
 * 本番の Google Apps Script 版 (../gas/Code.gs) の mergeData_ / judgeType_ と
 * 同じルールをブラウザ JavaScript として実装したもの。
 */
var GrowthPadLogic = (function () {
  var AIGROW_HEADERS = ['メールアドレス', '氏名', 'クラス', '計画性', '思考力', '自己効力感'];
  var STUDYSAPURI_HEADERS = ['メールアドレス', '氏名', '今週の学習時間(分)', '講義完了数'];

  function parseCsv(text) {
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(function (l) {
      return l.length > 0;
    });
    return lines.map(function (line) {
      return line.split(',').map(function (v) { return v.trim(); });
    });
  }

  function rowsToMapByEmail(rows, wantedHeaders) {
    var map = {};
    if (!rows || rows.length < 2) return map;

    var header = rows[0];
    var colIndex = {};
    wantedHeaders.forEach(function (name) {
      colIndex[name] = header.findIndex(function (h) { return h === name; });
    });

    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var emailIdx = colIndex['メールアドレス'];
      if (emailIdx === -1) continue;
      var email = String(row[emailIdx] || '').trim().toLowerCase();
      if (!email) continue;

      var record = {};
      wantedHeaders.forEach(function (name) {
        var idx = colIndex[name];
        record[name] = idx >= 0 ? row[idx] : '';
      });
      map[email] = record;
    }
    return map;
  }

  function detectHeaderMatch(headerRow, wantedHeaders) {
    var found = [];
    var missing = [];
    wantedHeaders.forEach(function (name) {
      var idx = headerRow.indexOf(name);
      if (idx === -1) { missing.push(name); } else { found.push(name); }
    });
    return { found: found, missing: missing };
  }

  function judgeType(selfEfficacy, studyMinutes) {
    var efficacyThreshold = 3.5;
    var studyThreshold = 120;

    var highEfficacy = Number(selfEfficacy) >= efficacyThreshold;
    var highStudy = Number(studyMinutes) >= studyThreshold;

    if (highEfficacy && highStudy) return '推進型（有言実行タイプ）';
    if (highEfficacy && !highStudy) return '潜在力型（エンジン始動待ちタイプ）';
    if (!highEfficacy && highStudy) return '努力型（縁の下の力持ちタイプ）';
    return '模索型（伴走が力になるタイプ）';
  }

  function mergeData(aigrowRows, studysapuriRows) {
    var aigrowMap = rowsToMapByEmail(aigrowRows, AIGROW_HEADERS);
    var studySapuriMap = rowsToMapByEmail(studysapuriRows, STUDYSAPURI_HEADERS);

    var emails = Object.keys(aigrowMap);
    Object.keys(studySapuriMap).forEach(function (email) {
      if (emails.indexOf(email) === -1) emails.push(email);
    });

    var now = new Date().toISOString();
    return emails.map(function (email) {
      var a = aigrowMap[email] || {};
      var s = studySapuriMap[email] || {};
      var selfEfficacy = a['自己効力感'] || '';
      var studyMinutes = s['今週の学習時間(分)'] || 0;

      return {
        'メールアドレス': email,
        '氏名': a['氏名'] || s['氏名'] || '',
        'クラス': a['クラス'] || '',
        '計画性': a['計画性'] || '',
        '自己効力感': selfEfficacy,
        '学習時間': studyMinutes,
        'タイプ判定': judgeType(selfEfficacy, studyMinutes),
        '最終更新日時': now
      };
    });
  }

  return {
    parseCsv: parseCsv,
    mergeData: mergeData,
    judgeType: judgeType,
    detectHeaderMatch: detectHeaderMatch,
    AIGROW_HEADERS: AIGROW_HEADERS,
    STUDYSAPURI_HEADERS: STUDYSAPURI_HEADERS
  };
})();
