import { normalizeOwnershipState } from "./ownership-state.js";

/**
 * Tomato Republic company simulation. Values are serializable; every command
 * returns a new state so saves and UI previews cannot mutate the running firm.
 * Money is in euros. Stock and capacity are crates of tomatoes.
 */
const VERSION = 3;
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const amount = (value) => Math.round(value * 100) / 100;
const finite = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const euro = (value) => `${Math.round(value).toLocaleString("pt-PT")} €`;
const baseName = "Raiz & Sol";

export const STORY_CHAPTERS = [
  {
    id: "heranca",
    title: "A herança",
    mentor: "Marta Silva · agrónoma da cooperativa",
  },
  {
    id: "mercado",
    title: "O primeiro mercado",
    mentor: "Rui Costa · distribuidor do bairro",
  },
  {
    id: "contas",
    title: "Água e contas",
    mentor: "Marta Silva · agrónoma da cooperativa",
  },
  {
    id: "cidade",
    title: "A cidade escolhe",
    mentor: "Dra. Leonor · laboratório municipal",
  },
  {
    id: "legado",
    title: "O nome que fica",
    mentor: "Inês · neta de Anselmo e tua sócia",
  },
];

const EVENTS = [
  {
    id: "heranca",
    chapter: 0,
    minDay: 1,
    title: "Uma chave, uma estufa e uma dívida",
    body: "Anselmo deixou uma estufa pequena e cinco mil euros por pagar. A última colheita ainda está nos caixotes. Inês entrega-te as chaves: «Podemos vender tudo. Ou fazer deste lugar uma empresa que a cidade volte a reconhecer.» O primeiro cliente espera na cooperativa.",
    choices: [
      {
        id: "legado",
        label: "Continuar a promessa de Anselmo",
        description:
          "Mantém a relação com os vizinhos e começa pela confiança.",
        effects: "Confiança +12 · reputação +5",
        values: { trust: 12, reputation: 5 },
        flags: { legacy: true },
      },
      {
        id: "nova-marca",
        label: "Dar uma identidade nova à empresa",
        description: "Investe num lançamento próprio e em novos clientes.",
        effects: "Custo 300 € · reputação +12 · confiança −3",
        cost: 300,
        values: { reputation: 12, trust: -3 },
        flags: { newBrand: true },
      },
    ],
  },
  {
    id: "cultivo",
    chapter: 0,
    minDay: 1,
    title: "O que queres pôr nas caixas?",
    body: "Marta examina o solo e propõe dois caminhos. A produção biológica melhora o sabor e protege a terra, mas rende menos por dia. O cultivo intensivo enche as caixas mais depressa, à custa de água, qualidade e margem para erros. Não é só uma etiqueta: vai mudar todas as próximas colheitas.",
    choices: [
      {
        id: "biologico",
        label: "Escolher cultivo biológico",
        description:
          "Sementes melhores, rotação do solo e mais cuidado em cada caixa.",
        effects:
          "Custo 350 € · qualidade +15 · sustentabilidade +22 · produção diária menor",
        cost: 350,
        values: { quality: 15, sustainability: 22 },
        set: { productionMode: "organic" },
        flags: { organic: true },
      },
      {
        id: "intensivo",
        label: "Priorizar volume e rapidez",
        description:
          "Aumenta a produção, aceitando mais pressão sobre a terra.",
        effects:
          "Capacidade +30 · qualidade −8 · sustentabilidade −20 · produção diária maior",
        values: { capacity: 30, quality: -8, sustainability: -20 },
        set: { productionMode: "intensive" },
        flags: { intensive: true },
      },
      {
        id: "equilibrado",
        label: "Crescer devagar, com cultivo integrado",
        description: "Mantém custos baixos e aprende antes de apostar tudo.",
        effects: "Qualidade +5 · sustentabilidade +8",
        values: { quality: 5, sustainability: 8 },
        set: { productionMode: "balanced" },
      },
    ],
  },
  {
    id: "parceiro",
    chapter: 1,
    minDay: 2,
    title: "A proposta que chega num carro preto",
    body: "Artur, da AgroNorte, oferece um adiantamento para ter prioridade sobre a tua produção. Rui prefere juntar-te à rede local: paga menos por caixa, mas abre as portas do bairro. Uma terceira opção é manter a independência e procurar clientes sozinho.",
    choices: [
      {
        id: "cooperativa",
        label: "Entrar na rede da cooperativa",
        description:
          "Vizinhos primeiro, contratos estáveis e uma empresa com raízes.",
        effects: "Confiança +15 · reputação +5 · preço local estável",
        values: { trust: 15, reputation: 5 },
        set: { partner: "cooperative" },
        flags: { cooperative: true },
      },
      {
        id: "agronorte",
        label: "Aceitar o adiantamento da AgroNorte",
        description:
          "Recebe capital imediato e compromete parte das próximas margens.",
        effects:
          "Caixa +900 € · confiança −10 · preço por caixa ligeiramente menor",
        values: { cash: 900, trust: -10 },
        set: { partner: "corporate" },
        flags: { corporateDeal: true },
      },
      {
        id: "independente",
        label: "Vender com uma rede própria",
        description: "Investe em contactos e conserva o controlo das decisões.",
        effects: "Custo 250 € · reputação +8 · qualidade +2",
        cost: 250,
        values: { reputation: 8, quality: 2 },
        set: { partner: "independent" },
      },
    ],
  },
  {
    id: "equipa",
    chapter: 1,
    minDay: 3,
    title: "Quem faz a empresa crescer?",
    body: "Os pedidos aumentam e as duas pessoas da equipa já chegam cedo demais à estufa. Rui conhece uma especialista que quer um contrato justo. Artur recomenda uma agência de trabalho temporário. Também podes ficar com a equipa atual, sem prometer uma expansão que ainda não consegues pagar.",
    choices: [
      {
        id: "contrato-justo",
        label: "Contratar uma especialista com salário justo",
        description:
          "Mais conhecimento, melhor moral e maior despesa salarial diária.",
        effects: "Custo 420 € · equipa +1 · confiança +14 · qualidade +4",
        cost: 420,
        values: { staff: 1, trust: 14, quality: 4 },
        set: { wagePolicy: "fair" },
        flags: { fairEmployment: true },
      },
      {
        id: "temporarios",
        label: "Recorrer à agência temporária",
        description:
          "Ganha capacidade humana rapidamente, com condições mais frágeis.",
        effects: "Custo 180 € · equipa +2 · confiança −14 · qualidade −3",
        cost: 180,
        values: { staff: 2, trust: -14, quality: -3 },
        set: { wagePolicy: "agency" },
        flags: { temporaryStaff: true },
      },
      {
        id: "equipa-atual",
        label: "Manter a equipa e cumprir o que prometeste",
        description: "Adia a expansão e protege o orçamento.",
        effects: "Confiança +4 · sem custo",
        values: { trust: 4 },
      },
    ],
  },
  {
    id: "preco",
    chapter: 1,
    minDay: 4,
    title: "O preço de uma boa colheita",
    body: "O mercado quer caixas acessíveis e os restaurantes querem tomates excecionais. Não podes ser tudo para todos. A escolha de hoje altera a margem dos próximos contratos e a forma como a cidade vê a empresa.",
    choices: [
      {
        id: "preco-bairro",
        label: "Manter um preço justo para o bairro",
        description:
          "Baixa a margem por caixa para reforçar a relação com os clientes.",
        effects: "Confiança +12 · reputação +6 · margem menor",
        values: { trust: 12, reputation: 6 },
        set: { pricing: "community" },
      },
      {
        id: "marca-premium",
        label: "Criar uma linha de seleção premium",
        description:
          "Triagem adicional para restaurantes e compradores exigentes.",
        effects: "Custo 200 € · qualidade +9 · preço por caixa maior",
        cost: 200,
        values: { quality: 9, reputation: 7, trust: -3 },
        set: { pricing: "premium" },
        flags: { premium: true },
      },
      {
        id: "marca-volume",
        label: "Competir pelo volume",
        description: "Mais caixas, menos seleção e custos controlados.",
        effects: "Capacidade +25 · qualidade −7 · confiança −5",
        values: { capacity: 25, quality: -7, trust: -5 },
        set: { pricing: "volume" },
      },
    ],
  },
  {
    id: "seca",
    chapter: 2,
    minDay: 5,
    title: "A água deixou de chegar",
    body: "A temperatura sobe e o canal está quase seco. Marta avisa que a forma como responderes afetará duas colheitas e a relação com as quintas vizinhas. Podes instalar rega eficiente, comprar água de emergência ou produzir menos enquanto o vale recupera.",
    choices: [
      {
        id: "rega-eficiente",
        label: "Instalar rega gota a gota",
        description:
          "Um investimento duradouro que reduz o impacto dos dias secos.",
        effects:
          "Custo 550 € · sustentabilidade +18 · capacidade +10 · rega melhorada",
        cost: 550,
        values: { sustainability: 18, capacity: 10 },
        flags: { waterEfficient: true },
        upgrade: "irrigation",
      },
      {
        id: "agua-emergencia",
        label: "Comprar água de emergência",
        description: "Mantém a produção agora, mas retira recursos ao vale.",
        effects: "Custo 180 € · sustentabilidade −16 · confiança −8",
        cost: 180,
        values: { sustainability: -16, trust: -8 },
        flags: { emergencyWater: true },
      },
      {
        id: "partilhar-agua",
        label: "Partilhar água e reduzir duas colheitas",
        description:
          "Aceita uma quebra temporária para não deixar os vizinhos sem água.",
        effects:
          "Produção −25% durante 2 dias · confiança +12 · sustentabilidade +10",
        values: { trust: 12, sustainability: 10 },
        flags: { waterSolidarity: true },
        shock: 2,
      },
    ],
  },
  {
    id: "financiamento",
    chapter: 2,
    minDay: 6,
    title: "O banco quer uma resposta",
    body: "A dívida de Anselmo continua a gerar juros. O banco propõe mais crédito; uma investidora propõe entrar no capital; Inês prefere pagar parte do que devem e continuar devagar. Dinheiro rápido dá margem para crescer, mas cobra sempre alguma coisa em troca.",
    choices: [
      {
        id: "credito",
        label: "Contrair um crédito para expandir",
        description:
          "Recebe dinheiro agora, aumentando a dívida e os juros diários.",
        effects: "Caixa +1 800 € · dívida +2 200 €",
        values: { cash: 1800, debt: 2200 },
        flags: { bankLoan: true },
      },
      {
        id: "investidora",
        label: "Aceitar uma sócia investidora",
        description: "Vende 25% da empresa em troca de capital e contactos.",
        effects: "Caixa +2 400 € · participação externa 25% · reputação +6",
        values: { cash: 2400, reputation: 6, trust: -3 },
        set: { equity: 0.25 },
        flags: { investor: true },
      },
      {
        id: "amortizar",
        label: "Negociar e amortizar parte da dívida",
        description: "Usa a tesouraria para reduzir obrigações futuras.",
        effects: "Custo 1 000 € · dívida −1 200 € · confiança +6",
        cost: 1000,
        values: { debt: -1200, trust: 6 },
        flags: { repaidDebt: true },
      },
      {
        id: "sem-financiamento",
        label: "Recusar capital e manter o plano atual",
        description: "Conserva o controlo sem comprometer o orçamento de hoje.",
        effects: "Confiança +3 · sem custo",
        values: { trust: 3 },
      },
    ],
  },
  {
    id: "qualidade",
    chapter: 3,
    minDay: 7,
    title: "Uma fotografia que corre a cidade",
    body: "Uma caixa estragada aparece nas redes sociais. A imagem nem sequer mostra a tua marca com clareza, mas os clientes perguntam. Leonor oferece uma análise independente. O gabinete de comunicação sugere uma campanha. Inês pede que mostres o processo e assumas o que houver a corrigir.",
    choices: [
      {
        id: "analise-independente",
        label: "Pagar uma análise independente",
        description:
          "Publica resultados e corrige o processo com ajuda do laboratório.",
        effects: "Custo 350 € · qualidade +14 · reputação +10 · confiança +6",
        cost: 350,
        values: { quality: 14, reputation: 10, trust: 6 },
        flags: { certified: true },
      },
      {
        id: "campanha-imagem",
        label: "Responder apenas com publicidade",
        description:
          "Controla a imagem depressa, sem resolver a origem do problema.",
        effects: "Custo 150 € · reputação +5 · confiança −13 · qualidade −3",
        cost: 150,
        values: { reputation: 5, trust: -13, quality: -3 },
        flags: { greenwashing: true },
      },
      {
        id: "portas-abertas",
        label: "Abrir as portas e mostrar o trabalho",
        description:
          "Fala com os clientes e dedica uma manhã a rever a seleção.",
        effects: "Confiança +14 · reputação +6 · qualidade +4",
        values: { trust: 14, reputation: 6, quality: 4 },
        flags: { transparency: true },
      },
    ],
  },
  {
    id: "exportacao",
    chapter: 3,
    minDay: 8,
    title: "Do vale para lá do horizonte",
    body: "No porto há compradores que nunca provaram os teus tomates. Um distribuidor aceita experimentar uma rota de exportação se financiares a certificação logística. A cooperativa prefere criar uma rede estável entre mercados, restaurantes e escolas da cidade.",
    choices: [
      {
        id: "exportar",
        label: "Abrir a rota do porto",
        description:
          "Investe na logística e desbloqueia contratos de exportação mais exigentes.",
        effects: "Custo 600 € · reputação +12 · exportação desbloqueada",
        cost: 600,
        values: { reputation: 12, capacity: 10 },
        flags: { exports: true },
      },
      {
        id: "rede-local",
        label: "Consolidar a rede da cidade",
        description:
          "Cresce com clientes próximos e uma relação mais duradoura.",
        effects: "Confiança +13 · reputação +7 · sustentabilidade +4",
        values: { trust: 13, reputation: 7, sustainability: 4 },
        flags: { localNetwork: true },
      },
    ],
  },
  {
    id: "trabalho",
    chapter: 3,
    minDay: 9,
    title: "A empresa também é de quem lá trabalha",
    body: "A equipa está cansada. Com o crescimento vieram horários mais apertados e caixas a mais para as mesmas mãos. Podes distribuir uma parte dos resultados, investir em automação ou negociar uma carga mais realista para os próximos dias.",
    choices: [
      {
        id: "partilhar-resultados",
        label: "Distribuir um prémio pela equipa",
        description: "Reconhece o esforço e melhora a organização do trabalho.",
        effects: "Custo 400 € · confiança +18 · capacidade +10",
        cost: 400,
        values: { trust: 18, capacity: 10 },
        flags: { sharedProfits: true },
      },
      {
        id: "automatizar",
        label: "Automatizar a seleção e embalagem",
        description:
          "Compra equipamento mais produtivo, sem resolver a insatisfação.",
        effects: "Custo 800 € · capacidade +60 · confiança −12",
        cost: 800,
        values: { capacity: 60, trust: -12 },
        flags: { automation: true },
      },
      {
        id: "renegociar-turnos",
        label: "Reduzir a carga e reorganizar turnos",
        description: "Entrega menos volume para reconstruir a confiança.",
        effects: "Capacidade −10 · confiança +10 · qualidade +3",
        values: { capacity: -10, trust: 10, quality: 3 },
        flags: { humaneShifts: true },
      },
    ],
  },
  {
    id: "a-oferta",
    chapter: 4,
    minDay: 10,
    title: "O preço do teu nome",
    body: "Artur volta com uma proposta de aquisição. A marca fica, mas a maioria das decisões passa a ser tomada noutro escritório. A cooperativa propõe um caminho partilhado. Inês põe a velha chave de Anselmo na mesa: «Precisamos de decidir o que significa crescer.»",
    choices: [
      {
        id: "vender-maioria",
        label: "Vender o controlo à AgroNorte",
        description:
          "Ganha uma grande entrada de dinheiro e abdica da maioria do capital.",
        effects: "Caixa +6 000 € · participação externa 65% · confiança −20",
        values: { cash: 6000, trust: -20, reputation: 5 },
        set: { equity: 0.65, partner: "corporate" },
        flags: { soldMajority: true },
      },
      {
        id: "empresa-independente",
        label: "Manter a empresa independente",
        description:
          "Conserva a liberdade, a dívida e a responsabilidade pelo futuro.",
        effects: "Confiança +10 · reputação +8",
        values: { trust: 10, reputation: 8 },
        flags: { independentFuture: true },
      },
      {
        id: "empresa-cooperativa",
        label: "Transformar a empresa numa cooperativa",
        description:
          "Investe num modelo partilhado com trabalhadores e produtores locais.",
        effects:
          "Custo 750 € · dívida −1 000 € · confiança +20 · sustentabilidade +5",
        cost: 750,
        values: { debt: -1000, trust: 20, sustainability: 5 },
        set: { partner: "cooperative", equity: 0 },
        flags: { workerOwned: true },
      },
    ],
  },
  {
    id: "a-promessa",
    chapter: 4,
    minDay: 11,
    title: "O nome que vai ficar",
    body: "A primeira grande época chegou ao fim. Há contas para fazer, pessoas para ouvir e uma cidade que já tem opinião sobre a tua empresa. O resultado não depende apenas da última escolha: depende do que produziste, de quem pagou o crescimento e das promessas que cumpriste.",
    choices: [
      {
        id: "promessa-cuidado",
        label: "Prometer cuidar da terra e das pessoas",
        description:
          "Fecha a época com uma prioridade clara para os próximos anos.",
        effects:
          "Confiança +8 · sustentabilidade +8 · revela o desfecho da empresa",
        values: { trust: 8, sustainability: 8 },
        flags: { carePromise: true },
        finale: true,
      },
      {
        id: "promessa-escala",
        label: "Prometer levar a marca mais longe",
        description:
          "Assume a ambição de crescer e aceita que a escala tem custos.",
        effects:
          "Capacidade +20 · reputação +6 · sustentabilidade −8 · revela o desfecho",
        values: { capacity: 20, reputation: 6, sustainability: -8 },
        flags: { scalePromise: true },
        finale: true,
      },
    ],
  },
];

const UPGRADE_DEFS = [
  {
    id: "irrigation",
    name: "Rega gota a gota",
    description: "Protege a produção dos dias secos e usa menos água.",
    cost: 550,
    max: 1,
    values: { sustainability: 12, capacity: 10 },
    flags: { waterEfficient: true },
  },
  {
    id: "coldstore",
    name: "Câmara de frio",
    description: "Mais 350 caixas de armazenamento e seleção mais consistente.",
    cost: 900,
    max: 1,
    values: { quality: 5 },
  },
  {
    id: "greenhouse",
    name: "Nova estufa",
    description:
      "Expande o terreno e acrescenta 90 caixas de capacidade diária.",
    cost: 1600,
    max: 3,
    values: { capacity: 90, land: 1, sustainability: -3 },
  },
  {
    id: "staff",
    name: "Contratar especialista",
    description:
      "Mais uma pessoa na equipa, com salário diário e capacidade para trabalhar a nova estufa.",
    cost: 350,
    max: 4,
    values: { staff: 1, trust: 3 },
  },
  {
    id: "laboratory",
    name: "Laboratório de qualidade",
    description:
      "Melhora a qualidade e a reputação de todas as próximas caixas.",
    cost: 1100,
    max: 1,
    values: { quality: 12, reputation: 6 },
  },
  {
    id: "solar",
    name: "Energia solar",
    description: "Reduz despesas fixas diárias em 35 € e a pegada da empresa.",
    cost: 1000,
    max: 1,
    values: { sustainability: 20 },
  },
  {
    id: "fleet",
    name: "Frota de distribuição",
    description:
      "Compra a primeira carrinha com motorista para entregas autónomas e aumenta em 10% os pagamentos de novos contratos.",
    cost: 1300,
    max: 1,
    values: { reputation: 5 },
  },
];

const DESTINATION_NAMES = {
  cooperativa: "Cooperativa da Raiz",
  mercado: "Mercado Central",
  restaurantes: "Praça dos Restaurantes",
  porto: "Terminal do Porto",
  universidade: "Instituto Agronómico",
};
function log(state, title, body, kind = "company") {
  state.history.push({ day: state.day, title, body, kind });
  if (state.history.length > 100)
    state.history.splice(0, state.history.length - 100);
}
function boundStats(state) {
  for (const stat of ["quality", "reputation", "trust", "sustainability"])
    state[stat] = amount(clamp(state[stat], 0, 100));
  state.cash = amount(Math.max(0, state.cash));
  state.debt = amount(Math.max(0, state.debt));
  state.capacity = Math.round(clamp(state.capacity, 30, 1500));
  state.staff = Math.round(clamp(state.staff, 1, 20));
  state.land = Math.round(clamp(state.land, 1, 8));
  state.stock = Math.max(0, Math.round(state.stock));
  state.equity = clamp(state.equity, 0, 0.99);
}
function change(state, values = {}) {
  for (const [key, value] of Object.entries(values)) state[key] += value;
  boundStats(state);
}
function storageLimit(state) {
  return 280 + state.land * 70 + (state.upgrades.coldstore || 0) * 350;
}
function contractPrice(state) {
  const mood = [0.96, 1.04, 1.0, 1.08, 0.95, 1.02, 1.06][(state.day - 1) % 7];
  const strategy =
    state.pricing === "premium"
      ? 1.6
      : state.pricing === "community"
        ? -0.3
        : state.pricing === "volume"
          ? -0.6
          : 0;
  const partner =
    state.partner === "corporate"
      ? -0.25
      : state.partner === "cooperative"
        ? 0.15
        : 0;
  return (
    (4.7 +
      state.quality * 0.025 +
      state.reputation * 0.012 +
      strategy +
      partner) *
    mood *
    (state.upgrades.fleet ? 1.1 : 1)
  );
}
function offersFor(state) {
  const destinations = [
    "cooperativa",
    "mercado",
    state.flags.exports
      ? "porto"
      : state.quality >= 82 && state.day % 2 === 0
        ? "universidade"
        : "restaurantes",
  ];
  return destinations.map((destination, index) => {
    const quantity = Math.round(
      22 + index * 6 + Math.min(16, state.day - 1) + state.land * 2,
    );
    const premium =
      destination === "porto" ? 1.35 : destination === "universidade" ? 1.2 : 1;
    return {
      id: `dia-${state.day}-${destination}`,
      title: `${destination === "porto" ? "Exportação" : "Entrega"} · ${DESTINATION_NAMES[destination]}`,
      destination,
      quantity,
      payment: Math.round(quantity * contractPrice(state) * premium),
      status: "available",
      createdDay: state.day,
      deadlineDay: state.day + 2,
      reserved: 0,
    };
  });
}
function endingFor(state, forced = false) {
  if (forced)
    return {
      id: "recomecar",
      title: "A empresa precisa de um recomeço",
      body: "A dívida tornou-se maior do que a colheita conseguia sustentar. A cidade ainda está aqui: podes continuar a negociar e recuperar a empresa, mas esta época terminou sob gestão de emergência.",
      tone: "difficult",
    };
  if (state.flags.soldMajority || state.equity >= 0.5)
    return {
      id: "nome-na-fachada",
      title: "O teu nome ficou na fachada",
      body: "A marca cresceu, as contas ganharam fôlego e os camiões chegaram mais longe. Mas a última palavra já não é tua. Inês guarda a chave de Anselmo: a empresa sobreviveu, o controlo mudou de mãos.",
      tone: "bittersweet",
    };
  if (state.trust < 38 || state.sustainability < 28)
    return {
      id: "colheita-amarga",
      title: "Uma colheita com sabor amargo",
      body: "Houve crescimento, mas parte da cidade e da terra pagou-o. Ainda podes reparar as relações e mudar os processos. O saldo não conta toda a história da empresa que construíste.",
      tone: "difficult",
    };
  if (state.completedDeliveries < 6)
    return {
      id: "primeira-rede",
      title:
        state.completedDeliveries === 0
          ? "Uma empresa à procura de clientes"
          : "Os primeiros clientes, não o último capítulo",
      body:
        state.completedDeliveries === 0
          ? "As tuas escolhas deram uma identidade à empresa, mas ainda nenhuma caixa chegou a um cliente. Há uma estufa, uma equipa e contas para pagar. A boa intenção precisa agora de se tornar trabalho: aceita contratos e faz as primeiras entregas. Podes continuar a construir essa rede depois desta época."
          : "A empresa já fez as primeiras entregas, mas ainda não construiu uma rede que sustente as suas ambições. As escolhas ficaram registadas; o próximo passo é transformá-las em relações regulares com clientes. Continua a entregar e a gerir a empresa depois desta época.",
      tone: "developing",
    };
  if (
    state.trust >= 75 &&
    state.sustainability >= 70 &&
    state.reputation >= 50 &&
    state.completedDeliveries >= 6
  )
    return {
      id: "raizes-da-cidade",
      title: "As raízes de uma cidade inteira",
      body: "As tuas caixas alimentam o bairro e o bairro sustenta a empresa. A terra foi preservada, a equipa tem voz e o nome de Anselmo passou a significar futuro. Cresceste sem deixares a cidade para trás.",
      tone: "hopeful",
    };
  if (
    state.flags.exports &&
    state.quality >= 80 &&
    state.reputation >= 65 &&
    state.debt < 12000 &&
    state.completedDeliveries >= 9 &&
    state.destinationDeliveries.porto >= 1
  )
    return {
      id: "sabor-sem-fronteiras",
      title: "Um sabor sem fronteiras",
      body: "A primeira rota do porto tornou-se uma rede de clientes. A qualidade abriu portas que uma campanha não compraria. A tua empresa continua independente e os tomates da cidade chegaram ao mundo.",
      tone: "hopeful",
    };
  if (
    (state.cash >= 6000 || state.capacity >= 240) &&
    state.reputation >= 55 &&
    state.completedDeliveries >= 9
  )
    return {
      id: "capital-do-tomate",
      title: "A capital do tomate",
      body: "Da pequena estufa nasceu uma empresa com escala. Há terreno, equipa e clientes para uma nova época. O desafio agora é crescer sem perderes de vista as pessoas que tornaram isso possível.",
      tone: "ambitious",
    };
  return {
    id: "empresa-de-pe",
    title: "Uma empresa de pé",
    body: "Ainda há contas e trabalho pela frente, mas a estufa já não é apenas uma herança difícil. Tens clientes, uma equipa e liberdade para escolher o próximo caminho. A primeira época foi só o começo.",
    tone: "hopeful",
  };
}

function normalizeOperationsState(input, company) {
  const saved = input && typeof input === "object" ? input : {};
  const rawFleet = Array.isArray(saved.fleet)
    ? saved.fleet.filter((item) => item && typeof item === "object").slice(0, 3)
    : [];
  if (company.upgrades.fleet && !rawFleet.length) rawFleet.push({});
  if (rawFleet.length) company.upgrades.fleet = 1;
  const assigned = new Set();
  const fleet = rawFleet.map((item, index) => {
    const id = `van-${index + 1}`;
    const order = company.contracts.find(
      (contract) => contract.id === item.contractId,
    );
    let status = ["outbound", "returning"].includes(item.status)
      ? item.status
      : "idle";
    if (
      status === "outbound" &&
      (!order || order.status !== "accepted" || assigned.has(order.id))
    )
      status = "idle";
    if (status === "outbound") {
      assigned.add(order.id);
      order.fleetVehicleId = id;
    }
    const duration = clamp(finite(item.duration, 45), 1, 300);
    return {
      id,
      name: `Distribuição ${String(index + 1).padStart(2, "0")}`,
      status,
      contractId:
        status === "idle"
          ? null
          : typeof item.contractId === "string"
            ? item.contractId
            : null,
      destination:
        status === "idle"
          ? null
          : order?.destination ||
            (DESTINATION_NAMES[item.destination] ? item.destination : null),
      duration,
      remaining:
        status === "idle"
          ? 0
          : clamp(finite(item.remaining, duration), 0, duration),
      dispatchCost: amount(clamp(finite(item.dispatchCost, 0), 0, 1000)),
      tripId: Math.max(0, Math.floor(finite(item.tripId, 0))),
    };
  });
  for (const order of company.contracts) {
    if (order.fleetVehicleId && !assigned.has(order.id))
      delete order.fleetVehicleId;
  }
  const shop = saved.shop && typeof saved.shop === "object" ? saved.shop : {};
  const greenhouse =
    saved.greenhouse && typeof saved.greenhouse === "object"
      ? saved.greenhouse
      : {};
  const negotiations = {};
  if (saved.negotiations && typeof saved.negotiations === "object") {
    for (const id of ["marta", "rui", "sofia", "artur", "leonor"]) {
      const negotiation = saved.negotiations[id];
      if (negotiation && typeof negotiation === "object") {
        negotiations[id] = {
          day: Math.round(clamp(finite(negotiation.day, 0), 0, 9999)),
          contractId:
            typeof negotiation.contractId === "string"
              ? negotiation.contractId
              : "",
          offerId: ["fair", "premium", "volume"].includes(negotiation.offerId)
            ? negotiation.offerId
            : "fair",
        };
      }
    }
  }
  return {
    version: 1,
    clock: Math.max(0, finite(saved.clock, 0)),
    fleet,
    shop: {
      stock: Math.round(clamp(finite(shop.stock, 0), 0, 120)),
      sold: Math.max(0, Math.floor(finite(shop.sold, 0))),
      revenue: amount(Math.max(0, finite(shop.revenue, 0))),
      elapsed: clamp(finite(shop.elapsed, 0), 0, 8),
      visitors: Math.max(0, Math.floor(finite(shop.visitors, 0))),
    },
    greenhouse: {
      wateredDay: Math.round(clamp(finite(greenhouse.wateredDay, 0), 0, 9999)),
      harvestedDay: Math.round(
        clamp(finite(greenhouse.harvestedDay, 0), 0, 9999),
      ),
      lastHarvest: Math.max(0, Math.floor(finite(greenhouse.lastHarvest, 0))),
      harvested: Math.max(0, Math.floor(finite(greenhouse.harvested, 0))),
      waterings: Math.max(0, Math.floor(finite(greenhouse.waterings, 0))),
    },
    negotiations,
    fleetDeliveries: Math.max(0, Math.floor(finite(saved.fleetDeliveries, 0))),
    fleetCosts: amount(Math.max(0, finite(saved.fleetCosts, 0))),
  };
}

export function createCompany(name = baseName) {
  const state = {
    version: VERSION,
    name:
      String(name || baseName)
        .trim()
        .slice(0, 36) || baseName,
    day: 1,
    cash: 2500,
    debt: 5000,
    stock: 90,
    quality: 58,
    reputation: 30,
    trust: 50,
    sustainability: 45,
    staff: 2,
    capacity: 110,
    land: 1,
    equity: 0,
    productionMode: "balanced",
    pricing: "balanced",
    partner: "independent",
    wagePolicy: "fair",
    upgrades: {},
    flags: {},
    contracts: [],
    history: [],
    eventIndex: 0,
    chapter: 0,
    decisions: [],
    completedDeliveries: 0,
    destinationDeliveries: {},
    revenue: 0,
    expenses: 0,
    produced: 0,
    shockDays: 0,
    insolventDays: 0,
    ending: null,
    lastReport: null,
  };
  state.contracts = offersFor(state);
  state.operations = normalizeOperationsState(null, state);
  state.ownership = normalizeOwnershipState(null);
  log(
    state,
    "A chave de Anselmo",
    "Herdaste uma estufa, 90 caixas e uma dívida de 5 000 €. A primeira entrega espera na cooperativa.",
    "story",
  );
  return state;
}

export function normalizeCompany(saved) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved))
    return createCompany();
  const initial = createCompany(saved.name);
  const state = { ...initial, ...clone(saved), version: VERSION };
  state.name =
    String(saved.name || baseName)
      .trim()
      .slice(0, 36) || baseName;
  for (const key of [
    "cash",
    "debt",
    "stock",
    "quality",
    "reputation",
    "trust",
    "sustainability",
    "staff",
    "capacity",
    "land",
    "equity",
    "completedDeliveries",
    "revenue",
    "expenses",
    "produced",
    "shockDays",
    "insolventDays",
  ])
    state[key] = finite(state[key], initial[key]);
  state.day = Math.round(clamp(finite(saved.day, 1), 1, 9999));
  state.eventIndex = Math.round(
    clamp(finite(saved.eventIndex, 0), 0, EVENTS.length),
  );
  state.chapter = EVENTS[Math.min(state.eventIndex, EVENTS.length - 1)].chapter;
  state.flags =
    saved.flags &&
    typeof saved.flags === "object" &&
    !Array.isArray(saved.flags)
      ? { ...saved.flags }
      : {};
  state.upgrades =
    saved.upgrades &&
    typeof saved.upgrades === "object" &&
    !Array.isArray(saved.upgrades)
      ? { ...saved.upgrades }
      : {};
  for (const definition of UPGRADE_DEFS)
    state.upgrades[definition.id] = Math.round(
      clamp(finite(state.upgrades[definition.id], 0), 0, definition.max),
    );
  state.history = Array.isArray(saved.history)
    ? clone(saved.history.slice(-100))
    : initial.history;
  state.decisions = Array.isArray(saved.decisions)
    ? clone(saved.decisions.slice(0, EVENTS.length))
    : [];
  state.contracts = Array.isArray(saved.contracts)
    ? clone(saved.contracts)
        .filter(
          (c) =>
            c &&
            typeof c.id === "string" &&
            DESTINATION_NAMES[c.destination] &&
            [
              "available",
              "accepted",
              "delivered",
              "failed",
              "expired",
            ].includes(c.status),
        )
        .slice(-120)
    : offersFor(state);
  for (const contract of state.contracts) {
    contract.quantity = Math.round(
      clamp(finite(contract.quantity, 24), 1, 10000),
    );
    contract.payment = amount(clamp(finite(contract.payment, 0), 0, 1000000));
    contract.deadlineDay = Math.round(
      clamp(finite(contract.deadlineDay, state.day + 2), 1, 10000),
    );
    contract.reserved = contract.status === "accepted" ? contract.quantity : 0;
  }
  state.completedDeliveries = Math.max(
    0,
    Math.floor(state.completedDeliveries),
  );
  state.destinationDeliveries = Object.fromEntries(
    Object.keys(DESTINATION_NAMES).map((destination) => [
      destination,
      Math.max(
        0,
        Math.floor(
          finite(
            saved.destinationDeliveries?.[destination],
            state.contracts.filter(
              (contract) =>
                contract.status === "delivered" &&
                contract.destination === destination,
            ).length,
          ),
        ),
      ),
    ]),
  );
  if (!["organic", "intensive", "balanced"].includes(state.productionMode))
    state.productionMode = "balanced";
  if (!["premium", "community", "volume", "balanced"].includes(state.pricing))
    state.pricing = "balanced";
  if (!["corporate", "cooperative", "independent"].includes(state.partner))
    state.partner = "independent";
  if (!["fair", "agency"].includes(state.wagePolicy)) state.wagePolicy = "fair";
  state.shockDays = Math.round(clamp(state.shockDays, 0, 5));
  state.ending =
    saved.ending && typeof saved.ending === "object"
      ? clone(saved.ending)
      : null;
  boundStats(state);
  state.operations = normalizeOperationsState(saved.operations, state);
  state.ownership = normalizeOwnershipState(saved.ownership);
  return state;
}
function result(ok, message, state, extra = {}) {
  return { ok, message, state, ...extra };
}
function failure(state, message) {
  return result(false, message, normalizeCompany(state));
}
function effectiveChoice(state, choice) {
  if (choice.upgrade && state.upgrades[choice.upgrade])
    return {
      ...choice,
      label: "Usar a rega eficiente já instalada",
      description:
        "O investimento anterior protege agora esta colheita, sem pagar novamente.",
      effects: "Sem custo adicional · confiança +4 · produção protegida",
      cost: 0,
      values: { trust: 4 },
    };
  return choice;
}
function choiceReason(state, event, choice) {
  if (state.ending || state.eventIndex >= EVENTS.length)
    return "A história desta época já tem um desfecho.";
  if (state.day < event.minDay) return `Disponível no dia ${event.minDay}.`;
  if (state.cash < (choice.cost || 0))
    return `Precisas de ${euro(choice.cost)} em caixa.`;
  return "";
}

export function getCompanyView(input) {
  const state = normalizeCompany(input),
    event = EVENTS[state.eventIndex],
    chapter = STORY_CHAPTERS[state.chapter];
  const choices = event
    ? event.choices.map((option) => {
        const choice = effectiveChoice(state, option);
        return {
          id: choice.id,
          label: choice.label,
          description: choice.description,
          effects: choice.effects,
          disabled: !!choiceReason(state, event, choice),
          reason: choiceReason(state, event, choice),
        };
      })
    : [];
  const deliveriesToday = state.contracts.filter(
    (c) => c.status === "delivered" && c.deliveredDay === state.day,
  ).length;
  return {
    title: state.name,
    objective: state.ending
      ? "Continua a explorar e a gerir a empresa, ou começa uma nova história."
      : event && state.day >= event.minDay
        ? `Decide: ${event.title}.`
        : `Faz entregas, prepara a produção e termina o dia para chegar à próxima decisão.`,
    chapterLabel: `CAPÍTULO ${state.chapter + 1} / 5 · ${chapter.title.toUpperCase()}`,
    mentor: chapter.mentor,
    dialogue: state.ending
      ? state.ending.body
      : event?.body ||
        "A tua próxima época começa com as escolhas de todos os dias.",
    event:
      event && !state.ending
        ? {
            id: event.id,
            title: event.title,
            body: event.body,
            minDay: event.minDay,
            ready: state.day >= event.minDay,
          }
        : null,
    decisions: choices,
    upgrades: UPGRADE_DEFS.map((def) => {
      const owned = state.upgrades[def.id] || 0,
        cost = Math.round(def.cost * (1 + owned * 0.35));
      const reason =
        owned >= def.max
          ? "Melhoria concluída."
          : state.cash < cost
            ? `Precisas de ${euro(cost)} em caixa.`
            : "";
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        cost,
        owned,
        max: def.max,
        disabled: !!reason,
        reason,
      };
    }),
    contracts: state.contracts
      .filter((c) => c.status === "available" || c.status === "accepted")
      .map((c) => ({
        ...c,
        destinationName: DESTINATION_NAMES[c.destination],
        disabled: c.status === "available" && state.stock < c.quantity,
        reason:
          c.status === "available" && state.stock < c.quantity
            ? "Não há caixas livres suficientes."
            : "",
      })),
    stats: {
      day: state.day,
      cash: state.cash,
      debt: state.debt,
      stock: state.stock,
      reserved: state.contracts
        .filter((c) => c.status === "accepted")
        .reduce((sum, c) => sum + c.quantity, 0),
      quality: state.quality,
      reputation: state.reputation,
      trust: state.trust,
      sustainability: state.sustainability,
      staff: state.staff,
      capacity: state.capacity,
      productionLimit: Math.min(state.capacity, state.staff * 75),
      storageLimit: storageLimit(state),
      equity: state.equity,
      deliveriesToday,
      completedDeliveries: state.completedDeliveries,
      destinationDeliveries: { ...state.destinationDeliveries },
      pricePerCrate: amount(contractPrice(state)),
      productionMode: state.productionMode,
      partner: state.partner,
      profit: amount(state.revenue - state.expenses),
      lastReport: state.lastReport,
    },
    ending: state.ending,
    history: state.history.slice(-12).reverse(),
  };
}

export function applyDecision(input, decisionId) {
  const state = normalizeCompany(input),
    event = EVENTS[state.eventIndex];
  if (!event || state.ending)
    return failure(
      input,
      "Esta época já tem um desfecho. Podes continuar a gerir a empresa.",
    );
  const option = event.choices.find((option) => option.id === decisionId);
  if (!option)
    return failure(input, "Essa decisão não pertence ao capítulo atual.");
  const choice = effectiveChoice(state, option);
  const reason = choiceReason(state, event, choice);
  if (reason) return failure(input, reason);
  const next = clone(state);
  next.cash -= choice.cost || 0;
  next.expenses += choice.cost || 0;
  change(next, choice.values);
  Object.assign(next, choice.set || {});
  Object.assign(next.flags, choice.flags || {});
  if (choice.upgrade)
    next.upgrades[choice.upgrade] = Math.max(
      1,
      next.upgrades[choice.upgrade] || 0,
    );
  if (choice.shock) next.shockDays = choice.shock;
  next.decisions.push({ event: event.id, choice: choice.id, day: next.day });
  next.eventIndex++;
  next.chapter = EVENTS[Math.min(next.eventIndex, EVENTS.length - 1)].chapter;
  log(next, event.title, `${choice.label}. ${choice.effects}`, "decision");
  if (choice.finale || next.eventIndex >= EVENTS.length) {
    next.ending = endingFor(next);
    log(next, next.ending.title, next.ending.body, "ending");
  }
  boundStats(next);
  return result(true, `${choice.label}. ${choice.effects}`, next);
}

export function acceptContract(input, contractId) {
  const state = normalizeCompany(input),
    contract = state.contracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "available")
    return failure(
      input,
      "Este contrato já foi aceite ou deixou de estar disponível.",
    );
  if (state.day > contract.deadlineDay)
    return failure(input, "O prazo deste contrato já terminou.");
  if (state.stock < contract.quantity)
    return failure(
      input,
      `Precisas de ${contract.quantity} caixas livres para aceitar este contrato.`,
    );
  const next = clone(state),
    order = next.contracts.find((c) => c.id === contractId);
  next.stock -= order.quantity;
  order.status = "accepted";
  order.reserved = order.quantity;
  order.acceptedDay = next.day;
  log(
    next,
    "Entrega aceite",
    `${order.quantity} caixas reservadas para ${DESTINATION_NAMES[order.destination]}. Pagamento após a entrega: ${euro(order.payment)}.`,
    "contract",
  );
  return result(
    true,
    `Caixas reservadas. Leva a entrega a ${DESTINATION_NAMES[order.destination]}.`,
    next,
  );
}
export function deliverContract(input, contractId) {
  const state = normalizeCompany(input),
    contract = state.contracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "accepted")
    return failure(input, "Não existe uma entrega pendente com esse número.");
  if (contract.fleetVehicleId)
    return failure(
      input,
      "Esta entrega está atribuída à frota. A carrinha e o motorista estão a tratar do transporte.",
    );
  if (state.day > contract.deadlineDay)
    return failure(
      input,
      "A entrega ultrapassou o prazo. Fecha o dia para atualizar os contratos.",
    );
  const next = clone(state),
    order = next.contracts.find((c) => c.id === contractId);
  order.status = "delivered";
  order.reserved = 0;
  order.deliveredDay = next.day;
  next.cash += order.payment;
  next.revenue += order.payment;
  next.completedDeliveries++;
  next.destinationDeliveries[order.destination] =
    (next.destinationDeliveries[order.destination] || 0) + 1;
  change(next, { reputation: 1.5, trust: 0.8 });
  log(
    next,
    "Entrega concluída",
    `${DESTINATION_NAMES[order.destination]} recebeu ${order.quantity} caixas. Entraram ${euro(order.payment)} na empresa.`,
    "delivery",
  );
  return result(true, `Entrega concluída: +${euro(order.payment)}.`, next, {
    payment: order.payment,
  });
}

export function buyUpgrade(input, upgradeId) {
  const state = normalizeCompany(input),
    definition = UPGRADE_DEFS.find((item) => item.id === upgradeId);
  if (!definition) return failure(input, "Essa melhoria não existe.");
  const owned = state.upgrades[upgradeId] || 0,
    cost = Math.round(definition.cost * (1 + owned * 0.35));
  if (owned >= definition.max)
    return failure(input, "Esta melhoria já atingiu o nível máximo.");
  if (state.cash < cost)
    return failure(input, `Precisas de ${euro(cost)} em caixa.`);
  const next = clone(state);
  next.cash -= cost;
  next.expenses += cost;
  next.upgrades[upgradeId] = owned + 1;
  change(next, definition.values);
  Object.assign(next.flags, definition.flags || {});
  log(
    next,
    "Investimento na empresa",
    `${definition.name}, nível ${owned + 1}. Investimento de ${euro(cost)}.`,
    "upgrade",
  );
  return result(true, `${definition.name}: melhoria instalada.`, next);
}

export function advanceDay(input) {
  const state = normalizeCompany(input),
    event = EVENTS[state.eventIndex];
  if (!state.ending && event && state.day >= event.minDay)
    return failure(
      input,
      "Resolve a decisão da história antes de terminar este dia.",
    );
  const next = clone(state),
    finishedDay = next.day;
  const climate = [1, 0.99, 1.05, 0.97, 0.82, 1.02, 1.07][
    (finishedDay - 1) % 7
  ];
  const weather = climate < 0.9 && next.flags.waterEfficient ? 0.98 : climate;
  const mode =
    next.productionMode === "organic"
      ? 0.88
      : next.productionMode === "intensive"
        ? 1.22
        : 1;
  const morale = 0.78 + next.trust / 225;
  const shock = next.shockDays > 0 ? 0.75 : 1;
  const produced = Math.max(
    0,
    Math.floor(
      Math.min(next.capacity, next.staff * 75) *
        mode *
        morale *
        weather *
        shock,
    ),
  );
  const wages = next.staff * (next.wagePolicy === "agency" ? 32 : 45);
  const overhead = Math.max(35, 95 - (next.upgrades.solar ? 35 : 0));
  const seeds = amount(
    produced * (next.productionMode === "organic" ? 0.48 : 0.36),
  );
  const interest = amount(next.debt * 0.0015);
  const costs = amount(wages + overhead + seeds + interest);
  next.expenses += costs;
  next.produced += produced;
  const shortage = Math.max(0, costs - next.cash);
  next.cash = Math.max(0, next.cash - costs);
  if (shortage > 0) {
    next.debt += shortage * 1.12;
    next.insolventDays++;
    change(next, { trust: -4, reputation: -2 });
  } else next.insolventDays = 0;
  next.stock += produced;
  const spoiled = Math.max(0, next.stock - storageLimit(next));
  next.stock -= spoiled;
  if (next.shockDays > 0) next.shockDays--;
  if (next.productionMode === "intensive")
    change(next, { sustainability: -1, quality: -0.25 });
  else if (next.productionMode === "organic")
    change(next, { sustainability: 0.5, quality: 0.25 });
  next.day++;
  let expired = 0,
    penalties = 0;
  for (const contract of next.contracts) {
    if (contract.status === "available") contract.status = "expired";
    else if (
      contract.status === "accepted" &&
      next.day > contract.deadlineDay
    ) {
      contract.status = "failed";
      contract.reserved = 0;
      expired++;
      const penalty = amount(Math.min(next.cash, contract.payment * 0.12));
      next.cash -= penalty;
      penalties += penalty;
      change(next, { trust: -3, reputation: -4 });
    }
  }
  next.expenses += penalties;
  next.contracts = next.contracts.filter(
    (c) =>
      c.status === "accepted" ||
      (c.deliveredDay || c.createdDay || finishedDay) >= next.day - 3,
  );
  next.contracts.push(...offersFor(next));
  const report = {
    day: finishedDay,
    produced,
    wages,
    overhead,
    seeds,
    interest,
    costs,
    spoiled,
    expired,
    penalties,
    shortage: amount(shortage),
    cash: amount(next.cash),
    debt: amount(next.debt),
    weather:
      climate < 0.9
        ? "Dia seco"
        : climate > 1.03
          ? "Bom tempo"
          : "Tempo estável",
  };
  next.lastReport = report;
  log(
    next,
    `Fecho do dia ${finishedDay}`,
    `${produced} caixas produzidas; despesas ${euro(costs)}${spoiled ? `; ${spoiled} caixas sem armazenamento` : ""}${expired ? `; ${expired} contratos falhados` : ""}. ${shortage ? "Parte dos custos foi financiada como dívida de emergência." : "Contas do dia pagas."}`,
    "report",
  );
  if (!next.ending && next.debt > 20000 && next.insolventDays >= 3) {
    next.ending = endingFor(next, true);
    log(next, next.ending.title, next.ending.body, "ending");
  }
  boundStats(next);
  return result(
    true,
    `Dia ${next.day}: ${produced} caixas produzidas. Despesas: ${euro(costs)}.`,
    next,
    { report },
  );
}
