import { Player, Position, PlayerStatus, TrainingSession, Match, AttendanceStatus, MatchSelectionStatus } from './types';

// Posições estimadas baseadas em Peso/Altura para preencher a BD inicial.
// Podem ser alteradas na UI.
export const INITIAL_PLAYERS: Player[] = [
  // Sub 18 1º Ano (2009)
  { id: '1', name: 'Afonso Romão', position: Position.WING, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-05-10', height: 166, weight: 58, locality: '' },
  { id: '2', name: 'António Godinho', position: Position.SCRUM_HALF, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-02-03', height: 171, weight: 65.5, locality: '' },
  { id: '3', name: 'António Queiroz', position: Position.CENTRE, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-06-13', height: 176, weight: 75, locality: '' },
  { id: '4', name: 'Bernardo Cunha', position: Position.LOCK, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-10-31', height: 186, weight: 71, locality: '' },
  { id: '5', name: 'Bernardo Pacheco', position: Position.FLANKER, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-05-28', height: 175, weight: 80, locality: '' },
  { id: '6', name: 'Francisco Campos', position: Position.FLY_HALF, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-10-13', height: 180, weight: 65, locality: '' },
  { id: '7', name: 'Francisco Saldanha', position: Position.WING, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-04-20', height: 170, weight: 68, locality: '' },
  { id: '8', name: 'José Faia', position: Position.PROP, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-01-20', height: 179, weight: 120, locality: '' },
  { id: '9', name: 'José Leal', position: Position.HOOKER, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-04-05', height: 171, weight: 76, locality: '' },
  { id: '10', name: 'Luís Tavares', position: Position.WING, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-10-02', height: 173, weight: 64, locality: '' },
  { id: '11', name: 'Mateus Carvalho', position: Position.SCRUM_HALF, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-06-19', height: 171, weight: 61, locality: '' },
  { id: '12', name: 'Pedro Martins', position: Position.PROP, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-12-28', height: 183, weight: 125, locality: '' },
  { id: '13', name: 'Rodrigo Faro', position: Position.WING, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-06-23', height: 174, weight: 64, locality: '' },
  { id: '14', name: 'Tiago Carapinha', position: Position.LOCK, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-09-17', height: 185, weight: 120, locality: '' },
  { id: '15', name: 'Tomás Tomaz', position: Position.FLANKER, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-05-12', height: 181, weight: 68, locality: '' },
  { id: '16', name: 'Tomás Segurado', position: Position.HOOKER, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2009-10-26', height: 168, weight: 82, locality: '' },
  
  // Sub 18 (2008)
  { id: '17', name: 'António Almeida', position: Position.HOOKER, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-10-01', height: 165, weight: 77, locality: '' },
  { id: '18', name: 'Augusto Ferreira', position: Position.NO8, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-02-11', height: 178, weight: 90, locality: '' },
  { id: '19', name: 'Francisco Penteado', position: Position.CENTRE, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-09-06', height: 181, weight: 65, locality: '' },
  { id: '20', name: 'Francisco Sá', position: Position.FLANKER, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-01-22', height: 167, weight: 77, locality: '' },
  { id: '21', name: 'Gonçalo Ferreira', position: Position.WING, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-09-24', height: 170, weight: 64, locality: '' },
  { id: '22', name: 'João Lobato', position: Position.FULLBACK, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-05-01', height: 174, weight: 65, locality: '' },
  { id: '23', name: 'João Cebola', position: Position.CENTRE, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-05-03', height: 170, weight: 76, locality: '' },
  { id: '24', name: 'José Sousa', position: Position.CENTRE, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-01-11', height: 175, weight: 72, locality: '' },
  { id: '25', name: 'Manuel Lopes', position: Position.FULLBACK, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-02-25', height: 180, weight: 62, locality: '' },
  { id: '26', name: 'Martim Casaca', position: Position.HOOKER, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-07-22', height: 163, weight: 73.5, locality: '' },
  { id: '27', name: 'Pedro Mateiro', position: Position.WING, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-02-12', height: 177, weight: 60, locality: '' },
  { id: '28', name: 'Salvador Eloy', position: Position.FLANKER, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-08-20', height: 176, weight: 73, locality: '' },
  { id: '29', name: 'Salvador Pires', position: Position.SCRUM_HALF, status: PlayerStatus.AVAILABLE, caps: 0, birthDate: '2008-03-03', height: 167, weight: 60, locality: '' },
];

export const INITIAL_TRAININGS: TrainingSession[] = [];

export const INITIAL_MATCHES: Match[] = [];