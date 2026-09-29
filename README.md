# AutomatiZA — Sistema de pedidos para restaurantes

Sistema de gestão de pedidos para restaurantes pequenos que atendem pelo
WhatsApp. Roda em um computador do próprio restaurante e junta num lugar só:

- **Robô no WhatsApp** que mostra o cardápio, monta o pedido, pede endereço
  e forma de pagamento e avisa o cliente a cada etapa do preparo
- **Painel web** para acompanhar os pedidos em tempo real (do computador,
  tablet ou celular, na rede do restaurante)
- **Tela da cozinha** com a fila de preparo, letra grande e cronômetro
- **Pedidos de balcão/telefone** lançados pela equipe no painel
- **Cardápio** editável (desativar um item o tira do WhatsApp na hora)

```
 WhatsApp (robô) ─┐                        ┌─▶ Painel: pedidos, cardápio, configurações
                  ├─▶ Servidor (Node.js) ──┼─▶ Tela da cozinha (tempo real)
 Balcão (painel) ─┘      + SQLite          └─▶ Avisos ao cliente no WhatsApp
```

## Como rodar

Pré-requisito: **Node.js 22.13 ou mais novo**.

```bash
npm install
npm run build
npm start
```

Na primeira vez, o sistema:

1. cria o banco de dados em `dados/sistema.db` com um cardápio de exemplo
2. cria o arquivo `.env` com uma **senha para o painel** e mostra essa senha
   no terminal (para trocar, edite o `.env` e reinicie)
3. mostra os endereços do painel, por exemplo `http://localhost:3000` neste
   computador e `http://192.168.x.x:3000` para os outros aparelhos da rede

Depois, abra o painel, entre com a senha e vá em **WhatsApp** para escanear o
QR code com o celular do restaurante (**Configurações → Aparelhos conectados
→ Conectar aparelho**). A sessão fica salva e não precisa escanear de novo.

Em seguida, ajuste em **Configurações** o nome, o WhatsApp do dono, a chave
Pix e a taxa de entrega, e em **Cardápio** os itens reais.

### Desenvolvimento

```bash
npm run dev       # servidor com reinício automático (porta 3000)
npm run dev:web   # painel com recarga instantânea (porta 5173)
```

Para testar sem conectar ao WhatsApp, defina `WHATSAPP=desligado` no `.env`.

## Como funciona o atendimento no WhatsApp

1. Cliente manda qualquer mensagem → boas-vindas + cardápio
2. Escolhe os itens pelo número, com quantidade se quiser (`2x1, 4`)
3. Confirma → retirada ou entrega
4. Entrega: pede o endereço (ou oferece o da última vez) e soma a taxa
5. Pagamento: Pix (mostra a chave), cartão ou dinheiro (pergunta o troco)
6. O pedido entra no painel e na tela da cozinha, com aviso sonoro, e uma
   cópia vai para o WhatsApp do dono
7. Quando a cozinha muda o status, o cliente recebe um aviso: *em preparo*,
   *pronto para retirada*, *saiu para entrega* ou *cancelado*

Comandos que o cliente pode usar a qualquer momento: `cardapio`, `cancelar`
e `atendente`.

**Atendimento humano:** se o cliente digitar `atendente`, ou se alguém da
equipe responder manualmente pelo celular do restaurante, o robô para de
responder naquela conversa. Ele volta quando alguém da equipe manda `#bot`
na conversa, ou sozinho depois do tempo definido em Configurações.

## Estrutura

```
server/
  index.js          → inicia tudo (API, painel, WhatsApp)
  db.js             → banco SQLite e migrações (versões do banco)
  auth.js           → senha do painel e login
  rotas.js          → API usada pelo painel (/api/...)
  eventos.js        → avisos internos em tempo real (pedido novo, status...)
  servicos/         → regras de negócio: pedidos, produtos, clientes, restaurante
  whatsapp/
    conversa.js     → fluxo da conversa (não depende da Baileys)
    conexao.js      → conexão com o WhatsApp (Baileys)
    formatacao.js   → textos das mensagens
web/                → painel em React (Vite)
dados/              → banco e sessão do WhatsApp (não vai para o Git)
```

Alguns detalhes de projeto:
- Valores em dinheiro são guardados em **centavos** (números inteiros), para
  não haver erro de arredondamento.
- Cada pedido guarda o nome e o preço dos itens no momento da venda. Mudar o
  cardápio depois não altera pedidos antigos.
- Todas as tabelas têm `restaurante_id`, para o sistema virar
  multi-restaurante no futuro sem refazer o banco.
- Para mudar o banco, acrescente uma migração nova no fim da lista em
  `server/db.js`. Nunca edite uma que já rodou.

## Importante — WhatsApp não oficial

A conexão usa a **Baileys**, uma biblioteca não oficial que simula o WhatsApp
Web. Ela é ótima para demonstração e piloto, mas o WhatsApp pode banir
números com uso automatizado. Use um número só para o robô e explique o risco
ao cliente. Para clientes pagantes, o plano é migrar para a **API oficial da
Meta (WhatsApp Cloud API)**: o fluxo da conversa (`whatsapp/conversa.js`) não
depende da Baileys, então basta trocar a `conexao.js`.

## Próximas fases

- **Estoque:** ficha técnica (ingredientes de cada prato), baixa automática
  a cada venda, alerta de estoque mínimo e desativação automática de item
  esgotado
- **Financeiro:** abertura e fechamento de caixa, despesas, relatórios
  diário e mensal, custo e margem por prato
- **Extras:** Pix com confirmação automática, entregadores, horário de
  funcionamento, integração com iFood, API oficial do WhatsApp
- **Nota fiscal (NFC-e):** via emissor terceirizado, quando for vender como
  PDV fiscal
