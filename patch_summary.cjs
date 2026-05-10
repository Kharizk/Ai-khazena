const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// SummaryDashboard wrapper
const sumDashFind = '<div className="bg-slate-900 text-white rounded-3xl shadow-xl overflow-hidden print:bg-white print:text-black print:border print:border-slate-300">';
const sumDashReplace = '<div className="bg-white/60 backdrop-blur border text-slate-800 border-slate-200/50 rounded-[1.2rem] shadow-sm overflow-hidden print:bg-white print:text-black print:border print:border-slate-300">';
code = code.replace(sumDashFind, sumDashReplace);

const sumSub1Find = '<div className="p-4 md:p-5 border-b border-slate-800 print:border-slate-200">';
const sumSub1Replace = '<div className="p-4 md:p-5 border-b border-slate-100 print:border-slate-200">';
code = code.replace(sumSub1Find, sumSub1Replace);

const headingFind = '<h2 className="text-base font-bold text-slate-300 print:text-slate-800 mb-3">ملخص التقفيل اليومي تفصيلي</h2>';
const headingReplace = '<h2 className="text-[15px] font-semibold text-slate-800 mb-3 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div> ملخص التقفيل تفصيلي</h2>';
code = code.replace(headingFind, headingReplace);

const span1Find = '<span className="text-slate-400 print:text-slate-600 truncate">رصيد أول المدة</span>';
const span1Replace = '<span className="text-slate-600 font-medium truncate">رصيد أول المدة</span>';
code = code.replace(span1Find, span1Replace);

const spanH1Find = '<div className="pt-2 border-t border-slate-800 print:border-slate-200">';
const spanH1Replace = '<div className="pt-2 border-t border-slate-100 print:border-slate-200">';
code = code.replace(new RegExp(spanH1Find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), spanH1Replace);

const tInFind = '<div className="flex justify-between items-center gap-2 text-emerald-400 print:text-emerald-700 font-bold mb-1">';
const tInReplace = '<div className="flex justify-between items-center gap-2 text-emerald-600 font-bold mb-1 pt-1">';
code = code.replace(tInFind, tInReplace);

const p1Find = '<div className="pr-4 space-y-1 text-slate-400 print:text-slate-600 text-xs">';
const p1Replace = '<div className="pr-4 space-y-1 text-slate-500 font-medium text-[13px]">';
code = code.replace(new RegExp(p1Find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), p1Replace);

const tOutFind = '<div className="flex justify-between items-center gap-2 text-rose-400 print:text-rose-700 font-bold mb-1">';
const tOutReplace = '<div className="flex justify-between items-center gap-2 text-rose-500 font-bold mb-1 pt-1">';
code = code.replace(tOutFind, tOutReplace);

const tPurpFind = 'className="flex justify-between gap-2 text-purple-400 print:text-purple-700 font-medium"';
const tPurpReplace = 'className="flex justify-between gap-2 text-purple-600 font-medium"';
code = code.replace(tPurpFind, tPurpReplace);

const tDeftFind = '<div className="pt-2 mt-2 border-t border-slate-800 print:border-slate-200 flex justify-between items-center gap-2 text-base font-bold text-blue-400 print:text-blue-700">';
const tDeftReplace = '<div className="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center gap-2 text-[15px] font-bold text-slate-800">';
code = code.replace(tDeftFind, tDeftReplace);

const bgBotFind = '<div className="p-4 md:p-5 bg-slate-800/50 print:bg-slate-50">';
const bgBotReplace = '<div className="p-4 md:p-5 bg-slate-50/50 border-t border-slate-100">';
code = code.replace(bgBotFind, bgBotReplace);

const ambFind = '<div className="flex justify-between items-center gap-2 text-amber-400 print:text-amber-700">';
const ambReplace = '<div className="flex justify-between items-center gap-2 text-blue-600 font-medium">';
code = code.replace(ambFind, ambReplace);

const whiteFind = '<div className="flex justify-between items-center gap-2 text-lg font-bold text-white print:text-black mb-4">';
const whiteReplace = '<div className="flex justify-between items-center gap-2 text-[16px] font-bold text-slate-900 mb-4 pt-1">';
code = code.replace(whiteFind, whiteReplace);

const finBoxFind = 'summary.difference === 0 ? \'bg-emerald-500/20 text-emerald-400 print:bg-emerald-100 print:text-emerald-800 border border-emerald-500/30\' : summary.difference > 0 ? \'bg-blue-500/20 text-blue-400 print:bg-blue-100 print:text-blue-800 border border-blue-500/30\' : \'bg-rose-500/20 text-rose-400 print:bg-rose-100 print:text-rose-800 border border-rose-500/30\'';
const finBoxReplace = 'summary.difference === 0 ? \'bg-emerald-50 text-emerald-700 border border-emerald-200/60\' : summary.difference > 0 ? \'bg-blue-50 text-blue-700 border border-blue-200/60\' : \'bg-rose-50 text-rose-700 border border-rose-200/60\'';
code = code.replace(finBoxFind, finBoxReplace);

const diffSizeFind = '<div className="text-xl font-black" dir="ltr">{formatNum(Math.abs(summary.difference))}</div>';
const diffSizeReplace = '<div className="text-[18px] font-bold" dir="ltr">{formatNum(Math.abs(summary.difference))}</div>';
code = code.replace(diffSizeFind, diffSizeReplace);


fs.writeFileSync('src/App.tsx', code);
