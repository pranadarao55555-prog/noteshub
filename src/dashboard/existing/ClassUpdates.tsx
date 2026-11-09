import { Calendar, Bell } from 'lucide-react';

interface ClassUpdatesProps {
  subjectsCount?: number;
}

export default function ClassUpdates({ subjectsCount = 4 }: ClassUpdatesProps) {
  const updates = [
    {
      id: '1',
      title: 'Unit 3 & 4 Handwritten Notes Published',
      date: 'Today',
      badge: 'Curriculum',
      desc: 'Complete diagrams, instruction pipeline derivations, and solved questions.',
    },
    {
      id: '2',
      title: 'Lab Observation Journals Verified',
      date: 'Yesterday',
      badge: 'Lab Manual',
      desc: 'All observation tables and viva-voce questions formatted for review.',
    },
    {
      id: '3',
      title: `Cohort Curriculum: ${subjectsCount} Subjects Active`,
      date: 'This week',
      badge: 'Cohort 76',
      desc: 'Realtime DRM study portal enabled for authorized students.',
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {updates.map((item) => (
        <div key={item.id} className="feed-item" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255,211,122,.15)',
              border: '1px solid rgba(255,211,122,.25)',
              color: '#ffd37a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            <Calendar style={{ width: 15, height: 15 }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
              <strong style={{ fontSize: 13, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title}
              </strong>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#ffd37a',
                  background: 'rgba(255,211,122,.1)',
                  padding: '1px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.date}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4 }}>
              {item.desc}
            </p>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
        <Bell style={{ width: 12, height: 12, color: '#8b7bff' }} />
        <span>Updates post directly when new course notes are uploaded.</span>
      </div>
    </div>
  );
}
