import { useState, useEffect } from 'react';
// Adjust this import to match wherever your existing Supabase client lives,
// e.g. import { supabase } from '../lib/supabaseClient';
import { supabase } from './supabaseClient';

// Admin screen for managing garage locations.
// Reads/writes the `locations` table (id, label, sort_order, active).
// `jobs.location` has a foreign key to `locations.label`, so any location
// referenced by an existing job can't be deleted -- only deactivated.

function slugify(label) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default function LocationsAdmin() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadLocations() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      setError(error.message);
    } else {
      setLocations(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadLocations();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) {
      setError('Enter a location name first.');
      return;
    }
    if (locations.some((l) => l.label.toLowerCase() === label.toLowerCase())) {
      setError('That location already exists.');
      return;
    }

    setSaving(true);
    setError('');
    const id = slugify(label) || `location_${Date.now()}`;
    const nextSortOrder = locations.length
      ? Math.max(...locations.map((l) => l.sort_order)) + 1
      : 0;

    const { data, error } = await supabase
      .from('locations')
      .insert({ id, label, sort_order: nextSortOrder, active: true })
      .select()
      .single();

    if (error) {
      setError(error.message);
    } else {
      setLocations([...locations, data]);
      setNewLabel('');
    }
    setSaving(false);
  }

  async function toggleActive(location) {
    setError('');
    const { data, error } = await supabase
      .from('locations')
      .update({ active: !location.active, updated_at: new Date().toISOString() })
      .eq('id', location.id)
      .select()
      .single();

    if (error) {
      setError(error.message);
    } else {
      setLocations(locations.map((l) => (l.id === data.id ? data : l)));
    }
  }

  async function handleDelete(location) {
    if (!window.confirm(`Delete "${location.label}"? This only works if no jobs use it.`)) {
      return;
    }
    setError('');
    const { error } = await supabase.from('locations').delete().eq('id', location.id);

    if (error) {
      // Foreign key violation -- jobs still reference this location
      if (error.code === '23503') {
        setError(`"${location.label}" is still used by existing jobs. Deactivate it instead of deleting.`);
      } else {
        setError(error.message);
      }
    } else {
      setLocations(locations.filter((l) => l.id !== location.id));
    }
  }

  const styles = {
    page: { maxWidth: 480, margin: '0 auto', padding: '24px 16px', color: '#e8e6e1', fontFamily: 'system-ui, sans-serif' },
    heading: { fontSize: 20, fontWeight: 500, marginBottom: 4 },
    subheading: { fontSize: 13, color: '#8a8a86', marginBottom: 20 },
    error: { fontSize: 13, color: '#e8635f', background: '#3a1f1e', border: '1px solid #5a2b29', borderRadius: 8, padding: '8px 12px', marginBottom: 16 },
    row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e1e1c', border: '1px solid #2e2e2b', borderRadius: 12, padding: '12px 14px', marginBottom: 8 },
    rowInactive: { opacity: 0.5 },
    label: { fontSize: 15, fontWeight: 500 },
    meta: { fontSize: 12, color: '#8a8a86', marginTop: 2 },
    actions: { display: 'flex', gap: 8 },
    btn: { fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #3a3a37', background: 'transparent', color: '#e8e6e1', cursor: 'pointer' },
    btnDanger: { fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #5a2b29', background: 'transparent', color: '#e8635f', cursor: 'pointer' },
    form: { display: 'flex', gap: 8, marginTop: 20 },
    input: { flex: 1, fontSize: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid #3a3a37', background: '#1e1e1c', color: '#e8e6e1' },
    addBtn: { fontSize: 14, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#e8e6e1', color: '#1a1a18', fontWeight: 500, cursor: 'pointer' },
  };

  return (
    <div style={styles.page}>
      <div style={styles.heading}>Locations</div>
      <div style={styles.subheading}>Manage the sites job cards can be assigned to.</div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={{ fontSize: 14, color: '#8a8a86' }}>Loading...</div>
      ) : (
        locations.map((location) => (
          <div key={location.id} style={{ ...styles.row, ...(location.active ? {} : styles.rowInactive) }}>
            <div>
              <div style={styles.label}>{location.label}</div>
              <div style={styles.meta}>{location.active ? 'Active' : 'Inactive'}</div>
            </div>
            <div style={styles.actions}>
              <button style={styles.btn} onClick={() => toggleActive(location)}>
                {location.active ? 'Deactivate' : 'Activate'}
              </button>
              <button style={styles.btnDanger} onClick={() => handleDelete(location)}>
                Delete
              </button>
            </div>
          </div>
        ))
      )}

      <form style={styles.form} onSubmit={handleAdd}>
        <input
          style={styles.input}
          type="text"
          placeholder="New location name, e.g. Downtown Branch"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          disabled={saving}
        />
        <button style={styles.addBtn} type="submit" disabled={saving}>
          {saving ? 'Adding...' : 'Add location'}
        </button>
      </form>
    </div>
  );
}
