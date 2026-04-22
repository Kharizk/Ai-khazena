const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace card structural classes globally
content = content.replace(/bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6/g, 'bg-white/95 backdrop-blur-2xl rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 overflow-hidden mb-6');

// Replace modal overlay and content
content = content.replace(/className="fixed inset-0 bg-slate-900\/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 bg-opacity-75 transition-opacity"/g, 'className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all"');
content = content.replace(/className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all"/g, 'className="bg-white/95 backdrop-blur-2xl border border-white/50 rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] w-full max-w-md overflow-hidden transform transition-all ring-1 ring-slate-900/5"');
content = content.replace(/className="w-full bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col"/g, 'className="w-full bg-white/95 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white/60 overflow-hidden flex flex-col ring-1 ring-slate-900/5"');

// Tweak generic empty states
content = content.replace(/className="text-center py-6 text-slate-500"/g, 'className="text-center py-12 text-slate-400 font-medium"');

fs.writeFileSync('src/App.tsx', content);
console.log('Styles updated.');
