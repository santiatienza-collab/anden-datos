# Ficha de Google Play · Andén (español)

> Borrador. Google Play prohíbe afirmaciones engañosas: por eso el texto habla de "datos oficiales" y de actualización
> "cada pocos minutos", no de "tiempo real exacto" ni de "precisión absoluta".

## Título (máx. 30 caracteres)
Andén: Mapa y Estado de Trenes

## Descripción corta (máx. 80 caracteres)
Retrasos, incidencias y alertas de seguridad de trenes en España, en un mapa.

## Descripción completa

**Andén muestra los retrasos y las incidencias de la red ferroviaria española con los datos abiertos que publican los operadores, y te da información útil de accesibilidad de las estaciones.**

**Aplicación independiente: Andén NO es una aplicación oficial ni representa a ninguna entidad pública, y no está afiliada a Renfe, Adif ni a ningún operador u organismo.** La información procede de las fuentes oficiales que se enlazan al final de esta descripción.

En un mapa de España, cada tren aparece con un color según su retraso: verde si va puntual, naranja entre 5 y 14 minutos, rojo con 15 minutos o más o cancelado.

**RETRASOS**
• Trenes y su retraso, filtrables por comunidad autónoma y compañía.
• Lista de retrasos por gravedad: cancelados, graves y moderados.
• Cifras clave: trenes en circulación, retraso medio y máximo, y comunidades más afectadas.

**INCIDENCIAS Y AVISOS**
• Avisos de servicio por comunidad: incidencias, huelgas, obras y servicios alternativos por autobús.
• Estaciones con avisos marcadas en el mapa.

**SEGURIDAD: ALERTAS Y NOTIFICACIONES CRÍTICAS**
Una pestaña de Seguridad vigila con datos abiertos las situaciones que merecen atención y las clasifica en tres niveles: información, atención y crítico. Detecta:
• Tren detenido en vía, fuera de estación, durante varios minutos.
• Tren que se acerca por detrás a otro detenido, en el mismo corredor.
• Avisos publicados por Renfe sobre accidente, fallo de señalización, incidencia en la vía o fallo de energía.
• Acumulación de trenes con mucho retraso en una línea (posible incidencia).
Recibe una notificación cuando aparece una alerta crítica (puedes desactivarlas en Ajustes). No llegan al instante: dependen de la actualización de los datos.

Importante: alertas orientativas, calculadas con datos públicos con minutos de retraso. No sustituyen a la señalización ni a los sistemas de seguridad del operador. Iryo, Ouigo y otras compañías sin datos abiertos no están incluidas.

**ACCESIBILIDAD**
• Ascensores y escaleras mecánicas fuera de servicio, y estaciones inaccesibles para personas con movilidad reducida, con iconos claros.
• Filtro para ver solo las estaciones con avisos.

**ESTACIONES Y HORARIOS**
• Salidas y llegadas de cada estación con su hora prevista y el retraso.
• Todas las estaciones agrupadas por provincia, con buscador.

**COMPAÑÍAS**
Renfe (AVE, Avlo, Larga Distancia, Avant, Media Distancia, Cercanías y Rodalies), Euskotren, Metro Bilbao, FGC, SFM (Mallorca) y Metro de Barcelona (próximos trenes por estación).

**ACTUALIZACIÓN DE LOS DATOS**
Los datos se actualizan cada pocos minutos y la app indica su antigüedad. En algunas redes no hay retrasos en tiempo real (p. ej. SFM en Mallorca): se muestran los horarios y la posición se marca como estimada.

**FUENTES OFICIALES DE LOS DATOS**
• Renfe (horarios, posiciones, retrasos y avisos): https://data.renfe.com
• Euskotren: https://opendata.euskadi.eus
• Metro Bilbao: https://www.metrobilbao.eus
• FGC: https://www.fgc.cat
• TMB, metro de Barcelona: https://developer.tmb.cat
• Consorci de Transports de Mallorca: https://www.tib.org
• Seguridad ferroviaria (AESF): https://www.seguridadferroviaria.es
• Mapa: © colaboradores de OpenStreetMap (https://www.openstreetmap.org) y OpenFreeMap. Límites administrativos: © EuroGeographics, Eurostat GISCO.

**AVISO**
Andén es una aplicación independiente, no oficial: no representa a ninguna entidad pública ni a ningún operador. Los datos son orientativos y pueden tener minutos de retraso: para decidir un viaje o ante cualquier duda de seguridad, consulta siempre los canales oficiales del operador y sigue las indicaciones del personal ferroviario y de los servicios de emergencia. Política de privacidad: https://santiatienza-collab.github.io/anden-privacypolicy/

## Palabras clave sugeridas
trenes, retrasos, alertas de seguridad, incidencias ferroviarias, Renfe, Cercanías, Rodalies, AVE, horarios tren, estado de trenes, accesibilidad, ascensores estaciones

## Antes de publicar (pendiente)
- Compilar una versión firmada de producción (esta es de depuración).
- Política de privacidad: la app pide permiso de notificaciones y muestra anuncios de AdMob (identificador de publicidad); debe decirlo, y el formulario de Seguridad de los datos y la declaración de anuncios de Play Console tienen que reflejarlo.
- Sustituir los anuncios y el ID de aplicación de AdMob de PRUEBA por los reales (ver Ads.kt y AndroidManifest.xml).
- Revisar la ficha con las normas de Google Play sobre afirmaciones: no prometer "prevención de accidentes" ni protección; las alertas son orientativas.
- Capturas de pantalla, icono de 512×512 y gráfico de funciones (1024×500).
- Comprobar el cumplimiento de la atribución de las licencias de los datos (CC BY 4.0).
