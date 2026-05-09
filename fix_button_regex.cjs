const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/<button onClick=\{\(\) => setActiveTab\('admin'\)\}.*?<\/button>/s, 
  '<button onClick={() => setShowSettingsModal(true)} className="inline-flex items-center gap-2 bg-slate-800 text-white px-6 py-3 rounded-xl hover:bg-slate-900 transition-all font-bold shadow-sm active:scale-95"><Settings size={18} /> فتح الإعدادات وإدارة الفروع</button>'
);

fs.writeFileSync('src/App.tsx', code);
console.log('Regex replace complete');
