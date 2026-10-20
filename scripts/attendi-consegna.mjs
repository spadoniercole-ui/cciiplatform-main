#!/usr/bin/env node
// scripts/attendi-consegna.mjs
//
// La regola di consegna (CLAUDE.md, «Consegna: GitHub, anteprima e
// produzione») chiede tre cose per il commit appena pushato: anteprima Vercel
// pronta, produzione aggiornata quando il commit è su main, CI verde. Finora si
// controllava a mano sulle API di GitHub; questo script lo fa per noi e
// fallisce se qualcosa non torna.
//
// Perché da GitHub e non da Vercel: il repository è pubblico e Vercel pubblica
// lì ogni deployment, con l'ambiente nel nome («Preview – cciiplatform-main»,
// «Production – cciiweb-40»). Nessun token Vercel da custodire.
//
// Uso:
//   npm run consegna                      attende HEAD (dopo il push)
//   npm run consegna -- --sha=abc1234     un commit preciso
//   npm run consegna -- --una-volta       un solo controllo, senza attendere
//   npm run consegna -- --timeout=30      minuti di attesa (predefinito 20)
//   npm run consegna -- --intervallo=30   secondi tra un controllo e l'altro
//   npm run consegna -- --ramo=main       ramo di destinazione del commit
//   npm run consegna -- --repo=owner/nome  altro repository (predefinito: origin)
//   npm run consegna -- --progetti=a,b    progetti Vercel attesi
//   npm run consegna -- --dominio=…       dove leggere la versione online
//
// Su `main`, quando deployment e CI sono verdi, l'ultimo controllo guarda il
// sito vero: legge la versione dal piè di pagina del login e la confronta con
// APP_VERSION del commit. È l'unica prova che l'alias di produzione serve il
// commit giusto, perché un deployment «Ready» non lo garantisce. Per difetto il
// dominio è l'alias Vercel del primo progetto (`https://<progetto>.vercel.app`);
// `--dominio=` (o `CONSEGNA_DOMINIO`) punta al dominio proprio. Se il sito
// risponde 401 o non risponde, la consegna resta valida e lo si dice: una
// pagina protetta non è la prova di una versione sbagliata.
//
// Senza GH_TOKEN (o GITHUB_TOKEN) si leggono le API pubbliche: si possono fare
// 60 richieste l'ora, ma le risposte 304 (ETag) non si contano, quindi
// l'attesa lunga resta possibile. Con il token si è più al sicuro e si vedono
// anche le repository private.
//
// `CONSEGNA_API` cambia l'origine dell'API (GitHub Enterprise, o un finto server
// per provare lo script senza consumare il limite vero).
//
// Uscita: 0 consegna verificata, 1 non riescita o tempo scaduto, 2 ancora in
// corso (solo con --una-volta), 130 interrotta.
import { execFileSync } from 'node:child_process';

process.on('SIGINT', () => {
  console.error('\n… interrotto: nessun verdetto su questa consegna');
  process.exit(130);
});
import {
  PROGETTI_PREDEFINITI,
  RAMO_PRODUZIONE,
  ambientiAttesi,
  ambientiNonAttesi,
  parseRemoteGit,
  shaBreve,
  valutaConsegna,
  versioneCoerente,
  versioneOnline,
} from '../src/lib/consegna/verifica.ts';

// L'origine dell'API è sovrascrivibile: serve a GitHub Enterprise e alle prove
// con un finto server locale.
const API = (process.env.CONSEGNA_API || 'https://api.github.com').replace(/\/$/, '');
const TOKEN = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim();

function esci(messaggio, codice = 1) {
  console.error(`✖ ${messaggio}`);
  process.exit(codice);
}

function nota(messaggio) {
  console.info(`· ${messaggio}`);
}

// --- argomenti ------------------------------------------------------------

function argomenti(elenco) {
  const opzioni = {
    sha: null,
    ramo: null,
    repo: null,
    progetti: PROGETTI_PREDEFINITI.slice(),
    dominio: null,
    timeoutMinuti: 20,
    intervalloSec: 15,
    unaVolta: false,
  };
  for (const arg of elenco) {
    if (arg === '--una-volta') {
      opzioni.unaVolta = true;
      continue;
    }
    if (arg === '--aiuto' || arg === '-h' || arg === '--help') {
      console.info(
        'Uso: npm run consegna [-- --sha=SHA] [--ramo=RAMO] [--repo=owner/nome]\n' +
          '                      [--progetti=a,b] [--dominio=URL] [--timeout=MINUTI]\n' +
          '                      [--intervallo=SECONDI] [--una-volta]\n\n' +
          'Attende e verifica i deployment Vercel (anteprima sempre, produzione su main),\n' +
          'la CI del commit e — su main — la versione del login sul sito di produzione.\n' +
          'Esce 0 se tutto è verde, 1 se qualcosa è rosso o scade il tempo.'
      );
      process.exit(0);
    }
    const trovato = /^--([\w-]+)=(.*)$/.exec(arg);
    if (!trovato) esci(`argomento non riconosciuto: ${arg} (usa --aiuto)`);
    const [, chiave, valore] = trovato;
    switch (chiave) {
      case 'sha':
        opzioni.sha = valore.trim();
        break;
      case 'ramo':
        opzioni.ramo = valore.trim();
        break;
      case 'repo':
        opzioni.repo = valore.trim();
        break;
      case 'progetti':
        opzioni.progetti = valore
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        break;
      case 'dominio':
        opzioni.dominio = valore.trim();
        break;
      case 'timeout':
        opzioni.timeoutMinuti = numero(valore, 'timeout');
        break;
      case 'intervallo':
        opzioni.intervalloSec = numero(valore, 'intervallo');
        break;
      default:
        esci(`opzione non riconosciuta: --${chiave} (usa --aiuto)`);
    }
  }
  return opzioni;
}

function numero(valore, nome) {
  const n = Number(valore);
  if (!Number.isFinite(n) || n <= 0)
    esci(`--${nome} vuole un numero positivo (ricevuto «${valore}»)`);
  return n;
}

// --- git ------------------------------------------------------------------

function git(...comandi) {
  return execFileSync('git', comandi, { encoding: 'utf8' }).trim();
}

function leggiContesto(opzioni) {
  let sha = opzioni.sha;
  if (!sha) {
    try {
      sha = git('rev-parse', 'HEAD');
    } catch {
      esci('non riesco a leggere HEAD: questo non sembra un repository git');
    }
  }
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) esci(`sha non valido: ${sha}`);
  // Le API vogliono lo sha intero: `deployments?sha=` e `runs?head_sha=` non
  // trovano nulla con le sette cifre che si copiano da GitHub.
  if (sha.length < 40) {
    try {
      sha = git('rev-parse', sha);
    } catch {
      esci(`sha ${sha} non esiste in questo repository`);
    }
  }

  let ramo = opzioni.ramo;
  if (!ramo) {
    try {
      ramo = git('rev-parse', '--abbrev-ref', 'HEAD');
    } catch {
      ramo = '';
    }
  }
  if (!ramo || ramo === 'HEAD') {
    // Commit in distacco: prova a capire su quale ramo è arrivato.
    try {
      ramo = git('branch', '-r', '--contains', sha)
        .split('\n')[0]
        .trim()
        .replace(/^origin\//, '');
    } catch {
      ramo = '';
    }
  }
  if (!ramo) esci('non riesco a capire il ramo: passalo con --ramo=…');

  let repo = opzioni.repo || (process.env.CONSEGNA_REPO || '').trim();
  if (!repo) {
    let remote = '';
    try {
      remote = git('remote', 'get-url', 'origin');
    } catch {
      esci('nessun remote origin: passa il repository con --repo=owner/nome');
    }
    repo = parseRemoteGit(remote) || '';
    if (!repo)
      esci(`il remote origin non è un repository GitHub (${remote}): usa --repo=owner/nome`);
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) esci(`--repo vuole owner/nome (ricevuto «${repo}»)`);

  return { sha, ramo, repo, produzione: ramo === RAMO_PRODUZIONE };
}

// --- HTTP -----------------------------------------------------------------

function messaggioLimite(rinnovo) {
  const quando = rinnovo ? new Date(Number(rinnovo) * 1000) : null;
  return (
    'limite di richieste GitHub esaurito' +
    (quando ? ` (si rinnova alle ${quando.toLocaleTimeString('it-IT')})` : '') +
    ': imposta GH_TOKEN (o GITHUB_TOKEN) con un token personale e riprova'
  );
}

class ErroreApi extends Error {
  constructor(messaggio, stato) {
    super(messaggio);
    this.stato = stato;
  }
}

const cache = new Map(); // url -> { etag, dati }
let usatoCurl = false;
let curlConSslNoRevoke = process.platform === 'win32';

function erroreCertificato(errore) {
  const testo = [errore?.message, errore?.cause?.message, errore?.code, errore?.cause?.code]
    .filter(Boolean)
    .join(' ');
  return /CERT|issuer|SELF_SIGNED|schannel|revocation|UNABLE_TO_VERIFY/i.test(testo);
}

function curlDisponibile() {
  try {
    execFileSync('curl', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Chiamata via curl: serve sulle macchine con un proxy che filtra TLS, dove
 * `fetch` di Node non riesce a verificare la catena ma curl (schannel, con
 * `--ssl-no-revoke`) sì. Il corpo è JSON: lo stato HTTP arriva come coda.
 */
function leggiConCurl(url, headers) {
  if (!curlDisponibile()) {
    esci('curl non disponibile e fetch non riesce a verificare il certificato di api.github.com');
  }
  const base = ['-sS', '-w', '\n@@HTTP@@%{http_code}'];
  for (const [k, v] of Object.entries(headers)) base.push('-H', `${k}: ${v}`);
  const tentativi = curlConSslNoRevoke ? ['--ssl-no-revoke', null] : [null];
  let ultimo = '';
  for (const flag of tentativi) {
    const args = flag ? [...base, flag, url] : [...base, url];
    let uscita;
    try {
      uscita = execFileSync('curl', args, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000,
      });
    } catch (errore) {
      ultimo = String(errore?.stderr || errore?.message || errore);
      // Opzione non supportata da questo curl: riprova senza.
      if (/unknown option|not supported|option .*--ssl-no-revoke/i.test(ultimo)) {
        curlConSslNoRevoke = false;
        continue;
      }
      esci(`curl ha fallito su ${url}: ${ultimo.trim()}`);
    }
    const taglio = uscita.lastIndexOf('@@HTTP@@');
    const corpo = taglio >= 0 ? uscita.slice(0, taglio) : uscita;
    const stato = taglio >= 0 ? Number(uscita.slice(taglio + 8).trim()) : 0;
    let dati = null;
    try {
      dati = corpo.trim() ? JSON.parse(corpo) : null;
    } catch {
      dati = null;
    }
    return { stato, dati, etag: null };
  }
  esci(`curl ha fallito su ${url}: ${ultimo.trim()}`);
}

async function leggiConFetch(url, headers) {
  const risposta = await fetch(url, { headers });
  if (risposta.status === 304) return { stato: 304, dati: null, etag: null };
  const testo = await risposta.text();
  let dati = null;
  try {
    dati = testo ? JSON.parse(testo) : null;
  } catch {
    dati = null;
  }
  return {
    stato: risposta.status,
    dati,
    etag: risposta.headers.get('etag'),
    restanti: risposta.headers.get('x-ratelimit-remaining'),
    rinnovo: risposta.headers.get('x-ratelimit-reset'),
  };
}

async function api(percorso) {
  const url = percorso.startsWith('http') ? percorso : `${API}${percorso}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cciiplatform-attendi-consegna',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const salvato = cache.get(url);
  if (salvato?.etag) headers['If-None-Match'] = salvato.etag;

  let risposta;
  try {
    risposta = await leggiConFetch(url, headers);
  } catch (errore) {
    if (!erroreCertificato(errore)) {
      esci(`rete non raggiungibile su ${url}: ${errore?.message || errore}`);
    }
    if (!usatoCurl) {
      usatoCurl = true;
      nota(
        'Node non riesce a verificare il certificato di api.github.com: leggo le API con curl. ' +
          'Per tornare a Node imposta NODE_EXTRA_CA_CERTS sul certificato della rete aziendale ' +
          '(oppure avvia Node con --use-system-ca).'
      );
    }
    risposta = leggiConCurl(url, headers);
  }

  if (risposta.stato === 304 && salvato) return salvato.dati;
  if (risposta.stato === 404) {
    throw new ErroreApi(`GitHub risponde 404 su ${url}`, 404);
  }
  if (risposta.stato === 403 || risposta.stato === 429) {
    const testo = risposta.dati?.message || '';
    // Via curl non arrivano le intestazioni: il limite si riconosce dal messaggio.
    const limite = risposta.restanti === '0' || risposta.stato === 429 || /rate limit/i.test(testo);
    if (limite) throw new ErroreApi(messaggioLimite(risposta.rinnovo), 403);
  }
  if (risposta.stato >= 400) {
    throw new ErroreApi(
      `GitHub risponde ${risposta.stato} su ${url}` +
        (risposta.dati?.message ? `: ${risposta.dati.message}` : ''),
      risposta.stato
    );
  }
  if (risposta.etag) cache.set(url, { etag: risposta.etag, dati: risposta.dati });
  return risposta.dati;
}

// --- raccolta stato -------------------------------------------------------

async function deploymentDelCommit(repo, sha) {
  const elenco = await api(`/repos/${repo}/deployments?sha=${sha}&per_page=100`);
  if (!Array.isArray(elenco)) return [];
  return elenco.map((d) => ({ id: d.id, ambiente: d.environment, sha: d.sha }));
}

async function statiDeployment(repo, id) {
  const elenco = await api(`/repos/${repo}/deployments/${id}/statuses?per_page=100`);
  if (!Array.isArray(elenco)) return [];
  return elenco.map((s) => ({
    id: s.id,
    state: s.state,
    environmentUrl: s.environment_url ?? null,
  }));
}

async function runDelCommit(repo, sha) {
  const dati = await api(`/repos/${repo}/actions/runs?head_sha=${sha}&per_page=50`);
  return (dati?.workflow_runs ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    conclusion: r.conclusion,
    url: r.html_url,
  }));
}

/** Su un ramo di lavoro la CI parte solo con una pull request aperta. */
async function pullRequestAperta(repo, proprietario, ramo) {
  if (ramo === RAMO_PRODUZIONE) return true;
  try {
    const elenco = await api(
      `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${proprietario}:${ramo}`)}`
    );
    return Array.isArray(elenco) && elenco.length > 0;
  } catch {
    // Senza questa informazione si preferisce non aspettare una CI che non
    // arriverà: la si dichiara «non prevista» invece di bloccare 20 minuti.
    return false;
  }
}

async function raccogli(repo, sha) {
  const deployments = await deploymentDelCommit(repo, sha);
  const run = await runDelCommit(repo, sha);
  const stati = {};
  for (const d of deployments) {
    stati[d.id] = await statiDeployment(repo, d.id);
  }
  return { deployments, run, stati };
}

// --- versione -------------------------------------------------------------

/** Il file così com'è nel commit: la versione che Vercel ha costruito, non quella locale. */
function dalCommit(sha, percorso) {
  try {
    return git('show', `${sha}:${percorso}`);
  } catch {
    return null;
  }
}

function primaVoceChangelog(sha) {
  const testo = dalCommit(sha, 'CHANGELOG.md');
  if (testo === null) return '(CHANGELOG assente)';
  const trovato = /^##\s+(\d+\.\d+\.\d+)/m.exec(testo);
  return trovato ? trovato[1] : '(nessuna voce)';
}

function versioneApp(sha) {
  const testo = dalCommit(sha, 'src/lib/appVersion.ts');
  if (testo === null) return '(appVersion.ts assente)';
  const trovato = /APP_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(testo);
  return trovato ? trovato[1] : '(APP_VERSION assente)';
}

function versionePacchetto(sha) {
  const testo = dalCommit(sha, 'package.json');
  if (testo === null) return '(package.json assente)';
  try {
    return JSON.parse(testo).version || '(assente)';
  } catch {
    return '(package.json illeggibile)';
  }
}

/** L'alias di produzione del progetto, o il dominio indicato a mano. */
function dominioProduzione(opzioni) {
  const scelto = (opzioni.dominio || process.env.CONSEGNA_DOMINIO || '').trim();
  if (scelto) {
    const url = /^https?:\/\//i.test(scelto) ? scelto : `https://${scelto}`;
    return url.replace(/\/$/, '');
  }
  const progetto = opzioni.progetti[0];
  return progetto ? `https://${progetto}.vercel.app` : '';
}

/** Il login come lo riceve un browser: serve la versione, non il resto. */
async function testoDa(url) {
  const headers = {
    Accept: 'text/html,application/xhtml+xml',
    'User-Agent': 'cciiplatform-attendi-consegna',
  };
  try {
    const risposta = await fetch(url, { headers, redirect: 'follow' });
    return { stato: risposta.status, testo: await risposta.text() };
  } catch (errore) {
    if (!erroreCertificato(errore)) {
      return { stato: 0, testo: '', errore: errore?.message || String(errore) };
    }
    return leggiTestoConCurl(url, headers);
  }
}

function leggiTestoConCurl(url, headers) {
  if (!curlDisponibile())
    return { stato: 0, testo: '', errore: 'né fetch né curl raggiungono il sito' };
  const base = ['-sS', '-L', '-w', '\n@@HTTP@@%{http_code}'];
  for (const [k, v] of Object.entries(headers)) base.push('-H', `${k}: ${v}`);
  const tentativi = curlConSslNoRevoke ? ['--ssl-no-revoke', null] : [null];
  for (const flag of tentativi) {
    const args = flag ? [...base, flag, url] : [...base, url];
    let uscita;
    try {
      uscita = execFileSync('curl', args, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000,
      });
    } catch (errore) {
      const testo = String(errore?.stderr || errore?.message || errore);
      if (/unknown option|not supported|option .*--ssl-no-revoke/i.test(testo)) {
        curlConSslNoRevoke = false;
        continue;
      }
      return { stato: 0, testo: '', errore: testo.trim() };
    }
    const taglio = uscita.lastIndexOf('@@HTTP@@');
    return {
      stato: taglio >= 0 ? Number(uscita.slice(taglio + 8).trim()) : 0,
      testo: taglio >= 0 ? uscita.slice(0, taglio) : uscita,
    };
  }
  return { stato: 0, testo: '', errore: 'curl non ha risposto' };
}

/**
 * La versione servita dal sito di produzione. Su un ramo di lavoro non ha
 * senso: produzione ha un altro commit.
 */ async function controllaVersioneOnline(dominio, attesa) {
  if (!/^\d+\.\d+\.\d+$/.test(attesa)) {
    return {
      esito: 'SALTATA',
      riga: `· versione online non controllata: APP_VERSION illeggibile nel commit (${attesa})`,
    };
  }
  if (!dominio) return { esito: 'SALTATA', riga: '· versione online: nessun dominio configurato' };
  const risposta = await testoDa(`${dominio}/`);
  if (risposta.errore) {
    return { esito: 'ILLEGGIBILE', riga: `· versione online non letta (${risposta.errore})` };
  }
  if (risposta.stato === 401 || risposta.stato === 403) {
    return {
      esito: 'ILLEGGIBILE',
      riga: `· versione online non letta: ${dominio} è protetto (${risposta.stato})`,
    };
  }
  if (risposta.stato >= 400 || !risposta.testo) {
    return {
      esito: 'ILLEGGIBILE',
      riga: `· versione online non letta: ${dominio} risponde ${risposta.stato || 'nulla'}`,
    };
  }
  const confronto = versioneOnline(attesa, risposta.testo);
  if (confronto.esito === 'OK') {
    return { esito: 'OK', riga: `✔ versione online: ${confronto.dettaglio}` };
  }
  if (confronto.esito === 'DIVERSA') {
    return { esito: 'DIVERSA', riga: `✖ versione online: ${confronto.dettaglio}` };
  }
  return { esito: 'ILLEGGIBILE', riga: `· versione online non letta: ${confronto.dettaglio}` };
}

// --- stampa ---------------------------------------------------------------

function durata(inizio) {
  const secondi = Math.round((Date.now() - inizio) / 1000);
  const minuti = Math.floor(secondi / 60);
  return minuti > 0 ? `${minuti} min ${secondi % 60} s` : `${secondi} s`;
}

function stampaRighe(righe) {
  for (const riga of righe) console.info(`  ${riga}`);
}

function impronta(righe) {
  return righe.join('|');
}

function stampaVersione(sha) {
  const controllo = versioneCoerente(
    versioneApp(sha),
    versionePacchetto(sha),
    primaVoceChangelog(sha)
  );
  console.info(
    controllo.coerente
      ? `  ✔ Versione del commit ${shaBreve(sha)}: ${controllo.dettaglio} (package.json, APP_VERSION, CHANGELOG)`
      : `  ⚠ Versioni del commit ${shaBreve(sha)} non allineate: ${controllo.dettaglio}`
  );
}

function chiudi(esito, inizio, sha, rigaOnline) {
  if (esito === 'OK') {
    console.info(`\n✔ Consegna verificata in ${durata(inizio)}`);
    stampaVersione(sha);
    if (rigaOnline) {
      console.info(`  ${rigaOnline}`);
    } else {
      console.info(
        '  · Versione online non controllata (solo i commit su main hanno una produzione).'
      );
    }
    return 0;
  }
  if (esito === 'FALLITO') {
    console.error(`\n✖ Consegna NON riuscita (${durata(inizio)})`);
    console.error('  Le righe ✖ qui sopra dicono cosa è rosso; le altre sono verdi.');
    return 1;
  }
  console.info(`\n… Consegna ancora in corso dopo ${durata(inizio)}`);
  console.info('  Togli --una-volta per attendere, o riprova più tardi.');
  return 2;
}

// --- principale -----------------------------------------------------------

async function main() {
  const opzioni = argomenti(process.argv.slice(2));
  const contesto = leggiContesto(opzioni);
  const inizio = Date.now();
  const proprietario = contesto.repo.split('/')[0];

  // Il commit deve essere sul repository: se non c'è, il push non è arrivato.
  try {
    await api(`/repos/${contesto.repo}/commits/${contesto.sha}`);
  } catch (errore) {
    // GitHub risponde 404 oppure 422 «No commit found for SHA»: in entrambi i
    // casi il commit non è arrivato sul repository.
    const assente =
      errore instanceof ErroreApi &&
      (errore.stato === 404 || (errore.stato === 422 && /no commit found/i.test(errore.message)));
    if (assente) {
      esci(`il commit ${shaBreve(contesto.sha)} non è su ${contesto.repo}: fai il push e riprova.`);
    }
    esci(errore.message || String(errore));
  }

  const ciAttesa = await pullRequestAperta(contesto.repo, proprietario, contesto.ramo);
  const dominio = contesto.produzione ? dominioProduzione(opzioni) : '';
  const versioneAttesa = versioneApp(contesto.sha);
  console.info(
    `Consegna di ${shaBreve(contesto.sha)} su ${contesto.ramo} — ${contesto.repo}` +
      (TOKEN ? '' : ' (senza GH_TOKEN: API pubbliche)')
  );
  if (contesto.produzione) {
    console.info(
      '  attendo anteprime, produzioni e CI' + (dominio ? `, poi la versione su ${dominio}` : '')
    );
  } else {
    console.info(
      `  attendo le anteprime${ciAttesa ? ' e la CI' : ' (CI: non prevista senza pull request aperta)'};` +
        ' la produzione seguirà col commit su main'
    );
  }

  const attesi = ambientiAttesi(opzioni.progetti, contesto.produzione);
  // Un commit di ramo poi fuso su main ha anche le produzioni: non sono un
  // ambiente «strano», semplicemente qui non le aspettiamo.
  const conosciuti = [
    ...ambientiAttesi(opzioni.progetti, false),
    ...ambientiAttesi(opzioni.progetti, true),
  ];
  const scadenza = inizio + opzioni.timeoutMinuti * 60 * 1000;
  let ultimaImpronta = '';
  let ultimoVerdetto = null;
  let ultimaRigaOnline = null;
  let avvisoAttesa = false;

  for (;;) {
    let raccolto;
    try {
      raccolto = await raccogli(contesto.repo, contesto.sha);
    } catch (errore) {
      // Un repository sbagliato o un token senza permessi non si aggiustano
      // aspettando: si esce subito con il motivo.
      if (errore instanceof ErroreApi && [403, 404, 422].includes(errore.stato)) {
        esci(errore.message, 1);
      }
      // Un errore di rete momentaneo non deve far perdere l'attesa: si riprova.
      nota(
        `controllo non riuscito (${errore.message || errore}): riprovo tra ${opzioni.intervalloSec} s`
      );
      raccolto = null;
    }

    if (raccolto) {
      const verdetto = valutaConsegna({
        sha: contesto.sha,
        ramo: contesto.ramo,
        progetti: opzioni.progetti,
        deployments: raccolto.deployments,
        stati: raccolto.stati,
        run: raccolto.run,
        ciAttesa,
      });
      ultimoVerdetto = verdetto;

      const nonAttesi = ambientiNonAttesi(raccolto.deployments, conosciuti, contesto.sha);
      const firma = impronta(verdetto.righe);
      if (firma !== ultimaImpronta) {
        console.info(`[${durata(inizio)}]`);
        stampaRighe(verdetto.righe);
        for (const ambiente of nonAttesi) {
          nota(
            `deployment con un ambiente non atteso per questo commit: «${ambiente}» ` +
              '(controlla --progetti o i progetti collegati su Vercel)'
          );
        }
        ultimaImpronta = firma;
      }

      if (verdetto.esito === 'FALLITO') {
        process.exit(chiudi('FALLITO', inizio, contesto.sha, ultimaRigaOnline));
      }
      if (verdetto.esito === 'OK') {
        // Deployment e CI verdi; resta da vedere cosa serve davvero il sito.
        const online = contesto.produzione
          ? await controllaVersioneOnline(dominio, versioneAttesa)
          : { esito: 'SALTATA', riga: null };
        if (online.riga && online.riga !== ultimaRigaOnline) {
          console.info(`  ${online.riga}`);
          ultimaRigaOnline = online.riga;
        }
        if (online.esito === 'DIVERSA' && !opzioni.unaVolta) {
          // L'alias di produzione può impiegare qualche secondo a servire il
          // commit appena pubblicato: si continua ad attendere fino al limite.
          if (!avvisoAttesa) {
            nota('la produzione serve ancora la release precedente: continuo ad attendere');
            avvisoAttesa = true;
          }
        } else {
          const rosso = online.esito === 'DIVERSA';
          process.exit(
            chiudi(rosso ? 'FALLITO' : 'OK', inizio, contesto.sha, online.riga ?? ultimaRigaOnline)
          );
        }
      }
      if (verdetto.esito === 'IN_CORSO' && opzioni.unaVolta) {
        process.exit(chiudi('IN_CORSO', inizio, contesto.sha, ultimaRigaOnline));
      }
    } else if (opzioni.unaVolta) {
      process.exit(2);
    }

    if (Date.now() + opzioni.intervalloSec * 1000 > scadenza) {
      const righe = ultimoVerdetto ? ultimoVerdetto.righe : [];
      console.info(`\n… Tempo scaduto (${opzioni.timeoutMinuti} min)`);
      stampaRighe(righe);
      if (ultimoVerdetto?.mancanti.length) {
        console.info(`  Manca ancora: ${ultimoVerdetto.mancanti.join(', ')}`);
      }
      if (ultimaRigaOnline) console.info(`  ${ultimaRigaOnline}`);
      console.info(
        '  Riprova con --timeout=… per attendere più a lungo, oppure guarda i link qui sopra.'
      );
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, opzioni.intervalloSec * 1000));
  }
}

main().catch((errore) => {
  esci(errore?.message || String(errore));
});
