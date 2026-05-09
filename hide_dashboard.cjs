const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');

const targetStr = `          {/* Right Column: Sticky Summary Dashboard */}
          <div className="w-full lg:w-80 xl:w-96 shrink-0 print:w-full">
            <div className={\`sticky top-20 flex flex-col gap-4 \${isExporting ? '' : 'max-h-[calc(100vh-6rem)] overflow-y-auto'} pb-4 scrollbar-hide\`}>
              <div className="sm:hidden mb-4 flex justify-center"><LiveClock /></div>
              <SummaryDashboard state={state} summary={currentSummary} isExport={isExporting} />
            </div>
          </div>`;

const replaceStr = `          {/* Right Column: Sticky Summary Dashboard */}
          {(!userProfile || userProfile.role !== 'admin' || currentBranchId) && (
            <div className="w-full lg:w-80 xl:w-96 shrink-0 print:w-full">
              <div className={\`sticky top-20 flex flex-col gap-4 \${isExporting ? '' : 'max-h-[calc(100vh-6rem)] overflow-y-auto'} pb-4 scrollbar-hide\`}>
                <div className="sm:hidden mb-4 flex justify-center"><LiveClock /></div>
                <SummaryDashboard state={state} summary={currentSummary} isExport={isExporting} />
              </div>
            </div>
          )}`;

code = code.replace(targetStr, replaceStr);

fs.writeFileSync('src/App.tsx', code);
console.log('Summary dashboard hidden when no branch selected');
