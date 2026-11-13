import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.services)
}

android {
    namespace = "com.anden.miapp"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.anden.miapp"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        // Dirección de los datos (GitHub Pages). Se cambia con -Panden.backend=https://usuario.github.io/repositorio
        val backend = providers.gradleProperty("anden.backend").orElse("https://santiatienza-collab.github.io/anden-datos").get()
        buildConfigField("String", "BACKEND_URL", "\"$backend\"")

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // Firma de publicación: las credenciales NO están en el repositorio. Se leen de keystore.properties (raíz del proyecto)
    // o de ~/.android/anden-keystore.properties. Sin ese fichero, el release se compila sin firmar.
    val keystoreProps = Properties().apply {
        listOf(rootProject.file("keystore.properties"), File(System.getProperty("user.home"), ".android/anden-keystore.properties"))
            .firstOrNull { it.exists() }?.inputStream()?.use { load(it) }
    }
    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfigs.findByName("release")?.let { signingConfig = it }
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.maplibre.android)
    implementation(libs.play.services.ads)
    implementation(libs.androidx.work.runtime)
    implementation("androidx.fragment:fragment:1.8.5") // evita una versión antigua (<1.3) arrastrada por otra librería: lint la rechaza en release
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}