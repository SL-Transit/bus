package com.sanamchai.drivergps;

import java.text.SimpleDateFormat;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/** Keeps a low-frequency, duplicate-safe uptime snapshot for the central monitor. */
public final class DriverUptimeTracker {
    public static final long HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000L;
    public static final long OFFLINE_AFTER_MS = 3 * HEARTBEAT_INTERVAL_MS;

    private String serviceDate;
    private long lastObservedAt;
    private long onlineMs;
    private long offlineMs;
    private long maxGapMs;
    private int gapCount;
    private long lastPublishedAt;

    public boolean shouldPublish(long nowMs) {
        return lastPublishedAt == 0 || nowMs - lastPublishedAt >= HEARTBEAT_INTERVAL_MS;
    }

    public Snapshot observe(long nowMs, boolean reportedOnline) {
        String date = serviceDate(nowMs);
        if (serviceDate == null || !serviceDate.equals(date)) {
            serviceDate = date;
            lastObservedAt = nowMs;
            onlineMs = 0;
            offlineMs = 0;
            maxGapMs = 0;
            gapCount = 0;
        } else if (lastObservedAt > 0 && nowMs >= lastObservedAt) {
            long delta = nowMs - lastObservedAt;
            if (reportedOnline) {
                onlineMs += delta;
            } else {
                offlineMs += delta;
                gapCount++;
                maxGapMs = Math.max(maxGapMs, delta);
            }
            if (delta > OFFLINE_AFTER_MS) {
                gapCount++;
                maxGapMs = Math.max(maxGapMs, delta);
            }
            lastObservedAt = nowMs;
        }
        return snapshot(nowMs, reportedOnline);
    }

    public void markPublished(long nowMs) {
        lastPublishedAt = nowMs;
    }

    private Snapshot snapshot(long nowMs, boolean reportedOnline) {
        Map<String, Object> data = new HashMap<>();
        data.put("serviceDate", serviceDate == null ? serviceDate(nowMs) : serviceDate);
        data.put("lastSeenAt", nowMs);
        data.put("reportedOnline", reportedOnline);
        data.put("heartbeatIntervalSec", HEARTBEAT_INTERVAL_MS / 1000L);
        data.put("offlineAfterSec", OFFLINE_AFTER_MS / 1000L);
        data.put("onlineSeconds", onlineMs / 1000L);
        data.put("offlineSeconds", offlineMs / 1000L);
        data.put("gapCount", gapCount);
        data.put("maxGapSeconds", maxGapMs / 1000L);
        data.put("source", "driver-gps-apk");
        return new Snapshot(data);
    }

    public static String serviceDate(long nowMs) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Bangkok"));
        return format.format(nowMs == 0 ? System.currentTimeMillis() : new java.util.Date(nowMs));
    }

    public static final class Snapshot {
        private final Map<String, Object> data;
        Snapshot(Map<String, Object> data) { this.data = data; }
        public Map<String, Object> data() { return data; }
        public String serviceDate() { return String.valueOf(data.get("serviceDate")); }
    }
}