const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace standard cards
code = code.replace(/bg-white\s+(p-\d+\s+)?(?:md:)?rounded-[2-3]xl\s+shadow-(sm|md|xl|2xl)\s+border\s+border-slate-200(\/60)?/g, 'bg-white/90 backdrop-blur-2xl $1 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/80 ring-1 ring-slate-900/5');

// Second pass for remaining
code = code.replace(/bg-white\s+(?:md:)?rounded-[2-3]xl\s+shadow-(sm|md|xl|2xl)/g, 'bg-white/90 backdrop-blur-2xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/80 ring-1 ring-slate-900/5');

// Fix the body min-h-screen background explicitly in App.tsx
code = code.replace(/bg-\[var\(--app-bg\)\]/g, "bg-slate-50/50 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]");

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx classes updated');
