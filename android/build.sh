#!/bin/bash
# 탁구사랑(건강지키미) 갤럭시 앱(APK) 빌드 — Gradle 없이 Ubuntu 패키지만으로 빌드
#   준비: sudo apt install openjdk-21-jdk-headless aapt zipalign apksigner dalvik-exchange libandroid-23-java nodejs npm python3
#         (이 폴더에서) npm ci 또는 npm install
#   실행: VCODE=6 VNAME=1.5 ./build.sh   → out/healthguard.apk
#   서명키: ../signing/healthguard-release.jks, 비밀번호 ../signing/ks-pass.txt (별도 보관본을 풀어 둘 것)
set -euo pipefail
export LC_ALL=C.UTF-8 LANG=C.UTF-8   # 한글 폴더 경로에서도 javac·dx 가 동작하도록
ROOT=$(cd "$(dirname "$0")" && pwd)
WEB=${WEB:-$ROOT/../web}
PP=${PP:-$ROOT/../pingpong}          # 탁구사랑클럽 원본(GitHub pingpong 저장소 루트)
P=$ROOT
OUT=$ROOT/out
JAR=${JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
KS=${KS:-$ROOT/../signing/healthguard-release.jks}
KSPASS=${KSPASS:-$ROOT/../signing/ks-pass.txt}
rm -rf "$OUT" "$P/assets" && mkdir -p "$OUT"/{gen,classes} "$P/assets/fonts"

# 1) 웹 자산: 글꼴을 앱에 내장(인터넷 없이 동작)
python3 - "$ROOT" "$WEB" "$P/assets" <<'EOF'
import sys, re, shutil, os
root, web, assets = sys.argv[1:]
fs = root + '/node_modules/@fontsource'
css = []
for pkg, weights in [('ibm-plex-sans-kr', ['400', '600', '700']), ('jua', ['400'])]:
    for w in weights:
        t = open(f'{fs}/{pkg}/{w}.css').read()
        for f in set(re.findall(r'url\(\./files/([^)]+\.woff2)\)', t)):
            shutil.copy(f'{fs}/{pkg}/files/{f}', f'{assets}/fonts/{f}')
        t = re.sub(r"url\(\./files/([^)]+\.woff2)\) format\('woff2'\), url\(\./files/[^)]+\.woff\) format\('woff'\)", r"url(fonts/\1) format('woff2')", t)
        css.append(t)
open(f'{assets}/fonts.css', 'w').write('\n'.join(css))
html = open(f'{web}/app.html').read()
html = re.sub(r'<link rel="preconnect"[^>]*>\n', '', html)
html = re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^>]*>', '<link rel="stylesheet" href="fonts.css">', html)
assert 'googleapis' not in html
js = open(f'{web}/app.js').read()
pv = f'{root}/../private/anniv.js'   # 가족 기념일(비공개 파일, 저장소에 올리지 않음)
if os.path.exists(pv):
    js = js.replace('const DEFAULT_ANNIV = [];', 'const DEFAULT_ANNIV = ' + open(pv, encoding='utf-8').read().strip() + ';', 1)
    print('private/anniv.js 적용')
html = html.replace('/*__APP_JS__*/', js)
doc = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
       '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
       '<style>body{margin:0}img{max-width:100%}</style></head><body>' + html + '</body></html>')
open(f'{assets}/index.html', 'w').write(doc)
print('assets ok', len(os.listdir(assets + '/fonts')), 'font files')
EOF

# 1-b) 탁구사랑클럽(pingpong) 원본을 그대로 assets/pingpong 에 내장 — 인터넷 없이도 화면이 뜨도록 최소 패치
mkdir -p "$P/assets/pingpong"
cp "$PP/index.html" "$PP/manifest.webmanifest" "$PP"/icon-*.png "$P/assets/pingpong/"
cp "$ROOT/node_modules/chart.js/dist/chart.umd.js" "$P/assets/pingpong/chart.umd.js"
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > "$OUT/tw.in.css"
(cd "$ROOT" && npx tailwindcss --content "$PP/index.html" -i "$OUT/tw.in.css" -o "$P/assets/pingpong/tailwind.css" --minify 2>&1 | tail -1)
python3 - "$P/assets/pingpong/index.html" <<'EOF2'
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert a in s, 'patch target missing: ' + a[:60]
    s = s.replace(a, b, 1)
# 글꼴·차트: 로컬 파일 우선, 인터넷 되면 Tailwind Play CDN 이 동적 클래스를 보충
rep('<script src="https://cdn.tailwindcss.com"></script>', '<link rel="stylesheet" href="tailwind.css">\n<script src="https://cdn.tailwindcss.com" async></script>')
rep('<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js"></script>', '<script src="chart.umd.js"></script>')
# 연결 링크는 항상 GitHub Pages 주소 기준(앱 내부 file:// 주소는 다른 폰에서 열 수 없음)
rep('return `${location.origin}${location.pathname}#${p.toString()}`;', "return `${/^https?:$/.test(location.protocol) ? location.origin + location.pathname : 'https://krwonhochoi-spec.github.io/pingpong/'}#${p.toString()}`;")
# 갤럭시 앱 안에서는 파일 저장·복사를 앱 기능으로 처리
rep('function download(name, text, mime) {', "function download(name, text, mime) {\n  if (window.Android && window.Android.saveFile) { window.Android.saveFile('pp' + Date.now(), name, mime, text); return; }")
rep("if (navigator.share) { await navigator.share(", "if (window.Android && window.Android.copyText) { window.Android.copyText(link); toast('연결 링크를 복사했습니다 — 상대방에게 보내 주세요', 'ok'); return; }\n      if (navigator.share) { await navigator.share(")
# 앱 안에서 '연결 링크'를 받으면(주소 # 뒷부분만 바뀜) 바로 시트 연결 확인창을 띄움
rep('async function applyConnectLink() {', "window.addEventListener('hashchange', () => applyConnectLink());\nasync function applyConnectLink() {")
open(p, 'w').write(s)
print('pingpong patched', len(s))
EOF2

# 2) 리소스 패키징 + R.java
aapt package -f -m -J "$OUT/gen" -M "$P/AndroidManifest.xml" -S "$P/res" -A "$P/assets" -I "$JAR" -F "$OUT/app.unsigned.apk" --version-code "${VCODE:-1}" --version-name "${VNAME:-1.0}"

# 3) 자바 컴파일 → DEX
javac -nowarn --release 8 -encoding UTF-8 -cp "$JAR" -d "$OUT/classes" $(find "$P/src" "$OUT/gen" -name '*.java') 2>&1 | grep -v "^warning" || true
dalvik-exchange --dex --min-sdk-version=26 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q -u app.unsigned.apk classes.dex)

# 4) 정렬·서명
zipalign -f -p 4 "$OUT/app.unsigned.apk" "$OUT/app.aligned.apk"
apksigner sign --ks "$KS" --ks-key-alias healthguard --ks-pass "pass:$(cat "$KSPASS")" --key-pass "pass:$(cat "$KSPASS")" --out "$OUT/healthguard.apk" "$OUT/app.aligned.apk"
apksigner verify --print-certs "$OUT/healthguard.apk" | head -3
ls -la "$OUT/healthguard.apk"
