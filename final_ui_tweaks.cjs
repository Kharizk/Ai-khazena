const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/bg-slate-50\/50 bg-\[url\('https:\/\/www.transparenttextures.com\/patterns\/cubes.png'\)\]/g, 'bg-transparent');

// While we are at it, let's fix tables padding and border. UI/UX pro max style "clean lines" and "spacious"
code = code.replace(/<td\s+className="([^"]*?)py-2/g, '<td className="$1py-4');
code = code.replace(/<th\s+className="([^"]*?)py-2/g, '<th className="$1py-5');

// Make text slightly larger and more modern
code = code.replace(/text-sm/g, 'text-[15px]');

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx final UI tweaks done');
