// Motor de oportunidades: analiza todo lo que hay en el mercado y devuelve UN ranking con flipping, fabricación, refinado y Mercado Negro.
import { findFlips } from '../flipping/finder.js?v=0.22';
import { scanCrafts } from './craftscan.js?v=0.22';
import { scoreAll } from './score.js?v=0.22';
import { toOpportunity } from './opportunity.js?v=0.22';
import { buildPlan } from './plan.js?v=0.22';

/**
 * p = { src, game, cfg, silver, hours, maxRisk:'BAJO'|'MEDIO'|'ALTO', extra:[ids públicos extra] }
 * → { ops:[oportunidad estándar, mejor primero], plan, info, counts:{flips, crafts, cstats} }
 */
export async function findProfit(p) {
  const { src, game, cfg } = p, silver = p.silver || 0, profile = { hours: p.hours, maxRisk: p.maxRisk };
  const cities = game.marketCities(), nonBM = cities.filter(c => c !== 'Black Market');
  const f = await findFlips({ src, game, cfg, buy: nonBM, sell: cities, silver, maxUnits: cfg.maxUnits || 0, extra: p.extra || [], startCity: cfg.city, profile });
  const withRows = new Set(f.rows.map(r => r.city)), crafts = [], cstats = { candidates: 0, evaluated: 0, noData: 0, tooOld: 0, noRate: 0 };
  for (const cc of game.craftCities().filter(c => withRows.has(c))) {
    const r = scanCrafts({ game, rows: f.rows, city: cc, saleCities: cities, silver, premium: cfg.premium, maxTier: cfg.maxTier || 8, cfg, startCity: cfg.city, focus: cfg.focus || 0, profile });
    crafts.push(...r.opps); Object.keys(cstats).forEach(k => { cstats[k] += r.stats[k]; });
  }
  const raws = [...f.out, ...crafts]; scoreAll(raws, silver, profile);          // un solo ranking: el «mejor profit/hora» se mide contra todos
  const ctx = { silver, hours: p.hours }, ops = raws.map(o => toOpportunity(o, ctx)).sort((a, b) => ((b.score || 0) - (a.score || 0)) || (b.profit - a.profit));
  const plan = buildPlan({ opps: raws.filter(o => o.opp.score !== null), silver, hours: p.hours, reservePct: cfg.reservePct || 0, maxRisk: p.maxRisk, focus: cfg.focus || 0 });
  plan.steps = plan.steps.map(s => toOpportunity(s, ctx));
  return { ops, plan, info: f.info, counts: { flips: f.out.length, crafts: crafts.length, cstats } };
}
