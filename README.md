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

## Etapas implementadas

1. **Setup, persistência e dados de exemplo:** configuração do Next.js, banco SQLite, esquema de dados e seed repetível com usuários, artigos e chamados demonstrativos.
2. **Serviço de chamados e testes:** operações de consulta, criação, atualização e reabertura; validação de propriedade, duplicidade, prioridade e prazos em horas úteis.
3. **Agent Mastra, tools e traces:** agente de TI, ferramentas para central de ajuda e chamados, transferência para analista e persistência das decisões e chamadas de ferramentas.
4. **Chat e login:** sessão demonstrativa, chat do funcionário com histórico, streaming NDJSON, cards de chamados e trace de decisão.
5. **Console do analista:** fila de conversas, visualização de histórico e chamados, assumir, responder, devolver ao agente e encerrar atendimento.
6. **Testes automatizados e evals:** 15 testes para serviços de chamados, regras de prazo, estados da conversa, ferramentas/agente e classificação de escopo; não há teste e2e de browser.
7. **README final:** instruções de instalação e execução, configuração, perfis de demonstração, funcionalidades e limitações conhecidas.

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
