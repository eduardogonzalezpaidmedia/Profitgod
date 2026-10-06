/* Profit God — retorno de recursos (RRR) y foco. Las constantes vienen de data/game/settings.json (con fuente y fecha). */
/** retorno = bono / (100 + bono)  (bono en puntos de producción) */
export function fromBonus(bonus) {
  if (typeof bonus !== 'number' || !isFinite(bonus) || bonus <= 0) return 0;
  return bonus / (100 + bonus);
}

/**
 * opts = {locationType:'royal'|'city'|'other', bonusKind:'crafting'|'refining'|null,
 *         focus:bool, dailyBonus:number, otherBonus:number, manualPct:number|null}
 * cfg  = settings.return_rate.production_bonus
 */
export function compute(opts, cfg) {
  if (opts.manualPct !== null && opts.manualPct !== undefined && opts.manualPct !== '' && isFinite(+opts.manualPct)) {
    const pct = Math.min(Math.max(+opts.manualPct, 0), 100);
    return { rate: pct / 100, mode: 'MANUAL', bonus: null, breakdown: [{ label: 'Retorno ingresado a mano', value: pct + '%' }] };
  }
  if (opts.locationType === 'other') {
    return { rate: null, mode: 'MANUAL', bonus: null, breakdown: [{ label: 'Esta ubicación no tiene fórmula verificada: ingresa el retorno a mano', value: '' }] };
  }
  const b = [];
  let bonus = cfg.royal_city_base; b.push({ label: 'Base de ciudad', value: '+' + cfg.royal_city_base });
  if (opts.bonusKind === 'crafting') { bonus += cfg.city_crafting_specialization; b.push({ label: 'Bono de crafteo de la ciudad', value: '+' + cfg.city_crafting_specialization }); }
  if (opts.bonusKind === 'refining') { bonus += cfg.city_refining_specialization; b.push({ label: 'Bono de refinado de la ciudad', value: '+' + cfg.city_refining_specialization }); }
  if (opts.focus) { bonus += cfg.focus; b.push({ label: 'Foco', value: '+' + cfg.focus }); }
  if (+opts.dailyBonus > 0) { bonus += +opts.dailyBonus; b.push({ label: 'Bono diario de producción', value: '+' + (+opts.dailyBonus) }); }
  if (+opts.otherBonus > 0) { bonus += +opts.otherBonus; b.push({ label: 'Otros modificadores', value: '+' + (+opts.otherBonus) }); }
  return { rate: fromBonus(bonus), mode: 'AUTOMÁTICO', bonus, breakdown: b };
}

/** Eficiencia de foco (puntos). levels = {ownSpec, mastery, otherSpecsSum} */
export function focusEfficiency(levels, perLevel) {
  const own = +levels.ownSpec || 0, mas = +levels.mastery || 0, oth = +levels.otherSpecsSum || 0;
  return own * perLevel.own_specialization + mas * perLevel.crafter_mastery + oth * perLevel.other_specialization_in_tree;
}

/** costo de foco = base × 0,5^(eficiencia/10000) */
export function focusCost(base, efficiency) {
  if (typeof base !== 'number' || !isFinite(base)) return null;
  return base * Math.pow(0.5, (+efficiency || 0) / 10000);
}
