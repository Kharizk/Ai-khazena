const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Fix extraList table classes
code = code.replace('className="w-full text-center text-xs border-separate border-spacing-0"', 'className="w-full text-center text-xs border-separate border-spacing-0 bg-white rounded-2xl overflow-hidden shadow-sm border border-[#e2e8f0]"');

// Fix highlight orange
code = code.replace(/bg-orange-400/g, 'bg-[#ffedd5] text-[#f97316]');

// Make sure the bottom left numbers also look like bento cards
code = code.replace('className="border border-[#e2e8f0] w-16"', 'className="border border-[#e2e8f0] w-16 rounded-lg shadow-sm bg-white"');
code = code.replace('className="bg-[#f8fafc] text-[#1e293b] text-center py-1"', 'className="bg-[#f8fafc] text-[#1e293b] text-center py-2 rounded-lg shadow-sm border border-[#e2e8f0]"');
code = code.replace('className="text-center py-1"', 'className="text-center py-2 rounded-lg shadow-sm border border-[#e2e8f0] bg-white"');

fs.writeFileSync('src/App.tsx', code);
