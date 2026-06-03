
const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(
  'color: #000; margin: 0;"></h2>',
  'color: #000; margin: 0;">\</h2>'
);
fs.writeFileSync('src/App.tsx', code);
