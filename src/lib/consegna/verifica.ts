// src/lib/consegna/verifica.ts
//
// Logica pura della consegna (CLAUDE.md, «Consegna: GitHub, anteprima e
// produzione»). Una modifica è consegnata solo quando, per il commit pushato,
// Vercel ha portato a termine i deployment attesi — anteprima sempre, produzione
// quando il commit è su main — e la CI del commit è verde.
//
// Qui non c'è rete: le risposte dell'API GitHub entrano come dati e questo
// modulo dice se la consegna è pronta, in corso o fallita, con le righe da
// stampare. Lo script `scripts/attendi-consegna.mjs` fa le chiamate e attende;
// così le regole di valutazione si possono provare senza aspettare Vercel.

/** Ramo di produzione: il push qui pubblica in produzione. */
export const RAMO_PRODUZIONE = 'main';

/**
 * I due progetti Vercel del repository: la piattaforma e il sito gemello.
 * Vercel pubblica un deployment per progetto e li descrive nell'ambiente del
 * deployment GitHub («Preview – cciiplatform-main», «Production – cciiweb-40»).
 */
export const PROGETTI_PREDEFINITI = ['cciiplatform-main', 'cciiweb-40'];

export interface DeploymentRemoto {
  id: number;
  /** Campo `environment` del deployment GitHub, es. «Preview – cciiweb-40». */
  ambiente: string;
  sha: string;
}

export interface StatoDeployment {
  id: number;
  state: string;
  environmentUrl: string | null;
}

export interface RunCi {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
}

/** Esito di un singolo pezzo di consegna. */
export type Esito = 'PRONTO' | 'IN_CORSO' | 'FALLITO' | 'ASSENTE';

export interface Valutazione {
  esito: Esito;
  dettaglio: string;
  url: string | null;
}

/**
 * Forma confrontabile di un nome d'ambiente. Vercel usa il trattino lungo
 * («Preview – cciiplatform-main») e i nomi dei progetti contengono trattini:
 * confrontare i token separatamente evita di dipendere dal carattere esatto.
 */
export function normalizzaAmbiente(valore: string): string {
  return valore
    .toLowerCase()
    .replace(/[–—−]/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();
}

/** Gli ambienti Vercel attesi per un commit, nell'ordine in cui si guardano. */
export function ambientiAttesi(progetti: string[], produzione: boolean): string[] {
  const anteprime = progetti.map((p) => `Preview – ${p}`);
  if (!produzione) return anteprime;
  return [...anteprime, ...progetti.map((p) => `Production – ${p}`)];
}

/**
 * Il deployment più recente per quell'ambiente e quel commit. Se lo stesso
 * ambiente è stato ripubblicato, conta l'ultimo (id più alto).
 */
export function trovaDeployment(
  elenco: DeploymentRemoto[],
  ambiente: string,
  sha: string
): DeploymentRemoto | null {
  const cercato = normalizzaAmbiente(ambiente);
  const candidati = elenco.filter(
    (d) => d.sha === sha && normalizzaAmbiente(d.ambiente) === cercato
  );
  if (candidati.length === 0) return null;
  return candidati.reduce((a, b) => (b.id > a.id ? b : a));
}

/** Ambienti presenti per quel commit ma non attesi: aiutano a capire i nomi sbagliati. */
export function ambientiNonAttesi(
  elenco: DeploymentRemoto[],
  attesi: string[],
  sha: string
): string[] {
  const noti = new Set(attesi.map(normalizzaAmbiente));
  const visti = new Map<string, string>();
  for (const d of elenco) {
    if (d.sha !== sha) continue;
    if (noti.has(normalizzaAmbiente(d.ambiente))) continue;
    visti.set(normalizzaAmbiente(d.ambiente), d.ambiente);
  }
  return [...visti.values()];
}

/** Stato del deployment: conta lo stato più recente (id più alto). */
export function statoDeployment(stati: StatoDeployment[]): Valutazione {
  if (stati.length === 0) {
    return {
      esito: 'IN_CORSO',
      dettaglio: 'creato, nessuno stato ancora riportato da Vercel',
      url: null,
    };
  }
  const ultimo = stati.reduce((a, b) => (b.id > a.id ? b : a));
  const state = (ultimo.state || '').toLowerCase();
  const url = ultimo.environmentUrl;
  switch (state) {
    case 'success':
    case 'ready':
      return { esito: 'PRONTO', dettaglio: 'pronto', url };
    case 'pending':
    case 'in_progress':
    case 'queued':
    case 'created':
    case 'waiting':
      return { esito: 'IN_CORSO', dettaglio: `in corso (${state})`, url };
    case 'inactive':
      return {
        esito: 'FALLITO',
        dettaglio: 'disattivato da un deployment successivo, non serve il commit',
        url,
      };
    case 'failure':
    case 'error':
      return { esito: 'FALLITO', dettaglio: 'deployment fallito', url };
    default:
      // Uno stato che non conosciamo non è verde: meglio fermarsi che dire OK.
      return { esito: 'FALLITO', dettaglio: `stato non riconosciuto: ${ultimo.state}`, url };
  }
}

/** Esito della CI del commit: verde solo se tutte le run sono concluse e verdi. */
export function statoCi(run: RunCi[]): Valutazione {
  if (run.length === 0) {
    return { esito: 'ASSENTE', dettaglio: 'nessuna run per questo commit', url: null };
  }
  const inCorso = run.filter((r) => r.status !== 'completed');
  if (inCorso.length > 0) {
    return {
      esito: 'IN_CORSO',
      dettaglio: `${inCorso.length} su ${run.length} in corso`,
      url: inCorso[0].url,
    };
  }
  const rosse = run.filter((r) => (r.conclusion || '').toLowerCase() !== 'success');
  if (rosse.length > 0) {
    return {
      esito: 'FALLITO',
      dettaglio: rosse.map((r) => `${r.name}: ${r.conclusion || 'senza esito'}`).join(', '),
      url: rosse[0].url,
    };
  }
  return { esito: 'PRONTO', dettaglio: `${run.length} run verdi`, url: run[0].url };
}

export interface IngressoVerifica {
  sha: string;
  ramo: string;
  progetti: string[];
  deployments: DeploymentRemoto[];
  /** Stati per id di deployment. Un deployment non ancora interrogato è assente. */
  stati: Record<number, StatoDeployment[]>;
  run: RunCi[];
  /**
   * La CI è prevista per questo commit? Su `main` parte sempre; su un ramo di
   * lavoro parte solo con una pull request aperta, quindi la sua assenza non è
   * un errore ma va detta.
   */
  ciAttesa: boolean;
}

export interface EsitoVerifica {
  esito: 'OK' | 'IN_CORSO' | 'FALLITO';
  /** Righe da stampare, già nell'ordine di lettura. */
  righe: string[];
  /** Cosa manca ancora: vuoto quando l'esito è OK. */
  mancanti: string[];
}

/**
 * Il verdetto sulla consegna. FALLITO appena qualcosa è rosso (non si aspetta
 * oltre), IN_CORSO finché manca un deployment o una run, OK quando tutto è
 * verde. Su un ramo di lavoro senza pull request la CI non esiste: la si
 * dichiara e non blocca.
 */
export function valutaConsegna(ingresso: IngressoVerifica): EsitoVerifica {
  const produzione = ingresso.ramo === RAMO_PRODUZIONE;
  const attesi = ambientiAttesi(ingresso.progetti, produzione);
  const righe: string[] = [];
  const mancanti: string[] = [];
  let rosso = false;
  let incompleto = false;

  for (const ambiente of attesi) {
    const deployment = trovaDeployment(ingresso.deployments, ambiente, ingresso.sha);
    if (!deployment) {
      righe.push(`… ${ambiente}: nessun deployment Vercel per ${shaBreve(ingresso.sha)}`);
      mancanti.push(ambiente);
      incompleto = true;
      continue;
    }
    const v = statoDeployment(ingresso.stati[deployment.id] ?? []);
    const suffisso = v.url ? ` — ${v.url}` : '';
    const simbolo = v.esito === 'PRONTO' ? '✔' : v.esito === 'FALLITO' ? '✖' : '…';
    righe.push(`${simbolo} ${ambiente}: ${v.dettaglio}${suffisso}`);
    if (v.esito === 'FALLITO') rosso = true;
    else if (v.esito !== 'PRONTO') {
      incompleto = true;
      mancanti.push(ambiente);
    }
  }

  const ci = statoCi(ingresso.run);
  if (ci.esito === 'PRONTO') {
    righe.push(`✔ CI del commit: ${ci.dettaglio}${ci.url ? ` — ${ci.url}` : ''}`);
  } else if (ci.esito === 'FALLITO') {
    righe.push(`✖ CI del commit: ${ci.dettaglio}${ci.url ? ` — ${ci.url}` : ''}`);
    rosso = true;
  } else if (ci.esito === 'IN_CORSO') {
    righe.push(`… CI del commit: ${ci.dettaglio}${ci.url ? ` — ${ci.url}` : ''}`);
    incompleto = true;
    mancanti.push('CI del commit');
  } else if (ingresso.ciAttesa) {
    righe.push(`… CI del commit: non ancora avviata`);
    incompleto = true;
    mancanti.push('CI del commit');
  } else {
    // Ramo di lavoro senza pull request: le GitHub Actions non hanno nulla da
    // eseguire (il workflow parte sul push a main e sulle pull request).
    righe.push(
      '· CI del commit: non prevista su un ramo di lavoro senza pull request (girerà su main)'
    );
  }

  return {
    esito: rosso ? 'FALLITO' : incompleto ? 'IN_CORSO' : 'OK',
    righe,
    mancanti,
  };
}

/** Le prime sette cifre, come si leggono su GitHub. */
export function shaBreve(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * `owner/name` da un URL di remote git: SSH (`git@github.com:owner/repo.git`),
 * HTTPS o `ssh://`. `null` se non è GitHub (allora i deploy non si leggono da lì).
 */
export function parseRemoteGit(url: string): string | null {
  const testo = url.trim();
  const ssh = /^[\w.-]+@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(testo);
  if (ssh) return `${ssh[1]}/${ssh[2].replace(/\.git$/, '')}`;
  const https =
    /^(?:https?|ssh):\/\/(?:[^@/]+@)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(testo);
  if (https) return `${https[1]}/${https[2].replace(/\.git$/, '')}`;
  return null;
}

/** Verifica che la versione del login coincida con APP_VERSION e CHANGELOG. */
export function versioneCoerente(
  versioneApp: string,
  versionePacchetto: string,
  primaVoceChangelog: string
): { coerente: boolean; dettaglio: string } {
  const uguali = versioneApp === versionePacchetto && versioneApp === primaVoceChangelog;
  if (uguali) {
    return { coerente: true, dettaglio: `versione ${versioneApp}` };
  }
  return {
    coerente: false,
    dettaglio: `APP_VERSION ${versioneApp}, package.json ${versionePacchetto}, CHANGELOG ${primaVoceChangelog}`,
  };
}
