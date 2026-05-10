const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. DynamicTable: replace header colorClass with standard
const dtHeaderSearch = `<div className={\`flex justify-between items-center px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 \${colorClass}\`}>`;
const dtHeaderReplace = `<div className={\`flex justify-between items-center px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 bg-transparent text-slate-800\`}>`;
code = code.replace(dtHeaderSearch, dtHeaderReplace);

// Remove colorClass from renderTable calls
code = code.replace(/renderTable\('مردود مصروف \(يضاف للخزينة\)', 'expenseRefunds', Undo2, '[^']+'\)/g, "renderTable('مردود مصروف (يضاف للخزينة)', 'expenseRefunds', Undo2, '')");
code = code.replace(/renderTable\('تحويلات العملاء \(شبكة\/بنكي تخصم من الخزينة\)', 'customerTransfers', CreditCard, '[^']+'\)/g, "renderTable('تحويلات العملاء (شبكة/بنكي تخصم من الخزينة)', 'customerTransfers', CreditCard, '')");
code = code.replace(/renderTable\('سداد شركات وموردين', 'companyPayments', ArrowUpRight, '[^']+'\)/g, "renderTable('سداد شركات وموردين', 'companyPayments', ArrowUpRight, '')");
code = code.replace(/renderTable\('مصروفات متنوعة \(رواتب، نثريات...\)', 'expenses', ArrowUpRight, '[^']+', false, true\)/g, "renderTable('مصروفات متنوعة (رواتب، نثريات...)', 'expenses', ArrowUpRight, '', false, true)");
code = code.replace(/renderTable\('إيداعات بنكية', 'cashDeposits', Wallet, '[^']+'\)/g, "renderTable('إيداعات بنكية', 'cashDeposits', Wallet, '')");
code = code.replace(/renderTable\('أموال معلقة لنا \(تُحسب ككاش بالخزينة\)', 'pendingFundsOwedToUs', ArrowDownRight, '[^']+', true\)/g, "renderTable('أموال معلقة لنا (تُحسب ككاش بالخزينة)', 'pendingFundsOwedToUs', ArrowDownRight, '', true)");
code = code.replace(/renderTable\('أموال معلقة علينا \(تُخصم من الخزينة\)', 'pendingFundsOwedByUs', ArrowUpRight, '[^']+', true\)/g, "renderTable('أموال معلقة علينا (تُخصم من الخزينة)', 'pendingFundsOwedByUs', ArrowUpRight, '', true)");
code = code.replace(/renderTable\('مبالغ نقدية مجمعة \(رزم أو مبالغ معدودة مسبقاً\)', 'customCashAmounts', Layers, '[^']+'\)/g, "renderTable('مبالغ نقدية مجمعة (رزم أو مبالغ معدودة مسبقاً)', 'customCashAmounts', Layers, '')");

// Table headers inside divs
code = code.replace(/className="bg-emerald-50 text-emerald-800 p-4 border-b border-emerald-100 flex items-center gap-2 font-bold"/g, 'className="bg-transparent text-slate-800 p-4 border-b border-slate-100 flex items-center gap-2 font-bold"');
code = code.replace(/className="bg-indigo-50 text-indigo-800 p-4 border-b border-indigo-100 flex items-center justify-between font-bold"/g, 'className="bg-transparent text-slate-800 p-4 border-b border-slate-100 flex items-center justify-between font-bold"');
code = code.replace(/className="bg-blue-50 text-blue-800 p-4 flex items-center gap-2 font-bold border-b border-blue-100"/g, 'className="bg-transparent text-slate-800 p-4 flex items-center gap-2 font-bold border-b border-slate-100"');
code = code.replace(/className="bg-slate-800 text-white p-4 flex items-center gap-2 font-bold"/g, 'className="bg-transparent text-slate-800 p-4 flex items-center gap-2 font-bold border-b border-slate-100"');

// Fix summary dashboard look
const summaryDashTarget = `<h2 className="text-xl font-bold text-center mb-6 border-b-2 border-black pb-2">ملخص التقفيل اليومي</h2>
        <table className="w-full text-right border-collapse mb-8 text-[15px]">
          <tbody>
            <tr className="border-b border-slate-200"><td className="py-3 font-bold">رصيد أول المدة</td><td className="py-3 font-bold" dir="ltr">{formatNum(state.previousBalance)}</td></tr>
            <tr className="border-b border-slate-200"><td className="py-3 font-bold">+ إجمالي الإيرادات (الوارد)</td><td className="py-3 font-bold" dir="ltr">{formatNum(summary.totalCashIn)}</td></tr>
            <tr>
              <td colSpan={2} className="py-2 pr-4 text-xs text-slate-600">
                <div className="flex justify-between mb-1"><span>صافي المبيعات</span><span dir="ltr">{formatNum(summary.netSales)}</span></div>
                {summary.totalExpenseRefunds > 0 && <div className="flex justify-between mb-1"><span>مردود مصروفات</span><span dir="ltr">{formatNum(summary.totalExpenseRefunds)}</span></div>}
              </td>
            </tr>
            <tr className="border-b border-slate-200 border-t"><td className="py-3 font-bold">- إجمالي المخصومات (المنصرف)</td><td className="py-3 font-bold" dir="ltr">{formatNum(summary.totalCashOut)}</td></tr>
            <tr>
              <td colSpan={2} className="py-2 pr-4 text-xs text-slate-600">
                {summary.totalNetworks > 0 && <div className="flex justify-between mb-1"><span>الشبكات</span><span dir="ltr">{formatNum(summary.totalNetworks)}</span></div>}
                {summary.totalCustomerTransfers > 0 && <div className="flex justify-between mb-1"><span>تحويلات العملاء</span><span dir="ltr">{formatNum(summary.totalCustomerTransfers)}</span></div>}
                {summary.totalCompanyPayments > 0 && <div className="flex justify-between mb-1"><span>سداد شركات وموردين</span><span dir="ltr">{formatNum(summary.totalCompanyPayments)}</span></div>}
                {summary.generalExpensesTotal > 0 && <div className="flex justify-between mb-1"><span>مصروفات عامة</span><span dir="ltr">{formatNum(summary.generalExpensesTotal)}</span></div>}
                {summary.totalCashDeposits > 0 && <div className="flex justify-between mb-1"><span>إيداعات بنكية</span><span dir="ltr">{formatNum(summary.totalCashDeposits)}</span></div>}
                {summary.separatedExpenses.map(exp => (
                  <div key={exp.id} className="flex justify-between mb-1"><span>{exp.name || 'مصروف محدد'}</span><span dir="ltr">{formatNum(exp.amount)}</span></div>
                ))}
              </td>
            </tr>
            <tr className="border-b-2 border-black bg-slate-50"><td className="py-3 font-bold text-base">الرصيد الدفتري (المتوقع)</td><td className="py-3 font-bold text-base" dir="ltr">{formatNum(summary.expectedCash)}</td></tr>
          </tbody>
        </table>

        <h3 className="text-lg font-bold mb-3 border-b border-black pb-1">تفاصيل الجرد الفعلي</h3>
        <table className="w-full text-right border-collapse mb-6 text-[15px]">
          <tbody>
            <tr className="border-b border-slate-200"><td className="py-3 font-bold">النقدية الفعلية (الجرد)</td><td className="py-3 font-bold" dir="ltr">{formatNum(summary.physicalCash)}</td></tr>
            <tr className="border-b border-slate-200"><td className="py-3 font-bold">+ أموال معلقة لنا</td><td className="py-3 font-bold" dir="ltr">{formatNum(summary.totalPendingOwedToUs)}</td></tr>
            <tr className="border-b border-slate-200"><td className="py-3 font-bold">- أموال معلقة علينا</td><td className="py-3 font-bold" dir="ltr">{formatNum(summary.totalPendingOwedByUs)}</td></tr>
            <tr className="border-b-2 border-black bg-slate-50"><td className="py-3 font-bold text-base">الرصيد الفعلي</td><td className="py-3 font-bold text-base" dir="ltr">{formatNum(summary.actualCash)}</td></tr>
          </tbody>
        </table>

        <div className={\`p-4 rounded border-2 text-center font-bold text-lg \${summary.difference === 0 ? 'border-black' : 'border-black'}\`}>`;

const summaryDashReplace = `<h2 className="text-xl font-bold text-center mb-6 border-b border-slate-200 pb-4 text-slate-800">ملخص التقفيل اليومي</h2>
        <table className="w-full text-right border-collapse mb-8 text-[15px] text-slate-700">
          <tbody>
            <tr className="border-b border-slate-100"><td className="py-3 font-bold cursor-default hover:text-slate-900 transition-colors">رصيد أول المدة</td><td className="py-3 font-bold text-slate-900" dir="ltr">{formatNum(state.previousBalance)}</td></tr>
            <tr className="border-b border-slate-100"><td className="py-3 font-bold text-emerald-600">+ إجمالي الإيرادات (الوارد)</td><td className="py-3 font-bold text-emerald-600" dir="ltr">{formatNum(summary.totalCashIn)}</td></tr>
            <tr>
              <td colSpan={2} className="py-2 pr-4 text-[13px] text-slate-500 font-medium">
                <div className="flex justify-between mb-1"><span>صافي المبيعات</span><span dir="ltr">{formatNum(summary.netSales)}</span></div>
                {summary.totalExpenseRefunds > 0 && <div className="flex justify-between mb-1"><span>مردود مصروفات</span><span dir="ltr">{formatNum(summary.totalExpenseRefunds)}</span></div>}
              </td>
            </tr>
            <tr className="border-b border-slate-100 border-t"><td className="py-3 font-bold text-rose-500">- إجمالي المخصومات (المنصرف)</td><td className="py-3 font-bold text-rose-500" dir="ltr">{formatNum(summary.totalCashOut)}</td></tr>
            <tr>
              <td colSpan={2} className="py-2 pr-4 text-[13px] text-slate-500 font-medium">
                {summary.totalNetworks > 0 && <div className="flex justify-between mb-1"><span>الشبكات</span><span dir="ltr">{formatNum(summary.totalNetworks)}</span></div>}
                {summary.totalCustomerTransfers > 0 && <div className="flex justify-between mb-1"><span>تحويلات العملاء</span><span dir="ltr">{formatNum(summary.totalCustomerTransfers)}</span></div>}
                {summary.totalCompanyPayments > 0 && <div className="flex justify-between mb-1"><span>سداد شركات وموردين</span><span dir="ltr">{formatNum(summary.totalCompanyPayments)}</span></div>}
                {summary.generalExpensesTotal > 0 && <div className="flex justify-between mb-1"><span>مصروفات عامة</span><span dir="ltr">{formatNum(summary.generalExpensesTotal)}</span></div>}
                {summary.totalCashDeposits > 0 && <div className="flex justify-between mb-1"><span>إيداعات بنكية</span><span dir="ltr">{formatNum(summary.totalCashDeposits)}</span></div>}
                {summary.separatedExpenses.map(exp => (
                  <div key={exp.id} className="flex justify-between mb-1"><span>{exp.name || 'مصروف محدد'}</span><span dir="ltr">{formatNum(exp.amount)}</span></div>
                ))}
              </td>
            </tr>
            <tr className="border-b border-slate-200 bg-slate-50 opacity-90"><td className="py-3 font-bold text-base text-slate-800 px-2 rounded-r-lg">الرصيد الدفتري (المتوقع)</td><td className="py-3 font-bold text-base text-slate-900 px-2 rounded-l-lg" dir="ltr">{formatNum(summary.expectedCash)}</td></tr>
          </tbody>
        </table>

        <h3 className="text-lg font-bold mb-4 border-b border-slate-200 pb-2 text-slate-800">تفاصيل الجرد الفعلي</h3>
        <table className="w-full text-right border-collapse mb-6 text-[15px] text-slate-700">
          <tbody>
            <tr className="border-b border-slate-100"><td className="py-3 font-bold">النقدية الفعلية (الجرد)</td><td className="py-3 font-bold text-slate-900" dir="ltr">{formatNum(summary.physicalCash)}</td></tr>
            <tr className="border-b border-slate-100"><td className="py-3 font-bold text-indigo-500">+ أموال معلقة لنا</td><td className="py-3 font-bold text-indigo-500" dir="ltr">{formatNum(summary.totalPendingOwedToUs)}</td></tr>
            <tr className="border-b border-slate-100"><td className="py-3 font-bold text-slate-500">- أموال معلقة علينا</td><td className="py-3 font-bold text-slate-500" dir="ltr">{formatNum(summary.totalPendingOwedByUs)}</td></tr>
            <tr className="border-b border-slate-200 bg-slate-50 opacity-90"><td className="py-3 font-bold text-base text-slate-800 px-2 rounded-r-lg">الرصيد الفعلي</td><td className="py-3 font-bold text-base text-slate-900 px-2 rounded-l-lg" dir="ltr">{formatNum(summary.actualCash)}</td></tr>
          </tbody>
        </table>

        <div className={\`p-4 rounded-xl border text-center font-bold text-lg \${summary.difference === 0 ? 'border-none bg-slate-100 text-slate-700' : summary.difference > 0 ? 'border-none bg-blue-50 text-blue-700' : 'border-none bg-rose-50 text-rose-700'}\`}>`;

code = code.replace(summaryDashTarget, summaryDashReplace);

fs.writeFileSync('src/App.tsx', code);
