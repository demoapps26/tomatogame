# Tomato Republic: da campanha empresarial à produção comercial

A versão 0.10 concentra o trabalho em **Santa Tomata**: quarteirões compostos, uma loja equipada e preparação física de encomendas. Vale da Colheita e Porto Vermelho mantêm os seus conteúdos. A base continua em desenvolvimento, com um orçamento gráfico de navegador e trabalho de arte, animação, engenharia e testes ainda por fazer.

## Novidades implementadas na fonte da v0.10

- 20 fachadas detalhadas em 12 lotes do centro, com 40 alas anexas e pátios pavimentados; modelos mais leves em Desempenho e à distância.
- Fachada comercial da sede com molduras e toldo; mercearia com produtos embalados, frigorífico envidraçado, armazém e carrinhos.
- Lote diário de seis caixas: amostra na estufa, transporte visível, pesagem de dois segundos, selagem de três segundos e expedição por caixa.
- Reserva inicial de seis caixas de stock e custo de 8 €; pagamento de 96 € mais bónus de qualidade até 24 € apenas ao concluir o lote, uma vez por dia empresarial.
- E para trabalhar nas estações; X para cancelar, devolvendo apenas o stock não expedido e mantendo o custo das embalagens.
- Carros estacionados utilizáveis e guardados, vegetação urbana e iluminação das ruas.
- População em movimento de Santa Tomata por qualidade: 3 carros/6 peões em Desempenho, 8/14 em Equilibrada e 12/28 em Realismo; restantes territórios preservados.
- Passos com timbre de interior/exterior em Santa Tomata e sinal de confirmação da balança, com áudio gerado localmente.
- Mudança de qualidade reconstrói Santa Tomata mantendo a campanha e as atividades em curso.

Os [201 testes Node, o build e as verificações de preservação da v0.10](docs/validation/v0.10.md) passaram. O lote completo, pagamento único, capturas nativas, restauro por qualidade e execução HTTP/offline também foram verificados no navegador. Os resultados publicados da v0.9 continuam identificados com essa versão.

## Implementado

- Cidade de 2,13 km² com bairros distintos; mais dois territórios.
- Empresa com nome próprio, produção, custos, dívida, stock e sete investimentos.
- Cinco capítulos, doze escolhas e desfechos dependentes da gestão e das entregas reais.
- Contratos físicos, prazos e consequências económicas.
- Progressão visual da sede, estufas, armazenamento e energia solar.
- Condução, tráfego, peões e exploração em terceira pessoa.
- Câmara que acompanha o rumo do carro, com olhar livre temporário pelo rato.
- Loja e estufa com interiores percorríveis, balcão, rega e colheita limitada por dia.
- Cinco clientes presentes na cidade, conversas e propostas comerciais com requisitos diferentes.
- Frota de até três carrinhas com motoristas, rotas visíveis, custos e pagamentos após a viagem.
- Stock real na loja, vendas durante a exploração e operações guardadas a meio.
- Campanha guardada, exportação/importação e nova história.
- Sete materiais fotográficos PBR CC0, ambiente HDR, sombras próximas, GTAO e MSAA no modo Realismo.
- Escala consistente dos materiais, detalhe de fachadas e proporções revistas nos objetos da loja e estufa.
- Personagens completas MakeHuman com roupa, pele fotográfica, esqueleto e créditos incluídos no menu.
- Condução progressiva, aderência à chuva, mudanças/RPM e reflexos locais do carro em Realismo.
- Casas visitáveis, mobiliário, oficina, combustível e cinco modelos de carro.
- Três trabalhos da quinta, percursos de condução e modo fotografia com exportação PNG.
- Testes de economia, narrativa, gravação e navegação; histórico de verificações funcionais no navegador.

## Próximo salto de conteúdo

1. Conversas encenadas, vozes, expressões e relações de longo prazo para as personagens existentes.
2. Mais interiores exploráveis, seleção da colheita, operações adicionais do armazém e variedade de encomendas manuais.
3. Campanha mais longa com missões próprias por bairro, concorrentes económicos e eventos sazonais.
4. Equipa contratável com competências, programação de rotas recorrentes e uma economia de procura/oferta mais profunda.
5. Modelos, materiais fotográficos, animações e som originais produzidos para a direção artística escolhida.

## Qualidade antes do lançamento

- Concluir o lote manual completo no navegador, as capturas nativas e o smoke HTTP/offline da v0.10, registando os resultados finais.
- Medir desempenho e memória em GPUs reais e definir equipamentos mínimos; avaliar os três modos de imagem em sessões prolongadas.
- Testar campanhas e exploração durante sessões prolongadas; rever dificuldade e balanço financeiro com jogadores.
- Melhorar IA de tráfego, navegação dinâmica, colisões, comando e opções de acessibilidade.
- Definir plataformas, instalação, gravação entre versões e distribuição final.

A campanha atual é para um jogador. Um modo competitivo online seria um projeto separado de rede, servidor autoritativo, sincronização e matchmaking. A versão atual ainda não recebeu validação de lançamento comercial nem uma avaliação de gráficos fotorealistas.
