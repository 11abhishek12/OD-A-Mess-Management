import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { Calendar, Info, Edit2 } from 'lucide-react';

export default function Dashboard() {
  const { currentUser, userProfile } = useAuth();
  const [users, setUsers] = useState([]);
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
    
    // Initialize default meals for those who haven't logged yet
    fetchedUsers.forEach(u => {
      if (!logs[u.uid]) {
        logs[u.uid] = u.defaultMeals || [];
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

  async function handleMealToggle(userId, mealType) {
    // Check permissions: only admin or the user themselves (if it's today) can edit
    if (!isAdmin && (userId !== currentUser.uid || !isToday)) return;

    const currentMeals = mealLogs[userId] || [];
    let newMeals;
    if (currentMeals.includes(mealType)) {
      newMeals = currentMeals.filter(m => m !== mealType);
    } else {
      newMeals = [...currentMeals, mealType];
    }

    // Optimistic UI update
    setMealLogs(prev => ({ ...prev, [userId]: newMeals }));

    // Update Firestore
    const logId = `${currentDate}_${userId}`;
    await setDoc(doc(db, 'mealLogs', logId), {
      date: currentDate,
      userId: userId,
      meals: newMeals
    }, { merge: true });
  }

  async function handleSpecialMealToggle(meal) {
    if (!isAdmin) return;
    const isCurrentlySpecial = specialMealsInfo[meal]?.isSpecial;
    const isSpecial = !isCurrentlySpecial;
    
    let description = "";
    if (isSpecial) {
      description = prompt(`Enter special ${meal} description (e.g. Chicken, Biryani):`);
      if (description === null) return; // user cancelled
    }
    
    const newSpecialInfo = { ...specialMealsInfo };
    if (isSpecial) {
      newSpecialInfo[meal] = { isSpecial: true, description };
    } else {
      delete newSpecialInfo[meal];
    }
    
    setSpecialMealsInfo(newSpecialInfo);
    
    await setDoc(doc(db, 'specialMeals', currentDate), newSpecialInfo);
  }

  const mealTypes = ["Breakfast", "Lunch", "Dinner", "Others"];

  return (
    <div className="dashboard">
      <div className="header-actions">
        <h2>Meal Logs</h2>
        <div className="date-picker glass-panel" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={18} />
          <input 
            type="date" 
            value={currentDate} 
            onChange={(e) => setCurrentDate(e.target.value)} 
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
          />
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
                <div key={meal} style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--accent-color)', fontSize: '0.9rem' }}>
                  <strong style={{color: 'var(--accent-color)'}}>{meal}:</strong> {info.description}
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
              return (
                <tr key={user.uid} className={user.uid === currentUser.uid ? 'current-user-row' : ''}>
                  <td>
                    {user.name} 
                    {user.uid === currentUser.uid && <span style={{fontSize:'0.8rem', marginLeft:'8px', color:'var(--primary-color)'}}>(You)</span>}
                  </td>
                  <td>
                    <span className="badge" style={{ background: user.role === 'guest' ? 'var(--warning-color)' : 'var(--primary-color)' }}>
                      {user.role}
                    </span>
                  </td>
                  {mealTypes.map(meal => (
                    <td key={meal}>
                      <input 
                        type="checkbox" 
                        className="custom-checkbox"
                        checked={mealLogs[user.uid]?.includes(meal) || false}
                        onChange={() => handleMealToggle(user.uid, meal)}
                        disabled={!canEdit}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
