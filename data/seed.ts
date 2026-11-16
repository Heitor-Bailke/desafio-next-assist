import { database } from "../lib/database";

const now = new Date();
const iso = (date: Date): string => date.toISOString();
const daysAgo = (days: number): string => iso(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));

type SeedUser = {
  id: string;
  email: string;
  name: string;
  role: "employee" | "analyst";
};

const users: SeedUser[] = [
  { id: "user-ana", email: "ana.silva@nexo.com", name: "Ana Silva", role: "employee" },
  { id: "user-bruno", email: "bruno.costa@nexo.com", name: "Bruno Costa", role: "employee" },
  { id: "user-carla", email: "carla.souza@nexo.com", name: "Carla Souza", role: "employee" },
  { id: "analyst-marina", email: "marina.alves@nexo.com", name: "Marina Alves", role: "analyst" },
];

const articles = [
  ["article-vpn-809", "Erro 809 na VPN", "O erro 809 vale para Windows 10. No Windows 11, abra um chamado para análise.", "vpn,erro 809,windows 10,windows 11"],
  ["article-hours", "Horário do service desk", "O atendimento funciona de segunda a sexta, das 8h às 18h. Casos críticos têm plantão 24h.", "horário,plantão,crítico,atendimento"],
  ["article-password", "Reset de senha", "Para resetar a senha corporativa, use o portal de identidade e confirme o segundo fator.", "senha,reset,acesso,segundo fator"],
  ["article-wifi", "Wi-Fi corporativo", "Esqueça a rede Nexo e conecte novamente usando suas credenciais corporativas.", "wifi,rede,conexão"],
  ["article-email", "Caixa de e-mail cheia", "Remova mensagens grandes e esvazie a lixeira. Se o problema persistir, abra um chamado.", "email,caixa cheia,lixeira"],
  ["article-software", "Instalação de software", "Pedidos de software precisam informar o nome do programa e a justificativa de uso.", "software,instalação,pedido"],
  ["article-monitor", "Solicitação de monitor", "Pedidos de equipamento devem informar o modelo ou finalidade e se são para home office.", "monitor,equipamento,hardware"],
  ["article-security", "Conta bloqueada", "Após cinco tentativas inválidas, aguarde dez minutos antes de tentar novamente.", "conta,bloqueio,acesso"],
];

const insertUser = database.prepare(`
  INSERT OR IGNORE INTO users (id, email, name, role, created_at)
  VALUES (@id, @email, @name, @role, @createdAt)
`);
const insertArticle = database.prepare(`
  INSERT OR IGNORE INTO help_articles (id, title, content, keywords, created_at)
  VALUES (@id, @title, @content, @keywords, @createdAt)
`);
const insertTicket = database.prepare(`
  INSERT OR IGNORE INTO tickets (
    id, number, requester_id, title, description, type, category, priority,
    affected_people, status, first_response_due_at, next_update_due_at,
    resolved_at, created_at, updated_at
  ) VALUES (
    @id, @number, @requesterId, @title, @description, @type, @category, @priority,
    @affectedPeople, @status, @firstResponseDueAt, @nextUpdateDueAt,
    @resolvedAt, @createdAt, @updatedAt
  )
`);

const seed = database.transaction(() => {
  for (const user of users) {
    insertUser.run({ ...user, createdAt: daysAgo(30) });
  }

  for (const [id, title, content, keywords] of articles) {
    insertArticle.run({ id, title, content, keywords, createdAt: daysAgo(20) });
  }

  insertTicket.run({
    id: "ticket-20311", number: "INC-20311", requesterId: "user-ana",
    title: "Notebook lento após atualização do Windows",
    description: "O notebook ficou muito lento depois da última atualização do Windows.",
    type: "INC", category: "Hardware", priority: "Média", affectedPeople: 1,
    status: "Aguardando analista", firstResponseDueAt: daysAgo(5),
    nextUpdateDueAt: daysAgo(1), resolvedAt: null, createdAt: daysAgo(6), updatedAt: daysAgo(1),
  });

  insertTicket.run({
    id: "ticket-10442", number: "REQ-10442", requesterId: "user-ana",
    title: "Segundo monitor para home office",
    description: "Solicitação de um segundo monitor para trabalhar em casa.",
    type: "REQ", category: "Hardware", priority: "Baixa", affectedPeople: 1,
    status: "Aprovado", firstResponseDueAt: daysAgo(4), nextUpdateDueAt: daysAgo(1),
    resolvedAt: null, createdAt: daysAgo(7), updatedAt: daysAgo(1),
  });

  insertTicket.run({
    id: "ticket-20150", number: "INC-20150", requesterId: "user-ana",
    title: "Senha do SAP bloqueada",
    description: "A senha do SAP foi bloqueada após tentativas inválidas.",
    type: "INC", category: "Acesso", priority: "Média", affectedPeople: 1,
    status: "Resolvido", firstResponseDueAt: daysAgo(3), nextUpdateDueAt: daysAgo(2),
    resolvedAt: daysAgo(4), createdAt: daysAgo(4), updatedAt: daysAgo(4),
  });

  insertTicket.run({
    id: "ticket-bruno-network", number: "INC-20298", requesterId: "user-bruno",
    title: "VPN desconecta durante reuniões",
    description: "A VPN cai após alguns minutos em reuniões externas.",
    type: "INC", category: "Rede e VPN", priority: "Alta", affectedPeople: 1,
    status: "Aberto", firstResponseDueAt: daysAgo(2), nextUpdateDueAt: daysAgo(1),
    resolvedAt: null, createdAt: daysAgo(2), updatedAt: daysAgo(1),
  });

  insertTicket.run({
    id: "ticket-carla-old", number: "INC-19990", requesterId: "user-carla",
    title: "Impressora sem conexão",
    description: "A impressora do escritório não aparece na rede.",
    type: "INC", category: "Hardware", priority: "Baixa", affectedPeople: 4,
    status: "Resolvido", firstResponseDueAt: daysAgo(20), nextUpdateDueAt: daysAgo(18),
    resolvedAt: daysAgo(15), createdAt: daysAgo(20), updatedAt: daysAgo(15),
  });
});

seed();
console.log(`Seed concluído: ${users.length} usuários, ${articles.length} artigos e 5 chamados.`);
database.close();