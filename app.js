/* ============================================================
 * app.js  —  liga a interface ao núcleo (leagues.js)
 * ------------------------------------------------------------
 * Responsabilidades:
 *   - alternar abas (nick / manual)
 *   - modo manual: lê o poder digitado e calcula (offline)
 *   - modo nick : chama o proxy (Cloudflare Worker) p/ pegar
 *                 o poder do jogador, depois calcula
 *   - desenhar o resultado na tela
 * ========================================================== */

/* ---- CONFIG -------------------------------------------------
 * Cole aqui a URL do SEU Cloudflare Worker depois de publicar.
 * Enquanto estiver vazio, o modo "Por Nick" mostra um aviso e
 * o modo manual continua funcionando 100%.
 * Ex.: 'https://rlc-proxy.seu-usuario.workers.dev'
 * ---------------------------------------------------------- */
const CONFIG = {
  workerUrl: '',   // <-- PREENCHER
};

/* atalhos */
const $  = (sel) => document.querySelector(sel);
const RLC = window.RLC;

/* ============================================================
 * 1) ABAS
 * ========================================================== */
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    const mode = tab.dataset.mode;
    document.querySelectorAll('.pane').forEach(p => {
      p.classList.toggle('is-hidden', p.dataset.pane !== mode);
    });
  });
});

/* ============================================================
 * 2) MODO MANUAL  (funciona sem internet)
 * ========================================================== */
$('#btn-manual').addEventListener('click', () => {
  const raw  = $('#power').value;
  const unit = $('#unit').value;            // '' = unidade vem no texto
  // se o usuário escolheu uma unidade no select, anexa ao texto
  const text = unit ? `${raw} ${unit}` : raw;

  const gh = RLC.parsePower(text);
  if (gh == null) {
    return alert('Não entendi esse valor de poder. Tenta algo como "12.5 PH/s".');
  }
  render(RLC.analyze(gh), { source: 'manual' });
});

// Enter no campo de poder também calcula
$('#power').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-manual').click();
});

/* ============================================================
 * 3) MODO NICK / LINK  (usa o proxy)
 * ========================================================== */

/* Extrai o "slug" do perfil. Aceita:
 *   - "escobooom"
 *   - "rollercoin.com/p/escobooom"
 *   - "https://rollercoin.com/p/escobooom?ref=..."  */
function extractSlug(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  const m = s.match(/rollercoin\.com\/p\/([^/?#\s]+)/i);
  if (m) return m[1];
  // não é link -> assume que já é o nick puro
  return s.replace(/[^\w.\-]/g, '');
}

$('#btn-fetch').addEventListener('click', fetchByNick);
$('#nick').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchByNick();
});

async function fetchByNick() {
  const hint = $('#nick-hint');
  const btn  = $('#btn-fetch');
  const slug = extractSlug($('#nick').value);

  hint.classList.remove('is-error');

  if (!slug) {
    hint.textContent = 'Digite um nick ou link válido.';
    hint.classList.add('is-error');
    return;
  }

  if (!CONFIG.workerUrl) {
    hint.textContent =
      'Proxy ainda não configurado. Publique o Worker e cole a URL em CONFIG.workerUrl (app.js). Por enquanto, use a aba "Poder manual".';
    hint.classList.add('is-error');
    return;
  }

  btn.disabled = true;
  btn.textContent = '...';
  hint.textContent = `Buscando "${slug}"...`;

  try {
    /* Contrato esperado do Worker (ver worker/worker.js):
     *   GET {workerUrl}/?nick=<slug>
     *   -> { ok:true, nick, powerGh, raw }      em caso de sucesso
     *   -> { ok:false, error }                   em caso de erro      */
    const url = `${CONFIG.workerUrl}/?nick=${encodeURIComponent(slug)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) throw new Error(data.error || 'Jogador não encontrado.');
    if (typeof data.powerGh !== 'number') {
      throw new Error('O proxy não devolveu o poder. Verifique o endpoint.');
    }

    hint.textContent = `Perfil "${data.nick || slug}" carregado.`;
    render(RLC.analyze(data.powerGh), { source: 'nick', nick: data.nick || slug });

  } catch (err) {
    hint.textContent = 'Erro: ' + err.message;
    hint.classList.add('is-error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Calcular';
  }
}

/* ============================================================
 * 4) RENDERIZAÇÃO DO RESULTADO
 * ========================================================== */
function render(a, meta = {}) {
  $('#result').classList.remove('is-hidden');

  // --- badge da liga atual ---
  $('#badge-tier').textContent = a.current.tier;
  $('#badge-name').textContent = a.current.name;
  const tierColor = getComputedStyle(document.body)
    .getPropertyValue(`--tier-${a.current.tier}`).trim();
  $('#league-badge').style.borderLeftColor = tierColor || 'var(--cyan)';
  $('#badge-tier').style.color = tierColor || 'var(--cyan)';

  // --- poder ---
  $('#rp-value').textContent = RLC.formatPower(a.power);

  // --- barra de progresso dentro da liga atual ---
  $('#prog-fill').style.width = (a.progress * 100).toFixed(1) + '%';
  $('#prog-min').textContent = RLC.formatPower(a.rangeMin);
  $('#prog-max').textContent = a.isMaxLeague ? '∞' : RLC.formatPower(a.rangeMax);

  // --- veredito ---
  const v = $('#verdict');
  v.classList.remove('ok', 'climb');
  if (a.isMaxLeague) {
    v.classList.add('ok');
    v.textContent = '🏆 Topo absoluto! Você já está na Diamond III, a liga mais alta.';
  } else {
    const falta = RLC.formatPower(a.needed);
    v.classList.add('climb');
    v.textContent =
      `Para subir para ${a.next.name} faltam ${falta} de poder ` +
      `(meta: ${RLC.formatPower(a.next.min)}).`;
  }

  // --- tabela das 15 ligas ---
  const table = $('#leagues-table');
  table.innerHTML = '';
  RLC.LEAGUES.forEach((lg, i) => {
    const next = RLC.LEAGUES[i + 1];
    const range = next
      ? `${RLC.formatPower(lg.min)} – ${RLC.formatPower(next.min)}`
      : `${RLC.formatPower(lg.min)} +`;
    const color = getComputedStyle(document.body)
      .getPropertyValue(`--tier-${lg.tier}`).trim();
    const tr = document.createElement('tr');
    if (i === a.currentIndex) tr.className = 'is-current';
    tr.innerHTML =
      `<td><span class="lt-dot" style="background:${color}"></span>${lg.name}</td>` +
      `<td>${range}</td>`;
    table.appendChild(tr);
  });

  // rola até o resultado
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
