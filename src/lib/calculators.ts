/**
 * Motore di Calcolo Indici Finanziari (CCII / XBRL)
 * * Questo modulo riceve i dati grezzi estratti dal file XBRL e
 * restituisce un oggetto strutturato con tutti gli indici calcolati.
 */

export const calcolaIndici = (rawXbrlData: any, settoreData: any = {}) => {
  // Helper per evitare errori di divisione per zero o campi mancanti
  const getVal = (key: string) => rawXbrlData[key] || 0;

  // Variabili base estratte
  const utileNetto = getVal('utileNetto');
  const patrimonioNetto = getVal('patrimonioNetto') || 1; // Default 1 per sicurezza
  const risultatoOperativo = getVal('risultatoOperativo');
  const totaleAttivo = getVal('totaleAttivo') || 1;
  const ricaviVendite = getVal('ricaviVendite') || 1;
  const utileAnteImposte = getVal('utileAnteImposte');
  const oneriFinanziari = getVal('oneriFinanziari');
  const attivoCorrente = getVal('attivoCorrente');
  const passivoCorrente = getVal('passivoCorrente') || 1;
  const rimanenze = getVal('rimanenze');
  const totalePassivo = getVal('totalePassivo') || 1;
  const immobilizzazioni = getVal('immobilizzazioni') || 1;
  const costoVenduto = getVal('costoVenduto');
  const rimanenzeMedie = getVal('rimanenzeMedie') || 1;
  const creditiVersoClienti = getVal('creditiVersoClienti');
  const debitiVersoFornitori = getVal('debitiVersoFornitori');
  const acquisti = getVal('acquisti') || 1;

  // Elementi per DSCR e EBITDA
  const ammortamenti = getVal('ammortamenti');
  const svalutazioni = getVal('svalutazioni');
  const accantonamenti = getVal('accantonamenti');
  const varCapitaleCircolante = getVal('varCapitaleCircolante');
  const interessiPassivi = getVal('interessiPassivi');
  const quotaCapitaleFinanziamenti = getVal('quotaCapitaleFinanziamenti');
  const totaleDebiti = getVal('totaleDebiti');

  // --- CALCOLI ---

  // Redditività
  const ROE = (utileNetto / patrimonioNetto) * 100;
  const ROI = (risultatoOperativo / totaleAttivo) * 100;
  const ROS = (risultatoOperativo / ricaviVendite) * 100;
  const ROA = (utileNetto / totaleAttivo) * 100;
  const EBIT = utileAnteImposte + oneriFinanziari;
  const EBITDA = EBIT + ammortamenti + svalutazioni + accantonamenti;
  const EBITDA_Margin = (EBITDA / ricaviVendite) * 100;

  // Liquidità e Solvibilità
  const currentRatio = attivoCorrente / passivoCorrente;
  const quickRatio = (attivoCorrente - rimanenze) / passivoCorrente;
  const CCN = attivoCorrente - (passivoCorrente || 0);

  // Solidità
  const indIndipendenzaFin = (patrimonioNetto / totalePassivo) * 100;
  const leverage = totaleDebiti / patrimonioNetto;
  const tassoCopImmob = (patrimonioNetto / immobilizzazioni) * 100;

  // Rotazione e Durata
  const rotMagazzino = costoVenduto / rimanenzeMedie;
  const durataMediaCrediti = (creditiVersoClienti / ricaviVendite) * 365;
  const durataMediaDebiti = (debitiVersoFornitori / acquisti) * 365;

  // CCII Specifici
  const cashFlow = utileNetto + varCapitaleCircolante + ammortamenti + accantonamenti;
  const servizioDebito = interessiPassivi + quotaCapitaleFinanziamenti;
  const DSCR = servizioDebito !== 0 ? cashFlow / servizioDebito : 0;
  const capitaleInvestito = totaleDebiti + patrimonioNetto;
  const debitoSuCapitale = capitaleInvestito !== 0 ? totaleDebiti / capitaleInvestito : 0;

  // Benchmark (se i dati di settore esistono)
  const scostamentoEBITDA = settoreData.ebitdaMargin
    ? ((EBITDA_Margin - settoreData.ebitdaMargin) / settoreData.ebitdaMargin) * 100
    : 0;

  return {
    redditivita: [
      { label: 'ROE', valore: ROE.toFixed(2), unita: '%' },
      { label: 'ROI', valore: ROI.toFixed(2), unita: '%' },
      { label: 'ROS', valore: ROS.toFixed(2), unita: '%' },
      { label: 'ROA', valore: ROA.toFixed(2), unita: '%' },
      { label: 'EBIT', valore: (EBIT ?? 0).toLocaleString('it-IT'), unita: '€' },
      { label: 'EBITDA Margin', valore: EBITDA_Margin.toFixed(2), unita: '%' },
    ],
    liquidita: [
      { label: 'Current Ratio', valore: currentRatio.toFixed(2), unita: 'x' },
      { label: 'Quick Ratio', valore: quickRatio.toFixed(2), unita: 'x' },
      {
        label: 'Capitale Circolante Netto',
        valore: (CCN ?? 0).toLocaleString('it-IT'),
        unita: '€',
      },
    ],
    solidita: [
      { label: 'Ind. Indipendenza Fin.', valore: indIndipendenzaFin.toFixed(2), unita: '%' },
      { label: 'Leverage', valore: leverage.toFixed(2), unita: 'x' },
      { label: 'Copertura Immobilizzazioni', valore: tassoCopImmob.toFixed(2), unita: '%' },
    ],
    rotazione: [
      { label: 'Rotazione Magazzino', valore: rotMagazzino.toFixed(2), unita: 'x' },
      { label: 'Durata Media Crediti', valore: Math.round(durataMediaCrediti), unita: 'gg' },
      { label: 'Durata Media Debiti', valore: Math.round(durataMediaDebiti), unita: 'gg' },
    ],
    ccii: [
      { label: 'DSCR', valore: DSCR.toFixed(2), unita: 'x' },
      { label: 'EBITDA (Valore)', valore: (EBITDA ?? 0).toLocaleString('it-IT'), unita: '€' },
      { label: 'Debito / Capitale', valore: debitoSuCapitale.toFixed(2), unita: 'x' },
    ],
    benchmark: [
      { label: 'Scostamento EBITDA vs Settore', valore: scostamentoEBITDA.toFixed(2), unita: '%' },
    ],
  };
};
