import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient'; // adjust to your actual client path
import { useLocations } from './useLocations';
import JobCard from './JobCard';

// Dashboard: stat cards you tap to filter, plus location chips.
// Both filters combine (e.g. "High priority" + "Smartech" at once).
export default function Dashboard({ onSelectJob }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState(null); // null = all
  const [locationFilter, setLocationFilter] = useState(null); // null = all
  const { locations } = useLocations();

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, plate, make_model, priority, location, service_types, stage_index')
        .order('created_at', { ascending: false });
      if (!error) setJobs(data);
      setLoading(false);
    }
    load();
  }, []);

  const activeCount = jobs.length;
  const highPriorityCount = jobs.filter((j) => j.priority === 'High').length;

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (priorityFilter && j.priority !== priorityFilter) return false;
      if (locationFilter && j.location !== locationFilter) return false;
      return true;
    });
  }, [jobs, priorityFilter, locationFilter]);

  function toggleStat(value) {
    setPriorityFilter((current) => (current === value ? null : value));
  }

  function toggleLocation(label) {
    setLocationFilter((current) => (current === label ? null : label));
  }

  if (loading) {
    return <div style={{ padding: 24, color: '#8a8a86', fontSize: 14 }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => toggleStat(null)}
          style={statCardStyle(priorityFilter === null)}
        >
          <div style={{ fontSize: 13, color: '#8a8a86' }}>Active</div>
          <div style={{ fontSize: 24, fontWeight: 500, color: '#e8e6e1' }}>{activeCount}</div>
        </button>
        <button
          onClick={() => toggleStat('High')}
          style={statCardStyle(priorityFilter === 'High', true)}
        >
          <div style={{ fontSize: 13, color: '#e8635f' }}>High priority</div>
          <div style={{ fontSize: 24, fontWeight: 500, color: '#e8635f' }}>{highPriorityCount}</div>
        </button>
      </div>

      {/* Location filter chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {locations.map((loc) => (
          <button
            key={loc.id}
            onClick={() => toggleLocation(loc.label)}
            style={chipStyle(locationFilter === loc.label)}
          >
            {loc.label}
          </button>
        ))}
      </div>

      {/* Job list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredJobs.length === 0 ? (
          <div style={{ fontSize: 14, color: '#8a8a86', padding: '12px 4px' }}>
            No jobs match these filters.
          </div>
        ) : (
          filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} onClick={onSelectJob} />
          ))
        )}
      </div>
    </div>
  );
}

function statCardStyle(isActive, danger = false) {
  return {
    textAlign: 'left',
    padding: 16,
    borderRadius: 12,
    border: isActive ? '1px solid #e8e6e1' : '1px solid transparent',
    background: danger ? '#2a1c1b' : '#1e1e1c',
    cursor: 'pointer',
  };
}

function chipStyle(isActive) {
  return {
    fontSize: 13,
    padding: '6px 12px',
    borderRadius: 999,
    border: isActive ? '1px solid #e8e6e1' : '1px solid #2e2e2b',
    background: isActive ? '#2e2e2b' : 'transparent',
    color: '#e8e6e1',
    cursor: 'pointer',
  };
}
