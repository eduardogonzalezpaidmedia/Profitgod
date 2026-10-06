// Configuración personal. Por defecto: sin Premium y sin Focus (nunca se asume lo contrario).
export const DEFAULTS = {
  city: 'Lymhurst',
  silver: 0,
  hours: 1.5,
  premium: false,
  focus: 0,
  risk: 'bajo',
  stationFeeMin: 300,   // tarifa de estación por 100 de nutrición: rango que indicó la usuaria; se ajusta al fabricar
  stationFeeMax: 900,
  maxTier: 8,
  capacityPerOp: 0,
  usePublic: true,      // usar también los datos públicos de Albion Data Project (siempre se marca de cuál viene cada precio)
  server: 'americas',
  proxy: '',
  unknownDepthUnits: 10, // unidades a considerar cuando un precio viene de datos públicos y no se sabe cuántas hay
  maxUnits: 0
};
export const HOURS = [0.25, 0.5, 1, 1.5, 2, 4, 8];
export const RISKS = ['bajo', 'medio', 'alto'];
