const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Fix branch selection visibility
code = code.replace(
  /<div className="hidden md:flex items-center gap-2">\s*<select\s+value=\{currentBranchId/g,
  '<div className="flex items-center gap-2 max-w-[130px] sm:max-w-xs">\n                      <select value={currentBranchId'
);

// 2. Fix Analytics chart visibility for 1 day
code = code.replace(/dailyMetrics\.length >= 2/g, 'dailyMetrics.length >= 1');
code = code.replace(/نحتاج إلى تسجيل يومين على الأقل لرسم مخطط المقارنة البياني للمبيعات\./g, 'لا توجد مبيعات مسجلة حتى الآن.');

// 3. Add Clock component and Signature
const clockComponent = `
const LiveClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex flex-col items-center justify-center bg-slate-50/80 backdrop-blur border border-slate-200/60 px-3 md:px-4 py-1.5 md:py-2 rounded-2xl shadow-sm text-center min-w-[90px]">
      <span className="text-xs md:text-sm font-bold text-slate-800 tabular-nums tracking-tight font-mono" dir="ltr">
        {time.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="text-[9px] md:text-[10px] font-bold text-blue-600 mt-0.5">
        {time.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
      </span>
    </div>
  );
};
`;

code = code.replace(/const App = \(\) => {/g, clockComponent + '\nconst App = () => {');

// Inject the clock in the header, left side (in RTL, left is end)
code = code.replace(
  /<div className="flex items-center gap-2 md:gap-3 justify-end">/g,
  '<div className="flex items-center gap-2 md:gap-3 justify-end">\n              <div className="hidden sm:block"><LiveClock /></div>'
);

// We should also put it on Mobile inside the dashboard or something, but the header might be tight.
// Let's also add it in the top of the Summary Dashboard since that's prominent.
code = code.replace(
  /([^>]*)(<SummaryDashboard state=\{state\} summary=\{currentSummary\} isExport=\{isExporting\} \/>)/,
  '$1<div className="sm:hidden mb-4 flex justify-center"><LiveClock /></div>\n              $2'
);

// 4. Add the user's signature to the bottom of the App
const signature = `
      {/* Signature */}
      <div className="py-6 text-center text-slate-400 text-xs font-medium print:hidden">
        تم التطوير بواسطة <span className="font-bold text-blue-600">Eng. Kareem Rizk</span> &copy; {new Date().getFullYear()}
      </div>
      
    </div>
  );
};

export default App;
`;

code = code.replace(/\s*<\/div>\s*<\/div>\s*\);\s*};\s*export default App;/g, signature);


fs.writeFileSync('src/App.tsx', code);
console.log('User requests applied: branch visibility, analytics, clock, signature.');
