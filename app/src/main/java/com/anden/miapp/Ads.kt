package com.anden.miapp

import android.app.Activity
import android.content.Context
import android.graphics.Color as AColor
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdLoader
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.nativead.MediaView
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdView

/**
 * Anuncios de AdMob. Por defecto se usan los identificadores de PRUEBA de Google (no generan ingresos y son seguros de tocar).
 * Los de la cuenta real se activan SOLO al compilar con `-Panden.realAds=true` (también cambia el ID de aplicación del manifiesto).
 * Nunca hay que tocar anuncios reales propios durante el desarrollo.
 */
object Ads {
    /** true cuando el consentimiento permite pedir anuncios (ver [Consent]); hasta entonces no se carga ninguno. */
    var ready by mutableStateOf(false)

    const val NATIVE_TEST = "ca-app-pub-3940256099942544/2247696110"
    const val INTERSTITIAL_TEST = "ca-app-pub-3940256099942544/1033173712"

    /** Bloques reales de la cuenta de AdMob. El nativo aún no está creado: mientras sea null se sigue usando el de prueba. */
    private const val INTERSTITIAL_REAL = "ca-app-pub-1235083363799232/6000887742"
    private val NATIVE_REAL: String? = null

    val NATIVE: String get() = if (BuildConfig.USE_TEST_ADS) NATIVE_TEST else NATIVE_REAL ?: NATIVE_TEST
    val INTERSTITIAL: String get() = if (BuildConfig.USE_TEST_ADS) INTERSTITIAL_TEST else INTERSTITIAL_REAL
}

/**
 * Anuncio intersticial: sale UNA sola vez por ejecución, cuando la app lleva 20 minutos de uso acumulado (sin contar el tiempo en
 * segundo plano), y solo en una pausa natural (al cambiar de pestaña), nunca mientras el usuario toca el mapa. Sustituye al anuncio de
 * carga de apertura. Se precarga al conceder el consentimiento y se vuelve a pedir si falló o caducó (Google los invalida a la hora).
 */
class InterstitialManager(private val activity: Activity) {
    private var ad: InterstitialAd? = null
    private var loadedAt = 0L
    private var loading = false
    private var shown = false
    private var retries = 0
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())

    private var usedMs = 0L      // uso acumulado en primer plano durante esta ejecución
    private var startedAt = 0L   // 0 = la app está en segundo plano

    fun onForeground() { if (startedAt == 0L) startedAt = android.os.SystemClock.elapsedRealtime() }
    fun onBackground() { if (startedAt != 0L) { usedMs += android.os.SystemClock.elapsedRealtime() - startedAt; startedAt = 0L } }
    private fun used() = usedMs + if (startedAt != 0L) android.os.SystemClock.elapsedRealtime() - startedAt else 0L

    private fun fresh() = ad != null && System.currentTimeMillis() - loadedAt < 50 * 60_000L

    fun load() {
        if (!Ads.ready || shown || loading || fresh()) return
        ad = null
        loading = true
        InterstitialAd.load(activity, Ads.INTERSTITIAL, AdRequest.Builder().build(), object : InterstitialAdLoadCallback() {
            override fun onAdLoaded(ad: InterstitialAd) {
                this@InterstitialManager.ad = ad; loadedAt = System.currentTimeMillis(); loading = false; retries = 0
                android.util.Log.i("AndenAds", "intersticial cargado")
            }
            override fun onAdFailedToLoad(error: LoadAdError) {
                loading = false
                android.util.Log.w("AndenAds", "intersticial: ${error.code} ${error.message}")
                if (retries++ < 4) handler.postDelayed({ load() }, 15_000L * retries)
            }
        })
    }

    /** Se llama en una pausa natural de la navegación (cambio de pestaña). Muestra el anuncio si ya se cumplieron los 20 min de uso. */
    fun maybeShow() {
        if (shown || !Ads.ready || used() < AFTER_MS) return
        val a = ad.takeIf { fresh() }
        if (a == null) { load(); return }
        shown = true
        ad = null
        a.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdFailedToShowFullScreenContent(error: AdError) {
                shown = false; load(); android.util.Log.w("AndenAds", "intersticial no se pudo mostrar: ${error.message}")
            }
        }
        android.util.Log.i("AndenAds", "intersticial: mostrando")
        a.show(activity)
    }

    companion object {
        /** Uso acumulado antes de mostrar el anuncio. */
        const val AFTER_MS = 20 * 60_000L
    }
}

private fun Context.dp(v: Int) = (v * resources.displayMetrics.density).toInt()

/** Carga un anuncio nativo (una vez) y lo libera al salir de pantalla. Se precarga aparte para que esté listo al llegar al final de la lista. */
@Composable
fun rememberNativeAd(): NativeAd? {
    var nativeAd by remember { mutableStateOf<NativeAd?>(null) }
    val context = LocalContext.current
    if (!Ads.ready) return null // sin consentimiento (o aún sin respuesta) no se pide ningún anuncio
    DisposableEffect(Unit) {
        val loader = AdLoader.Builder(context, Ads.NATIVE)
            .forNativeAd { nativeAd = it }
            .withAdListener(object : AdListener() {
                override fun onAdFailedToLoad(error: LoadAdError) { android.util.Log.w("AndenAds", "nativo: ${error.code} ${error.message}") }
            })
            .build()
        loader.loadAd(AdRequest.Builder().build())
        onDispose { nativeAd?.destroy() }
    }
    return nativeAd
}

/** Anuncio nativo de prueba con el aspecto oscuro de la app. No ocupa sitio hasta que hay anuncio. */
@Composable
fun NativeAdCard(ad: NativeAd?, modifier: Modifier = Modifier) {
    if (ad == null) return
    AndroidView(
        modifier = modifier.fillMaxWidth(),
        factory = { buildNativeView(it) },
        update = { bindNative(it, ad) },
    )
}

private fun buildNativeView(c: Context): NativeAdView {
    val view = NativeAdView(c)
    val col = LinearLayout(c).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(c.dp(12), c.dp(10), c.dp(12), c.dp(12))
        background = GradientDrawable().apply { setColor(0xFF2A2A2E.toInt()); cornerRadius = c.dp(14).toFloat() }
    }
    val tag = TextView(c).apply {
        text = if (BuildConfig.USE_TEST_ADS) "Anuncio · prueba" else "Anuncio"; setTextColor(0xFF1C1C1F.toInt()); textSize = 10f; typeface = Typeface.DEFAULT_BOLD
        setBackgroundColor(0xFFFFD60A.toInt()); setPadding(c.dp(6), c.dp(1), c.dp(6), c.dp(1))
    }
    val head = LinearLayout(c).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    val icon = ImageView(c).apply { layoutParams = LinearLayout.LayoutParams(c.dp(40), c.dp(40)).apply { rightMargin = c.dp(10) } }
    val texts = LinearLayout(c).apply {
        orientation = LinearLayout.VERTICAL
        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    }
    val headline = TextView(c).apply { setTextColor(AColor.WHITE); textSize = 15f; typeface = Typeface.DEFAULT_BOLD; maxLines = 2 }
    val body = TextView(c).apply { setTextColor(0xFF9A9AA2.toInt()); textSize = 12f; maxLines = 2 }
    texts.addView(headline); texts.addView(body)
    head.addView(icon); head.addView(texts)
    val media = MediaView(c).apply {
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, c.dp(150)).apply { topMargin = c.dp(8) }
    }
    val cta = Button(c).apply {
        setTextColor(0xFF1C1C1F.toInt()); setBackgroundColor(0xFFFFD60A.toInt()); isAllCaps = false
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = c.dp(8) }
    }
    head.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = c.dp(8) }
    col.addView(tag); col.addView(head); col.addView(media); col.addView(cta)
    view.addView(col)
    view.headlineView = headline; view.bodyView = body; view.iconView = icon; view.mediaView = media; view.callToActionView = cta
    return view
}

private fun bindNative(view: NativeAdView, ad: NativeAd) {
    (view.headlineView as TextView).text = ad.headline
    (view.bodyView as TextView).apply { text = ad.body; visibility = if (ad.body == null) View.GONE else View.VISIBLE }
    (view.iconView as ImageView).apply {
        val i = ad.icon
        if (i == null) visibility = View.GONE else { setImageDrawable(i.drawable); visibility = View.VISIBLE }
    }
    (view.callToActionView as Button).apply { text = ad.callToAction ?: "Ver"; visibility = if (ad.callToAction == null) View.GONE else View.VISIBLE }
    view.mediaView?.mediaContent = ad.mediaContent
    view.setNativeAd(ad)
}
