import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, addDoc, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { Download, PlusCircle, Trash2 } from 'lucide-react';

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
      if (exp.date.startsWith(currentMonthPrefix) && !exp.isDeleted) {
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

  async function handleDeleteExpense(id) {
    if (!isAdmin) return;
    if (!window.confirm("Are you sure you want to delete this expense? It will be crossed out and removed from all calculations.")) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'expenses', id), { isDeleted: true });
      fetchExpenses();
    } catch (err) {
      console.error(err);
      alert('Failed to delete expense.');
    }
    setLoading(false);
  }

  async function handleExport() {
    try {
      setLoading(true);
      const currentMonthPrefix = new Date().toISOString().substring(0, 7);

      // Fetch users
      const usersSnap = await getDocs(collection(db, 'users'));
      const allUsers = [];
      const allMembers = [];
      usersSnap.forEach(doc => {
        const u = { id: doc.id, ...doc.data() };
        allUsers.push(u);
        allMembers.push({ type: 'permanent', id: u.uid, name: u.name, parentId: u.uid });
        if (u.guests) {
          u.guests.forEach(g => {
            allMembers.push({ type: 'guest', id: `${u.uid}_${g.id}`, name: `${g.name} (Guest)`, parentId: u.uid });
          });
        }
      });

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
          
          if (Array.isArray(d.meals)) {
            const obj = {};
            d.meals.forEach(m => obj[m] = 'Standard');
            logsMatrix[d.userId][d.date] = obj;
          } else {
            logsMatrix[d.userId][d.date] = d.meals || {};
          }
        }
      });

      // Fetch Expenses
      const expData = expenses
        .filter(e => e.date.startsWith(currentMonthPrefix) && !e.isDeleted)
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
      ws.properties.defaultRowHeight = 25;

      const row1 = [''];
      const row2 = ['Date'];
      
      const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Others'];
      const mealInitials = ['B', 'L', 'D', 'O'];

      // Build Headers
      allMembers.forEach(member => {
        row1.push(member.name, '', '', '');
        row2.push(...mealInitials);
      });

      const colLetter = (col) => {
        let letter = '';
        while (col > 0) {
          let temp = (col - 1) % 26;
          letter = String.fromCharCode(temp + 65) + letter;
          col = (col - temp - 1) / 26;
        }
        return letter;
      };

      // Daily Analytics Columns
      const dailyAnalyticsCols = ['Count (B)', 'Count (L)', 'Count (D)', 'Count (O)', 'Total Weighted Units'];
      row1.push('DAILY TOTALS', ...Array(dailyAnalyticsCols.length - 1).fill(''));
      row2.push(...dailyAnalyticsCols);

      const headerRow1 = ws.addRow(row1);
      const headerRow2 = ws.addRow(row2);
      
      headerRow1.height = 30;
      headerRow2.height = 30;

      // Merge & Style User Headers
      let colIdx = 2;
      allMembers.forEach(member => {
        ws.mergeCells(1, colIdx, 1, colIdx + 3);
        const cell = ws.getCell(1, colIdx);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: member.type === 'guest' ? 'FFFFE699' : 'FFD9E1F2' } };
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
        
        if (i > 0 && i <= allMembers.length * 4) {
           cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        } else if (i > allMembers.length * 4) {
           cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
        }
      });

      // Add Data Rows (Dates)
      monthDates.forEach((date, dateIdx) => {
        const rowData = [];
        const r = dateIdx + 3; // Excel row index
        
        const spDay = specialMealsData[date];
        let hasSpecial = false;
        if (spDay) {
          Object.values(spDay).forEach(info => { if(info.isSpecial) hasSpecial = true; });
        }
        rowData.push(hasSpecial ? `${date} 🌟` : date);

        allMembers.forEach(member => {
          const dayMeals = logsMatrix[member.id]?.[date] || {};
          mealTypes.forEach((meal) => {
            const selectedOption = dayMeals[meal];
            if (selectedOption) {
              rowData.push(selectedOption === 'Standard' ? '✓' : selectedOption);
            } else {
              rowData.push('-');
            }
          });
        });

        const counts = { B: [], L: [], D: [], O: [] };
        const unitTerms = [];

        allMembers.forEach((member, mIdx) => {
          mealTypes.forEach((meal, mealIdx) => {
             const colName = colLetter(2 + mIdx*4 + mealIdx);
             if (mealIdx === 0) counts.B.push(`IF(${colName}${r}="-", 0, 1)`);
             if (mealIdx === 1) counts.L.push(`IF(${colName}${r}="-", 0, 1)`);
             if (mealIdx === 2) counts.D.push(`IF(${colName}${r}="-", 0, 1)`);
             if (mealIdx === 3) counts.O.push(`IF(${colName}${r}="-", 0, 1)`);

             const spDayMeal = specialMealsData[date]?.[meal];
             let factorFormula = `IF(${colName}${r}="-", 0, 1.0)`;
             if (meal === 'Breakfast') {
               factorFormula = `IF(${colName}${r}="-", 0, 0.5)`;
             } else if (spDayMeal?.isSpecial) {
               let nested = `IF(${colName}${r}="-", 0, IF(${colName}${r}="✓", 1.0, `;
               const options = spDayMeal.options || [];
               options.forEach(opt => {
                  nested += `IF(${colName}${r}="${opt.name}", ${opt.factor}, `;
               });
               nested += `0`; // fallback
               nested += ')'.repeat(options.length + 2);
               factorFormula = nested;
             }
             if (member.type === 'guest') factorFormula = `(${factorFormula})*1.3`;
             unitTerms.push(factorFormula);
          });
        });

        rowData.push(
          { formula: counts.B.join('+') || '0' },
          { formula: counts.L.join('+') || '0' },
          { formula: counts.D.join('+') || '0' },
          { formula: counts.O.join('+') || '0' },
          { formula: unitTerms.join('+') || '0' }
        );
        const rowObj = ws.addRow(rowData);

        rowObj.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

          if (colNumber === 1) {
             cell.alignment = { horizontal: 'left', vertical: 'middle' };
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hasSpecial ? 'FFFFD700' : 'FFF2F2F2' } };
          } else if (colNumber > 1 && colNumber <= 1 + allMembers.length * 4) {
             const mealIdx = (colNumber - 2) % 4;
             const isSpecial = specialMealsData[date]?.[mealTypes[mealIdx]]?.isSpecial;
             if (isSpecial) {
                 cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };
             }
             if (cell.value) {
                 cell.font = { color: { argb: isSpecial ? 'FFC00000' : 'FF00B050' }, bold: true };
             }
          } else if (colNumber > 1 + allMembers.length * 4) {
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
          }
        });
      });

      // Bottom User Analytics Rows
      const bottomLabels = [
        { label: 'Total Count (B)', mIdxOffset: 0 },
        { label: 'Total Count (L)', mIdxOffset: 1 },
        { label: 'Total Count (D)', mIdxOffset: 2 },
        { label: 'Total Count (O)', mIdxOffset: 3 },
        { label: 'TOTAL UNITS', isUnits: true }
      ];

      const rOffset = monthDates.length + 2; // last data row index
      const totalUnitsRowIdx = rOffset + 5; // TOTAL UNITS row will be the 5th bottom row

      bottomLabels.forEach((info) => {
        const bRow = [info.label];
        allMembers.forEach((member, mIdx) => {
           if (info.isUnits) {
              const terms = [];
              for (let d = 0; d < monthDates.length; d++) {
                 const r = d + 3;
                 for (let mealIdx=0; mealIdx<4; mealIdx++) {
                     const meal = mealTypes[mealIdx];
                     const colName = colLetter(2 + mIdx*4 + mealIdx);
                     const spDayMeal = specialMealsData[monthDates[d]]?.[meal];
                     let factorFormula = `IF(${colName}${r}="-", 0, 1.0)`;
                     if (meal === 'Breakfast') {
                        factorFormula = `IF(${colName}${r}="-", 0, 0.5)`;
                     } else if (spDayMeal?.isSpecial) {
                        let nested = `IF(${colName}${r}="-", 0, IF(${colName}${r}="✓", 1.0, `;
                        const options = spDayMeal.options || [];
                        options.forEach(opt => {
                           nested += `IF(${colName}${r}="${opt.name}", ${opt.factor}, `;
                        });
                        nested += `0`; // fallback
                        nested += ')'.repeat(options.length + 2);
                        factorFormula = nested;
                     }
                     if (member.type === 'guest') factorFormula = `(${factorFormula})*1.3`;
                     terms.push(factorFormula);
                 }
              }
              bRow.push({ formula: terms.join('+') || '0' }, '', '', '');
           } else {
              const colName = colLetter(2 + mIdx*4 + info.mIdxOffset);
              bRow.push({ formula: `COUNTIF(${colName}3:${colName}${rOffset}, "<>-")` }, '', '', '');
           }
        });
        
        // Grand totals for daily count columns
        if (info.isUnits) {
           const sumCol = colLetter(2 + allMembers.length*4 + 4); 
           bRow.push('', '', '', '', { formula: `SUM(${sumCol}3:${sumCol}${rOffset})` });
        } else {
           const sumCol = colLetter(2 + allMembers.length*4 + info.mIdxOffset);
           const arr = ['', '', '', '', ''];
           arr[info.mIdxOffset] = { formula: `SUM(${sumCol}3:${sumCol}${rOffset})` };
           bRow.push(...arr);
        }

        const rObj = ws.addRow(bRow);
        rObj.height = 25;
        
        let cIdx = 2;
        allMembers.forEach(() => {
           ws.mergeCells(rObj.number, cIdx, rObj.number, cIdx + 3);
           cIdx += 4;
        });

        rObj.eachCell({ includeEmpty: true }, (cell, colNumber) => {
           if (colNumber === 1 || colNumber <= 1 + allMembers.length * 4) {
             cell.font = { bold: true };
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
             cell.alignment = { horizontal: 'center', vertical: 'middle' };
             cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
           }
        });
        ws.getCell(rObj.number, 1).alignment = { horizontal: 'left', vertical: 'middle' };
      });

      // Narrow Columns
      ws.getColumn(1).width = 18;
      for (let i = 2; i <= 1 + allMembers.length * 4; i++) {
        ws.getColumn(i).width = 6;
      }
      for (let i = 2 + allMembers.length * 4; i <= 1 + allMembers.length * 4 + dailyAnalyticsCols.length; i++) {
        ws.getColumn(i).width = 16;
      }

      // Add Expenses Sheet
      const wsExp = wb.addWorksheet('Expenses & Billing', { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] });
      wsExp.properties.defaultRowHeight = 25;
      wsExp.columns = [
        { header: 'Date', key: 'Date', width: 15 },
        { header: 'Member Name', key: 'UserName', width: 25 },
        { header: 'Amount (₹)', key: 'Amount', width: 15 },
        { header: 'Type', key: 'Type', width: 15 },
        { header: 'Description', key: 'Description', width: 40 }
      ];
      
      wsExp.getRow(1).height = 30;
      wsExp.getRow(1).eachCell({ includeEmpty: false }, cell => {
        if (cell.col <= 5) {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        }
      });

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

      // Add Member Billing Summary on the Right
      wsExp.getCell('G1').value = 'MEMBER BILLING SUMMARY';
      wsExp.mergeCells('G1:L1');
      wsExp.getCell('G1').font = { bold: true, color: { argb: 'FFFFFFFF' } };
      wsExp.getCell('G1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF548235' } };
      wsExp.getCell('G1').alignment = { horizontal: 'center', vertical: 'middle' };

      const summaryHeaders = ['Member Name', 'Self Units', 'Guest Units', 'Total Bill (₹)', 'Amount Paid (₹)', 'Balance (₹)'];
      summaryHeaders.forEach((h, i) => {
         const col = String.fromCharCode(71 + i); // G, H, I, J, K, L
         wsExp.getCell(`${col}2`).value = h;
         wsExp.getCell(`${col}2`).font = { bold: true };
         wsExp.getCell(`${col}2`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
         wsExp.getCell(`${col}2`).alignment = { horizontal: 'center', vertical: 'middle' };
         wsExp.getColumn(col).width = 18;
      });
      wsExp.getColumn('G').width = 25; // Member Name
      
      const lastExpRow = expData.length + 1;
      const totalExpCell = `C${lastExpRow + 2}`;
      wsExp.getCell(`B${lastExpRow + 2}`).value = 'Total Expenses';
      wsExp.getCell(`B${lastExpRow + 2}`).font = { bold: true };
      wsExp.getCell(totalExpCell).value = { formula: `SUM(C2:C${lastExpRow})` };
      wsExp.getCell(totalExpCell).font = { bold: true };
      wsExp.getCell(totalExpCell).numFmt = '₹#,##0.00';

      // Base Rate Formula
      const grandTotalCol = colLetter(2 + allMembers.length*4 + 4);
      wsExp.getCell(`N1`).value = 'Base Cost Rate:';
      wsExp.getCell(`O1`).value = { formula: `${totalExpCell} / 'Attendance Report'!${grandTotalCol}${totalUnitsRowIdx}` };
      wsExp.getCell(`O1`).numFmt = '₹#,##0.00';
      
      let rIdx = 3;
      allUsers.forEach(user => {
         const memberIdx = allMembers.findIndex(m => m.id === user.uid);
         const selfUnitsCol = colLetter(2 + memberIdx*4);

         wsExp.getCell(`G${rIdx}`).value = user.name;
         wsExp.getCell(`H${rIdx}`).value = { formula: `'Attendance Report'!${selfUnitsCol}${totalUnitsRowIdx}` };
         
         if (user.guests && user.guests.length > 0) {
            let guestFormula = '';
            user.guests.forEach(g => {
               const gIdx = allMembers.findIndex(m => m.id === `${user.uid}_${g.id}`);
               const gCol = colLetter(2 + gIdx*4);
               guestFormula += `'Attendance Report'!${gCol}${totalUnitsRowIdx}+`;
            });
            guestFormula = guestFormula.slice(0, -1);
            wsExp.getCell(`I${rIdx}`).value = { formula: guestFormula || '0' };
         } else {
            wsExp.getCell(`I${rIdx}`).value = 0;
         }

         let paid = userTotals[user.uid] || 0;

         wsExp.getCell(`J${rIdx}`).value = { formula: `(H${rIdx}+I${rIdx})*$O$1` };
         wsExp.getCell(`K${rIdx}`).value = paid;
         wsExp.getCell(`L${rIdx}`).value = { formula: `K${rIdx}-J${rIdx}` };
         
         wsExp.getCell(`J${rIdx}`).numFmt = '₹#,##0.00';
         wsExp.getCell(`K${rIdx}`).numFmt = '₹#,##0.00';
         wsExp.getCell(`L${rIdx}`).numFmt = '₹#,##0.00';
         
         // Conditional formatting is best done natively in Excel, but we'll apply a default static style here
         // For a fully dynamic color change, we'd add conditional formatting rules via exceljs
         wsExp.addConditionalFormatting({
           ref: `L${rIdx}:L${rIdx}`,
           rules: [
             { type: 'cellIs', operator: 'lessThan', formulae: ['0'], style: { font: { color: { argb: 'FFC00000' }, bold: true } } },
             { type: 'cellIs', operator: 'greaterThan', formulae: ['0'], style: { font: { color: { argb: 'FF00B050' }, bold: true } } }
           ]
         });

         rIdx++;
      });
      
      // Grand Totals Row
      wsExp.getCell(`G${rIdx}`).value = 'GRAND TOTAL';
      wsExp.getCell(`G${rIdx}`).font = { bold: true };
      wsExp.getCell(`G${rIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      ['H', 'I', 'J', 'K', 'L'].forEach(c => {
         wsExp.getCell(`${c}${rIdx}`).value = { formula: `SUM(${c}3:${c}${rIdx-1})` };
         wsExp.getCell(`${c}${rIdx}`).font = { bold: true };
         wsExp.getCell(`${c}${rIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
         if (['J', 'K', 'L'].includes(c)) wsExp.getCell(`${c}${rIdx}`).numFmt = '₹#,##0.00';
      });
      
      // Style Summary Table Borders
      for(let r = 1; r <= rIdx; r++) {
         ['G', 'H', 'I', 'J', 'K', 'L'].forEach(c => {
             const cell = wsExp.getCell(`${c}${r}`);
             cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
         });
      }
      wsExp.getCell(`N1`).font = { bold: true };
      wsExp.getCell(`O1`).font = { bold: true };
      
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
            <Download size={18} /> Export Billing Report
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        <div className="glass-panel fade-in" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(16, 185, 129, 0.15))', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>Total This Month</h4>
          <h2 style={{ margin: 0, fontSize: '2.5rem', color: 'var(--text-primary)' }}>₹{monthlyTotal.toFixed(2)}</h2>
        </div>
        
        <div className="glass-panel fade-in" style={{ gridColumn: 'span 2' }}>
           <h4 style={{ color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>Amount Paid by Member (Current Month)</h4>
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
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {expenses.map(exp => (
              <tr key={exp.id} style={{ opacity: exp.isDeleted ? 0.5 : 1 }}>
                <td style={{ textDecoration: exp.isDeleted ? 'line-through' : 'none' }}>{exp.date}</td>
                <td style={{ textDecoration: exp.isDeleted ? 'line-through' : 'none' }}>{usersMap[exp.userId] || 'Unknown'}</td>
                <td style={{ textDecoration: exp.isDeleted ? 'line-through' : 'none' }}>
                  <span className="badge" style={{ background: exp.type === 'special' ? 'var(--warning-color)' : 'var(--accent-color)' }}>
                    {exp.type}
                  </span>
                </td>
                <td style={{ textDecoration: exp.isDeleted ? 'line-through' : 'none' }}>{exp.description} {exp.isDeleted && <span style={{color:'var(--danger-color)', fontSize:'0.8rem', fontWeight:'bold'}}>(DELETED)</span>}</td>
                <td style={{ textDecoration: exp.isDeleted ? 'line-through' : 'none' }}><strong>{exp.amount.toFixed(2)}</strong></td>
                {isAdmin && (
                  <td>
                    {!exp.isDeleted && (
                      <button className="btn-icon" onClick={() => handleDeleteExpense(exp.id)} style={{ color: 'var(--danger-color)', background: 'transparent' }} title="Delete Expense">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? "6" : "5"} style={{ textAlign: 'center', padding: '24px' }}>No expenses logged yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
