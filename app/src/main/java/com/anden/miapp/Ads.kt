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
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.appopen.AppOpenAd
import com.google.android.gms.ads.nativead.MediaView
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdView

/**
 * Anuncios de AdMob. Todos los identificadores son los de PRUEBA que publica Google: no generan ingresos y son seguros
 * de tocar. Antes de publicar hay que sustituirlos por los de la cuenta real (y el ID de aplicación del manifiesto).
 */
object Ads {
    const val NATIVE_TEST = "ca-app-pub-3940256099942544/2247696110"
    const val APP_OPEN_TEST = "ca-app-pub-3940256099942544/9257395921"
}

fun initAds(context: Context) = MobileAds.initialize(context) {}

/**
 * Anuncio de carga (apertura de la app): se muestra como máximo UNA vez por ejecución, al volver a la app desde segundo plano.
 * Se precarga al abrir y se vuelve a pedir si falló, si caducó (Google los invalida a las 4 h) o al salir de la app.
 */
class AppOpenAdManager(private val activity: Activity) {
    private var ad: AppOpenAd? = null
    private var loadedAt = 0L
    private var loading = false
    private var shown = false
    private var retries = 0
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())

    private fun fresh() = ad != null && System.currentTimeMillis() - loadedAt < 3 * 3_600_000L

    fun load() {
        if (shown || loading || fresh()) return
        ad = null
        loading = true
        AppOpenAd.load(activity, Ads.APP_OPEN_TEST, AdRequest.Builder().build(), object : AppOpenAd.AppOpenAdLoadCallback() {
            override fun onAdLoaded(ad: AppOpenAd) {
                this@AppOpenAdManager.ad = ad; loadedAt = System.currentTimeMillis(); loading = false; retries = 0
                android.util.Log.i("AndenAds", "apertura cargado")
            }
            override fun onAdFailedToLoad(error: LoadAdError) {
                loading = false
                android.util.Log.w("AndenAds", "apertura: ${error.code} ${error.message}")
                if (retries++ < 4) handler.postDelayed({ load() }, 15_000L * retries)
            }
        })
    }

    /** Se llama al volver a la app. Si hay anuncio listo y todavía no se ha mostrado ninguno, lo muestra; nunca dos veces. */
    fun showIfReady() {
        if (shown) return
        val a = ad.takeIf { fresh() }
        if (a == null) { android.util.Log.i("AndenAds", "apertura: no hay anuncio listo al volver"); load(); return }
        shown = true
        ad = null
        a.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdFailedToShowFullScreenContent(error: AdError) { shown = false; load(); android.util.Log.w("AndenAds", "apertura no se pudo mostrar: ${error.message}") }
        }
        android.util.Log.i("AndenAds", "apertura: mostrando")
        a.show(activity)
    }
}

private fun Context.dp(v: Int) = (v * resources.displayMetrics.density).toInt()

/** Carga un anuncio nativo (una vez) y lo libera al salir de pantalla. Se precarga aparte para que esté listo al llegar al final de la lista. */
@Composable
fun rememberNativeAd(): NativeAd? {
    var nativeAd by remember { mutableStateOf<NativeAd?>(null) }
    val context = LocalContext.current
    DisposableEffect(Unit) {
        val loader = AdLoader.Builder(context, Ads.NATIVE_TEST)
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
        text = "Anuncio · prueba"; setTextColor(0xFF1C1C1F.toInt()); textSize = 10f; typeface = Typeface.DEFAULT_BOLD
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
