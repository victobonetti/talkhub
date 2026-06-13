# talkhub

App web onde *hosts* criam salas de chat compartilhadas com mundos pixel-art
exploráveis. Jogadores entram, desenham seu avatar 16×16, andam pelo mapa e
conversam num chat lateral efêmero.

## Status

Em planejamento. Veja a especificação técnica do MVP em
[`docs/PLAN.md`](docs/PLAN.md).

## Resumo do MVP

- Login via Google ou convidado; editor de avatar pixel-art 16×16 (ou gerar
  aleatório).
- Lista de servidores ativos.
- Criar servidor: editor de mapa pixel-art com ferramenta de arte
  (lápis/borracha/balde) e ferramenta de colisão; nome do servidor.
- Conectar e explorar: split mapa | chat (horizontal no desktop, vertical com
  D-pad no mobile). Setas movem o jogador; digitar escreve no chat; Enter envia.
- Movimento **servidor-autoritativo**; chat **efêmero e seguro** (nunca
  persistido).
