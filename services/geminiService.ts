import { GoogleGenAI } from "@google/genai";
import { Player, Position, Match, TrainingSession } from '../types';

const MODEL_NAME = 'gemini-3-flash-preview';

// Helper para obter a chave de forma segura
const getAIClient = () => {
  let apiKey = '';

  // 1. Tenta recuperar chave configurada manualmente pelo utilizador na UI
  try {
    const localKey = localStorage.getItem('rugby_manager_api_key');
    if (localKey) apiKey = localKey;
  } catch (e) {
    console.warn("Erro ao ler localStorage", e);
  }
  
  // 2. Tenta variável global direta (definida no index.html)
  if (!apiKey && typeof window !== 'undefined' && (window as any).GEMINI_API_KEY) {
      apiKey = (window as any).GEMINI_API_KEY;
  }

  // 3. Fallback
  if (!apiKey && typeof process !== 'undefined' && process.env?.API_KEY) {
      apiKey = process.env.API_KEY;
  }

  if (!apiKey || apiKey.includes("COLE_A_SUA_CHAVE")) {
    throw new Error("MISSING_KEY");
  }

  return new GoogleGenAI({ apiKey });
};

export const generateTrainingPlan = async (
  playerCount: number,
  recentFocus: string,
  positions: string[]
): Promise<string> => {
  try {
    const ai = getAIClient();
    
    const prompt = `
      Atuo como treinador de rugby.
      Tenho ${playerCount} jogadores confirmados para o treino de hoje.
      O foco recente tem sido: "${recentFocus}".
      
      Gera um plano de treino estruturado em formato Markdown.
      Inclui:
      1. Aquecimento (10 min)
      2. 2 a 3 Exercícios principais (Drills) adequados para ${playerCount} jogadores.
      3. Jogo condicionado ou simulação.
      4. Retorno à calma.
      
      Sê breve e direto. Responde em Português de Portugal.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });

    return response.text || "Não foi possível gerar o plano de treino.";
  } catch (error: any) {
    console.error("Gemini Error:", error);
    if (error.message === "MISSING_KEY") {
        return "⚠️ Erro: Chave de API não encontrada. Por favor configure a chave no menu do Assistente AI.";
    }
    if (error.message?.includes('API key') || error.status === 403) {
        return "⚠️ Erro de Permissão: A Chave de API é inválida. Por favor atualize a chave no menu do Assistente AI.";
    }
    return "Erro ao contactar o assistente técnico. Verifique a consola.";
  }
};

export const generateMatchStrategy = async (
  opponent: string,
  squad: Player[],
  location: string
): Promise<string> => {
  try {
    const ai = getAIClient();

    const forwards = squad.filter(p => [Position.PROP, Position.HOOKER, Position.LOCK, Position.FLANKER, Position.NO8].includes(p.position));
    const backs = squad.filter(p => ![Position.PROP, Position.HOOKER, Position.LOCK, Position.FLANKER, Position.NO8].includes(p.position));

    const squadSummary = `
      Avançados: ${forwards.length} (Ex: ${forwards.slice(0, 3).map(p => p.name).join(', ')}...)
      Linhas: ${backs.length} (Ex: ${backs.slice(0, 3).map(p => p.name).join(', ')}...)
    `;

    const prompt = `
      Vamos jogar contra ${opponent} (${location === 'Home' ? 'Em Casa' : 'Fora'}).
      Analisa o meu plantel disponível para o jogo:
      ${squadSummary}
      
      Gera uma estratégia de jogo em Markdown (PT-PT).
      Inclui:
      1. Pontos chave para vencer.
      2. Estratégia para os Avançados (Set pieces).
      3. Estratégia para as Linhas (Ataque/Defesa).
      4. Um discurso motivacional curto (3 frases) para o balneário.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });

    return response.text || "Não foi possível gerar a estratégia.";
  } catch (error: any) {
    console.error("Gemini Error:", error);
    if (error.message === "MISSING_KEY") {
        return "⚠️ Erro: Chave de API não encontrada. Configure no menu AI Coach.";
    }
    return "Erro ao contactar o assistente técnico.";
  }
};