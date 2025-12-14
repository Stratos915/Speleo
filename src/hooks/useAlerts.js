import { useEffect, useMemo, useState } from 'react';
import useAuth from '../context/useAuth.js';
import { fetchNotifications, markNotificationSeen as markNotificationSeenService } from '../services/notifications.js';

const ROLE_ALERTS = [];
const USER_ALERTS = [];

export default function useAlerts() {
  const { role, user } = useAuth();
  const [remoteAlerts, setRemoteAlerts] = useState([]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const list = await fetchNotifications({ role, userId: user?.id });
        if (!ignore) {
          setRemoteAlerts(list);
        }
      } catch (error) {
        console.warn('[useAlerts] Impossibile leggere le notifiche:', error);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [role, user?.id]);

  const adminAlerts = useMemo(() => {
    if (!role) return [];
    const fromStatic = ROLE_ALERTS.filter((alert) => !alert.roles || alert.roles.includes(role));
    const fromRemote = remoteAlerts.filter((alert) => {
      if (alert.audience !== 'admin') return false;
      if (alert.roles && !alert.roles.includes(role)) return false;
      if (alert.user_id && alert.user_id !== user?.id) return false;
      return true;
    });
    return [...fromStatic, ...fromRemote];
  }, [role, remoteAlerts, user?.id]);

  const userAlerts = useMemo(() => {
    const fromRemote = remoteAlerts.filter((alert) => {
      if (alert.audience !== 'user') return false;
      if (alert.user_id && alert.user_id !== user?.id) return false;
      return true;
    });
  return [...USER_ALERTS, ...fromRemote];
  }, [remoteAlerts, user?.id]);

  function getAlertsForScope(scope) {
    if (scope === 'admin') return adminAlerts;
    if (scope === 'user') return userAlerts;
    return [...adminAlerts, ...userAlerts];
  }

  async function dismissAlert(alert) {
    if (!alert?.id) return;
    await markNotificationSeenService(alert.id);
    setRemoteAlerts((prev) => prev.filter((item) => item.id !== alert.id));
  }

  return { adminAlerts, userAlerts, getAlertsForScope, dismissAlert };
}
