# Profit God

Motor de decisiones económicas para Albion Online. Aplicación aparte de [Silver Master](https://github.com/eduardogonzalezpaidmedia/Albion).

> «Tengo X silver, X materiales y X horas. ¿Cuál es la mejor estrategia para generar silver ahora?»

## Estado

**v0.8 · Un solo motor de oportunidades.** Profit God ya no es un montón de calculadoras: configuras tu situación (silver, ciudad, tiempo, riesgo, Premium, Focus), pulsas **ENCONTRAR PROFIT** y recibes un ranking único que mezcla flipping, fabricación, refinado y Mercado Negro, con el porqué de cada recomendación. Diseño en [`docs/DISENO.md`](docs/DISENO.md).

- **Inicio:** tu situación, estado de los datos (🟢/🟡/🔴), el botón ENCONTRAR PROFIT, un plan para tu tiempo y el ranking con filtros (tipo, riesgo, ciudad, capital, profit, ROI, profit/h, liquidez, confianza).
- **Profit Score 0–100** (con sus 9 componentes visibles, incluido el encaje con tu capital, tiempo y riesgo) y **Confianza 0–100 %** (frescura, cantidad de datos, historial, coincidencia entre tus datos y los públicos, liquidez, variabilidad, fuente, consistencia; los datos viejos o sin cantidades nunca dan confianza alta). Pesos en [`opportunity-engine/config.js`](opportunity-engine/config.js).
- **Detalle de cada oportunidad:** cuentas completas (compra, materiales, impuestos, venta, profit, ROI, profit/h), datos usados (precio actual, histórico, antigüedad, demanda, fuentes), riesgos, avisos y una frase que explica por qué se recomienda.
- **Mis operaciones:** registras lo que decides hacer y lo que realmente ganaste; resumen y descarga en CSV. Solo en tu dispositivo.
- **Mercado:** frescura de tus datos por ciudad y lo último que capturaste. **Calculadora** y **Estrategias** (varios materiales a la vez) siguen igual. **Configuración:** conexión, datos públicos, tu situación y tiempos estimados.
- Datos de tu base (Worker) y de Albion Data Project, con el origen de cada precio marcado. Si el Worker no responde, la app lo dice, muestra la última actualización y ofrece reintentar o usar datos públicos.
- Reglas: nada se inventa, sin Premium ni Focus por defecto, tiempos y silver/hora siempre «estimados», solo analiza (no automatiza nada del juego).

**Pendiente:** alertas, mercado global, historial navegable, asistente.

## Usarla

1. Actualiza tu Worker con [`docs/WORKER.md`](docs/WORKER.md).
2. Abre la app, escribe la dirección de tu Worker y tu clave, y pulsa **Conectar**. Se guardan solo en ese dispositivo.
3. Pruebas: `npm install && npm test` (114 pruebas: Worker, lógica de la app, motor de profit y estrategias).

Los datos del juego (`data/game/*.json`) se generan con `python3 scripts/build-data.py <carpeta data de Silver Master>`.

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

## v0.8 — pestaña «Más» (herramientas)
Planificador de varios ítems (con filtros Cocina y Alquimia), flips de encanto (el costo de runas/almas/reliquias lo ingresas tú; sin costo la ganancia es bruta), historial del precio del oro (datos públicos), tablas de referencia verificadas y atajos Alt+1…7. No se incluyen farming ni capacidad de monturas: no hay datos verificados.
