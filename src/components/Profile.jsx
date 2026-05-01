import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, updateDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';

export default function Profile() {
  const { currentUser, userProfile } = useAuth();
  const [defaultMeals, setDefaultMeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [adminRequests, setAdminRequests] = useState([]);
  const [adminsList, setAdminsList] = useState([]);

  useEffect(() => {
    if (userProfile?.role === 'admin') {
      const fetchRequests = async () => {
        const q = query(collection(db, 'adminRequests'), where('status', '==', 'pending'));
        const snap = await getDocs(q);
        const reqs = [];
        snap.forEach(d => reqs.push({ id: d.id, ...d.data() }));
        setAdminRequests(reqs);
      };
      
      const fetchAdmins = async () => {
        const q = query(collection(db, 'users'), where('role', '==', 'admin'));
        const snap = await getDocs(q);
        const adm = [];
        snap.forEach(d => {
          if (d.id !== currentUser.uid) adm.push({ id: d.id, ...d.data() });
        });
        setAdminsList(adm);
      };

      fetchRequests();
      fetchAdmins();
    }
  }, [userProfile, currentUser.uid]);

  useEffect(() => {
    if (userProfile?.defaultMeals) {
      setDefaultMeals(userProfile.defaultMeals);
    }
  }, [userProfile]);

  const mealTypes = ["Breakfast", "Lunch", "Dinner", "Others"];

  const handleToggle = (meal) => {
    if (defaultMeals.includes(meal)) {
      setDefaultMeals(defaultMeals.filter(m => m !== meal));
    } else {
      setDefaultMeals([...defaultMeals, meal]);
    }
  };

  const handleSaveDefaults = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        defaultMeals
      });
      setMessage('Default meals updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error(error);
      setMessage('Error updating defaults.');
    }
    setLoading(false);
  };

  const handleRequestAdmin = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, 'adminRequests', currentUser.uid), {
        userId: currentUser.uid,
        name: userProfile.name,
        email: currentUser.email,
        status: 'pending'
      });
      setMessage('Admin elevation requested! The current admin can approve it.');
      setTimeout(() => setMessage(''), 4000);
    } catch (error) {
      console.error(error);
      setMessage('Error requesting admin.');
    }
    setLoading(false);
  };

  const handleApproveAdmin = async (userId) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', userId), { role: 'admin' });
      await updateDoc(doc(db, 'adminRequests', userId), { status: 'approved' });
      setAdminRequests(prev => prev.filter(r => r.userId !== userId));
      setMessage('Admin request approved successfully!');
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      console.error(err);
      setMessage('Error approving request.');
    }
    setLoading(false);
  };

  const handleRevokeAdmin = async (userId) => {
    if (!window.confirm("Are you sure you want to revoke admin privileges for this user?")) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', userId), { role: 'permanent' });
      setAdminsList(prev => prev.filter(a => a.id !== userId));
      setMessage('Admin privileges revoked successfully!');
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      console.error(err);
      setMessage('Error revoking admin privileges.');
    }
    setLoading(false);
  };

  return (
    <div className="profile">
      <h2>User Profile Settings</h2>
      
      {message && <div className="glass-panel" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-color)', borderColor: 'var(--accent-color)', marginBottom: '16px' }}>{message}</div>}

      <div className="glass-panel">
        <h3>Configure Default Meals</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Select the meals you typically have. These will be automatically checked for you every day.
        </p>
        
        <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
          {mealTypes.map(meal => (
            <label key={meal} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)' }}>
              <input 
                type="checkbox" 
                className="custom-checkbox"
                checked={defaultMeals.includes(meal)}
                onChange={() => handleToggle(meal)}
              />
              {meal}
            </label>
          ))}
        </div>

        <button className="btn-primary" onClick={handleSaveDefaults} disabled={loading} style={{ width: 'auto' }}>
          Save Defaults
        </button>
      </div>

      <div className="glass-panel" style={{ marginTop: '24px' }}>
        <h3>Admin Access</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Current Role: <strong>{userProfile?.role}</strong>
        </p>
        {userProfile?.role !== 'admin' && (
          <button className="btn-secondary" onClick={handleRequestAdmin} disabled={loading}>
            Request Admin Elevation
          </button>
        )}
      </div>

      {userProfile?.role === 'admin' && (
        <div className="glass-panel" style={{ marginTop: '24px' }}>
          <h3>Pending Admin Requests</h3>
          {adminRequests.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No pending requests.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {adminRequests.map(req => (
                <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  <div>
                    <strong>{req.name}</strong> <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>({req.email})</span>
                  </div>
                  <button className="btn-primary" onClick={() => handleApproveAdmin(req.userId)} disabled={loading} style={{ padding: '8px 16px' }}>
                    Approve
                  </button>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ marginTop: '32px' }}>Current Admins</h3>
          {adminsList.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>You are the only admin.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {adminsList.map(adm => (
                <div key={adm.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  <div>
                    <strong>{adm.name}</strong> <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>({adm.role})</span>
                  </div>
                  <button className="btn-secondary" onClick={() => handleRevokeAdmin(adm.id)} disabled={loading} style={{ padding: '8px 16px', border: '1px solid var(--danger-color)', color: 'var(--danger-color)' }}>
                    Revoke Admin
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
