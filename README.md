# Tomato Republic 🍅

Um protótipo original de ação e exploração em terceira pessoa. Conduz pelas ruas, transporta colheitas e enfrenta patrulhas rivais com tomates. A versão 0.2 substitui o antigo Tomato Strike em primeira pessoa.

## Jogar sem instalar

No GitHub, escolhe **Code → Download ZIP**, extrai a pasta e abre **index.html** no Chrome, Edge ou Firefox. O ficheiro inclui o motor e todos os recursos; não faz downloads durante o jogo. Requer um navegador com WebGL 2 e aceleração gráfica.

Escolhe um território e carrega em **Entrar na cidade**. Num dispositivo menos potente, seleciona qualidade **Desempenho** no menu. O som só começa depois de entrares no jogo e pode ser desligado nas definições.

## O que podes fazer

- Explorar três mapas 3D distintos: **Santa Tomata**, **Vale da Colheita** e **Porto Vermelho**.
- Jogar com câmara em terceira pessoa, personagens animadas, iluminação, sombras e texturas locais.
- Entrar em carrinhas, conduzir, travar e voltar a sair.
- Mirar e arremessar tomates em 3D, recarregar e usar o cenário como cobertura.
- Enfrentar rivais que perseguem o jogador, procuram caminhos e também lançam tomates.
- Seguir três missões por mapa: recolha/entrega, combate contra três rivais e um percurso de entregas com tempo.
- Receber pagamentos em tomates, recuperar vida e continuar após uma derrota.
- Usar minimapa, marcadores, controlos táteis, som, qualidade gráfica e sensibilidade ajustável.

O saldo, as preferências e os mapas concluídos ficam guardados neste navegador, quando o armazenamento local está disponível. Uma partida em curso recomeça após recarregar a página. A versão atual é para **um jogador**, com arte procedural estilizada: é uma base jogável, ainda não uma produção comercial ou um mundo fotorealista.

## Controlos

| Ação                                            | Computador                                     |
| ----------------------------------------------- | ---------------------------------------------- |
| Mover                                           | WASD ou setas                                  |
| Câmara / mira                                   | Movimento do rato, sem arrastar                |
| Arremessar                                      | Clique esquerdo; manter premido para continuar |
| Recarregar                                      | R                                              |
| Recolher / entregar / entrar ou sair do veículo | E                                              |
| Correr / travão do veículo                      | Espaço; Shift também permite correr            |
| Pausa / retoma                                  | Esc ou P                                       |
| Abrir menu de mapas                             | M                                              |

O rato funciona também sem captura. Clicar no cenário tenta capturá-lo para poderes virar sem atingir a margem do ecrã. No telemóvel, arrasta o cenário para mirar e usa os botões no ecrã.

## Primeira missão

Segue o marcador dourado e o minimapa. Aproxima-te da caixa e carrega em **E**; depois leva-a ao marcador seguinte. Se estiveres num veículo, a recolha e a entrega acontecem ao passar no marcador. A carrinha vermelha está perto da posição inicial.

Após a entrega, elimina três rivais. Cada um precisa de três impactos de tomate. A última missão exige conduzir por três marcadores antes de o tempo acabar. Se o tempo acabar, o percurso reinicia. Após concluir o mapa, podes continuar a explorar ou escolher outro no menu.

## Desenvolver

Node.js 22+ e npm. Na raiz do checkout:

```sh
npm ci
npm run dev
```

O servidor usa a porta **8000**, escuta em `0.0.0.0` e recompila alterações de `src/` e `style.css`. Recarrega o navegador para ver a atualização. `PORT` permite escolher outra porta. Ctrl+C termina o servidor.

```sh
npm test
npm run build
```

O build gera **index.html** na raiz e as cópias em `dist/`. A versão da raiz está no Git para permitir jogar a partir do ZIP sem ferramentas de desenvolvimento. **Não edites o HTML gerado**: altera `src/shell.html`, `style.css` e os módulos em `src/` e volta a compilar.

- `src/app.js`: controlos, câmara, combate, veículos, missões, áudio e estado.
- `src/world.js`: mapas, materiais, texturas e colisões.
- `src/actors.js`: personagens, carrinhas, animações e objetos.
- `src/navigation.js`: procura de caminhos com A\* e margem de colisão.
- `tests/`: testes de navegação, obstáculos e percursos inacessíveis.

Para diagnóstico durante desenvolvimento, `?diagnostics` disponibiliza `window.tomatoDiagnostics.snapshot()` com uma cópia de leitura do estado. Não altera a partida.

O motor Three.js tem licença MIT, incluída em `THIRD_PARTY_NOTICES.txt` e no HTML gerado. As personagens, mapas e texturas deste projeto são criados proceduralmente; não há recursos dos jogos GTA ou Counter-Strike.
