// src/lib/triage/perimetroHtml.ts
//
// LA CHECK DI PERIMETRO DENTRO UN ELABORATO.
//
// La parte OBBLIGATORIA c'è sempre: ogni TL rilevante, con l'esito che
// l'operatore ha dichiarato — compresa una voce ancora senza risposta, che si
// stampa come «da verificare» perché il documento non deve far credere che la
// verifica sia stata fatta.
//
// La parte FACOLTATIVA — la nota — si stampa solo se qualcuno l'ha scritta. Non
// si aggiunge «nota non indicata» né un avviso: sarebbe un rilievo su un dato
// che nessuno ha chiesto, e trasformerebbe un approfondimento in una mancanza.
//
// Senza voci non si stampa nulla: una check che non ha oggetto non è una
// sezione mancante del documento.

import { ETICHETTA_NATURA, ETICHETTA_STATO, type VocePerimetro } from './perimetro';

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** La check di perimetro come tabella HTML, o stringa vuota se non ha voci. */
export function htmlCheckPerimetro(voci: VocePerimetro[]): string {
  if (voci.length === 0) return '';

  const righe = voci
    .map((v) => {
      const stato = v.stato ? ETICHETTA_STATO[v.stato] : 'Da verificare';
      const natura = v.natura ? ` — ${ETICHETTA_NATURA[v.natura]}` : '';
      const nota = v.nota && v.nota.trim() ? v.nota.trim() : null;
      const contesto = [
        v.materia ? esc(v.materia) : 'materia non indicata',
        v.dipendenza ? esc(v.dipendenza) : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return `<tr>
        <td><b>${esc(v.tipologia)}</b><br><span class="note">${contesto}</span>${
          v.codici.length > 0
            ? `<br><span class="note">Codici: ${esc(v.codici.join(', '))}</span>`
            : ''
        }</td>
        <td>${esc(stato)}${esc(natura)}${
          nota ? `<br><span class="note">${esc(nota)}</span>` : ''
        }</td>
      </tr>`;
    })
    .join('');

  return `<p class="note">Le lavorazioni delle materie contrassegnate come rilevanti per il
perimetro, con l'esito dichiarato nella verifica. La distinzione fra problema momentaneo e modus
operandi non si somma in un unico numero: i due casi portano a decisioni diverse.</p>
<table>
  <thead><tr><th>Lavorazione</th><th>Esito</th></tr></thead>
  <tbody>${righe}</tbody>
</table>`;
}
