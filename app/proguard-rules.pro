# Reglas de R8 (ofuscación y optimización) para la versión de producción de Andén.
# Las librerías (MapLibre, Firebase, AdMob, WorkManager, Compose…) traen sus propias reglas "consumer"; aquí solo lo propio.

# Se conserva la información de líneas para que los informes de fallos de Play Console sean legibles (con el fichero mapping.txt)
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Servicios y componentes declarados en el manifiesto (AGP ya los conserva; se deja explícito por claridad)
-keep class com.anden.miapp.AndenMessagingService { *; }
-keep class com.anden.miapp.SafetyWorker { *; }
