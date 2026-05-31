import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { Calendar, Info, Edit2, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Dashboard() {
  const { currentUser, userProfile } = useAuth();
  const [specialMealModal, setSpecialMealModal] = useState(null);
  const [specialSelection, setSpecialSelection] = useState("Chicken");
  const [customFactor, setCustomFactor] = useState("1.5");
  const [customName, setCustomName] = useState("");
  const [users, setUsers] = useState([]);

  const handleDateChange = (days) => {
    setCurrentDate(prev => {
      const dateObj = new Date(prev);
      dateObj.setDate(dateObj.getDate() + days);
      return dateObj.toISOString().split("T")[0];
    });
  };
  const [mealLogs, setMealLogs] = useState({});
  const [specialMealsInfo, setSpecialMealsInfo] = useState({});
  
  // Format YYYY-MM-DD
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);

  const isAdmin = userProfile?.role === 'admin';
  const isToday = currentDate === new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchDashboardData(currentDate);
  }, [currentDate]);

  async function fetchDashboardData(date) {
    // 1. Fetch all users
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const fetchedUsers = [];
    usersSnapshot.forEach(doc => fetchedUsers.push(doc.data()));
    setUsers(fetchedUsers);

    // 2. Fetch meal logs for the date
    const qLogs = query(collection(db, 'mealLogs'), where('date', '==', date));
    const logsSnapshot = await getDocs(qLogs);
    const logs = {};
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      logs[data.userId] = data.meals;
    });
    
    // Normalize and Initialize default meals
    fetchedUsers.forEach(u => {
      // Normalize Permanent Member logs
      if (!logs[u.uid]) {
        logs[u.uid] = {};
        (u.defaultMeals || []).forEach(m => logs[u.uid][m] = 'Standard');
      } else if (Array.isArray(logs[u.uid])) {
        const newObj = {};
        logs[u.uid].forEach(m => newObj[m] = 'Standard');
        logs[u.uid] = newObj;
      }

      // Handle Attached Guests
      if (u.guests) {
        u.guests.forEach(g => {
          const gKey = `${u.uid}_${g.id}`;
          if (!logs[gKey]) {
            logs[gKey] = {};
            const isGuestActive = date <= g.endDate && date >= (g.startDate || '2000-01-01');
            if (isGuestActive) {
               (g.preferredMeals || []).forEach(m => logs[gKey][m] = 'Standard');
            }
          } else if (Array.isArray(logs[gKey])) {
            const newObj = {};
            logs[gKey].forEach(m => newObj[m] = 'Standard');
            logs[gKey] = newObj;
          }
        });
      }
    });
    setMealLogs(logs);

    // 3. Fetch special meals
    const specialDoc = await getDoc(doc(db, 'specialMeals', date));
    if (specialDoc.exists()) {
      setSpecialMealsInfo(specialDoc.data() || {});
    } else {
      setSpecialMealsInfo({});
    }
  }

  async function handleMealChange(userId, mealType, value) {
    // Check permissions: only admin or the user themselves (if it's today) can edit
    // userId for guests looks like "userUid_guestId"
    const ownerUid = userId.split('_')[0];
    if (!isAdmin && (ownerUid !== currentUser.uid || !isToday)) return;

    const currentMeals = { ...(mealLogs[userId] || {}) };
    
    if (value === false) {
      delete currentMeals[mealType];
    } else {
      currentMeals[mealType] = value;
    }

    // Optimistic UI update
    setMealLogs(prev => ({ ...prev, [userId]: currentMeals }));

    // Update Firestore
    const logId = `${currentDate}_${userId}`;
    await setDoc(doc(db, 'mealLogs', logId), {
      date: currentDate,
      userId: userId,
      meals: currentMeals
    }, { merge: true });
  }

  async function handleSpecialMealToggle(meal) {
    if (!isAdmin) return;
    const isSpecial = !specialMealsInfo[meal]?.isSpecial;
    
    if (isSpecial) {
      setSpecialSelection("Chicken");
      setCustomFactor("1.5");
      setCustomName("");
      setSpecialMealModal({ meal });
    } else {
      const newSpecialInfo = { ...specialMealsInfo };
      delete newSpecialInfo[meal];
      setSpecialMealsInfo(newSpecialInfo);
      await setDoc(doc(db, 'specialMeals', currentDate), newSpecialInfo);
    }
  }

  const handleConfirmSpecial = async () => {
    if (!specialMealModal) return;
    const { meal } = specialMealModal;
    
    let defaultName = specialSelection;
    let defaultFactor = 1.3;
    
    if (specialSelection === 'Chicken') defaultFactor = 1.3;
    else if (specialSelection === 'Mutton') defaultFactor = 2.5;
    else if (specialSelection === 'Fish') defaultFactor = 1.3;
    else if (specialSelection === 'Paneer') defaultFactor = 1.3;
    else if (specialSelection === 'Others') {
       defaultName = customName || 'Special';
       defaultFactor = parseFloat(customFactor) || 1.0;
    }

    const newSpecialInfo = { ...specialMealsInfo };
    // Create base options list without duplicates
    const baseOptions = [
      { name: "Chicken", factor: 1.3 },
      { name: "Mutton", factor: 2.5 },
      { name: "Fish", factor: 1.3 },
      { name: "Paneer", factor: 1.3 }
    ];
    
    // Add custom option if it's not in the base list
    if (specialSelection === 'Others') {
       baseOptions.unshift({ name: defaultName, factor: defaultFactor });
    }

    newSpecialInfo[meal] = { 
      isSpecial: true, 
      options: baseOptions
    };

    // Auto-update standard consumers
    const newLogs = { ...mealLogs };
    const promises = [];
    Object.keys(newLogs).forEach(id => {
      if (newLogs[id][meal] === 'Standard') {
        newLogs[id] = { ...newLogs[id], [meal]: defaultName };
        promises.push(
          setDoc(doc(db, 'mealLogs', `${currentDate}_${id}`), {
            date: currentDate, userId: id, meals: newLogs[id]
          }, { merge: true })
        );
      }
    });
    setMealLogs(newLogs);
    if (promises.length > 0) {
      await Promise.all(promises);
    }

    setSpecialMealsInfo(newSpecialInfo);
    await setDoc(doc(db, 'specialMeals', currentDate), newSpecialInfo);
    setSpecialMealModal(null);
  };

  async function handleAddCustomOption(meal) {
    if (!isAdmin) return;
    const optName = prompt(`Enter Custom Option Name for ${meal}:`);
    if (!optName) return;
    const optFactorStr = prompt(`Enter Factor for ${optName} (e.g. 1.8):`, "1.5");
    if (!optFactorStr) return;
    const optFactor = parseFloat(optFactorStr);

    const newSpecialInfo = { ...specialMealsInfo };
    newSpecialInfo[meal].options.push({ name: optName, factor: optFactor });
    setSpecialMealsInfo(newSpecialInfo);
    await setDoc(doc(db, 'specialMeals', currentDate), newSpecialInfo);
  }

  const mealTypes = ["Breakfast", "Lunch", "Dinner", "Others"];

  return (
    <div className="dashboard">
      {specialMealModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="glass-panel fade-in" style={{ padding: '24px', width: '350px', background: 'var(--surface-color)', borderRadius: '12px', border: '1px solid var(--accent-color)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--accent-color)' }}>Declare {specialMealModal.meal} Special</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Choose a default meal option. Members marked as "Standard" will instantly be assigned this item.</p>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Default Item</label>
              <select 
                value={specialSelection}
                onChange={(e) => setSpecialSelection(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <option value="Chicken">Chicken (Factor: 1.3)</option>
                <option value="Mutton">Mutton (Factor: 2.5)</option>
                <option value="Fish">Fish (Factor: 1.3)</option>
                <option value="Paneer">Paneer (Factor: 1.3)</option>
                <option value="Others">Others (Custom Factor)</option>
              </select>
            </div>

            {specialSelection === 'Others' && (
              <div style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem' }}>Name</label>
                  <input 
                    type="text" 
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Veg Biryani"
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
                  />
                </div>
                <div style={{ width: '80px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem' }}>Factor</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={customFactor}
                    onChange={(e) => setCustomFactor(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button className="btn-secondary" onClick={() => setSpecialMealModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleConfirmSpecial}>Confirm Special</button>
            </div>
          </div>
        </div>
      )}

      <div className="header-actions">
        <h2>Meal Logs</h2>
        <div className="date-picker glass-panel" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => handleDateChange(-1)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
            <ChevronLeft size={20} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} />
            <input 
              type="date" 
              value={currentDate} 
              onChange={(e) => setCurrentDate(e.target.value)} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
          <button onClick={() => handleDateChange(1)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {Object.keys(specialMealsInfo).length > 0 && (
        <div className="glass-panel fade-in" style={{ margin: '16px 0', borderLeft: '4px solid var(--accent-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <Info color="var(--accent-color)" />
            <strong>Special Meals Today!</strong>
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {Object.entries(specialMealsInfo).map(([meal, info]) => (
              info.isSpecial && (
                <div key={meal} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--accent-color)', fontSize: '0.9rem' }}>
                  <span><strong style={{color: 'var(--accent-color)'}}>{meal} Special:</strong> Select custom options for members.</span>
                  {isAdmin && (
                    <button className="btn-secondary" onClick={() => handleAddCustomOption(meal)} style={{ padding: '4px 8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Edit2 size={12} /> Add Custom Option
                    </button>
                  )}
                </div>
              )
            ))}
          </div>
        </div>
      )}

      <div className="glass-panel table-container">
        <table className="logs-table">
          <thead>
            <tr>
              <th>Member Name</th>
              <th>Type</th>
              {mealTypes.map(meal => (
                <th key={meal}>
                  {meal}
                  {isAdmin && (
                    <button 
                      onClick={() => handleSpecialMealToggle(meal)} 
                      style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', color: specialMealsInfo[meal]?.isSpecial ? 'var(--warning-color)' : 'var(--text-secondary)' }}
                      title={`Mark ${meal} as Special`}
                    >
                      ★
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const canEdit = isAdmin || (user.uid === currentUser.uid && isToday);
              
              const renderRow = (id, name, roleBadge, isGuest) => (
                <tr key={id} className={id === currentUser.uid ? 'current-user-row' : ''} style={isGuest ? { backgroundColor: 'rgba(255,255,255,0.02)' } : {}}>
                  <td style={isGuest ? { paddingLeft: '32px', color: 'var(--text-secondary)' } : {}}>
                    {isGuest ? '↳ ' : ''}{name}
                    {id === currentUser.uid && <span style={{fontSize:'0.8rem', marginLeft:'8px', color:'var(--primary-color)'}}>(You)</span>}
                  </td>
                  <td>
                    {roleBadge}
                  </td>
                  {mealTypes.map(meal => {
                    const isSpecial = specialMealsInfo[meal]?.isSpecial;
                    const selectedValue = mealLogs[id]?.[meal];
                    const isTaken = !!selectedValue;

                    return (
                      <td key={`${id}-${meal}`}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <input 
                            type="checkbox" 
                            className="custom-checkbox"
                            checked={isTaken}
                            onChange={(e) => handleMealChange(id, meal, e.target.checked ? 'Standard' : false)}
                            disabled={!canEdit}
                          />
                          {isSpecial && isTaken && (
                            <select 
                              value={selectedValue === 'Standard' ? '' : selectedValue} 
                              onChange={(e) => handleMealChange(id, meal, e.target.value || 'Standard')}
                              disabled={!canEdit}
                              style={{ 
                                background: 'rgba(0,0,0,0.3)', 
                                color: 'white', 
                                border: '1px solid var(--accent-color)', 
                                borderRadius: '4px', 
                                padding: '4px',
                                fontSize: '0.8rem',
                                marginTop: '4px',
                                maxWidth: '100px'
                              }}
                            >
                              <option value="">Standard Option</option>
                              {specialMealsInfo[meal].options?.map(opt => (
                                <option key={opt.name} value={opt.name}>{opt.name} ({opt.factor}x)</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );

              const rows = [renderRow(user.uid, user.name, <span className="badge" style={{ background: user.role === 'guest' ? 'var(--warning-color)' : 'var(--primary-color)' }}>{user.role}</span>, false)];
              
              if (user.guests) {
                user.guests.forEach(g => {
                  const isActive = currentDate <= g.endDate && currentDate >= (g.startDate || '2000-01-01');
                  const hasLogs = mealLogs[`${user.uid}_${g.id}`] && Object.keys(mealLogs[`${user.uid}_${g.id}`]).length > 0;
                  
                  if (isActive || hasLogs) {
                    rows.push(renderRow(`${user.uid}_${g.id}`, g.name, <span className="badge" style={{ background: 'var(--warning-color)' }}>Guest</span>, true));
                  }
                });
              }

              return <React.Fragment key={user.uid}>{rows}</React.Fragment>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
