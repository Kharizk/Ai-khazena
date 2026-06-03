
const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(
  '<h2 style="font-size: 20px; font-weight: bold; color: #000; margin: 0;"></h2>',
  '<h2 style="font-size: 20px; font-weight: bold; color: #000; margin: 0;">\</h2>'
);
fs.writeFileSync('src/App.tsx', code);
