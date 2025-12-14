const TYPE_STYLES = {
  info: {
    background: '#e7f5ff',
    border: '#a5d8ff',
    color: '#0b7285',
    icon: 'ℹ️',
  },
  warning: {
    background: '#fff4e6',
    border: '#ffd8a8',
    color: '#e67700',
    icon: '⚠️',
  },
  danger: {
    background: '#fff5f5',
    border: '#ffc9c9',
    color: '#c92a2a',
    icon: '⛔',
  },
  success: {
    background: '#ebfbee',
    border: '#b2f2bb',
    color: '#2b8a3e',
    icon: '✅',
  },
};

export default function AlertBanner({ type = 'info', title, message, actions = [] }) {
  const style = TYPE_STYLES[type] ?? TYPE_STYLES.info;
  return (
    <div
      style={{
        border: `1px solid ${style.border}`,
        background: style.background,
        color: style.color,
        borderRadius: '0.85rem',
        padding: '0.85rem 1rem',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'flex-start',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '1.35rem', lineHeight: 1 }}>
        {style.icon}
      </span>
      <div style={{ flex: 1 }}>
        {title && <strong style={{ display: 'block', marginBottom: '0.15rem' }}>{title}</strong>}
        <p style={{ margin: 0 }}>{message}</p>
        {actions.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                style={{
                  background: style.color,
                  color: style.background,
                  padding: '0.35rem 0.85rem',
                  borderRadius: '999px',
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
