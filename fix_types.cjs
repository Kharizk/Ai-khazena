const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Fix type error for isHistoricalDay
code = code.replace(/return \{(\s*dateStr: state.date,)/, 'return {\n      isHistoricalDay: false,\n      historicalId: \'\',$1');

// Fix type error for months on unknown
code = code.replace(/\{Object\.values\(yearlyAgg\)\.reverse\(\)\.map\(\(yearData: any\) => \(/g, '{Object.values(yearlyAgg as Record<string, any>).reverse().map((yearData: any) => (');

// Fix dir="ltr" on BarChart (Recharts doesn't support 'dir' prop directly on BarChart)
code = code.replace(/<BarChart data=\{([^}]+)\} margin=\{([^}]+)\} dir="ltr">/g, '<BarChart data={$1} margin={$2}>');
code = code.replace(/<LineChart data=\{([^}]+)\} margin=\{([^}]+)\} dir="ltr">/g, '<LineChart data={$1} margin={$2}>');

// Fix missing properties handling when checking for type matching
code = code.replace(/const summaryToSave = \{[\s\S]*?id: generateId\(\),\s*type: 'day',/g, match => match.replace(/'day'/, "'day' as 'day'"));

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx types fixed');
