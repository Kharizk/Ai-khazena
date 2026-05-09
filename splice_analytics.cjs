const fs = require('fs');

let lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');

const startIndex = 692; // 0-indexed line 693
const endIndex = 1943; // 0-indexed line 1943 (before SummaryDashboard which is at 1944)

const newCode = `const AnalyticsView = ({ history, currentState, formatNum, onUpdate }: any) => {
  const [dateRange, setDateRange] = useState<'all' | 'year' | 'month'>('all');
  
  const allData = [...history.map((s: any) => ({ ...s.state, isCurrent: false })), { ...currentState, isCurrent: true }];
  
  let metricsRawData = allData.map(state => {
    const netSales = state.posData ? state.posData.reduce((acc: number, pos: any) => acc + (pos.sales - pos.returns), 0) : 0;
    const refunds = state.expenseRefunds ? state.expenseRefunds.reduce((a:number, c:any)=>a+c.amount, 0) : 0;
    const totalIn = netSales + refunds;

    const exp1 = state.expenses ? state.expenses.reduce((a:number,c:any)=>a+c.amount,0) : 0;
    const exp2 = state.companyPayments ? state.companyPayments.reduce((a:number,c:any)=>a+c.amount,0) : 0;
    const exp3 = state.customerTransfers ? state.customerTransfers.reduce((a:number,c:any)=>a+c.amount,0) : 0;
    const totalOut = exp1 + exp2 + exp3;
    
    const posSalesBreakdown = state.posData ? state.posData.map((pos: any) => ({ name: pos.name || 'بدون اسم', sales: pos.sales - pos.returns })) : [];

    const parts = state.date.split('/');
    let month = '', day = '', year = '';
    let dObj = new Date();
    
    if (parts.length === 3) {
      day = parts[0]; month = parts[1]; year = parts[2];
      dObj = new Date(Number(year), Number(month) - 1, Number(day));
    }
    
    return {
      isHistoricalDay: false,
      historicalId: '',
      dateStr: state.date,
      dateObj: dObj,
      monthYear: parts.length === 3 ? \`\${month}/\${year}\` : 'غير محدد',
      sales: totalIn,
      pureNetSales: netSales,
      expenses: totalOut,
      net: totalIn - totalOut,
      isCurrent: state.isCurrent,
      dateName: parts.length === 3 ? \`\${day}/\${month}\` : state.date,
      posSalesBreakdown,
      year: year,
      month: month
    };
  });

  if (currentState.historicalSales && Array.isArray(currentState.historicalSales)) {
    currentState.historicalSales.forEach((hist: any) => {
      if (hist.type === 'day') {
        const parts = hist.dateStr.split('/');
        if (parts.length === 3) {
           metricsRawData.push({
             dateStr: hist.dateStr,
             dateObj: new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])),
             monthYear: \`\${parts[1]}/\${parts[2]}\`,
             sales: hist.netSales,
             pureNetSales: hist.netSales,
             expenses: 0,
             net: hist.netSales,
             isCurrent: false,
             isHistoricalDay: true,
             historicalId: hist.id,
             dateName: \`\${parts[0]}/\${parts[1]}\`,
             posSalesBreakdown: [],
             year: parts[2],
             month: parts[1]
           });
        }
      }
    });
  }

  const dailyMetricsRaw = metricsRawData.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  
  const currentYearStr = new Date().getFullYear().toString();
  const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
  
  const dailyMetrics = dailyMetricsRaw.filter((d: any) => {
    if (dateRange === 'year') return d.year === currentYearStr;
    if (dateRange === 'month') return d.year === currentYearStr && d.month === currentMonthStr;
    return true;
  });

  const totalSalesVal = dailyMetrics.reduce((sum, d) => sum + d.pureNetSales, 0);
  const totalExpensesVal = dailyMetrics.reduce((sum, d) => sum + d.expenses, 0);
  const totalNetVal = totalSalesVal - totalExpensesVal;
  const daysRecorded = dailyMetrics.length;
  const avgDailySales = daysRecorded > 0 ? totalSalesVal / daysRecorded : 0;

  const posAgg = dailyMetrics.reduce((acc: any, curr: any) => {
    curr.posSalesBreakdown.forEach((pos: any) => {
      if (!acc[pos.name]) acc[pos.name] = 0;
      acc[pos.name] += pos.sales;
    });
    return acc;
  }, {});

  const posChartData = Object.keys(posAgg).map(key => ({
    name: key,
    value: posAgg[key]
  })).sort((a, b) => b.value - a.value).filter(p => p.value > 0);

  const formatCurrency = (val: number) => Math.floor(val).toLocaleString('en-US');
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  const handleAnalyzeSales = async () => {
    setAiLoading(true);
    try {
      const summaryText = dailyMetrics.map((d: any) => \`- التاريخ \${d.dateStr}: مبيعات \${formatNum(d.pureNetSales)}, منصرفات \${formatNum(d.expenses)}\`).join('\\n');
      const prompt = \`بصفتك محلل مالي ومدير حسابات استراتيجي، قم بتحليل بيانات الخزينة التالية وقدم تقريراً مفصلاً باللغة العربية:

1. **ملخص الأداء:** جدول يوضح إجمالي المبيعات، والمنصرفات، وصافي الأرباح للمدة المحددة.
2. **رؤى مالية:** تحليل لكفاءة الأداء، هل هناك تضخم في المصروفات؟
3. **التوصيات:** 3 نصائح عملية لتحسين الأداء.

البيانات:
\${summaryText.substring(0, 3000)}

ملاحظات:
- استخدم جداول Markdown.
- كن إيجابياً ومحترفاً في لهجتك.
- استخدم رموز تعبيرية (📊، 💰، 💡)\`;

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      setAiAnalysis(response.text);
    } catch (err) {
      console.error("AI Analysis failed:", err);
      setAiAnalysis("حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.");
    } finally {
      setAiLoading(false);
    }
  };

  const calculateGrowthPercentage = () => {
     // A simple fallback if we don't have previous period exactly, just return a random positive looking string or empty.
     // Better not to fake data, we can just return an empty string if we can't reliably compute it.
     return ''; 
  };

  return (
    <div className="space-y-6 print:block print:w-full animate-in fade-in zoom-in-95 duration-300 pb-10">
      
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 print:hidden backdrop-blur-md bg-white/40 p-4 rounded-2xl border border-white/60 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Activity className="text-blue-600" />
            لوحة التأشيرات والتحليلات
          </h2>
          <p className="text-[13px] text-slate-500 mt-1 font-medium">نظرة شاملة ومتقدمة على مؤشرات الأداء والنمو المالي</p>
        </div>
        
        <div className="flex bg-white/80 p-1 rounded-xl shadow-sm border border-slate-200/50 w-full sm:w-auto">
          {[
            { id: 'all', label: 'كل الأوقات' },
            { id: 'year', label: 'العام الحالي' },
            { id: 'month', label: 'الشهر الحالي' }
          ].map(rt => (
            <button 
              key={rt.id}
              onClick={() => { setDateRange(rt.id as any); setAiAnalysis(null); }}
              className={\`flex-1 sm:px-6 py-2 text-[13px] sm:text-sm font-bold rounded-lg transition-all duration-300 \${dateRange === rt.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}\`}
            >
              {rt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 print:hidden">
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-[1.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-blue-500"></div>
          <p className="text-slate-500 text-sm font-bold mb-3 flex items-center gap-2">
             <TrendingUp size={16} className="text-blue-500"/> إجمالي المبيعات
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-black text-slate-800 font-mono tracking-tight" dir="ltr">{formatCurrency(totalSalesVal)}</h3>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-[1.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-rose-500"></div>
          <p className="text-slate-500 text-sm font-bold mb-3 flex items-center gap-2">
            <TrendingDown size={16} className="text-rose-500"/> المنصرفات والمدفوعات
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-black text-slate-800 font-mono tracking-tight" dir="ltr">{formatCurrency(totalExpensesVal)}</h3>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-[1.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-500"></div>
          <p className="text-slate-500 text-sm font-bold mb-3 flex items-center gap-2">
            <Wallet size={16} className="text-emerald-500"/> صافي التدفق المالي
          </p>
          <div className="flex items-end justify-between">
            <h3 className={\`text-3xl font-black font-mono tracking-tight \${totalNetVal >= 0 ? 'text-emerald-600' : 'text-rose-600'}\`} dir="ltr">{formatCurrency(totalNetVal)}</h3>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-[1.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-indigo-500"></div>
          <p className="text-slate-500 text-sm font-bold mb-3 flex items-center gap-2">
            <CalendarDays size={16} className="text-indigo-500"/> المتوسط اليومي
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-black text-slate-800 font-mono tracking-tight" dir="ltr">{formatCurrency(avgDailySales)}</h3>
            <div className="text-indigo-600 bg-indigo-50/80 px-2 py-1 rounded-lg text-[11px] font-bold">
               \${daysRecorded} أيام
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Trend Combo Chart */}
        <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[1.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 lg:col-span-2 flex flex-col transition-all hover:shadow-lg">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
              <LineChartIcon className="text-blue-500" size={20} /> الاتجاه العام للمبيعات والمصروفات
            </h3>
          </div>
          {dailyMetrics.length >= 2 ? (
            <div className="h-[320px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyMetrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="dateName" tick={{ fill: '#64748B', fontSize: 12, fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickMargin={10} minTickGap={20} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 12, fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={(val) => \`\${val >= 1000 ? val/1000 + 'k' : val}\`} />
                  <RechartsTooltip 
                    formatter={(value: number, name: string) => [formatNum(value), name === 'pureNetSales' ? 'المبيعات الصافية' : 'المصروفات والمدفوعات']}
                    labelFormatter={(label) => \`التاريخ: \${label}\`}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', fontFamily: 'Cairo', textAlign: 'right', fontWeight: 'bold' }}
                    itemStyle={{ padding: '4px 0' }}
                  />
                  <Legend wrapperStyle={{ fontFamily: 'Cairo', fontSize: '13px', paddingTop: '15px' }} />
                  <Area type="monotone" dataKey="pureNetSales" name="المبيعات الصافية" fill="url(#colorSales)" stroke="#3b82f6" strokeWidth={3} activeDot={{r: 6, strokeWidth: 0}} />
                  <Line type="monotone" dataKey="expenses" name="المصروفات والمدفوعات" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3, fill: '#f43f5e', strokeWidth: 0 }} activeDot={{r: 5, strokeWidth: 0}} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 min-h-[250px]">
              <LineChartIcon size={40} className="mb-3 opacity-30" />
              <p className="font-medium text-[15px]">نحتاج إلى يومين على الأقل لتوضيح الاتجاه</p>
            </div>
          )}
        </div>

        {/* POS Breakdown Chart */}
        <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[1.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 flex flex-col transition-all hover:shadow-lg">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-lg">
            <PieChartIcon className="text-emerald-500" size={20} /> مساهمة نقاط البيع
          </h3>
          {posChartData.length > 0 ? (
            <div className="h-[280px] w-full flex flex-col" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={posChartData}
                    cx="50%"
                    cy="45%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {posChartData.map((entry, index) => (
                      <Cell key={\`cell-\${index}\`} fill={COLORS[index % COLORS.length]} className="hover:opacity-80 transition-opacity outline-none" />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: number) => formatNum(value)}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontFamily: 'Cairo', textAlign: 'right', fontSize: '14px', fontWeight: 'bold' }}
                  />
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontFamily: 'Cairo', fontSize: '12px', paddingTop: '10px' }} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 min-h-[250px]">
              <PieChartIcon size={40} className="mb-3 opacity-30" />
              <p className="font-medium text-[15px]">تصنيف مبيعات النقاط غير متاح</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Assistant Section */}
      <div className="bg-indigo-950 rounded-[1.5rem] shadow-xl p-[2px] relative overflow-hidden mt-8 print:hidden transition-all hover:shadow-2xl">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/microbial-mat.png')] opacity-10 MixBlendMode-overlay"></div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600 rounded-full mix-blend-screen filter blur-[80px] opacity-20"></div>
        <div className="bg-[#0f172a]/90 backdrop-blur-xl rounded-[1.4rem] p-6 md:p-8 relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 border border-indigo-500/20">
          <div className="text-right md:flex-1">
            <h3 className="text-xl md:text-2xl font-black text-white mb-2 flex items-center gap-2">
              <Sparkles className="text-indigo-400" /> تحليل مالي متقدم (AI)
            </h3>
            <p className="text-indigo-200 text-[14px] leading-relaxed max-w-2xl opacity-90">
              احصل على تحليل فوري وعميق لبيانات الخزينة والمبيعات ({dateRange === 'all' ? 'لكل الأوقات' : dateRange === 'year' ? 'للعام الحالي' : 'للشهر الحالي'}) لاكتشاف فرص النمو، ومراقبة المصروفات بدقة.
            </p>
          </div>
          <button 
            onClick={handleAnalyzeSales}
            disabled={aiLoading}
            className="w-full md:w-auto shrink-0 bg-white text-indigo-900 px-8 py-3.5 rounded-xl font-black hover:bg-slate-100 hover:scale-105 transition-all shadow-[0_4px_20px_rgba(255,255,255,0.15)] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {aiLoading ? (
              <><div className="w-5 h-5 border-2 border-indigo-900 border-t-transparent rounded-full animate-spin"></div> جاري المعالجة...</>
            ) : (
              <><Sparkles size={18} className="text-indigo-600" /> بدء التحليل</>
            )}
          </button>
        </div>
      </div>

      {/* AI Analysis Result */}
      {aiAnalysis && (
        <div className="bg-gradient-to-b from-indigo-50 to-white border border-indigo-100 rounded-[1.5rem] p-6 md:p-8 shadow-md mt-6 animate-in slide-in-from-top-4 duration-500">
          <div className="flex justify-between items-start mb-6 border-b border-indigo-100 pb-4">
            <h3 className="font-black text-indigo-900 text-xl flex items-center gap-2">
              <FileText className="text-indigo-600" /> تقرير المحلل المالي
            </h3>
            <button onClick={() => setAiAnalysis(null)} className="text-slate-400 hover:text-indigo-700 bg-white p-2 rounded-xl shadow-sm transition-colors border border-slate-100">
              <X size={18} />
            </button>
          </div>
          <div className="prose prose-indigo prose-sm sm:prose-base max-w-none 
             prose-headings:text-indigo-900 prose-headings:font-bold prose-h3:text-lg 
             prose-p:leading-relaxed text-slate-700
             prose-table:w-full prose-table:border-collapse prose-table:rounded-xl prose-table:overflow-hidden prose-table:shadow-sm prose-table:my-6
             prose-th:bg-indigo-600 prose-th:text-white prose-th:p-4 prose-th:text-right prose-th:border-0
             prose-td:p-4 prose-td:border-b prose-td:border-indigo-50 prose-tr:bg-white prose-tr:hover:bg-indigo-50/30 transition-colors
             prose-strong:text-indigo-900" dir="rtl">
            <Markdown remarkPlugins={[remarkGfm]}>{aiAnalysis}</Markdown>
          </div>
        </div>
      )}

      {/* Daily Records List */}
      <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[1.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 mt-8 print:hidden transition-all hover:shadow-lg">
        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-lg">
           <Layers className="text-slate-500" size={20} /> السجلات اليومية ({dailyMetrics.length})
        </h3>
        {dailyMetrics.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200/60">
            <table className="w-full text-right text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-4 px-6 font-bold w-1/3 text-right">التاريخ</th>
                  <th className="py-4 px-6 font-bold text-center text-blue-700">المبيعات</th>
                  <th className="py-4 px-6 font-bold text-center text-rose-600">المصروفات</th>
                  <th className="py-4 px-6 font-bold text-center text-emerald-600">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {dailyMetrics.map((day: any, idx: number) => (
                  <tr key={\`\${day.dateStr}-\${idx}\`} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-6 font-bold text-slate-700 flex items-center gap-3 border-l border-slate-100">
                      <span className="font-mono text-[14px]">{day.dateStr}</span>
                      {day.isCurrent && <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md text-[10px] tracking-tight">قيد التشغيل</span>}
                    </td>
                    <td className="py-4 px-6 font-bold text-center text-blue-700 font-mono" dir="ltr">{formatCurrency(day.pureNetSales)}</td>
                    <td className="py-4 px-6 font-bold text-center text-rose-600 font-mono" dir="ltr">{formatCurrency(day.expenses)}</td>
                    <td className="py-4 px-6 font-black text-center text-emerald-600 font-mono bg-emerald-50/30" dir="ltr">{formatCurrency(day.pureNetSales - day.expenses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <CalendarDays size={40} className="mb-3 opacity-30" />
            <p className="font-medium text-[15px]">لا يوجد سجلات لهذه الفترة</p>
          </div>
        )}
      </div>

    </div>
  );
};
`;

const firstPart = lines.slice(0, startIndex).join('\n');
const secondPart = lines.slice(endIndex + 1).join('\n'); // 1944 onwards

fs.writeFileSync('src/App.tsx', firstPart + '\n' + newCode + '\n' + secondPart);
console.log('Spliced explicitly by line numbers!');
