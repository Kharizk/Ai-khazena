const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');

const target = `const PendingPrintView = ({ companyName, pendingOwedToUs, pendingOwedByUs, formatNum, isPdfMode = false, id }: any) => {
  const sumOwedToUs = pendingOwedToUs.reduce((a: number, b: any) => a + b.amount, 0);
  const sumOwedByUs = pendingOwedByUs.reduce((a: number, b: any) => a + b.amount, 0);

  return (
    <div id={id} className={isPdfMode ? "rtl p-8 bg-white text-black font-sans w-[800px]" : "hidden print:block rtl p-8 w-full print:bg-white text-black font-sans"}>
      <div className="text-center mb-8 pb-4 border-b-2 border-gray-300">
        <h2 className="text-2xl font-bold mb-1">{companyName}</h2>
        <h1 className="text-3xl font-bold mb-2">تقرير الأموال المعلقة</h1>
        <p className="text-gray-700 text-lg">تاريخ الطباعة: <span dir="ltr" className="font-bold font-mono">{new Date().toLocaleDateString('en-GB')}</span></p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-bold p-3 mb-4 bg-amber-50 text-amber-900 border border-amber-200 flex justify-between rounded-xl">
            <span>أموال لنا (سلف/عهد)</span>
            <span dir="ltr" className="font-mono">{formatNum(sumOwedToUs)}</span>
          </h2>
          <table className="w-full text-right border-collapse text-[15px] border border-gray-300">
            <thead>
              <tr className="bg-slate-50">
                <th className="py-5 px-2 border border-gray-300 w-10 text-center">م</th>
                <th className="py-5 px-2 border border-gray-300">الاسم</th>
                <th className="py-5 px-2 border border-gray-300 w-28 text-left">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {pendingOwedToUs.length > 0 ? pendingOwedToUs.map((item: any, idx: number) => (
                <tr key={item.id} className="border-b border-gray-200">
                  <td className="py-4 px-2 border border-gray-300 text-center">{idx + 1}</td>
                  <td className="py-4 px-2 border border-gray-300">{item.name}</td>
                  <td className="py-4 px-2 border border-gray-300 text-left font-bold font-mono" dir="ltr">{formatNum(item.amount)}</td>
                </tr>
              )) : <tr><td colSpan={3} className="text-center py-4 text-gray-500 border border-gray-300">لا توجد أموال معلقة لنا</td></tr>}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="text-xl font-bold p-3 mb-4 bg-slate-100 text-slate-800 border border-slate-200 flex justify-between rounded-xl">
            <span>أموال علينا (أمانات/مستحقات)</span>
            <span dir="ltr" className="font-mono">{formatNum(sumOwedByUs)}</span>
          </h2>
          <table className="w-full text-right border-collapse text-[15px] border border-gray-300">
            <thead>
              <tr className="bg-slate-50">
                <th className="py-5 px-2 border border-gray-300 w-10 text-center">م</th>
                <th className="py-5 px-2 border border-gray-300">الاسم</th>
                <th className="py-5 px-2 border border-gray-300 w-28 text-left">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {pendingOwedByUs.length > 0 ? pendingOwedByUs.map((item: any, idx: number) => (
                <tr key={item.id} className="border-b border-gray-200">
                  <td className="py-4 px-2 border border-gray-300 text-center">{idx + 1}</td>
                  <td className="py-4 px-2 border border-gray-300">{item.name}</td>
                  <td className="py-4 px-2 border border-gray-300 text-left font-bold font-mono" dir="ltr">{formatNum(item.amount)}</td>
                </tr>
              )) : <tr><td colSpan={3} className="text-center py-4 text-gray-500 border border-gray-300">لا توجد أموال معلقة علينا</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};`;

const replacement = `const PendingPrintView = ({ companyName, pendingOwedToUs, pendingOwedByUs, formatNum, isPdfMode = false, id }: any) => {
  const sumOwedToUs = pendingOwedToUs.reduce((a: number, b: any) => a + b.amount, 0);
  const sumOwedByUs = pendingOwedByUs.reduce((a: number, b: any) => a + b.amount, 0);

  return (
    <div id={id} className={isPdfMode ? "rtl p-8 bg-white text-black font-sans w-[800px]" : "hidden print:block rtl p-8 w-full print:bg-white text-black font-sans"}>
      <div className="text-center mb-8 pb-4 border-b-2 border-gray-300">
        <h2 className="text-2xl font-bold mb-1">{companyName}</h2>
        <h1 className="text-3xl font-bold mb-2">تقرير الأموال المعلقة</h1>
        <p className="text-gray-700 text-lg">تاريخ الطباعة: <span dir="ltr" className="font-bold font-mono">{new Date().toLocaleDateString('en-GB')}</span></p>
      </div>

      <div className="columns-1 sm:columns-2 gap-8 print:columns-2 print:gap-8 text-[15px]">
        {/* Section 1 Header */}
        <div className="break-inside-avoid mb-2 bg-amber-50 rounded-lg border border-amber-200 overflow-hidden mt-0 shadow-sm">
          <div className="p-3 flex justify-between items-center text-amber-900 border-b border-amber-200/50">
            <h2 className="text-lg font-bold">أموال لنا (سلف/عهد)</h2>
            <span dir="ltr" className="font-mono font-bold text-xl">{formatNum(sumOwedToUs)}</span>
          </div>
        </div>

        {/* Section 1 Items */}
        {pendingOwedToUs.length > 0 ? pendingOwedToUs.map((item: any, idx: number) => (
          <div key={item.id} className="break-inside-avoid flex justify-between items-center py-2 px-3 border border-gray-200 bg-white mb-2 rounded-lg shadow-sm">
             <div className="flex items-center gap-3">
               <span className="w-7 h-7 flex items-center justify-center text-[13px] text-gray-500 font-bold bg-gray-100 rounded shrink-0">{idx + 1}</span>
               <span className="font-semibold text-gray-800">{item.name}</span>
             </div>
             <span className="font-bold font-mono text-gray-900" dir="ltr">{formatNum(item.amount)}</span>
          </div>
        )) : <div className="break-inside-avoid text-center py-4 text-gray-500 bg-white mb-6 border border-gray-200 rounded-lg">لا توجد أموال معلقة لنا</div>}

        <div className="break-inside-avoid h-4"></div>

        {/* Section 2 Header */}
        <div className="break-inside-avoid mb-2 bg-slate-100 rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-3 flex justify-between items-center text-slate-800 border-b border-slate-200/50">
            <h2 className="text-lg font-bold">أموال علينا (أمانات/مستحقات)</h2>
            <span dir="ltr" className="font-mono font-bold text-xl">{formatNum(sumOwedByUs)}</span>
          </div>
        </div>

        {/* Section 2 Items */}
        {pendingOwedByUs.length > 0 ? pendingOwedByUs.map((item: any, idx: number) => (
          <div key={item.id} className="break-inside-avoid flex justify-between items-center py-2 px-3 border border-gray-200 bg-white mb-2 rounded-lg shadow-sm">
             <div className="flex items-center gap-3">
               <span className="w-7 h-7 flex items-center justify-center text-[13px] text-gray-500 font-bold bg-gray-100 rounded shrink-0">{idx + 1}</span>
               <span className="font-semibold text-gray-800">{item.name}</span>
             </div>
             <span className="font-bold font-mono text-gray-900" dir="ltr">{formatNum(item.amount)}</span>
          </div>
        )) : <div className="break-inside-avoid text-center py-4 text-gray-500 bg-white mb-6 border border-gray-200 rounded-lg">لا توجد أموال معلقة علينا</div>}

      </div>
    </div>
  );
};`;

const newContent = content.replace(target, replacement);
fs.writeFileSync('src/App.tsx', newContent);
