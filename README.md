# Profit God

Motor de decisiones económicas para Albion Online. Aplicación aparte de [Silver Master](https://github.com/eduardogonzalezpaidmedia/Albion).

> «Tengo X silver, X materiales y X horas. ¿Cuál es la mejor estrategia para generar silver ahora?»

## Estado

**Fase 6 · ¿Qué hago hoy? (v0.6).** Sobre Flipping, Mercado Negro y datos públicos (v0.4), refinado y estrategias (v0.3), la calculadora (v0.2) y los datos y frescura (v0.1). Diseño aprobado ([`docs/DISENO.md`](docs/DISENO.md)). Ya incluye:

- Worker v2 con historial propio y rutas `/v2` ([`worker/worker.js`](worker/worker.js), guía en [`docs/WORKER.md`](docs/WORKER.md)).
- App web (PWA) que se conecta a tu base, muestra la frescura de tus datos por ciudad, lo último que capturaste y el historial de cada objeto.
- Configuración personal con los valores por defecto del diseño (sin Premium, sin Focus, tarifa de estación 300–900).

- **Calculadora** (pestaña «Calculadora»): elige cualquier objeto con receta y ve el desglose del profit (venta bruta → impuesto → neta, materiales tras retorno, tarifa de estación, transporte → costo total → profit neto, ROI, silver/hora), en **INSTANT** y en **ORDEN**.
- Los precios vienen de tu base y puedes cambiarlos para **simular**; cada precio queda marcado «base», «simulado» o «sin dato».
- Premium y Focus solo aparecen como **comparación**; tu escenario base es sin ambos.

- **Refinar o comprar el refinado:** en la calculadora, al elegir un material refinado se compara «comprar recurso → refinar → vender» contra «comprar el refinado ya hecho → vender», en INSTANT y en ORDEN.
- **Estrategias · «Tengo estos materiales»:** eliges un material y cuántos tienes; compara vender los materiales, refinar, fabricar y vender en la ciudad, o fabricar → Mercado Negro. Marca la mejor opción y muestra cuántas recetas se revisaron y cuántas se descartaron por falta de precio o por datos de más de 24 h. Nunca recomienda gastar más silver del que tienes.

- **Flipping** (pestaña «Flipping»): busca objetos que se compran en una ciudad y se venden más caros en otra o en el Mercado Negro, después de impuestos, recorriendo las órdenes visibles. Cada oportunidad muestra frescura, liquidez, riesgo y de dónde vino cada precio.
- **Datos tuyos + Albion Data Project:** la app usa tu base y los datos públicos; para cada precio (venta y compra por separado) toma el más reciente y lo marca «propio» o «público». Los datos públicos no traen cantidades: esas oportunidades quedan «cantidad no verificada». Se activan o desactivan en «Mis datos».

- **Opportunity Score 0–100** (Fase 5): cada oportunidad tiene un puntaje con sus 8 componentes visibles (silver/hora, profit, ROI, liquidez, demanda, historial, estabilidad, facilidad) × frescura × riesgo. Lo que no se sabe vale 0 y se marca «sin dato». Pesos en [`opportunity-engine/config.js`](opportunity-engine/config.js).
- **Avisos de anomalía:** precio de venta lejos de su mediana histórica (±20 %), tus datos y los públicos que no coinciden, o ganancias sospechosamente altas. Solo avisan, no bloquean.
- **Filtros y orden** en Flipping: puntaje, riesgo, liquidez, antigüedad del dato, avisos; ordenar por puntaje, profit, ROI o silver/hora. Se aplican al instante.
- **¿Qué hago hoy?** (pestaña «Hoy»): con tu silver, tu tiempo y el riesgo que aceptas arma un plan que mezcla comprar y llevar (desde tu ciudad) con fabricar/refinar donde estás. Nunca pasa de tu silver menos la reserva ni de tu tiempo, no vende más de 2/3 de lo que piden, y cada paso se explica.
- **Tengo estos materiales, varios a la vez:** agrega varios materiales con su cantidad; fabricar usa todos los que sirven, y lo que sobra se valora a la orden de compra.
- **Tiempos estimados:** minutos por viaje, por comprar/vender y por fabricación son editables en «Mis datos» (el juego no los publica): el silver/hora siempre se rotula «estimado». La tarifa de estación por fabricación también la pones tú.

Pendiente (Fase 7): alertas y pulido final.

## Usarla

1. Actualiza tu Worker con [`docs/WORKER.md`](docs/WORKER.md).
2. Abre la app, escribe la dirección de tu Worker y tu clave, y pulsa **Conectar**. Se guardan solo en ese dispositivo.
3. Pruebas: `npm install && npm test` (87 pruebas: Worker, lógica de la app, motor de profit y estrategias).

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
