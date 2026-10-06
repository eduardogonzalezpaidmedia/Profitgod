// Opportunity Score: pesos y multiplicadores (aprobados en docs/DISENO.md, sección 7). Se pueden ajustar aquí.
export const WEIGHTS = [
  { key: 'sph', label: 'Silver por hora (frente al mejor de la lista)', w: 0.25 },
  { key: 'profit', label: 'Profit neto', w: 0.15 },
  { key: 'roi', label: 'ROI', w: 0.10 },
  { key: 'liquidity', label: 'Liquidez', w: 0.15 },
  { key: 'demand', label: 'Demanda / volumen', w: 0.10 },
  { key: 'trend', label: 'Precio actual frente a su historial', w: 0.10 },
  { key: 'volatility', label: 'Estabilidad del precio', w: 0.05 },
  { key: 'ease', label: 'Facilidad de ejecución', w: 0.10 }
];
export const FRESHNESS_MULT = [{ max: 5, m: 1.0 }, { max: 30, m: 0.95 }, { max: 120, m: 0.85 }, { max: 720, m: 0.60 }, { max: 1440, m: 0.30 }];   // minutos del dato más viejo; ≥ 24 h no se recomienda
export const RISK_MULT = { BAJO: 1.0, MEDIO: 0.8, ALTO: 0.5 };
export const LIQ_VALUE = { 'MUY ALTA': 1, ALTA: 0.8, MEDIA: 0.55, BAJA: 0.3, 'MUY BAJA': 0.1, 'SIN DATO': 0 };
export const ANOMALY = { defaultPct: 20, divergencePct: 25, tooGoodRoiPct: 100 };
