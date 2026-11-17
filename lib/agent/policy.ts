export type RequestPolicy = {
  intent: "ti" | "fora_do_escopo" | "incerta";
  confidence: number;
  response?: string;
};

const outOfScopeTerms = ["rh", "recursos humanos", "salário", "folha", "financeiro", "nota fiscal", "facilities", "limpeza", "ar condicionado"];
const itTerms = ["vpn", "senha", "acesso", "notebook", "computador", "monitor", "e-mail", "email", "rede", "software", "sistema", "chamado", "internet", "impressora"];

export const classifyRequest = (content: string): RequestPolicy => {
  const normalized = content.toLocaleLowerCase("pt-BR");
  if (outOfScopeTerms.some((term) => normalized.includes(term))) {
    return { intent: "fora_do_escopo", confidence: 0.98, response: "Posso ajudar apenas com assuntos de TI. Para esse tema, procure o canal responsável da Nexo." };
  }
  if (itTerms.some((term) => normalized.includes(term))) {
    return { intent: "ti", confidence: 0.9 };
  }
  return { intent: "incerta", confidence: 0.25 };
};