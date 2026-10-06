# Profit God · Análisis y diseño (Fase 0)

Este documento responde a los 15 puntos del «Primer objetivo» del encargo. No hay cambios estructurales hasta que sea aprobado.

## 0. Lo que ya existe (hallazgos sobre tu infraestructura)

Revisado en el código del Worker `base-privada-worker.js` y probado en vivo contra tu base:

- **Cloudflare Worker + D1** (binding `DB`, secreto `CLAVE`). Dirección: `https://mi-base.eduardo-gonzalez-paidmedia.workers.dev`.
- **Captura:** el Albion Data Client de tu PC envía a `POST /in/<CLAVE>/<tema>`. Se captura solo lo que tú abres en el mercado.
- **Tablas hoy:**
  - `prices(item_id, city, quality, sell_min, sell_amount, sell_orders, sell_list, sell_t, buy_max, buy_amount, buy_orders, buy_list, buy_t)`. Clave primaria `(item_id, city, quality)`.
  - `sales(id, kind, item_id, city, amount, price, total, sold, t, raw)`.
  - `meta(k, v)`.
- **Timestamps:** milisegundos Unix (`*_t`), el Worker los entrega como ISO UTC.
- **Ciudades:** texto, traducido desde el identificador de ubicación del juego con una tabla `LOCATIONS` (hoy: Thetford, Lymhurst, Bridgewatch, Martlock, Fort Sterling, Caerleon, Black Market, Brecilien y portales). Verificado en vivo: Black Market y Caerleon.
- **Precios:** en silver enteros (el cliente los envía ×10.000 y el Worker divide).
- **Objetos:** `item_id` del juego. El encantamiento va dentro del texto (`T4_BAG@2`), no en una columna aparte.
- **Endpoints:** `/prices`, `/orders/<id>`, `/sales`, `/stats` (todos con `?key=`).

**Hallazgo importante: la base NO guarda historial.** `prices` solo conserva el dato más reciente de cada objeto, ciudad y calidad: cada lectura nueva reemplaza la anterior. Los 30 días de historial que pide el encargo hoy no existen en tu base. Ver sección 9.

## 1. Arquitectura recomendada

```
Albion Online → Albion Data Client (tu PC)
                      │  (POST /in/<CLAVE>/<tema>)
                      ▼
          Cloudflare Worker (existente) ──► D1 (existente)
                      │  + tabla nueva de historial
                      │  + rutas de lectura nuevas (/v2/...)
                      ▼
        Profit God (PWA estática, GitHub Pages)
        motor de profit → motor de oportunidades → interfaz
```

- **Frontend:** PWA estática, sin servidor propio. Todo el cálculo corre en el navegador.
- **Backend:** el mismo Worker. Solo se le añaden rutas de lectura y una tabla de historial. Nada de lo que hoy escribe se modifica.
- **Dos fuentes de datos:** tu base (principal) y la API pública de AODP (complemento para historial y para objetos que no has abierto). Cada dato lleva su origen.

## 2. Flujo de datos

1. El cliente captura órdenes → Worker las agrega por objeto/ciudad/calidad → D1.
2. **Nuevo:** al escribir en `prices`, el Worker guarda además una fila en `price_log` (ver sección 4), como máximo una por objeto/ciudad/calidad cada 10 minutos.
3. La PWA pide al Worker solo los objetos que necesita (consultas agrupadas) y los guarda en caché con su marca de tiempo.
4. El motor calcula profit, el motor de oportunidades puntúa y ordena, la interfaz muestra y explica.

## 3. Estructura de módulos

La del encargo (`/data`, `/markets`, `/crafting`, `/refining`, `/black-market`, `/flipping`, `/profit-engine`, `/opportunity-engine`, `/history`, `/dashboard`, `/settings`, `/api`). Regla: cada módulo de cálculo es una función pura (entra datos, sale resultado), sin acceso a red, para probarla con tests.

**Se reutiliza de Silver Master** (código ya probado con 97 tests, se copia, no se enlaza): recetas, objetos, ciudades, reglas de impuestos (8 % / 4 % + 2,5 % de tarifa de orden), fórmulas de RRR y bonos de ciudades royales verificados, capa de API con caché y reintentos, fusión de datos propios y públicos. Los datos de Caerleon y Brecilien siguen marcados «sin verificar».

## 4. Modelo de base de datos necesario

No se toca ninguna tabla existente. Solo se **añaden** tablas, con migraciones `CREATE TABLE IF NOT EXISTS`.

**`price_log`** — historial propio de precios
- Propósito: poder calcular promedio, mediana, tendencia y anomalías.
- Campos: `item_id`, `city`, `quality`, `t` (ms), `sell_min`, `sell_orders`, `sell_amount`, `buy_max`, `buy_orders`, `buy_amount`.
- Índices: `(item_id, city, quality, t)`, y `(t)` para limpiar.
- Relación: lógica con `prices` por `(item_id, city, quality)`.
- Retención: 45 días, borrado diario.
- Escritura: una fila por objeto/ciudad/calidad como máximo cada 10 minutos para cuidar el límite gratuito de D1.

**`settings_user`** (opcional, fase 2) — configuración personal sincronizada entre PC y teléfono. Hasta entonces se guarda en el navegador.

**`opportunity_snapshots`** (opcional, fase 4) — resultado de cada recomendación para poder revisar si acertó.

## 5. API necesaria (rutas nuevas del Worker, solo lectura salvo el log)

- `GET /v2/prices?ids=&cities=&q=&key=` — precios con antigüedad calculada.
- `GET /v2/history?id=&city=&q=&days=&key=` — serie para el análisis (desde `price_log`).
- `GET /v2/freshness?key=` — por ciudad: cuántos objetos y qué tan recientes.
- Las rutas actuales (`/prices`, `/orders`, `/sales`, `/stats`) siguen igual.

## 6. Fórmulas de profit (todas con desglose bruto → neto)

Notación: `P` precio, `t` impuesto de venta (4 % con Premium, 8 % sin Premium; tu valor por defecto es sin Premium), `f` tarifa de orden (2,5 %), `RRR` tasa de retorno de recursos.

- **Venta INSTANT** (a la orden de compra existente): `neto = P_buy × (1 − t)`.
- **Venta por ORDEN** (poniendo orden de venta): `neto = P_sell × (1 − t − f)`.
- **Compra INSTANT**: `coste = P_sell_min`. **Compra por ORDEN**: `coste = P_buy_max × (1 + f)`.
- **Coste de materiales en fabricación:** `Σ cantidad_i × precio_i × (1 − RRR)`.
- **Tarifa de estación:** valor del objeto × tarifa por 100 de nutrición, según la estación. Es un dato que introduces o verificas tú; no se asume.
- **Profit neto** = `ingreso neto − materiales − tarifa de estación − transporte − costes extra`.
- **ROI** = `profit neto / capital requerido`.
- **Silver por hora** = `profit neto / tiempo` (ver sección 7).
- **Refinado vs. comprar refinado:** misma estructura, con `RRR` de la ciudad y el recurso; se compara `comprar recurso → refinar → vender` contra `comprar refinado → vender`.
- **Sin Premium y sin Focus** es el escenario base. Premium y Focus solo generan una columna comparativa.

**Tiempo estimado por actividad.** Es la parte que más puede equivocarse, porque el juego no entrega esos tiempos. Propuesta: parámetros editables con valores iniciales conservadores (minutos por viaje entre ciudades, minutos por lote de fabricación, minutos por ronda de órdenes) que tú ajustas con tu experiencia. Sin ese ajuste el silver/hora se muestra como «estimado».

## 7. Fórmula inicial del Opportunity Score (0–100, transparente)

```
Score = 100 × Σ (peso_i × componente_i) × multiplicador_frescura × multiplicador_riesgo
```

Cada componente va de 0 a 1.

| Componente | Peso |
|---|---|
| Silver/hora (relativo al mejor del día) | 0,25 |
| Profit neto absoluto | 0,15 |
| ROI | 0,10 |
| Liquidez | 0,15 |
| Demanda / volumen | 0,10 |
| Tendencia e historial (precio actual vs. promedio) | 0,10 |
| Volatilidad (menos es mejor) | 0,05 |
| Facilidad de ejecución (viajes, pasos, capital) | 0,10 |

Multiplicador de **frescura** (por el dato más viejo que use la operación): < 5 min = 1,00 · 5–30 min = 0,95 · 30 min–2 h = 0,85 · 2–12 h = 0,60 · 12–24 h = 0,30 · más de 24 h = no se recomienda automáticamente.
Multiplicador de **riesgo**: bajo 1,00 · medio 0,80 · alto 0,50.

Los pesos son una primera propuesta. Quedan en un archivo de configuración y se pueden ajustar. Al abrir una recomendación se muestran todos los componentes, sus valores y su aporte al puntaje.

## 8. Estrategia para el Mercado Negro

- Módulo propio, no un mercado más. El Mercado Negro compra objetos con una cantidad limitada que renueva, y no hay garantía de venta; el modelo usa la **orden de compra visible** como techo realista, nunca un precio inventado.
- Entradas: orden de compra más alta, cantidad de órdenes, cantidad de unidades, antigüedad, historial propio.
- Salida: profit real de `comprar materiales → fabricar → transportar a Caerleon → vender`, con riesgo según valor transportado y volatilidad.
- Lo que no se puede saber con los datos actuales (con qué frecuencia compra de verdad cada objeto) se declara como incierto y baja la puntuación, en lugar de suponerse.

## 9. Estrategia para el historial

Hoy no hay. Plan:
1. **Empezar a registrar ya** (`price_log`). Es lo más urgente porque el historial solo existe desde que se empieza a guardar.
2. **Mientras tanto,** usar el historial de la API pública de AODP para el análisis de tendencia, marcado como origen «público».
3. Al llegar a 7 días propios, el análisis pasa a usar tus datos; a los 30 días se completan todos los períodos pedidos (1 h, 6 h, 24 h, 3, 7, 14 y 30 días).
4. Promedio, mediana, mínimo, máximo y volatilidad se calculan sobre las filas del período. Si hay menos de un mínimo de puntos, el resultado dice «Datos insuficientes».

## 10. Estrategia para detectar oportunidades

1. Filtrar por tus restricciones (capital, tiempo, riesgo, tier máximo, sin Premium/Focus).
2. Generar candidatos por actividad: fabricación, refinado, flipping entre ciudades, Mercado Negro y sus combinaciones.
3. Calcular profit neto con desglose, en escenario INSTANT y por ORDEN.
4. Descartar datos de más de 24 h y marcar los de 2–24 h.
5. Puntuar, explicar y ordenar. Para «¿Qué hago hoy?», armar una cartera que nunca supere el capital menos la reserva.
6. Anomalías: precio actual contra la mediana del período; se avisa por encima de un umbral configurable (por defecto ±20 %).

## 11. Tecnologías recomendadas

- Frontend: JavaScript sin dependencias pesadas, PWA (manifest + service worker), diseño móvil primero, modo oscuro.
- Cálculo: funciones puras en JS, con tests en Node.
- Backend: el Cloudflare Worker + D1 existentes.
- Alojamiento: GitHub Pages (gratis).
- Pruebas: tests de cálculo + pruebas de interfaz con Playwright, como en Silver Master.

## 12. Qué necesito de tu infraestructura

Casi todo ya está verificado arriba. Falta:
1. **Permiso para añadir al Worker** las rutas `/v2/...` y la tabla `price_log` (se hace pegando el código nuevo del Worker en Cloudflare, igual que la primera vez; no borra nada).
2. **Datos de la estación que usas:** tarifa de fabricación y de refinado que ves en el juego, y en qué ciudad fabricas y refinas.
3. **Tus tiempos reales** aproximados: cuánto tardas en un viaje entre ciudades y en un lote de fabricación (para el silver/hora).
4. **Qué ciudades visitas de verdad** y si usas el camino seguro o el peligroso (afecta al riesgo de transporte).
5. Confirmar que sigue permitido usar el lector de datos según las reglas del juego (pendiente de tu revisión).

## 13. Plan de desarrollo por fases

| Fase | Contenido | Resultado visible |
|---|---|---|
| 1 | Worker: `price_log`, `/v2/prices`, `/v2/freshness`. PWA vacía con conexión a la base y semáforo de frescura. | Ves tus precios con su antigüedad |
| 2 | Motor de profit + calculadora manual + modo simulación + configuración personal. | Calculas cualquier objeto con desglose real |
| 3 | Fabricación, refinado y RRR sobre datos reales; comparador de estrategias. | «Vender vs. refinar vs. fabricar» |
| 4 | Flipping entre ciudades y módulo del Mercado Negro. | Oportunidades con riesgo y liquidez |
| 5 | Historial, anomalías, Opportunity Score completo, panel de filtros. | Ranking explicado |
| 6 | «¿Qué hago hoy?» y «Tengo estos materiales». | Plan recomendado con capital y tiempo |
| 7 | Alertas (arquitectura lista), pulido, rendimiento. | Aviso de oportunidades |

## 14. Riesgos técnicos

- **Sin historial propio** hasta que `price_log` junte datos (mitigación: API pública mientras tanto).
- **Cobertura:** solo hay precios de lo que abres. Los objetos sin datos aparecen como «Datos insuficientes» en vez de adivinarse. Esto limita el ranking al principio.
- **Límite del plan gratuito de D1** (escrituras y lecturas diarias). Mitigación: una fila de log cada 10 minutos como máximo, consultas agrupadas, retención de 45 días.
- **Silver por hora depende de tiempos que el juego no publica.** Mitigación: parámetros editables y etiqueta «estimado».
- **Datos de ciudades:** el mapa `LOCATIONS` puede tener identificadores sin verificar. La app muestra «ubicación sin nombre» en lugar de ocultar el dato.
- **Mercado Negro:** la demanda real no es observable. Se modela con prudencia y se muestra la incertidumbre.
- **Reglas del juego:** el cliente de captura es de terceros. Revisar que siga permitido.

## 15. Qué construir primero

**Fase 1.** Añadir `price_log` al Worker cuanto antes, aunque el resto del proyecto todavía no exista, porque cada día sin registrar es historial que se pierde. Después, la PWA mínima que muestra tus precios con antigüedad.

## Pendiente de tu confirmación

1. ¿Apruebas añadir `price_log` y las rutas `/v2` al Worker existente?
2. ¿Los pesos del Opportunity Score de la sección 7 te sirven como punto de partida?
3. Los datos de estación y tiempos de la sección 12.
