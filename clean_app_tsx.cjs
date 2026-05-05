const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// The global styles for tables, inputs, buttons are now in index.css. 
// We should remove explicit inline classes that break the elegance.

// 1. Remove border-2 border-black from all tables / divs
code = code.replace(/border-2 border-black/g, '');
code = code.replace(/border border-black/g, '');
code = code.replace(/border-gray-900/g, 'border-slate-800');

// 2. Adjust backgrounds that are harsh
code = code.replace(/bg-yellow-400/g, 'bg-white'); // Top header was yellow
code = code.replace(/bg-gray-100/g, 'bg-slate-50'); 
code = code.replace(/bg-gray-200/g, 'bg-slate-100'); 
code = code.replace(/bg-gray-50/g, 'bg-slate-50/50'); 

// 3. Make all input fields just use global style
code = code.replace(/className="[^"]*border border-gray-300 rounded p-1[^"]*"/g, 'className="w-full"');
code = code.replace(/className="[^"]*border rounded p-1 w-full[^"]*"/g, 'className="w-full"');
code = code.replace(/border border-gray-300 p-2 rounded/g, 'w-full');

// 4. Transform main rounded structures
code = code.replace(/rounded-lg/g, 'rounded-xl');

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx cleanup completed');
