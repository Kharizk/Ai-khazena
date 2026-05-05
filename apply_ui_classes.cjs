const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Instead of complex CSS replacements, let's inject a global wrapper class or just let index.css do the heavy lifting.
// Let's replace the top level container padding and background
code = code.replace(/className="min-h-screen.*?"/g, 'className="min-h-screen bg-[var(--app-bg)] text-[#1a1c29] p-4 sm:p-6 lg:p-8 selection:bg-blue-200"');

// Fix primary buttons where it's safe to just inject "btn-primary" 
// (assuming we define it in index.css)
code = code.replace(/className="[^"]*bg-blue-600 hover:bg-blue-700 text-white[^"]*"/g, (match) => {
    return match.replace(/className="/, 'className="btn-primary ');
});

code = code.replace(/className="[^"]*bg-emerald-600 hover:bg-emerald-700 text-white[^"]*"/g, (match) => {
    return match.replace(/className="/, 'className="btn-success ');
});

// Update standard cards
code = code.replace(/className="[^"]*bg-white rounded-xl shadow-sm[^"]*"/g, (match) => {
    return match.replace(/className="/, 'className="pro-card ');
});

// Update tables container
code = code.replace(/className="[^"]*bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200[^"]*"/g, (match) => {
    return match.replace(/className="/, 'className="pro-table-container ');
});

fs.writeFileSync('src/App.tsx', code);
console.log('Applied UI/UX Pro Max specific safe classes to App.tsx');
