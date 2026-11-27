# Andén para escritorio (Mac)

Una ventana de escritorio (Electron) que abre la web app de Andén: <https://santiatienza-collab.github.io/anden-datos/>.
Como carga la web publicada, **siempre está al día** sin reinstalar. No lleva datos propios ni cuentas.

## Cómo conseguir el .dmg
No hace falta tener un Mac: lo construye GitHub en un ordenador macOS (flujo `.github/workflows/mac.yml`).

- **Artefacto** (cada vez que cambia esta carpeta, o con *Run workflow*): pestaña *Actions → App de escritorio (Mac)* → la última ejecución → *Artifacts* → `Anden-mac-dmg`. Requiere iniciar sesión en GitHub; caduca a los 30 días.
- **Release pública** (descarga con enlace directo): subir una etiqueta, por ejemplo `git tag mac-v1.0.0 && git push origin mac-v1.0.0`, o lanzar el flujo con *publicar* marcado.

El .dmg es **universal** (Mac con Intel y con Apple Silicon).

## Instalarlo en el Mac
1. Abre el `.dmg` y arrastra **Andén** a *Aplicaciones*.
2. La app **no está firmada con un certificado de Apple** (hace falta una cuenta de Apple Developer, 99 USD al año). La primera vez: clic derecho sobre Andén → *Abrir* → *Abrir*.
3. Si macOS dice que «está dañada», en Terminal: `xattr -cr /Applications/Andén.app`.

## Qué funciona y qué no (distinto del navegador)
- Mapa, retrasos, avisos, seguridad, estaciones y **lectura en voz alta**: sí.
- **Control por voz (dictado)**: es posible que no funcione en esta app, porque Electron no incluye el servicio de reconocimiento de voz de Google. En Safari o Chrome sí funciona.
- Notificaciones: solo mientras la app está abierta (la web no tiene notificaciones push como la app de Android).

## Probar en local
```
cd desktop
npm install
npm start
```
