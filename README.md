# Tomato Republic — Uma cidade, uma empresa, um legado 🍅

**Versão 0.3.** Um jogo original para um jogador que junta exploração em terceira pessoa, condução e gestão de uma empresa de tomates. Herdaste a pequena estufa de Anselmo, a última colheita e uma dívida de 5 000 €. A partir daí, és tu que decides como a empresa e as suas relações com a cidade crescem.

## Jogar

No GitHub, escolhe **Code → Download ZIP**, extrai a pasta e abre **index.html** num navegador moderno com WebGL 2. O motor e os recursos estão incorporados no ficheiro; não há instalação nem downloads de recursos durante a partida.

1. Carrega em **Começar a minha história / Entrar na cidade**.
2. Dá um nome à empresa e funda-a.
3. Abre **História e decisões** e escolhe como honrar a herança e cultivar os tomates.
4. Em **Contratos**, aceita uma encomenda. As caixas são reservadas e o destino fica marcado.
5. Caminha ou conduz até ao marcador dourado e carrega em **E** para entregar. Só recebes depois da entrega física.
6. Abre **Empresa** ou carrega em **B** para investir, acompanhar as contas e encerrar o dia.

Em equipamentos mais lentos, escolhe **Desempenho** no menu. O som e a sensibilidade do rato também podem ser ajustados.

## Uma cidade maior

Santa Tomata tem cerca de **1,04 km²**, **266 edifícios**, avenidas, bairros antigos, zona empresarial, universidade, cooperativa, mercado, complexo agrícola e porto. Há locais de negócio identificados, tráfego e peões em movimento. Vale da Colheita e Porto Vermelho acrescentam dois territórios de cerca de 0,25 km² cada.

A sede apresenta o nome da tua empresa. Novas estufas, câmara de frio/armazém e painéis solares tornam os investimentos visíveis no terreno. Os destinos comerciais ficam em Santa Tomata; seguir um contrato a partir de outro território regressa à cidade.

## A empresa e a história

A campanha tem **cinco capítulos, doze decisões e vários desfechos**. Conheces Inês, Marta, distribuidores e investigadores, e decides entre cultivo biológico ou intensivo, crescimento local ou parceria empresarial, salários, financiamento, resposta à seca e exportação.

As decisões mudam tesouraria, dívida, qualidade, reputação, confiança da equipa, sustentabilidade e produção. Os desfechos também têm em conta a atividade real: uma empresa sem clientes não recebe o mesmo resultado de uma rede local próspera ou de uma exportadora com entregas no porto.

O painel **Empresa** inclui:

- **Visão geral:** caixa, dívida, stock, qualidade, capacidade, equipa e relatórios.
- **História e decisões:** diálogos, consequências e requisitos de cada escolha.
- **Contratos:** clientes, quantidades, prazos e pagamentos após a entrega.
- **Crescimento:** rega, frio, estufas, contratação, laboratório, energia solar e logística.
- **Diário:** decisões, entregas e resultados dos dias anteriores.

O tempo empresarial só avança quando escolhes **Encerrar o dia**. Nesse momento são produzidas caixas e pagos salários, manutenção, sementes e juros. Contratos fora de prazo têm consequências; falta de armazenamento pode estragar colheitas. Antes de encerrar um dia com uma decisão pendente, o botão encaminha-te para essa decisão. A gestão pausa a exploração.

## Controlos

| Ação                                   | Computador                               |
| -------------------------------------- | ---------------------------------------- |
| Mover                                  | WASD ou setas                            |
| Câmara e mira                          | Movimento do rato, sem arrastar          |
| Conduzir / sair / interagir / entregar | E                                        |
| Correr / travar o veículo              | Espaço; Shift também permite correr      |
| Empresa                                | B ou botão Empresa                       |
| Arremessar tomate a pé                 | Clique esquerdo; manter premido continua |
| Recarregar                             | R                                        |
| Pausa / retoma                         | Esc ou P                                 |
| Menu de territórios                    | M                                        |

O combate com tomates continua disponível como atividade de exploração. As patrulhas não atacam indiscriminadamente quem começa a gerir a empresa na cidade. No telemóvel, arrasta o cenário para mirar e usa os controlos no ecrã.

## Guardar e continuar

A campanha guarda automaticamente no navegador: empresa, decisões, dia, contratos aceites, saldo, posição, vida, munições e veículo utilizado. Recarregar a página permite continuar. As preferências de imagem e som também ficam guardadas.

Em **Empresa**, **Exportar progresso** cria um ficheiro JSON. **Importar progresso** permite continuar noutro navegador ou recuperar um ficheiro guardado. Usa a exportação antes de mudar de dispositivo ou de substituir a pasta do jogo: o armazenamento de ficheiros locais pode variar entre navegadores.

**Nova história**, no menu, permite recomeçar após confirmar a substituição da campanha local. Os dados não são enviados para servidores.

## Imagem e desempenho

A versão inclui céu atmosférico, luz solar, sombras próximas, reflexos do ambiente, materiais com relevo e rugosidade, detalhe de fachadas e ocultação de pormenores à distância. O modo **Alta** acrescenta oclusão ambiente. As personagens e veículos têm novas proporções e materiais.

A arte é procedural e procura um aspeto mais natural. Ainda não é uma produção fotorealista com modelos digitalizados, animações capturadas e desempenho certificado em equipamento físico. O projeto continua em desenvolvimento.

## Desenvolver

Node.js 22+ e npm, na raiz do checkout:

```sh
npm ci
npm run dev
```

O servidor escuta em `0.0.0.0`, porta **8000**; `PORT` permite escolher outra. Recompila alterações de `src/` e `style.css`; recarrega o navegador. Ctrl+C termina o servidor.

```sh
npm test
npm run build
```

O build gera o **index.html** autónomo da raiz e as cópias em `dist/`. A versão da raiz está no Git para permitir jogar pelo ZIP. Não edites esse HTML gerado: altera as fontes e volta a compilar.

- `src/app.js`: exploração, física, combate, integração da empresa e gravação.
- `src/company.js`: economia, decisões, contratos e desfechos; funções puras.
- `src/company-panel.js`: interface da empresa.
- `src/world.js`: territórios, materiais, locais de negócio e expansão da sede.
- `src/life.js`: tráfego e peões.
- `src/graphics.js`: céu, iluminação, reflexos e modos de imagem.
- `src/actors.js`: personagens, veículos e animações.
- `src/navigation.js`: procura de caminhos.
- `src/shell.html` e `style.css`: interface.

Os testes cobrem decisões divergentes, duas campanhas completas, desfechos dependentes de entregas, contratos sem pagamentos duplicados, custos, prazos, investimentos, restauro e navegação. `?diagnostics` disponibiliza uma cópia de leitura do estado em `window.tomatoDiagnostics.snapshot()` para diagnóstico.

Three.js tem licença MIT, incluída em `THIRD_PARTY_NOTICES.txt` e no HTML. Os mapas, texturas e modelos são gerados localmente; não há recursos de GTA ou Counter-Strike.
