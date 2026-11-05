# 📡 Radar Marketplace

Painel online para validar se um produto vende, a partir de uma palavra-chave:

- **Mercado Livre, Shopee e Amazon**: anúncios que o Google mostra, com preço, vendas ("+1 mil vendidos") e nota quando aparecem.
- **Google Shopping**: lojas que vendem e faixa de preço.
- **SEO e demanda**: top 10 do Google, autocompletar, pesquisas relacionadas e "as pessoas também perguntam".
- **Nota de validação (0–100)** com os motivos, concorrência e dicas de cauda longa.
- **Histórico do time e comparação**: as pesquisas ficam na nuvem (Vercel Blob privado). Todo mundo que entra com a senha vê o mesmo histórico, e uma palavra já pesquisada por alguém (até 6 h) não gasta crédito de novo.

## Como funciona

- `index.html`: o painel (HTML + JS, sem build).
- `api/pesquisa.js`: função da Vercel que faz 6 consultas ao [Serper](https://serper.dev) em paralelo
  (busca, shopping, autocompletar e `site:` de cada marketplace) e devolve tudo analisado.
  A chave do Serper fica só no servidor. A mesma palavra em menos de 6 h sai do cache.
- `api/historico.js`: lista, abre e apaga pesquisas salvas.
- `lib/armazem.js`: grava as pesquisas e o índice no Blob (com proteção contra duas gravações ao mesmo tempo).
- `lib/analise.js`: leitura de preços e vendas, separação de anúncio x página de lista e cálculo da nota.

Cada pesquisa nova gasta **6 créditos** do Serper.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Nome | O que é |
|---|---|
| `SERPER_API_KEY` | Chave da API do Serper |
| `PAINEL_SENHA` | Senha para entrar no painel (sem ela, a API recusa tudo) |
| `BLOB_READ_WRITE_TOKEN` | Criada sozinha ao ligar o Blob `radar-marketplace-dados` ao projeto |

## Testes

```bash
npm test
```
