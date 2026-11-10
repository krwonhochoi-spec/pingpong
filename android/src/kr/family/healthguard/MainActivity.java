package kr.family.healthguard;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.FrameLayout;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.OutputStream;

public class MainActivity extends Activity {
    static final int REQ_FILE = 11, REQ_SAVE = 12, REQ_PERM = 13;
    WebView wv, pp;          // wv: 건강 화면, pp: 탁구사랑클럽(미리 띄워 두고 탭 전환 시 바로 표시)
    FrameLayout root;
    static final String PP_URL = "file:///android_asset/pingpong/index.html";
    ValueCallback<Uri[]> fileCb;
    String pendingSaveData, pendingSaveId;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#3B4FD8"));
        w.setNavigationBarColor(Color.parseColor("#FFFFFF"));
        w.getDecorView().setSystemUiVisibility(0x10); // 밝은 내비게이션 바 아이콘
        root = new FrameLayout(this);
        setContentView(root);
        wv = makeWebView("#F2F4FA");
        root.addView(wv, new FrameLayout.LayoutParams(-1, -1));
        wv.addJavascriptInterface(new Bridge(), "Android");
        if (b != null) wv.restoreState(b);
        else wv.loadUrl("file:///android_asset/index.html");
        // 탁구 화면은 시작 직후 뒤에서 미리 불러 둠 → '탁구' 탭을 누르면 바로 표시
        wv.postDelayed(new Runnable() { public void run() { ensurePP(""); } }, 1200);
    }

    WebView makeWebView(String bg) {
        WebView v = new WebView(this);
        v.setBackgroundColor(Color.parseColor(bg));
        WebSettings s = v.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true); // 앱 내장 화면에서 Google Apps Script 호출
        s.setTextZoom(100);
        v.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView w, String url) {
                if (url.startsWith("file:")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { }
                return true;
            }
            @Override
            public void onPageFinished(WebView w, String url) {
                if (w == pp) { Runnable f = new Runnable() { public void run() { feedPP(); } }; w.postDelayed(f, 1500); w.postDelayed(f, 8000); }
            }
        });
        v.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try { startActivityForResult(Intent.createChooser(i, "백업 파일 선택"), REQ_FILE); }
                catch (Exception e) { fileCb = null; return false; }
                return true;
            }
        });
        return v;
    }

    /** 탁구 화면 준비(없으면 만들고, 연결 링크가 있으면 그 링크로 다시 열기) */
    void ensurePP(String hash) {
        boolean fresh = pp == null;
        if (fresh) {
            pp = makeWebView("#020617");
            pp.addJavascriptInterface(new Bridge(), "Android");
            pp.setVisibility(View.GONE);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, -1);
            lp.bottomMargin = navPx;
            root.addView(pp, lp);
            pp.onPause();
        }
        if (hash != null && hash.startsWith("#")) pp.loadUrl(PP_URL + hash);
        else if (fresh) pp.loadUrl(PP_URL);
    }
    int navPx = 0;

    /** 탁구 화면의 경기 기록을 건강 화면으로 전달(탁구 친 날 → 운동 시간) */
    void feedPP() {
        if (pp == null) return;
        pp.evaluateJavascript("JSON.stringify({r:localStorage.getItem('pp.records.v1'),s:localStorage.getItem('pp.sample.v1')})", new ValueCallback<String>() {
            public void onReceiveValue(String v) { if (v != null && v.startsWith("\"")) js("window.ppFeed&&ppFeed(" + v + ")"); }
        });
    }

    void showPP(boolean on, int navCss, String hash) {
        if (on) {
            ensurePP(hash);
            navPx = Math.round(navCss * getResources().getDisplayMetrics().density);
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) pp.getLayoutParams();
            lp.bottomMargin = navPx; pp.setLayoutParams(lp);
            pp.setVisibility(View.VISIBLE); pp.onResume();
            getWindow().setStatusBarColor(Color.parseColor("#020617"));
        } else if (pp != null && pp.getVisibility() == View.VISIBLE) {
            pp.setVisibility(View.GONE); pp.onPause();
            getWindow().setStatusBarColor(Color.parseColor("#3B4FD8"));
            feedPP();
        }
    }

    void js(final String code) {
        runOnUiThread(new Runnable() { public void run() { wv.evaluateJavascript(code, null); } });
    }

    class Bridge {
        @JavascriptInterface
        public void saveFile(final String id, final String name, final String mime, final String data) {
            runOnUiThread(new Runnable() {
                public void run() {
                    pendingSaveId = id;
                    pendingSaveData = data;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(mime);
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try { startActivityForResult(i, REQ_SAVE); }
                    catch (Exception e) { js("window.__onSaved&&__onSaved('" + id + "',false)"); }
                }
            });
        }

        @JavascriptInterface
        public void schedule(String json) {
            Scheduler.save(MainActivity.this, json);
            Scheduler.apply(MainActivity.this);
        }

        @JavascriptInterface
        public void requestNotify() {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(new Runnable() {
                    public void run() { requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_PERM); }
                });
            }
        }

        @JavascriptInterface
        public boolean notifyAllowed() {
            if (Build.VERSION.SDK_INT >= 33) return checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
            return true;
        }

        @JavascriptInterface
        public void testNotify() {
            Scheduler.show(MainActivity.this, 999, "탁구사랑 시험 알림", "알림이 이렇게 표시됩니다. 측정 시간이 되면 같은 방식으로 알려 드립니다.");
        }

        @JavascriptInterface
        public void copyText(String text) {
            android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            cm.setPrimaryClip(android.content.ClipData.newPlainText("건강지키미 요약", text));
        }

        @JavascriptInterface
        public void ppShow(final boolean on, final int navCss, final String hash) {
            runOnUiThread(new Runnable() { public void run() { showPP(on, navCss, hash); } });
        }

        @JavascriptInterface
        public String version() { return "1.15"; }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE) {
            Uri[] r = null;
            if (res == RESULT_OK && data != null && data.getData() != null) r = new Uri[]{data.getData()};
            if (fileCb != null) fileCb.onReceiveValue(r);
            fileCb = null;
        } else if (req == REQ_SAVE) {
            boolean ok = false;
            if (res == RESULT_OK && data != null && data.getData() != null && pendingSaveData != null) {
                ok = write(data.getData(), "wt") || write(data.getData(), "w");
            }
            js("window.__onSaved&&__onSaved('" + pendingSaveId + "'," + ok + ")");
            pendingSaveData = null;
        }
    }

    boolean write(Uri u, String mode) {
        try {
            OutputStream os = getContentResolver().openOutputStream(u, mode);
            os.write(pendingSaveData.getBytes("UTF-8"));
            os.close();
            return true;
        } catch (Exception e) { return false; }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
        js("window.appPermResult&&appPermResult(" + ok + ")");
    }

    @Override
    public void onBackPressed() {
        wv.evaluateJavascript("(window.appBack&&window.appBack())?'1':'0'", new ValueCallback<String>() {
            public void onReceiveValue(String v) { if (v == null || !v.contains("1")) finish(); }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (wv != null) { wv.onResume(); wv.resumeTimers(); js("window.appResume&&appResume()"); }
        if (pp != null) { if (pp.getVisibility() == View.VISIBLE) pp.onResume(); feedPP(); }
    }

    @Override
    protected void onPause() {
        if (pp != null) { pp.onPause(); feedPP(); }
        if (wv != null) { wv.onPause(); wv.pauseTimers(); }  // 화면을 떠나면 탁구 실시간 동기화 정지(배터리)
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        wv.saveState(out);
    }
}
