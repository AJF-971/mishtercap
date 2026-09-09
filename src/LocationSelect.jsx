import { useState, useEffect } from 'react';
// Adjust to match your existing Supabase client import path
import { supabase } from './supabaseClient';

// Drop-in replacement for a free-text location field.
// Usage: <LocationSelect value={job.location} onChange={(label) => setJob({...job, location: label})} />

export default function LocationSelect({ value, onChange, required = false, disabled = false }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('locations')
      .select('id, label')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setLocations(data);
        setLoading(false);
      });
  }, []);

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled || loading}
      style={{
        fontSize: 14,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid #3a3a37',
        background: '#1e1e1c',
        color: '#e8e6e1',
        width: '100%',
      }}
    >
      <option value="" disabled>
        {loading ? 'Loading locations...' : 'Select a location'}
      </option>
      {locations.map((loc) => (
        <option key={loc.id} value={loc.label}>
          {loc.label}
        </option>
      ))}
    </select>
  );
}
