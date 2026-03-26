import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

interface Props { children: React.ReactNode; }

export default function ProtectedRoute({ children }: Props) {
  const [status, setStatus] = useState<'checking' | 'ok' | 'unauth'>('checking');

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) { setStatus('unauth'); return; }

    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setStatus(r.ok ? 'ok' : 'unauth'))
      .catch(() => setStatus('unauth'));
  }, []);

  if (status === 'checking') return <div className="page muted">Loading…</div>;
  if (status === 'unauth') return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}
