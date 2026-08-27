# ===== Firebase (Auth + Realtime Database) =====
# กฎมาตรฐานที่ Firebase แนะนำเอง — กันไม่ให้ R8 ตัด/เปลี่ยนชื่อคลาสที่ Firebase SDK
# ใช้ reflection เข้าถึงตอน runtime (auth token handling, database model mapping)
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes Exceptions
-keepattributes InnerClasses

-keep class com.google.firebase.** { *; }
-keep interface com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ===== zxing (เครื่องสแกน QR ตั๋ว) =====
-keep class com.google.zxing.** { *; }
-keep class com.journeyapps.barcodescanner.** { *; }
-dontwarn com.google.zxing.**

# ===== org.json (ใช้แปลง object เป็น JSON ส่งเข้า WebView) =====
-keep class org.json.** { *; }
-dontwarn org.json.**

# ===== เอาคำสั่ง debug log ออกจาก release build =====
# Log.d/Log.v ไม่มีประโยชน์ใน production และอาจมีข้อมูลที่ไม่ควรอยู่ใน APK จริง
-assumenosideeffects class android.util.Log {
    public static int d(...);
    public static int v(...);
}
