const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. DailyPrintView
code = code.replace(
  /<div className="text-center mb-6 pb-4 border-b-2 border-gray-300">\s*<h2 className="text-2xl font-bold mb-1">\{companyName\}<\/h2>\s*<h1 className="text-3xl font-bold mb-2">تقرير التقفيل اليومي<\/h1>\s*<p className="text-lg">تاريخ: <span dir="ltr" className="font-bold">\{state\.date\}<\/span><\/p>\s*<\/div>/,
  `<div className="text-center mb-4 pb-3 border-b-2 border-gray-300">
      <h2 className="text-lg font-bold mb-0.5 text-slate-700">{companyName}</h2>
      <h1 className="text-2xl font-black mb-1">تقرير التقفيل اليومي</h1>
      <p className="text-base font-bold">تاريخ: <span dir="ltr" className="font-mono">{state.date}</span></p>
    </div>`
);

// 2. PosPrintView
code = code.replace(
  /<div className="text-center mb-8 pb-6 border-b-2 border-gray-400">\s*<h2 className="text-2xl font-bold mb-2">\{companyName\}<\/h2>\s*<h1 className="text-4xl font-black mb-3 text-gray-900 border-2 border-slate-800 inline-block px-8 py-3 rounded-\[4px\] shadow-\[4px_4px_0_0_rgba\(17,24,39,1\)\]">\s*تسوية نقطة بيع: \{pos\.name \|\| 'بدون اسم'\}\s*<\/h1>\s*<div className="flex justify-center gap-6 mt-6">\s*<p className="text-lg font-bold bg-slate-50 dark:bg-slate-800\/50 px-4 py-2 rounded-\[4px\] border border-gray-300">\s*تاريخ الإعداد: <span dir="ltr" className="font-mono text-slate-800 dark:text-slate-200 font-bold">\{date \|\| summary\?\.date \|\| new Date\(\)\.toLocaleDateString\('en-GB'\)\}<\/span>\s*<\/p>\s*<p className="text-lg font-bold bg-slate-50 dark:bg-slate-800\/50 px-4 py-2 rounded-\[4px\] border border-gray-300">\s*وقت الطباعة: <span dir="ltr" className="font-mono text-slate-800 dark:text-slate-200 font-bold">\{new Date\(\)\.toLocaleTimeString\('ar-EG', \{hour: '2-digit', minute:'2-digit'\}\)\}<\/span>\s*<\/p>\s*<\/div>\s*<\/div>/,
  `<div className="text-center mb-4 pb-4 border-b-2 border-gray-400">
        <h2 className="text-lg font-bold mb-1 text-slate-700">{companyName}</h2>
        <h1 className="text-2xl font-black mb-2 text-gray-900 border-2 border-slate-800 inline-block px-6 py-1.5 rounded-[4px] shadow-[2px_2px_0_0_rgba(17,24,39,1)]">
          تسوية نقطة بيع: {pos.name || 'بدون اسم'}
        </h1>
        <div className="flex justify-center gap-4 mt-3">
          <p className="text-sm font-bold bg-slate-50 dark:bg-slate-800/50 px-3 py-1 rounded-[4px] border border-gray-300">
            تاريخ الإعداد: <span dir="ltr" className="font-mono text-slate-800 dark:text-slate-200 font-bold">{date || summary?.date || new Date().toLocaleDateString('en-GB')}</span>
          </p>
          <p className="text-sm font-bold bg-slate-50 dark:bg-slate-800/50 px-3 py-1 rounded-[4px] border border-gray-300">
            وقت الطباعة: <span dir="ltr" className="font-mono text-slate-800 dark:text-slate-200 font-bold">{new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span>
          </p>
        </div>
      </div>`
);

// 3. ComprehensivePrintView
code = code.replace(
  /<div className="text-center mb-6 pb-4 border-b-4 border-double border-gray-400">\s*<h1 className="text-3xl font-black mb-2 text-gray-900">ملخص الخزينة اليومي للمبيعات والمصروفات<\/h1>\s*<div className="flex justify-between items-center px-4">\s*<p className="text-lg font-semibold text-gray-600">التاريخ: <span dir="ltr">\{state\.date\}<\/span><\/p>\s*<p className="text-lg font-semibold text-gray-600">تاريخ الطباعة: <span dir="ltr">\{new Date\(\)\.toLocaleDateString\('en-GB'\)\}<\/span><\/p>\s*<\/div>\s*<\/div>/,
  `<div className="text-center mb-4 pb-3 border-b-4 border-double border-gray-400">
        <h1 className="text-2xl font-black mb-2 text-gray-900 border-2 border-slate-800 inline-block px-5 py-1.5 rounded-[4px] shadow-[2px_2px_0_0_rgba(17,24,39,1)]">ملخص الخزينة اليومي للمبيعات والمصروفات</h1>
        <div className="flex justify-center gap-4 mt-2">
          <p className="text-sm font-bold text-gray-800 bg-slate-50 border border-slate-200 px-3 py-1 rounded-[4px]">التاريخ: <span dir="ltr" className="font-mono">{state.date}</span></p>
          <p className="text-sm font-bold text-gray-800 bg-slate-50 border border-slate-200 px-3 py-1 rounded-[4px]">الطباعة: <span dir="ltr" className="font-mono">{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span></p>
        </div>
      </div>`
);

// 4. PendingPrintView
code = code.replace(
  /<div className="text-center mb-6 pb-4 border-b-4 border-double border-slate-300">\s*<h2 className="text-xl font-bold mb-1 text-slate-800">\{companyName\}<\/h2>\s*<h1 className="text-3xl font-black mb-3 text-black">تقرير الأموال المعلقة<\/h1>\s*<div className="flex justify-center items-center gap-6 text-slate-700 text-\[15px\] font-bold">\s*<span>التاريخ: \{new Date\(\)\.toLocaleDateString\('en-GB'\)\}<\/span>\s*<span>الوقت: \{new Date\(\)\.toLocaleTimeString\('ar-EG', \{hour: '2-digit', minute:'2-digit'\}\)\}<\/span>\s*<\/div>\s*<\/div>/,
  `<div className="text-center mb-4 pb-3 border-b-4 border-double border-slate-300">
        <h2 className="text-base font-bold mb-0.5 text-slate-700">{companyName}</h2>
        <h1 className="text-2xl font-black mb-2 text-black border-2 border-slate-800 inline-block px-5 py-1.5 rounded-[4px] shadow-[2px_2px_0_0_rgba(17,24,39,1)]">تقرير الأموال المعلقة</h1>
        <div className="flex justify-center items-center gap-4 mt-2">
           <p className="text-sm font-bold text-gray-800 bg-slate-50 border border-slate-200 px-3 py-1 rounded-[4px]">التاريخ: <span dir="ltr" className="font-mono">{new Date().toLocaleDateString('en-GB')}</span></p>
           <p className="text-sm font-bold text-gray-800 bg-slate-50 border border-slate-200 px-3 py-1 rounded-[4px]">الوقت: <span dir="ltr" className="font-mono">{new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span></p>
        </div>
      </div>`
);

// 5. Ledger Report Replace
code = code.replace(/<h2 style="font-size: 24px; margin-bottom: 5px;">\$\{companyName\}<\/h2>\s*<h2>تقرير دفتر الأستاذ<\/h2>/, 
  `<h2 style="font-size: 16px; margin-bottom: 2px; color: #475569;">\${companyName}</h2>
                                <h2 style="font-size: 20px; font-weight: 800; margin-bottom: 8px; background: #f8fafc; display: inline-block; padding: 4px 12px; border: 2px solid #1e293b; border-radius: 4px; box-shadow: 2px 2px 0 0 #1e293b;">تقرير دفتر الأستاذ</h2>`);


fs.writeFileSync('src/App.tsx', code);
console.log('done headers');
