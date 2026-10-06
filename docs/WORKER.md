# Actualizar tu Worker de Cloudflare (versión 2)

Es el mismo Worker que ya tienes, con historial y rutas nuevas. **No borra nada y Silver Master sigue funcionando igual.**

1. Entra a <https://dash.cloudflare.com> → **Workers & Pages** → tu Worker (`mi-base`).
2. Pulsa **Edit code**.
3. Borra todo el código que hay y pega el contenido completo de
   [`worker/worker.js`](https://raw.githubusercontent.com/eduardogonzalezpaidmedia/Profitgod/main/worker/worker.js)
   (abre el enlace, selecciona todo con `Ctrl+A`, copia con `Ctrl+C`).
4. Pulsa **Deploy**.
5. La base `DB` y la clave `CLAVE` ya están enlazadas: no hay que tocar nada más. Las tablas nuevas se crean solas.
6. Prueba en el navegador (con tu clave):
   `https://mi-base.eduardo-gonzalez-paidmedia.workers.dev/v2/freshness?key=TU_CLAVE`
   Debe responder con `cities` y `history_rows`. Al principio `history_rows` será 0 o muy bajo: el historial empieza a acumularse desde este momento.

## Rutas nuevas

| Ruta | Qué devuelve |
|---|---|
| `/v2/freshness` | Por ciudad: cuántos precios hay, cuál es el más reciente y su estado de frescura |
| `/v2/recent?city=&limit=` | Lo último que capturaste |
| `/v2/prices?ids=&cities=&q=` | Precios con antigüedad y frescura de cada lado (venta y compra) |
| `/v2/history?id=&city=&q=&days=` | Serie histórica propia con promedio, mediana, mínimo, máximo y volatilidad |

## Historial

- Una fila por objeto, ciudad y calidad como máximo cada 10 minutos.
- Se conservan 45 días; una vez al día se borra lo más antiguo.
- Si hay menos de 3 registros, la app muestra «Datos insuficientes» en lugar de estadísticas.


## Versión 3 (Fase 4)

Para que **Flipping** lea tu base necesitas volver a pegar `worker/worker.js` (versión 3). Agrega dos rutas:

- `/v2/market?cities=&maxage=&limit=` — todos los precios recientes de esas ciudades.
- `/v2/book?ids=&cities=` — las órdenes (precio y cantidad) vistas por última vez.

Las rutas anteriores y las de Silver Master siguen igual. No hace falta cambiar la clave ni la base.
