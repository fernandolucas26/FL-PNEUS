# FL Pneus - demonstração pública

Demonstração estática do catálogo e do fluxo de pedido da FL Pneus.

## O que está publicado

- Catálogo de pneus e estoque inicial de demonstração.
- Carrinho e formulário de simulação de pedido.
- Pedido e status salvos apenas no navegador do visitante.

Esta demonstração não envia pedidos para a loja, não processa pagamentos e não compartilha o estoque entre visitantes. Pagamentos, fotos e o painel administrativo ficam fora da publicação pública por enquanto.

## GitHub Pages

O workflow publica somente `index.html`, `checkout.html`, `status.html`, `styles.css`, `script.js`, `checkout.js` e `status.js`. O backend, banco SQLite, imagens enviadas e telas administrativas não são incluídos no site público.

Depois do primeiro envio para a branch `main`, acompanhe a publicação em **Actions** no GitHub. O endereço esperado é:

`https://fernandolucas26.github.io/FL-PNEUS/`
