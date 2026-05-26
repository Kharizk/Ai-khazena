const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// The main layout background container around line 3154
code = code.replace(
  /className=\{\`min-h-screen pb-24 md:pb-0 bg-transparent[^\`]*?\`\}/g,
  'className={`min-h-screen pb-24 md:pb-0 bg-[#f4f4f6] text-slate-800 dark:bg-slate-900 dark:text-slate-200 font-sans selection:bg-brand-100 selection:text-brand-900 print:text-black ${printView !== "none" ? "print:bg-white dark:bg-slate-900" : ""} `}'
);

// The sticky header
code = code.replace(
  /className=\"sticky top-0 z-50 bg-white dark:bg-slate-900[^\"]*?\"/,
  'className="sticky top-0 z-50 bg-[#354a5f] text-white print:hidden transition-all shadow-md"'
);

// Update some elements in the header to look right on dark blue bg
// Arrow left button:
code = code.replace(
  /className=\"w-10 h-10 flex items-center justify-center bg-slate-100[^\"]*?\"/g,
  'className="w-10 h-10 flex items-center justify-center hover:bg-white/10 text-white rounded-[3px] transition-all"'
);

// Logo container bg
code = code.replace(
  /className=\"flex items-center gap-2\.5 bg-slate-50[^\"]*?\"/g,
  'className="flex items-center gap-2.5 px-3 py-1.5"'
);

// Text colors inside header
code = code.replace(
  /className=\"font-extrabold text-\[\#000000\] (.*?)\"/g,
  'className="font-normal text-white $1"'
);
code = code.replace(
  /className=\"text-srb-main font-bold (.*?)\"/g,
  'className="text-white font-normal $1"'
);
code = code.replace(
  /className=\"text-\[9px\] md:text-\[10px\] text-slate-500 dark:text-slate-400 font-medium\"/g,
  'className="text-[9px] md:text-[10px] text-brand-100 font-normal"'
);

// Buttons in header, like "Login"
// From: bg-gradient-to-r from-[#015941] to-[#128a63]
code = code.replace(
  /bg-gradient-to-r from-\[\#015941\] to-\[\#128a63\][^\"]*?\"/g,
  'btn-primary"'
);
code = code.replace(/text-slate-600 dark:text-slate-400 hover:text-blue-600/g, 'text-white hover:text-brand-100');
code = code.replace(/text-slate-400 hover:text-slate-600 dark:text-slate-400/g, 'text-white/70 hover:text-white');

// Header icons bg
code = code.replace(/className=\"w-10 h-10 flex items-center justify-center bg-slate-50[^\"]*?\"/g, 'className="w-10 h-10 flex items-center justify-center hover:bg-white/10 text-white rounded-[3px] transition-all"');

// Update UI rounds
code = code.replace(/rounded-\[2rem\]/g, 'rounded-[4px]');
code = code.replace(/rounded-\[1\.5rem\]/g, 'rounded-[4px]');
code = code.replace(/rounded-\[1\.25rem\]/g, 'rounded-[4px]');
code = code.replace(/rounded-3xl/g, 'rounded-[4px]');
code = code.replace(/rounded-2xl/g, 'rounded-[4px]');
code = code.replace(/rounded-xl/g, 'rounded-[4px]');
code = code.replace(/rounded-lg/g, 'rounded-[4px]');
// We shouldn't replace full unless necessary. 

// Replace thick borders and shadows with Pro-Card
code = code.replace(/bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-\[.*?\]/g, 'pro-card');
code = code.replace(/bg-white shadow-sm border border-slate-200 dark:border-slate-800/g, 'pro-card');
code = code.replace(/shadow-sm border border-slate-200 dark:border-slate-800/g, 'pro-card');
code = code.replace(/bg-slate-50 dark:bg-slate-800\/50\/50 border border-slate-200/g, 'pro-card');

// Update Launcher screen to match SAP style
code = code.replace(/bg-black\/10 backdrop-blur-sm/g, 'bg-[#354a5f] text-white');

fs.writeFileSync('src/App.tsx', code);
