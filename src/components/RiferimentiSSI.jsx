// Riferimenti ufficiali CNSS-SSI per l'organizzazione dei corsi.
//
// Sono LINK alle pagine ufficiali, non copie: la modulistica della Commissione
// Nazionale Scuole di Speleologia viene aggiornata periodicamente e una copia
// ferma dentro l'app diventerebbe fuorviante. I moduli gia' compilati dal
// gruppo vanno invece caricati nella cartella del materiale didattico.

const RIFERIMENTI = [
  {
    titolo: 'Modulistica, regolamenti e istruzioni corsi',
    descrizione:
      'Pagina principale della Commissione Nazionale Scuole di Speleologia: regolamento CNSS, norme tecniche, responsabilit\u00e0 dell\'istruttore, istruzioni per i direttori di corso, fac-simile di iscrizione allievo.',
    url: 'https://speleo.it/site/commissione-scuole-speleologia-2/',
  },
  {
    titolo: 'Commissione Nazionale Scuole di Speleologia',
    descrizione:
      'Come \u00e8 organizzata la CNSS, cosa fanno le scuole, i comitati regionali e i coordinatori. Contatti del coordinatore nazionale.',
    url: 'https://speleo.it/site/commissione-scuole-speleologia/',
  },
  {
    titolo: 'Area download modulistica SSI',
    descrizione:
      'Statuto, regolamento, patrocini, moduli delle uscite propedeutiche e dei corsi di secondo e terzo livello, modulo d\'ordine del manuale "Appunti di Tecnica".',
    url: 'https://www.speleo.it/site/index.php/scuole/moduli',
  },
  {
    titolo: 'Corsi di I livello',
    descrizione:
      'Elenco dei corsi di primo livello pubblicati dalle scuole aderenti: utile per confrontare programmi e periodi.',
    url: 'https://speleo.it/site/scuole/',
  },
];

export default function RiferimentiSSI() {
  return (
    <article className="card">
      <h2 style={{ margin: 0 }}>Modulistica e riferimenti CNSS-SSI</h2>
      <p style={{ marginTop: '0.35rem', color: 'var(--color-muted)' }}>
        Documenti ufficiali della Commissione Nazionale Scuole di Speleologia. Sono collegamenti al sito
        della SSI, così hai sempre la versione aggiornata: la modulistica cambia e una copia salvata qui
        diventerebbe sbagliata senza accorgersene.
      </p>

      <div
        style={{
          background: '#fff9db',
          border: '1px solid #f0d98a',
          borderRadius: '0.75rem',
          padding: '0.75rem',
          margin: '0.75rem 0',
        }}
      >
        <strong>Per i corsi di primo livello si usa la procedura online.</strong>
        <p style={{ margin: '0.35rem 0 0' }}>
          I vecchi moduli numerati non sono più pubblicati. Il riferimento per attivare un corso è il
          <strong> coordinatore regionale CNSS-SSI</strong>, che indica come accedere alla procedura e con
          quali tempi. In caso di dubbio vale sempre quanto riportato sul sito della SSI, non questa pagina.
        </p>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.6rem' }}>
        {RIFERIMENTI.map((voce) => (
          <li
            key={voce.url}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: '0.75rem',
              padding: '0.75rem',
            }}
          >
            <a href={voce.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
              {voce.titolo}
            </a>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--color-muted)' }}>{voce.descrizione}</p>
          </li>
        ))}
      </ul>

      <p style={{ marginTop: '0.75rem', color: 'var(--color-muted)' }}>
        I moduli compilati (proposte, elenchi allievi e istruttori, consuntivi) vanno caricati qui sotto nel
        materiale didattico, scegliendo la categoria <strong>Modulistica corsisti</strong>: restano
        nell&apos;archivio privato del gruppo, visibile solo allo staff.
      </p>
    </article>
  );
}
