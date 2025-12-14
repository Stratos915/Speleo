import AlertBanner from './AlertBanner.jsx';

export default function AlertList({ alerts = [], navigate, onDismiss }) {
  if (!alerts.length) return null;
  return (
    <div className="page-grid" style={{ gap: '0.75rem' }}>
      {alerts.map((alert) => {
        const actions = [];
        if (alert.link) {
          actions.push({
            label: alert.actionLabel ?? 'Apri',
            onClick: () => {
              if (navigate) {
                navigate(alert.link);
              } else {
                window.location.href = alert.link;
              }
            },
          });
        }
        if (onDismiss) {
          actions.push({
            label: 'Fatto',
            onClick: () => onDismiss(alert),
          });
        }
        return (
          <AlertBanner
            key={alert.id}
            type={alert.type}
            title={alert.title}
            message={alert.message}
            actions={actions}
          />
        );
      })}
    </div>
  );
}
