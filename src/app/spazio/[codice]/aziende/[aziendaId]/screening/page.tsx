import { redirect } from 'next/navigation';

// LA «VALUTAZIONE COMPLETA» NON È PIÙ UNA PROCEDURA A SÉ.
//
// Aveva una pagina sua, i suoi caricamenti della visura e dei bilanci, e due
// giudizi propri (il semaforo e l'Indice di Attenzione Istruttoria) accanto a
// quelli della verifica contabile: gli stessi documenti entravano due volte e
// la stessa posizione usciva con verdetti che potevano non coincidere.
//
// La relazione e il questionario ora stanno dentro la verifica contabile, che è
// una sola. L'indirizzo resta vivo e porta lì: chi aveva un segnalibro non
// trova un 404, trova la verifica.
export default async function ScreeningAziendaPage({
  params,
}: {
  params: Promise<{ codice: string; aziendaId: string }>;
}) {
  const { codice, aziendaId } = await params;
  redirect(`/spazio/${codice}/verifica-contabile/${aziendaId}`);
}
