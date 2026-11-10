# Andén · Mapa y estado de trenes en España

App Android (Kotlin + Jetpack Compose + MapLibre) con el estado de los trenes en un mapa: retrasos en
tiempo real, avisos (accesibilidad, huelgas, obras…), horarios por estación y datos por comunidad autónoma.

## Cómo funciona (sin servidor propio)

```
Renfe (GTFS + GTFS-RT) ─┐
Consorci de Transports  ├─► GitHub Actions (cada 5 min) ─► ficheros JSON ─► GitHub Pages ─► app
de Mallorca (GTFS)      ─┘        backend/src/snapshot.ts      (HTTPS)
```

No hay ningún servidor encendido: `.github/workflows/data.yml` ejecuta `backend/src/snapshot.ts`, que descarga
los feeds, calcula retrasos, semáforo, avisos y tableros de estación, y publica el resultado como API estática
en GitHub Pages (`https://<usuario>.github.io/<repo>/api/v1/...`). La app solo lee esos ficheros.

**Frescura de los datos:** GitHub ejecuta las tareas programadas como mucho cada 5 minutos y a veces las
retrasa. Los datos de la app tienen normalmente entre 5 y 15 minutos de antigüedad (la app lo indica).

## Web

La misma información se puede consultar desde el navegador en `https://<usuario>.github.io/<repo>/` (carpeta `web/`: HTML, CSS y JavaScript sin compilar, mapa con MapLibre GL JS). El flujo de GitHub copia `web/` junto a los datos, así que se actualiza sola. Enlaces directos: `#retrasos`, `#avisos`, `#estaciones`. El índice de ficheros de datos está en `datos.html`.

## Puesta en marcha (una sola vez)

1. Crea el repositorio **público** `anden-datos` en GitHub y sube este proyecto.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. En **Actions**, ejecuta a mano *Datos de trenes* (Run workflow) para publicar la primera instantánea.
4. La API queda en `https://<usuario>.github.io/anden-datos/api/v1/trains.json`. La app usa esa dirección
   (`anden.backend` en `gradle.properties`).

## Desarrollo local

```
cd backend
npm ci
npm test                    # pruebas
npm run snapshot -- ../site # genera la API estática en ../site
npm start                   # servidor local con las mismas rutas (puerto 8080)
```

Requiere Node 24 o superior (usa `node:sqlite` y TypeScript sin compilar).

## Fuentes de datos

- **Renfe**: horarios GTFS y tiempo real GTFS-RT (posiciones, retrasos, avisos) — CC BY 4.0, data.renfe.com.
- **Consorci de Transports de Mallorca**: horarios GTFS de SFM (tren T1, T2, T3) y metro M1 — CC BY 4.0.
  No hay tiempo real: las posiciones en Mallorca se estiman según el horario y se marcan como tales.
- **Mapa**: © OpenStreetMap contributors, OpenMapTiles y OpenFreeMap.
- **Comunidades autónomas**: Natural Earth (dominio público).

La gravedad de los avisos se estima a partir de su texto (los feeds no traen causa ni efecto). Los datos son
orientativos: para decisiones de viaje consulta los canales oficiales del operador.
