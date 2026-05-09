const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Top bar calculator, settings, logout buttons
const iconsTarget = `<button onClick={() => setShowCalculator(true)} className={\`flex items-center justify-center w-9 h-9 rounded-md transition-colors active:scale-95 \${showCalculator ? 'bg-slate-200/60 text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'}\`} title="آلة حاسبة">
                    <Calculator size={18} strokeWidth={2} />
                  </button>
                  <button onClick={() => setShowSettingsModal(true)} className="flex items-center justify-center text-slate-600 hover:text-slate-900 w-9 h-9 rounded-md hover:bg-slate-100/80 transition-colors active:scale-95" title="إعدادات">
                    <Settings size={18} strokeWidth={2} />
                  </button>
                  <button onClick={handleLogout} className="flex items-center justify-center text-slate-600 hover:text-rose-600 w-9 h-9 rounded-md hover:bg-rose-50 transition-colors active:scale-95" title="تسجيل الخروج">
                    <LogOut size={18} strokeWidth={2} />
                  </button>`;

const iconsReplace = `<button onClick={() => setShowCalculator(true)} className={\`flex items-center justify-center w-10 h-10 rounded-full transition-colors active:scale-95 \${showCalculator ? 'bg-slate-200/80 text-slate-900' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}\`} title="آلة حاسبة">
                    <Calculator size={20} strokeWidth={1.5} />
                  </button>
                  <button onClick={() => setShowSettingsModal(true)} className="flex items-center justify-center text-slate-500 hover:text-slate-800 w-10 h-10 rounded-full hover:bg-slate-100 transition-colors active:scale-95" title="إعدادات">
                    <Settings size={20} strokeWidth={1.5} />
                  </button>
                  <button onClick={handleLogout} className="flex items-center justify-center text-slate-500 hover:text-rose-600 w-10 h-10 rounded-full hover:bg-rose-50 transition-colors active:scale-95" title="تسجيل الخروج">
                    <LogOut size={20} strokeWidth={1.5} />
                  </button>`;
code = code.replace(iconsTarget, iconsReplace);

// Main actions
const checkSaveTarget = `<button onClick={handleSave} disabled={saving} className={\`flex items-center gap-1.5 px-4 py-2 text-[15px] rounded-md transition-all font-medium disabled:opacity-50 active:scale-95 \${saving ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}\`}>
                    {saving ? <Save size={18} className="animate-pulse" /> : <CheckCircle2 size={18} />}
                    <span className="hidden sm:inline">{saving ? 'جاري الحفظ...' : 'صافي وحفظ'}</span>
                  </button>`;
const checkSaveReplace = `<button onClick={handleSave} disabled={saving} className={\`flex items-center gap-2 px-4 py-2 text-[14px] rounded-full transition-all font-medium disabled:opacity-50 active:scale-95 \${saving ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}\`}>
                    {saving ? <Save size={16} className="animate-pulse" strokeWidth={2} /> : <CheckCircle2 size={16} strokeWidth={2} />}
                    <span className="hidden sm:inline">{saving ? 'جاري الحفظ...' : 'حفظ'}</span>
                  </button>`;
code = code.replace(checkSaveTarget, checkSaveReplace);


const printBtnTarget = `<button onClick={() => setShowExportModal(true)} className="flex items-center gap-1.5 bg-white text-slate-700 border border-slate-200/80 px-3 py-1.5 text-[15px] rounded-lg hover:bg-slate-50 transition-all font-bold shadow-sm hover:shadow-md active:scale-95">
                <Printer size={18} /> <span className="hidden sm:inline">طباعة / تصدير</span>
              </button>`;
const printBtnReplace = `<button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-4 py-2 text-[14px] rounded-full hover:bg-slate-50 transition-all font-medium active:scale-95">
                <Printer size={16} strokeWidth={2} /> <span className="hidden sm:inline">تصدير</span>
              </button>`;
code = code.replace(printBtnTarget, printBtnReplace);

const newDayBtnTarget = `<button onClick={handleNewDay} className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 text-[15px] rounded-lg hover:bg-indigo-700 transition-all font-bold shadow-sm hover:shadow-md active:scale-95 shadow-indigo-600/20 ring-1 ring-indigo-500/50">
                <FilePlus size={18} /> <span className="hidden sm:inline">يوم جديد</span>
              </button>`;
const newDayBtnReplace = `<button onClick={handleNewDay} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 text-[14px] rounded-full hover:bg-blue-700 transition-all font-medium active:scale-95 flex-nowrap shrink-0 max-w-fit">
                <FilePlus size={16} strokeWidth={2} /> <span className="hidden sm:inline">يوم جديد</span>
              </button>`;
code = code.replace(newDayBtnTarget, newDayBtnReplace);

fs.writeFileSync('src/App.tsx', code);
