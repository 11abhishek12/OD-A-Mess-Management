import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { ShoppingBag, Save, ArrowUp, ArrowDown, Calendar, User } from 'lucide-react';

const getLocalDateStr = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekday = (dStr) => {
  const [y, m, d] = dStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-GB', { weekday: 'long' });
};

export default function Roster() {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [usersMap, setUsersMap] = useState({});
  const [sequence, setSequence] = useState([]);
  
  const [startDate, setStartDate] = useState(getLocalDateStr(new Date()));
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const todayStr = getLocalDateStr(new Date());
  const [viewDate, setViewDate] = useState(todayStr);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      try {
        setLoading(true);
        // Fetch users
        const usersSnap = await getDocs(collection(db, 'users'));
        const map = {};
        const allUids = [];
        usersSnap.forEach(d => {
          map[d.id] = d.data().name || 'Unknown';
          allUids.push(d.id);
        });
        
        if (!isMounted) return;
        setUsersMap(map);

        // Fetch roster config
        const docSnap = await getDoc(doc(db, 'settings', 'shoppingRoster'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSequence(data.sequence && data.sequence.length > 0 ? data.sequence : allUids);
          if (data.startDate) setStartDate(data.startDate);
        } else {
          setSequence(allUids);
        }
      } catch (err) {
        console.error("Error fetching roster data:", err);
        if (isMounted) setMessage("Failed to load roster data.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchData();
    return () => { isMounted = false; };
  }, []);

  const moveUp = (index) => {
    if (index === 0) return;
    const newSeq = [...sequence];
    [newSeq[index - 1], newSeq[index]] = [newSeq[index], newSeq[index - 1]];
    setSequence(newSeq);
  };

  const moveDown = (index) => {
    if (index === sequence.length - 1) return;
    const newSeq = [...sequence];
    [newSeq[index + 1], newSeq[index]] = [newSeq[index], newSeq[index + 1]];
    setSequence(newSeq);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, 'settings', 'shoppingRoster'), {
        sequence,
        startDate
      });
      setMessage('Roster configuration saved!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error(error);
      setMessage('Error saving config.');
    }
    setLoading(false);
  };

  // Generate Schedule for Next 7 Days
  const schedule = [];
  if (sequence.length > 0 && startDate && viewDate) {
    // Parse startDate components to avoid UTC shift
    const [sYr, sMo, sDa] = startDate.split('-').map(Number);
    const start = new Date(sYr, sMo - 1, sDa);
    start.setHours(0,0,0,0);

    const [vYr, vMo, vDa] = viewDate.split('-').map(Number);
    const viewStart = new Date(vYr, vMo - 1, vDa);
    viewStart.setHours(0,0,0,0);

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(viewStart);
      targetDate.setDate(viewStart.getDate() + i);
      
      const diffTime = targetDate.getTime() - start.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      const seqLen = sequence.length;
      let slotsPassed = Math.floor(diffDays / 2);
      
      let seqIndex = slotsPassed % seqLen;
      if (seqIndex < 0) seqIndex = (seqIndex + seqLen) % seqLen;

      schedule.push({
        date: getLocalDateStr(targetDate),
        displayDate: targetDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        shopperId: sequence[seqIndex]
      });
    }
  }

  const tomorrowStr = getLocalDateStr(new Date(new Date().getTime() + 86400000));

  return (
    <div className="roster fade-in">
      <div className="header-actions">
        <h2>Shopping Roster</h2>
      </div>

      {message && <div className="glass-panel" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-color)', borderColor: 'var(--accent-color)', marginBottom: '16px' }}>{message}</div>}

      {isAdmin && (
        <div className="glass-panel" style={{ marginBottom: '32px', background: 'linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.8))', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Calendar size={20} color="var(--primary-color)" /> Admin Configuration
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
            Set the start date and arrange the sequence. Each member shops for 2 continuous days before moving to the next.
          </p>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px' }}>
            <div style={{ flex: '1', minWidth: '250px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Roster Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '1rem', outline: 'none' }} />
              
              <button onClick={handleSave} disabled={loading} className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', marginTop: '24px', padding: '12px' }}>
                <Save size={18} /> Save Configuration
              </button>
            </div>

            <div style={{ flex: '2', minWidth: '300px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Shopper Sequence</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)' }}>
                {sequence.map((uid, idx) => (
                  <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '4px solid var(--primary-color)', transition: 'background 0.2s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {idx + 1}
                      </div>
                      <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>{usersMap[uid] || 'Unknown User'}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-icon" onClick={() => moveUp(idx)} disabled={idx === 0} style={{ padding: '6px', background: idx === 0 ? 'transparent' : 'rgba(255,255,255,0.05)' }}><ArrowUp size={16} /></button>
                      <button className="btn-icon" onClick={() => moveDown(idx)} disabled={idx === sequence.length - 1} style={{ padding: '6px', background: idx === sequence.length - 1 ? 'transparent' : 'rgba(255,255,255,0.05)' }}><ArrowDown size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.5rem' }}>
            <ShoppingBag size={24} color="var(--accent-color)" /> Roster Schedule
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Calendar size={18} color="var(--text-secondary)" />
            <input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value || todayStr)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1rem', outline: 'none' }} />
          </div>
        </div>
        
        {schedule.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            {loading ? "Loading roster..." : "No users found or schedule cannot be generated."}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {schedule.map((item) => {
               const isToday = item.date === todayStr;
               const isTomorrow = item.date === tomorrowStr;
               const shopperName = usersMap[item.shopperId] || 'Unknown';
               const initial = shopperName.charAt(0).toUpperCase();

               return (
                <div key={item.date} style={{ 
                  padding: '16px 24px', 
                  background: isToday ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.02))' : 'rgba(255,255,255,0.02)', 
                  borderRadius: '12px', 
                  border: isToday ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  cursor: 'default'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  {isToday && <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '4px', background: 'var(--accent-color)' }} />}
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ color: isToday ? 'var(--accent-color)' : (isTomorrow ? 'var(--primary-color)' : 'var(--text-secondary)'), fontSize: '0.85rem', fontWeight: (isToday || isTomorrow) ? 'bold' : 'normal', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      {isToday ? 'Today' : (isTomorrow ? 'Tomorrow' : getWeekday(item.date))}
                    </div>
                    <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{item.displayDate}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-primary)', textAlign: 'right' }}>
                      {shopperName}
                    </div>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: isToday ? 'var(--accent-color)' : 'rgba(59, 130, 246, 0.2)', color: isToday ? '#fff' : 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}>
                      {initial}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
