import { SERVICE_ICON_MAP, useServiceCategories, splitPrimaryService } from './serviceIcons';

const PRIORITY_STYLES = {
  High: { bg: '#3a1f1e', color: '#e8635f' },
  Medium: { bg: '#2a2a27', color: '#c9c7c1' },
  Low: { bg: '#1e1e1c', color: '#8a8a86' },
};

// One job row for the dashboard list.
// Primary service is the headline (bold), everything else is a small icon row.
export default function JobCard({ job, onClick }) {
  const { categories } = useServiceCategories();
  const { primary, rest } = splitPrimaryService(job.service_types, categories);
  const primaryInfo = primary ? SERVICE_ICON_MAP[primary] : null;
  const priorityStyle = PRIORITY_STYLES[job.priority] || PRIORITY_STYLES.Low;

  return (
    <div
      onClick={() => onClick?.(job)}
      style={{
        background: '#1e1e1c',
        border: '1px solid #2e2e2b',
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div>
        <div style={{ fontSize: 13, color: '#8a8a86', marginBottom: 2 }}>
          {job.plate} · {job.make_model}
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#e8e6e1' }}>
          {primaryInfo ? primaryInfo.label : 'No service set'}
        </div>
        {rest.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {rest.map((serviceId) => {
              const info = SERVICE_ICON_MAP[serviceId];
              if (!info) return null;
              const Icon = info.icon;
              return <Icon key={serviceId} size={16} color="#8a8a86" aria-label={info.label} />;
            })}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 12,
          padding: '4px 10px',
          borderRadius: 8,
          background: priorityStyle.bg,
          color: priorityStyle.color,
          whiteSpace: 'nowrap',
        }}
      >
        {job.priority}
      </span>
    </div>
  );
}
