const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const posCardFind = 'className="bg-white/95 backdrop-blur-2xl rounded-2xl sm:rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 overflow-hidden mb-6"';
const posCardReplace = 'className="bg-white rounded-[1rem] shadow-sm border border-slate-200/60 overflow-hidden mb-6 transition-all"';
code = code.replace(new RegExp(posCardFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), posCardReplace);

// Same for cash Tab
const cashCardFind = 'className="bg-white/95 backdrop-blur-2xl rounded-2xl sm:rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 overflow-hidden mb-6"';
code = code.replace(new RegExp(cashCardFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), posCardReplace);

// same for History, Ledger
code = code.replace(/className="bg-white\/95 backdrop-blur-2xl rounded-2xl sm:rounded-\[1\.5rem\] shadow-\[0_4px_24px_rgba\(0,0,0,0\.02\)\] border border-slate-200\/60 overflow-hidden mb-6"/g, posCardReplace);

// Check if any old appWrapper is still there
code = code.replace(/className="bg-white\/95 backdrop-blur-2xl rounded-2xl sm:rounded-\[1\.5rem\] shadow-\[0_4px_24px_rgba\(0,0,0,0\.02\)\] border border-slate-200\/60 overflow-hidden mb-6 flex flex-col"/g, 'className="bg-white rounded-[1rem] shadow-sm border border-slate-200/60 overflow-hidden mb-6 transition-all flex flex-col"');

fs.writeFileSync('src/App.tsx', code);
