# FL Pneus

Loja de pneus com demonstração pública estática e painel administrativo em Python.

## GitHub Pages

A demonstração pública é publicada em `https://fernandolucas26.github.io/FL-PNEUS/`. Ela não processa pagamentos e salva pedidos somente no navegador do visitante.

## Render: teste gratuito

O arquivo `render.yaml` prepara um Web Service gratuito de teste, incluindo o painel administrativo. No plano gratuito, o serviço pode dormir por inatividade e o sistema de arquivos é temporário: SQLite, estoque alterado, pedidos e imagens podem ser apagados ao reiniciar ou fazer deploy. Não use esse plano para operação comercial.

1. No Render, escolha **New > Blueprint** e conecte o repositório `fernandolucas26/FL-PNEUS`.
2. Antes de criar o serviço, informe `FL_ADMIN_USER` e `FL_ADMIN_PASSWORD` quando solicitados. Use uma senha exclusiva com pelo menos 16 caracteres. Não use a senha de teste local.
3. Confira que o plano exibido é **Free** e confirme o blueprint.
4. Abra `/login.html` no endereço `onrender.com` criado e entre com as credenciais definidas.

O arquivo SQLite e uploads não são versionados pelo Git. Para persistência de dados, será necessário mudar para serviço pago com disco persistente ou banco gerenciado.

## Desenvolvimento local

Execute `py server.py` e abra `http://localhost:8000`. A senha local padrão é apenas para desenvolvimento; substitua as variáveis `FL_ADMIN_USER` e `FL_ADMIN_PASSWORD` antes de expor o servidor na internet.
