# Profit God

Motor de decisiones económicas para Albion Online. Aplicación aparte de [Silver Master](https://github.com/eduardogonzalezpaidmedia/Albion).

> «Tengo X silver, X materiales y X horas. ¿Cuál es la mejor estrategia para generar silver ahora?»

## Estado

**v0.15 · Un solo motor de oportunidades.** Profit God ya no es un montón de calculadoras: configuras tu situación (silver, ciudad, tiempo, riesgo, Premium, Focus), pulsas **ENCONTRAR PROFIT** y recibes un ranking único que mezcla flipping, fabricación, refinado y Mercado Negro, con el porqué de cada recomendación. Diseño en [`docs/DISENO.md`](docs/DISENO.md).

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
3. Pruebas: `npm install && npm test` (127 pruebas: Worker, lógica de la app, motor de profit y estrategias).

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

## v0.15 — pestaña «Más» (herramientas)
Planificador de varios ítems (con filtros Cocina y Alquimia), flips de encanto (el costo de runas/almas/reliquias lo ingresas tú; sin costo la ganancia es bruta), historial del precio del oro (datos públicos), tablas de referencia verificadas y atajos Alt+1…7. No se incluyen farming ni capacidad de monturas: no hay datos verificados.

## v0.15
Ficha de precio por ítem (Más → Precio) y memoria compartida de precios: todas las pestañas (Calculadora, Estrategias, Más) leen por `data/sources.js`, que reutiliza lo leído hace menos de 3 minutos.

## v0.15
Inicio → Opciones avanzadas → Alcance «🌐 Todos los mercados»: lee todos los objetos T4–T8 (calidad normal) en todas las ciudades con datos públicos. Cada oportunidad que compra en una ciudad y vende en otra lleva la etiqueta «🔀 Otra ciudad», hay un resumen con botón y un filtro «Ruta».

## v0.15
Más → «💎 Runas y almas»: precios de runas, almas, reliquias y fragmentos (manual o leídos de tu base, ciudad más barata con datos de menos de 24 h) + cantidad por objeto → costo de encantar automático, que «✨ Encantar» usa cuando no escribes un costo a mano. IDs editables; las cantidades las ingresa el usuario (no hay datos verificados).

## v0.15
Estrategias → «💰 Solo tengo plata»: sin elegir ningún objeto, con tu silver, ciudad, tiempo y riesgo dice qué conviene (refinar, fabricar, comprar en una ciudad y vender en otra, o Mercado Negro), la mejor de cada camino y cómo repartir el silver. Opción de alcance «Todos los mercados».

## v0.15
Más → «🧪 Pociones»: compara pociones por volumen diario (historial público de AODP), precio, costo de fabricación y ganancia por unidad; grupos «alto volumen y alto precio», etc., por mediana del listado. Sin historial no se inventa volumen.

## v0.15
Más → «🛡 Equipo»: el mismo análisis de volumen, precio, costo y ganancia por unidad para armas, armaduras, cascos, botas y capas, con filtro de subtipo y tiers (máx. 300 piezas por consulta).
