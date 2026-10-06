// Umbrales iniciales de liquidez y riesgo. Son una primera propuesta, visibles y ajustables aquí.
export const LIQUIDITY = [   // unidades que piden las órdenes de compra visibles en el destino
  { min: 200, level: 'MUY ALTA' }, { min: 50, level: 'ALTA' }, { min: 15, level: 'MEDIA' }, { min: 5, level: 'BAJA' }, { min: 0, level: 'MUY BAJA' }
];
export const RISK = {
  transported: [{ min: 2000000, pts: 2 }, { min: 500000, pts: 1 }],   // valor que llevas encima, en silver
  openPvpZones: ['Caerleon', 'Black Market'],                            // pasar por/hasta estas ubicaciones suma riesgo
  thinMarginPct: 5,                                                       // ROI por debajo de esto = margen estrecho
  volatility: [{ min: 40, pts: 2 }, { min: 20, pts: 1 }],                // % de variación en el historial propio
  minHistoryPoints: 5,
  age: [{ min: 720, pts: 2 }, { min: 120, pts: 1 }],                     // minutos del dato más viejo
  levels: [{ min: 4, level: 'ALTO' }, { min: 2, level: 'MEDIO' }, { min: 0, level: 'BAJO' }]
};
