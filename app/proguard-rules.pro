# Keep Javascript interface methods from being optimized or obfuscated
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
