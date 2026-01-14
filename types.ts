export enum Position {
  PROP = 'Pilier',
  HOOKER = 'Talonador',
  LOCK = '2ª Linha',
  FLANKER = 'Asa',
  NO8 = 'Nº 8',
  SCRUM_HALF = 'Médio de Formação',
  FLY_HALF = 'Médio de Abertura',
  CENTRE = 'Centro',
  WING = 'Ponta',
  FULLBACK = 'Arreio'
}

export enum PlayerStatus {
  AVAILABLE = 'Disponível',
  INJURED = 'Lesionado',
  UNAVAILABLE = 'Indisponível'
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  status: PlayerStatus;
  caps: number; // Jogos realizados
  notes?: string;
  // New Fields
  weight?: number; // em kg
  height?: number; // em cm
  birthDate?: string; // YYYY-MM-DD
  locality?: string;
}

export enum AttendanceStatus {
  PRESENT = 'Presente',
  ABSENT = 'Faltou', // Falta injustificada
  INJURED = 'Lesionado',
  UNAVAILABLE = 'Indisponível', // Pessoal
  WORK_SCHOOL = 'Trabalho/Escola'
}

export interface TrainingSession {
  id: string;
  date: string;
  focus: string;
  // Alterado de string[] para um mapa de ID -> Status
  attendance: Record<string, AttendanceStatus>;
}

export enum MatchSelectionStatus {
  SELECTED = 'Convocado',
  TECHNICAL = 'Opção Técnica',
  INJURED = 'Lesionado',
  UNAVAILABLE = 'Indisponível'
}

export interface Match {
  id: string;
  opponent: string;
  date: string;
  location: 'Home' | 'Away';
  // Alterado de selectedPlayers[] para mapa
  playerStatus: Record<string, MatchSelectionStatus>;
  startingXV: string[]; // Array of Player IDs (Subset of SELECTED)
  subs: string[]; // Array of Player IDs (Subset of SELECTED)
  playingTime: Record<string, number>; // Player ID -> Minutes Played
  strategy?: string;
}

export type ViewState = 'DASHBOARD' | 'ROSTER' | 'TRAINING' | 'MATCHES' | 'AI_COACH';