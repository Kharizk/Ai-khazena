const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Dashboard metrics cards (Analytics)
const aInFind = '<div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-between shadow-sm">';
const aInReplace = '<div className="bg-white border border-slate-200/80 rounded-[1rem] p-4 flex items-center justify-between shadow-sm">';
code = code.replace(aInFind, aInReplace);

const aOutFind = '<div className="bg-rose-50 border border-rose-100 rounded-xl p-4 flex items-center justify-between shadow-sm">';
const aOutReplace = '<div className="bg-white border border-slate-200/80 rounded-[1rem] p-4 flex items-center justify-between shadow-sm">';
code = code.replace(aOutFind, aOutReplace);

const aBalFind = '<div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between shadow-sm bg-gradient-to-l from-blue-50 to-indigo-50">';
const aBalReplace = '<div className="bg-white border border-slate-200/80 rounded-[1rem] p-4 flex items-center justify-between shadow-sm">';
code = code.replace(aBalFind, aBalReplace);

const aPendFind = '<div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-center justify-between shadow-sm">';
const aPendReplace = '<div className="bg-white border border-slate-200/80 rounded-[1rem] p-4 flex items-center justify-between shadow-sm">';
code = code.replace(aPendFind, aPendReplace);

// Text colors inside these cards
code = code.replace(/className="text-emerald-600 text-\[15px\] font-bold mb-1"/g, 'className="text-slate-500 text-[13px] font-medium mb-1"');
code = code.replace(/className="text-xl font-black text-emerald-800" dir="ltr"/g, 'className="text-[20px] font-bold text-slate-800" dir="ltr"');

code = code.replace(/className="text-rose-600 text-\[15px\] font-bold mb-1"/g, 'className="text-slate-500 text-[13px] font-medium mb-1"');
code = code.replace(/className="text-xl font-black text-rose-800" dir="ltr"/g, 'className="text-[20px] font-bold text-slate-800" dir="ltr"');

code = code.replace(/className="text-blue-600 text-\[15px\] font-bold mb-1"/g, 'className="text-slate-500 text-[13px] font-medium mb-1"');
code = code.replace(/className="text-xl font-black text-blue-800" dir="ltr"/g, 'className="text-[20px] font-bold text-slate-800" dir="ltr"');

code = code.replace(/className="text-amber-600 text-\[15px\] font-bold mb-1"/g, 'className="text-slate-500 text-[13px] font-medium mb-1"');
code = code.replace(/className="text-xl font-black text-amber-800" dir="ltr"/g, 'className="text-[20px] font-bold text-slate-800" dir="ltr"');

// Delete redundant classes for icons in analytics
code = code.replace(/<ArrowDownRight className="text-emerald-500 opacity-50" size={32} \/>/g, '<ArrowDownRight className="text-emerald-500" size={24} />');
code = code.replace(/<ArrowUpRight className="text-rose-500 opacity-50" size={32} \/>/g, '<ArrowUpRight className="text-rose-500" size={24} />');
code = code.replace(/<Wallet className="text-blue-500 opacity-50" size={32} \/>/g, '<Wallet className="text-blue-500" size={24} />');
code = code.replace(/<Clock className="text-amber-500 opacity-50" size={32} \/>/g, '<Clock className="text-amber-500" size={24} />');

// Table Headers in App.tsx (Main POS card header)
const bFind = '<div className="bg-transparent text-slate-800 p-4 border-b border-slate-100 flex items-center gap-2 font-bold">';
const bReplace = '<div className="bg-transparent text-slate-800 px-5 flex items-center gap-2 font-semibold text-[15px] pt-4 pb-2">';
code = code.replace(new RegExp(bFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), bReplace);

// Main headers (جرد الخزينة (الفئات النقدية) etc)
const bFind2 = '<div className="bg-transparent text-slate-800 p-4 border-b border-slate-100 flex items-center justify-between font-bold">';
const bReplace2 = '<div className="bg-transparent text-slate-800 px-5 pt-4 pb-2 flex items-center justify-between font-semibold text-[15px]">';
code = code.replace(new RegExp(bFind2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), bReplace2);

// Summary table layout
const sumCardFind = '<div className="bg-white/90 backdrop-blur-3xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-white/60 ring-1 ring-slate-900/5 overflow-hidden flex flex-col h-full">';
const sumCardReplace = '<div className="bg-white rounded-[1rem] border border-slate-200/80 overflow-hidden flex flex-col h-full">';
code = code.replace(new RegExp(sumCardFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), sumCardReplace);

const sumHFind = '<div className="bg-slate-900 text-white p-4 flex justify-between items-center relative overflow-hidden">';
const sumHReplace = '<div className="bg-transparent p-4 flex justify-between items-center relative border-b border-slate-100 text-slate-800">';
code = code.replace(new RegExp(sumHFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), sumHReplace);

code = code.replace(/<h2 className="text-lg font-bold relative z-10">الخزينة \(النقدية\)<\/h2>/g, '<h2 className="text-base font-semibold relative z-10 flex items-center gap-2"><Wallet size={18}/> ملخص الخزينة (النقدية)</h2>');

const dBalFind = '<div className="text-2xl font-black relative z-10" dir="ltr">{formatNum(summary.actualCash)}</div>';
const dBalReplace = '<div className="text-xl font-bold relative z-10" dir="ltr">{formatNum(summary.actualCash)}</div>';
code = code.replace(new RegExp(dBalFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), dBalReplace);

const diffCardFind = '<div className={`flex items-center justify-between p-3 rounded-xl mb-4 ${summary.difference === 0 ? \'bg-emerald-50 border border-emerald-100 text-emerald-800\' : summary.difference > 0 ? \'bg-amber-50 border border-amber-100 text-amber-800\' : \'bg-rose-50 border border-rose-100 text-rose-800\'}`}>';
const diffCardReplace = '<div className={`flex items-center justify-between p-3 rounded-lg mb-4 text-[14px] font-medium ${summary.difference === 0 ? \'bg-slate-100/50 text-slate-600\' : summary.difference > 0 ? \'bg-blue-50 text-blue-700\' : \'bg-rose-50 text-rose-700\'}`}>';
code = code.replace(new RegExp(diffCardFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), diffCardReplace);


fs.writeFileSync('src/App.tsx', code);
