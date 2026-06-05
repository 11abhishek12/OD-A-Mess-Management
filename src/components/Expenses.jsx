import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, addDoc, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { Download, PlusCircle, Trash2 } from 'lucide-react';

export default function Expenses() {
  const [exportMonth, setExportMonth] = useState(new Date().toISOString().substring(0, 7));
  const { currentUser, userProfile } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('regular');
  const [description, setDescription] = useState('');
  const [expenseUserId, setExpenseUserId] = useState('');
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
      userId: expenseUserId || currentUser.uid,
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
      const currentMonthPrefix = exportMonth;

      // Fetch users
      const usersSnap = await getDocs(collection(db, 'users'));
      const allUsers = [];
      const usersMap = {};
      usersSnap.forEach(doc => {
        const u = { id: doc.id, ...doc.data() };
        usersMap[u.uid] = u.name;
        allUsers.push(u);
        if (u.guests) {
          u.guests.forEach(g => {
            usersMap[`${u.uid}_${g.id}`] = `${g.name} (Guest)`;
          });
        }
      });
      allUsers.sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));

      const allMembers = [];
      allUsers.forEach(u => {
        allMembers.push({ type: 'permanent', id: u.uid, name: u.name, parentId: u.uid, defaultMeals: u.defaultMeals || [] });
        if (u.guests) {
          u.guests.forEach(g => {
            allMembers.push({ type: 'guest', id: `${u.uid}_${g.id}`, name: `${g.name} (Guest)`, parentId: u.uid, startDate: g.startDate, endDate: g.endDate, preferredMeals: g.preferredMeals || [] });
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
      
      const [year, month] = currentMonthPrefix.split('-');
      const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
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
      
      // Order of worksheets dictates tab order
      const ws = wb.addWorksheet('Attendance Report', { views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }] });
      const wsExp = wb.addWorksheet('Expenses & Billing', { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] });
      const wsConfig = wb.addWorksheet('Configurations');

      // --- CONFIGURATIONS DATA BUILD ---
      const configItems = [
         { name: "Guest Multiplier", factor: 1.3 },
         { name: "Breakfast", factor: 0.5 },
         { name: "Standard Meal", factor: 1.0 },
         { name: "Chicken", factor: 1.5 },
         { name: "Mutton", factor: 2.5 },
         { name: "Fish", factor: 1.5 },
         { name: "Paneer", factor: 1.5 }
      ];
      
      const configMap = new Map();
      
      // Find all custom special items
      Object.values(specialMealsData).forEach(spDay => {
         Object.values(spDay).forEach(spMeal => {
            if (spMeal.isSpecial && spMeal.options) {
                spMeal.options.forEach(opt => {
                    if (!configItems.find(x => x.name === opt.name)) {
                        configItems.push({ name: opt.name, factor: opt.factor });
                    }
                });
            }
         });
      });
      
      configItems.forEach((item, idx) => {
         configMap.set(item.name, `Configurations!$B$${idx + 2}`);
      });
      
      // --- ATTENDANCE SHEET ---
      ws.properties.defaultRowHeight = 25;

      const row1 = ['Member Name', 'Type'];
      const row2 = ['Member Name', 'Type'];
      
      const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Others'];
      const mealInitials = ['B', 'L', 'D', 'O'];

      const colLetter = (col) => {
        let letter = '';
        while (col > 0) {
          let temp = (col - 1) % 26;
          letter = String.fromCharCode(temp + 65) + letter;
          col = (col - temp - 1) / 26;
        }
        return letter;
      };

      // Build Date Headers
      monthDates.forEach(date => {
        const spDay = specialMealsData[date];
        let hasSpecial = false;
        if (spDay) {
          Object.values(spDay).forEach(info => { if(info.isSpecial) hasSpecial = true; });
        }
        row1.push(hasSpecial ? `${date} 🌟` : date, '', '', '');
        row2.push(...mealInitials);
      });

      // Monthly Totals Headers
      const monthlyTotalCols = ['Total B', 'Total L', 'Total D', 'Total O', 'Final Cost Units'];
      row1.push('MONTHLY TOTALS', ...Array(monthlyTotalCols.length - 1).fill(''));
      row2.push(...monthlyTotalCols);

      const headerRow1 = ws.addRow(row1);
      const headerRow2 = ws.addRow(row2);
      
      headerRow1.height = 30;
      headerRow2.height = 30;

      // Merge Date Headers
      let colIdx = 3;
      monthDates.forEach(() => {
        ws.mergeCells(1, colIdx, 1, colIdx + 3);
        const cell = ws.getCell(1, colIdx);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        colIdx += 4;
      });

      // Merge Monthly Totals Header
      ws.mergeCells(1, colIdx, 1, colIdx + monthlyTotalCols.length - 1);
      ws.getCell(1, colIdx).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(1, colIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      ws.getCell(1, colIdx).font = { bold: true };
      
      ws.mergeCells('A1:A2');
      ws.mergeCells('B1:B2');
      ws.getCell('A1').value = 'Member Name';
      ws.getCell('B1').value = 'Type';
      
      [ws.getCell('A1'), ws.getCell('B1')].forEach(c => {
         c.alignment = { vertical: 'middle', horizontal: 'center' };
         c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
         c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
         c.font = { bold: true };
      });

      // Style Sub-headers (Row 2) - New Cooler Pastel Colors
      const colorBreakfast = 'FFFFF7D9'; // Very soft yellow
      const colorLunch = 'FFFFEBE0';     // Very soft orange/peach
      const colorDinner = 'FFE8F1FA';    // Very soft blue
      const colorOthers = 'FFF8F9FA';    // Very light gray
      const colorGuest = 'FFFDF5E6';     // Even lighter, subtle cream

      row2.forEach((val, i) => {
        if (!val || i < 2) return;
        const cell = ws.getCell(2, i + 1);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        
        if (i >= 2 && i < 2 + monthDates.length * 4) {
           const mod = (i - 2) % 4;
           if (mod === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorBreakfast } };
           else if (mod === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorLunch } };
           else if (mod === 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorDinner } };
           else cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorOthers } };
        } else {
           cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
        }
      });

      // Add Data Rows (Members)
      const lastColStr = colLetter(2 + monthDates.length * 4);
      let r = 3;
      
      allMembers.forEach((member, mIdx) => {
        const rowData = [member.name, member.type === 'permanent' ? 'Permanent' : 'Guest'];
        
        monthDates.forEach((date, dateIdx) => {
          let dayMeals;
          if (logsMatrix[member.id] && logsMatrix[member.id][date] !== undefined) {
            dayMeals = logsMatrix[member.id][date];
          } else {
            // Fallback if no log exists
            dayMeals = {};
            if (member.type === 'permanent') {
              member.defaultMeals.forEach(m => dayMeals[m] = 'Standard');
            } else if (member.type === 'guest') {
              const isGuestActive = date <= member.endDate && date >= (member.startDate || '2000-01-01');
              if (isGuestActive) {
                member.preferredMeals.forEach(m => dayMeals[m] = 'Standard');
              }
            }
          }

          mealTypes.forEach((meal) => {
            const selectedOption = dayMeals[meal];
            if (selectedOption) {
              rowData.push(selectedOption === 'Standard' ? '✓' : selectedOption);
            } else {
              rowData.push('-');
            }
          });
        });

        // Add Formulas
        const bCount = `COUNTIFS($C$2:$${lastColStr}$2, "B", C${r}:${lastColStr}${r}, "<>-")`;
        const lCount = `COUNTIFS($C$2:$${lastColStr}$2, "L", C${r}:${lastColStr}${r}, "<>-")`;
        const dCount = `COUNTIFS($C$2:$${lastColStr}$2, "D", C${r}:${lastColStr}${r}, "<>-")`;
        const oCount = `COUNTIFS($C$2:$${lastColStr}$2, "O", C${r}:${lastColStr}${r}, "<>-")`;
        
        // Final Cost Formula
        let costFormula = `${bCount} * ${configMap.get("Breakfast")}`;
        costFormula += ` + COUNTIFS($C$2:$${lastColStr}$2, "L", C${r}:${lastColStr}${r}, "✓") * ${configMap.get("Standard Meal")}`;
        costFormula += ` + COUNTIFS($C$2:$${lastColStr}$2, "D", C${r}:${lastColStr}${r}, "✓") * ${configMap.get("Standard Meal")}`;
        costFormula += ` + COUNTIFS($C$2:$${lastColStr}$2, "O", C${r}:${lastColStr}${r}, "✓") * ${configMap.get("Standard Meal")}`;
        
        // Add special items
        configItems.forEach(item => {
           if (!["Guest Multiplier", "Breakfast", "Standard Meal"].includes(item.name)) {
              // Note: Only count if it exactly matches the special item name
              costFormula += ` + COUNTIFS(C${r}:${lastColStr}${r}, "${item.name}") * ${configMap.get(item.name)}`;
           }
        });
        
        let finalCostFormula = `IF($B${r}="Guest", (${costFormula}) * ${configMap.get("Guest Multiplier")}, ${costFormula})`;

        rowData.push(
          { formula: bCount },
          { formula: lCount },
          { formula: dCount },
          { formula: oCount },
          { formula: finalCostFormula }
        );
        
        const rowObj = ws.addRow(rowData);
        
        // Style Data Row
        rowObj.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

          if (colNumber === 1 || colNumber === 2) {
             cell.alignment = { horizontal: 'left', vertical: 'middle' };
             if (member.type === 'guest') {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorGuest } };
             }
          } else if (colNumber > 2 && colNumber <= 2 + monthDates.length * 4) {
             const mod = (colNumber - 3) % 4;
             if (mod === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorBreakfast } };
             else if (mod === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorLunch } };
             else if (mod === 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorDinner } };
             else cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorOthers } };
             
             if (cell.value && cell.value !== '-' && cell.value !== '✓') {
                 cell.font = { color: { argb: 'FFC00000' }, bold: true };
             } else if (cell.value === '✓') {
                 cell.font = { color: { argb: 'FF00B050' }, bold: true };
             }
          } else if (colNumber > 2 + monthDates.length * 4) {
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
             cell.font = { bold: true };
          }
        });
        
        r++;
        
        // If this member is the last of a group (i.e. next member is a permanent), insert blank row
        const nextMember = allMembers[mIdx + 1];
        if (!nextMember || nextMember.type === 'permanent') {
            const blankRow = ws.addRow([]);
            blankRow.height = 10;
            r++;
        }
      });

      // Add Daily Totals Row at the bottom
      const dailyTotalsRow = ['DAILY TOTALS', ''];
      monthDates.forEach((date, dateIdx) => {
         for(let mealIdx = 0; mealIdx < 4; mealIdx++) {
            const colName = colLetter(3 + dateIdx * 4 + mealIdx);
            dailyTotalsRow.push({ formula: `COUNTIFS(${colName}3:${colName}${r - 1}, "<>-", ${colName}3:${colName}${r - 1}, "<>")` });
         }
      });
      // Push empty cells for the Monthly totals columns to align borders properly
      dailyTotalsRow.push(...Array(monthlyTotalCols.length).fill(''));
      
      const tRowObj = ws.addRow(dailyTotalsRow);
      tRowObj.height = 25;
      ws.mergeCells(`A${r}:B${r}`);
      
      tRowObj.eachCell({ includeEmpty: true }, (cell, colNumber) => {
         cell.font = { bold: true };
         cell.alignment = { horizontal: 'center', vertical: 'middle' };
         cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
         
         if (colNumber === 1 || colNumber === 2) {
             cell.alignment = { horizontal: 'left', vertical: 'middle' };
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
         } else if (colNumber > 2 && colNumber <= 2 + monthDates.length * 4) {
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
         } else {
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
         }
      });
      
      // Calculate final units sum for Base Cost calculation
      const finalCostCol = colLetter(2 + monthDates.length * 4 + 5);
      const totalUnitsSumFormula = `SUM('Attendance Report'!${finalCostCol}3:${finalCostCol}${r - 1})`;
      
      // Narrow Columns
      ws.getColumn(1).width = 22;
      ws.getColumn(2).width = 12;
      for (let i = 3; i <= 2 + monthDates.length * 4; i++) {
        ws.getColumn(i).width = 6;
      }
      for (let i = 3 + monthDates.length * 4; i <= 2 + monthDates.length * 4 + monthlyTotalCols.length; i++) {
        ws.getColumn(i).width = 16;
      }

      // --- EXPENSES & BILLING SHEET ---
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

      // Re-calculate Attendance Row Map for mapping users to units
      let currentAttendanceRow = 3;
      const memberRows = {};
      allMembers.forEach((m, i) => {
         memberRows[m.id] = currentAttendanceRow;
         currentAttendanceRow++;
         const nxt = allMembers[i+1];
         if (!nxt || nxt.type === 'permanent') {
             currentAttendanceRow++;
         }
      });

      // Base Rate Formula
      wsExp.getCell(`N1`).value = 'Base Cost Rate:';
      wsExp.getCell(`O1`).value = { formula: `${totalExpCell} / ${totalUnitsSumFormula}` };
      wsExp.getCell(`O1`).numFmt = '₹#,##0.00';
      
      let rIdx = 3;
      allUsers.forEach(user => {
         const memberRow = memberRows[user.uid];

         wsExp.getCell(`G${rIdx}`).value = user.name;
         wsExp.getCell(`H${rIdx}`).value = { formula: `'Attendance Report'!${finalCostCol}${memberRow}` };
         
         if (user.guests && user.guests.length > 0) {
            let guestFormula = '';
            user.guests.forEach(g => {
               const gRow = memberRows[`${user.uid}_${g.id}`];
               guestFormula += `'Attendance Report'!${finalCostCol}${gRow}+`;
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

      // --- CONFIGURATIONS SHEET (Build Data) ---
      wsConfig.columns = [
        { header: 'Configuration', key: 'name', width: 25 },
        { header: 'Factor', key: 'factor', width: 15 }
      ];
      
      configItems.forEach(item => {
         wsConfig.addRow(item);
      });
      wsConfig.getRow(1).font = { bold: true };
      
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
      <div className="glass-panel fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2>Month Expenses</h2>
          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input 
                type="month" 
                value={exportMonth} 
                onChange={(e) => setExportMonth(e.target.value)} 
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--accent-color)', color: 'var(--text-primary)', padding: '8px', borderRadius: '8px' }}
              />
              <button className="btn-primary" onClick={handleExport} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={16} /> {loading ? 'Exporting...' : 'Export Excel'}
              </button>
            </div>
          )}
        </div>
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
        <form onSubmit={handleAddExpense} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {isAdmin && (
            <div style={{ flex: '1', minWidth: '150px' }}>
              <label>Member</label>
              <select value={expenseUserId || currentUser.uid} onChange={(e) => setExpenseUserId(e.target.value)}>
                {Object.entries(usersMap).map(([uid, name]) => (
                  <option key={uid} value={uid}>{name}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ flex: '1', minWidth: '120px' }}>
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
