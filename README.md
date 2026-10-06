# Profit God

Motor de decisiones económicas para Albion Online. Aplicación aparte de [Silver Master](https://github.com/eduardogonzalezpaidmedia/Albion).

> «Tengo X silver, X materiales y X horas. ¿Cuál es la mejor estrategia para generar silver ahora?»

## Estado

**Fase 0 · Diseño.** Este repositorio contiene por ahora el análisis y el plan, no código de la aplicación.
Lee [`docs/DISENO.md`](docs/DISENO.md). La construcción empieza cuando el diseño esté aprobado.

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
