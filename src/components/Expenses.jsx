import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, addDoc, Timestamp } from 'firebase/firestore';
import { Download, PlusCircle } from 'lucide-react';

export default function Expenses() {
  const { currentUser, userProfile } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('regular');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [usersMap, setUsersMap] = useState({});
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [userTotals, setUserTotals] = useState({});

  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    const currentMonthPrefix = new Date().toISOString().substring(0, 7);
    let total = 0;
    const uTotals = {};
    expenses.forEach(exp => {
      if (exp.date.startsWith(currentMonthPrefix)) {
        total += exp.amount;
        uTotals[exp.userId] = (uTotals[exp.userId] || 0) + exp.amount;
      }
    });
    setMonthlyTotal(total);
    setUserTotals(uTotals);
  }, [expenses]);

  useEffect(() => {
    fetchExpenses();
    fetchUsers();
  }, []);

  async function fetchUsers() {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const map = {};
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      map[data.uid] = data.name;
    });
    setUsersMap(map);
  }

  async function fetchExpenses() {
    const q = query(collection(db, 'expenses'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const exp = [];
    snapshot.forEach(doc => {
      exp.push({ id: doc.id, ...doc.data() });
    });
    setExpenses(exp);
  }

  async function handleAddExpense(e) {
    e.preventDefault();
    if (!amount || !description) return;

    setLoading(true);
    await addDoc(collection(db, 'expenses'), {
      userId: currentUser.uid,
      amount: parseFloat(amount),
      type,
      description,
      date: new Date().toISOString().split('T')[0],
      createdAt: Timestamp.now()
    });
    
    setAmount('');
    setDescription('');
    setType('regular');
    setLoading(false);
    fetchExpenses();
  }

  async function handleExport() {
    try {
      setLoading(true);
      const currentMonthPrefix = new Date().toISOString().substring(0, 7);

      // Fetch users
      const usersSnap = await getDocs(collection(db, 'users'));
      const allUsers = [];
      usersSnap.forEach(doc => allUsers.push({ id: doc.id, ...doc.data() }));

      // Fetch special meals
      const specialSnap = await getDocs(collection(db, 'specialMeals'));
      const specialMealsData = {};
      specialSnap.forEach(doc => {
        if (doc.id.startsWith(currentMonthPrefix)) {
          specialMealsData[doc.id] = doc.data();
        }
      });

      // Fetch Meal Logs
      const logsSnapshot = await getDocs(collection(db, 'mealLogs'));
      const logsMatrix = {};
      
      const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
      const monthDates = Array.from({length: daysInMonth}, (_, i) => {
        const d = String(i + 1).padStart(2, '0');
        return `${currentMonthPrefix}-${d}`;
      });

      logsSnapshot.forEach(doc => {
        const d = doc.data();
        if (d.date.startsWith(currentMonthPrefix)) {
          if (!logsMatrix[d.userId]) logsMatrix[d.userId] = {};
          logsMatrix[d.userId][d.date] = d.meals || [];
        }
      });

      // Fetch Expenses
      const expData = expenses
        .filter(e => e.date.startsWith(currentMonthPrefix))
        .map(e => ({
          Date: e.date,
          UserName: usersMap[e.userId] || e.userId,
          Amount: e.amount,
          Type: e.type,
          Description: e.description
        }));

      // Initialize Excel
      const ExcelJS = (await import('exceljs')).default;
      const { saveAs } = await import('file-saver');
      
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Attendance Report', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });

      const row1 = [''];
      const row2 = ['Date'];
      
      const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Others'];
      const mealInitials = ['B', 'L', 'D', 'O'];

      // Build Headers
      allUsers.forEach(user => {
        row1.push(user.name, '', '', '');
        row2.push(...mealInitials);
      });

      // Daily Analytics Columns
      const dailyAnalyticsCols = ['Total B', 'Total L', 'Total D', 'Total O', 'Total Special', 'Total Meals'];
      row1.push('DAILY TOTALS', ...Array(dailyAnalyticsCols.length - 1).fill(''));
      row2.push(...dailyAnalyticsCols);

      ws.addRow(row1);
      ws.addRow(row2);

      // Merge & Style User Headers
      let colIdx = 2;
      allUsers.forEach(user => {
        ws.mergeCells(1, colIdx, 1, colIdx + 3);
        const cell = ws.getCell(1, colIdx);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        colIdx += 4;
      });

      // Merge Daily Totals Header
      ws.mergeCells(1, colIdx, 1, colIdx + dailyAnalyticsCols.length - 1);
      ws.getCell(1, colIdx).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(1, colIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      ws.getCell(1, colIdx).font = { bold: true };
      
      ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      ws.getCell('A2').border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

      // Style Sub-headers (Row 2)
      row2.forEach((val, i) => {
        if (!val) return;
        const cell = ws.getCell(2, i + 1);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        
        if (i > 0 && i <= allUsers.length * 4) {
           cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        } else if (i > allUsers.length * 4) {
           cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
        }
      });

      // Add Data Rows (Dates)
      const userTotalsMatrix = {};
      allUsers.forEach(u => userTotalsMatrix[u.uid] = { B:0, L:0, D:0, O:0, Sp:0, Total:0 });

      monthDates.forEach((date) => {
        const rowData = [];
        
        const spDay = specialMealsData[date];
        let hasSpecial = false;
        if (spDay) {
          Object.values(spDay).forEach(info => { if(info.isSpecial) hasSpecial = true; });
        }
        rowData.push(hasSpecial ? `${date} 🌟` : date);

        let dTB = 0, dTL = 0, dTD = 0, dTO = 0, dTSp = 0, dTTotal = 0;

        allUsers.forEach(user => {
          const dayMeals = logsMatrix[user.uid]?.[date] || [];
          mealTypes.forEach((meal) => {
            const isTaken = dayMeals.includes(meal);
            const isSpecial = specialMealsData[date]?.[meal]?.isSpecial;
            rowData.push(isTaken ? '✓' : '');
            
            if (isTaken) {
              if (meal === 'Breakfast') { userTotalsMatrix[user.uid].B++; dTB++; }
              if (meal === 'Lunch') { userTotalsMatrix[user.uid].L++; dTL++; }
              if (meal === 'Dinner') { userTotalsMatrix[user.uid].D++; dTD++; }
              if (meal === 'Others') { userTotalsMatrix[user.uid].O++; dTO++; }
              if (isSpecial) { userTotalsMatrix[user.uid].Sp++; dTSp++; }
              userTotalsMatrix[user.uid].Total++;
              dTTotal++;
            }
          });
        });

        rowData.push(dTB, dTL, dTD, dTO, dTSp, dTTotal);
        const rowObj = ws.addRow(rowData);

        rowObj.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

          if (colNumber === 1) {
             cell.alignment = { horizontal: 'left', vertical: 'middle' };
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hasSpecial ? 'FFFFD700' : 'FFF2F2F2' } };
          } else if (colNumber > 1 && colNumber <= 1 + allUsers.length * 4) {
             const mealIdx = (colNumber - 2) % 4;
             const isSpecial = specialMealsData[date]?.[mealTypes[mealIdx]]?.isSpecial;
             if (isSpecial) {
                 cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };
             }
             if (cell.value === '✓') {
                 cell.font = { color: { argb: isSpecial ? 'FFC00000' : 'FF00B050' }, bold: true };
             }
          } else if (colNumber > 1 + allUsers.length * 4) {
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
          }
        });
      });

      // Bottom User Analytics Rows
      const bottomLabels = [
        { label: 'Total Breakfast', key: 'B' },
        { label: 'Total Lunch', key: 'L' },
        { label: 'Total Dinner', key: 'D' },
        { label: 'Total Others', key: 'O' },
        { label: 'Total Special', key: 'Sp' },
        { label: 'TOTAL MEALS', key: 'Total' }
      ];

      bottomLabels.forEach(({label, key}) => {
        const bRow = [label];
        allUsers.forEach(user => {
           bRow.push(userTotalsMatrix[user.uid][key], '', '', '');
        });
        const rObj = ws.addRow(bRow);
        
        let cIdx = 2;
        allUsers.forEach(() => {
           ws.mergeCells(rObj.number, cIdx, rObj.number, cIdx + 3);
           cIdx += 4;
        });

        rObj.eachCell({ includeEmpty: true }, (cell, colNumber) => {
           if (colNumber === 1 || colNumber <= 1 + allUsers.length * 4) {
             cell.font = { bold: true };
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
             cell.alignment = { horizontal: 'center', vertical: 'middle' };
             cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
           }
        });
        ws.getCell(rObj.number, 1).alignment = { horizontal: 'left', vertical: 'middle' };
      });

      // Narrow Columns
      ws.getColumn(1).width = 16;
      for (let i = 2; i <= 1 + allUsers.length * 4; i++) {
        ws.getColumn(i).width = 4;
      }
      for (let i = 2 + allUsers.length * 4; i <= 1 + allUsers.length * 4 + dailyAnalyticsCols.length; i++) {
        ws.getColumn(i).width = 10;
      }

      // Add Expenses Sheet
      const wsExp = wb.addWorksheet('Expenses', { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] });
      wsExp.columns = [
        { header: 'Date', key: 'Date', width: 15 },
        { header: 'Member Name', key: 'UserName', width: 25 },
        { header: 'Amount (₹)', key: 'Amount', width: 15 },
        { header: 'Type', key: 'Type', width: 15 },
        { header: 'Description', key: 'Description', width: 40 }
      ];
      
      // Style Expenses Header
      wsExp.getRow(1).eachCell({ includeEmpty: false }, cell => {
        if (cell.col <= 5) {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; // Blue
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        }
      });

      // Add Expenses Data
      expData.forEach(exp => {
        const row = wsExp.addRow(exp);
        row.getCell('Amount').numFmt = '₹#,##0.00';
        row.eachCell({ includeEmpty: false }, cell => {
          if (cell.col <= 5) {
            cell.alignment = { vertical: 'middle' };
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            if (cell.col === 4 && cell.value === 'special') {
               cell.font = { color: { argb: 'FFC00000' }, bold: true };
            }
          }
        });
      });

      // Add Member Summary on the Right
      wsExp.getCell('G1').value = 'MEMBER SPENDING SUMMARY';
      wsExp.mergeCells('G1:H1');
      wsExp.getCell('G1').font = { bold: true, color: { argb: 'FFFFFFFF' } };
      wsExp.getCell('G1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF548235' } }; // Green
      wsExp.getCell('G1').alignment = { horizontal: 'center', vertical: 'middle' };
      wsExp.getCell('G1').border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

      wsExp.getCell('G2').value = 'Member Name';
      wsExp.getCell('H2').value = 'Total Spent (₹)';
      wsExp.getRow(2).getCell('G').font = { bold: true };
      wsExp.getRow(2).getCell('H').font = { bold: true };
      wsExp.getRow(2).getCell('G').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      wsExp.getRow(2).getCell('H').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      
      let rIdx = 3;
      Object.entries(userTotals).forEach(([uid, total]) => {
         wsExp.getCell(`G${rIdx}`).value = usersMap[uid] || 'Unknown';
         wsExp.getCell(`H${rIdx}`).value = total;
         wsExp.getCell(`H${rIdx}`).numFmt = '₹#,##0.00';
         rIdx++;
      });
      
      // Grand Total
      wsExp.getCell(`G${rIdx}`).value = 'GRAND TOTAL';
      wsExp.getCell(`G${rIdx}`).font = { bold: true };
      wsExp.getCell(`G${rIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      wsExp.getCell(`H${rIdx}`).value = { formula: `SUM(H3:H${rIdx-1})` };
      wsExp.getCell(`H${rIdx}`).font = { bold: true };
      wsExp.getCell(`H${rIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      wsExp.getCell(`H${rIdx}`).numFmt = '₹#,##0.00';
      
      // Style Summary Table Borders
      for(let r = 1; r <= rIdx; r++) {
         ['G', 'H'].forEach(c => {
             const cell = wsExp.getCell(`${c}${r}`);
             cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
         });
      }
      wsExp.getColumn('G').width = 25;
      wsExp.getColumn('H').width = 20;

      // Save file
      const buffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Mess_Report_${currentMonthPrefix}.xlsx`);

    } catch (error) {
      console.error("Export failed", error);
      alert("Failed to export. Please check console.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="expenses">
      <div className="header-actions">
        <h2>Expenses Log</h2>
        {isAdmin && (
          <button onClick={handleExport} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Download size={18} /> Export Report
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        <div className="glass-panel fade-in" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(16, 185, 129, 0.15))', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>Total This Month</h4>
          <h2 style={{ margin: 0, fontSize: '2.5rem', color: 'var(--text-primary)' }}>₹{monthlyTotal.toFixed(2)}</h2>
        </div>
        
        <div className="glass-panel fade-in" style={{ gridColumn: 'span 2' }}>
           <h4 style={{ color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>Spending by Member (Current Month)</h4>
           <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
              {Object.entries(userTotals).map(([uid, total]) => (
                 <div key={uid} style={{ minWidth: '130px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontWeight: '500', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>{usersMap[uid] || 'Unknown'}</div>
                    <div style={{ color: 'var(--accent-color)', fontWeight: 'bold', fontSize: '1.2rem' }}>₹{total.toFixed(2)}</div>
                 </div>
              ))}
              {Object.keys(userTotals).length === 0 && <span style={{color: 'var(--text-secondary)'}}>No expenses logged this month.</span>}
           </div>
        </div>
      </div>

      <div className="glass-panel" style={{ marginBottom: '24px' }}>
        <h3>Add Expense</h3>
        <form onSubmit={handleAddExpense} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginTop: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label>Amount</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="regular">Regular</option>
              <option value="special">Special</option>
            </select>
          </div>
          <div style={{ flex: '2', minWidth: '200px' }}>
            <label>Description (e.g., Grocery)</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <button type="submit" disabled={loading} className="btn-primary" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PlusCircle size={18} /> Add
          </button>
        </form>
      </div>

      <div className="glass-panel table-container">
        <table className="logs-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Member</th>
              <th>Type</th>
              <th>Description</th>
              <th>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map(exp => (
              <tr key={exp.id}>
                <td>{exp.date}</td>
                <td>{usersMap[exp.userId] || 'Unknown'}</td>
                <td>
                  <span className="badge" style={{ background: exp.type === 'special' ? 'var(--warning-color)' : 'var(--accent-color)' }}>
                    {exp.type}
                  </span>
                </td>
                <td>{exp.description}</td>
                <td><strong>{exp.amount.toFixed(2)}</strong></td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '24px' }}>No expenses logged yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
