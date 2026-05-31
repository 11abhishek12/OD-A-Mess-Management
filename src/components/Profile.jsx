import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, updateDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { PlusCircle, Trash2 } from 'lucide-react';

export default function Profile() {
  const { currentUser, userProfile } = useAuth();
  const [defaultMeals, setDefaultMeals] = useState([]);
  const [guests, setGuests] = useState([]);
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
    if (userProfile?.guests) {
      setGuests(userProfile.guests);
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

  const [guestName, setGuestName] = useState('');
  const [guestMeals, setGuestMeals] = useState([]);
  const [guestStartDate, setGuestStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [guestEndDate, setGuestEndDate] = useState(new Date().toISOString().split('T')[0]);

  const handleToggleGuestMeal = (meal) => {
    if (guestMeals.includes(meal)) {
      setGuestMeals(guestMeals.filter(m => m !== meal));
    } else {
      setGuestMeals([...guestMeals, meal]);
    }
  };

  const handleAddGuest = async () => {
    if (!guestName || guestMeals.length === 0 || !guestEndDate || !guestStartDate) {
      setMessage('Please fill all guest fields and select at least one meal.');
      return;
    }
    const newGuest = {
      id: 'g_' + Date.now(),
      name: guestName,
      preferredMeals: guestMeals,
      startDate: guestStartDate,
      endDate: guestEndDate
    };
    const newGuestsList = [...guests, newGuest];
    
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        guests: newGuestsList
      });
      setGuests(newGuestsList);
      setGuestName('');
      setGuestMeals([]);
      setMessage('Guest added successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage('Error adding guest.');
    }
    setLoading(false);
  };

  const handleRemoveGuest = async (guestId) => {
    if (!window.confirm("Remove this guest? Note: Removing will stop them from showing on the dashboard, but keeping them past their end date is safer for billing continuity. Proceed?")) return;
    const newGuestsList = guests.filter(g => g.id !== guestId);
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        guests: newGuestsList
      });
      setGuests(newGuestsList);
      setMessage('Guest removed.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage('Error removing guest.');
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
        <h3>Manage Attached Members (Guests)</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Add guests who will be eating under your account. Their expenses will be added to your bill.
        </p>
        
        {guests.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            {guests.map(guest => (
              <div key={guest.id} style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{guest.name}</strong>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
                    Meals: {guest.preferredMeals.join(', ')} | From: {guest.startDate || 'N/A'} Till: {guest.endDate}
                  </div>
                </div>
                <button className="btn-icon" onClick={() => handleRemoveGuest(guest.id)} style={{ color: 'var(--danger-color)', background: 'transparent' }}>
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start', background: 'rgba(0,0,0,0.1)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Guest Name</label>
            <input type="text" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="e.g. Brother" style={{ width: '100%', padding: '10px' }} />
          </div>
          <div style={{ flex: '1', minWidth: '130px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Start Date</label>
            <input type="date" value={guestStartDate} onChange={e => setGuestStartDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
          </div>
          <div style={{ flex: '1', minWidth: '130px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>End Date</label>
            <input type="date" value={guestEndDate} onChange={e => setGuestEndDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white' }} />
          </div>
          <div style={{ flex: '2', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Preferred Meals</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {mealTypes.map(meal => (
                <label key={meal} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                  <input type="checkbox" className="custom-checkbox" checked={guestMeals.includes(meal)} onChange={() => handleToggleGuestMeal(meal)} />
                  {meal}
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary" onClick={handleAddGuest} disabled={loading} style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px' }}>
            <PlusCircle size={18} /> Add Guest
          </button>
        </div>
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
