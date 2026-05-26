const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const tabs = [
  { id: 'sales', name: 'Sales Tab', next: 'Payments Tab', printClass: 'print:block mb-6' },
  { id: 'payments', name: 'Payments Tab', next: 'Pending Funds Tab', printClass: 'print:block mb-6' },
  { id: 'pending', name: 'Pending Funds Tab', next: 'Cash Count Tab', printClass: 'print:block mb-6' },
  { id: 'cash', name: 'Cash Count Tab', next: 'History Tab', printClass: 'print:block mb-6' }
];

tabs.forEach(tab => {
  const searchStr = `className={\`\$\{activeTab === '${tab.id}' || (isExporting && exportMode === 'detailed') ? 'block' : 'hidden'} ${tab.printClass}\`}`;
  
  if (code.includes(searchStr)) {
    code = code.replace(searchStr, `className="${tab.printClass}"`);
    
    // add condition at start
    const commentFull = `{/* ${tab.name} */}`;
    code = code.replace(
      `${commentFull}\n                <div className="${tab.printClass}">`, 
      `${commentFull}\n                { (activeTab === '${tab.id}' || (isExporting && exportMode === 'detailed')) && (<div className="${tab.printClass}">`
    );
    
    // add closing brace before the NEXT tab's comment
    const nextComment = `{/* ${tab.next} */}`;
    code = code.replace(
      `</div>\n\n              ${nextComment}`,
      `</div>\n              )}\n\n              ${nextComment}`
    );
  }
});

fs.writeFileSync('src/App.tsx', code);
console.log('Done');
