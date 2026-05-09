const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');

const exportStr = `
const handleCopyDailyReport = () => {
    // Calculate monthly data based on history and current state
    const allData = [...history.map((s: any) => ({ ...s.state, isCurrent: false })), { ...state, isCurrent: true }];
    const uniqueMetricsMap = new Map();
    
    allData.forEach((item: any) => {
        let netSales = 0;
        if (item.posData) {
            netSales = item.posData.reduce((acc: number, pos: any) => acc + (pos.sales - pos.returns), 0);
        }
        
        let d = item.date;
        const parts = d.split('/');
        let month = String(new Date().getMonth() + 1).padStart(2, '0');
        let year = String(new Date().getFullYear());
        
        if (parts.length === 3) {
            month = parts[1];
            year = parts[2];
        }
        
        if (!uniqueMetricsMap.has(d)) {
            uniqueMetricsMap.set(d, { netSales, month, year, isCurrent: item.isCurrent });
        } else {
            if (item.isCurrent) {
                uniqueMetricsMap.set(d, { netSales, month, year, isCurrent: item.isCurrent });
            }
        }
    });

    const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
    const currentYearStr = String(new Date().getFullYear());
    
    const dailyMetrics = Array.from(uniqueMetricsMap.values());
    const monthlyMetrics = dailyMetrics.filter(d => d.month === currentMonthStr && d.year === currentYearStr);
    
    const totalMonthlySales = monthlyMetrics.reduce((sum, d) => sum + d.netSales, 0);
    const daysRecorded = monthlyMetrics.length || 1;
    const monthlyAverage = totalMonthlySales / daysRecorded;

    const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    
    const text = \`═══════════════════════════════════════
           📊 تقرير مبيعات اليوم
═══════════════════════════════════════

📅 التاريخ: \${state.date}

💰 إجمالي مبيعات اليوم
   \${formatNum(currentSummary.netSales)} ريال

📈 المتوسط الشهري (حتى اليوم)
   \${formatNum(monthlyAverage)} ريال

📊 إجمالي مبيعات الشهر (تراكمي)
   \${formatNum(totalMonthlySales)} ريال

═══════════════════════════════════════
   تم إنشاء التقرير في: \${timeFormatter.format(new Date())}
═══════════════════════════════════════\`;

    navigator.clipboard.writeText(text);
    showToast('تم نسخ التقرير للحافظة', 'success');
};
`;

const insertAfter = `  const handleExport = (format: 'a4' | 'thermal' = 'a4') => {`;

code = code.replace(insertAfter, exportStr + '\n' + insertAfter);

// Now we need to add the button in Export Modal
const buttonTarget = `                {exportMode === 'summary' && (
                  <button 
                    onClick={() => handleExport('thermal')}
                    disabled={isExporting}
                    className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Printer size={20} /> حراري
                  </button>
                )}
              </div>`;

const buttonReplacement = `                {exportMode === 'summary' && (
                  <button 
                    onClick={() => handleExport('thermal')}
                    disabled={isExporting}
                    className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Printer size={20} /> حراري
                  </button>
                )}
              </div>
              
              {exportMode === 'summary' && (
                  <button 
                    onClick={handleCopyDailyReport}
                    className="w-full mt-3 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Copy size={20} /> نسخ التقرير النصي
                  </button>
              )}`;

code = code.replace(buttonTarget, buttonReplacement);

fs.writeFileSync('src/App.tsx', code);
console.log('Added Copy Report feature');
