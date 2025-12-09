import { useEffect, useMemo, useState } from 'react';
import {
  createLibraryBook,
  deleteLibraryBook,
  getLibraryBooks,
  updateLibraryBook,
} from '../services/library.js';
import {
  completeLibraryLoan,
  createLibraryLoan,
  getLibraryLoans,
} from '../services/libraryLoans.js';

const emptyBookForm = {
  code: '',
  title: '',
  author: '',
  shelf: '',
  topic: '',
  notes: '',
};

const STATUS_LABELS = {
  available: 'Disponibile al prestito',
  loaned: 'In prestito',
  maintenance: 'In manutenzione',
};

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Biblioteca() {
  const [books, setBooks] = useState([]);
  const [bookForm, setBookForm] = useState(emptyBookForm);
  const [editingId, setEditingId] = useState(null);
  const [loanForms, setLoanForms] = useState({});
  const [newLoanForm, setNewLoanForm] = useState({ bookId: '', borrower: '', contact: '', notes: '' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loans, setLoans] = useState([]);
  const [loansLoading, setLoansLoading] = useState(true);
  const [loanError, setLoanError] = useState('');
  const [loanFilter, setLoanFilter] = useState('active');

  useEffect(() => {
    loadBooks();
    loadLoans();
  }, []);

  async function loadBooks() {
    setLoading(true);
    setError('');
    try {
      const data = await getLibraryBooks();
      setBooks(data);
    } catch (loadError) {
      console.error('[Biblioteca] Impossibile recuperare il catalogo:', loadError);
      setError('Non riesco a leggere i libri dal database.');
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadLoans() {
    setLoansLoading(true);
    setLoanError('');
    try {
      const data = await getLibraryLoans();
      setLoans(data);
    } catch (loadError) {
      console.error('[Biblioteca] Impossibile recuperare i prestiti:', loadError);
      setLoanError('Non riesco a leggere i prestiti registrati.');
      setLoans([]);
    } finally {
      setLoansLoading(false);
    }
  }

  const stats = useMemo(() => {
    return {
      total: books.length,
      available: books.filter((book) => book.status === 'available').length,
      loaned: books.filter((book) => book.status === 'loaned').length,
      maintenance: books.filter((book) => book.status === 'maintenance').length,
    };
  }, [books]);

  const filteredBooks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return books.filter((book) => {
      const matchesSearch =
        !term ||
        book.title?.toLowerCase().includes(term) ||
        book.author?.toLowerCase().includes(term) ||
        book.code?.toLowerCase().includes(term) ||
        book.topic?.toLowerCase().includes(term);
      const matchesFilter = statusFilter === 'all' || book.status === statusFilter;
      return matchesSearch && matchesFilter;
    });
  }, [books, search, statusFilter]);
  const availableBooks = useMemo(() => books.filter((book) => book.status === 'available'), [books]);
  const booksMap = useMemo(() => new Map(books.map((book) => [book.id, book])), [books]);
  const filteredLoans = useMemo(() => {
    return loans.filter((loan) => (loanFilter === 'all' ? true : loan.status === loanFilter));
  }, [loans, loanFilter]);

  function handleBookChange(field, value) {
    setBookForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleLoanFormChange(bookId, field, value) {
    setLoanForms((prev) => ({
      ...prev,
      [bookId]: {
        borrower: prev[bookId]?.borrower ?? '',
        contact: prev[bookId]?.contact ?? '',
        notes: prev[bookId]?.notes ?? '',
        [field]: value,
      },
    }));
  }

  async function handleBookSubmit(event) {
    event.preventDefault();
    setMessage('');
    const normalized = {
      code: bookForm.code.trim(),
      title: bookForm.title.trim(),
      author: bookForm.author.trim(),
      shelf: bookForm.shelf.trim(),
      topic: bookForm.topic.trim(),
      notes: bookForm.notes.trim(),
    };
    if (!normalized.code || !normalized.title) {
      setMessage('Codice e titolo sono obbligatori.');
      return;
    }
    const payload = {
      code: normalized.code,
      title: normalized.title,
      author: normalized.author || null,
      shelf_position: normalized.shelf || null,
      topic: normalized.topic || null,
      notes: normalized.notes || null,
    };
    try {
      if (editingId) {
        await updateLibraryBook(editingId, payload);
        setEditingId(null);
      } else {
        await createLibraryBook({ ...payload, status: 'available' });
      }
      setBookForm(emptyBookForm);
      loadBooks();
    } catch (submitError) {
      console.error('[Biblioteca] Errore salvataggio libro:', submitError);
      setMessage(submitError.message ?? 'Impossibile salvare il libro.');
    }
  }

  function handleBookEdit(book) {
    setBookForm({
      code: book.code ?? '',
      title: book.title ?? '',
      author: book.author ?? '',
      shelf: book.shelf_position ?? '',
      topic: book.topic ?? '',
      notes: book.notes ?? '',
    });
    setEditingId(book.id);
    setMessage('');
  }

  function handleCancelEdit() {
    setEditingId(null);
    setBookForm(emptyBookForm);
    setMessage('');
  }

  function handleBookRemove(bookId) {
    if (!window.confirm('Eliminare questo libro dal catalogo?')) return;
    deleteLibraryBook(bookId)
      .then(() => loadBooks())
      .catch((removeError) => {
        console.error('[Biblioteca] Errore eliminazione libro:', removeError);
        setMessage(removeError.message ?? 'Impossibile eliminare il libro.');
      });
  }

  function handleNewLoanChange(field, value) {
    setNewLoanForm((prev) => ({ ...prev, [field]: value }));
  }

  async function registerLoan(bookId, borrower, contact, notes) {
    const payload = {
      status: 'loaned',
      borrower_name: borrower,
      borrower_contact: contact || null,
      loan_notes: notes || null,
      loaned_at: new Date().toISOString(),
    };
    try {
      await updateLibraryBook(bookId, payload);
      await createLibraryLoan({
        book_id: bookId,
        borrower_name: borrower,
        borrower_contact: contact || null,
        notes: notes || null,
      });
      setMessage('');
      await Promise.all([loadBooks(), loadLoans()]);
    } catch (loanError) {
      console.error('[Biblioteca] Errore registrazione prestito:', loanError);
      throw loanError;
    }
  }

  async function handleLoanSubmit(event, bookId) {
    event.preventDefault();
    const form = loanForms[bookId] ?? {};
    const borrower = form.borrower?.trim();
    if (!borrower) {
      setMessage('Indica il nominativo del socio a cui viene prestato il libro.');
      return;
    }
    try {
      await registerLoan(bookId, borrower, form.contact?.trim() || '', form.notes?.trim() || '');
      setLoanForms((prev) => ({ ...prev, [bookId]: { borrower: '', contact: '', notes: '' } }));
    } catch (loanError) {
      setMessage(loanError.message ?? 'Impossibile registrare il prestito.');
    }
  }

  async function handleNewLoanSubmit(event) {
    event.preventDefault();
    const borrower = newLoanForm.borrower.trim();
    if (!newLoanForm.bookId || !borrower) {
      setMessage('Seleziona un libro disponibile e indica il socio.');
      return;
    }
    try {
      await registerLoan(newLoanForm.bookId, borrower, newLoanForm.contact.trim(), newLoanForm.notes.trim());
      setNewLoanForm({ bookId: '', borrower: '', contact: '', notes: '' });
    } catch (loanError) {
      setMessage(loanError.message ?? 'Impossibile registrare il prestito.');
    }
  }

  async function handleReturn(bookId) {
    const activeLoan = loans.find((loan) => loan.book_id === bookId && loan.status === 'active');
    try {
      await updateLibraryBook(bookId, {
        status: 'available',
        borrower_name: null,
        borrower_contact: null,
        loan_notes: null,
        loaned_at: null,
      });
      if (activeLoan) {
        await completeLibraryLoan(activeLoan.id);
      }
      await Promise.all([loadBooks(), loadLoans()]);
    } catch (returnError) {
      console.error('[Biblioteca] Errore restituzione libro:', returnError);
      setMessage(returnError.message ?? 'Impossibile segnare la restituzione.');
    }
  }

  return (
    <section className="page-grid">
      <header>
        <h1>Biblioteca sociale</h1>
        <p>
          Gestisci il catalogo dei libri tecnici e registra i prestiti per sapere sempre dove sono i volumi. I dati sono archiviati in Supabase e presto saranno collegati alle procedure di prestito.
        </p>
      </header>

      <article className="card">
        <h2>Stato catalogo</h2>
        <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
          Totale libri: {stats.total} · Disponibili: {stats.available} · In prestito: {stats.loaned}{' '}
          {stats.maintenance ? `· Non disponibili: ${stats.maintenance}` : ''}
        </p>
      </article>

      <article className="card">
        <h2>{editingId ? 'Modifica libro' : 'Aggiungi libro'}</h2>
        <form
          onSubmit={handleBookSubmit}
          style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
        >
          <label>
            Codice libro
            <input value={bookForm.code} onChange={(event) => handleBookChange('code', event.target.value)} required placeholder="Es. BIB-001" />
          </label>
          <label>
            Titolo
            <input value={bookForm.title} onChange={(event) => handleBookChange('title', event.target.value)} required placeholder="Titolo completo" />
          </label>
          <label>
            Autore
            <input value={bookForm.author} onChange={(event) => handleBookChange('author', event.target.value)} placeholder="Autore/i" />
          </label>
          <label>
            Posizione scaffale
            <input value={bookForm.shelf} onChange={(event) => handleBookChange('shelf', event.target.value)} placeholder="Es. Scaffale B - Ripiano 3" />
          </label>
          <label>
            Unità tematica
            <input value={bookForm.topic} onChange={(event) => handleBookChange('topic', event.target.value)} placeholder="Tecnica, storia, catasto..." />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Note
            <textarea rows={2} value={bookForm.notes} onChange={(event) => handleBookChange('notes', event.target.value)} placeholder="Stato di conservazione, edizione, ecc." />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit">{editingId ? 'Aggiorna libro' : 'Aggiungi al catalogo'}</button>
            {editingId && (
              <button type="button" style={{ background: '#adb5bd' }} onClick={handleCancelEdit}>
                Annulla modifica
              </button>
            )}
          </div>
        </form>
        {message && <p style={{ marginTop: '0.5rem', color: 'var(--color-accent)' }}>{message}</p>}
      </article>

      <article className="card">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Catalogo libri</h2>
          <input
            type="search"
            placeholder="Cerca per titolo, autore o codice"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ flex: '2 0 220px' }}
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ flex: '1 0 140px' }}>
            <option value="all">Tutti gli stati</option>
            <option value="available">Disponibili</option>
            <option value="loaned">In prestito</option>
            <option value="maintenance">In manutenzione</option>
          </select>
        </div>

        {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
        {loading ? (
          <p>Caricamento in corso...</p>
        ) : (
          <div className="card-list" style={{ marginTop: '1rem' }}>
            {filteredBooks.map((book) => (
              <article key={book.id} className="card" style={{ padding: '1rem' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: 0, color: 'var(--color-muted)' }}>Codice: {book.code} · Scaffale: {book.shelf_position || 'N/D'}</p>
                    <h3 style={{ margin: 0 }}>{book.title}</h3>
                    <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                      {book.author || 'Autore non indicato'} · {book.topic ? `Unità tematica: ${book.topic}` : 'Unità tematica non indicata'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => handleBookEdit(book)}>
                      Modifica
                    </button>
                    <button type="button" style={{ background: '#e03131' }} onClick={() => handleBookRemove(book.id)}>
                      Rimuovi
                    </button>
                  </div>
                </header>

                {book.notes && (
                  <p style={{ margin: '0.5rem 0', color: 'var(--color-muted)' }}>
                    Note: {book.notes}
                  </p>
                )}

                <div style={{ marginTop: '0.5rem', padding: '0.75rem', borderRadius: '0.75rem', background: '#f8f9fa' }}>
                  <strong style={{ color: book.status === 'available' ? '#2f9e44' : '#f08c00' }}>
                    {STATUS_LABELS[book.status] ?? book.status}
                  </strong>
                  {book.status === 'loaned' ? (
                    <div style={{ marginTop: '0.35rem', color: 'var(--color-muted)' }}>
                      In prestito a <strong>{book.borrower_name ?? 'N/D'}</strong>
                      {book.borrower_contact ? ` · Contatto: ${book.borrower_contact}` : ''}
                      <br />
                      Dal: {formatDate(book.loaned_at) || 'data non disponibile'}
                      {book.loan_notes ? ` · Note: ${book.loan_notes}` : ''}
                      <div style={{ marginTop: '0.5rem' }}>
                        <button type="button" style={{ background: '#2f9e44' }} onClick={() => handleReturn(book.id)}>
                          Segna restituzione
                        </button>
                      </div>
                    </div>
                  ) : book.status === 'available' ? (
                    <form
                      onSubmit={(event) => handleLoanSubmit(event, book.id)}
                      style={{
                        display: 'grid',
                        gap: '0.5rem',
                        marginTop: '0.5rem',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                      }}
                    >
                      <input
                        placeholder="Socio / destinatario"
                        value={loanForms[book.id]?.borrower ?? ''}
                        onChange={(event) => handleLoanFormChange(book.id, 'borrower', event.target.value)}
                      />
                      <input
                        placeholder="Contatto"
                        value={loanForms[book.id]?.contact ?? ''}
                        onChange={(event) => handleLoanFormChange(book.id, 'contact', event.target.value)}
                      />
                      <input
                        placeholder="Note prestito"
                        value={loanForms[book.id]?.notes ?? ''}
                        onChange={(event) => handleLoanFormChange(book.id, 'notes', event.target.value)}
                      />
                      <button type="submit" style={{ alignSelf: 'stretch' }}>
                        Registra prestito
                      </button>
                    </form>
                  ) : (
                    <p style={{ marginTop: '0.5rem', color: 'var(--color-muted)' }}>
                      Il libro è in manutenzione. Aggiorna lo stato su Supabase per renderlo disponibile.
                    </p>
                  )}
                </div>
              </article>
            ))}
            {!filteredBooks.length && (
              <p style={{ color: 'var(--color-muted)' }}>Nessun libro trovato con i filtri correnti.</p>
            )}
          </div>
        )}
      </article>

      <article className="card">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Prestiti registrati</h2>
          <select value={loanFilter} onChange={(event) => setLoanFilter(event.target.value)} style={{ flex: '0 0 200px' }}>
            <option value="active">Solo attivi</option>
            <option value="returned">Restituiti</option>
            <option value="all">Tutti</option>
          </select>
        </div>
        {loanError && <p style={{ color: 'var(--color-accent)' }}>{loanError}</p>}
        <form
          onSubmit={handleNewLoanSubmit}
          style={{
            display: 'grid',
            gap: '0.5rem',
            margin: '1rem 0',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          }}
        >
          <select
            value={newLoanForm.bookId}
            onChange={(event) => handleNewLoanChange('bookId', event.target.value)}
            disabled={!availableBooks.length}
          >
            <option value="">
              {availableBooks.length ? 'Seleziona un libro disponibile' : 'Nessun libro disponibile'}
            </option>
            {availableBooks.map((book) => (
              <option key={book.id} value={book.id}>
                {book.code} · {book.title}
              </option>
            ))}
          </select>
          <input
            placeholder="Socio / destinatario"
            value={newLoanForm.borrower}
            onChange={(event) => handleNewLoanChange('borrower', event.target.value)}
          />
          <input
            placeholder="Contatto"
            value={newLoanForm.contact}
            onChange={(event) => handleNewLoanChange('contact', event.target.value)}
          />
          <input
            placeholder="Note prestito"
            value={newLoanForm.notes}
            onChange={(event) => handleNewLoanChange('notes', event.target.value)}
          />
          <button type="submit" disabled={!availableBooks.length}>
            Nuovo prestito
          </button>
        </form>
        {loansLoading ? (
          <p>Caricamento prestiti...</p>
        ) : filteredLoans.length ? (
          <div className="card-list" style={{ marginTop: '1rem' }}>
            {filteredLoans.map((loan) => {
              const book = booksMap.get(loan.book_id);
              return (
                <article key={loan.id} className="card" style={{ padding: '1rem' }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div>
                      <strong>{book?.title ?? 'Libro non trovato'}</strong>
                      <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                        Codice: {book?.code ?? 'N/D'} · Stato prestito: {loan.status === 'active' ? 'Attivo' : 'Restituito'}
                      </p>
                    </div>
                    {loan.status === 'active' && (
                      <button type="button" style={{ background: '#2f9e44' }} onClick={() => handleReturn(loan.book_id)}>
                        Segna restituzione
                      </button>
                    )}
                  </header>
                  <p style={{ margin: '0.35rem 0', color: 'var(--color-muted)' }}>
                    In prestito a <strong>{loan.borrower_name}</strong>
                    {loan.borrower_contact ? ` · Contatto: ${loan.borrower_contact}` : ''}
                  </p>
                  <p style={{ margin: '0.35rem 0', color: 'var(--color-muted)' }}>
                    Dal: {formatDate(loan.loaned_at) || '-'}
                    {loan.returned_at ? ` · Restituito: ${formatDate(loan.returned_at)}` : ''}
                  </p>
                  {loan.notes && <p style={{ margin: '0.35rem 0', color: 'var(--color-muted)' }}>Note: {loan.notes}</p>}
                </article>
              );
            })}
          </div>
        ) : (
          <p style={{ marginTop: '0.5rem', color: 'var(--color-muted)' }}>Nessun prestito presente con il filtro selezionato.</p>
        )}
      </article>
    </section>
  );
}
