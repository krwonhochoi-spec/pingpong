package kr.family.healthguard;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** 웹 화면이 넘겨준 알림 목록을 휴대폰 알람으로 예약한다. */
public class Scheduler {
    static final String P = "hg";
    static final int BASE = 1000, MAX = 400;

    static void save(Context c, String json) {
        c.getSharedPreferences(P, 0).edit().putString("list", json).apply();
    }

    static void apply(Context c) {
        SharedPreferences sp = c.getSharedPreferences(P, 0);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        int prev = sp.getInt("count", 0);
        for (int i = 0; i < prev; i++) {
            PendingIntent pi = PendingIntent.getBroadcast(c, BASE + i, new Intent(c, NotifyReceiver.class),
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (pi != null) { am.cancel(pi); pi.cancel(); }
        }
        int n = 0;
        try {
            JSONArray a = new JSONArray(sp.getString("list", "[]"));
            long now = System.currentTimeMillis();
            for (int i = 0; i < a.length() && n < MAX; i++) {
                JSONObject o = a.getJSONObject(i);
                long at = o.getLong("at");
                if (at <= now) continue;
                Intent it = new Intent(c, NotifyReceiver.class);
                it.putExtra("t", o.optString("t"));
                it.putExtra("b", o.optString("b"));
                it.putExtra("id", BASE + n);
                PendingIntent pi = PendingIntent.getBroadcast(c, BASE + n, it,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                n++;
            }
        } catch (Exception e) { }
        sp.edit().putInt("count", n).apply();
    }

    static void show(Context c, int id, String title, String body) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder nb;
        try {
            Class<?> chC = Class.forName("android.app.NotificationChannel");
            Object ch = chC.getConstructor(String.class, CharSequence.class, int.class).newInstance("health", "탁구사랑 알림", 4);
            nm.getClass().getMethod("createNotificationChannel", chC).invoke(nm, ch);
            nb = Notification.Builder.class.getConstructor(Context.class, String.class).newInstance(c, "health");
        } catch (Exception e) {
            nb = new Notification.Builder(c);
        }
        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        int icon = c.getResources().getIdentifier("ic_stat", "drawable", c.getPackageName());
        nb.setSmallIcon(icon)
          .setContentTitle(title)
          .setContentText(body)
          .setStyle(new Notification.BigTextStyle().bigText(body))
          .setColor(0xFF3B4FD8)
          .setAutoCancel(true)
          .setContentIntent(pi);
        nm.notify(id, nb.build());
    }
}
