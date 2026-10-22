# Tomato Strike 🍅

Protótipo de FPS em primeira pessoa numa estufa. Um jogador enfrenta bots que também arremessam tomates; os canteiros bloqueiam o movimento e os projéteis. Vence três rondas com 3, 4 e 5 adversários. Cada rival precisa de dois impactos. Não há multijogador nesta versão.

## Executar

Requer Python 3 e um navegador moderno. Sem pacotes externos, credenciais ou compilação.

```sh
cd /workspace/tomatogame
python3 -m http.server 8000 --bind 0.0.0.0
```

Abre a página servida na porta 8000. Ctrl+C termina o servidor.

## Controlos

- **WASD**: avançar, recuar e deslocar lateralmente.
- **Movimento do rato**: virar a câmara, sem manter botões premidos; **clique** ou **Espaço**: arremessar tomate.
- **R**: recarregar o cesto de 8 tomates (1,35 segundos, reservas ilimitadas).
- **Esc / P** ou botão de pausa: pausar. Retoma pelo botão no menu.
- Se a captura do rato não estiver disponível, a câmara continua a acompanhar o movimento do rato sobre o jogo. As setas esquerda/direita também permitem virar.
- No telemóvel, arrasta a imagem para mirar e usa os botões de movimento, disparo e recarga.

Os tomates rivais são mais lentos: move-te ou abriga-te atrás dos canteiros. Cada impacto tira 17 pontos de vida. A vida e o cesto são repostos em cada nova ronda.

## Verificar

```sh
node --check game.js
curl --fail http://127.0.0.1:8000/
```

No navegador, verifica o arranque, movimento, colisão com canteiros, mira, disparos, impactos em bots, contagem de eliminações, recarga, dano, derrota e reinício. A pausa deve suspender o combate e retomar sem repor o estado. Ao eliminar a equipa rival, avança para a ronda seguinte; após a terceira, deve aparecer a vitória.

Implementação em Canvas 2D com projeção em primeira pessoa (raycasting), sprites e projéteis. Não depende de imagens, fontes ou serviços externos.
