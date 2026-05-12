import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {ArrowRight, Settings, Trash2, ShieldAlert, Plus, Store, UserCog, Edit2, ChevronDown, Check, Monitor, Printer, ChevronLeft, Building} from "lucide-react";

const SavedNamesManager = ({ savedNames, addSavedName, removeSavedName }: any) => {
  const [activeCategory, setActiveCategory] = useState<string>("expenses");
  const [newName, setNewName] = useState("");

  const categories = [
    { key: "expenses", label: "بنود المصروفات" },
    { key: "companyPayments", label: "دفعات الشركات" },
    { key: "customerTransfers", label: "تحويلات العملاء/المناديب" },
    { key: "expenseRefunds", label: "مردودات المصروفات" },
    { key: "pendingFundsOwedToUs", label: "أسماء أموال لنا" },
    { key: "pendingFundsOwedByUs", label: "أسماء أموال علينا" },
    { key: "cashDeposits", label: "جهات التوريد" },
    { key: "customCashAmounts", label: "فئات كاش مخصصة" },
    { key: "posData", label: "نقاط البيع" }
  ];

  const handleAdd = (e: any) => {
    e.preventDefault();
    if (!newName.trim()) return;
    addSavedName(activeCategory, newName.trim());
    setNewName("");
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 p-4 md:p-6 bg-white dark:bg-slate-900 print:bg-white">
      <div className="md:w-1/3 flex flex-col gap-1">
        {categories.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={"text-right px-4 py-3 rounded-2xl font-semibold text-sm transition-colors " + (activeCategory === cat.key ? "bg-blue-50 text-blue-700" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50")}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="md:w-2/3 flex flex-col">
        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="إضافة اسم جديد..."
            className="flex-1 bg-slate-50 dark:bg-slate-800/50 border-none outline-none focus:ring-2 focus:ring-blue-500 rounded-2xl px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 transition-all"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-2xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            إضافة
          </button>
        </form>

        <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
          {(!savedNames?.[activeCategory] || savedNames[activeCategory].length === 0) ? (
            <div className="text-center py-6 text-slate-400 font-medium">لا توجد أسماء محفوظة.</div>
          ) : (
            (savedNames?.[activeCategory] || []).map((name: string) => (
              <div key={name} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 rounded-2xl transition-colors group">
                <span className="font-semibold text-slate-700 dark:text-slate-300">{name}</span>
                <button
                  onClick={() => removeSavedName(activeCategory, name)}
                  className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-colors opacity-0 md:group-hover:opacity-100 transition-opacity"
                  title="حذف"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export const SettingsModalComponent = ({
  show, onClose,
  companyName, setCompanyName,
  theme, setTheme,
  uiScale, setUiScale,
  thermalMargins, setThermalMargins,
  clearHistory,
  branches, adminUsers,
  handleUpdateBranch, handleDeleteBranch, handleUpdateUser,
  setShowAddBranchModal,
  user, userProfile,
  savedNames, addSavedName, removeSavedName
}: any) => {

  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  const SectionCard = ({ id, icon: Icon, title, subtitle, children, bg = "bg-slate-100 dark:bg-slate-800", text = "text-slate-700 dark:text-slate-300" }: any) => {
    const isExpanded = expandedSection === id;
    
    return (
      <div className="bg-white dark:bg-slate-900 print:bg-white rounded-[1.5rem] overflow-hidden mb-4 shadow-sm transition-all border border-slate-100 dark:border-slate-800">
        <button 
          onClick={() => toggleSection(id)}
          className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-colors text-right"
        >
          <div className="flex items-center gap-4">
            <div className={"w-12 h-12 rounded-full flex items-center justify-center shrink-0 " + bg + " " + text}>
              <Icon size={24} strokeWidth={2} />
            </div>
            <div className="pr-1">
              <h3 className="text-[17px] font-medium text-slate-900 dark:text-white">{title}</h3>
              {subtitle && <p className="text-[13.5px] text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
            </div>
          </div>
          <div className="shrink-0 text-slate-400">
            {isExpanded ? <ChevronDown size={24} /> : <ChevronLeft size={24} />}
          </div>
        </button>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="border-t border-slate-100 dark:border-slate-800">
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} transition={{ duration: 0.3, type: "spring", bounce: 0 }} className="fixed inset-0 z-[100] bg-[#f2f4f7] dark:bg-slate-950 overflow-y-auto print:hidden" dir="rtl">
          
          <div className="sticky top-0 z-30 bg-[#f2f4f7] dark:bg-slate-950/90 backdrop-blur-xl px-4 py-3 sm:py-5 flex items-center shadow-sm">
             <div className="max-w-3xl mx-auto w-full flex items-center gap-4">
                 <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 dark:bg-slate-700 active:bg-slate-300 rounded-full transition-colors text-slate-700 dark:text-slate-300">
                   <ArrowRight size={24} />
                 </button>
                 <h2 className="text-2xl font-medium text-slate-800 dark:text-slate-200">
                   الإعدادات
                 </h2>
             </div>
          </div>
          
          <div className="p-4 pt-2 sm:p-6 max-w-3xl mx-auto pb-24">
             <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3 px-2 mt-4">إعدادات عامة</div>

             <SectionCard id="company" icon={Building} bg="bg-blue-100" text="text-blue-600" title="المؤسسة" subtitle="اسم الشركة وتفاصيل الإيصال">
               <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 print:bg-white">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                     <div className="w-full">
                        <label className="block text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">اسم الشركة / المؤسسة</label>
                        <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800/50 border-none focus:ring-2 focus:ring-blue-500 rounded-xl px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 outline-none transition-all placeholder:font-normal placeholder:text-slate-400" placeholder="اكتب اسم الشركة هنا..." />
                     </div>
                  </div>
               </div>
             </SectionCard>

             <SectionCard id="ui" icon={Monitor} bg="bg-purple-100" text="text-purple-600" title="المظهر" subtitle="حجم واجهة المستخدم، والتكبير، والوضع الليلي">
                <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 print:bg-white flex flex-col gap-6">
                   <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                      <div>
                         <h4 className="font-semibold text-slate-800 dark:text-slate-200">وضع الألوان (Theme)</h4>
                         <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">اختر الوضع المفضل أو اتركه على وضع النظام.</p>
                      </div>
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-2xl w-full sm:w-auto">
                        <button onClick={() => setTheme('light')} className={`flex-1 sm:w-24 py-2 px-3 rounded-xl text-sm font-semibold transition-all ${theme === 'light' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>فاتح</button>
                        <button onClick={() => setTheme('dark')} className={`flex-1 sm:w-24 py-2 px-3 rounded-xl text-sm font-semibold transition-all ${theme === 'dark' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>داكن</button>
                        <button onClick={() => setTheme('system')} className={`flex-1 sm:w-24 py-2 px-3 rounded-xl text-sm font-semibold transition-all ${theme === 'system' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>نظام</button>
                      </div>
                   </div>

                   <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                      <div>
                         <h4 className="font-semibold text-slate-800 dark:text-slate-200">حجم عناصر الخزينة</h4>
                         <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">تكبير أو تصغير الأزرار والنصوص.</p>
                      </div>
                      <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-2xl w-full sm:w-auto shrink-0 justify-center">
                        <button onClick={() => setUiScale(Math.min(uiScale + 0.1, 1.5))} className="w-12 h-12 bg-white dark:bg-slate-900 print:bg-white rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 font-medium text-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all w-full sm:w-12">+</button>
                        <span className="font-medium text-blue-600 w-12 text-center text-lg hidden sm:block" dir="ltr">{Math.round(uiScale * 100)}%</span>
                        <button onClick={() => setUiScale(Math.max(uiScale - 0.1, 0.7))} className="w-12 h-12 bg-white dark:bg-slate-900 print:bg-white rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 font-medium text-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all w-full sm:w-12">-</button>
                        <button onClick={() => setUiScale(1)} className="px-4 h-12 bg-slate-200 dark:bg-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 active:scale-95 transition-all ml-2 max-sm:w-full">افتراضي ({Math.round(uiScale * 100)}%)</button>
                      </div>
                   </div>
                </div>
             </SectionCard>

             <SectionCard id="print" icon={Printer} bg="bg-indigo-100" text="text-indigo-600" title="الطباعة الحرارية" subtitle="هوامش وإعدادات الطباعة">
                <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 print:bg-white flex flex-col sm:flex-row items-center justify-between gap-6">
                   <div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200">تعديل الهوامش (بالبيكسل)</h4>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">لتفادي قطع النصوص أثناء الطباعة الرول.</p>
                   </div>
                   <div className="grid grid-cols-3 gap-3 w-full sm:w-auto">
                     <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl flex flex-col items-center gap-2">
                       <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">أعلى</span>
                       <input type="number" min="0" max="100" value={thermalMargins.top} onChange={(e) => setThermalMargins({...thermalMargins, top: parseInt(e.target.value) || 0})} className="w-16 mx-auto text-center font-bold bg-white dark:bg-slate-900 print:bg-white border border-slate-100 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 rounded-lg py-1.5 outline-none" dir="ltr" />
                     </div>
                     <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl flex flex-col items-center gap-2">
                       <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">يمين</span>
                       <input type="number" min="0" max="200" value={thermalMargins.right} onChange={(e) => setThermalMargins({...thermalMargins, right: parseInt(e.target.value) || 0})} className="w-16 mx-auto text-center font-bold bg-white dark:bg-slate-900 print:bg-white border border-slate-100 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 rounded-lg py-1.5 outline-none" dir="ltr" />
                     </div>
                     <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl flex flex-col items-center gap-2">
                       <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">يسار</span>
                       <input type="number" min="0" max="200" value={thermalMargins.left} onChange={(e) => setThermalMargins({...thermalMargins, left: parseInt(e.target.value) || 0})} className="w-16 mx-auto text-center font-bold bg-white dark:bg-slate-900 print:bg-white border border-slate-100 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 rounded-lg py-1.5 outline-none" dir="ltr" />
                     </div>
                   </div>
                </div>
             </SectionCard>

             <SectionCard id="data" icon={Edit2} bg="bg-amber-100" text="text-amber-600" title="القوائم المنسدلة" subtitle="أسماء المصروفات والأشخاص">
                <SavedNamesManager savedNames={savedNames} addSavedName={addSavedName} removeSavedName={removeSavedName} />
             </SectionCard>

             {(userProfile?.role === "admin") && (
               <>
                 <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3 px-2 mt-8">الإدارة والصلاحيات</div>
                 <SectionCard id="branches" icon={Store} bg="bg-teal-100" text="text-teal-600" title="الفروع والأجهزة" subtitle="إضافة فرع أو نقطة بيع">
                    <div className="bg-white dark:bg-slate-900 print:bg-white p-4 sm:p-6">
                      <div className="flex justify-end mb-4">
                        <button onClick={() => setShowAddBranchModal(true)} className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-5 py-2.5 rounded-2xl font-bold transition-colors flex items-center gap-2 text-sm">
                          <Plus size={18} /> إضافة فرع جديد
                        </button>
                      </div>
                      <div className="flex flex-col gap-2">
                         {branches.map((b: any) => (
                            <div key={b.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-2 pl-4 rounded-2xl group">
                               <input type="text" value={b.name} onChange={(e) => {
                                  handleUpdateBranch(b.id, e.target.value);
                               }} className="w-full max-w-sm bg-transparent border-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:bg-slate-900 print:bg-white rounded-xl px-3 py-2 outline-none font-semibold text-slate-700 dark:text-slate-300 transition-colors" />
                               
                               <button onClick={() => handleDeleteBranch(b.id)} className="w-10 h-10 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100" title="حذف الفرع">
                                 <Trash2 size={20} />
                               </button>
                            </div>
                         ))}
                         {branches.length === 0 && (
                           <div className="text-center py-6 text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-800/50 rounded-2xl">لا توجد فروع مضافة.</div>
                         )}
                      </div>
                    </div>
                 </SectionCard>

                 <SectionCard id="users" icon={UserCog} bg="bg-emerald-100" text="text-emerald-600" title="المستخدمين" subtitle="إدارة الصلاحيات وحالة الحسابات">
                    <div className="bg-white dark:bg-slate-900 print:bg-white p-4 sm:p-6 overflow-x-auto">
                       <div className="flex flex-col gap-4 min-w-[500px]">
                          {adminUsers.map((u: any) => {
                             const statusClass = u.status === "active" ? "bg-emerald-100 text-emerald-800" : (u.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800");
                             return (
                             <div key={u.uid} className="flex flex-col sm:flex-row sm:items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                                <div className="sm:w-1/3 font-semibold text-slate-800 dark:text-slate-200 truncate" dir="ltr">{u.email}</div>
                                <div className="sm:w-1/4">
                                   <select value={u.role} onChange={(e) => handleUpdateUser(u.uid, { role: e.target.value })} className="bg-white dark:bg-slate-900 print:bg-white border-none text-slate-700 dark:text-slate-300 text-sm rounded-xl focus:ring-2 focus:ring-blue-500 block w-full outline-none font-semibold py-2.5 px-3 shadow-sm cursor-pointer">
                                     <option value="cashier">كاشير</option>
                                     <option value="manager">مدير</option>
                                     <option value="admin">أدمن</option>
                                   </select>
                                </div>
                                <div className="sm:w-1/4">
                                   <select value={u.branchId || ""} onChange={(e) => handleUpdateUser(u.uid, { branchId: e.target.value || null })} className="bg-white dark:bg-slate-900 print:bg-white border-none text-slate-700 dark:text-slate-300 text-sm rounded-xl focus:ring-2 focus:ring-blue-500 block w-full outline-none font-semibold py-2.5 px-3 shadow-sm cursor-pointer">
                                     <option value="">-- كل الفروع --</option>
                                     {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                   </select>
                                </div>
                                <div className="sm:w-1/4">
                                   <select value={u.status} onChange={(e) => handleUpdateUser(u.uid, { status: e.target.value })} className={"text-sm rounded-xl block w-full outline-none font-semibold py-2.5 px-3 shadow-sm border-none focus:ring-2 transition-colors cursor-pointer " + statusClass}>
                                     <option value="pending">قيد الانتظار</option>
                                     <option value="active">نشط</option>
                                     <option value="suspended">موقوف</option>
                                   </select>
                                </div>
                             </div>
                             );
                          })}
                          {adminUsers.length === 0 && (
                             <div className="text-center py-6 text-slate-500 dark:text-slate-400 font-medium">لم يتم تسجيل أي مستخدمين.</div>
                          )}
                       </div>
                    </div>
                 </SectionCard>
               </>
             )}

             {(userProfile?.role === "admin" || userProfile?.role === "manager") && (
               <>
                 <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3 px-2 mt-8">متقدم</div>
                 <SectionCard id="danger" icon={ShieldAlert} bg="bg-rose-100" text="text-rose-600" title="مسح السجلات" subtitle="إعادة ضبط تقارير التطبيق بالكامل">
                    <div className="bg-white dark:bg-slate-900 print:bg-white p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div>
                        <h4 className="font-semibold text-slate-800 dark:text-slate-200">بدء صفحة جديدة</h4>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">حذف جميع السجلات، الشفتات المحفوظة والأموال المعلقة من النظام.</p>
                      </div>
                      <button onClick={clearHistory} className="w-full sm:w-auto shrink-0 bg-white dark:bg-slate-900 print:bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 px-6 py-3 rounded-2xl font-bold transition-all shadow-sm flex items-center justify-center gap-2">
                        <Trash2 size={20} /> مسح جميع البيانات
                      </button>
                    </div>
                 </SectionCard>
               </>
             )}

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
