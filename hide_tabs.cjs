const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');

const targetStr = `              {!isExporting && (
                <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-2xl border-t border-slate-200 p-2`;

const replaceStr = `              {(!isExporting && (!userProfile || userProfile.role !== 'admin' || currentBranchId)) && (
                <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-2xl border-t border-slate-200 p-2`;

code = code.replace(targetStr, replaceStr);

fs.writeFileSync('src/App.tsx', code);
console.log('Hidden tabs wrapper when no branch');
