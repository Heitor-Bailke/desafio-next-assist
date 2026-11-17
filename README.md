# Nexo Assist

Aplicação demonstrativa de service desk de TI. Funcionários conversam com um agente Mastra para consultar a central de ajuda e administrar chamados; analistas acompanham conversas transferidas em um console próprio.

## Requisitos

- Node.js compatível com Next.js 16
- npm
- Chave da API da OpenAI para respostas do agente

## Configuração

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie `.env.example` para `.env.local` e configure:

   ```dotenv
   DATABASE_PATH=./data/nexo-assist.db
   OPENAI_API_KEY=sua-chave
   LLM_MODEL=openai/gpt-4o-mini
   ```

   `DATABASE_PATH` pode apontar para outro arquivo SQLite. A pasta do banco é criada automaticamente.

3. Crie o banco e carregue dados demonstrativos:

   ```bash
   npm run db:seed
   ```

   O seed é repetível e insere usuários, artigos e chamados de exemplo sem duplicar registros.

4. Inicie a aplicação:

   ```bash
   npm run dev
   ```

   Abra <http://localhost:3000>.

## Acesso demonstrativo

O seed cria estes usuários. O login de demonstração valida o e-mail existente e exige uma senha não vazia; não há validação real de senha.

| Perfil | E-mail |
| --- | --- |
| Funcionária | `ana.silva@nexo.com` |
| Funcionário | `bruno.costa@nexo.com` |
| Funcionária | `carla.souza@nexo.com` |
| Analista | `marina.alves@nexo.com` |

## Funcionalidades

- Login demonstrativo com sessão em cookie HTTP-only e expiração em oito horas.
- Chat do funcionário com histórico, respostas em streaming NDJSON e exibição do trace de decisão.
- Agente com busca na central de ajuda, consulta, criação, atualização e reabertura de chamados; verificação de duplicidade e transferência para analista.
- Chamados restritos ao funcionário autenticado, com prioridades, estados e prazos calculados em horas úteis.
- Console do analista para listar e assumir conversas, responder, devolver ao agente ou encerrar.
- Persistência SQLite para usuários, sessões, conversas, mensagens, traces, chamadas de ferramentas, chamados e artigos.

## Regras e limitações

- Horário útil implementado: segunda a sexta, das 08:00 às 18:00 UTC; feriados não são considerados.
- Prioridades definem o prazo inicial e o intervalo para próxima atualização: crítica 1 hora, alta 4 horas, média 3 dias úteis e baixa 5 dias úteis.
- Chamados resolvidos podem ser reabertos por até sete dias.
- Cada conversa aceita até 30 mensagens.
- O classificador de escopo usa termos definidos no código e é demonstrativo; não substitui uma política de produção.
- O login não autentica a senha e o projeto não inclui implantação externa.

## Validação

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Os testes cobrem serviços de chamados, regras de horário útil, transições de conversa, traces do agente e avaliações simples de classificação.
