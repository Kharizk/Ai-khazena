const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const injectStart = `              <div className="print:block">
                {userProfile?.role === 'admin' && !currentBranchId && activeTab !== 'admin' && activeTab !== 'settings' ? (
                  <div className="bg-white/90 backdrop-blur-2xl rounded-[2rem] shadow-xl border border-blue-100/60 p-8 sm:p-12 mb-8 text-center mt-4">
                    <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-blue-100/50">
                       <Database size={48} />
                    </div>
                    <h2 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">اختر الفرع للبدء</h2>
                    <p className="text-slate-600 font-medium text-base mb-10 max-w-xl mx-auto leading-relaxed">بصفتك مديراً للنظام، يجب عليك اختيار الفرع الذي تود استعراض أو إدخال بيانات الخزينة والمبيعات الخاصة به.</p>
                    
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
                      <select 
                        value=""
                        onChange={(e) => {
                          setCurrentBranchId(e.target.value || null);
                          if (e.target.value) {
                            loadBranchData(e.target.value);
                          }
                        }}
                        className="bg-slate-50 border-2 border-blue-200 text-blue-900 text-lg rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 block w-full sm:w-[400px] px-6 py-4 outline-none font-bold shadow-sm transition-all hover:bg-white hover:border-blue-300 cursor-pointer"
                      >
                        <option value="" disabled>-- الرجاء الضغط لاختيار الفرع --</option>
                        {branches.filter(b => !b.deleted).map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    {branches.length === 0 && (
                       <p className="text-rose-500 font-bold mb-4 bg-rose-50 p-3 rounded-xl inline-block">لا توجد فروع مضافة في النظام حالياً. يرجى إضافة فروع من الإعدادات ⚙️</p>
                    )}
                    
                    <div className="mt-10 pt-8 border-t border-slate-100">
                      <p className="text-sm text-slate-500 mb-4">أو يمكنك إدارة النظام والنسخ الاحتياطي عبر قائمة الإعدادات العلوية</p>
                    </div>
                  </div>
                ) : (
                <>
                {/* Sales Tab */}`;

code = code.replace(`              <div className="print:block">\n                {/* Sales Tab */}`, injectStart);

const injectEnd = `              {/* Analytics Tab */}
              <div className={\`\${activeTab === 'analytics' && !isExporting ? 'block' : 'hidden'} print:hidden\`}>
                <AnalyticsView history={history} currentState={state} formatNum={formatNum} onUpdate={setState} />
              </div>
              </>
              )}`;

code = code.replace(`              {/* Analytics Tab */}
              <div className={\`\${activeTab === 'analytics' && !isExporting ? 'block' : 'hidden'} print:hidden\`}>
                <AnalyticsView history={history} currentState={state} formatNum={formatNum} onUpdate={setState} />
              </div>`, injectEnd);

fs.writeFileSync('src/App.tsx', code);
console.log('Successfully injected Admin Screen wrapper');
