const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// The sticky header currently has centered logo:
// className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2.5"

const originalHeaderPattern = /<div className="flex justify-between items-center h-16 sm:h-\[4\.5rem\] relative">[\s\S]*?{setPrintView\('thermal'\)}/m;

// Not safe to match it perfectly over 100 lines. Let's just do targeted replacements.
// Remove the absolute centering classes
code = code.replace(
    /<div className="absolute left-1\/2 top-1\/2 -translate-x-1\/2 -translate-y-1\/2 flex items-center gap-2\.5">/g,
    '<div className="flex items-center gap-2.5">' // RTL puts this implicitly, but wait! it was between left and right items.
);

// Actually, in the flex header, the left/right parts are w-1/3. Let's change them to take what they need.
code = code.replace(
  /<div className="flex items-center gap-3 w-1\/3">/g,
  '<div className="flex items-center gap-3">'
);
code = code.replace(
  /<div className="flex items-center justify-end gap-1\.5 md:gap-2 w-1\/3">/g,
  '<div className="flex items-center gap-1.5 md:gap-2 ml-auto">' // ml-auto pushes it to the right (left visually in RTL)
);


fs.writeFileSync('src/App.tsx', code);
console.log('Header layout updated');
