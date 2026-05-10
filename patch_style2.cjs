const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Refine <Input> to be more minimalist and less "rounded-xl/heavy shadow"
const inputFind = 'className={`w-full bg-slate-50 hover:bg-slate-100/50 border text-slate-800 border-slate-200/80 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 outline-none focus:ring-[3px] focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all text-[15px] placeholder-slate-400 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] ${type === \'number\' ? \'[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none\' : \'\'} ${className}`';
const inputReplace = 'className={`w-full bg-slate-50/50 hover:bg-slate-100/30 border text-slate-800 border-slate-200/60 rounded-lg px-3 py-2 outline-none focus:ring-[3px] focus:ring-slate-900/5 focus:border-slate-400 focus:bg-white transition-all text-[14px] placeholder-slate-400 ${type === \'number\' ? \'[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none\' : \'\'} ${className}`';
code = code.replace(inputFind, inputReplace);

// 2. Refine DynamicTable wrapper
const dtFind = 'className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 overflow-hidden mb-6 transition-all duration-300 hover:shadow-md"';
const dtReplace = 'className="bg-white rounded-[1rem] shadow-sm border border-slate-200/60 overflow-hidden mb-6 transition-all"';
code = code.replace(dtFind, dtReplace);

// 3. Search input in DynamicTable
const searchInputFind = 'className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white transition-all placeholder-slate-400"';
const searchInputReplace = 'className="w-full pl-3 pr-10 py-2 bg-slate-50/50 border border-slate-200/60 rounded-lg text-[13px] focus:outline-none focus:ring-[3px] focus:ring-slate-900/5 focus:border-slate-400 focus:bg-white transition-all placeholder-slate-400"';
code = code.replace(searchInputFind, searchInputReplace);

// 4. Input overrides in DynamicTable rows
code = code.replace(/className="group-hover\/row:border-blue-200\/60 rounded-xl"/g, 'className="group-hover/row:border-slate-300/60 !rounded-lg"');
code = code.replace(/className="text-left font-bold group-hover\/row:border-blue-200\/60 rounded-xl"/g, 'className="text-left font-semibold group-hover/row:border-slate-300/60 !rounded-lg"');

// 5. App layout wrapper
const appWrapperFind = 'className="bg-white/95 backdrop-blur-2xl rounded-2xl sm:rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 overflow-hidden mb-6"';
const appWrapperReplace = 'className="bg-white rounded-[1.2rem] shadow-sm border border-slate-200/60 overflow-hidden mb-6 flex flex-col"';
code = code.replace(new RegExp(appWrapperFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), appWrapperReplace);


// 6. Action buttons (Add new item, Add point of sale)
const addBtn1Find = 'className="flex items-center justify-center gap-2 w-full text-blue-600 hover:text-blue-800 text-[15px] font-bold px-4 py-3 rounded-xl border-2 border-dashed border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-95 group/btn"';
const addBtn1Replace = 'className="flex items-center justify-center gap-2 w-full text-slate-600 hover:text-slate-900 text-[14px] font-medium px-4 py-2.5 rounded-lg border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition-all active:scale-95 group/btn"';
code = code.replace(addBtn1Find, addBtn1Replace);

const addBtn2Find = 'className="mt-4 flex items-center gap-2 bg-blue-50 text-blue-700 hover:text-blue-800 hover:bg-blue-100 text-[15px] font-bold px-4 py-2.5 rounded-xl border border-blue-100 shadow-sm transition-all active:scale-95"';
const addBtn2Replace = 'className="mt-4 flex items-center gap-2 bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-100/80 text-[14px] font-medium px-4 py-2 rounded-lg transition-all active:scale-95"';
code = code.replace(new RegExp(addBtn2Find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), addBtn2Replace);

// 7. Global background colors and tab styles
// We want activeTab styling to be more neutral
const tabStyleFind = "activeTab === tab.id ? 'text-slate-900 bg-slate-100/80 shadow-sm border border-slate-200/60' : 'bg-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'";
const tabStyleReplace = "activeTab === tab.id ? 'text-slate-900 bg-white shadow-sm border border-slate-200/80' : 'bg-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'";
code = code.replace(tabStyleFind, tabStyleReplace);


fs.writeFileSync('src/App.tsx', code);
