import { GoogleGenAI } from "@google/genai";
import { Player, Position, Match, TrainingSession } from '../types';

const MODEL_NAME = 'gemini-3-flash-preview';

// Helper seguro para obter a instância da IA
// Procura explicitamente no window.process.env definido no index.html se process.env falhar
const getAIClient = () => {
  // Tenta várias fontes para a API Key
  const apiKey = (typeof window !== 'undefined' && (window as any).process?.env?.API_KEY) 
                 || process.env.API_KEY;
                 
  if (!apiKey) {
    console.error("API Key não encontrada no ambiente!");
    throw new Error("API Key em falta. Verifique o ficheiro index.html ou as variáveis de ambiente.");
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
    if (error.toString().includes('403')) {
      return "Erro 403: Acesso negado. Se estiver a usar um link publicado, verifique se a API Key permite este domínio na Google Cloud Console.";
    }
    return "Erro ao contactar o assistente técnico. Verifique a consola para detalhes.";
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
    if (error.toString().includes('403')) {
      return "Erro 403: Acesso negado. Verifique as restrições de domínio da sua API Key.";
    }
    return "Erro ao contactar o assistente técnico.";
  }
};