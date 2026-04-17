const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Main container
code = code.replace('className="min-h-screen bg-white p-4 text-sm"', 'className="min-h-screen bg-[#f5f7fa] p-6 text-[#1e293b] text-sm"');

// 2. Header
code = code.replace('className="bg-yellow-400 font-bold text-xl px-16 py-2 border-2 border-black"', 'className="bg-white text-[#2563eb] font-bold text-xl px-8 py-4 rounded-2xl border border-[#e2e8f0] shadow-sm"');

// 3. Grid gap
code = code.replace('className="grid grid-cols-1 lg:grid-cols-4 gap-4"', 'className="grid grid-cols-1 lg:grid-cols-4 gap-6"');

// 4. Tables
code = code.replace(/className="w-full border-collapse border-2 border-black/g, 'className="w-full border-separate border-spacing-0 bg-white rounded-2xl overflow-hidden shadow-sm border border-[#e2e8f0]');

// 5. Table cells
code = code.replace(/border border-black/g, 'border border-[#e2e8f0]');

// 6. Specific background colors
code = code.replace(/bg-yellow-400/g, 'bg-[#f8fafc] text-[#1e293b]');
code = code.replace(/bg-yellow-200/g, 'bg-[#f1f5f9]');
code = code.replace(/bg-gray-100/g, 'bg-[#f8fafc]');
code = code.replace(/bg-gray-200/g, 'bg-[#f1f5f9]');
code = code.replace(/bg-gray-50/g, 'bg-[#f8fafc]');
code = code.replace(/bg-green-200/g, 'bg-[#dcfce7] text-[#166534]');
code = code.replace(/bg-green-100/g, 'bg-[#dcfce7]');
code = code.replace(/bg-green-50/g, 'bg-[#f0fdf4]');
code = code.replace(/bg-red-50/g, 'bg-[#fef2f2]');
code = code.replace(/bg-blue-50/g, 'bg-[#eff6ff]');
code = code.replace(/bg-blue-100/g, 'bg-[#dbeafe]');
code = code.replace(/bg-orange-100/g, 'bg-[#ffedd5]');
code = code.replace(/bg-orange-200/g, 'bg-[#fed7aa]');

// 7. Text colors
code = code.replace(/text-purple-800/g, 'text-[#64748b]');
code = code.replace(/text-red-600/g, 'text-[#ef4444]');
code = code.replace(/text-green-600/g, 'text-[#22c55e]');
code = code.replace(/text-green-700/g, 'text-[#15803d]');
code = code.replace(/text-blue-600/g, 'text-[#3b82f6]');
code = code.replace(/text-orange-600/g, 'text-[#f97316]');

// 8. Add padding to table cells to make them breathe more like Bento cards
code = code.replace(/py-1/g, 'py-2 px-2');
code = code.replace(/h-6/g, 'h-8');
code = code.replace(/h-8/g, 'h-10');

// 9. Fix border-collapse on other tables
code = code.replace(/border-collapse/g, 'border-separate border-spacing-0');

fs.writeFileSync('src/App.tsx', code);
