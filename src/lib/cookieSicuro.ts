// src/lib/cookieSicuro.ts
//
// Quando i cookie di sessione devono avere il flag `Secure` (inviati solo su
// HTTPS). In cloud sempre, in produzione. Nell'edizione portable solo se è
// attiva la modalità rete locale con HTTPS (PORTABLE_HTTPS=1, impostata da
// Avvia-CCII.bat): in uso su un solo PC la pagina è su http://127.0.0.1 e un
// cookie Secure non verrebbe salvato.
export function cookieSicuro(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'production') return false;
  if (env.PORTABLE === '1') return env.PORTABLE_HTTPS === '1';
  return true;
}
