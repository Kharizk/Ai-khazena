const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
    /className=\{\`min-h-screen pb-24 md:pb-0 bg-\[#f4f7fa\] text-slate-800 font-sans selection:bg-\[#015941\]\/20 selection:text-\[#015941\][^`]*\`}/g,
    'className={`min-h-screen pb-24 md:pb-0 bg-[var(--app-bg)] text-slate-800 font-sans selection:bg-blue-200 selection:text-blue-900 ${printView !== \'none\' ? \'print:bg-white\' : \'\'}`}'
);

fs.writeFileSync('src/App.tsx', code);
console.log('Main app wrapper updated');
