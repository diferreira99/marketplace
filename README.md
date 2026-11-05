# 📡 Radar Marketplace

Painel online para validar se um produto vende, a partir de uma palavra-chave:

- **Mercado Livre, Shopee e Amazon**: anúncios que o Google mostra, com preço, vendas ("+1 mil vendidos") e nota quando aparecem.
- **Google Shopping**: lojas que vendem e faixa de preço.
- **SEO e demanda**: top 10 do Google, autocompletar, pesquisas relacionadas, "as pessoas também perguntam" e o **autocompletar interno do Mercado Livre e da Amazon** (grátis, sem crédito do Serper). A Shopee não abre a busca dela, então usa os sinais do Google.
- **Nota de validação (0–100)** com os motivos, concorrência e dicas de cauda longa.
- **Histórico do time e comparação**: as pesquisas ficam na nuvem (Vercel Blob privado). Todo mundo que entra com a senha vê o mesmo histórico, e uma palavra já pesquisada por alguém (até 6 h) não gasta crédito de novo.

## Telas

- **📊 Painel**: números do time, melhores produtos, mapa preço × nota, como estão as ideias, anúncios por canal, vigiadas e todas as pesquisas.
- **🔎 Pesquisar**: nota de validação, **🏆 onde vender** (nota de 0 a 100 por canal com os motivos: demanda, concorrência, preço e margem), **calculadora de margem por canal** (custo de produção, embalagem, imposto, comissão, taxa fixa e frete), anúncios de cada marketplace com logo, Google Shopping com fotos, distribuição de preços, evolução no tempo, SEO, demanda e **títulos de anúncio** (IA).
- **📋 Lote**: até 20 palavras de uma vez, com ranking.
- **🔔 Vigiadas**: até 15 palavras checadas toda segunda (cron da Vercel), com variação de preço e nota.
- **⚙️ Taxas**: comissões, taxas fixas, frete, imposto e meta de margem, iguais para o time.

## Como funciona

- `index.html`: o painel (HTML + JS, sem build).
- `api/pesquisa.js`: função da Vercel que faz 6 consultas ao [Serper](https://serper.dev) em paralelo
  (busca, shopping, autocompletar e `site:` de cada marketplace) e devolve tudo analisado.
  A chave do Serper fica só no servidor. A mesma palavra em menos de 6 h sai do cache.
- `api/config.js`: taxas, custos por produto e palavras vigiadas do time.
- `api/titulos.js`: títulos de anúncio com o Claude (`claude-opus-5-5`, com fallback automático); sem chave, monta por regra.
- `api/monitorar.js`: chamado pelo cron toda segunda; refaz as vigiadas.
- `lib/recomendacao.js`: nota por canal e a estratégia (também roda no navegador).
- `lib/seointerno.js`: autocompletar do Mercado Livre e da Amazon.
- `lib/margem.js`: cálculo de lucro e preço mínimo por canal (o mesmo arquivo roda no navegador).
- `api/historico.js`: lista, abre e apaga pesquisas salvas.
- `lib/armazem.js`: grava as pesquisas e o índice no Blob (com proteção contra duas gravações ao mesmo tempo).
- `lib/analise.js`: leitura de preços e vendas, separação de anúncio x página de lista e cálculo da nota.

Cada pesquisa nova gasta **6 créditos** do Serper.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Nome | O que é |
|---|---|
| `SERPER_API_KEY` | Chave da API do Serper |
| `PAINEL_SENHA` | Senha para entrar no painel (sem ela, a API recusa tudo) |
| `ANTHROPIC_API_KEY` | Opcional: títulos de anúncio escritos pela IA |
| `CRON_SECRET` | Senha do cron semanal (a Vercel envia sozinha) |
| `BLOB_READ_WRITE_TOKEN` | Criada sozinha ao ligar o Blob `radar-marketplace-dados` ao projeto |

## Testes

```bash
npm test
```
