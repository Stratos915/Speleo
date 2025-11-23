import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const initialItem = {
  nome: '',
  descrizione: '',
  qty_totale: 0,
  qty_disponibile: 0,
};

export default function Magazzino() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(initialItem);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    const { data, error } = await supabase.from('magazzino').select('*');
    if (!error) {
      setItems(data);
    }
    setLoading(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = {
      ...form,
      qty_totale: Number(form.qty_totale),
      qty_disponibile: Number(form.qty_disponibile),
    };
    await supabase.from('magazzino').insert(payload);
    setForm(initialItem);
    loadItems();
  }

  async function handleDelete(id) {
    await supabase.from('magazzino').delete().eq('id', id);
    loadItems();
  }

  return (
    <section>
      <h1>Magazzino</h1>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.5rem', maxWidth: '480px' }}>
        <h2>Nuovo materiale</h2>
        <input
          placeholder="Nome"
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          required
        />
        <textarea
          placeholder="Descrizione"
          value={form.descrizione}
          onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
        />
        <input
          type="number"
          placeholder="Totale"
          value={form.qty_totale}
          onChange={(e) => setForm({ ...form, qty_totale: e.target.value })}
        />
        <input
          type="number"
          placeholder="Disponibile"
          value={form.qty_disponibile}
          onChange={(e) => setForm({ ...form, qty_disponibile: e.target.value })}
        />
        <button>Aggiungi materiale</button>
      </form>

      <div style={{ marginTop: '2rem' }}>
        <h2>Elenco materiali</h2>
        {loading ? (
          <p>Caricamento...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Disponibile</th>
                <th>Totale</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.nome}</td>
                  <td>{item.qty_disponibile}</td>
                  <td>{item.qty_totale}</td>
                  <td>
                    <button onClick={() => handleDelete(item.id)}>Elimina</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
