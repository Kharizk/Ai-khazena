const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace remaining border-black instances
code = code.replace(/border-black/g, 'border-[#e2e8f0]');

// Replace any remaining bg-yellow-400
code = code.replace(/bg-yellow-400/g, 'bg-[#f8fafc] text-[#1e293b]');

// Replace bg-yellow-200
code = code.replace(/bg-yellow-200/g, 'bg-[#f1f5f9]');

// Replace bg-gray-50
code = code.replace(/bg-gray-50/g, 'bg-[#f8fafc]');

// Replace bg-gray-100
code = code.replace(/bg-gray-100/g, 'bg-[#f8fafc]');

// Replace bg-gray-200
code = code.replace(/bg-gray-200/g, 'bg-[#f1f5f9]');

fs.writeFileSync('src/App.tsx', code);
