const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Analytics KPI cards container changes
const kpiCardFind = 'className="bg-white/90 backdrop-blur-xl p-5 rounded-[1.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 relative overflow-hidden group hover:shadow-lg transition-all duration-300"';
const kpiCardReplace = 'className="bg-white p-5 rounded-[1.2rem] shadow-sm border border-slate-200/60 relative overflow-hidden group hover:border-slate-300 transition-all duration-300"';
code = code.replace(new RegExp(kpiCardFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), kpiCardReplace);

// Main chart containers
const chartBgFind = 'className="bg-white/95 backdrop-blur-2xl p-5 sm:p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-200/60 print:shadow-none print:border-none print:p-0"';
const chartBgReplace = 'className="bg-white p-5 sm:p-6 rounded-[1.2rem] shadow-sm border border-slate-200/60 print:shadow-none print:border-none print:p-0"';
code = code.replace(new RegExp(chartBgFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), chartBgReplace);

// Analytics Header
const analyticsHeaderFind = 'className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 print:hidden backdrop-blur-md bg-white/40 p-4 rounded-2xl border border-white/60 shadow-sm"';
const analyticsHeaderReplace = 'className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 print:hidden bg-transparent py-2"';
code = code.replace(analyticsHeaderFind, analyticsHeaderReplace);

// Remove the colorful borders in KPI cards
code = code.replace(/<div className="absolute top-0 right-0 w-1\.5 h-full bg-blue-500"><\/div>/g, '');
code = code.replace(/<div className="absolute top-0 right-0 w-1\.5 h-full bg-rose-500"><\/div>/g, '');
code = code.replace(/<div className="absolute top-0 right-0 w-1\.5 h-full bg-emerald-500"><\/div>/g, '');
code = code.replace(/<div className="absolute top-0 right-0 w-1\.5 h-full bg-amber-500"><\/div>/g, '');
code = code.replace(/<div className="absolute top-0 right-0 w-1\.5 h-full bg-purple-500"><\/div>/g, '');

code = code.replace(/<p className="text-slate-500 text-sm font-bold mb-3 flex items-center gap-2">/g, '<p className="text-slate-500 text-[13px] font-medium mb-3 flex items-center gap-2">');
code = code.replace(/<h3 className="text-3xl font-black text-slate-800 font-mono tracking-tight" dir="ltr">/g, '<h3 className="text-[26px] font-bold text-slate-800 font-mono tracking-tight" dir="ltr">');
code = code.replace(/<h3 className={`text-3xl font-black font-mono tracking-tight \${totalNetVal >= 0 \? 'text-emerald-600' : 'text-rose-600'}`} dir="ltr">/g, '<h3 className={`text-[26px] font-bold font-mono tracking-tight ${totalNetVal >= 0 ? \'text-slate-800\' : \'text-slate-800\'}`} dir="ltr">');


code = code.replace(/bg-blue-600 text-white shadow-md/g, 'bg-slate-800 text-white shadow-sm border-slate-700');

fs.writeFileSync('src/App.tsx', code);
