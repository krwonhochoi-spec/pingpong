# 웹 버전 만들기: app.html 안의 /*__APP_JS__*/ 자리에 app.js 를 넣어 dist/health.html 한 파일로 만듦
import os
here = os.path.dirname(os.path.abspath(__file__))
js = open(f'{here}/app.js', encoding='utf-8').read()
pv = f'{here}/../private/anniv.js'   # 가족 기념일(비공개 파일, 저장소에 올리지 않음)
if os.path.exists(pv):
    js = js.replace('const DEFAULT_ANNIV = [];', 'const DEFAULT_ANNIV = ' + open(pv, encoding='utf-8').read().strip() + ';', 1)
s = open(f'{here}/app.html', encoding='utf-8').read().replace('/*__APP_JS__*/', js)
os.makedirs(f'{here}/dist', exist_ok=True)
open(f'{here}/dist/health.html', 'w', encoding='utf-8').write(s)
print('dist/health.html', len(s))
