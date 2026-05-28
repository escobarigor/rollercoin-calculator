# Relatório de Revisão — site-review

Data: 2026-05-27
Escopo: `index.html` (CSS + JS embutidos), `worker.js` externo (Cloudflare Worker — fora deste repositório), arquivos órfãos `app.js`, `leagues.js`, `style.css` (não carregados pelo HTML).

## Resumo executivo

- Site é estático (HTML/CSS/JS puro), sem backend, sem autenticação, sem banco, sem armazenamento local de PII e sem cookies.
- Toda chamada de rede vai para um único proxy público (Cloudflare Worker) que apenas reenvia dados da API pública do RollerCoin.
- Nenhum dado pessoal sensível é coletado ou exibido (o "nick" é público no perfil do RollerCoin).
- Não há credenciais, secrets ou tokens no frontend.

Dos 10 princípios do checklist, **6 não se aplicam** (não há auth/sessão/DB/multi-tenant). Dos 4 aplicáveis, **3 passavam** e **1 tinha melhoria pendente** (security headers ausentes).

## Ações executadas nesta revisão

1. Removidos os anúncios A-ADS:
   - `<iframe data-aa="2438624">` (rail esquerdo) — [index.html:683-687](index.html#L683)
   - `<iframe data-aa="2438616">` (rail direito) — [index.html:689-693](index.html#L689)
   - CSS de `.ad-rail`, `.ad-rail-left`, `.aads-unit`, `.sponsor-rail` removidos.
   - `page-shell` simplificado para layout centralizado de coluna única.
   - Regra responsiva `.sponsor-rail, .ad-rail { display: none }` removida (já não há esses elementos).
2. Adicionados security headers via `<meta>` (princípio "Segurança Web Aplicada"):
   - `Content-Security-Policy` com `default-src 'none'` e allowlist explícita por diretiva.
   - `X-Content-Type-Options: nosniff`.
   - `Referrer-Policy: strict-origin-when-cross-origin`.
   - `Permissions-Policy` desligando camera/microphone/geolocation/FLoC.
3. Endurecida a função `fetchPlayer()`:
   - `credentials: 'omit'` e `referrerPolicy: 'no-referrer'` no `fetch`.
   - Verificação de `res.ok` (status HTTP) antes do `.json()`.
   - Validação de tipo da resposta (`typeof data === 'object'`, `data.nick` string, `data.powerGh` número finito).
   - `data.error` só é propagado se for string (evita injeção de objeto via UI).

## Checklist — princípio a princípio

### 1. Segredos e credenciais — PASSA
- Nenhum secret no HTML/JS. A `workerUrl` é um endpoint público — não é segredo.
- Endereços de cripto são públicos por natureza.

### 2. Origem dos dados — PASSA
- O frontend não fala com banco direto. Vai para o Worker, que age como proxy filtrado.

### 3. Princípio do menor privilégio em respostas — N/A no frontend
- Recomendação para o Worker (fora deste repo): só repasse `nick`, `powerGh`, `bonus_percent` e o estritamente necessário. **Próximo passo externo.**

### 4. Validação de input — PASSA (após correções)
- Slug do nick é sanitizado por regex `s.replace(/[^\w.\-]/g, '')` e ainda passa por `encodeURIComponent` na URL — [index.html:1369-1374](index.html#L1369).
- Campos numéricos (`power`, `power-bonus`, `rack-bonus`) usam `parseFloat`/`parsePower` com checagem de `isFinite`.
- Nome de máquina renderizado via `innerHTML` é escapado por `esc()` em [index.html:1681-1685](index.html#L1681) antes da concatenação em [index.html:1721](index.html#L1721).
- Demais usos de `innerHTML` (linhas 1238, 1243, 1475, 1485, 1541, 1755, 1803, 1944) só contêm strings de I18N estáticas e valores numéricos formatados (sem input do usuário). Verificado.
- Resposta do Worker agora tem checagem de tipos antes de uso.

### 5. Autenticação no backend — N/A
- Não existe área autenticada.

### 6. Logs e observabilidade — N/A
- Site estático sem servidor próprio. Logs do Worker são responsabilidade do Cloudflare (externo).

### 7. Rate limiting — N/A no frontend
- Recomendação para o Worker: limitar por IP em `/?nick=` para evitar abuso da API do RollerCoin. **Próximo passo externo.**

### 8. CORS — N/A no frontend
- Recomendação para o Worker: como o `fetch()` agora usa `credentials: 'omit'`, o Worker pode manter `Access-Control-Allow-Origin: *` com segurança (não há cookie/credencial). Se um dia o site for servido em domínio próprio diferente do `pages.dev`, considere restringir.

### 9. RLS — N/A
- Sem banco.

### 10. Sessão e login — N/A
- Sem sessão.

## Achados (severidade)

| # | Princípio | Severidade | Status |
|---|-----------|------------|--------|
| A1 | Sem CSP nem demais security headers via meta | Média | **Corrigido** |
| A2 | `fetch()` sem `credentials: 'omit'` (defesa em profundidade contra envio acidental de cookies a terceiros) | Baixa | **Corrigido** |
| A3 | Falta validação de `res.ok` antes de `await res.json()` | Baixa | **Corrigido** |
| A4 | `data.error` poderia ser objeto não-string sendo concatenado no DOM | Baixa | **Corrigido** |
| A5 | iframes A-ADS de terceiros (privacidade/superfície de ataque) | Média | **Removido a pedido do usuário** |
| A6 | Arquivos órfãos `style.css`, `app.js`, `leagues.js` continuam no repo mas não são carregados pelo HTML — risco de virem a ser referenciados por engano | Baixa | Aberto (não removido para preservar histórico) |

## Próximos passos (fora do escopo deste repo)

1. **Worker (`rollercoin-calculator.igorborbaescobar.workers.dev`)**:
   - Implementar rate limiting por IP (Cloudflare KV ou Durable Object) — princípio 7.
   - Restringir `Access-Control-Allow-Origin` ao domínio próprio do site quando estabilizado — princípio 8.
   - Retornar apenas os campos necessários (`nick`, `powerGh`, `bonus_percent`) e descartar PII desnecessária da resposta da API do RollerCoin — princípio 3.
2. **Hospedagem (GitHub Pages / Cloudflare Pages)**:
   - Configurar `Strict-Transport-Security: max-age=31536000; includeSubDomains` no provedor (não é possível via `<meta>`).
   - Garantir HTTPS-only (já é padrão em GitHub Pages).

## SEGURANÇA WEB APLICADA

- **RLS**: não aplicável (sem banco).
- **CORS**: não aplicável no frontend; recomendação registrada para o Worker.
- **Security headers**: CSP estrita (`default-src 'none'` + allowlist), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` desligando sensores e FLoC — **aplicados**.
- **HSTS**: a definir no provedor de hospedagem (não cabe em `<meta>`).
- **Cookies**: site não usa cookies. `fetch` agora explicitamente `credentials: 'omit'`.
