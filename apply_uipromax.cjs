const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. App background and base text
code = code.replace(/className="min-h-screen bg-\[[^\]]+\]/g, 'className="min-h-screen bg-slate-50');
code = code.replace(/bg-gray-50/g, 'bg-slate-50/40');
code = code.replace(/bg-white/g, 'bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]');

// 2. Headings and headers
code = code.replace(/text-gray-900/g, 'text-slate-900 tracking-tight');
code = code.replace(/text-gray-800/g, 'text-slate-800');
code = code.replace(/text-gray-700/g, 'text-slate-600');

// 3. Buttons (Primary)
code = code.replace(/bg-blue-600 hover:bg-blue-700 text-white/g, 'bg-slate-900 hover:bg-slate-800 text-white shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 active:translate-y-0 duration-200');
code = code.replace(/bg-emerald-600 hover:bg-emerald-700 text-white/g, 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 active:translate-y-0 duration-200');

// 4. Inputs
code = code.replace(/className="w-full border rounded/g, 'className="w-full border border-slate-200/60 rounded-xl bg-slate-50/50 backdrop-blur-xl focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900/20 transition-all duration-300');

// 5. Borders and Rounding
code = code.replace(/rounded-lg/g, 'rounded-2xl');
code = code.replace(/rounded-md/g, 'rounded-xl');
code = code.replace(/border-gray-200/g, 'border-slate-200/60');
code = code.replace(/border-gray-300/g, 'border-slate-200/60');
code = code.replace(/border-slate-200/g, 'border-slate-200/60');

// 6. Tables - clean look
code = code.replace(/border-collapse/g, 'border-separate border-spacing-0 overflow-hidden rounded-2xl');

// 7. Cleanup the overly aggressive bg-white replacement for simple elements
code = code.replace(/bg-white shadow-\[.*?\] border border-slate-200\/60 transition-all hover:shadow-\[.*?\]/g, 'bg-white ring-1 ring-slate-900/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl');

fs.writeFileSync('src/App.tsx', code);
console.log('Applied UI/UX Pro Max styles to App.tsx');
