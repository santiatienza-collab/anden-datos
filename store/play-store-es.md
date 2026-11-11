# Ficha de Google Play · Andén (español)

> Borrador. Google Play prohíbe afirmaciones engañosas: por eso el texto habla de "datos oficiales" y de actualización
> "cada pocos minutos", no de "tiempo real exacto" ni de "precisión absoluta".

## Título (máx. 30 caracteres)
Andén: Mapa y Estado de Trenes

## Descripción corta (máx. 80 caracteres)
Retrasos, incidencias y alertas de seguridad de trenes en España, en un mapa.

## Descripción completa

**Andén monitoriza los retrasos y las incidencias de la red ferroviaria española con datos oficiales abiertos de los operadores, y te da información útil de accesibilidad de las estaciones.**

Abre la app y ves, en un mapa de España, cada tren con un color según su retraso: verde si va puntual, naranja entre 5 y 14 minutos, rojo con 15 minutos o más o si está cancelado. Debajo, una lista con el detalle de los retrasos: minutos, tren, ruta, última parada, comunidad y compañía.

**RETRASOS**
• Mapa con todos los trenes y su retraso, filtrable por comunidad autónoma y por compañía.
• Lista de retrasos ordenada por gravedad: cancelados, graves y moderados.
• Cifras clave: trenes en circulación, porcentaje con retraso, retraso medio y máximo, y comunidades más afectadas.

**INCIDENCIAS Y AVISOS**
• Avisos de servicio por comunidad: incidencias, huelgas, obras y servicios alternativos por autobús.
• Estaciones con avisos marcadas en el mapa.

**SEGURIDAD: ALERTAS Y NOTIFICACIONES CRÍTICAS**
Una pestaña de Seguridad vigila con datos abiertos las situaciones que merecen atención y las clasifica en tres niveles: información, atención y crítico. Detecta:
• Tren detenido en vía, fuera de estación, durante varios minutos.
• Tren en marcha que se acerca por detrás a otro detenido, en el mismo corredor y sentido, con el tiempo estimado hasta alcanzarlo.
• Avisos oficiales de accidente, fallo de señalización, rotura o incidencia en la vía y fallo de energía.
• Acumulación de trenes con mucho retraso en una misma línea, señal de una posible incidencia.
Recibe una notificación cuando aparece una alerta crítica, con la app abierta o cerrada, y desactívalas cuando quieras en Ajustes. Con la app cerrada la comprobación se hace cada pocos minutos, no al instante.

Importante: son alertas orientativas calculadas con datos públicos que llegan con minutos de retraso. No sustituyen a la señalización ni a los sistemas de seguridad del operador, ni a las indicaciones del personal ferroviario. Iryo, Ouigo y otras compañías que no publican datos abiertos no están incluidas.

**ACCESIBILIDAD**
• Ascensores y escaleras mecánicas fuera de servicio, y estaciones inaccesibles para personas con movilidad reducida, con iconos claros.
• Filtro para ver solo las estaciones con avisos.

**ESTACIONES Y HORARIOS**
• Salidas y llegadas de cada estación con su hora prevista, la hora esperada y el retraso.
• Todas las estaciones agrupadas por provincia, con buscador.

**COMPAÑÍAS**
Renfe (AVE, Avlo, Larga Distancia, Avant, Media Distancia, Cercanías y Rodalies), Euskotren, Metro Bilbao, FGC, SFM (Mallorca) y Metro de Barcelona (próximos trenes por estación).

**ACTUALIZACIÓN DE LOS DATOS**
Los datos se actualizan cada pocos minutos y la app te indica la antigüedad de lo que ves. En algunas redes no se publican retrasos en tiempo real (por ejemplo SFM en Mallorca): en ese caso verás los horarios oficiales y la posición se marca como estimada.

**AVISO**
Andén es una aplicación independiente y no está afiliada a Renfe, Adif ni a ningún operador. Los datos proceden de fuentes abiertas de cada operador y son orientativos: para decidir un viaje, consulta siempre los canales oficiales. Mapa: © colaboradores de OpenStreetMap, OpenMapTiles y OpenFreeMap. Límites administrativos: © EuroGeographics (Eurostat GISCO).

## Palabras clave sugeridas
trenes, retrasos, alertas de seguridad, incidencias ferroviarias, Renfe, Cercanías, Rodalies, AVE, horarios tren, estado de trenes, accesibilidad, ascensores estaciones

## Antes de publicar (pendiente)
- Compilar una versión firmada de producción (esta es de depuración).
- Política de privacidad: la app pide permiso de notificaciones y muestra anuncios de AdMob (identificador de publicidad); debe decirlo, y el formulario de Seguridad de los datos y la declaración de anuncios de Play Console tienen que reflejarlo.
- Sustituir los anuncios y el ID de aplicación de AdMob de PRUEBA por los reales (ver Ads.kt y AndroidManifest.xml).
- Revisar la ficha con las normas de Google Play sobre afirmaciones: no prometer "prevención de accidentes" ni protección; las alertas son orientativas.
- Capturas de pantalla, icono de 512×512 y gráfico de funciones (1024×500).
- Comprobar el cumplimiento de la atribución de las licencias de los datos (CC BY 4.0).
