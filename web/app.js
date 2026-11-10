(function () {
'use strict';
/* ───────── 기본 유틸 ───────── */
const KEY = 'krhealth.v1';
const DAY = 864e5;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const monthKey = ts => dayKey(ts).slice(0, 7);
const sod = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
const weekStart = ts => { const d = new Date(sod(ts)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const weekKey = ts => dayKey(weekStart(ts));
const toInput = ts => { const d = new Date(ts); return dayKey(ts) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const fromInput = v => { const t = new Date(v).getTime(); return isFinite(t) ? t : Date.now(); };
const f1 = n => (Math.round(n * 10) / 10).toFixed(1);
const r0 = n => Math.round(n);
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function fmtDT(ts) {
  const d = new Date(ts), t = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const k = dayKey(ts);
  if (k === dayKey(Date.now())) return '오늘 ' + t;
  if (k === dayKey(addDays(Date.now(), -1))) return '어제 ' + t;
  return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WD[d.getDay()] + ') ' + t;
}
const fmtD = ts => { const d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WD[d.getDay()] + ')'; };
function slotOf(x) { if (x && typeof x === 'object') { if (x.slot) return x.slot; x = x.ts; } const h = new Date(x).getHours(); if (h >= 4 && h < 11) return '아침'; if (h >= 17) return '저녁'; return '기타'; }
const newId = t => t + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ───────── 판정 기준 ───────── */
// 대한비만학회 비만 진료지침 2022(제8판)
const BMI = [
  { max: 18.5, n: '저체중', c: 'blue' }, { max: 23, n: '정상', c: 'green' }, { max: 25, n: '비만전단계', c: 'yellow' },
  { max: 30, n: '1단계 비만', c: 'orange' }, { max: 35, n: '2단계 비만', c: 'red' }, { max: Infinity, n: '3단계 비만', c: 'deep' }];
const bmiOf = (w, h) => (w && h) ? w / ((h / 100) ** 2) : null;
const bmiIdx = b => BMI.findIndex(x => b < x.max);
// 대한고혈압학회 2022 고혈압 진료지침 표 1
const BP = [{ n: '정상 혈압', c: 'green' }, { n: '주의 혈압', c: 'lime' }, { n: '고혈압 전단계', c: 'yellow' }, { n: '고혈압 1기', c: 'orange' }, { n: '고혈압 2기', c: 'red' }];
function bpLevel(s, d) { const sl = s < 120 ? 0 : s < 130 ? 1 : s < 140 ? 2 : s < 160 ? 3 : 4; const dl = d < 80 ? 0 : d < 90 ? 2 : d < 100 ? 3 : 4; return Math.max(sl, dl); }
function bpInfo(s, d) { const l = bpLevel(s, d); return { l, n: (s >= 140 && d < 90) ? '수축기 단독 고혈압' : BP[l].n, c: BP[l].c }; }
const pulseInfo = p => p < 60 ? { n: '60 미만', c: 'blue' } : p <= 100 ? { n: '정상 범위', c: 'green' } : { n: '100 초과', c: 'orange' };
const spo2Info = o => o >= 95 ? { n: '정상 범위', c: 'green' } : { n: '재측정 권장', c: 'orange' };
const pill = i => `<span class="pill c-${i.c}">${esc(i.n)}</span>`;
// 2024 Adult Compendium of Physical Activities (pacompendium.com) — 강도별 코드
// 실외자전거 01015 4.3(쉬운 속도)·01014 7.0(일반) / 골프연습 15270 3.5 / 슬로우조깅 12026 3.3(4.2~6.0km/h)·12020 7.5(힘듦=일반 조깅) / 실내요가 02150 2.3(하타)·02185 2.7(빈야사)·02160 4.0(파워)
const EX = [
  { k: 'walk', n: '걷기', mets: { 1: 3.0, 2: 3.8, 3: 4.8 }, steps: 1 },     // 2024 Compendium 17170(3.0)·17190(3.8, 보통 속도)·17200(4.8, 활기차게). 걸음 수 → 시간은 분당 100보로 환산(추정)
  { k: 'bar', n: '철봉 매달리기', mets: { 1: 2.8, 2: 3.8, 3: 7.5 }, hang: 1 },   // 02024(가벼움 2.8)·02022(보통 3.8, 턱걸이 포함 체조)·02020(힘듦 7.5) — 매달리기 전용 코드는 없어 가장 가까운 체조 코드 적용
  { k: 'stretch', n: '스트레칭', met: 2.3, reps: 1 },                                   // 02101 Stretching, mild 2.3
  { k: 'bike', n: '실외자전거', mets: { 1: 4.3, 2: 7.0, 3: 7.0 } },
  { k: 'golfp', n: '골프연습', met: 3.5 },
  { k: 'sjog', n: '슬로우조깅', mets: { 1: 3.3, 2: 3.3, 3: 7.5 } },   // 시간 입력(기본 60분), 거리 입력 없음
  { k: 'yoga', n: '실내요가', mets: { 1: 2.3, 2: 2.7, 3: 4.0 }, old: 1 },     // 입력 화면에서는 숨김(기존 기록은 그대로 표시·합산)
  { k: 'ibike', n: '실내자전거', met: 6.8, old: 1 }, { k: 'golfr', n: '골프라운드', met: 4.5, old: 1 },
  { k: 'jog', n: '조깅', met: 7.5, old: 1 }, { k: 'tt', n: '탁구', met: 4.0, old: 1 }, { k: 'etc', n: '기타', met: null, old: 1 }];
const EX_ON = EX.filter(x => !x.old);
const ETC_MET = { 1: 2.5, 2: 4.0, 3: 7.0 };
const INT = { 1: '가벼움', 2: '보통', 3: '힘듦' };
const m1 = n => String(Math.round(n * 10) / 10);                       // 분 합계(소수 첫째 자리)
const fmin = n => (Math.round(n * 10) / 10).toLocaleString();
const HANG_MIN = 30, HANG_MAX = 180, HANG_BASE = 60;       // 매달리기 1회: 30초 ~ 3분, 5초·10초 단위 조절, 기준 1분
const fsec = t => t < 60 ? `${t}초` : t % 60 ? `${Math.floor(t / 60)}분 ${t % 60}초` : `${t / 60}분`;
const STEP_MIN = 3000, STEP_MAX = 25000, STEPS_PER_MIN = 100;   // 걸음 수 입력 범위, 시간 환산(분당 100보 ≈ 보통 속도, 추정)
const DEF_INT = { walk: 2, bar: 3, stretch: 3, bike: 3, golfp: 2, sjog: 2 };   // 강도 선택 삭제 → 종목별 고정값(보통=2, 힘듦=3)
const intOf = k => DEF_INT[k] || 2;
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** 종목별 직전 입력값(없으면 기본값). 걷기=보, 철봉=초, 스트레칭=번, 그 외=분 */
function lastVal(k) {
  const le = list('e').filter(e => e.k === k).slice(-1)[0];
  if (k === 'walk') return clampN(le && le.steps ? le.steps : 8000, STEP_MIN, STEP_MAX);
  if (k === 'bar') return clampN(le && le.sec ? le.sec : HANG_BASE, HANG_MIN, HANG_MAX);
  if (k === 'stretch') return clampN(le && le.reps ? le.reps : 30, REP_MIN, REP_MAX);
  return clampN(le && le.min && !le.steps && !le.sec && !le.reps ? Math.round(le.min) : defMin(k), 5, 600);
}
const defMin = k => ({ golfp: 60, bike: 120, sjog: 60 })[k] || 30;   // 시간 기본값(센터): 골프 60분·자전거 120분·슬로우조깅 60분
const REP_MIN = 5, REP_MAX = 100, REP_SEC = 30;   // 스트레칭 번수 입력 범위(5~100번), 1번 ≈ 30초 환산(추정)
const exOf = k => EX.find(x => x.k === k) || EX[EX.length - 1];
const metOf = (k, int) => { const x = exOf(k); return x.mets ? x.mets[int || 2] : (x.met ?? ETC_MET[int || 2]); };
const modEq = e => e.met >= 6 ? e.min * 2 : e.met >= 3 ? e.min : 0;

/* ───────── 음력·공휴일·기념일 ───────── */
// 음력 데이터: 한국천문연구원 기준 korean-lunar-calendar 패키지로 생성(음력 1990~2049년)
const LUNAR = [[7331,5,2359,13],[7715,0,1175,12],[8069,0,1611,12],[8423,3,3402,13],[8806,0,3749,12],[9161,8,3497,13],[9545,0,1453,12],[9900,0,694,12],[10254,5,4718,13],[10638,0,2350,12],[10992,0,3222,12],[11346,4,7317,13],[11730,0,3402,12],[12084,0,3493,12],[12439,2,2901,13],[12823,0,1388,12],[13177,7,5467,13],[13562,0,605,12],[13916,0,2349,12],[14270,5,6443,13],[14654,0,2709,12],[15008,0,2890,12],[15362,3,5962,13],[15746,0,2901,12],[16101,9,2741,13],[16485,0,1210,12],[16839,0,2651,12],[17194,5,2647,13],[17578,0,1323,12],[17932,0,2709,12],[18286,4,5781,13],[18670,0,1706,12],[19024,0,2773,12],[19379,2,2741,13],[19763,0,1206,12],[20117,6,5294,13],[20501,0,2647,12],[20856,0,1319,12],[21210,5,3366,13],[21593,0,3475,12],[21948,0,1450,12],[22302,3,5482,13],[22686,0,2413,12],[23041,11,2397,13],[23425,0,1198,12],[23779,0,2637,12],[24133,6,6733,13],[24517,0,3365,12],[24871,0,3410,12],[25225,5,6996,13],[25609,0,2922,12],[25964,0,2413,12],[26319,2,2395,13],[26703,0,1179,12],[27057,7,5271,13],[27441,0,2635,12],[27795,0,2853,12],[28149,5,5797,13],[28533,0,1748,12],[28887,0,2778,12]];
const L_BASE = 1990;
function lunarInfo(y) {
  const r = LUNAR[y - L_BASE]; if (!r) return null;
  const [ny, leap, bits, len] = r, months = [];
  for (let i = 0; i < len; i++) {
    let m, lp = false;
    if (!leap || i < leap) m = i + 1; else if (i === leap) { m = leap; lp = true; } else m = i;
    months.push({ m, leap: lp, len: ((bits >> (len - 1 - i)) & 1) ? 30 : 29 });
  }
  return { ny, months };
}
function lunarToDn(y, m, d, leap) {
  const info = lunarInfo(y); if (!info) return null;
  let dn = info.ny;
  for (const mo of info.months) { if (mo.m === m && mo.leap === !!leap) return dn + Math.min(d, mo.len) - 1; dn += mo.len; }
  return leap ? lunarToDn(y, m, d, false) : null;
}
const dnToTs = dn => { const u = new Date(dn * DAY); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()).getTime(); };
const tsToDn = ts => { const d = new Date(ts); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };
function toLunar(ts) {
  const dn = tsToDn(ts);
  for (let i = LUNAR.length - 1; i >= 0; i--) {
    if (dn >= LUNAR[i][0]) {
      const y = L_BASE + i, info = lunarInfo(y); let s = info.ny;
      for (const mo of info.months) { if (dn < s + mo.len) return { y, m: mo.m, d: dn - s + 1, leap: mo.leap }; s += mo.len; }
      return null;
    }
  }
  return null;
}
const FIXED_HOL = { '1-1': '신정', '3-1': '삼일절', '5-5': '어린이날', '6-6': '현충일', '8-15': '광복절', '10-3': '개천절', '10-9': '한글날', '12-25': '성탄절' };
const holCache = {};
function holidaysOfYear(y) {
  if (holCache[y]) return holCache[y];
  const h = {};
  const put = (ts, n) => { if (ts == null || new Date(ts).getFullYear() !== y) return; const k = dayKey(ts); h[k] = h[k] ? h[k] + '·' + n : n; };
  Object.entries(FIXED_HOL).forEach(([k, n]) => { const [m, d] = k.split('-').map(Number); put(new Date(y, m - 1, d).getTime(), n); });
  for (const ly of [y - 1, y]) {
    const s = lunarToDn(ly, 1, 1);
    if (s != null) { put(dnToTs(s - 1), '설날 연휴'); put(dnToTs(s), '설날'); put(dnToTs(s + 1), '설날 연휴'); }
    const b = lunarToDn(ly, 4, 8); if (b != null) put(dnToTs(b), '부처님오신날');
    const c = lunarToDn(ly, 8, 15); if (c != null) { put(dnToTs(c - 1), '추석 연휴'); put(dnToTs(c), '추석'); put(dnToTs(c + 1), '추석 연휴'); }
  }
  return (holCache[y] = h);
}
const DEFAULT_ANNIV = [];
const seedAnnivs = () => DEFAULT_ANNIV.map((a, i) => ({ id: 'a' + i, ...a }));
const annivs = () => (S.profile && Array.isArray(S.profile.annivs)) ? S.profile.annivs : [];
function occOf(a, y) {
  if (a.lunar) { const dn = lunarToDn(y, a.m, a.d, false); return dn == null ? null : dnToTs(dn); }
  return new Date(y, a.m - 1, Math.min(a.d, new Date(y, a.m, 0).getDate())).getTime();
}
function occIn(a, from, to) {
  const out = [];
  for (let y = new Date(from).getFullYear() - 1; y <= new Date(to).getFullYear(); y++) { const ts = occOf(a, y); if (ts != null && ts >= from && ts < to) out.push({ ts, y, a }); }
  return out.sort((p, q) => p.ts - q.ts);
}
function upcoming(days) { const t0 = sod(Date.now()), t1 = addDays(t0, days || 400); return annivs().map(a => occIn(a, t0, t1)[0]).filter(Boolean).sort((x, y) => x.ts - y.ts); }
const ddayOf = ts => Math.round((sod(ts) - sod(Date.now())) / DAY);
function annDesc(o) {
  const a = o.a;
  let s = a.lunar ? `음력 ${a.m}.${a.d} → 양력 ${fmtD(o.ts)}` : `양력 ${a.m}.${a.d} (${WD[new Date(o.ts).getDay()]})`;
  if (a.year) { const n = o.y - a.year; if (n > 0) s += a.k === 'wed' ? ` · ${n}주년` : a.k === 'bday' ? ` · 만 ${n}세` : ` · ${n}년째`; }
  return s;
}
const ddayChip = d => `<span class="dday${d <= 7 ? ' near' : d > 60 ? ' far' : ''}">${d === 0 ? '오늘' : 'D-' + d}</span>`;
const annIcon = a => { const c = ANN_CAT[catOf(a)]; return `<span class="ac x-${c.x}" title="${c.n}">${ICO[c.ic]}</span>`; };
const annLi = o => `<li class="ann-li" data-act="cal-jump" data-d="${dayKey(o.ts)}" role="button" tabindex="0">${ddayChip(ddayOf(o.ts))}${annIcon(o.a)}<div class="a-main"><span class="a-n">${esc(o.a.n)}</span><span class="a-s">${esc(annDesc(o))}${o.a.memo ? ' · ' + esc(o.a.memo) : ''}</span></div></li>`;
function annsOnDay(ts) { const t0 = sod(ts); return annivs().map(a => occIn(a, t0, addDays(t0, 1))[0]).filter(Boolean); }
const ICO = {
  scale: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 10.5a5.5 5.5 0 0 1 8 0"/><path d="M12 10.5l1.6-1.8"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/><path d="M6.5 12.5h3l1.3-2 2 4 1.3-2h3.4"/></svg>',
  bike: '<svg viewBox="0 0 24 24"><circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l3 7M9 6h3"/></svg>',
  cup: '<svg viewBox="0 0 24 24"><path d="M6 4h12l-1.5 15a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8z"/><path d="M6.6 9h10.8"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="11" rx="2"/><path d="M3 9h18M12 9v11"/><path d="M12 9C10 5 6 5 6 7.5S12 9 12 9zm0 0c2-4 6-4 6-1.5S12 9 12 9z"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>',
  db: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 19h16"/><path d="M5 15l4-5 4 3 6-7"/></svg>',
  cake: '<svg viewBox="0 0 24 24"><path d="M4 20h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M4 15c2 1.5 4 1.5 6 0s4-1.5 6 0 3 1 4 0M12 11V7M12 4.5v.01"/></svg>',
  flower: '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="2.2"/><path d="M12 6.8a2.6 2.6 0 1 1 2.2 1M14.2 9.6a2.6 2.6 0 1 1-1 2.2M9.8 9.6a2.6 2.6 0 1 0 1 2.2M9.8 7.8a2.6 2.6 0 1 1 2.2-1M12 11.2V21M12 17c-2-2.5-4-2.5-5-2M12 18c2-2 4-2 5-1.5"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  rings: '<svg viewBox="0 0 24 24"><circle cx="9" cy="14" r="5"/><circle cx="15" cy="14" r="5"/><path d="M9 5l1.5-2h3L15 5l-3 2z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M7.8 12.3l2.8 2.8 5.6-5.8"/></svg>',
  drop: '<svg viewBox="0 0 24 24"><path d="M12 2.8c3.2 4.4 6.2 7.7 6.2 11.4a6.2 6.2 0 0 1-12.4 0c0-3.7 3-7 6.2-11.4z"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z"/><path d="M5 16a4 4 0 0 1 4-4h9M9 8h5"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>'
};
const tileHead = (icon, title, right) => `<div class="tile-h"><div class="th"><span class="ib">${ICO[icon]}</span><h2>${title}</h2></div>${right || ''}</div>`;

/* ───────── 메시지 문구 ───────── */
const M = {
  inc1: [
    ['any', '체중계가 오늘따라 정직하네요. 물 한 잔과 저녁 산책으로 원상복구 갑시다.'],
    ['any', '야식이었다면 체중계는 이미 알고 있습니다. 내일 아침이 승부처입니다.'],
    ['any', '어제 저녁 메뉴가 잠깐 떠오르시죠? 오늘 국물은 반만 드세요.'],
    ['any', '체중계가 살짝 놀랐습니다. 수분일 가능성도 크니 오늘 한 걸음 더 걸어 봐요.'],
    ['any', '짠 음식은 다음 날 체중계에 꼭 흔적을 남깁니다. 오늘은 물을 넉넉히.'],
    ['any', '접수했습니다. 내일 이 숫자를 지울 기회가 아직 남아 있습니다.'],
    ['build', '공정으로 치면 경미한 지연입니다. 저녁 산책 30분이면 만회됩니다.'],
    ['build', '허용오차 안이지만 기록에는 남습니다. 내일 아침 재검측 바랍니다.'],
    ['build', '설계변경까지는 필요 없습니다. 저녁 한 끼만 시공 관리합시다.'],
    ['plain', '직전 기록보다 늘었습니다. 다음 측정에서 추세를 확인해 보세요.']],
  inc2: [
    ['any', '체중계가 사유서를 요청합니다. 오늘은 짠 음식 OFF, 걷기 30분 ON.'],
    ['any', '즐거운 식사였다는 증거입니다. 이틀만 가볍게 먹으면 제자리입니다.'],
    ['any', '체중계가 "저 고장 났나요?" 하고 묻습니다. 아닙니다. 오늘부터 조절합시다.'],
    ['any', '물 충분히, 야식 없이, 30분 걷기. 이 세 가지면 금방 돌아옵니다.'],
    ['build', '공정으로 치면 지연 경보 단계입니다. 이번 주 만회 계획 들어갑니다.'],
    ['build', '감리 지적사항입니다. 시정조치: 저녁 탄수화물 절반.'],
    ['build', '하중이 설계치를 넘기 시작했습니다. 보강 공법은 걷기로 합시다.'],
    ['plain', '직전 기록보다 1kg 이상 늘었습니다. 식사량과 염분을 점검해 보세요.']],
  inc3: [['all', '직전 기록보다 {d}kg 늘었습니다. 하루 사이 변화로는 큰 편입니다. 측정 시간, 옷, 식사 직후인지 확인하고 다시 재 보세요.']],
  dec1: [
    ['any', '체중계가 오늘은 칭찬 모드입니다. 이 페이스 그대로 갑시다.'],
    ['any', '가벼워진 만큼 오늘 걸음도 가볍기를 바랍니다.'],
    ['any', '어제의 선택이 오늘 숫자로 돌아왔습니다. 잘하셨어요.'],
    ['any', '이 기분 기억해 두세요. 내일도 써먹을 겁니다.'],
    ['any', '작지만 확실한 진전입니다.'],
    ['build', '작은 공정이 모여 준공이 됩니다.'],
    ['build', '공정률 상승 확인. 이대로면 목표 준공일을 앞당깁니다.'],
    ['build', '경량화 공법 적용에 성공했습니다.'],
    ['plain', '직전 기록보다 줄었습니다. 좋은 흐름입니다.']],
  dec2: [
    ['any', '대단합니다. 다만 수분 변화도 섞여 있을 수 있으니 내일 아침 한 번 더 확인해 봐요.'],
    ['any', '기쁜 숫자입니다. 무리하지 말고 지금처럼만 가요. 내일 재측정으로 확인합시다.'],
    ['build', '공정이 크게 진척됐습니다. 품질 확인 차원에서 내일 아침 재검측 부탁드립니다.'],
    ['plain', '직전 기록보다 1kg 이상 줄었습니다. 내일 같은 시간에 다시 확인해 보세요.']],
  dec3: [['all', '직전 기록보다 {d}kg 줄었습니다. 하루 사이 변화로는 큰 편이라 수분이나 측정 차이일 가능성이 큽니다. 식사를 지나치게 줄이고 있지는 않은지도 살펴보세요.']],
  recover: [
    ['any', '지난번 늘었던 {pd}kg, 원상복구 완료. 역시 복원력이 다릅니다.'],
    ['any', '늘었던 {pd}kg을 되찾아 왔습니다. 체중계도 안심했습니다.'],
    ['build', '지연됐던 공정 만회 완료(+{pd}kg 복구). 깔끔합니다.'],
    ['plain', '지난번 늘었던 체중이 다시 줄었습니다.']],
  sameday: [['all', '같은 날 {sp} 기록보다 {sd}kg 차이가 납니다. 식사와 수분 때문에 하루 중에도 체중은 오르내리니, 같은 시간대 기록끼리 비교해 보세요.']],
  goal: [['any', '목표 체중 {t}kg에 도달했습니다. 꾸준함이 만든 결과입니다.'], ['build', '목표 체중 {t}kg 준공! 꾸준한 공정 관리의 결과입니다.'], ['plain', '목표 체중 {t}kg에 도달했습니다.']],
  bmiDown: [['all', 'BMI가 \'{from}\'에서 \'{to}\' 단계로 내려왔습니다. 의미 있는 변화입니다.']],
  wkDrop: [['any', '최근 7일 평균 체중이 그 전 주보다 {d}kg 낮습니다. 좋은 흐름입니다.'], ['build', '주간 공정 점검 결과, 7일 평균이 {d}kg 내려갔습니다. 계획대로 진행 중입니다.'], ['plain', '최근 7일 평균 체중이 전주보다 {d}kg 낮습니다.']],
  bpDown: [['any', '최근 7일 평균 혈압이 \'{from}\'에서 \'{to}\'(으)로 내려왔습니다. 생활 관리가 효과를 내고 있습니다.'], ['build', '혈압 7일 평균이 \'{from}\'에서 \'{to}\'(으)로 안정화됐습니다. 설비 정상 가동 중입니다.'], ['plain', '최근 7일 평균 혈압이 \'{from}\'에서 \'{to}\'(으)로 내려왔습니다.']],
  bpStable: [['any', '최근 2주 동안 가정혈압 기준(135/85) 아래를 유지했습니다. 이 흐름을 지켜 가요.'], ['build', '2주 연속 무사고 운전. 가정혈압 135/85 아래를 유지했습니다.'], ['plain', '최근 2주 동안 가정혈압 135/85 아래를 유지했습니다.']],
  bpCaution: [['all', '최근 7일 평균 혈압이 {s}/{d}mmHg로 가정혈압 기준(135/85) 이상입니다. 담당 의사와 상담을 권장합니다.']],
  bpHigh: [['all', '이번 측정값 {s}/{d}mmHg는 고혈압 2기 범위입니다. 5분 쉰 뒤 다시 재 보고, 반복되면 담당 의사와 상담하세요.']],
  ex150: [['any', '이번 주 권장 운동량 {g}분을 채웠습니다. 몸이 기억할 한 주입니다.'], ['build', '이번 주 운동 공정 100% 달성. {g}분 준공입니다.'], ['plain', '이번 주 운동 목표 {g}분을 달성했습니다.']],
  streak: [['any', '{n}일 연속 기록 중입니다. 기록이 쌓일수록 추세가 정확해집니다.'], ['build', '{n}일 연속 공정일보 작성 중입니다. 기록이 쌓일수록 관리가 정확해집니다.'], ['plain', '{n}일 연속 기록했습니다.']]
};
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
function pick(tier, vars = {}) {
  const tone = S.profile?.tone || 'warm';
  const all = M[tier];
  let pool = all.filter(([t]) => t === 'all' || (tone === 'plain' ? t === 'plain' : (t === 'any' || t === tone)));
  if (!pool.length) pool = all;
  const hist = S.meta.hist[tier] || [];
  let cand = pool.filter(([, x]) => !hist.includes(x));
  if (!cand.length) cand = pool;
  const [, x] = cand[Math.floor(Math.random() * cand.length)];
  S.meta.hist[tier] = [...hist, x].slice(-5);
  return fill(x, vars);
}

/* ───────── 상태·저장 ───────── */
function blank() { return { v: 1, profile: null, entries: {}, deleted: {}, meta: { updatedAt: 0, lastBackup: 0, hist: {}, fired: {}, lastWeightCard: null, lastIncDay: '', lastCard: null } }; }
function normalize(o) {
  const b = blank();
  if (!o || typeof o !== 'object') return b;
  b.profile = o.profile || null;
  b.entries = (o.entries && typeof o.entries === 'object') ? o.entries : {};
  b.deleted = o.deleted || {};
  b.meta = Object.assign(b.meta, o.meta || {});
  b.meta.hist = b.meta.hist || {}; b.meta.fired = b.meta.fired || {};
  return b;
}
function loadLocal() { try { const raw = localStorage.getItem(KEY); return raw ? normalize(JSON.parse(raw)) : blank(); } catch (e) { return blank(); } }
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(REAL)); } catch (e) { /* 저장 불가 환경 */ } }
let REAL = loadLocal();
let S = REAL;
let DEMO = false;
const APP = !!window.Android;
const remote = { state: APP ? 'local' : 'connecting', db: null, uid: null, lastSync: 0 };
const ui = { tab: 'rec', logTab: 'w', metric: 'all', period: 'week', offset: 0, confirmDel: null, pending: null };
let bootTimedOut = false;

function merge(a, b) {
  const out = blank();
  out.deleted = { ...a.deleted, ...b.deleted };
  const all = { ...a.entries };
  for (const [id, e] of Object.entries(b.entries)) { const x = all[id]; if (!x || (e.u || 0) > (x.u || 0)) all[id] = e; }
  for (const id in out.deleted) delete all[id];
  out.entries = all;
  const pa = a.profile, pb = b.profile;
  out.profile = !pa ? pb : !pb ? pa : ((pb.updatedAt || 0) > (pa.updatedAt || 0) ? pb : pa);
  const ma = a.meta, mb = b.meta, newer = (mb.updatedAt || 0) > (ma.updatedAt || 0) ? mb : ma;
  out.meta = { ...newer, hist: { ...(newer.hist || {}) }, lastBackup: Math.max(ma.lastBackup || 0, mb.lastBackup || 0), fired: { ...ma.fired, ...mb.fired } };
  return out;
}
const list = t => Object.values(S.entries).filter(e => e.t === t).sort((a, b) => a.ts - b.ts);

/* 원격(계정 전용 저장소) */
const dirty = { months: new Set(), profile: false };
let flushTimer = null, chain = Promise.resolve();
function markDirty(ts, profile = true) { if (ts != null) dirty.months.add(monthKey(ts)); if (profile) dirty.profile = true; scheduleFlush(); }
function scheduleFlush() { if (remote.state !== 'on') return; clearTimeout(flushTimer); flushTimer = setTimeout(() => { chain = chain.then(flush); }, 700); }
async function flush() {
  if (remote.state !== 'on') return;
  const col = remote.db.collection('data/users/' + remote.uid);
  const months = [...dirty.months]; dirty.months.clear();
  const prof = dirty.profile; dirty.profile = false;
  try {
    for (const m of months) {
      const entries = Object.values(REAL.entries).filter(e => monthKey(e.ts) === m).sort((x, y) => x.ts - y.ts);
      await col.doc('m-' + m).set({ entries });
    }
    if (prof) await col.doc('profile').set({ profile: REAL.profile, deleted: REAL.deleted, meta: REAL.meta });
    remote.lastSync = Date.now();
  } catch (err) {
    months.forEach(m => dirty.months.add(m)); if (prof) dirty.profile = true;
    const c = err && err.code;
    if (c === 'invalid_argument' || c === 'transform_error') remote.state = 'readonly';
    else if (c === 'unavailable' || c === 'resource_exhausted') setTimeout(scheduleFlush, 3000 + Math.random() * 3000);
    else if (c === 'quota_exceeded') { remote.state = 'readonly'; toast('계정 저장 공간이 가득 찼습니다. 백업 후 문의해 주세요.'); }
    else remote.state = 'local';
  }
  if (ui.tab === 'set') render();
}
async function initRemote() {
  if (APP) { remote.state = 'local'; render(); return; }
  for (let i = 0; i < 15 && !(window.claude && window.claude.use); i++) await new Promise(r => setTimeout(r, 200));
  if (!(window.claude && window.claude.use)) { remote.state = 'local'; render(); return; }
  try {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    const uid = user ? await user.id() : null;
    if (!db || !uid) { remote.state = 'local'; render(); return; }
    remote.db = db; remote.uid = uid;
    const snap = await db.collection('data/users/' + uid).get();
    const rs = blank(); const remoteMonths = {};
    snap.docs.forEach(doc => {
      if (!doc.exists) return;
      const b = doc.data() || {};
      if (doc.id === 'profile') { rs.profile = b.profile || null; rs.deleted = { ...(b.deleted || {}) }; rs.meta = Object.assign(rs.meta, b.meta || {}); rs.meta.hist = rs.meta.hist || {}; rs.meta.fired = rs.meta.fired || {}; }
      else if (doc.id.startsWith('m-')) { const arr = Array.isArray(b.entries) ? b.entries : []; remoteMonths[doc.id.slice(2)] = JSON.stringify(arr); arr.forEach(e => { rs.entries[e.id] = e; }); }
    });
    const merged = merge(rs, REAL);
    const sig = m => JSON.stringify(Object.values(merged.entries).filter(e => monthKey(e.ts) === m).sort((x, y) => x.ts - y.ts));
    const monthsAll = new Set([...Object.keys(remoteMonths), ...Object.values(merged.entries).map(e => monthKey(e.ts))]);
    monthsAll.forEach(m => { if (sig(m) !== (remoteMonths[m] || '[]')) dirty.months.add(m); });
    if (JSON.stringify({ p: merged.profile, d: merged.deleted }) !== JSON.stringify({ p: rs.profile, d: rs.deleted }) || (merged.meta.updatedAt || 0) !== (rs.meta.updatedAt || 0)) dirty.profile = true;
    REAL = merged; if (!DEMO) S = REAL;
    saveLocal();
    remote.state = 'on'; remote.lastSync = Date.now();
    if (dirty.months.size || dirty.profile) scheduleFlush();
  } catch (err) { remote.state = 'local'; }
  render();
}
function persist(ts) { S.meta.updatedAt = Date.now(); if (S === REAL && !DEMO) { saveLocal(); markDirty(ts, true); } }

/* ───────── 메시지 엔진 ───────── */
function streakCard(ts) {
  const today = dayKey(Date.now());
  if (dayKey(ts) !== today) return null;
  const days = new Set(Object.values(S.entries).map(e => dayKey(e.ts)));
  let n = 0, d = sod(Date.now());
  while (days.has(dayKey(d))) { n++; d = addDays(d, -1); }
  if ([7, 30, 100, 365].includes(n) && !S.meta.fired['st' + n + '@' + today]) { S.meta.fired['st' + n + '@' + today] = 1; return { kind: 'good', title: n + '일 연속 기록', text: pick('streak', { n }) }; }
  return null;
}
const nickT = s => (S.profile?.nick ? S.profile.nick + ', ' : '') + s;
function avgW(from, to) { const a = list('w').filter(e => e.ts > from && e.ts <= to).map(e => e.w); return a.length ? { v: avg(a), n: a.length } : null; }
function weightMessage(e) {
  const ws = list('w'); const i = ws.findIndex(x => x.id === e.id); const prev = i > 0 ? ws[i - 1] : null;
  const p = S.profile || {};
  if (p.targetWeight && prev && prev.w > p.targetWeight && e.w <= p.targetWeight) return { kind: 'good', title: nickT('목표 달성'), text: pick('goal', { t: f1(p.targetWeight) }) };
  if (p.height && prev) {
    const a = bmiIdx(bmiOf(prev.w, p.height)), b = bmiIdx(bmiOf(e.w, p.height));
    if (b < a && a >= 2 && !S.meta.fired['bmi' + b]) { S.meta.fired['bmi' + b] = 1; return { kind: 'good', title: nickT('BMI 단계 하향'), text: pick('bmiDown', { from: BMI[a].n, to: BMI[b].n }) }; }
  }
  if (prev) {
    const d = Math.round((e.w - prev.w) * 10) / 10, ad = Math.abs(d);
    if (ad >= 0.5) {
      if (dayKey(prev.ts) === dayKey(e.ts) && slotOf(prev.ts) !== slotOf(e))
        return { kind: 'info', title: '하루 중 변동', text: pick('sameday', { sp: slotOf(prev.ts), sd: (d > 0 ? '+' : '−') + f1(ad) }) };
      const gapDays = Math.round((sod(e.ts) - sod(prev.ts)) / DAY);
      const gap = gapDays >= 3 ? gapDays + '일 만의 기록입니다. ' : '';
      if (d > 0) {
        const today = dayKey(e.ts);
        if (!(S.meta.lastIncDay === today && ad < 2)) {
          S.meta.lastIncDay = today;
          S.meta.lastWeightCard = { kind: 'inc', d: ad };
          const tier = ad >= 2 ? 'inc3' : ad >= 1 ? 'inc2' : 'inc1';
          return tier === 'inc3' ? { kind: 'care', title: '측정 조건을 확인해 주세요', text: gap + pick(tier, { d: f1(ad) }) }
            : { kind: 'warn', title: nickT('+' + f1(ad) + 'kg'), text: gap + pick(tier, { d: f1(ad) }) };
        }
      } else {
        const lw = S.meta.lastWeightCard;
        if (lw && lw.kind === 'inc' && ad < 2) { S.meta.lastWeightCard = null; return { kind: 'good', title: nickT('원상복구'), text: gap + pick('recover', { pd: f1(lw.d) }) }; }
        S.meta.lastWeightCard = { kind: 'dec', d: ad };
        const tier = ad >= 2 ? 'dec3' : ad >= 1 ? 'dec2' : 'dec1';
        return tier === 'dec3' ? { kind: 'care', title: '변화 폭을 점검해 주세요', text: gap + pick(tier, { d: f1(ad) }) }
          : { kind: 'good', title: nickT('−' + f1(ad) + 'kg'), text: gap + pick(tier, { d: f1(ad) }) };
      }
    }
  }
  const c = avgW(e.ts - 7 * DAY, e.ts), pr = avgW(e.ts - 14 * DAY, e.ts - 7 * DAY);
  if (c && pr && c.n >= 3 && pr.n >= 3) {
    const dd = Math.round((pr.v - c.v) * 10) / 10, wk = weekKey(e.ts);
    if (dd >= 0.3 && dd <= 1.0 && !S.meta.fired['wd@' + wk]) { S.meta.fired['wd@' + wk] = 1; return { kind: 'good', title: nickT('주간 흐름 양호'), text: pick('wkDrop', { d: f1(dd) }) }; }
  }
  return null;
}
function avgBP(from, to) { const v = list('v').filter(e => e.ts > from && e.ts <= to); return v.length ? { s: avg(v.map(e => e.s)), d: avg(v.map(e => e.d)), n: v.length } : null; }
function vitalsMessage(e) {
  if (e.s >= 160 || e.d >= 100) return { kind: 'care', title: '다시 측정해 보세요', text: pick('bpHigh', { s: e.s, d: e.d }) };
  const now = e.ts, c = avgBP(now - 7 * DAY, now), p = avgBP(now - 14 * DAY, now - 7 * DAY), wk = weekKey(now);
  if (c && p && c.n >= 3 && p.n >= 3) {
    const lc = bpLevel(c.s, c.d), lp = bpLevel(p.s, p.d);
    if (lc < lp && !S.meta.fired['bpd@' + wk]) { S.meta.fired['bpd@' + wk] = 1; return { kind: 'good', title: nickT('혈압 안정화'), text: pick('bpDown', { from: BP[lp].n, to: BP[lc].n }) }; }
  }
  const v14 = list('v').filter(x => x.ts > now - 14 * DAY && x.ts <= now);
  const byDay = {}; v14.forEach(x => (byDay[dayKey(x.ts)] = byDay[dayKey(x.ts)] || []).push(x));
  if (Object.keys(byDay).length >= 10) {
    const ok = Object.values(byDay).every(a => avg(a.map(x => x.s)) < 135 && avg(a.map(x => x.d)) < 85);
    if (ok && now - (S.meta.fired.bps || 0) >= 14 * DAY) { S.meta.fired.bps = now; return { kind: 'good', title: nickT('2주 안정 유지'), text: pick('bpStable') }; }
  }
  if (c && c.n >= 4 && (c.s >= 135 || c.d >= 85) && now - (S.meta.fired.bpc || 0) >= 3 * DAY) { S.meta.fired.bpc = now; return { kind: 'care', title: '최근 7일 평균 확인', text: pick('bpCaution', { s: r0(c.s), d: r0(c.d) }) }; }
  return null;
}
function weekMod(ts) { const ws = weekStart(ts), we = addDays(ws, 7); return exList().filter(x => x.ts >= ws && x.ts < we).reduce((a, x) => a + modEq(x), 0); }
function exMessage(e) {
  const goal = S.profile?.exGoal || 150, tot = weekMod(e.ts), before = tot - modEq(e), wk = weekKey(e.ts);
  if (before < goal && tot >= goal && !S.meta.fired['ex@' + wk]) { S.meta.fired['ex@' + wk] = 1; return { kind: 'good', title: nickT('주간 목표 달성'), text: pick('ex150', { g: goal }) }; }
  return null;
}

/* ───────── 공통 렌더 조각 ───────── */
function deltaChip(d, unit, invert) {
  if (d == null) return '';
  const r = Math.round(d * 10) / 10;
  if (r === 0) return `<span class="delta flat">±0${unit === 'kg' ? '.0' : ''}</span>`;
  const up = r > 0;
  return `<span class="delta ${up !== !!invert ? 'up' : 'down'}">${up ? '+' : '−'}${unit === 'kg' ? f1(Math.abs(r)) : Math.abs(r)}</span>`;
}
function spark(vals) {
  if (vals.length < 2) return '';
  const W = 300, H = 44, mn = Math.min(...vals), mx = Math.max(...vals), sp = (mx - mn) || 1;
  const pts = vals.map((v, i) => [4 + i * (W - 8) / (vals.length - 1), 6 + (mx - v) / sp * (H - 12)]);
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="M${pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L')}" vector-effect="non-scaling-stroke"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5"/></svg>`;
}
const cardBlock = c => `<div class="msg k-${c.kind}"><div class="msg-t">${esc(c.title)}</div><p>${esc(c.text)}</p>${c.at ? `<div class="msg-s">${fmtDT(c.at)} 메시지</div>` : ''}</div>`;
const radios = (name, opts, cur) => `<div class="seg" role="radiogroup">${opts.map(o => `<label><input type="radio" id="${name}-${o.v}" name="${name}" value="${o.v}"${String(o.v) === String(cur) ? ' checked' : ''}><span>${esc(o.l)}</span></label>`).join('')}</div>`;
function stepper(id, label, val, o) {
  return `<div class="stp"><span class="stp-l">${label}</span><button type="button" class="step" data-act="step" data-for="${id}" data-step="-${o.step || 1}" aria-label="${label} 줄이기">−</button><input id="${id}" inputmode="${o.dec ? 'decimal' : 'numeric'}" autocomplete="off" value="${val ?? ''}" data-min="${o.min}" data-max="${o.max}" data-dec="${o.dec || 0}" placeholder="${o.ph || ''}" data-base="${o.base ?? ''}" aria-label="${label}"><button type="button" class="step" data-act="step" data-for="${id}" data-step="${o.step || 1}" aria-label="${label} 늘리기">+</button><span class="stp-u">${o.unit || ''}</span></div>`;
}
function banners() {
  let h = '';
  if (DEMO) h += `<div class="banner demo"><b>예시 데이터로 둘러보는 중입니다.</b><span>여기서 입력한 내용은 저장되지 않습니다.</span><button class="btn sm primary" data-act="demo-exit">예시 끝내고 내 기록 시작</button></div>`;
  else {
    const n = Object.keys(S.entries).length, lb = S.meta.lastBackup || 0;
    if (n >= 10 && Date.now() - lb > 30 * DAY) h += `<div class="banner"><b>${lb ? '마지막 백업 후 30일이 지났습니다.' : '아직 백업 파일이 없습니다.'}</b><span>${remote.state === 'on' ? '계정 저장소에 보관 중이지만, 만일에 대비해 월 1회 백업 파일을 받아 두세요.' : (APP ? '기록이 이 휴대폰에만 있습니다. 백업 파일을 구글 드라이브에 저장해 두세요.' : '기록이 이 기기 브라우저에만 있습니다. 백업 파일을 받아 두세요.')}</span><button class="btn sm primary" data-act="backup-json">백업 파일 저장</button></div>`;
  }
  return h;
}

/* ───────── 화면: 홈 ───────── */
/* ───────── 화면: 기록 ───────── */
function latestBefore(type, ts) { const a = list(type).filter(e => e.ts <= ts); return a[a.length - 1] || null; }
/* ───────── v3 공통 조각 ───────── */
const last = a => a[a.length - 1];
const EXC = { bike: 'e', ibike: 'e', golfp: 'h', golfr: 'h', sjog: 'w', jog: 'w', yoga: 'c', stretch: 'c', bar: 'i', tt: 'v', walk: 'r', etc: 'r' };
const EXG = { bike: 'bike', ibike: 'bike', golfp: 'golfp', golfr: 'golfp', sjog: 'sjog', jog: 'sjog', yoga: 'yoga', stretch: 'stretch', bar: 'bar', walk: 'walk', tt: 'tt' };
const FACE = (x, y, closed) => `<circle cx="${x}" cy="${y}" r="7.5" fill="#F5C6A0"/>${closed ? `<path d="M${x - 3.6} ${y - .6}q1.3 1.2 2.6 0M${x + 1} ${y - .6}q1.3 1.2 2.6 0" stroke="#3A2E2A" stroke-width="1.2" fill="none" stroke-linecap="round"/>` : `<circle cx="${x - 2.4}" cy="${y - .8}" r="1.1" fill="#3A2E2A"/><circle cx="${x + 2.6}" cy="${y - .8}" r="1.1" fill="#3A2E2A"/>`}<path d="M${x - 2.4} ${y + 2.6}q2.5 2.2 5 0" stroke="#A0533F" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
const EXIMG = {
  bike: `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="46" fill="#E3EEFB"/><path d="M10 81h76" stroke="#BCD2EE" stroke-width="3" stroke-linecap="round"/><g fill="none" stroke="#2F3A56" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="26" cy="66" r="13"/><circle cx="72" cy="66" r="13"/><path d="M26 66l13-19h22l11 19M39 47l9 19 13-19M48 66H26M35 42h9M61 47l3-8h5"/></g><path d="M41 40l13 10-6 14" stroke="#2F3A56" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M41 40l15-13" stroke="#1C7AD6" stroke-width="11" stroke-linecap="round"/><path d="M56 28l9 11" stroke="#F5C6A0" stroke-width="4.5" stroke-linecap="round"/>${FACE(63, 19)}<path d="M55.5 18a7.5 7.5 0 0 1 15 0z" fill="#1C7AD6"/></svg>`,
  golfp: `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="46" fill="#DDF3EA"/><path d="M10 82h76" stroke="#B5E0CE" stroke-width="3" stroke-linecap="round"/><path d="M46 58l-8 23M46 58l8 23" stroke="#2F3A56" stroke-width="6.5" fill="none" stroke-linecap="round"/><path d="M46 58l1-21" stroke="#0C9273" stroke-width="12" stroke-linecap="round"/><path d="M60 27l12-13" stroke="#4A4F5C" stroke-width="2.6" stroke-linecap="round"/><path d="M69.5 12.5l5-1.5 1.5 4.5" stroke="#4A4F5C" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M45 41l14-14M50 40l10-13" stroke="#F5C6A0" stroke-width="4.5" stroke-linecap="round"/>${FACE(48, 27)}<path d="M40.5 26a7.5 7.5 0 0 1 15 0h4.5z" fill="#0C9273"/><circle cx="36" cy="79" r="3" fill="#FFFFFF" stroke="#9AA3AE" stroke-width="1.2"/></svg>`,
  sjog: `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="46" fill="#FDE8DE"/><path d="M10 82h76" stroke="#F4C7B3" stroke-width="3" stroke-linecap="round"/><path d="M12 40h12M8 50h13M14 60h10" stroke="#F2B49A" stroke-width="3" stroke-linecap="round"/><path d="M46 54l-6 10-10 8M46 54l10 10-2 15h6" stroke="#2F3A56" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M46 54l4-20" stroke="#DD5329" stroke-width="12" stroke-linecap="round"/><path d="M48 37l-7 8-4 7M51 37l7 8 6-7" stroke="#F5C6A0" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${FACE(53, 23)}<path d="M45.6 20.5h14.8" stroke="#DD5329" stroke-width="3" stroke-linecap="round"/></svg>`,
  walk: `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="46" fill="#FFF0CE"/><path d="M10 82h76" stroke="#F0D79B" stroke-width="3" stroke-linecap="round"/><path d="M46 56l-9 11-9 12M46 56l9 11 3 12" stroke="#2F3A56" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="26" cy="80.5" rx="6" ry="3" fill="#C98A00"/><ellipse cx="61" cy="80.5" rx="6" ry="3" fill="#C98A00"/><path d="M46 56l3-21" stroke="#C98A00" stroke-width="12" stroke-linecap="round"/><path d="M47 39l-7 9-3 8M51 39l8 7 6-4" stroke="#F5C6A0" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${FACE(52, 25)}<path d="M44.5 23a7.5 7.5 0 0 1 15 0z" fill="#C98A00"/><path d="M72 30h10M76 38h8" stroke="#F0D79B" stroke-width="3" stroke-linecap="round"/></svg>`,
  stretch: `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="46" fill="#EEE7FB"/><path d="M10 82h76" stroke="#D3C5F2" stroke-width="3" stroke-linecap="round"/><path d="M46 60l-8 21M50 60l9 21" stroke="#2F3A56" stroke-width="6.5" fill="none" stroke-linecap="round"/><path d="M48 60l7-21" stroke="#7243D6" stroke-width="12" stroke-linecap="round"/><path d="M52 42l8-15 4-12M57 41l7-12 8-8" stroke="#F5C6A0" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${FACE(51, 32)}<path d="M43.5 29a7.5 7.5 0 0 1 15 0z" fill="#7243D6"/><path d="M22 30q-5 10 0 20" stroke="#D3C5F2" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
  bar: `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="46" fill="#E4E8FB"/><path d="M14 82V16M82 82V16" stroke="#C5CCF0" stroke-width="4" stroke-linecap="round"/><path d="M10 16h76" stroke="#5D6B7A" stroke-width="5" stroke-linecap="round"/><path d="M48 44v21" stroke="#3B4FD8" stroke-width="12" stroke-linecap="round"/><path d="M44 66l-2 15M52 66l2 15" stroke="#2F3A56" stroke-width="6.5" fill="none" stroke-linecap="round"/><path d="M42.5 42L38 18M53.5 42L58 18" stroke="#F5C6A0" stroke-width="4.5" fill="none" stroke-linecap="round"/><circle cx="38" cy="16" r="3.4" fill="#F5C6A0"/><circle cx="58" cy="16" r="3.4" fill="#F5C6A0"/>${FACE(48, 32)}<path d="M40.5 29a7.5 7.5 0 0 1 15 0z" fill="#3B4FD8"/></svg>`,
  tt: `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="46" fill="#FCE4EC"/><rect x="8" y="63" width="44" height="5" rx="1.5" fill="#1F6F5C"/><path d="M30 63v-7M14 68v13M46 68v13" stroke="#5D6B7A" stroke-width="2.5" stroke-linecap="round"/><path d="M30 56v7" stroke="#FFFFFF" stroke-width="2"/><path d="M66 58l-6 23M66 58l7 23" stroke="#2F3A56" stroke-width="6.5" fill="none" stroke-linecap="round"/><path d="M66 58l-2-20" stroke="#CF2E62" stroke-width="12" stroke-linecap="round"/><path d="M62 41l-8 5-6-2M67 41l6 9" stroke="#F5C6A0" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M47 43l-3 5" stroke="#8D6E63" stroke-width="3" stroke-linecap="round"/><circle cx="43" cy="39" r="6.5" fill="#D32F2F"/><circle cx="30" cy="34" r="2.8" fill="#FFFFFF" stroke="#E0A800" stroke-width="1.2"/>${FACE(63, 27)}</svg>`,
  yoga: `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="46" fill="#EEE7FB"/><rect x="24" y="81" width="48" height="5" rx="2.5" fill="#C9B6F2"/><path d="M48 57v24M48 57l13 7-11 6" stroke="#2F3A56" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M48 57V37" stroke="#7243D6" stroke-width="12" stroke-linecap="round"/><path d="M45 39l-9-15 10-13M51 39l9-15-10-13" stroke="#F5C6A0" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${FACE(48, 29, true)}<path d="M41 26.5a7.5 7.5 0 0 1 14 0" stroke="#3A2E2A" stroke-width="3" fill="none"/></svg>`
};
const exIco = k => EXG[k] ? `<span class="exmini">${EXIMG[EXG[k]]}</span>` : '<i class="xdot"></i>';
const ANN_CAT = {
  bday: { n: '가족 생일', ic: 'cake', x: 'w' }, elder: { n: '어르신 생신', ic: 'flower', x: 'v' },
  kid: { n: '손주 생일', ic: 'star', x: 'e' }, wed: { n: '결혼기념일', ic: 'rings', x: 'c' },
  inlaw: { n: '며느리·사위 생일', ic: 'cake', x: 'h' }, etc: { n: '기타 기념일', ic: 'gift', x: 'r' }
};
function catOf(a) {
  if (a.c && ANN_CAT[a.c]) return a.c;
  if (/며느리|사위/.test(a.n)) return 'inlaw';
  if (/손녀|손자|손주/.test(a.n)) return 'kid';
  if (/장모|장인|어머니|아버지|어머님|아버님|할머니|할아버지/.test(a.n)) return 'elder';
  if (a.k === 'wed' || /결혼/.test(a.n)) return 'wed';
  if (a.k === 'etc') return 'etc';
  return 'bday';
}
const COND = { good: '상쾌함', ok: '보통', tired: '피곤함' };
const JCAT = { goal: '건강 다짐', meal: '식단·운동 메모', praise: '셀프 칭찬' };
const medList = () => (S.profile && Array.isArray(S.profile.meds) && S.profile.meds.length) ? S.profile.meds : ['아침 약', '저녁 약', '영양제'];
const medBtn = (m, hb, dk) => { const on = !!(hb.meds && hb.meds[m]); return `<button type="button" class="medb${on ? ' on' : ''}" data-act="med" data-m="${esc(m)}" data-d="${dk}" aria-pressed="${on}">${ICO.check}<span>${esc(m)}</span></button>`; };
function cupsRow(w, goal, dk) {
  let c = '';
  for (let i = 1; i <= goal; i++) c += `<button type="button" class="cup${i <= w ? ' on' : ''}" data-act="cup" data-n="${i}" data-d="${dk}" aria-label="물 ${i}잔">${ICO.drop}</button>`;
  return `<div class="cups" style="grid-template-columns:repeat(${Math.min(goal, 10)},minmax(0,1fr))">${c}</div>`;
}
function previewText(tier, vars) {
  const tone = S.profile?.tone || 'warm', all = M[tier];
  const m = all.find(([t]) => t === 'all' || (tone === 'plain' ? t === 'plain' : (t === tone))) || all.find(([t]) => t === 'any') || all[0];
  return fill(m[1], vars);
}
function witPreview(w, ts) {
  const prev = latestBefore('w', ts);
  if (!prev || w == null || !(w >= 20 && w <= 250)) return '';
  const d = Math.round((w - prev.w) * 10) / 10, ad = Math.abs(d);
  if (ad < 0.5) return `<div class="wit msg k-care"><div class="msg-s">직전 대비 ${d === 0 ? '변화 없음' : (d > 0 ? '+' : '−') + f1(ad) + 'kg'}</div><p>500g 미만 변화라 메시지 없이 기록합니다. ±0.5 버튼으로 바로 조정할 수 있습니다.</p></div>`;
  if (dayKey(prev.ts) === dayKey(ts) && slotOf(prev.ts) !== slotOf(ts)) return `<div class="wit msg k-info"><div class="msg-s">저장하면 이런 안내가 나옵니다</div><p>${esc(previewText('sameday', { sp: slotOf(prev.ts), sd: (d > 0 ? '+' : '−') + f1(ad) }))}</p></div>`;
  const tier = d > 0 ? (ad >= 2 ? 'inc3' : ad >= 1 ? 'inc2' : 'inc1') : (ad >= 2 ? 'dec3' : ad >= 1 ? 'dec2' : 'dec1');
  const kind = (tier === 'inc3' || tier === 'dec3') ? 'care' : d > 0 ? 'warn' : 'good';
  return `<div class="wit msg k-${kind}"><div class="msg-s">저장하면 이런 메시지가 옵니다 · 직전 대비 <b>${d > 0 ? '+' : '−'}${f1(ad)}kg</b></div><p>${esc(previewText(tier, { d: f1(ad) }))}</p></div>`;
}
function bmiGauge(b) {
  const lo = 15, hi = 40, pct = v => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * 100);
  const cuts = [lo, 18.5, 23, 25, 30, 35, hi];
  const segs = BMI.map((c, i) => `<i class="c-${c.c}" style="width:${(pct(cuts[i + 1]) - pct(cuts[i])).toFixed(2)}%;background:var(--pc)"></i>`).join('');
  const labs = [18.5, 23, 25, 30, 35].map(v => `<span style="left:${pct(v).toFixed(2)}%">${v}</span>`).join('');
  return `<div class="gauge" aria-label="BMI ${b ? f1(b) : ''}"><div class="gbar">${segs}</div>${b ? `<i class="gptr" style="left:${pct(b).toFixed(2)}%"></i>` : ''}<div class="glab">${labs}</div></div>`;
}
const fmtV = (f, v) => f === 'sec' ? fsec(v) : f === 'rep' ? v + '번' : f === 'min' ? v + '분' : f === 'step' ? Number(v).toLocaleString() + '보' : String(v);
const getV = id => { const el = $('#' + id); return el ? (el.dataset.v !== undefined && el.dataset.v !== '' ? +el.dataset.v : num(el.value)) : null; };
const setV = (id, v) => { const el = $('#' + id); if (!el) return; if (el.dataset.fmt) { el.dataset.v = v; el.value = fmtV(el.dataset.fmt, v); } else el.value = v; };
function stp5(id, label, val, o) {
  const b = v => `<button type="button" class="step" data-act="step" data-for="${id}" data-step="${v}" aria-label="${label} ${v > 0 ? '+' : ''}${v}">${v > 0 ? '+' : '−'}${o.lab ? o.lab(Math.abs(v)) : Math.abs(v).toLocaleString() + (o.sfx || '')}</button>`;
  return `<div class="stp5${o.cls ? ' ' + o.cls : ''}"><div class="stp5-h"><span class="stp-l">${label}</span><span class="note">${o.prev != null && o.prev !== '' ? '직전 ' + o.prev + ' ' : ''}${o.unit}</span></div>
    <div class="stp5-c">${o.big ? b(-o.big) : ''}${b(-(o.step || 1))}<input id="${id}" ${o.fmt ? `readonly inputmode="none" data-fmt="${o.fmt}" data-v="${val}" value="${fmtV(o.fmt, val)}"` : `inputmode="${o.dec ? 'decimal' : 'numeric'}" value="${val ?? ''}"`} autocomplete="off" data-prev="${o.prev ?? ''}" data-min="${o.min}" data-max="${o.max}" data-dec="${o.dec || 0}" data-base="${o.base ?? ''}" placeholder="-" aria-label="${label}">${b(o.step || 1)}${o.big ? b(o.big) : ''}</div></div>`;
}
function copyText(text) {
  if (APP && window.Android.copyText) { window.Android.copyText(text); toast('요약을 복사했습니다'); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('요약을 복사했습니다'), () => showCopyBox(text));
  else showCopyBox(text);
}
function showCopyBox(text) { const box = $('#copyBox'); if (box) { box.hidden = false; box.value = text; box.focus(); box.select(); toast('글자를 길게 눌러 복사하세요'); } }

/* ───────── 화면: 홈 ───────── */
function annHome() {
  const up = upcoming(400); if (!up.length) return '';
  let h = up.filter(o => ddayOf(o.ts) === 0).map(o => `<div class="celebrate">${ICO.gift}<div><b>오늘은 ${esc(o.a.n)}입니다</b><span>${esc(annDesc(o))}${o.a.memo ? ' · ' + esc(o.a.memo) : ''} · 축하 연락을 잊지 마세요</span></div></div>`).join('');
  const next = up.filter(o => ddayOf(o.ts) > 0).slice(0, 3);
  if (next.length) h += `<section class="tile t-c">${tileHead('gift', '다가오는 기념일', '<button class="btn sm primary" data-act="tab" data-tab="ann">달력 보기</button>')}<ul class="anns">${next.map(annLi).join('')}</ul></section>`;
  return h;
}
function coachCard() {
  if (S.meta.lastCard && Date.now() - S.meta.lastCard.at < 2 * DAY) return cardBlock(S.meta.lastCard);
  const now = Date.now(), parts = []; let kind = 'info';
  const c = avgBP(now - 7 * DAY, now);
  if (c) { const l = bpLevel(c.s, c.d); parts.push(`최근 7일 평균 혈압 ${r0(c.s)}/${r0(c.d)} (${BP[l].n})`); if (l <= 1) kind = 'good'; if (c.n >= 4 && (c.s >= 135 || c.d >= 85)) kind = 'care'; }
  const wc = avgW(now - 7 * DAY, now), wp = avgW(now - 14 * DAY, now - 7 * DAY);
  if (wc && wp) { const d = Math.round((wc.v - wp.v) * 10) / 10; parts.push(`체중 7일 평균 ${d === 0 ? '지난주와 같음' : '지난주보다 ' + (d < 0 ? '−' : '+') + f1(Math.abs(d)) + 'kg'}`); }
  if (!parts.length) return '';
  parts.push(`이번 주 운동 ${r0(weekMod(now))}/${S.profile.exGoal || 150}분`);
  return `<div class="msg k-${kind}"><div class="msg-t">${esc(nickT('오늘의 건강 요약'))}</div><p>${esc(parts.join(' · '))}</p></div>`;
}
function kpiGrid() {
  const p = S.profile, ws = list('w'), vs = list('v');
  const lw = last(ws), pw = ws[ws.length - 2], lv = last(vs), pv = vs[vs.length - 2];
  const ps = vs.filter(x => x.p), os = vs.filter(x => x.o), lp = last(ps), lo = last(os);
  const b = lw ? bmiOf(lw.w, p.height) : null;
  const ws0 = weekStart(Date.now()), kcal = list('e').filter(e => e.ts >= ws0).reduce((t, x) => t + x.met * (lw ? lw.w : 65) * x.min / 60, 0);
  const wm = weekMod(Date.now()), goal = p.exGoal || 150;
  const k = (cls, metric, label, badge, val, unit, sub) => `<button type="button" class="kpi ${cls}" data-act="kpi" data-v="${metric}"><span class="kpi-l">${label}</span><span class="kpi-v">${val}<small>${unit}</small></span>${badge ? `<span class="kpi-b">${badge}</span>` : ''}<span class="kpi-s">${sub}</span></button>`;
  return `<section class="kpis">
    ${k('t-w', 'w', '체중 · BMI', b ? pill(BMI[bmiIdx(b)]) : '', lw ? f1(lw.w) : '–', 'kg', lw ? `${pw ? deltaChip(lw.w - pw.w, 'kg') : ''}<span>BMI ${b ? f1(b) : '-'}</span>` : '기록 없음')}
    ${k('t-v', 'v', '혈압', lv ? pill(bpInfo(lv.s, lv.d)) : '', lv ? `${lv.s}/${lv.d}` : '–', '', lv ? (pv ? `직전 ${pv.s}/${pv.d}` : fmtDT(lv.ts)) : '기록 없음')}
    ${k('t-e', 'p', '맥박 · SpO2', lo ? pill(spo2Info(lo.o)) : '', lp ? lp.p : '–', 'bpm', `SpO2 ${lo ? lo.o + '%' : '–'}${ps.length > 1 ? ' · 직전 ' + ps[ps.length - 2].p : ''}`)}
    ${k('t-h', 'e', '이번 주 운동', wm >= goal ? '<span class="pill c-green">목표 달성</span>' : '', r0(wm), `/${goal}분`, `소모 약 ${r0(kcal).toLocaleString()}kcal`)}
  </section>`;
}
function quickEntry() {
  const q = ui.quick || 'w';
  return `<section class="tile ${q === 'w' ? 't-w' : 't-v'}">    <div class="segb"><button type="button" data-act="quick" data-v="w" aria-pressed="${q === 'w'}">체중 · BMI</button><button type="button" data-act="quick" data-v="v" aria-pressed="${q === 'v'}">혈압 · 맥박 · SpO2</button></div>
    ${q === 'w' ? weightForm() : vitalsForm()}</section>`;
}
function exTileHome() {
  const goal = S.profile.exGoal || 150, wm = weekMod(Date.now()), ws0 = weekStart(Date.now());
  const byK = {}; list('e').filter(e => e.ts >= ws0).forEach(e => { byK[e.k] = (byK[e.k] || 0) + e.min; });
  return `<section class="tile t-e">${tileHead('bike', '이번 주 운동', '<span class="src">WHO 권장 주 150분</span>')}
    <div class="readout"><span class="num mid">${r0(wm)}</span><span class="unit">/ ${goal}분 (중강도 환산)</span></div>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${r0(Math.min(wm, goal))}"><i style="width:${Math.min(100, wm / goal * 100).toFixed(1)}%"></i></div>
    <div class="meta-row">${Object.keys(byK).length ? Object.entries(byK).map(([k, m]) => `<span class="x-${EXC[k] || 'r'} exchip">${exIco(k)}${esc(exOf(k).n)} <b>${m}분</b></span>`).join('') : '<span>이번 주 운동 기록이 없습니다</span>'}</div>
    <button class="btn primary" data-act="go-log" data-sub="e">운동 기록</button></section>`;
}
function careMini() {
  const dk = dayKey(Date.now()), hb = S.entries['h-' + dk] || {}, meds = medList(), goal = S.profile.waterGoal || 8, w = hb.water || 0;
  const done = meds.filter(m => hb.meds && hb.meds[m]).length;
  return `<section class="tile t-h">${tileHead('cup', '오늘 생활', `<span class="when">복약 ${done}/${meds.length} · 물 ${w}/${goal}잔</span>`)}
    <div class="medgrid">${meds.map(m => medBtn(m, hb, dk)).join('')}</div>
    ${cupsRow(w, goal, dk)}
    <div class="meta-row">${hb.sleep != null ? `<span>수면 <b>${hb.sleep}시간</b></span>` : ''}${hb.cond ? `<span>컨디션 <b>${COND[hb.cond]}</b></span>` : ''}${hb.steps != null ? `<span>걸음 <b>${Number(hb.steps).toLocaleString()}</b></span>` : ''}<button class="btn sm ghost" data-act="go-log" data-sub="h">수면·컨디션·걸음</button></div></section>`;
}
function recentTable() {
  const items = Object.values(S.entries).filter(e => e.t === 'w' || e.t === 'v').sort((a, b) => b.ts - a.ts).slice(0, 8);
  if (!items.length) return '';
  const row = e => {
    if (ui.confirmDel === e.id) return `<tr><td colspan="2">이 기록을 삭제할까요?</td><td colspan="2"><div class="row"><button class="btn sm" data-act="del-no">취소</button><button class="btn sm primary" data-act="del-yes" data-id="${esc(e.id)}">삭제</button></div></td></tr>`;
    const val = e.t === 'w' ? `<b>${f1(e.w)}kg</b>` : `<b>${e.s}/${e.d}</b>${e.p || e.o ? `<br><span class="note">${e.p ? e.p + 'bpm' : ''}${e.p && e.o ? ' · ' : ''}${e.o ? e.o + '%' : ''}</span>` : ''}`;
    const b = e.t === 'w' ? bmiOf(e.w, S.profile.height) : null;
    const st = e.t === 'w' ? (b ? pill(BMI[bmiIdx(b)]) : '') : pill(bpInfo(e.s, e.d));
    return `<tr><td>${fmtDT(e.ts)}<br><span class="note">${e.t === 'w' ? '체중' : '혈압'} · ${slotOf(e)}</span></td><td>${val}</td><td>${st}</td><td><button class="x" data-act="del" data-id="${esc(e.id)}" aria-label="삭제">×</button></td></tr>`;
  };
  return `<section class="tile t-i">${tileHead('doc', '최근 체중 · 혈압 기록', '<button class="btn sm" data-act="kpi" data-v="all">추이 보기</button>')}
    <div class="tbl-wrap"><table class="t rec"><thead><tr><th>일시</th><th>측정값</th><th>판정</th><th><span class="vis-hidden">삭제</span></th></tr></thead><tbody>${items.map(row).join('')}</tbody></table></div></section>`;
}
function homeView() {
  let h = banners();
  const near = upcoming(400).filter(o => ddayOf(o.ts) <= 7);
  if (near.length) h += annHome();
  h += coachCard() + kpiGrid() + quickEntry() + exTileHome() + careMini() + recentTable();
  if (!near.length) h += annHome();
  return h;
}

/* ───────── 화면: 기록 ───────── */
function logView() {
  const t = ui.logTab;
  const tabs = [['w', '체중'], ['v', '혈압·맥박'], ['e', '운동'], ['h', '생활']];
  const tc = { w: 't-w', v: 't-v', e: 't-e', h: 't-h' }[t];
  const ti = { w: ['scale', '체중 기록'], v: ['heart', '혈압 · 맥박 기록'], e: ['bike', '운동 기록'], h: ['cup', '복약 · 수분 · 수면'] }[t];
  let h = `<div class="segb ${tc}" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-act="logtab" data-v="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div>`;
  h += `<section class="tile ${tc}">${t === 'e' ? '' : tileHead(ti[0], ti[1])}${t === 'w' ? weightForm() : t === 'v' ? vitalsForm() : t === 'e' ? exForm() : habitForm()}</section>`;
  if (t === 'e') h += exStats() + exTimeline();
  return h;
}
function weightForm() {
  const lw = list('w').slice(-1)[0];
  return `<form class="entry" data-form="w" novalidate>
    <div class="dial">
      <label class="dial-val" for="wIn"><input id="wIn" inputmode="decimal" autocomplete="off" value="${lw ? f1(lw.w) : ''}" data-prev="${lw ? f1(lw.w) : ''}" placeholder="00.0" data-min="20" data-max="250" data-dec="1" aria-label="체중"><span>kg</span></label>
      <button type="button" class="step" data-act="step" data-for="wIn" data-step="-0.5">−0.5</button>
      <button type="button" class="step" data-act="step" data-for="wIn" data-step="-0.1">−0.1</button>
      <button type="button" class="step" data-act="step" data-for="wIn" data-step="0.1">+0.1</button>
      <button type="button" class="step" data-act="step" data-for="wIn" data-step="0.5">+0.5</button>
    </div>
    <div class="preview" id="wPrev"></div>
    <div id="wGauge"></div>
    <label class="field"><span>메모 (선택)</span><input id="wMemo" maxlength="80" autocomplete="off" placeholder="예: 회식 다음 날"></label>
    <div class="warnline" id="wWarn" hidden></div>
    <button class="btn primary big" type="submit">새 체중 저장</button>
  </form>`;
}
function vitalsForm() {
  const vs = list('v'), lv = last(vs), lp = last(vs.filter(x => x.p)), lo = last(vs.filter(x => x.o));
  return `<form class="entry" data-form="v" novalidate>
    <div class="prevbox"><div><span class="pl">바로 직전 혈압 · 맥박 · 산소포화도</span><b>${lv ? `${lv.s}/${lv.d}` : '첫 기록'}</b><span class="ps">${lv ? `${lp ? '맥박 ' + lp.p + ' · ' : ''}${lo ? 'SpO2 ' + lo.o + '% · ' : ''}${fmtDT(lv.ts)} ${slotOf(lv)}` : ''}</span></div>${lv ? '<button type="button" class="btn sm" data-act="restore" data-f="v">직전값 복원</button>' : ''}</div>
    <div class="stps">
      ${stp5('vS', '수축기 (최고)', lv ? lv.s : 120, { prev: lv ? lv.s : '', min: 60, max: 260, step: 1, big: 5, unit: 'mmHg', base: 120 })}
      ${stp5('vD', '이완기 (최저)', lv ? lv.d : 80, { prev: lv ? lv.d : '', min: 30, max: 160, step: 1, big: 5, unit: 'mmHg', base: 80 })}
      ${stp5('vP', '맥박', lp ? lp.p : '', { prev: lp ? lp.p : '', min: 30, max: 220, step: 1, big: 5, unit: '회/분', base: 70 })}
      ${stp5('vO', '산소포화도', lo ? lo.o : '', { prev: lo ? lo.o : '', min: 70, max: 100, step: 1, unit: '%', base: 97 })}
    </div>
    <div class="preview" id="vPrev"></div>
    <div class="field"><span>측정 시간대 <b id="vSlot"></b></span>${radios('vSlot', [{ v: '', l: '자동' }, { v: '아침', l: '아침 기상' }, { v: '기타', l: '낮·일과' }, { v: '저녁', l: '저녁 취침 전' }], '')}</div>
    <div class="field"><span>측정한 팔</span>${radios('vArm', [{ v: 'L', l: '왼팔' }, { v: 'R', l: '오른팔' }], lv ? lv.arm : 'L')}</div>
    <div class="field"><span>혈압약</span>${radios('vMed', [{ v: 'before', l: '복용 전' }, { v: 'after', l: '복용 후' }, { v: 'none', l: '해당 없음' }], lv ? lv.med : 'none')}</div>
    <label class="field"><span>메모 (선택)</span><input id="vMemo" maxlength="80" autocomplete="off"></label>
    <details class="guide"><summary>정확하게 재는 법</summary><ul>
      <li>아침: 일어나서 1시간 안, 소변을 본 뒤, 식사와 혈압약 복용 전</li><li>저녁: 잠자리에 들기 전</li>
      <li>등을 기대고 앉아 5분 쉰 뒤, 팔을 심장 높이에 두고 측정</li><li>산소포화도는 손가락이 차거나 매니큐어가 있으면 낮게 나올 수 있습니다</li></ul></details>
    <div class="warnline" id="vWarn" hidden></div>
    <button class="btn primary big" type="submit">새 혈압 · 맥박 저장</button>
  </form>`;
}
function exForm() {
  const le = list('e').filter(e => EX_ON.some(x => x.k === e.k)).slice(-1)[0];
  const k = le ? le.k : EX_ON[0].k, x0 = exOf(k);
  const lastOf = list('e').filter(e => e.k === k).slice(-1)[0];
  return `<form class="entry" data-form="e" novalidate>
    <div class="field"><div class="exgrid" role="radiogroup" aria-label="종목">${EX_ON.map(x => `<label class="excard x-${EXC[x.k]}"><input type="radio" id="exK-${x.k}" name="exK" value="${x.k}"${x.k === k ? ' checked' : ''}><span>${EXIMG[x.k]}<b>${x.n}</b></span></label>`).join('')}</div></div>
    <div class="stps">
      <div id="eMinRow"${x0.hang || x0.steps || x0.reps ? ' hidden' : ''}>
      ${stp5('eMin', '운동 시간', lastVal(k), { min: 5, max: 600, step: 5, big: 10, unit: '분', base: defMin(k), fmt: 'min', sfx: '분' })}
      </div>
      <div id="eStepRow"${x0.steps ? '' : ' hidden'}>
        ${stp5('eSteps', '걸음 수', lastVal('walk'), { min: STEP_MIN, max: STEP_MAX, step: 500, big: 1000, unit: '3천~25천 보', base: 8000, fmt: 'step', cls: 'stp-w', lab: n => n >= 1000 && n % 1000 === 0 ? n / 1000 + '천보' : n + '보' })}
      </div>
      <div id="eRepRow"${x0.reps ? '' : ' hidden'}>
        ${stp5('eReps', '스트레칭 횟수', lastVal('stretch'), { min: REP_MIN, max: REP_MAX, step: 1, big: 5, unit: '5~100번', base: 30, fmt: 'rep', sfx: '번' })}
      </div>
      <div id="eHangRow"${x0.hang ? '' : ' hidden'}>
        ${stp5('eSec', '매달린 시간', lastVal('bar'), { min: HANG_MIN, max: HANG_MAX, step: 5, big: 10, unit: '30초~3분', base: HANG_BASE, fmt: 'sec', sfx: '초' })}
      </div>
      <div id="eDistRow"${exOf(k).dist ? '' : ' hidden'}>${stp5('eKm', '거리', lastOf && lastOf.km ? lastOf.km : '', { min: 0, max: 300, step: 0.5, big: 1, dec: 1, unit: 'km', base: 3 })}</div>
    </div>
    <div class="preview" id="ePrev"></div>
    <label class="field"><span>운동 일시</span><input type="datetime-local" id="eTs" value="${toInput(Date.now())}"></label>
    <label class="field" id="eMemoRow"${k === 'bike' ? '' : ' hidden'}><span>메모 (선택)</span><input id="eMemo" maxlength="80" autocomplete="off" placeholder="예: 한강 자전거길"></label>
    <div class="warnline" id="eWarn" hidden></div>
    <button class="btn primary big" type="submit">운동 저장</button>
  </form>`;
}
function exStats() {
  const now = new Date(), s = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const items = exList().filter(e => e.ts >= s);
  const groups = [['걷기', ['walk'], 'r', 'walk'], ['철봉 매달리기', ['bar'], 'i', 'bar'], ['스트레칭', ['stretch'], 'c', 'stretch'], ['실외자전거', ['bike', 'ibike'], 'e', 'bike'], ['골프연습', ['golfp', 'golfr'], 'h', 'golfp'], ['슬로우조깅', ['sjog', 'jog'], 'w', 'sjog'], ['탁구', ['tt'], 'v', 'tt'], ['실내요가', ['yoga'], 'c', 'yoga']].filter(g => g[3] !== 'yoga' || items.some(e => e.k === 'yoga'));
  return `<section class="tile t-e">${tileHead('chart', `${now.getMonth() + 1}월 종목별 합계`)}<div class="exstats">${groups.map(([n, ks, x, ik]) => {
    const a = items.filter(e => ks.includes(e.k)), min = m1(a.reduce((t, e) => t + e.min, 0)), km = a.reduce((t, e) => t + (e.km || 0), 0);
    return `<div class="exstat x-${x}"><span class="exstat-h">${exIco(ik)}${n}</span><b>${min}분</b><small>${a.length}${ik === 'tt' ? '일 × 80분' : '회'}${ik === 'bar' && a.some(e => e.sets > 1) ? ` · ${a.reduce((t, e) => t + (e.sets || 1), 0)}세트` : ''}${ik === 'stretch' && a.some(e => e.reps) ? ` · ${a.reduce((t, e) => t + (e.reps || 0), 0)}번` : ''}${ik === 'walk' && a.some(e => e.steps) ? ` · ${a.reduce((t, e) => t + (e.steps || 0), 0).toLocaleString()}보` : ''}${km ? ` · ${f1(km)}km` : ''}</small></div>`;
  }).join('')}</div></section>`;
}
function exTimeline() {
  const f = ui.exF || 'all';
  const groups = { all: null, tt: ['tt'], bike: ['bike', 'ibike'], golf: ['golfp', 'golfr'], sjog: ['sjog', 'jog'], yoga: ['yoga'], bar: ['bar'], walk: ['walk'], stretch: ['stretch'] };
  const items = exList().filter(e => !groups[f] || groups[f].includes(e.k)).sort((a, b) => b.ts - a.ts).slice(0, 40);
  const wt = (last(list('w')) || {}).w || 65;
  return `<section class="tile t-e">${tileHead('doc', '운동 타임라인')}
    <div class="segb">${[['all', '전체'], ['walk', '걷기'], ['bar', '철봉'], ['stretch', '스트레칭'], ['bike', '자전거'], ['golf', '골프'], ['sjog', '조깅'], ['tt', '탁구']].concat(exList().some(e => e.k === 'yoga') ? [['yoga', '요가']] : []).map(([k, l]) => `<button type="button" data-act="exf" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
    ${items.length ? `<ul class="hist">${items.map(e => ui.confirmDel === e.id
      ? `<li><div class="h-main"><span class="h-v">${esc(entryLine(e)[0])}</span><span class="h-s">이 기록을 삭제할까요?</span></div><div class="row"><button class="btn sm" data-act="del-no">취소</button><button class="btn sm primary" data-act="del-yes" data-id="${esc(e.id)}">삭제</button></div></li>`
      : `<li class="x-${EXC[e.k] || 'r'}"><div class="h-main"><span class="h-v">${exIco(e.k)}${esc(entryLine(e)[0])}</span><span class="h-s">${esc(entryLine(e)[1])} · 약 ${r0(e.met * wt * e.min / 60)}kcal</span></div>${e.pp ? '' : `<button class="x" data-act="del" data-id="${esc(e.id)}" aria-label="삭제">×</button>`}</li>`).join('')}</ul>` : '<p class="empty">기록이 없습니다.</p>'}</section>`;
}
function habitForm() {
  const date = ui.habDate || dayKey(Date.now()), hb = S.entries['h-' + date] || {}, goal = S.profile.waterGoal || 8, meds = medList();
  const done = meds.filter(m => hb.meds && hb.meds[m]).length;
  const rows = [];
  for (let i = 6; i >= 0; i--) {
    const dk = dayKey(addDays(Date.now(), -i)), x = S.entries['h-' + dk] || {};
    const md = x.meds ? meds.filter(m => x.meds[m]).length : (x.med ? meds.length : 0);
    rows.push(`<tr><td>${fmtD(addDays(Date.now(), -i))}</td><td>${x.meds || x.med != null ? md + '/' + meds.length : ''}</td><td>${x.water ? x.water + '잔' : ''}</td><td>${x.sleep != null ? x.sleep + 'h' : ''}</td><td>${x.cond ? COND[x.cond] : ''}</td><td>${x.steps != null ? Number(x.steps).toLocaleString() : ''}</td></tr>`);
  }
  return `<div class="entry">
    <label class="field"><span>날짜</span><input type="date" id="hDate" value="${date}" max="${dayKey(Date.now())}"></label>
    <div class="tile-h"><h3>복약 · 영양제 체크</h3><span class="pill ${done === meds.length ? 'c-green' : 'c-orange'}">${done}/${meds.length} 완료</span></div>
    <div class="medgrid">${meds.map(m => medBtn(m, hb, date)).join('')}</div>
    <div class="row"><input id="newMed" class="inl" maxlength="12" autocomplete="off" placeholder="추가할 약·영양제 (예: 유산균)" aria-label="추가할 약 이름"><button type="button" class="btn sm primary" data-act="med-add">추가</button><button type="button" class="btn sm" data-act="med-edit">${ui.medEdit ? '편집 끝' : '목록 편집'}</button></div>
    ${ui.medEdit ? `<ul class="hist">${meds.map(m => `<li><span class="h-v">${esc(m)}</span><button class="x" data-act="med-del" data-m="${esc(m)}" aria-label="${esc(m)} 삭제">×</button></li>`).join('')}</ul>` : ''}
    <div class="tile-h"><h3>수분 섭취</h3><span class="note">${hb.water || 0}/${goal}잔 · 1잔 250ml</span></div>
    ${cupsRow(hb.water || 0, goal, date)}
    <div class="row"><button type="button" class="btn sm" data-act="water" data-v="-1" data-d="${date}">− 1잔</button><button type="button" class="btn sm primary" data-act="water" data-v="1" data-d="${date}">+ 1잔 마심</button></div>
    <h3>수면 · 아침 컨디션</h3>
    <div class="rangebox"><input type="range" id="hSleep" min="3" max="11" step="0.5" value="${hb.sleep ?? 7}" aria-label="수면 시간"><b id="hSleepV">${hb.sleep ?? 7}시간</b></div>
    <div class="ticks"><span>3시간</span><span>7시간 이상 권장</span><span>11시간</span></div>
    ${radios('hCond', [{ v: 'good', l: '상쾌함' }, { v: 'ok', l: '보통' }, { v: 'tired', l: '피곤함' }], hb.cond || '')}
    <h3>걸음 수</h3>
    ${stp5('hSteps', '걸음 수', hb.steps ?? '', { min: 0, max: 100000, step: 500, big: 1000, unit: '걸음', base: 5000 })}
    <button type="button" class="btn primary" data-act="hab-save" data-d="${date}">수면 · 컨디션 · 걸음 저장</button>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>최근 7일</th><th>복약</th><th>물</th><th>수면</th><th>컨디션</th><th>걸음</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
  </div>`;
}
function saveHabit(dk) {
  const steps = num($('#hSteps').value);
  upsertHabit(dk, { sleep: num($('#hSleep').value), cond: ($('input[name="hCond"]:checked') || {}).value || null, steps: steps == null ? null : r0(steps) });
  render(); toast('수면 · 컨디션 · 걸음을 저장했습니다');
}
function toggleMed(dk, m) {
  const hb = S.entries['h-' + dk] || {}, meds = { ...(hb.meds || {}) };
  meds[m] = !meds[m]; if (!meds[m]) delete meds[m];
  const all = medList().every(x => meds[x]);
  upsertHabit(dk, { meds, med: all });
  render();
}
function setWater(dk, n) { const goal = S.profile.waterGoal || 8; upsertHabit(dk, { water: Math.max(0, Math.min(30, n)) }); render(); if (n === goal) toast(`오늘 물 ${goal}잔 목표를 채웠습니다`); }
function updatePreviews() {
  const wIn = $('#wIn');
  if (wIn) {
    const w = num(wIn.value), ts = $('#wTs') ? fromInput($('#wTs').value) : Date.now();
    let h = '';
    const ok = w != null && w >= 20 && w <= 250, b = ok ? bmiOf(w, S.profile.height) : null;
    if (ok && b) h += `<span>BMI <b>${f1(b)}</b></span>${pill(BMI[bmiIdx(b)])}`;
    $('#wPrev').innerHTML = h;
    $('#wGauge').innerHTML = S.profile.height ? bmiGauge(b) : '';
  }
  const vS = $('#vS');
  if (vS) {
    const s = num(vS.value), d = num($('#vD').value), p = num($('#vP').value), o = num($('#vO').value); const ps = num(vS.dataset.prev), pd = num(($('#vD') || {}).dataset ? $('#vD').dataset.prev : null);
    let h = '';
    if (s && d && s > d) h += pill(bpInfo(s, d));
    if (p) h += pill(pulseInfo(p));
    if (o) h += `<span>SpO2</span>` + pill(spo2Info(o));
    if (ps != null && s != null && pd != null && d != null) { const ds = s - ps, dd = d - pd; h += `<span>직전 대비 <b>${ds === 0 && dd === 0 ? '변화 없음' : `${ds > 0 ? '+' : ds < 0 ? '−' : '±'}${Math.abs(ds)} / ${dd > 0 ? '+' : dd < 0 ? '−' : '±'}${Math.abs(dd)}`}</b></span>`; }
    $('#vPrev').innerHTML = h;
    const sl = ($('input[name="vSlot"]:checked') || {}).value;
    $('#vSlot').textContent = '· ' + (sl || slotOf($('#vTs') ? fromInput($('#vTs').value) : Date.now()) + ' (자동)');
  }
  const eMin = $('#eMin');
  if (eMin) {
    const k = ($('input[name="exK"]:checked') || {}).value || 'bike', int = intOf(k);
    let m = getV('eMin') || 0;
    if (k === 'walk') { const st = getV('eSteps') || 0, met = metOf(k, int), wt = (list('w').slice(-1)[0] || {}).w || 65; m = r0(st / STEPS_PER_MIN); eMin.value = m; $('#ePrev').innerHTML = `<span>${st.toLocaleString()}보 ≈ <b>${m}분</b> (분당 ${STEPS_PER_MIN}보 환산)</span><span>소모 약 <b>${r0(met * wt * m / 60)}kcal</b></span>`; }
    else if (k === 'stretch') { const rp = getV('eReps') || 0, met = metOf(k, int), wt = (list('w').slice(-1)[0] || {}).w || 65; m = Math.max(1, r0(rp * REP_SEC / 60)); eMin.value = m; $('#ePrev').innerHTML = `<span>${rp}번 ≈ <b>${m}분</b> (1번 ${REP_SEC}초 환산)</span><span>소모 약 <b>${r0(met * wt * m / 60)}kcal</b></span>`; }
    else if (k === 'bar') { const sc = getV('eSec') || HANG_BASE; m = Math.round(sc / 60 * 10) / 10; eMin.value = m; const met = metOf(k, int), wt = (list('w').slice(-1)[0] || {}).w || 65; $('#ePrev').innerHTML = `<span>매달린 시간 <b>${fsec(sc)}</b></span><span>소모 약 <b>${r0(met * wt * sc / 3600)}kcal</b></span>`; }
    else {
    const met = metOf(k, int), wt = (list('w').slice(-1)[0] || {}).w || 65;
    $('#ePrev').innerHTML = `<span>소모 약 <b>${r0(met * wt * m / 60)}kcal</b></span><span>중강도 환산 <b>${r0(modEq({ met, min: m }))}분</b></span>`; }
  }
  const hs = $('#hSleep'); if (hs) $('#hSleepV').textContent = hs.value + '시간';
}

/* ───────── 화면: 추이 · 한눈에 ───────── */
function chartView() { return ui.metric === 'all' ? overviewView() : chartDetail(); }
function chartHeader(tc, label) {
  const metrics = [['all', '한눈에'], ['w', '체중'], ['v', '혈압'], ['p', '맥박'], ['o', 'SpO2'], ['e', '운동']];
  return `<div class="segb ${tc}">${metrics.map(([k, l]) => `<button type="button" data-act="metric" data-v="${k}" aria-pressed="${ui.metric === k}">${l}</button>`).join('')}</div>
    <div class="segb ${tc}">${[['week', '주'], ['month', '월'], ['year', '년']].map(([k, l]) => `<button type="button" data-act="period" data-v="${k}" aria-pressed="${ui.period === k}">${l}</button>`).join('')}</div>
    <div class="navrow ${tc}"><button type="button" class="navbtn" data-act="prev" aria-label="이전 기간">‹</button><b>${label}</b><button type="button" class="navbtn" data-act="next" aria-label="다음 기간"${ui.offset >= 0 ? ' disabled' : ''}>›</button></div>`;
}
function exBars(items, s, e) {
  const bars = [], seg = (a, b) => { const parts = []; ['v', 'e', 'h', 'w', 'c', 'i', 'r'].forEach(x => { const y = items.filter(it => it.ts >= a && it.ts < b && (EXC[it.k] || 'r') === x).reduce((t, it) => t + it.min, 0); if (y) parts.push({ y, x }); }); return { x0: a, x1: b, y: parts.reduce((t, p) => t + p.y, 0), parts }; };
  if (ui.period === 'year') { const y = new Date(s).getFullYear(); for (let mo = 0; mo < 12; mo++) bars.push(seg(new Date(y, mo, 1).getTime(), new Date(y, mo + 1, 1).getTime())); }
  else for (let d = s; d < e; d = addDays(d, 1)) bars.push(seg(d, addDays(d, 1)));
  return bars;
}
const exLegend = `<div class="legend"><span class="x-v"><i style="background:var(--xc);height:8px"></i>탁구</span><span class="x-e"><i style="background:var(--xc);height:8px"></i>실외자전거</span><span class="x-h"><i style="background:var(--xc);height:8px"></i>골프연습</span><span class="x-w"><i style="background:var(--xc);height:8px"></i>슬로우조깅</span><span class="x-c"><i style="background:var(--xc);height:8px"></i>요가·스트레칭</span><span class="x-i"><i style="background:var(--xc);height:8px"></i>철봉</span><span class="x-r"><i style="background:var(--xc);height:8px"></i>걷기·기타</span></div>`;
function overviewView() {
  const { s, e, label } = periodRange(), ticks = ticksFor(s, e), inR = x => x.ts >= s && x.ts < e;
  const ws = list('w').filter(inR), vs = list('v').filter(inR), es = list('e').filter(inR);
  const ps = vs.filter(x => x.p), os = vs.filter(x => x.o), wt = (last(list('w')) || {}).w || 65;
  const aw = ws.length ? avg(ws.map(x => x.w)) : null, ab = aw ? bmiOf(aw, S.profile.height) : null;
  const stat = (cls, k, v, sub) => `<div class="stat ${cls}"><span>${k}</span><b>${v}</b>${sub ? `<small class="note">${sub}</small>` : ''}</div>`;
  let h = chartHeader('t-i', label);
  h += `<section class="stats">${stat('t-w', '평균 체중', aw ? f1(aw) + 'kg' : '–', ab ? 'BMI ' + f1(ab) : '')}${stat('t-v', '평균 혈압', vs.length ? r0(avg(vs.map(x => x.s))) + '/' + r0(avg(vs.map(x => x.d))) : '–', vs.length ? vs.length + '회 측정' : '')}${stat('t-e', '평균 맥박 · SpO2', ps.length ? r0(avg(ps.map(x => x.p))) + 'bpm' : '–', os.length ? 'SpO2 ' + f1(avg(os.map(x => x.o))) + '%' : '')}${stat('t-h', '총 운동', es.reduce((t, x) => t + x.min, 0) + '분', es.length ? '약 ' + r0(es.reduce((t, x) => t + x.met * wt * x.min / 60, 0)).toLocaleString() + 'kcal' : '')}</section>`;
  const tile = (cls, icon, title, body, foot) => `<section class="tile ${cls}">${tileHead(icon, title)}<div class="chart-wrap">${body}</div>${foot || ''}</section>`;
  const tgt = S.profile.targetWeight ? [{ y: S.profile.targetWeight, l: '목표 ' + f1(S.profile.targetWeight), cls: 'goal' }] : [];
  h += tile('t-w', 'scale', '체중 추이', lineChart({ s, e, ticks, series: [{ c: 'a', points: seriesFor(ws, 'w') }], refs: tgt, aria: '체중 추이' }));
  h += tile('t-v', 'heart', '혈압 추이', lineChart({ s, e, ticks, series: [{ c: 'a', points: seriesFor(vs, 's') }, { c: 'b', points: seriesFor(vs, 'd') }], refs: [{ y: 135, l: '가정혈압 기준 135' }, { y: 85, l: '85' }], aria: '혈압 추이' }), `<div class="legend"><span><i style="background:var(--c-v)"></i>수축기</span><span><i style="background:var(--s2)"></i>이완기</span></div>`);
  h += tile('t-e', 'heart', '맥박 추이', lineChart({ s, e, ticks, series: [{ c: 'a', points: seriesFor(ps, 'p') }], band: [60, 100], aria: '맥박 추이' }), '<p class="note">초록 띠: 정상 범위 60~100회/분</p>');
  h += tile('t-h', 'heart', '산소포화도 추이', lineChart({ s, e, ticks, series: [{ c: 'a', points: seriesFor(os, 'o') }], band: [95, 100], aria: '산소포화도 추이' }), '<p class="note">초록 띠: 정상 범위 95~100%</p>');
  h += tile('t-e', 'bike', '종목별 운동 시간', barChart({ s, e, ticks, bars: exBars(es, s, e), aria: '종목별 운동 시간' }), exLegend);
  return h;
}

/* ───────── 일지 ───────── */
function journalTile() {
  const f = ui.jf || 'all';
  const mine = list('j').map(j => ({ at: j.ts, mine: true, id: j.id, title: JCAT[j.cat] || '메모', text: j.text, cat: j.cat }));
  const msgs = (S.meta.cards || []).map(c => ({ ...c, mine: false }));
  const items = [...(f === 'msg' ? [] : mine), ...(f === 'mine' ? [] : msgs)].sort((a, b) => b.at - a.at).slice(0, 60);
  const one = it => {
    if (it.mine && ui.confirmDel === it.id) return `<li class="jitem"><div class="msg k-care"><p>${esc(it.text)}</p><div class="row"><button class="btn sm" data-act="del-no">취소</button><button class="btn sm primary" data-act="del-yes" data-id="${esc(it.id)}">삭제</button></div></div></li>`;
    return `<li class="jitem"><div class="msg ${it.mine ? 'k-info mine' : 'k-' + it.kind}"><div class="jhead"><span class="msg-t">${esc(it.title)}</span>${it.mine ? `<button class="x" data-act="del" data-id="${esc(it.id)}" aria-label="삭제">×</button>` : ''}</div><p>${esc(it.text)}</p><div class="msg-s">${fmtDT(it.at)}${it.mine ? ' · 내 일지' : ' · 건강지키미 메시지'}</div></div></li>`;
  };
  return `<section class="tile t-c">${tileHead('book', '건강일지 · 메시지함')}
    <form class="entry" data-form="journal" novalidate>
      ${radios('jCat', [{ v: 'goal', l: '건강 다짐' }, { v: 'meal', l: '식단·운동' }, { v: 'praise', l: '셀프 칭찬' }], 'goal')}
      <div class="row"><input id="jText" class="inl" maxlength="120" autocomplete="off" placeholder="예: 이번 주는 야식 없이 목표 체중까지!" aria-label="일지 내용"><button class="btn sm primary" type="submit">등록</button></div>
    </form>
    <div class="segb">${[['all', '전체'], ['msg', '받은 메시지'], ['mine', '내 일지']].map(([k, l]) => `<button type="button" data-act="jf" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
    ${items.length ? `<ul class="jlist">${items.map(one).join('')}</ul>` : '<p class="empty">체중 500g 이상 변화나 목표 달성 때 받은 메시지가 이곳에 쌓입니다.</p>'}
  </section>`;
}
function saveJournal() {
  const t = $('#jText').value.trim(); if (!t) { toast('내용을 입력해 주세요'); return; }
  const e = { id: newId('j'), t: 'j', ts: Date.now(), u: Date.now(), cat: ($('input[name="jCat"]:checked') || {}).value || 'goal', text: t };
  S.entries[e.id] = e; persist(e.ts); render(); toast('일지를 등록했습니다');
}

/* ───────── v4: 탭 재구성 (기록 · 탁구 · 운동 · 기념일 · 설정) ───────── */
const PP_KEY = 'pp.records.v1', PP_SAMPLE = 'pp.sample.v1', PP_LINK = 'krhealth.ppLink';
const PP_URL = 'https://krwonhochoi-spec.github.io/pingpong/';
const PP_MIN = 80;   // 탁구 친 날 운동시간 (1시간 20분)
const PRE_OPTS = [0, 1, 2, 3, 5, 7, 10, 14, 30];
const preTxt = d => d ? d + '일 전' : '당일만';
function ppReadRaw() {
  const read = st => {
    try {
      if (!st) return null;
      if (JSON.parse(st.getItem(PP_SAMPLE) || 'false') === true) return [];
      const v = st.getItem(PP_KEY); return v ? JSON.parse(v) : null;
    } catch (e) { return null; }
  };
  if (Array.isArray(window.__ppRaw)) return window.__ppRaw;
  let r = null;
  try { r = read(window.localStorage); } catch (e) { r = null; }
  return r;
}
/** 탁구사랑클럽 기록 → 탁구 친 날짜·경기 수 캐시(S.meta.ppDays) */
function ppSyncCache() {
  const r = ppReadRaw(); if (!Array.isArray(r)) return false;
  const days = {};
  r.forEach(x => {
    if (!x || !x.date || String(x.id || '').startsWith('sample-') || (x.type && x.type !== 'pingpong')) return;
    const d = String(x.date).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    days[d] = (days[d] || 0) + 1;
  });
  if (JSON.stringify(days) === JSON.stringify(S.meta.ppDays || {})) return false;
  S.meta.ppDays = days; S.meta.ppAt = Date.now(); persist(null);
  return true;
}
function ppEntries() {
  const d = S.meta.ppDays || {};
  return Object.keys(d).map(k => ({ id: 'pp-' + k, t: 'e', k: 'tt', ts: new Date(k + 'T12:00').getTime(), min: PP_MIN, met: 4.0, int: 2, pp: 1, games: d[k] }));
}
const exList = () => [...list('e'), ...ppEntries()].sort((a, b) => a.ts - b.ts);

/* 탁구 탭: 갤럭시 앱에서는 탁구사랑클럽을 별도 화면(WebView)으로 미리 띄워 두고, 탭을 누르면 바로 보여 줌 */
let ppVisible = false;
function ppShow() {
  let hash = '';
  try { const l = localStorage.getItem(PP_LINK); if (l) { hash = l.slice(l.indexOf('#')); localStorage.removeItem(PP_LINK); } } catch (e) { }
  ppVisible = true;
  window.Android.ppShow(true, Math.round($('.tabs').getBoundingClientRect().height || 72), hash);
}
function ppHide() {
  if (!ppVisible) return;
  ppVisible = false;
  window.Android.ppShow(false, 0, '');
}
/** 앱(자바)이 탁구 화면의 저장소를 읽어 넘겨 줌: {r: 'pp.records.v1' 원문, s: 'pp.sample.v1' 원문} */
window.ppFeed = function (raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    window.__ppRaw = (o && o.s === 'true') ? [] : (o && o.r ? JSON.parse(o.r) : null);
    if (S && S.profile && ppSyncCache() && !ppVisible && ['ex', 'set', 'rec'].includes(ui.tab)) render();
  } catch (e) { }
};
function ppView() {
  const n = Object.keys(S.meta.ppDays || {}).length;
  return `<section class="tile t-v">${tileHead('heart', '탁구사랑클럽')}
    <p>탁구 스코어보드는 갤럭시 앱(건강지키미)에서 이 탭에 그대로 열립니다. 웹 버전에서는 기존 탁구사랑클럽 앱을 새 창으로 엽니다.</p>
    <a class="btn primary" href="${PP_URL}" target="_blank" rel="noopener">탁구사랑클럽 열기</a>
    <p class="note">탁구 친 날 ${n}일이 운동 기록에 반영되어 있습니다(하루 80분).</p></section>`;
}

/* ───────── 기록 탭 ───────── */
function kpi4() {
  const p = S.profile, ws = list('w'), vs = list('v');
  const lw = last(ws), pw = ws[ws.length - 2], lv = last(vs), pv = vs[vs.length - 2];
  const ps = vs.filter(x => x.p), os = vs.filter(x => x.o), lp = last(ps), lo = last(os);
  const b = lw ? bmiOf(lw.w, p.height) : null;
  const k = (cls, id, label, badge, val, unit, sub) => `<button type="button" class="kpi ${cls}" data-act="goto" data-v="${id}"><span class="kpi-l">${label}</span><span class="kpi-v">${val}<small>${unit}</small></span>${badge ? `<span class="kpi-b">${badge}</span>` : ''}<span class="kpi-s">${sub}</span></button>`;
  return `<section class="kpis kpis-r">
    ${k('t-w', 'tr-w', '체중 · BMI', b ? pill(BMI[bmiIdx(b)]) : '', lw ? f1(lw.w) : '–', 'kg', lw ? `${pw ? deltaChip(lw.w - pw.w, 'kg') : ''}<span>BMI ${b ? f1(b) : '-'}</span>` : '기록 없음')}
    ${k('t-v', 'tr-v', '혈압', lv ? pill(bpInfo(lv.s, lv.d)) : '', lv ? `${lv.s}/${lv.d}` : '–', '', lv ? (pv ? `직전 ${pv.s}/${pv.d}` : fmtDT(lv.ts)) : '기록 없음')}
    ${k('t-h', 'tr-o', '산소포화도', lo ? pill(spo2Info(lo.o)) : '', lo ? lo.o : '–', '%', os.length > 1 ? `직전 ${os[os.length - 2].o}%` : (lo ? fmtDT(lo.ts) : '기록 없음'))}
    ${k('t-e', 'tr-p', '맥박', lp ? pill(pulseInfo(lp.p)) : '', lp ? lp.p : '–', 'bpm', ps.length > 1 ? `직전 ${ps[ps.length - 2].p}bpm` : (lp ? fmtDT(lp.ts) : '기록 없음'))}
  </section>`;
}
/* 추이 기간: 각 그래프의 [1년 보기] 버튼으로 전환 (기본 1개월) */
const yrOn = id => !!(ui.yr && ui.yr[id]);
const yrBtn = (id, name, back = '1개월') => `<button type="button" class="btn sm yrb${yrOn(id) ? ' primary' : ''}" data-act="yr" data-v="${id}" aria-pressed="${yrOn(id)}" aria-label="${esc(name)} ${yrOn(id) ? '최근 ' + back + '로 보기' : '최근 1년 보기'}">${yrOn(id) ? back + ' 보기' : '1년 보기'}</button>`;
/** 월 눈금: 오른쪽 끝(오늘/지난주)부터 2개월 간격, 끝과 가까운 눈금은 생략 */
function monthTicks(s, e, endLabel) {
  const out = [], d = new Date(e - 1); d.setDate(1); d.setHours(0, 0, 0, 0);
  for (let i = 0; d.getTime() >= s; i++, d.setMonth(d.getMonth() - 1)) {
    if (i % 2) continue;
    const t = d.getTime(); if (e - t < 20 * DAY && endLabel) continue;
    out.push({ x: t, l: (d.getMonth() === 0 ? String(d.getFullYear()).slice(2) + '.' : '') + (d.getMonth() + 1) + '월' });
  }
  if (endLabel) out.push({ x: e - 10 * DAY, l: endLabel });   // 오른쪽 끝 글자가 잘리지 않도록 살짝 안쪽
  return out.reverse();
}
function recTrend() {
  const t0 = sod(Date.now()), e = addDays(t0, 1);
  const tile = (id, cls, icon, title, body) => `<section class="tile ${cls}" id="${id}">${tileHead(icon, title, yrBtn(id, title))}${body}</section>`;
  const tgt = S.profile.targetWeight ? [{ y: S.profile.targetWeight, l: '목표 ' + f1(S.profile.targetWeight), cls: 'goal' }] : [];
  const spec = [
    { id: 'tr-w', cls: 't-w', icon: 'scale', title: '체중 추이', src: () => list('w'), fs: ['w'], unit: 'kg', dec: 1, refs: tgt },
    { id: 'tr-v', cls: 't-v', icon: 'heart', title: '혈압 추이', src: () => list('v'), fs: ['s', 'd'], unit: '', dec: 0, refs: [{ y: 135, l: '가정혈압 기준 135' }, { y: 85, l: '85' }] },
    { id: 'tr-o', cls: 't-h', icon: 'heart', title: '산소포화도 추이', src: () => list('v').filter(x => x.o), fs: ['o'], unit: '%', dec: 1, band: [95, 100], bandTxt: '초록 띠: 정상 범위 95~100%' },
    { id: 'tr-p', cls: 't-e', icon: 'heart', title: '맥박 추이', src: () => list('v').filter(x => x.p), fs: ['p'], unit: 'bpm', dec: 0, band: [60, 100], bandTxt: '초록 띠: 정상 범위 60~100회/분' }
  ];
  return spec.map(m => {
    const Y = yrOn(m.id), days = Y ? 365 : 30, s = addDays(t0, -(days - 1)), inR = x => x.ts >= s && x.ts < e;
    const its = m.src().filter(inR), fm = n => m.dec ? f1(n) : String(r0(n));
    let ticks, pts;
    if (!Y) {
      ticks = [28, 21, 14, 7, 0].map(i => { const d = addDays(t0, -i), dd = new Date(d); return { x: d + DAY / 2, l: i === 0 ? '오늘' : `${dd.getMonth() + 1}/${dd.getDate()}` }; });
      pts = f => [...groupBy(its.filter(x => x[f] != null), x => dayKey(x.ts))].map(([, a]) => ({ x: sod(a[0].ts) + DAY / 2, y: avg(a.map(x => x[f])) }));
    } else {
      ticks = monthTicks(s, e, '오늘');
      // 오늘을 끝으로 7일씩 묶은 주 평균(세로선 = 그 주 최저~최고)
      pts = f => { const out = []; for (let k = 0; k < 53; k++) { const b1 = e - k * 7 * DAY, b0 = Math.max(s, b1 - 7 * DAY); if (b1 <= s) break; const v = its.filter(x => x[f] != null && x.ts >= b0 && x.ts < b1).map(x => x[f]); if (v.length) out.push({ x: (b0 + b1) / 2, y: avg(v), ...(v.length > 1 ? { lo: Math.min(...v), hi: Math.max(...v) } : {}) }); } return out; };
    }
    const series = m.fs.map((f, i) => ({ c: i ? 'b' : 'a', points: pts(f), noDots: false }));
    const chart = lineChart({ s, e, ticks, series, refs: m.refs, band: m.band, aria: `${Y ? '최근 1년' : '최근 30일'} ${m.title}` });
    const span = Y ? '1년' : '30일';
    let foot = `<p class="note">${Y ? '최근 1년 · 점 1개 = 7일 평균(세로선은 그 주 최저~최고)' : '최근 30일 · 점 1개 = 하루 평균'} · 오른쪽 끝이 오늘</p>`;
    if (m.id === 'tr-v') foot = `<div class="legend"><span><i style="background:var(--c-v)"></i>수축기</span><span><i style="background:var(--s2)"></i>이완기</span></div>` + foot + (its.length ? `<p class="note">${span} 평균 <b>${r0(avg(its.map(x => x.s)))}/${r0(avg(its.map(x => x.d)))}</b> · 135/85 이상 ${r0(its.filter(x => x.s >= 135 || x.d >= 85).length / its.length * 100)}% · ${its.length}회</p>` : `<p class="note">최근 ${span} 기록이 없습니다.</p>`);
    else {
      if (m.bandTxt) foot += `<p class="note">${m.bandTxt}</p>`;
      const f = m.fs[0], v = its.map(x => x[f]);
      foot += v.length ? `<p class="note">${span} 평균 <b>${fm(avg(v))}${m.unit}</b> · 최저 ${fm(Math.min(...v))} · 최고 ${fm(Math.max(...v))} · ${v.length}회${Y && m.id === 'tr-w' && v.length > 1 ? ` · 1년간 변화 <b>${v[v.length - 1] - v[0] >= 0 ? '+' : '−'}${f1(Math.abs(v[v.length - 1] - v[0]))}kg</b>` : ''}</p>` : `<p class="note">최근 ${span} 기록이 없습니다.</p>`;
    }
    return tile(m.id, m.cls, m.icon, m.title, `<div class="chart-wrap">${chart}</div>${foot}`);
  }).join('');
}
function recView() { return banners() + kpi4() + quickEntry() + recTrend() + recentTable(); }

/* ───────── 운동 탭 ───────── */
function exWeekTile() {
  const goal = S.profile.exGoal || 150, wm = weekMod(Date.now()), ws0 = weekStart(Date.now());
  const byK = {}; exList().filter(e => e.ts >= ws0).forEach(e => { const g = EXG[e.k] || e.k; byK[g] = (byK[g] || 0) + e.min; });
  return `<section class="tile t-e">${tileHead('bike', '이번 주 운동 (월~일)', '<span class="src">WHO 권장 주 150분</span>')}
    <div class="readout"><span class="num mid">${r0(wm)}</span><span class="unit">/ ${goal}분 (중강도 환산)</span></div>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${r0(Math.min(wm, goal))}"><i style="width:${Math.min(100, wm / goal * 100).toFixed(1)}%"></i></div>
    <div class="meta-row">${Object.keys(byK).length ? Object.entries(byK).map(([k, m]) => `<span class="x-${EXC[k] || 'r'} exchip">${exIco(k)}${esc(exOf(k).n)} <b>${m1(m)}분</b></span>`).join('') : '<span>이번 주 운동 기록이 없습니다</span>'}</div></section>`;
}
function exWeeklyTrend() {
  const Y = yrOn('tr-ex'), N = Y ? 52 : 13;
  const thisWs = weekStart(Date.now()), s = addDays(thisWs, -7 * N), e = thisWs;
  const items = exList().filter(x => x.ts >= s && x.ts < e);
  const bars = [];
  for (let w = s; w < e; w = addDays(w, 7)) {
    const we = addDays(w, 7), parts = [];
    ['v', 'e', 'h', 'w', 'c', 'i', 'r'].forEach(x => { const y = items.filter(it => it.ts >= w && it.ts < we && (EXC[it.k] || 'r') === x).reduce((t, it) => t + it.min, 0); if (y) parts.push({ y, x }); });
    bars.push({ x0: w, x1: we, y: parts.reduce((t, p) => t + p.y, 0), parts });
  }
  const ticks = Y ? monthTicks(s, e, '지난주')
    : bars.map((b, i) => ({ b, i })).filter(({ i }) => (bars.length - 1 - i) % 2 === 0).map(({ b }) => { const d = new Date(b.x0); return { x: (b.x0 + b.x1) / 2, l: `${d.getMonth() + 1}/${d.getDate()}` }; });
  const lastSun = new Date(addDays(e, -1)), first = new Date(s);
  const tot = {}; items.forEach(it => { const g = EXG[it.k] || it.k; tot[g] = (tot[g] || 0) + it.min; });
  const all = items.reduce((t, it) => t + it.min, 0), met = bars.filter(b => b.y >= 150).length;
  const fd = d => (Y ? `${String(d.getFullYear()).slice(2)}.` : '') + `${d.getMonth() + 1}/${d.getDate()}`;
  const title = Y ? '연간 운동 시간 추이' : '주간 운동 시간 추이';
  return `<section class="tile t-e" id="tr-ex">${tileHead('chart', title, yrBtn('tr-ex', '운동 시간 추이', '3개월'))}
    <div class="chart-wrap">${barChart({ s, e, ticks, bars, ref: 150, refLine: 'WHO 권장 150분', aria: `최근 ${N}주 주간 운동 시간` })}</div>
    ${exLegend}
    <p class="note">${fd(first)} ~ ${fd(lastSun)} · ${N}주. 막대 1개 = 한 주(월~일), 점선 = WHO 권장 주 150분. 오른쪽 끝이 지난주이며, 이번 주는 끝난 뒤에 더해집니다. 탁구는 경기한 날마다 80분으로 계산합니다.</p>
    <div class="stats">${[[`${N}주 합계`, fmin(all) + '분'], ['주 평균', r0(all / N) + '분'], ['150분 이상', `${met}/${N}주`], ...Object.entries(tot).map(([k, m]) => [exOf(k).n, fmin(m) + '분'])].map(([k, v]) => `<div class="stat"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></section>`;
}
function exView() {
  return `<section class="tile t-e">${exForm()}</section>` + exWeekTile() + exStats() + exWeeklyTrend() + exTimeline();
}

/* ───────── 설정: 생활 기록 · 탁구 연결 · 기념일 파일 ───────── */
function lifeView() {
  return `<section class="tile t-h">${tileHead('cup', '생활 기록 · 복약 · 수분 · 수면', '<button class="btn sm" data-act="tab" data-tab="set">설정으로</button>')}${habitForm()}</section>`;
}
function setExtraTiles() {
  const n = Object.keys(S.meta.ppDays || {}).length;
  return `<section class="tile t-h">${tileHead('cup', '생활 기록')}<p class="note">복약·영양제 체크, 물, 수면·컨디션, 걸음 수를 기록합니다.</p><button class="btn primary" data-act="tab" data-tab="life">생활 기록 열기</button></section>
  <section class="tile t-v">${tileHead('heart', '탁구사랑클럽 연결')}
    <p class="note">탁구 탭은 기존 탁구사랑클럽 앱을 그대로 씁니다. 경기 기록은 지금처럼 Google Sheets에 저장되어 두 분 휴대폰이 함께 봅니다. 처음 한 번, 탁구 탭의 ⚙️ 설정에 기존 앱의 웹 앱 URL·토큰을 넣거나, 기존 앱에서 보낸 '연결 링크'를 아래에 붙여 넣으세요.</p>
    ${APP ? `<div class="row"><input id="ppLinkIn" class="inl" autocomplete="off" placeholder="https://…/pingpong/#gas=…" aria-label="탁구 연결 링크"><button class="btn sm primary" data-act="pp-link">연결 링크 적용</button></div>` : ''}
    <p class="note">탁구 친 날 ${n}일 반영됨${S.meta.ppAt ? ` · 마지막 반영 ${fmtDT(S.meta.ppAt)}` : ''}. 탁구 화면을 닫을 때와 앱을 다시 열 때 자동 반영됩니다.</p></section>`;
}
function annFileRow() {
  return `<div class="row"><button type="button" class="btn sm" data-act="ann-export">기념일 목록 파일 저장</button><button type="button" class="btn sm" data-act="ann-import">기념일 파일 불러오기</button></div>
    <p class="note">배우자 휴대폰에 같은 기념일을 넣을 때 사용합니다. 불러오면 없는 기념일만 추가됩니다.</p>`;
}
async function annExport() {
  const data = JSON.stringify({ app: 'krhealth-anniv', v: 1, annivs: annivs().map(({ id, ...a }) => a) }, null, 1);
  if (await saveFile(`건강지키미-기념일-${dayKey(Date.now())}.json`, data)) toast('기념일 파일을 저장했습니다');
}
function annImport(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const o = JSON.parse(fr.result);
      const arr = o && (o.app === 'krhealth-anniv' ? o.annivs : o.app === 'krhealth' && o.profile ? o.profile.annivs : null);
      if (!Array.isArray(arr)) throw new Error('형식');
      const cur = annivs(), key = a => [a.n, a.m, a.d, a.lunar ? 1 : 0].join('|'), have = new Set(cur.map(key));
      const add = arr.filter(a => a && a.n && a.m && a.d && !have.has(key(a))).map(a => ({ ...a, id: newId('a') }));
      if (DEMO) { toast('예시 모드에서는 불러올 수 없습니다'); return; }
      S.profile.annivs = [...cur, ...add]; S.profile.updatedAt = Date.now(); persist(null); scheduleAll(); render();
      toast(add.length ? `기념일 ${add.length}건을 추가했습니다` : '새로 추가할 기념일이 없습니다');
    } catch (err) { toast('기념일 파일이 아닙니다'); }
  };
  fr.readAsText(file);
}

/* ───────── 화면: 추이 ───────── */
function periodRange() {
  const now = new Date(); let s, e, label;
  if (ui.period === 'week') {
    s = addDays(weekStart(Date.now()), ui.offset * 7); e = addDays(s, 7);
    const sd = new Date(s), ed = new Date(addDays(s, 6));
    label = `${sd.getMonth() + 1}월 ${sd.getDate()}일 – ${sd.getMonth() === ed.getMonth() ? '' : (ed.getMonth() + 1) + '월 '}${ed.getDate()}일`;
  } else if (ui.period === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth() + ui.offset, 1); s = d.getTime(); e = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  } else { const y = now.getFullYear() + ui.offset; s = new Date(y, 0, 1).getTime(); e = new Date(y + 1, 0, 1).getTime(); label = `${y}년`; }
  return { s, e, label };
}
function ticksFor(s, e) {
  const t = [];
  if (ui.period === 'week') for (let i = 0; i < 7; i++) { const x = addDays(s, i); t.push({ x: x + DAY / 2, l: WD[new Date(x).getDay()] + ' ' + new Date(x).getDate() }); }
  else if (ui.period === 'month') [1, 8, 15, 22, 29].forEach(dn => { const d = new Date(s); d.setDate(dn); if (d.getTime() < e) t.push({ x: d.getTime() + DAY / 2, l: dn + '일' }); });
  else for (let m = 0; m < 12; m++) { const a = new Date(new Date(s).getFullYear(), m, 1).getTime(), b = new Date(new Date(s).getFullYear(), m + 1, 1).getTime(); t.push({ x: (a + b) / 2, l: String(m + 1) }); }
  return t;
}
function nice(mn, mx) {
  if (mn === mx) { mn -= 1; mx += 1; }
  const span = mx - mn, raw = span / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => k >= raw);
  return { lo: Math.floor((mn - span * 0.04) / step) * step, hi: Math.ceil((mx + span * 0.04) / step) * step, step };
}
const fmtTick = (v, st) => st < 1 ? v.toFixed(1) : String(Math.round(v));
function lineChart(o) {
  const W = 340, H = 220, L = 38, R = 10, T = 14, B = 28;
  const pts = o.series.flatMap(s => s.points);
  const X = t => L + (t - o.s) / (o.e - o.s) * (W - L - R);
  let g = '';
  if (!pts.length) {
    o.ticks.forEach(t => { g += `<text x="${X(t.x).toFixed(1)}" y="${H - 8}" class="ax" text-anchor="middle">${esc(t.l)}</text>`; });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(o.aria)}"><line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="grid"/>${g}<text x="${W / 2}" y="${H / 2}" class="none" text-anchor="middle">이 기간에는 기록이 없습니다</text></svg>`;
  }
  const vals = [];
  o.series.forEach(s => s.points.forEach(p => { vals.push(p.y); if (p.lo != null) vals.push(p.lo, p.hi); }));
  (o.refs || []).forEach(r => vals.push(r.y)); if (o.band) vals.push(o.band[0], o.band[1]);
  const { lo, hi, step } = nice(Math.min(...vals), Math.max(...vals));
  const Y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  if (o.band) { const y1 = Y(Math.min(o.band[1], hi)), y2 = Y(Math.max(o.band[0], lo)); g += `<rect x="${L}" width="${W - L - R}" y="${y1.toFixed(1)}" height="${Math.max(0, y2 - y1).toFixed(1)}" class="band"/>`; }
  for (let i = 0; ; i++) { const v = lo + i * step; if (v > hi + step * 1e-6) break; const y = Y(v).toFixed(1); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 6}" y="${(+y + 3.5).toFixed(1)}" class="ax" text-anchor="end">${fmtTick(v, step)}</text>`; }
  o.ticks.forEach(t => { g += `<text x="${X(t.x).toFixed(1)}" y="${H - 8}" class="ax" text-anchor="middle">${esc(t.l)}</text>`; });
  (o.refs || []).forEach(r => { const y = Y(r.y).toFixed(1); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="ref ${r.cls || ''}"/><text x="${W - R}" y="${(+y - 4).toFixed(1)}" class="ref-t ${r.cls ? r.cls + '-t' : ''}" text-anchor="end">${esc(r.l)}</text>`; });
  o.series.forEach(s => {
    const ps = s.points.slice().sort((a, b) => a.x - b.x);
    ps.forEach(p => { if (p.lo != null) g += `<line x1="${X(p.x).toFixed(1)}" x2="${X(p.x).toFixed(1)}" y1="${Y(p.hi).toFixed(1)}" y2="${Y(p.lo).toFixed(1)}" class="wh s-${s.c}"/>`; });
    if (ps.length > 1) g += `<path d="M${ps.map(p => X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join('L')}" class="ln s-${s.c}"/>`;
    if (!s.noDots) { const r = ps.length > 40 ? 2 : 3.2; ps.forEach(p => { g += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${r}" class="f-${s.c}"/>`; }); }
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(o.aria)}">${g}</svg>`;
}
function barChart(o) {
  const W = 340, H = 220, L = 38, R = 10, T = 18, B = 28;
  const X = t => L + (t - o.s) / (o.e - o.s) * (W - L - R);
  const mx = Math.max(o.ref || 0, ...o.bars.map(b => b.y), 10);
  const { hi, step } = nice(0, mx); const lo = 0;
  const Y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  let g = '';
  for (let i = 0; ; i++) { const v = i * step; if (v > hi + 1e-6) break; const y = Y(v).toFixed(1); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 6}" y="${(+y + 3.5).toFixed(1)}" class="ax" text-anchor="end">${Math.round(v)}</text>`; }
  o.ticks.forEach(t => { g += `<text x="${X(t.x).toFixed(1)}" y="${H - 8}" class="ax" text-anchor="middle">${esc(t.l)}</text>`; });
  const showV = o.bars.length <= 14;
  if (o.refLine && o.ref) { const y = Y(o.ref).toFixed(1); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="ref"/>`; }
  o.bars.forEach(b => { if (!b.y) return; const x0 = X(b.x0), x1 = X(b.x1), w = Math.max(2, (x1 - x0) * 0.68), x = x0 + (x1 - x0 - w) / 2;
    if (b.parts && b.parts.length) { let acc = 0; b.parts.forEach(p => { g += `<rect x="${x.toFixed(1)}" y="${Y(acc + p.y).toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(acc) - Y(acc + p.y)).toFixed(1)}" style="fill:var(--c-${p.x})"/>`; acc += p.y; }); }
    else g += `<rect x="${x.toFixed(1)}" y="${Y(b.y).toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(0) - Y(b.y)).toFixed(1)}" rx="2" class="bars"/>`; if (showV) g += `<text x="${(x + w / 2).toFixed(1)}" y="${(Y(b.y) - 4).toFixed(1)}" class="bv" text-anchor="middle">${Math.round(b.y)}</text>`; });
  if (!o.bars.some(b => b.y)) g += `<text x="${W / 2}" y="${H / 2}" class="none" text-anchor="middle">이 기간에는 기록이 없습니다</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(o.aria)}">${g}</svg>`;
}
function groupBy(items, keyFn) { const m = new Map(); items.forEach(e => { const k = keyFn(e); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }); return m; }
function seriesFor(items, field) {
  if (ui.period === 'week') return items.filter(e => e[field] != null).map(e => ({ x: e.ts, y: e[field] }));
  if (ui.period === 'month') return [...groupBy(items.filter(e => e[field] != null), e => dayKey(e.ts))].map(([k, a]) => ({ x: sod(a[0].ts) + DAY / 2, y: avg(a.map(e => e[field])) }));
  return [...groupBy(items.filter(e => e[field] != null), e => monthKey(e.ts))].map(([k, a]) => { const d = new Date(a[0].ts), s0 = new Date(d.getFullYear(), d.getMonth(), 1).getTime(), e0 = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); const v = a.map(e => e[field]); return { x: (s0 + e0) / 2, y: avg(v), lo: Math.min(...v), hi: Math.max(...v) }; });
}
function chartDetail() {
  const { s, e, label } = periodRange();
  const ticks = ticksFor(s, e);
  const tc = { w: 't-w', v: 't-v', p: 't-v', o: 't-v', e: 't-e' }[ui.metric];
  let h = chartHeader(tc, label) + `<section class="tile ${tc}">`;
  const inR = x => x.ts >= s && x.ts < e;
  const m = ui.metric, stats = [];
  let chart = '', legend = '', histItems = [];
  if (m === 'w') {
    const items = list('w').filter(inR); histItems = items;
    const series = [{ c: 'a', points: seriesFor(items, 'w') }];
    if (ui.period === 'month') {
      const all = list('w').filter(x => x.ts >= addDays(s, -6) && x.ts < e), daily = groupBy(all, x => dayKey(x.ts)), dAvg = new Map([...daily].map(([k, a]) => [k, avg(a.map(x => x.w))]));
      const ma = []; for (let d = s; d < e && d <= Date.now(); d = addDays(d, 1)) { const vals = []; for (let j = 0; j < 7; j++) { const v = dAvg.get(dayKey(addDays(d, -j))); if (v != null) vals.push(v); } if (vals.length >= 3) ma.push({ x: d + DAY / 2, y: avg(vals) }); }
      if (ma.length > 1) { series.push({ c: 'ma', points: ma, noDots: true }); legend = `<div class="legend"><span><i style="background:var(--accent)"></i>일 평균</span><span><i style="background:var(--ma)"></i>7일 이동평균</span></div>`; }
    }
    const refs = S.profile.targetWeight ? [{ y: S.profile.targetWeight, l: '목표 ' + f1(S.profile.targetWeight), cls: 'goal' }] : [];
    chart = lineChart({ s, e, ticks, series, refs, aria: '체중 추이' });
    if (items.length) { const v = items.map(x => x.w); stats.push(['평균', f1(avg(v)) + 'kg'], ['최저', f1(Math.min(...v)) + 'kg'], ['최고', f1(Math.max(...v)) + 'kg'], ['기간 변화', (v[v.length - 1] - v[0] >= 0 ? '+' : '−') + f1(Math.abs(v[v.length - 1] - v[0])) + 'kg']); const b = bmiOf(avg(v), S.profile.height); if (b) stats.push(['평균 BMI', f1(b)]); stats.push(['기록', items.length + '회']); }
  } else if (m === 'v' || m === 'p' || m === 'o') {
    const items = list('v').filter(inR); histItems = items;
    if (m === 'v') {
      chart = lineChart({ s, e, ticks, series: [{ c: 'a', points: seriesFor(items, 's') }, { c: 'b', points: seriesFor(items, 'd') }], refs: [{ y: 135, l: '가정혈압 기준 135' }, { y: 85, l: '85' }], aria: '혈압 추이' });
      legend = `<div class="legend"><span><i style="background:var(--accent)"></i>수축기</span><span><i style="background:var(--s2)"></i>이완기</span>${ui.period === 'year' ? '<span>세로선: 월 최저~최고</span>' : ''}</div>`;
      if (items.length) {
        const am = items.filter(x => slotOf(x) === '아침'), pm = items.filter(x => slotOf(x) === '저녁');
        const a = (arr) => arr.length ? r0(avg(arr.map(x => x.s))) + '/' + r0(avg(arr.map(x => x.d))) : '-';
        const mxS = items.reduce((p, x) => x.s > p.s ? x : p, items[0]);
        stats.push(['평균', a(items)], ['아침 평균', a(am)], ['저녁 평균', a(pm)], ['최고', mxS.s + '/' + mxS.d], ['135/85 이상', r0(items.filter(x => x.s >= 135 || x.d >= 85).length / items.length * 100) + '%'], ['기록', items.length + '회']);
      }
    } else if (m === 'p') {
      const its = items.filter(x => x.p); histItems = its;
      chart = lineChart({ s, e, ticks, series: [{ c: 'a', points: seriesFor(its, 'p') }], band: [60, 100], aria: '맥박 추이' });
      legend = `<div class="legend"><span><i style="background:var(--accent-soft);height:8px"></i>정상 범위 60~100회/분</span></div>`;
      if (its.length) { const v = its.map(x => x.p); stats.push(['평균', r0(avg(v)) + '회'], ['최저', Math.min(...v) + '회'], ['최고', Math.max(...v) + '회'], ['기록', its.length + '회']); }
    } else {
      const its = items.filter(x => x.o); histItems = its;
      chart = lineChart({ s, e, ticks, series: [{ c: 'a', points: seriesFor(its, 'o') }], band: [95, 100], aria: '산소포화도 추이' });
      legend = `<div class="legend"><span><i style="background:var(--accent-soft);height:8px"></i>정상 범위 95~100%</span></div>`;
      if (its.length) { const v = its.map(x => x.o); stats.push(['평균', f1(avg(v)) + '%'], ['최저', Math.min(...v) + '%'], ['95% 미만', v.filter(x => x < 95).length + '회']); }
    }
  } else {
    const items = list('e').filter(inR); histItems = items;
    chart = barChart({ s, e, ticks, bars: exBars(items, s, e), aria: '운동 시간' });
    legend = exLegend;
    if (items.length) {
      const tot = items.reduce((t, x) => t + x.min, 0), mod = items.reduce((t, x) => t + modEq(x), 0), wt = (list('w').slice(-1)[0] || {}).w || 65, kcal = items.reduce((t, x) => t + x.met * wt * x.min / 60, 0);
      stats.push(['총 시간', tot + '분'], ['중강도 환산', r0(mod) + '분']);
      if (ui.period !== 'week') stats.push(['주 평균(환산)', r0(mod / ((e - s) / (7 * DAY))) + '분']);
      else stats.push(['목표 대비', r0(mod / (S.profile.exGoal || 150) * 100) + '%']);
      stats.push(['소모(추정)', r0(kcal).toLocaleString() + 'kcal']);
      const byK = {}; items.forEach(x => { byK[x.k] = (byK[x.k] || 0) + x.min; });
      Object.entries(byK).forEach(([k, v]) => stats.push([exOf(k).n, v + '분']));
    }
  }
  h += `<div class="chart-wrap">${chart}</div>${legend}</section>`;
  if (stats.length) h += `<section class="stats ${tc}">${stats.map(([k, v]) => `<div class="stat"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</section>`;
  h += historyBlock(histItems.slice().sort((a, b) => b.ts - a.ts), tc);
  return h;
}
const exSub = e => [fmtDT(e.ts), EX_ON.some(x => x.k === e.k) ? '' : INT[e.int], e.memo].filter(Boolean).join(' · ');   // 강도 선택 삭제: 현재 6종목은 강도 표시 안 함
function entryLine(e) {
  if (e.pp) return [`탁구 ${e.min}분 (1시간 20분)`, `${fmtD(e.ts)} · 탁구사랑클럽 ${e.games}경기 · 자동 반영`];
  if (e.t === 'j') return [`${JCAT[e.cat] || '일지'}: ${e.text}`, fmtDT(e.ts)];
  if (e.t === 'w') return [`${f1(e.w)}kg${e.waist ? ` · 허리 ${e.waist}cm` : ''}`, `${fmtDT(e.ts)} · ${slotOf(e)}${e.memo ? ' · ' + e.memo : ''}`];
  if (e.t === 'v') return [`${e.s}/${e.d}${e.p ? ` · 맥박 ${e.p}` : ''}${e.o ? ` · SpO2 ${e.o}%` : ''}`, `${fmtDT(e.ts)} · ${slotOf(e)} · ${e.arm === 'R' ? '오른팔' : '왼팔'}${e.med === 'before' ? ' · 약 복용 전' : e.med === 'after' ? ' · 약 복용 후' : ''}${e.memo ? ' · ' + e.memo : ''}`];
  if (e.k === 'stretch' && e.reps) return [`스트레칭 ${e.reps}번 (약 ${e.min}분)`, exSub(e)];
  if (e.k === 'walk' && e.steps) return [`걷기 ${e.steps.toLocaleString()}보 (약 ${e.min}분)`, exSub(e)];
  if (e.k === 'bar' && e.sec) return [e.sets > 1 ? `철봉 매달리기 ${e.sets}세트 × ${fsec(e.sec)} = ${fsec(e.sec * e.sets)}` : `철봉 매달리기 ${fsec(e.sec)}`, exSub(e)];
  return [`${exOf(e.k).n} ${e.min}분${e.km ? ` · ${e.km}km` : ''}`, exSub(e)];
}
function historyBlock(items, tc) {
  if (!items.length) return '';
  const shown = items.slice(0, 60);
  return `<section class="tile ${tc || ''}"><h3>기간 내 기록</h3><ul class="hist">${shown.map(e => {
    const [v, sub] = entryLine(e);
    if (ui.confirmDel === e.id) return `<li><div class="h-main"><span class="h-v">${esc(v)}</span><span class="h-s">이 기록을 삭제할까요?</span></div><div class="row"><button class="btn sm" data-act="del-no">취소</button><button class="btn sm primary" data-act="del-yes" data-id="${esc(e.id)}">삭제</button></div></li>`;
    return `<li><div class="h-main"><span class="h-v">${esc(v)}</span><span class="h-s">${esc(sub)}</span></div><button class="x" data-act="del" data-id="${esc(e.id)}" aria-label="삭제">×</button></li>`;
  }).join('')}</ul>${items.length > 60 ? `<p class="note">외 ${items.length - 60}건</p>` : ''}</section>`;
}

/* ───────── 화면: 달력 ───────── */
function annJumpChips() {
  const t0 = sod(Date.now()), byM = new Map();
  annivs().forEach(a => occIn(a, t0, addDays(t0, 366)).slice(0, 1).forEach(o => { const d = new Date(o.ts), k = d.getFullYear() * 12 + d.getMonth(); if (!byM.has(k)) byM.set(k, { ts: o.ts, names: [] }); byM.get(k).names.push(a.n.replace(/ 생일$/, '')); }));
  const arr = [...byM.entries()].sort((x, y) => x[0] - y[0]);
  if (!arr.length) return '';
  return `<div class="jchips" aria-label="기념일이 있는 달로 이동">${arr.map(([, v]) => `<button type="button" class="btn sm" data-act="cal-jump" data-d="${dayKey(v.ts)}">${new Date(v.ts).getMonth() + 1}월 · ${esc(v.names.join(', '))}</button>`).join('')}</div>`;
}
function calView() {
  const now = new Date();
  if (ui.calY == null) { ui.calY = now.getFullYear(); ui.calM = now.getMonth(); }
  const y = ui.calY, m = ui.calM, first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), lead = first.getDay();
  const hol = holidaysOfYear(y), today = dayKey(Date.now()), sel = ui.calSel || today;
  const mS = first.getTime(), mE = new Date(y, m + 1, 1).getTime();
  const recDays = {};
  Object.values(S.entries).forEach(e => { if (e.t !== 'h' && e.ts >= mS && e.ts < mE) { const k = dayKey(e.ts); (recDays[k] = recDays[k] || new Set()).add(e.t); } });
  const annMap = {};
  annivs().forEach(a => occIn(a, mS, mE).forEach(o => { const k = dayKey(o.ts); (annMap[k] = annMap[k] || []).push(a.n); }));
  let cells = WD.map((w, i) => `<div class="wd${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${w}</div>`).join('');
  for (let i = 0; i < lead; i++) cells += '<div class="cd blank" aria-hidden="true"></div>';
  for (let d = 1; d <= days; d++) {
    const ts = new Date(y, m, d).getTime(), k = dayKey(ts), dow = new Date(ts).getDay();
    const an = annMap[k], hd = hol[k], rd = recDays[k];
    const cls = ['cd', dow === 0 ? 'sun' : dow === 6 ? 'sat' : '', hd ? 'hol' : '', an ? 'ann' : '', k === today ? 'today' : '', k === sel ? 'sel' : ''].filter(Boolean).join(' ');
    const label = an ? an[0].replace(/ 생일$/, '') : hd ? hd.split('·')[0] : '';
    cells += `<button type="button" class="${cls}" data-act="cal-day" data-d="${k}" aria-label="${m + 1}월 ${d}일${an ? ', ' + esc(an.join(', ')) : ''}${hd ? ', ' + hd : ''}"><span class="dn">${d}</span>${label ? `<span class="cl">${esc(label)}</span>` : ''}<span class="dots">${rd ? ['w', 'v', 'e'].filter(t => rd.has(t)).map(t => `<i class="d${t}"></i>`).join('') : ''}</span></button>`;
  }
  let h = `<section class="tile t-c">${tileHead('cal', '달력', '<button class="btn sm" data-act="cal-today">오늘</button>')}
    <div class="navrow"><button type="button" class="navbtn" data-act="cal-prev" aria-label="이전 달">‹</button><b>${y}년 ${m + 1}월</b><button type="button" class="navbtn" data-act="cal-next" aria-label="다음 달">›</button></div>
    ${annJumpChips()}<div class="cal">${cells}</div>
    <div class="legend"><span><i class="dw" style="height:6px;width:6px;border-radius:50%"></i>체중</span><span><i class="dv" style="height:6px;width:6px;border-radius:50%"></i>혈압</span><span><i class="de" style="height:6px;width:6px;border-radius:50%"></i>운동</span><span>보라 칸: 기념일 · 빨간 날짜: 공휴일(대체공휴일 제외)</span></div></section>`;
  // 선택한 날
  const sts = new Date(sel + 'T00:00').getTime(), lu = toLunar(sts), sd = new Date(sts);
  const sAnn = annsOnDay(sts), sHol = holidaysOfYear(sd.getFullYear())[sel];
  const recs = Object.values(S.entries).filter(e => dayKey(e.ts) === sel).sort((a, b) => a.ts - b.ts);
  const hab = recs.find(e => e.t === 'h');
  h += `<section class="tile t-c">${tileHead('info', `${sd.getMonth() + 1}월 ${sd.getDate()}일 (${WD[sd.getDay()]})`, lu ? `<span class="when">음력 ${lu.leap ? '윤' : ''}${lu.m}월 ${lu.d}일</span>` : '')}
    ${sHol ? `<div class="meta-row"><span class="pill c-red">${esc(sHol)}</span></div>` : ''}
    ${sAnn.length ? `<ul class="anns">${sAnn.map(annLi).join('')}</ul>` : ''}
    ${recs.filter(e => e.t !== 'h').length ? `<ul class="hist">${recs.filter(e => e.t !== 'h').map(e => { const [v, s] = entryLine(e); return `<li><div class="h-main"><span class="h-v">${esc(v)}</span><span class="h-s">${esc(s)}</span></div></li>`; }).join('')}</ul>` : '<p class="empty">이 날의 건강 기록이 없습니다.</p>'}
    ${hab ? `<div class="meta-row">${hab.med != null ? `<span>약 <b>${hab.med ? '복용' : '안 함'}</b></span>` : ''}${hab.sleep != null ? `<span>수면 <b>${hab.sleep}시간</b></span>` : ''}${hab.water ? `<span>물 <b>${hab.water}잔</b></span>` : ''}${hab.steps != null ? `<span>걸음 <b>${Number(hab.steps).toLocaleString()}</b></span>` : ''}</div>` : ''}
  </section>`;
  // 다가오는 기념일 전체
  const up = upcoming(400);
  h += `<section class="tile t-c">${tileHead('gift', '다가오는 기념일')}${up.length ? `<ul class="anns">${up.map(annLi).join('')}</ul>` : '<p class="empty">등록된 기념일이 없습니다.</p>'}<p class="note">음력 기념일은 매년 양력 날짜로 바꿔 표시합니다(한국천문연구원 기준 음력 자료, 2049년까지).</p></section>`;
  // 관리
  const opt = (n, cur) => Array.from({ length: n }, (_, i) => `<option value="${i + 1}"${i + 1 === cur ? ' selected' : ''}>${i + 1}</option>`).join('');
  h += `<section class="tile t-c">${tileHead('pen', '기념일 관리')}
    <ul class="hist">${annivs().map(a => ui.confirmAnn === a.id
      ? `<li><div class="h-main"><span class="h-v">${esc(a.n)}</span><span class="h-s">이 기념일을 삭제할까요?</span></div><div class="row"><button class="btn sm" data-act="ann-del-no">취소</button><button class="btn sm primary" data-act="ann-del-yes" data-id="${esc(a.id)}">삭제</button></div></li>`
      : `<li>${annIcon(a)}<div class="h-main"><span class="h-v">${esc(a.n)}</span><span class="h-s">${ANN_CAT[catOf(a)].n} · ${a.lunar ? '음력' : '양력'} ${a.m}월 ${a.d}일${a.year ? ' · ' + a.year + '년부터' : ''}${a.memo ? ' · ' + esc(a.memo) : ''}</span><label class="prel">사전 알림 <select class="ann-pre" data-id="${esc(a.id)}" aria-label="${esc(a.n)} 사전 알림">${PRE_OPTS.map(d => `<option value="${d}"${(a.pre ?? 1) === d ? ' selected' : ''}>${preTxt(d)}</option>`).join('')}</select></label></div><button class="x" data-act="ann-del" data-id="${esc(a.id)}" aria-label="${esc(a.n)} 삭제">×</button></li>`).join('')}</ul>${annFileRow()}
    <form class="entry" data-form="anniv" novalidate>
      <h3>새 기념일 추가</h3>
      <label class="field"><span>이름</span><input id="aName" maxlength="20" autocomplete="off" placeholder="예: 손자 생일"></label>
      <label class="field"><span>분류</span><select id="aCat">${Object.entries(ANN_CAT).map(([k, c]) => `<option value="${k}">${c.n}</option>`).join('')}</select></label>
      <div class="field"><span>달력</span>${radios('aCal', [{ v: '0', l: '양력' }, { v: '1', l: '음력' }], '0')}</div>
      <div class="grid3"><label class="field"><span>월</span><select id="aM">${opt(12, now.getMonth() + 1)}</select></label><label class="field"><span>일</span><select id="aD">${opt(31, now.getDate())}</select></label><label class="field"><span>시작 연도</span><input id="aYear" inputmode="numeric" autocomplete="off" placeholder="선택"></label></div>
      <label class="field"><span>사전 알림 (아침 8시)</span><select id="aPre">${PRE_OPTS.map(d => `<option value="${d}"${d === 3 ? ' selected' : ''}>${preTxt(d)}</option>`).join('')}</select></label>
      <label class="field"><span>선물 · 축하 메모 (선택)</span><input id="aMemo" maxlength="30" autocomplete="off" placeholder="예: 용돈 봉투, 가족 식사 예약"></label>
      <p class="note">시작 연도를 넣으면 "만 ○세", "○주년"을 함께 표시합니다.</p>
      <div class="warnline" id="aWarn" hidden></div>
      <button class="btn primary" type="submit">기념일 추가</button>
    </form></section>`;
  return h;
}
function saveAnniv() {
  const n = $('#aName').value.trim(); if (!n) return warn('aWarn', '기념일 이름을 입력해 주세요.');
  const lunar = (($('input[name="aCal"]:checked') || {}).value === '1') ? 1 : 0;
  const m = +$('#aM').value, d = +$('#aD').value;
  if (lunar && d > 30) return warn('aWarn', '음력 날짜는 30일까지입니다.');
  if (!lunar && d > new Date(2024, m, 0).getDate()) return warn('aWarn', `${m}월에는 ${d}일이 없습니다.`);
  const c = $('#aCat').value || 'bday';
  const a = { id: newId('a'), n, c, k: c === 'wed' ? 'wed' : c === 'etc' ? 'etc' : 'bday', m, d };
  const memo = $('#aMemo').value.trim(); if (memo) a.memo = memo;
  a.pre = +$('#aPre').value || 0;
  if (lunar) a.lunar = 1;
  const yr = num($('#aYear').value); if (yr && yr > 1900 && yr <= new Date().getFullYear()) a.year = r0(yr);
  S.profile.annivs = [...annivs(), a]; S.profile.updatedAt = Date.now(); persist(null); render(); toast(n + '을(를) 추가했습니다');
}

/* ───────── 휴대폰 알림(갤럭시 앱 전용) ───────── */
const notifyCfg = () => Object.assign({ bp: true, am: '07:00', pm: '21:30', ann: true }, (S.profile && S.profile.notify) || {});
function notifyTile() {
  const n = notifyCfg(), allowed = window.Android.notifyAllowed ? window.Android.notifyAllowed() : true;
  return `<section class="tile t-v">${tileHead('bell', '알림')}
    ${allowed ? '' : '<div class="warnline">휴대폰 설정에서 알림이 꺼져 있습니다. 아래 "알림 저장"을 누르면 허용 창이 뜹니다. 뜨지 않으면 설정 → 애플리케이션 → 건강지키미 → 알림을 켜 주세요.</div>'}
    <form class="entry" data-form="notify" novalidate>
      <div class="field"><span>혈압 측정 알림 (매일)</span>${radios('nBp', [{ v: '1', l: '켜기' }, { v: '0', l: '끄기' }], n.bp ? '1' : '0')}</div>
      <div class="grid2"><label class="field"><span>아침 알림 시각</span><input type="time" id="nAm" value="${n.am}"></label><label class="field"><span>저녁 알림 시각</span><input type="time" id="nPm" value="${n.pm}"></label></div>
      <div class="field"><span>기념일 알림 (전날 저녁 8시 · 당일 아침 8시)</span>${radios('nAnn', [{ v: '1', l: '켜기' }, { v: '0', l: '끄기' }], n.ann ? '1' : '0')}</div>
      <div class="row"><button class="btn primary" type="submit">알림 저장</button><button class="btn" type="button" data-act="notify-test">시험 알림</button></div>
      <p class="note">절전 상태에 따라 몇 분 늦게 올 수 있습니다. 혈압 알림은 30일치를 미리 예약하므로, 앱을 한 달에 한 번 이상 열어 주세요.</p>
    </form></section>`;
}
let lastSched = '';
function scheduleAll() {
  if (!APP || DEMO || !S.profile) return;
  const n = notifyCfg(), now = Date.now(), list = [];
  if (n.bp) for (let i = 0; i < 30; i++) {
    const d = addDays(sod(now), i);
    [[n.am, '아침', '일어나서 1시간 안, 소변을 본 뒤 식사와 약 복용 전에 5분 쉬고 재 주세요. 체중도 함께 기록하면 좋습니다.'], [n.pm, '저녁', '잠자리에 들기 전, 등을 기대고 앉아 5분 쉬고 재 주세요.']].forEach(([t, l, b]) => {
      if (!t) return; const [hh, mm] = t.split(':').map(Number); const at = d + (hh * 60 + mm) * 60000;
      if (at > now) list.push({ at, t: `${l} 혈압 잴 시간입니다`, b });
    });
  }
  if (n.ann) annivs().forEach(a => occIn(a, sod(now), addDays(now, 400)).forEach(o => {
    const pre = a.pre ?? 1, eve = addDays(o.ts, -pre) + 8 * 3600e3, day = o.ts + 8 * 3600e3;
    if (pre > 0 && eve > now) list.push({ at: eve, t: pre === 1 ? `내일은 ${a.n}입니다` : `${pre}일 후 ${a.n}입니다`, b: annDesc(o) + (a.memo ? ' · ' + a.memo : '') });
    if (day > now) list.push({ at: day, t: `오늘은 ${a.n}입니다`, b: annDesc(o) + ' · 축하 연락을 잊지 마세요' });
  }));
  list.sort((x, y) => x.at - y.at);
  try { window.Android.schedule(JSON.stringify(list.slice(0, 380))); lastSched = dayKey(now); } catch (e) { /* 앱 외 환경 */ }
}
function saveNotify() {
  const v = name => (($(`input[name="${name}"]:checked`) || {}).value === '1');
  S.profile.notify = { bp: v('nBp'), am: $('#nAm').value || '07:00', pm: $('#nPm').value || '21:30', ann: v('nAnn') };
  S.profile.updatedAt = Date.now(); persist(null);
  if (S.profile.notify.bp || S.profile.notify.ann) window.Android.requestNotify();
  scheduleAll(); render(); toast('알림을 저장했습니다');
}
window.__onSaved = (id, ok) => { const cb = window.__saveCbs && window.__saveCbs[id]; if (cb) { delete window.__saveCbs[id]; cb(ok); } };
window.appBack = () => {
  if (!$('#sheet').hidden) { closeSheet(); return true; }
  if (ui.tab !== 'rec' && S.profile) { ui.tab = (ui.tab === 'report' || ui.tab === 'life') ? 'set' : 'rec'; render(); window.scrollTo(0, 0); return true; }
  return false;
};
window.appResume = () => { if (APP && S.profile && lastSched !== dayKey(Date.now())) { scheduleAll(); render(); } };
window.appPermResult = ok => { if (!ok) toast('알림이 허용되지 않았습니다. 휴대폰 설정에서 켤 수 있습니다'); if (ui.tab === 'set') render(); };

/* ───────── 화면: 더보기 / 리포트 ───────── */
function profileFields(p) {
  p = p || {};
  return `<div class="grid2">
    <label class="field"><span>부를 이름</span><input id="pNick" maxlength="12" autocomplete="off" value="${esc(p.nick || '')}" placeholder="예: 단장님"></label>
    <div class="field"><span>성별</span>${radios('pSex', [{ v: 'M', l: '남' }, { v: 'F', l: '여' }], p.sex || 'M')}</div>
    <label class="field"><span>출생 연도</span><input id="pBirth" inputmode="numeric" autocomplete="off" value="${p.birthYear || ''}" placeholder="1965"></label>
    <label class="field"><span>키 (cm)</span><input id="pHeight" inputmode="decimal" autocomplete="off" value="${p.height || ''}" placeholder="170"></label>
    <label class="field"><span>목표 체중 (kg, 선택)</span><input id="pTarget" inputmode="decimal" autocomplete="off" value="${p.targetWeight || ''}"></label>
    <label class="field"><span>주간 운동 목표 (분)</span><input id="pEx" inputmode="numeric" autocomplete="off" value="${p.exGoal || 150}"></label>
  </div>
  <div class="field"><span>메시지 말투</span>${radios('pTone', [{ v: 'build', l: '건설 비유' }, { v: 'warm', l: '다정하게' }, { v: 'plain', l: '담백하게' }], p.tone || 'warm')}
  <p class="tone-ex">예) +0.6kg일 때 · 건설 비유: "공정으로 치면 경미한 지연입니다." · 다정하게: "체중계가 오늘따라 정직하네요." · 담백하게: "직전 기록보다 늘었습니다."</p></div>`;
}
function readProfile(old) {
  const p = { ...(old || {}) };
  p.nick = $('#pNick').value.trim();
  p.sex = ($('input[name="pSex"]:checked') || {}).value || 'M';
  const by = num($('#pBirth').value); p.birthYear = by && by > 1900 && by < 2030 ? r0(by) : null;
  const ht = num($('#pHeight').value); if (!(ht >= 100 && ht <= 230)) return { err: '키를 100~230cm 사이로 입력해 주세요.' };
  p.height = Math.round(ht * 10) / 10;
  const tg = num($('#pTarget').value); p.targetWeight = tg && tg >= 30 && tg <= 200 ? Math.round(tg * 10) / 10 : null;
  const ex = num($('#pEx').value); p.exGoal = ex && ex >= 30 && ex <= 1000 ? r0(ex) : 150;
  p.tone = ($('input[name="pTone"]:checked') || {}).value || 'warm';
  if (!Array.isArray(p.annivs)) p.annivs = seedAnnivs();
  p.updatedAt = Date.now();
  return { p };
}
function storageText() {
  if (APP && !DEMO) return '이 휴대폰 안에만 저장됩니다. 앱을 지우거나 휴대폰을 바꾸면 기록이 사라지므로, 월 1회 백업 파일을 저장하세요. 저장 위치로 구글 드라이브를 고르면 휴대폰을 바꿔도 안전합니다.';
  if (DEMO) return '예시 모드입니다. 아무것도 저장되지 않습니다.';
  if (remote.state === 'on') return 'claude.ai 계정의 이 앱 전용 공간에 보관 중입니다. 본인만 볼 수 있고, 같은 앱을 쓰는 가족에게도 보이지 않습니다. 이 기기에도 사본이 있습니다.';
  if (remote.state === 'readonly') return '계정 저장 권한이 없어 이 기기 브라우저에만 저장 중입니다. 백업 파일을 정기적으로 받아 두세요.';
  if (remote.state === 'connecting') return '저장소에 연결하는 중입니다.';
  return '이 기기 브라우저에만 저장 중입니다. 브라우저 데이터를 지우면 기록이 사라지므로 백업 파일을 정기적으로 받아 두세요.';
}
function moreView() {
  const lb = S.meta.lastBackup;
  return `${banners()}
  ${journalTile()}
  ${setExtraTiles()}
  <section class="tile t-i">${tileHead('user', '내 정보')}<form class="entry" data-form="profile" novalidate>${profileFields(S.profile)}<div class="warnline" id="pWarn" hidden></div><button class="btn primary" type="submit">정보 저장</button></form></section>
  ${APP ? notifyTile() : ''}
  <section class="tile t-h">${tileHead('db', '데이터 보관')}<p class="note">${esc(storageText())}</p>
    <dl class="kv"><dt>전체 기록</dt><dd>${Object.keys(S.entries).length}건</dd><dt>마지막 백업</dt><dd>${lb ? fmtDT(lb) : '없음'}</dd></dl>
    <div class="row"><button class="btn" data-act="backup-json">백업 파일 저장</button><button class="btn" data-act="backup-csv">엑셀용 CSV 저장</button><button class="btn" data-act="import">백업 불러오기</button></div>
    <p class="note">백업 파일(JSON)은 휴대폰 교체 시 "백업 불러오기"로 그대로 복원됩니다.</p></section>
  <section class="tile t-r">${tileHead('doc', '진료용 리포트')}<p class="note">최근 30일 체중·혈압·운동·복약 요약입니다. 진료 때 화면을 보여 주거나 파일로 저장하세요.</p><button class="btn primary" data-act="tab" data-tab="report">리포트 보기</button></section>
  <section class="tile t-i">${tileHead('info', '판정 기준')}
    <h3>BMI · 대한비만학회 비만 진료지침 2022(8판)</h3>
    <div class="tbl-wrap"><table class="t"><tbody>${BMI.map((b, i) => `<tr><td>${pill(b)}</td><td>${i === 0 ? '18.5 미만' : i === BMI.length - 1 ? '35 이상' : BMI[i - 1].max + ' ~ ' + (b.max - 0.1).toFixed(1)}</td></tr>`).join('')}</tbody></table></div>
    <h3>혈압 · 대한고혈압학회 2022 진료지침 (진료실 혈압 기준)</h3>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>분류</th><th>수축기</th><th></th><th>이완기</th></tr></thead><tbody>
      <tr><td>${pill(BP[0])}</td><td>120 미만</td><td>그리고</td><td>80 미만</td></tr><tr><td>${pill(BP[1])}</td><td>120~129</td><td>그리고</td><td>80 미만</td></tr>
      <tr><td>${pill(BP[2])}</td><td>130~139</td><td>또는</td><td>80~89</td></tr><tr><td>${pill(BP[3])}</td><td>140~159</td><td>또는</td><td>90~99</td></tr>
      <tr><td>${pill(BP[4])}</td><td>160 이상</td><td>또는</td><td>100 이상</td></tr></tbody></table></div>
    <p class="note">가정혈압은 135/85mmHg 이상을 고혈압 기준으로 봅니다. 맥박 정상 범위 60~100회/분(Mayo Clinic), 산소포화도 대부분 95~100%(미 FDA 2021), 운동 권장량 주 150~300분(WHO 2020). 운동 소모량은 2024 Adult Compendium MET 값으로 계산한 추정치이며, 걷기(3.5)와 기타 종목의 MET는 추정값입니다.</p>
    <p class="note">이 앱은 기록과 참고용이며 진단이나 치료를 대신하지 않습니다.</p></section>
  ${DEMO ? '<button class="btn primary big" data-act="demo-exit">예시 끝내고 내 기록 시작</button>' : ''}`;
}
function reportData() {
  const to = Date.now(), from = to - 30 * DAY, inR = x => x.ts > from && x.ts <= to;
  const ws = list('w').filter(inR), vs = list('v').filter(inR), es = exList().filter(inR);
  const hs = list('h').filter(inR).filter(x => x.med != null);
  const a = arr => arr.length ? r0(avg(arr.map(x => x.s))) + '/' + r0(avg(arr.map(x => x.d))) : '-';
  const rows = [];
  rows.push(['기간', fmtD(from + DAY) + ' ~ ' + fmtD(to)]);
  if (ws.length) rows.push(['체중', `${f1(ws[0].w)} → ${f1(ws[ws.length - 1].w)}kg (${ws[ws.length - 1].w - ws[0].w >= 0 ? '+' : '−'}${f1(Math.abs(ws[ws.length - 1].w - ws[0].w))}), ${ws.length}회`]);
  if (ws.length && S.profile.height) rows.push(['BMI(최근)', f1(bmiOf(ws[ws.length - 1].w, S.profile.height))]);
  if (vs.length) {
    rows.push(['혈압 평균', a(vs) + ' mmHg, ' + vs.length + '회']);
    rows.push(['아침 평균', a(vs.filter(x => slotOf(x) === '아침'))]); rows.push(['저녁 평균', a(vs.filter(x => slotOf(x) === '저녁'))]);
    const mx = vs.reduce((p, x) => x.s > p.s ? x : p, vs[0]); rows.push(['최고', mx.s + '/' + mx.d + ' (' + fmtD(mx.ts) + ')']);
    rows.push(['135/85 이상 비율', r0(vs.filter(x => x.s >= 135 || x.d >= 85).length / vs.length * 100) + '%']);
    const pv = vs.filter(x => x.p).map(x => x.p); if (pv.length) rows.push(['맥박 평균', r0(avg(pv)) + '회/분']);
    const ov = vs.filter(x => x.o).map(x => x.o); if (ov.length) rows.push(['산소포화도 최저', Math.min(...ov) + '%']);
  }
  if (es.length) rows.push(['운동', `총 ${m1(es.reduce((t, x) => t + x.min, 0))}분, 주 평균 중강도 환산 ${r0(es.reduce((t, x) => t + modEq(x), 0) / (30 / 7))}분`]);
  if (hs.length) rows.push(['복약', `${hs.filter(x => x.med).length}/${hs.length}일 복용`]);
  const daily = [];
  for (let i = 0; i < 30; i++) {
    const d = addDays(sod(to), -i), dk = dayKey(d), dv = vs.filter(x => dayKey(x.ts) === dk), dw = ws.filter(x => dayKey(x.ts) === dk);
    if (!dv.length && !dw.length) continue;
    const am = dv.filter(x => slotOf(x) === '아침'), pm = dv.filter(x => slotOf(x) !== '아침');
    daily.push([fmtD(d), am.length ? a(am) : '', pm.length ? a(pm) : '', dw.length ? f1(avg(dw.map(x => x.w))) : '']);
  }
  return { rows, daily };
}
function reportView() {
  const { rows, daily } = reportData();
  return `<section class="tile t-r">${tileHead('doc', '진료용 리포트 · 최근 30일', `<span class="when">${esc(S.profile.nick || '')}</span>`)}
    ${rows.length > 1 ? `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '<p class="empty">최근 30일 기록이 없습니다.</p>'}
    ${daily.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>날짜</th><th>아침 혈압</th><th>저녁·기타 혈압</th><th>체중</th></tr></thead><tbody>${daily.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
    <p class="note">혈압 분류 기준: 대한고혈압학회 2022 진료지침. 가정에서 측정한 값입니다.</p>
    <div class="row"><button class="btn primary" data-act="report-copy">요약 복사</button><button class="btn primary" data-act="report-save">파일로 저장 (.html)</button><button class="btn" data-act="tab" data-tab="set">돌아가기</button></div>
    <textarea id="copyBox" class="copybox" rows="8" hidden aria-label="복사할 요약"></textarea></section>`;
}
function reportHtml() {
  const { rows, daily } = reportData();
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>건강지키미 리포트 ${dayKey(Date.now())}</title><style>body{font-family:sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#17201C}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:14px}th{background:#f0f2ef}p{font-size:12px;color:#555}</style></head><body><h1>건강지키미 리포트 · ${esc(S.profile.nick || '')} · 최근 30일</h1><table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>${daily.length ? `<table><tr><th>날짜</th><th>아침 혈압</th><th>저녁·기타 혈압</th><th>체중(kg)</th></tr>${daily.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>` : ''}<p>가정 측정값. 혈압 분류 기준 대한고혈압학회 2022 진료지침, BMI 기준 대한비만학회 2022. 작성일 ${dayKey(Date.now())}</p></body></html>`;
}

/* ───────── 첫 화면 / 예시 ───────── */
function onboardView() {
  return `<div class="onb"><h2 class="disp">오늘 숫자 하나로 지키는 우리 부부 건강</h2>
    <p class="lead">체중과 혈압은 직전 값이 미리 채워져 있어 차이만 조정하면 됩니다. 500g 이상 오르내리면 한마디 건넵니다.</p>
    <section class="tile t-i"><form class="entry" data-form="onboard" novalidate>${profileFields(null)}<div class="warnline" id="pWarn" hidden></div><button class="btn primary big" type="submit">시작하기</button></form></section>
    <button class="btn" data-act="demo">예시 데이터로 먼저 둘러보기</button>
    <p class="note">${APP ? '기록은 이 휴대폰 안에만 저장되며 다른 사람에게 전송되지 않습니다.' : '기록은 본인 계정 전용 공간과 이 기기에 저장되며, 배우자를 포함한 다른 사람에게 보이지 않습니다.'}</p></div>`;
}
function demoState() {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const st = blank();
  st.profile = { nick: '예시', sex: 'M', birthYear: 1965, height: 172, targetWeight: 71, exGoal: 150, tone: 'build', updatedAt: Date.now(), annivs: seedAnnivs() };
  const add = e => { e.u = e.ts; st.entries[e.id] = e; };
  for (let i = 70; i >= 0; i--) {
    const d = sod(addDays(Date.now(), -i));
    const base = 74.6 - (70 - i) * 0.03;
    if (rnd() > 0.12) add({ id: 'w' + i, t: 'w', ts: d + 7 * 3600e3 + rnd() * 1800e3, w: Math.round((base + (rnd() - 0.5) * 0.9) * 10) / 10 });
    const bs = 134 - (70 - i) * 0.12, bd = 86 - (70 - i) * 0.07;
    if (rnd() > 0.15) add({ id: 'va' + i, t: 'v', ts: d + 7.3 * 3600e3, s: r0(bs + (rnd() - 0.5) * 10), d: r0(bd + (rnd() - 0.5) * 7), p: r0(70 + (rnd() - 0.5) * 10), o: r0(96 + rnd() * 2.4), arm: 'L', med: 'before' });
    if (rnd() > 0.35) add({ id: 'vp' + i, t: 'v', ts: d + 22 * 3600e3, s: r0(bs - 4 + (rnd() - 0.5) * 10), d: r0(bd - 3 + (rnd() - 0.5) * 7), p: r0(66 + (rnd() - 0.5) * 10), arm: 'L', med: 'after' });
    const r = rnd();
    if (r < 0.22) add({ id: 'e' + i, t: 'e', ts: d + 18 * 3600e3, k: 'bike', min: 40 + r0(rnd() * 20), km: Math.round((12 + rnd() * 6) * 10) / 10, int: 2, met: 7.0 });
    else if (r < 0.36) add({ id: 'e' + i, t: 'e', ts: d + 19 * 3600e3, k: 'golfp', min: 60, int: 2, met: 3.5 });
    else if (r < 0.48) add({ id: 'e' + i, t: 'e', ts: d + 6.5 * 3600e3, k: 'sjog', min: 30 + r0(rnd() * 15), km: Math.round((3 + rnd() * 1.5) * 10) / 10, int: 2, met: 3.3 });
    else if (r < 0.58) add({ id: 'e' + i, t: 'e', ts: d + 20 * 3600e3, k: 'yoga', min: 40, int: 2, met: 2.7 });
    if (i < 14) { const meds = { '아침 약': true }; if (rnd() > 0.2) meds['저녁 약'] = true; if (rnd() > 0.3) meds['영양제'] = true; add({ id: 'h-' + dayKey(d), t: 'h', ts: d + 12 * 3600e3, meds, med: Object.keys(meds).length === 3, sleep: Math.round((6 + rnd() * 1.5) * 2) / 2, cond: ['good', 'ok', 'tired'][Math.floor(rnd() * 3)], water: 4 + r0(rnd() * 4), steps: 5000 + r0(rnd() * 6000) }); }
  }
  add({ id: 'j1', t: 'j', ts: Date.now() - 3 * DAY, cat: 'goal', text: '이번 달은 저녁 야식 없이 71kg까지 가 보자' });
  add({ id: 'j2', t: 'j', ts: Date.now() - DAY, cat: 'meal', text: '점심 비빔밥 반 공기, 저녁 산책 40분' });
  st.meta.cards = [{ kind: 'good', title: '예시, −0.6kg', text: '작은 공정이 모여 준공이 됩니다.', at: Date.now() - 2 * DAY }, { kind: 'warn', title: '예시, +0.7kg', text: '공정으로 치면 경미한 지연입니다. 저녁 산책 30분이면 만회됩니다.', at: Date.now() - 4 * DAY }];
  return st;
}

/* ───────── 저장 동작 ───────── */
function warn(id, text) { const el = $('#' + id); if (el) { el.textContent = text; el.hidden = false; el.scrollIntoView({ block: 'nearest' }); } }
function afterSave(card, okText) {
  if (card) { S.meta.lastCard = { ...card, at: Date.now() }; S.meta.cards = [S.meta.lastCard, ...(S.meta.cards || [])].slice(0, 200); persist(null); }
  ui.pending = null;
  render(); window.scrollTo(0, 0);
  if (card) openSheet(card); else toast(okText);
}
function saveWeight() {
  const w = num($('#wIn').value);
  if (!(w >= 20 && w <= 250)) return warn('wWarn', '체중은 20~250kg 사이 숫자로 입력해 주세요.');
  const ts = $('#wTs') ? fromInput($('#wTs').value) : Date.now(), prev = latestBefore('w', ts), key = 'w' + w + ts;
  if (prev && Math.abs(w - prev.w) >= 3 && ui.pending !== key) { ui.pending = key; return warn('wWarn', `직전 기록(${f1(prev.w)}kg)과 3kg 이상 차이 납니다. 값이 맞으면 저장을 한 번 더 누르세요.`); }
  const e = { id: newId('w'), t: 'w', ts, u: Date.now(), w: Math.round(w * 10) / 10 };
  const waist = $('#wWaist') ? num($('#wWaist').value) : null; if (waist && waist > 40 && waist < 200) e.waist = Math.round(waist * 10) / 10;
  const memo = $('#wMemo').value.trim(); if (memo) e.memo = memo;
  S.entries[e.id] = e;
  const card = weightMessage(e) || streakCard(e.ts);
  persist(e.ts); afterSave(card, '체중을 저장했습니다');
}
function saveVitals() {
  const s = num($('#vS').value), d = num($('#vD').value), p = num($('#vP').value), o = num($('#vO').value);
  if (!(s >= 60 && s <= 260 && d >= 30 && d <= 160)) return warn('vWarn', '수축기 60~260, 이완기 30~160 사이로 입력해 주세요.');
  if (s <= d) return warn('vWarn', '수축기 값은 이완기보다 커야 합니다.');
  if (p != null && !(p >= 30 && p <= 220)) return warn('vWarn', '맥박은 30~220 사이로 입력하거나 비워 두세요.');
  if (o != null && !(o >= 70 && o <= 100)) return warn('vWarn', '산소포화도는 70~100 사이로 입력하거나 비워 두세요.');
  const ts = $('#vTs') ? fromInput($('#vTs').value) : Date.now(), prev = latestBefore('v', ts), key = 'v' + s + '/' + d + ts;
  if (prev && Math.abs(s - prev.s) >= 40 && ui.pending !== key) { ui.pending = key; return warn('vWarn', `직전 기록(${prev.s}/${prev.d})과 수축기가 40 이상 차이 납니다. 값이 맞으면 저장을 한 번 더 누르세요.`); }
  const e = { id: newId('v'), t: 'v', ts, u: Date.now(), s: r0(s), d: r0(d), arm: ($('input[name="vArm"]:checked') || {}).value || 'L', med: ($('input[name="vMed"]:checked') || {}).value || 'none' };
  if (p) e.p = r0(p); if (o) e.o = r0(o);
  const sl = ($('input[name="vSlot"]:checked') || {}).value; if (sl) e.slot = sl;
  const memo = $('#vMemo').value.trim(); if (memo) e.memo = memo;
  S.entries[e.id] = e;
  const card = vitalsMessage(e) || streakCard(e.ts);
  persist(e.ts); afterSave(card, '혈압을 저장했습니다');
}
function saveEx() {
  const k = ($('input[name="exK"]:checked') || {}).value || 'bike', int = intOf(k), min = getV('eMin');
  let sec = 0, steps = 0, reps = 0;
  if (k === 'walk') {
    steps = r0(getV('eSteps') || 0);
    if (!(steps >= STEP_MIN && steps <= STEP_MAX)) return warn('eWarn', '걸음 수는 3천~25천(3,000~25,000) 사이로 입력해 주세요.');
  } else if (k === 'stretch') {
    reps = r0(getV('eReps') || 0);
    if (!(reps >= REP_MIN && reps <= REP_MAX)) return warn('eWarn', '스트레칭은 5~100번 사이로 입력해 주세요.');
  } else if (k === 'bar') {
    sec = r0(getV('eSec') || 0);
    if (!(sec >= HANG_MIN && sec <= HANG_MAX)) return warn('eWarn', '매달린 시간은 30초~3분 사이로 입력해 주세요.');
  } else if (!(min >= 1 && min <= 600)) return warn('eWarn', '운동 시간은 1~600분 사이로 입력해 주세요.');
  const e = { id: newId('e'), t: 'e', ts: fromInput($('#eTs').value), u: Date.now(), k, min: k === 'bar' ? Math.round(sec / 60 * 10) / 10 : k === 'walk' ? Math.max(1, r0(steps / STEPS_PER_MIN)) : k === 'stretch' ? Math.max(1, r0(reps * REP_SEC / 60)) : r0(min), int, met: metOf(k, int) };
  if (k === 'bar') e.sec = sec;
  if (k === 'walk') e.steps = steps;
  if (k === 'stretch') e.reps = reps;
  const km = num($('#eKm').value); if (exOf(k).dist && km) e.km = Math.round(km * 10) / 10;
  const memo = k === 'bike' && $('#eMemo') ? $('#eMemo').value.trim() : ''; if (memo) e.memo = memo;
  S.entries[e.id] = e;
  const card = exMessage(e) || streakCard(e.ts);
  persist(e.ts); afterSave(card, '운동을 저장했습니다');
}
function upsertHabit(dk, patch) {
  const id = 'h-' + dk, ex = S.entries[id] || { id, t: 'h', ts: new Date(dk + 'T12:00').getTime() };
  Object.assign(ex, patch, { u: Date.now() }); S.entries[id] = ex; delete S.deleted[id]; persist(ex.ts);
}
function deleteEntry(id) { const e = S.entries[id]; if (!e) return; delete S.entries[id]; S.deleted[id] = Date.now(); ui.confirmDel = null; persist(e.ts); render(); toast('삭제했습니다'); }

/* 파일 */
async function saveFile(filename, data) {
  if (APP) {
    const ext = filename.split('.').pop(), mime = { json: 'application/json', csv: 'text/csv', html: 'text/html' }[ext] || 'text/plain';
    const id = 's' + Date.now();
    return new Promise(res => { (window.__saveCbs = window.__saveCbs || {})[id] = ok => { if (!ok) toast('저장을 취소했습니다'); res(ok); }; window.Android.saveFile(id, filename, mime, String(data)); });
  }
  const dl = (window.claude && window.claude.use) ? await window.claude.use('downloads') : null;
  if (!dl) { toast('이 화면에서는 파일 저장을 쓸 수 없습니다'); return false; }
  try { await dl.save({ filename, data }); return true; }
  catch (err) { toast(err && err.code === 'declined' ? '저장을 취소했습니다' : err && err.code === 'rate_limited' ? '잠시 뒤 다시 시도해 주세요' : '파일을 저장하지 못했습니다'); return false; }
}
async function backupJson() {
  const data = JSON.stringify({ app: 'krhealth', v: 1, exportedAt: Date.now(), profile: S.profile, entries: Object.values(S.entries), deleted: S.deleted, meta: S.meta }, null, 1);
  if (await saveFile(`건강지키미-백업-${(S.profile?.nick || '').replace(/[^\w가-힣]/g, '')}-${dayKey(Date.now())}.json`, data)) {
    if (!DEMO) { S.meta.lastBackup = Date.now(); persist(null); }
    toast('백업 파일을 저장했습니다'); render();
  }
}
async function backupCsv() {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ['종류', '일시', '시간대', '체중kg', '허리cm', '수축기', '이완기', '맥박', '산소포화도', '팔', '혈압약', '운동', '시간분', '거리km', '공수', '강도', 'MET', '복약', '수면h', '물잔', '걸음', '메모'];
  const rows = Object.values(S.entries).sort((a, b) => a.ts - b.ts).map(e => {
    const d = new Date(e.ts), dt = dayKey(e.ts) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    const t = { w: '체중', v: '혈압', e: '운동', h: '생활', j: '일지' }[e.t];
    return [t, dt, e.t === 'h' ? '' : slotOf(e), e.w, e.waist, e.s, e.d, e.p, e.o, e.arm ? (e.arm === 'R' ? '오른팔' : '왼팔') : '', e.t === 'v' ? ({ before: '복용 전', after: '복용 후', none: '' }[e.med] || '') : '', e.t === 'e' ? exOf(e.k).n : '', e.min, e.km, e.balls, e.int ? INT[e.int] : '', e.met, e.t === 'h' && e.med != null ? (e.med ? 'Y' : 'N') : '', e.sleep, e.water, e.steps, (e.sec ? (e.sets > 1 ? `매달리기 ${e.sets}세트×${e.sec}초` : `매달리기 ${e.sec}초`) + (e.memo ? ' / ' + e.memo : '') : e.steps ? `걸음 ${e.steps}보` + (e.memo ? ' / ' + e.memo : '') : e.reps ? `스트레칭 ${e.reps}번` + (e.memo ? ' / ' + e.memo : '') : '') || e.memo || e.text || (e.meds ? Object.keys(e.meds).join(' ') : '')].map(q).join(',');
  });
  if (await saveFile(`건강지키미-${dayKey(Date.now())}.csv`, '﻿' + [head.join(','), ...rows].join('\r\n'))) toast('CSV 파일을 저장했습니다');
}
function importFile(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const o = JSON.parse(fr.result);
      if (!o || o.app !== 'krhealth' || !Array.isArray(o.entries)) throw new Error('형식');
      const inc = blank(); inc.profile = o.profile || null; inc.deleted = o.deleted || {}; inc.meta = Object.assign(inc.meta, o.meta || {});
      o.entries.forEach(e => { if (e && e.id && e.t && isFinite(e.ts)) inc.entries[e.id] = e; });
      if (DEMO) { toast('예시 모드에서는 불러올 수 없습니다'); return; }
      const before = Object.keys(REAL.entries).length;
      REAL = merge(REAL, inc); S = REAL;
      Object.values(REAL.entries).forEach(e => dirty.months.add(monthKey(e.ts)));
      persist(null); render();
      toast(`${Math.max(0, Object.keys(REAL.entries).length - before)}건을 새로 불러왔습니다`);
    } catch (err) { toast('건강지키미 백업 파일이 아닙니다'); }
  };
  fr.readAsText(file);
}

/* ───────── 시트·토스트 ───────── */
let toastTimer = null;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }
function openSheet(card) { $('#sheetBody').innerHTML = cardBlock(card); $('#sheet').hidden = false; $('#sheet .btn').focus(); }
function closeSheet() { $('#sheet').hidden = true; }

/* ───────── 라우터 ───────── */
function render() {
  const v = $('#view'), nav = $('.tabs');
  const d = new Date();
  $('#today').textContent = `${d.getMonth() + 1}.${d.getDate()} (${WD[d.getDay()]})`;
  $('#hello').textContent = S.profile && S.profile.nick ? S.profile.nick + '의 건강지키미' : '건강지키미';
  if (S.profile && !Array.isArray(S.profile.annivs)) { S.profile.annivs = seedAnnivs(); S.profile.updatedAt = Date.now(); if (S === REAL && !DEMO) persist(null); }
  if (!S.profile) {
    nav.hidden = true;
    v.innerHTML = (remote.state === 'connecting' && !bootTimedOut) ? '<p class="loading">기록을 불러오는 중…</p>' : onboardView();
    return;
  }
  nav.hidden = false;
  if (!['rec', 'pp', 'ex', 'ann', 'set', 'report', 'life'].includes(ui.tab)) ui.tab = 'rec';
  const cur = { report: 'set', life: 'set' }[ui.tab] || ui.tab;
  $$('.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === cur ? 'page' : 'false'));
  const ppOn = ui.tab === 'pp' && APP && !!window.Android.ppShow;
  if (ppOn) { ppShow(); return; } ppHide();
  ppSyncCache();
  v.innerHTML = ui.tab === 'rec' ? recView() : ui.tab === 'pp' ? ppView() : ui.tab === 'ex' ? exView() : ui.tab === 'ann' ? calView() : ui.tab === 'report' ? reportView() : ui.tab === 'life' ? lifeView() : moreView();
  updatePreviews();
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'tab') { ui.tab = b.dataset.tab; ui.confirmDel = null; render(); window.scrollTo(0, 0); }
  else if (a === 'go-log') { const sub = b.dataset.sub; ui.tab = sub === 'e' ? 'ex' : sub === 'h' ? 'life' : 'rec'; if (sub === 'w' || sub === 'v') ui.quick = sub; render(); window.scrollTo(0, 0); }
  else if (a === 'logtab') { ui.logTab = b.dataset.v; ui.pending = null; render(); }
  else if (a === 'metric') { ui.metric = b.dataset.v; ui.confirmDel = null; render(); }
  else if (a === 'period') { ui.period = b.dataset.v; ui.offset = 0; ui.confirmDel = null; render(); }
  else if (a === 'prev') { ui.offset--; render(); }
  else if (a === 'next') { if (ui.offset < 0) ui.offset++; render(); }
  else if (a === 'step') {
    const inp = $('#' + b.dataset.for); const dec = +inp.dataset.dec || 0, st = parseFloat(b.dataset.step);
    let v = inp.dataset.fmt ? +inp.dataset.v : num(inp.value); if (v == null) { const bs = num(inp.dataset.base); v = bs != null ? bs : +inp.dataset.min; } else v = v + st;
    v = Math.min(+inp.dataset.max, Math.max(+inp.dataset.min, v));
    if (inp.dataset.fmt) setV(inp.id, Math.round(v)); else inp.value = dec ? v.toFixed(dec) : String(Math.round(v));
    ui.pending = null; updatePreviews();
  }
  else if (a === 'cal-prev') { ui.calM--; if (ui.calM < 0) { ui.calM = 11; ui.calY--; } render(); }
  else if (a === 'cal-next') { ui.calM++; if (ui.calM > 11) { ui.calM = 0; ui.calY++; } render(); }
  else if (a === 'cal-today') { const n = new Date(); ui.calY = n.getFullYear(); ui.calM = n.getMonth(); ui.calSel = null; render(); }
  else if (a === 'cal-day') { ui.calSel = b.dataset.d; render(); }
  else if (a === 'ann-del') { ui.confirmAnn = b.dataset.id; render(); }
  else if (a === 'ann-del-no') { ui.confirmAnn = null; render(); }
  else if (a === 'ann-del-yes') { const id = b.dataset.id; S.profile.annivs = annivs().filter(x => x.id !== id); S.profile.updatedAt = Date.now(); ui.confirmAnn = null; persist(null); scheduleAll(); render(); toast('기념일을 삭제했습니다'); }
  else if (a === 'notify-test') { window.Android && window.Android.requestNotify(); window.Android && window.Android.testNotify(); toast('시험 알림을 보냈습니다'); }
  else if (a === 'kpi') { ui.tab = 'rec'; render(); window.scrollTo(0, 0); }
  else if (a === 'yr') { const id = b.dataset.v; ui.yr = ui.yr || {}; ui.yr[id] = !ui.yr[id]; render(); const el = document.getElementById(id); if (el) el.scrollIntoView({ block: 'nearest' }); const nb = el && el.querySelector('[data-act=yr]'); if (nb) nb.focus({ preventScroll: true }); }
  else if (a === 'goto') { const el = document.getElementById(b.dataset.v); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  else if (a === 'pp-link') { const raw = ($('#ppLinkIn').value || '').trim(), m = raw.match(/#\S*gas=\S+/), l = m ? m[0] : ''; let d = l; try { d = decodeURIComponent(l); } catch (e) { } if (!/gas=https:\/\/script\.google\.com\//.test(d)) { toast('탁구사랑클럽 연결 링크가 아닙니다'); return; } try { localStorage.setItem(PP_LINK, l); } catch (e) { } ui.tab = 'pp'; render(); }
  else if (a === 'ann-export') annExport();
  else if (a === 'ann-import') $('#annFile').click();
  else if (a === 'quick') { ui.quick = b.dataset.v; ui.pending = null; render(); }
  else if (a === 'restore') { $$(b.dataset.f === 'w' ? '#wIn' : '#vS,#vD,#vP,#vO').forEach(i => { i.value = i.dataset.prev; }); ui.pending = null; updatePreviews(); }
  else if (a === 'dur') { setV('eMin', b.dataset.v); updatePreviews(); }
  else if (a === 'setv') { setV(b.dataset.for, b.dataset.v); updatePreviews(); }
  else if (a === 'exf') { ui.exF = b.dataset.v; render(); }
  else if (a === 'jf') { ui.jf = b.dataset.v; render(); }
  else if (a === 'med') toggleMed(b.dataset.d, b.dataset.m);
  else if (a === 'cup') { const dk = b.dataset.d, n = +b.dataset.n, cur = (S.entries['h-' + dk] || {}).water || 0; setWater(dk, n === cur ? n - 1 : n); }
  else if (a === 'water') { const dk = b.dataset.d; setWater(dk, ((S.entries['h-' + dk] || {}).water || 0) + (+b.dataset.v)); }
  else if (a === 'med-add') { const n = $('#newMed').value.trim(); if (!n) { toast('약 이름을 입력해 주세요'); return; } if (medList().includes(n)) { toast('이미 있는 항목입니다'); return; } S.profile.meds = [...medList(), n]; S.profile.updatedAt = Date.now(); persist(null); render(); toast(n + '을(를) 추가했습니다'); }
  else if (a === 'med-edit') { ui.medEdit = !ui.medEdit; render(); }
  else if (a === 'med-del') { const m = b.dataset.m; S.profile.meds = medList().filter(x => x !== m); S.profile.updatedAt = Date.now(); persist(null); render(); }
  else if (a === 'hab-save') saveHabit(b.dataset.d);
  else if (a === 'cal-jump') { const d = b.dataset.d, dt = new Date(d + 'T00:00'); ui.tab = 'ann'; ui.calY = dt.getFullYear(); ui.calM = dt.getMonth(); ui.calSel = d; render(); window.scrollTo(0, 0); }
  else if (a === 'report-copy') { const { rows, daily } = reportData(); copyText(`[건강지키미 진료용 요약] ${S.profile.nick || ''}\n` + rows.map(([k, v]) => `${k}: ${v}`).join('\n') + (daily.length ? '\n\n날짜 | 아침 혈압 | 저녁·기타 혈압 | 체중\n' + daily.map(r => r.join(' | ')).join('\n') : '') + '\n(가정 측정값 · 혈압 분류: 대한고혈압학회 2022)'); }
  else if (a === 'del') { ui.confirmDel = b.dataset.id; render(); }
  else if (a === 'del-no') { ui.confirmDel = null; render(); }
  else if (a === 'del-yes') deleteEntry(b.dataset.id);
  else if (a === 'sheet-close') closeSheet();
  else if (a === 'hab-med') { const dk = dayKey(Date.now()), was = !!(S.entries['h-' + dk] || {}).med; upsertHabit(dk, { med: !was }); render(); toast(was ? '복약 체크를 해제했습니다' : '복약을 기록했습니다'); }
  else if (a === 'hab-water') { const dk = dayKey(Date.now()), hb = S.entries['h-' + dk] || {}; upsertHabit(dk, { water: (hb.water || 0) + 1 }); render(); }
  else if (a === 'backup-json') backupJson();
  else if (a === 'backup-csv') backupCsv();
  else if (a === 'import') $('#importFile').click();
  else if (a === 'report-save') saveFile(`건강리포트-${dayKey(Date.now())}.html`, reportHtml()).then(ok => ok && toast('리포트를 저장했습니다'));
  else if (a === 'demo') { DEMO = true; S = demoState(); ui.tab = 'rec'; render(); window.scrollTo(0, 0); }
  else if (a === 'demo-exit') { DEMO = false; S = REAL; ui.tab = 'rec'; render(); window.scrollTo(0, 0); }
});
$('#sheet').addEventListener('click', ev => { if (ev.target.id === 'sheet') closeSheet(); });
document.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('li[data-act]')) { ev.preventDefault(); ev.target.click(); return; } if (ev.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
document.addEventListener('input', ev => { if (ev.target.matches('#wIn,#wTs,#vS,#vD,#vP,#vO,#vTs,#hSleep')) { ui.pending = null; updatePreviews(); } });
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.name === 'exK') {
    const x = exOf(t.value); $('#eDistRow').hidden = !x.dist; $('#eMinRow').hidden = !!(x.hang || x.steps || x.reps); $('#eMemoRow').hidden = t.value !== 'bike'; $('#eHangRow').hidden = !x.hang; $('#eStepRow').hidden = !x.steps; $('#eRepRow').hidden = !x.reps;
    const le = list('e').filter(e => e.k === t.value).slice(-1)[0];
    if (x.hang) setV('eSec', lastVal('bar'));
    else if (x.steps) setV('eSteps', lastVal('walk'));
    else if (x.reps) setV('eReps', lastVal('stretch'));
    else setV('eMin', lastVal(t.value)); $('#eKm').value = le && le.km ? le.km : ''; $('#eKm').dataset.prev = $('#eKm').value;
    updatePreviews();
  } else if (t.name === 'vSlot' || t.id === 'vTs' || t.id === 'wTs') updatePreviews();
  else if (t.id === 'hDate') { ui.habDate = t.value; render(); }
  else if (t.matches && t.matches('select.ann-pre')) { const a = annivs().find(x => x.id === t.dataset.id); if (a) { a.pre = +t.value; S.profile.updatedAt = Date.now(); persist(null); scheduleAll(); toast(`${a.n}: ${preTxt(a.pre)} 알림으로 바꿨습니다`); } }
  else if (t.id === 'annFile') { if (t.files && t.files[0]) annImport(t.files[0]); t.value = ''; }
  else if (t.id === 'importFile') { if (t.files && t.files[0]) importFile(t.files[0]); t.value = ''; }
});
document.addEventListener('submit', ev => {
  ev.preventDefault();
  const f = ev.target.dataset.form;
  if (f === 'anniv') { saveAnniv(); scheduleAll(); return; }
  if (f === 'journal') return saveJournal();
  if (f === 'notify') return saveNotify();
  if (f === 'w') saveWeight(); else if (f === 'v') saveVitals(); else if (f === 'e') saveEx(); else if (f === 'h') saveHabit();
  else if (f === 'profile' || f === 'onboard') {
    const r = readProfile(f === 'profile' ? S.profile : null);
    if (r.err) return warn('pWarn', r.err);
    if (DEMO && f === 'onboard') { DEMO = false; S = REAL; }
    S.profile = r.p; persist(null);
    if (APP) { if (f === 'onboard') window.Android.requestNotify(); scheduleAll(); }
    if (f === 'onboard') { ui.tab = 'rec'; ui.quick = 'w'; render(); toast('반갑습니다. 첫 체중을 기록해 보세요'); }
    else { render(); toast('정보를 저장했습니다'); }
  }
});

/* ───────── 시작 ───────── */
try { ppSyncCache(); } catch (e) { }
render();
setTimeout(() => { bootTimedOut = true; if (!S.profile) render(); }, APP ? 0 : 3000);
initRemote();
if (APP) setTimeout(scheduleAll, 500);
})();
