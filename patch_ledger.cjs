const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Ledger containers
const l1Find = 'className="bg-white/90 backdrop-blur-2xl p-4  rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/80 ring-1 ring-slate-900/5 mb-6"';
const l1Replace = 'className="bg-white p-4 rounded-[1rem] shadow-sm border border-slate-200/60 mb-6"';
code = code.replace(l1Find, l1Replace);

const l2Find = 'className="bg-white/95 backdrop-blur-2xl rounded-2xl sm:rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 overflow-hidden"';
const l2Replace = 'className="bg-white rounded-[1rem] shadow-sm border border-slate-200/60 overflow-hidden mb-6"';
code = code.replace(new RegExp(l2Find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), l2Replace);

// Remove color headers in Ledger
code = code.replace(/<div className="bg-slate-800 text-white p-4 flex items-center gap-2 font-bold mb-4">/g, '<div className="bg-transparent text-slate-800 p-4 flex items-center gap-2 font-bold border-b border-slate-100 mb-4">');
code = code.replace(/<div className="bg-violet-50 text-violet-800 p-4 flex items-center gap-2 font-bold border-b border-violet-100">/g, '<div className="bg-transparent text-slate-800 p-4 flex items-center gap-2 font-bold border-b border-slate-100">');

// Ledger "Select box" / dropdown styled input
code = code.replace(/<select\n\s*value=\{selectedFundId\}/g, '<select className="w-full bg-slate-50/50 border border-slate-200/60 rounded-lg px-3 py-2 text-[14px] font-medium text-slate-800 outline-none focus:ring-[3px] focus:ring-slate-900/5 focus:border-slate-400 focus:bg-white transition-all shadow-sm" value={selectedFundId}');
code = code.replace(/className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"/g, 'className="w-full bg-slate-50/50 border border-slate-200/60 rounded-lg px-3 py-2 text-[14px] font-medium text-slate-800 outline-none focus:ring-[3px] focus:ring-slate-900/5 focus:border-slate-400 focus:bg-white transition-all shadow-sm"');

fs.writeFileSync('src/App.tsx', code);
