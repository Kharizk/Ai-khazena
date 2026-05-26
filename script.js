const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace history tab
code = code.replace(
  /<div className=\{\`\$\{activeTab === 'history' && !isExporting \? 'block' : 'hidden'\} print:hidden\`\}>/g, 
  "{ (activeTab === 'history' && !isExporting) && (<div className=\"print:hidden\">"
);
// We need to find the exact end of History tab to close the brace
// It ends right before {/* Ledger Tab */}
code = code.replace(
  /<\/div>\n\n              \{\/\* Ledger Tab \*\/\}/g,
  "</div>\n              )}\n\n              {/* Ledger Tab */}"
);


// Replace ledger tab
code = code.replace(
  /<div className=\{\`\$\{activeTab === 'ledger' && !isExporting \? 'block' : 'hidden'\} print:hidden\`\}>/g, 
  "{ (activeTab === 'ledger' && !isExporting) && (<div className=\"print:hidden\">"
);
// Ends right before {/* Archive Tab */}
code = code.replace(
  /<\/div>\n\n              \{\/\* Archive Tab \*\/\}/g,
  "</div>\n              )}\n\n              {/* Archive Tab */}"
);


// Replace archive tab
code = code.replace(
  /<div className=\{\`\$\{activeTab === 'archive' && !isExporting \? 'block' : 'hidden'\} print:block\`\}>/g, 
  "{ (activeTab === 'archive' && !isExporting) && (<div className=\"print:block\">"
);
// Ends right before {/* Analytics Tab */}
code = code.replace(
  /<\/div>\n\n              \{\/\* Analytics Tab \*\/\}/g,
  "</div>\n              )}\n\n              {/* Analytics Tab */}"
);

// Replace analytics tab
code = code.replace(
  /<div className=\{\`\$\{activeTab === 'analytics' && !isExporting \? 'block' : 'hidden'\} print:hidden\`\}>/g, 
  "{ (activeTab === 'analytics' && !isExporting) && (<div className=\"print:hidden\">"
);
// Ends right before </>\n              )}
code = code.replace(
  /<AnalyticsView history=\{history\} currentState=\{state\} formatNum=\{formatNum\} onUpdate=\{setState\} \/>\n              <\/div>\n              <\/>/g,
  "<AnalyticsView history={history} currentState={state} formatNum={formatNum} onUpdate={setState} />\n              </div>\n              )}\n              </>"
);

fs.writeFileSync('src/App.tsx', code);
console.log('Done replacement');
