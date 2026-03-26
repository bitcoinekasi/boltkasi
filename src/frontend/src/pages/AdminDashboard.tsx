import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  balance_sats: number;
  card_id: number | null;
  programmed_at: number | null;
  card_enabled: number | null;
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('admin_token')}` };
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [systemBalance, setSystemBalance] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [createError, setCreateError] = useState('');
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [changePwError, setChangePwError] = useState('');
  const [changePwSuccess, setChangePwSuccess] = useState(false);

  async function load() {
    const res = await fetch('/api/admin/dashboard', { headers: authHeaders() });
    const data = await res.json();
    setUsers(data.users ?? []);
    setSystemBalance(data.systemBalance ?? null);
  }

  useEffect(() => { load(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername, display_name: newDisplayName }),
    });
    const data = await res.json();
    if (!res.ok) { setCreateError(data.error); return; }
    setShowCreate(false);
    setNewUsername('');
    setNewDisplayName('');
    load();
  }

  function logout() {
    localStorage.removeItem('admin_token');
    navigate('/admin/login');
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setChangePwError('');
    setChangePwSuccess(false);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
    });
    const data = await res.json();
    if (!res.ok) { setChangePwError(data.error); return; }
    setChangePwSuccess(true);
    setCurrentPw('');
    setNewPw('');
  }

  function cardStatus(row: UserRow) {
    if (!row.card_id) return <span className="badge badge-gray">No card</span>;
    if (!row.programmed_at) return <span className="badge badge-yellow">Unprogrammed</span>;
    if (!row.card_enabled) return <span className="badge badge-red">Disabled</span>;
    return <span className="badge badge-green">Active</span>;
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22 }}>⚡ BoltCard Admin</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {systemBalance !== null && (
            <span className="muted">Blink balance: <strong style={{ color: '#f0f0f0' }}>{systemBalance.toLocaleString()} sats</strong></span>
          )}
          <button className="btn-ghost" onClick={() => setShowChangePw(!showChangePw)} style={{ fontSize: 12 }}>Change password</button>
          <button className="btn-ghost" onClick={logout}>Logout</button>
        </div>
      </div>

      {showChangePw && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12, fontSize: 15 }}>Change Password</h3>
          <form onSubmit={changePassword} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="password"
              style={{ flex: '1 1 160px' }}
              placeholder="Current password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
            />
            <input
              type="password"
              style={{ flex: '1 1 160px' }}
              placeholder="New password (min 8 chars)"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              minLength={8}
              required
            />
            <button type="submit" className="btn-primary">Update</button>
            <button type="button" className="btn-ghost" onClick={() => setShowChangePw(false)}>Cancel</button>
          </form>
          {changePwError && <p className="error-text" style={{ marginTop: 8 }}>{changePwError}</p>}
          {changePwSuccess && <p style={{ color: '#68d391', marginTop: 8, fontSize: 13 }}>Password updated successfully.</p>}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16 }}>Users ({users.length})</h2>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New User</button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Create User</h3>
          <form onSubmit={createUser} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              style={{ flex: '1 1 160px' }}
              placeholder="username (lowercase)"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
              required
            />
            <input
              style={{ flex: '1 1 160px' }}
              placeholder="Display name"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary">Create</button>
            <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          </form>
          {createError && <p className="error-text" style={{ marginTop: 8 }}>{createError}</p>}
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Display Name</th>
              <th>Balance</th>
              <th>Card</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/users/${u.id}`)}>
                <td><code>{u.username}</code></td>
                <td>{u.display_name}</td>
                <td>{u.balance_sats.toLocaleString()} sats</td>
                <td>{cardStatus(u)}</td>
                <td style={{ textAlign: 'right' }}>
                  <span style={{ color: '#f7931a', fontSize: 13 }}>View →</span>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 32 }}>No users yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
