/**
 * =====================================================================
 *  부부 탁구 스코어보드 — Google Apps Script 백엔드 (v3: 실시간 동기화)
 *  - 컨테이너 바인딩 스크립트 (Google Sheets > 확장 프로그램 > Apps Script)
 *  - 웹 앱으로 배포: 실행 계정 = 나, 액세스 권한 = 모든 사용자
 *  - ※ 코드 수정 후 반드시 「배포 관리 → ✏️ → 버전: 새 버전 → 배포」 (URL 유지)
 *
 *  GET  ?action=ping            → 연결 확인 (+ 지원 기능 목록)
 *  GET  ?action=list            → 전체 기록 + 변경번호(rev)
 *  GET  ?action=state           → 변경번호(rev) + 진행 중 세트 스코어(live)  ← 두 폰이 주기적으로 조회
 *  POST {action:'live', live:{h,w,date,memo,device,saved}}  → 진행 중 세트 스코어 공유
 *  POST {action:'create'|'update'|'upsert', record:{...}}   → 추가/수정
 *  POST {action:'delete', id:'...'}                         → 삭제
 *  POST {action:'batch', ops:[{op:'upsert',record}|{op:'delete',id}]}
 *  (모든 요청에 token 포함 — 스크립트 속성 API_TOKEN 설정 시 검증)
 * =====================================================================
 */

const CODE_VERSION = 3;
const SHEET_NAME = 'Workouts';
const HEADERS = [
  'id', 'date', 'type', 'winner', 'husband_sets', 'wife_sets', 'set_Diff',
  'score_detail', 'duration_min', 'calories', 'distance_km', 'memo',
  'participant', 'updated_at'
];
const NUMBER_FIELDS = ['husband_sets', 'wife_sets', 'set_Diff', 'duration_min', 'calories', 'distance_km'];
const TEXT_FIELDS   = ['id', 'date', 'type', 'winner', 'score_detail', 'memo', 'participant', 'updated_at'];
const TYPES = ['pingpong', 'running', 'cycling'];
const PROP_REV  = 'DATA_REV';     // 기록이 바뀔 때마다 +1 → 상대 폰이 변경 감지
const PROP_LIVE = 'LIVE_STATE';   // 결과 입력 화면의 진행 중 세트 스코어 (JSON)

/* ----------------------------- 진입점 ----------------------------- */

function doGet(e) {
  return respond_(function () {
    const p = (e && e.parameter) || {};
    checkToken_(p.token);
    const action = p.action || 'list';
    if (action === 'ping') {
      const all = readAll_();
      return { ok: true, sheet: SHEET_NAME, count: all.length, now: new Date().toISOString(),
               version: CODE_VERSION, features: ['live', 'rev'] };
    }
    if (action === 'state') return Object.assign({ ok: true }, getState_());
    if (action === 'list') return { ok: true, data: readAll_(), rev: getRev_() };
    throw new Error('알 수 없는 action: ' + action);
  });
}

function doPost(e) {
  return respond_(function () {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(body.token);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);                       // 두 기기 동시 저장 충돌 방지
    try {
      switch (body.action) {
        case 'live':
          return { ok: true, live: setLive_(body.live), rev: getRev_() };
        case 'create':
        case 'update':
        case 'upsert':
          if (!body.record) throw new Error('record 누락');
          return Object.assign({ ok: true }, applyOps_([{ op: 'upsert', record: body.record }]));
        case 'delete':
          return Object.assign({ ok: true }, applyOps_([{ op: 'delete', id: body.id || (body.record && body.record.id) }]));
        case 'batch':
          return Object.assign({ ok: true }, applyOps_(body.ops || []));
        default:
          throw new Error('알 수 없는 action: ' + body.action);
      }
    } finally {
      lock.releaseLock();
    }
  });
}

/** 시트를 사람이 직접 수정해도 변경번호 증가 → 앱이 자동 재조회 (단순 트리거) */
function onEdit(e) {
  try {
    if (e && e.range && e.range.getSheet().getName() !== SHEET_NAME) return;
    bumpRev_();
  } catch (err) { /* 무시 */ }
}

/* ----------------------------- 실시간 상태 ----------------------------- */

function getState_() {
  const p = PropertiesService.getScriptProperties().getProperties();   // 1회 읽기
  let live = null;
  try { live = JSON.parse(p[PROP_LIVE] || 'null'); } catch (err) { live = null; }
  return { rev: String(p[PROP_REV] || '0'), live: live };
}

function getRev_() {
  return String(PropertiesService.getScriptProperties().getProperty(PROP_REV) || '0');
}

function bumpRev_() {
  const props = PropertiesService.getScriptProperties();
  const rev = String((Number(props.getProperty(PROP_REV)) || 0) + 1);
  props.setProperty(PROP_REV, rev);
  return rev;
}

/** 진행 중 세트 스코어 저장 (마지막 입력 우선, ver는 서버에서 단조 증가) */
function setLive_(l) {
  if (!l) throw new Error('live 누락');
  const props = PropertiesService.getScriptProperties();
  let cur = null;
  try { cur = JSON.parse(props.getProperty(PROP_LIVE) || 'null'); } catch (err) { cur = null; }
  const n = function (v) { const x = Math.round(Number(v)); return isFinite(x) ? Math.max(0, Math.min(99, x)) : 0; };
  const date = String(l.date || '');
  const saved = (l.saved && l.saved.id) ? { id: String(l.saved.id).slice(0, 60), at: Number(l.saved.at) || Date.now() } : null;
  const live = {
    h: n(l.h),
    w: n(l.w),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    memo: String(l.memo == null ? '' : l.memo).slice(0, 200),
    device: String(l.device || '').slice(0, 60),
    saved: saved,
    ver: ((cur && Number(cur.ver)) || 0) + 1,
    at: new Date().toISOString()
  };
  props.setProperty(PROP_LIVE, JSON.stringify(live));
  return live;
}

/* ----------------------------- 내부 로직 ----------------------------- */

function respond_(fn) {
  let out;
  try { out = fn(); }
  catch (err) { out = { ok: false, error: String((err && err.message) || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (expected && String(token || '') !== expected) throw new Error('인증 실패: API 토큰 불일치');
}

/** 시트 확보 + 헤더 보정 (누락 컬럼은 오른쪽에 자동 추가, 사용자 추가 컬럼은 보존) */
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  let header;
  if (sheet.getLastRow() === 0) {
    header = HEADERS.slice();
    sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#e2e8f0');
    sheet.setFrozenRows(1);
  } else {
    header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
    const missing = HEADERS.filter(function (h) { return header.indexOf(h) < 0; });
    if (missing.length) {
      sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#e2e8f0');
      header = header.concat(missing);
    }
  }
  return { ss: ss, sheet: sheet, header: header };
}

function readAll_() {
  const ctx = getSheet_();
  const sheet = ctx.sheet, header = ctx.header;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const tz = ctx.ss.getSpreadsheetTimeZone();
  const values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  const idCol = header.indexOf('id');
  return values
    .filter(function (row) { return String(row[idCol]).trim() !== ''; })
    .map(function (row) {
      const o = {};
      header.forEach(function (h, c) {
        if (!h) return;
        let v = row[c];
        if (v instanceof Date) {
          v = (h === 'date') ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v.toISOString();
        }
        o[h] = v;
      });
      return o;
    });
}

/** 입력값 정제: 허용 필드만, 숫자형 변환, 탁구 승자/세트차 서버측 재계산 */
function sanitize_(rec) {
  const r = {};
  HEADERS.forEach(function (h) { if (rec[h] !== undefined && rec[h] !== null) r[h] = rec[h]; });
  r.id = String(r.id || Utilities.getUuid());
  r.type = TYPES.indexOf(r.type) >= 0 ? r.type : 'pingpong';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date || ''))) throw new Error('date 형식 오류(YYYY-MM-DD): ' + r.date);
  NUMBER_FIELDS.forEach(function (f) {
    if (r[f] === '' || r[f] === undefined) { r[f] = ''; return; }
    const n = Number(r[f]);
    r[f] = isFinite(n) ? n : '';
  });
  if (r.type === 'pingpong') {
    r.husband_sets = Number(r.husband_sets) || 0;
    r.wife_sets = Number(r.wife_sets) || 0;
    r.set_Diff = r.husband_sets - r.wife_sets;
    r.winner = r.set_Diff > 0 ? 'husband' : (r.set_Diff < 0 ? 'wife' : 'draw');
    r.participant = 'together';
    r.distance_km = '';
  } else {
    r.winner = ''; r.husband_sets = ''; r.wife_sets = ''; r.set_Diff = ''; r.score_detail = '';
  }
  // 텍스트 필드는 쓰기 전 서식을 '@'(일반 텍스트)로 고정하므로 '=...' 입력도 수식으로 실행되지 않음
  ['memo', 'score_detail', 'participant'].forEach(function (f) {
    r[f] = String(r[f] == null ? '' : r[f]).slice(0, 500);
  });
  r.updated_at = new Date().toISOString();
  return r;
}

/**
 * 전체 데이터를 메모리에서 일괄 반영 후 한 번에 기록.
 * 오류 1건이 배치 전체를 막지 않도록 건별로 격리(skipped 반환).
 */
function applyOps_(ops) {
  const ctx = getSheet_();
  const sheet = ctx.sheet, header = ctx.header, nCol = header.length;
  const lastRow = sheet.getLastRow();
  let rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, nCol).getValues() : [];
  rows = rows.filter(function (row) { return row.some(function (v) { return v !== ''; }); });
  const idCol = header.indexOf('id'), dateCol = header.indexOf('date');
  const tz = ctx.ss.getSpreadsheetTimeZone();
  rows.forEach(function (row) { if (row[dateCol] instanceof Date) row[dateCol] = Utilities.formatDate(row[dateCol], tz, 'yyyy-MM-dd'); });

  const index = {};
  rows.forEach(function (row, i) { index[String(row[idCol])] = i; });
  const removed = {};
  const skipped = [];
  let upserted = 0, deleted = 0;

  ops.forEach(function (op) {
    if (!op) return;
    try {
      if (op.op === 'delete') {
        const id = String(op.id || (op.record && op.record.id) || '');
        if (index.hasOwnProperty(id)) { removed[index[id]] = true; delete index[id]; deleted++; }
        return;
      }
      const rec = sanitize_(op.record || {});
      if (index.hasOwnProperty(rec.id)) {
        const i = index[rec.id];
        rows[i] = header.map(function (h, c) { return rec.hasOwnProperty(h) ? rec[h] : rows[i][c]; });
      } else {
        rows.push(header.map(function (h) { return rec.hasOwnProperty(h) ? rec[h] : ''; }));
        index[rec.id] = rows.length - 1;
      }
      upserted++;
    } catch (err) {
      skipped.push({ id: String((op.record && op.record.id) || op.id || ''), error: String((err && err.message) || err) });
    }
  });

  rows = rows.filter(function (_, i) { return !removed[i]; });
  rows.sort(function (a, b) {
    return String(a[dateCol]).localeCompare(String(b[dateCol])) || String(a[idCol]).localeCompare(String(b[idCol]));
  });

  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, nCol).clearContent();
  if (rows.length) {
    // 텍스트 컬럼은 서식 '@' 고정 → "10-7" 등이 날짜로 자동 변환되는 문제 방지
    TEXT_FIELDS.forEach(function (f) {
      const c = header.indexOf(f);
      if (c >= 0) sheet.getRange(2, c + 1, rows.length, 1).setNumberFormat('@');
    });
    sheet.getRange(2, 1, rows.length, nCol).setValues(rows);
  }
  SpreadsheetApp.flush();
  const rev = (upserted || deleted) ? bumpRev_() : getRev_();
  return { upserted: upserted, deleted: deleted, count: rows.length, skipped: skipped, rev: rev };
}

/* ----------------------------- 수동 실행용 ----------------------------- */

/** 최초 1회 실행: 시트/헤더 생성 및 권한 승인 */
function setup() {
  const ctx = getSheet_();
  TEXT_FIELDS.forEach(function (f) {
    const c = ctx.header.indexOf(f);
    if (c >= 0) ctx.sheet.getRange(2, c + 1, ctx.sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  });
  ctx.sheet.autoResizeColumns(1, ctx.header.length);
  bumpRev_();
  Logger.log('준비 완료: 시트 "%s", 컬럼 %s개, rev %s', SHEET_NAME, ctx.header.length, getRev_());
}

/** (선택) API 토큰 설정: 아래 문자열을 바꾼 뒤 1회 실행 → 앱 설정의 'API 토큰'에 동일 값 입력 */
function setApiToken() {
  const token = 'CHANGE-ME-우리집-비밀번호';
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  Logger.log('API_TOKEN 설정 완료');
}

/** (선택) 토큰 해제 */
function clearApiToken() {
  PropertiesService.getScriptProperties().deleteProperty('API_TOKEN');
  Logger.log('API_TOKEN 삭제 완료');
}

/** (선택) 진행 중 스코어 초기화 */
function clearLiveState() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_LIVE);
  Logger.log('LIVE_STATE 삭제 완료');
}
