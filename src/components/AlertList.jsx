import { useLocation } from 'react-router-dom';
import AlertBanner from './AlertBanner.jsx';

export default function AlertList({ alerts = [], navigate, onDismiss }) {
  const location = useLocation();
  const path = location.pathname || '';
  const scopedAlerts = alerts.filter((alert) => {
    const link = alert.link ?? '';
    if (link.startsWith('/biblioteca')) {
      return path.startsWith('/biblioteca');
    }
    if (link.startsWith('/prestito-avanzato')) {
      return (
        path.startsWith('/magazzino') ||
        path.startsWith('/prestito-avanzato') ||
        path.startsWith('/storico-prestiti')
      );
    }
    return true;
  });

  if (!scopedAlerts.length) return null;
  return (
    <div className="page-grid" style={{ gap: '0.75rem' }}>
      {scopedAlerts.map((alert) => {
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
