import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UscitaForm from '../components/UscitaForm.jsx';
import { createUscita } from '../services/uscite';

export default function UscitaNuova() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(payload) {
    setSubmitting(true);
    setError('');
    try {
      const uscita = await createUscita(payload);
      navigate(`/uscite/${uscita.id}`);
    } catch (submissionError) {
      setError(submissionError.message ?? 'Errore durante il salvataggio.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-grid">
      <header>
        <h1>Nuova uscita</h1>
        <p>Registra una nuova attività con responsabile e dettagli logistici.</p>
      </header>

      <UscitaForm onSubmit={handleSubmit} submitting={submitting} errorMessage={error} onCancel={() => navigate('/uscite')} />
    </section>
  );
}
