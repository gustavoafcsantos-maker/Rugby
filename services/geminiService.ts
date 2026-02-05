import { GoogleGenAI } from "@google/genai";
import { Player, Position, Match, TrainingSession } from '../types';

const MODEL_NAME = 'gemini-3-flash-preview';
const BAD_KEY = 'AIzaSyBMBM1TYgs3YrFmffEExDZ2gB3JWK2H90o'; // Chave incorreta que pode ter ficado em cache
const DEFAULT_KEY = "AIzaSyAePgf-58mq8VvqQVM9lNGXod12ZPKByjI";

// Helper para obter a chave de forma segura e hierárquica
const getAIClient = () => {
  let apiKey = '';

  // 1. Prioridade Máxima: Chave definida manualmente pelo utilizador (guardada no browser)
  if (typeof window !== 'undefined') {
      const storedKey = localStorage.getItem('rugby_manager_api_key');
      // Proteção: Se a chave guardada for a "má" (do firebase), ignoramos e forçamos o default
      if (storedKey && storedKey !== BAD_KEY) {
          apiKey = storedKey;
      }
  }

  // 2. Prioridade Média: Variável de Ambiente (Node/Build)
  if (!apiKey && process.env.API_KEY) {
      apiKey = process.env.API_KEY;
  }
  
  // 3. Prioridade Baixa: Variável Global Injetada (Browser)
  if (!apiKey && typeof window !== 'undefined') {
    apiKey = (window as any).GEMINI_API_KEY || (window as any).process?.env?.API_KEY;
  }

  // 4. Fallback de segurança (Chave Hardcoded)
  if (!apiKey) {
      apiKey = DEFAULT_KEY;
  }

  return new GoogleGenAI({ apiKey: apiKey });
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
    return "Erro ao contactar o assistente técnico. Verifique se a chave de API está correta nas definições.";
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
    return "Erro ao contactar o assistente técnico. Verifique as definições da API Key.";
  }
};