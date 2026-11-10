package kr.family.healthguard;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 휴대폰 재부팅·앱 업데이트 후 알림을 다시 예약한다. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        Scheduler.apply(c);
    }
}
