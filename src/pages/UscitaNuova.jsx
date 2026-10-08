import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import UscitaForm from '../components/UscitaForm.jsx';
import { createUscita } from '../services/uscite';

export default function UscitaNuova() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const dataParam = searchParams.get('data');
  // Data precompilata quando si arriva dal calendario della Dashboard (?data=YYYY-MM-DD).
  const initialValues = useMemo(
    () => (dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam) ? { data: dataParam } : null),
    [dataParam],
  );

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

      <UscitaForm initialValues={initialValues} onSubmit={handleSubmit} submitting={submitting} errorMessage={error} onCancel={() => navigate(-1)} />
    </section>
  );
}
