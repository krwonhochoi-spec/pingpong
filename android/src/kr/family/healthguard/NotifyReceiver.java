package kr.family.healthguard;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class NotifyReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        Scheduler.show(c, i.getIntExtra("id", 1), i.getStringExtra("t"), i.getStringExtra("b"));
    }
}
