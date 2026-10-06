# Profit God

Motor de decisiones económicas para Albion Online. Aplicación aparte de [Silver Master](https://github.com/eduardogonzalezpaidmedia/Albion).

> «Tengo X silver, X materiales y X horas. ¿Cuál es la mejor estrategia para generar silver ahora?»

## Estado

**Fase 1 · Datos y frescura (v0.1).** Diseño aprobado ([`docs/DISENO.md`](docs/DISENO.md)). Ya incluye:

- Worker v2 con historial propio y rutas `/v2` ([`worker/worker.js`](worker/worker.js), guía en [`docs/WORKER.md`](docs/WORKER.md)).
- App web (PWA) que se conecta a tu base, muestra la frescura de tus datos por ciudad, lo último que capturaste y el historial de cada objeto.
- Configuración personal con los valores por defecto del diseño (sin Premium, sin Focus, tarifa de estación 300–900).

Todavía no calcula profit ni recomienda: eso empieza en la Fase 2.

## Usarla

1. Actualiza tu Worker con [`docs/WORKER.md`](docs/WORKER.md).
2. Abre la app, escribe la dirección de tu Worker y tu clave, y pulsa **Conectar**. Se guardan solo en ese dispositivo.
3. Pruebas: `npm install && npm test` (16 pruebas del Worker y de la lógica de la app).

## Reglas del proyecto

- Los datos salen de la base privada de Cloudflare (Worker + D1) que ya existe. No se crea otra.
- Nunca se inventan precios, recetas ni bonificaciones. Lo que falta se muestra como «Datos insuficientes» o «Datos desactualizados».
- Escenario por defecto: sin Premium y sin Focus. Los escenarios con Premium o Focus solo se muestran como comparación y nunca se usan para recomendar.
- La aplicación solo analiza datos. No automatiza ninguna acción dentro del cliente de Albion.
- Ninguna clave, contraseña ni credencial se guarda en este repositorio.

## Estructura prevista

```
data/              acceso a la base privada, caché y frescura de datos
markets/           ciudades y mercados
crafting/          motor de fabricación
refining/          motor de refinado y RRR
black-market/      módulo del Mercado Negro
flipping/          comprar, transportar, vender
profit-engine/     desglose de profit (bruto → neto)
opportunity-engine/ puntuación 0-100, ranking, «¿Qué hago hoy?»
history/           análisis histórico y anomalías
dashboard/         interfaz móvil / PWA
settings/          configuración personal
api/               rutas nuevas del Worker
docs/              diseño y decisiones
```
