import { ModuloIndici } from '@/components/ModuloIndici';

export default function Indici() {
  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-50">
      <ModuloIndici />
    </div>
  );
}

const esportaDizionarioCSV = () => {
  // 1. Intestazioni delle colonne del CSV
  const headers = ['Codice', 'Nome Indice', 'Formula', 'Soglia Allerta', 'Tag XBRL Associati'];

  // Array completo di tutte le proprietà necessarie al compilatore TS
  const indici = [
    {
      codice: 'CCII-01',
      nome: 'Patrimonio Netto',
      formula: 'Attivo - Passivo',
      sogliaAllerta: '< 0',
      tagXb: 'itcc-ci_PatrimonioNetto',
    },
    {
      codice: 'CCII-02',
      nome: 'DSCR a 6 mesi',
      formula: 'Flussi di Cassa Liberi / Servizio del Debito',
      sogliaAllerta: '< 1',
      tagXb: 'itcc-ci_DSCR',
    },
    {
      codice: 'CCII-03',
      nome: 'Copertura Oneri Finanziari',
      formula: 'EBIT / Oneri Finanziari',
      sogliaAllerta: '',
      tagXb: '',
    },
    {
      codice: 'CCII-04',
      nome: 'Indice di Liquidità',
      formula: 'Attivo Circolante / Passivo Corrente',
      sogliaAllerta: '',
      tagXb: '',
    },
  ];

  // 2. Mappatura dei dati correnti della tabella
  const rows = indici.map((ind) => [
    ind.codice,
    `"${ind.nome.replace(/"/g, '""')}"`, // Evita problemi con le virgole nei nomi
    `"${ind.formula.replace(/"/g, '""')}"`,
    ind.sogliaAllerta || '',
    ind.tagXb || '', // Tag puliti per l'esportazione XBRL
  ]);

  // 3. Composizione del contenuto del file
  const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

  // 4. Creazione del link di download nel browser (protetto da controlli SSR)
  if (typeof window !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `dizionario_indici_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
