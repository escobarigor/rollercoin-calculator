/* ============================================================
 * leagues.js  —  NÚCLEO da calculadora (funciona 100% offline)
 * ------------------------------------------------------------
 * Aqui mora toda a lógica de ligas. Nada aqui depende de rede,
 * então o cálculo de liga funciona mesmo se a API do RollerCoin
 * cair ou mudar. O app.js só "conversa" com este arquivo.
 *
 * Unidade base interna: Gh/s. Tudo é convertido pra Gh/s antes
 * de calcular, e formatado de volta só na hora de exibir.
 * ========================================================== */

/* Fatores de conversão pra Gh/s (a base do jogo).
 * 1000 Gh/s = 1 Th/s ; 1000 Th/s = 1 Ph/s ; etc. */
const UNIT = {
  'GH': 1,
  'TH': 1e3,
  'PH': 1e6,
  'EH': 1e9,
  'ZH': 1e12,
};

/* As 15 ligas. 'min' é o poder MÍNIMO (em Gh/s) para entrar nela.
 * O máximo de cada liga é o min da próxima (a última vai ao infinito).
 * Fonte dos limiares: sistema de ligas do RollerCoin (15 ligas). */
const LEAGUES = [
  { id: 'bronze_1',    name: 'Bronze I',     tier: 'Bronze',   min: 0 },
  { id: 'bronze_2',    name: 'Bronze II',    tier: 'Bronze',   min: 5e6 },     //   5 PH/s
  { id: 'bronze_3',    name: 'Bronze III',   tier: 'Bronze',   min: 30e6 },    //  30 PH/s
  { id: 'silver_1',    name: 'Silver I',     tier: 'Silver',   min: 100e6 },   // 100 PH/s
  { id: 'silver_2',    name: 'Silver II',    tier: 'Silver',   min: 200e6 },   // 200 PH/s
  { id: 'silver_3',    name: 'Silver III',   tier: 'Silver',   min: 500e6 },   // 500 PH/s
  { id: 'gold_1',      name: 'Gold I',       tier: 'Gold',     min: 1e9 },     //   1 EH/s
  { id: 'gold_2',      name: 'Gold II',      tier: 'Gold',     min: 2e9 },     //   2 EH/s
  { id: 'gold_3',      name: 'Gold III',     tier: 'Gold',     min: 5e9 },     //   5 EH/s
  { id: 'platinum_1',  name: 'Platinum I',   tier: 'Platinum', min: 15e9 },    //  15 EH/s
  { id: 'platinum_2',  name: 'Platinum II',  tier: 'Platinum', min: 50e9 },    //  50 EH/s
  { id: 'platinum_3',  name: 'Platinum III', tier: 'Platinum', min: 100e9 },   // 100 EH/s
  { id: 'diamond_1',   name: 'Diamond I',    tier: 'Diamond',  min: 200e9 },   // 200 EH/s
  { id: 'diamond_2',   name: 'Diamond II',   tier: 'Diamond',  min: 400e9 },   // 400 EH/s
  { id: 'diamond_3',   name: 'Diamond III',  tier: 'Diamond',  min: 10e12 },   //  10 ZH/s
];

/* ------------------------------------------------------------
 * parsePower(texto) -> Number (em Gh/s) | null
 * Aceita coisas como "12.5 PH/s", "3eh", "850 ph/s", "1,2 EH".
 * Retorna null se não conseguir entender.
 * ---------------------------------------------------------- */
function parsePower(input) {
  if (input == null) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;

  // troca vírgula decimal por ponto (pt-BR usa vírgula)
  s = s.replace(',', '.');

  // captura: número + unidade opcional (gh/th/ph/eh/zh, com ou sem "/s")
  const m = s.match(/^([0-9]*\.?[0-9]+)\s*(zh|eh|ph|th|gh)?(\/?s)?$/i);
  if (!m) return null;

  const value = parseFloat(m[1]);
  if (!isFinite(value)) return null;

  const unit = (m[2] || 'gh').toUpperCase();   // sem unidade -> assume Gh/s
  return value * UNIT[unit];
}

/* ------------------------------------------------------------
 * formatPower(gh) -> String legível, escolhendo a melhor unidade.
 * Ex.: 1.5e9 -> "1.5 EH/s"
 * ---------------------------------------------------------- */
function formatPower(gh) {
  if (gh == null || !isFinite(gh)) return '—';
  const order = [
    ['ZH', 1e12], ['EH', 1e9], ['PH', 1e6], ['TH', 1e3], ['GH', 1],
  ];
  for (const [label, factor] of order) {
    if (gh >= factor || label === 'GH') {
      const v = gh / factor;
      // até 3 casas, sem zeros à toa
      const str = v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
      return `${str} ${label}/s`;
    }
  }
  return `${gh} GH/s`;
}

/* ------------------------------------------------------------
 * getLeague(gh) -> objeto da liga atual.
 * Pega a liga de maior 'min' que ainda seja <= ao poder.
 * ---------------------------------------------------------- */
function getLeague(gh) {
  let current = LEAGUES[0];
  for (const lg of LEAGUES) {
    if (gh >= lg.min) current = lg;
    else break;
  }
  return current;
}

/* ------------------------------------------------------------
 * analyze(gh) -> tudo que a UI precisa pra mostrar o resultado.
 * Esta é a função que o app.js chama de fato.
 *
 * Retorna:
 *  - power            poder analisado (Gh/s)
 *  - current          liga atual { id, name, tier, min }
 *  - currentIndex     índice da liga atual (0..14)
 *  - next             próxima liga (ou null se já está na última)
 *  - needed           Gh/s que faltam pra próxima liga (0 se já dá)
 *  - progress         0..1 — quanto já percorreu DENTRO da liga atual
 *  - rangeMin/rangeMax limites da liga atual em Gh/s
 *  - promotes         true se o poder já alcança uma liga acima
 *                     da primeira (útil pro modo "e se?")
 * ---------------------------------------------------------- */
function analyze(gh) {
  const current = getLeague(gh);
  const currentIndex = LEAGUES.findIndex(l => l.id === current.id);
  const next = LEAGUES[currentIndex + 1] || null;

  const rangeMin = current.min;
  const rangeMax = next ? next.min : Infinity;

  const needed = next ? Math.max(0, next.min - gh) : 0;

  let progress = 1;
  if (next) {
    progress = (gh - rangeMin) / (rangeMax - rangeMin);
    progress = Math.min(1, Math.max(0, progress));
  }

  return {
    power: gh,
    current,
    currentIndex,
    next,
    needed,
    progress,
    rangeMin,
    rangeMax,
    isMaxLeague: !next,
  };
}

/* ------------------------------------------------------------
 * compareToLeague(gh, targetLeagueId) -> veredito p/ uma liga alvo
 * Responde direto: "esse poder passa pra liga X ou não?"
 * ---------------------------------------------------------- */
function compareToLeague(gh, targetLeagueId) {
  const target = LEAGUES.find(l => l.id === targetLeagueId);
  if (!target) return null;
  return {
    target,
    reaches: gh >= target.min,
    missing: Math.max(0, target.min - gh),
  };
}

/* Expõe tudo num objeto global pro app.js usar.
 * (projeto estático sem módulos ES — mantém simples) */
window.RLC = {
  UNIT, LEAGUES,
  parsePower, formatPower, getLeague, analyze, compareToLeague,
};
