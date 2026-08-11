// ===========================================================================
// DEFINIZIONI DI DOMINIO (CCII & PLATFORM)
// ===========================================================================

// --- 1. Autenticazione e Utenti ---
export type UserRole = 'SUPER_ADMIN' | 'AMMINISTRATORE_SPAZIO' | 'OPERATOR' | 'VIEWER';

export interface User {
  id: string;
  nome: string;
  email: string;
  ruolo: UserRole;
  stato: 'ATTIVO' | 'SOSPESO';
}

// --- 2. Analisi Finanziaria (Input XBRL) ---
export interface RawXbrlData {
  utileNetto: number;
  patrimonioNetto: number;
  risultatoOperativo: number;
  totaleAttivo: number;
  ricaviVendite: number;
  utileAnteImposte: number;
  oneriFinanziari: number;
  attivoCorrente: number;
  passivoCorrente: number;
  rimanenze: number;
  totalePassivo: number;
  immobilizzazioni: number;
  costoVenduto: number;
  rimanenzeMedie: number;
  creditiVersoClienti: number;
  debitiVersoFornitori: number;
  acquisti: number;
  // CCII Specifici
  ammortamenti: number;
  svalutazioni: number;
  accantonamenti: number;
  varCapitaleCircolante: number;
  interessiPassivi: number;
  quotaCapitaleFinanziamenti: number;
  totaleDebiti: number;
}

// --- 3. Analisi Finanziaria (Output Indici) ---
export interface Indice {
  label: string;
  valore: string | number;
  unita?: string;
}

export interface IndiciReport {
  redditivita: Indice[];
  liquidita: Indice[];
  solidita: Indice[];
  rotazione: Indice[];
  ccii: Indice[];
  benchmark: Indice[];
}

// --- 4. Configurazione e Profilazione ---
export interface AnalisiProfile {
  id: string;
  nome: string;
  sogliaAllertaEbitda: number;
  orizzonteTemporaleAnni: number;
  abilitaBenchmarkIstat: boolean;
  pesoDatiStorici: number;
}

export interface DatiLicenza {
  cognomeRagioneSociale: string;
  nome: string;
  codiceFiscale: string;
  partitaIva: string;
  citta: string;
  indirizzo: string;
  dataScadenza: string;
}

// --- 5. Strutture Workspace ---
export interface Workspace {
  id: string;
  nome: string;
  tipoGiuridico: 'ENTE' | 'STUDIO PROFESSIONALE' | 'AZIENDA';
  stato: 'ATTIVO' | 'ARCHIVIATO';
}
