// Opportunity Score: pesos y multiplicadores (aprobados en docs/DISENO.md, sección 7). Se pueden ajustar aquí.
export const WEIGHTS = [
  { key: 'sph', label: 'Profit por hora (frente al mejor de la lista)', w: 0.20 },
  { key: 'profit', label: 'Profit neto', w: 0.10 },
  { key: 'roi', label: 'ROI', w: 0.10 },
  { key: 'liquidity', label: 'Liquidez', w: 0.15 },
  { key: 'demand', label: 'Demanda / volumen', w: 0.10 },
  { key: 'trend', label: 'Precio actual frente a su historial', w: 0.10 },
  { key: 'volatility', label: 'Estabilidad del precio', w: 0.05 },
  { key: 'ease', label: 'Facilidad de ejecución (pasos)', w: 0.05 },
  { key: 'fit', label: 'Encaje con tu perfil (capital, tiempo, riesgo)', w: 0.15 }
];
export const FRESHNESS_MULT = [{ max: 5, m: 1.0 }, { max: 30, m: 0.95 }, { max: 120, m: 0.85 }, { max: 720, m: 0.60 }, { max: 1440, m: 0.30 }];   // minutos del dato más viejo; ≥ 24 h no se recomienda
export const RISK_MULT = { BAJO: 1.0, MEDIO: 0.8, ALTO: 0.5 };
export const LIQ_VALUE = { 'MUY ALTA': 1, ALTA: 0.8, MEDIA: 0.55, BAJA: 0.3, 'MUY BAJA': 0.1, 'SIN DATO': 0 };
export const ANOMALY = { defaultPct: 20, divergencePct: 25, tooGoodRoiPct: 100 };

// Confianza (0–100 %): qué tan sólido es el dato detrás de la oportunidad. No es lo mismo que el puntaje: una operación puede ser muy rentable y poco confiable.
export const CONF_WEIGHTS = [
  { key: 'fresh', label: 'Frescura de los precios', w: 0.30 },
  { key: 'quantity', label: 'Cantidad de datos (órdenes y cantidades)', w: 0.15 },
  { key: 'history', label: 'Historial (precio actual frente a su mediana)', w: 0.15 },
  { key: 'diff', label: 'Coincidencia entre tus datos y los públicos', w: 0.10 },
  { key: 'liquidity', label: 'Liquidez', w: 0.10 },
  { key: 'variability', label: 'Variabilidad del precio', w: 0.10 },
  { key: 'source', label: 'Fuente de los datos', w: 0.05 },
  { key: 'consistency', label: 'Consistencia (sin avisos de anomalía)', w: 0.05 }
];
export const CONF_CAPS = [   // topes: datos viejos o incompletos nunca dan confianza alta
  { when: 'age720', max: 40, why: 'datos de más de 12 horas' }, { when: 'age120', max: 65, why: 'datos de más de 2 horas' },
  { when: 'noDepth', max: 75, why: 'cantidades no verificadas' }, { when: 'spike', max: 70, why: 'hay un aviso de precio anómalo' }
];
export const CONF_LEVELS = [{ min: 80, level: 'ALTA', icon: '🟢', text: 'Alta confianza' }, { min: 50, level: 'MEDIA', icon: '🟡', text: 'Confianza media' }, { min: 0, level: 'BAJA', icon: '🔴', text: 'Baja confianza' }];
