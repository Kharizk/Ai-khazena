const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');

const targetStr = `        {(!isExporting || exportMode === 'detailed') && (
          <div className="bg-white/90 backdrop-blur-md px-4 sm:px-5 py-5 rounded-2xl sm:rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 mb-8 flex flex-wrap gap-8 items-center print:hidden">`;

const replaceStr = `        {(!isExporting || exportMode === 'detailed') && (!userProfile || userProfile.role !== 'admin' || currentBranchId) && (
          <div className="bg-white/90 backdrop-blur-md px-4 sm:px-5 py-5 rounded-2xl sm:rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 mb-8 flex flex-wrap gap-8 items-center print:hidden">`;

code = code.replace(targetStr, replaceStr);

fs.writeFileSync('src/App.tsx', code);
console.log('Hidden top date banner');
