import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Settings, Trash2, ShieldAlert, Plus, Store, UserCog } from 'lucide-react';

export const SettingsModalComponent = ({
  show, onClose,
  companyName, setCompanyName,
  uiScale, setUiScale,
  thermalMargins, setThermalMargins,
  clearHistory,
  branches, adminUsers,
  handleUpdateBranch, handleDeleteBranch, handleUpdateUser,
  setShowAddBranchModal,
  user, userProfile
}: any) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 z-[100] bg-[#f2f2f7] overflow-y-auto print:hidden" dir="rtl">
          {/* Top Navbar */}
          <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 px-4 py-4 flex items-center justify-between shadow-[0_4px_30px_rgba(0,0,0,0.03)]">
             <div className="flex items-center gap-3">
               <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-full transition-colors text-slate-700">
                 <ArrowRight size={20} />
               </button>
               <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                 <Settings size={22} className="text-blue-600" />
                 إعدادات النظام
               </h2>
             </div>
          </div>
          
          <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-8 pb-24">
             {/* App Info */}
             <section className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-slate-200/60 transition-all">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                   <div>
                      <h3 className="text-lg font-bold text-slate-800 mb-1">اسم الشركة / المؤسسة</h3>
                      <p className="text-slate-500 text-sm">يظهر هذا الاسم في جميع التقارير وإيصالات الطباعة.</p>
                   </div>
                   <div className="w-full sm:w-72">
                      <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-3 font-bold text-slate-800 outline-none transition-all placeholder:font-normal placeholder:text-slate-400" placeholder="اكتب اسم الشركة هنا..." />
                   </div>
                </div>
             </section>

             {/* UI Settings */}
             <section className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-slate-200/60 transition-all space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 mb-4 border-b border-slate-100 pb-4">المظهر والإعدادات العامة</h3>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                   <div>
                      <h4 className="font-bold text-slate-800">حجم واجهة المستخدم</h4>
                      <p className="text-slate-500 text-sm mt-1">تغيير حجم نصوص وأزرار التطبيق (في الخزينة فقط).</p>
                   </div>
                   <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200 w-full sm:w-auto shrink-0 justify-between sm:justify-start">
                     <button onClick={() => setUiScale(Math.min(uiScale + 0.1, 1.5))} className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 font-bold text-lg text-slate-700 hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center">+</button>
                     <span className="font-bold text-blue-700 w-12 text-center" dir="ltr">{Math.round(uiScale * 100)}%</span>
                     <button onClick={() => setUiScale(Math.max(uiScale - 0.1, 0.7))} className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 font-bold text-lg text-slate-700 hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center">-</button>
                     <button onClick={() => setUiScale(1)} className="px-3 h-10 bg-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-300 active:scale-95 transition-all mr-1">افتراضي</button>
                   </div>
                </div>

                <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-6 pt-4 border-t border-slate-100">
                   <div>
                      <h4 className="font-bold text-slate-800">هوامش الطباعة الحرارية</h4>
                      <p className="text-slate-500 text-sm mt-1">التحكم في المساحات الفارغة يمين ويسار وفي أعلى إيصال الطباعة الحرارية.</p>
                   </div>
                   <div className="grid grid-cols-3 gap-3 w-full sm:w-auto">
                     <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
                       <span className="text-xs font-bold text-slate-500 text-center">أعلى</span>
                       <input type="number" min="0" max="100" value={thermalMargins.top} onChange={(e) => setThermalMargins({...thermalMargins, top: parseInt(e.target.value) || 0})} className="w-16 mx-auto text-center font-bold bg-white border border-slate-200 rounded py-1" dir="ltr" />
                     </div>
                     <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
                       <span className="text-xs font-bold text-slate-500 text-center">يمين</span>
                       <input type="number" min="0" max="200" value={thermalMargins.right} onChange={(e) => setThermalMargins({...thermalMargins, right: parseInt(e.target.value) || 0})} className="w-16 mx-auto text-center font-bold bg-white border border-slate-200 rounded py-1" dir="ltr" />
                     </div>
                     <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
                       <span className="text-xs font-bold text-slate-500 text-center">يسار</span>
                       <input type="number" min="0" max="200" value={thermalMargins.left} onChange={(e) => setThermalMargins({...thermalMargins, left: parseInt(e.target.value) || 0})} className="w-16 mx-auto text-center font-bold bg-white border border-slate-200 rounded py-1" dir="ltr" />
                     </div>
                   </div>
                </div>
             </section>

             {/* Danger Zone */}
             {(userProfile?.role === 'admin' || userProfile?.role === 'manager') && (
             <section className="bg-rose-50/50 rounded-[2rem] p-6 sm:p-8 shadow-sm border border-rose-100 transition-all">
                <div className="flex items-center gap-3 mb-6 border-b border-rose-100 pb-4">
                  <ShieldAlert size={24} className="text-rose-500" />
                  <h3 className="text-xl font-bold text-rose-800">منطقة الخطر (إدارة البيانات)</h3>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-rose-900">مسح جميع السجلات المحفوظة</h4>
                    <p className="text-rose-600/80 text-sm mt-1">هذا الإجراء سيقوم بحذف جميع تقارير التقفيل اليومي السابقة، والأموال المعلقة المسددة، وسجلات الشفتات القديمة بالكامل. لا يمكن التراجع عن هذا الإجراء أبدًا.</p>
                  </div>
                  <button onClick={clearHistory} className="w-full sm:w-auto shrink-0 bg-white border-2 border-rose-500 text-rose-600 hover:bg-rose-500 hover:text-white px-6 py-3 rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-2">
                    <Trash2 size={20} /> مسح السجلات الآن
                  </button>
                </div>
             </section>
             )}

             {/* Admin Controls */}
             {(userProfile?.role === 'admin') && (
                <>
                  {/* Branches Section */}
                  <section className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-slate-200/60">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><Store size={20} /></div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-800">إدارة الفروع وأجهزة نقاط البيع</h3>
                          <p className="text-slate-500 text-sm">حدد الفروع لإدارة الخزينة لكل فرع بشكل منفصل.</p>
                        </div>
                      </div>
                      <button onClick={() => setShowAddBranchModal(true)} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-sm flex items-center gap-2 text-sm w-full sm:w-auto justify-center">
                        <Plus size={18} /> إضافة فرع جديد
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm bg-slate-50 p-2">
                       <table className="w-full text-right bg-white rounded-xl overflow-hidden">
                          <thead className="bg-slate-100/50 text-slate-500">
                             <tr>
                                <th className="p-4 font-semibold w-full">اسم الفرع</th>
                                <th className="p-4 font-semibold text-center w-24">الإجراءات</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                             {branches.map((b: any) => (
                                <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                                   <td className="p-3">
                                      <input type="text" value={b.name} onChange={(e) => {
                                         handleUpdateBranch(b.id, e.target.value);
                                      }} className="w-full max-w-md bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-slate-50 rounded-lg px-3 py-2 outline-none font-bold text-slate-700 transition-colors" />
                                   </td>
                                   <td className="p-3 text-center">
                                      <button onClick={() => handleDeleteBranch(b.id)} className="w-10 h-10 mx-auto text-rose-500 hover:text-white hover:bg-rose-500 rounded-lg transition-colors flex items-center justify-center" title="حذف الفرع">
                                        <Trash2 size={18} />
                                      </button>
                                   </td>
                                </tr>
                             ))}
                             {branches.length === 0 && (
                                <tr>
                                   <td colSpan={2} className="p-8 text-center text-slate-500 font-medium">لا توجد فروع مضافة حالياً.</td>
                                </tr>
                             )}
                          </tbody>
                       </table>
                    </div>
                  </section>

                  {/* Users Section */}
                  <section className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-slate-200/60">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center"><UserCog size={20} /></div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-800">إدارة المستخدمين والصلاحيات</h3>
                          <p className="text-slate-500 text-sm">حدد أدوار وحالات المستخدمين وربطهم بالفروع (إن وجدت).</p>
                        </div>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm bg-slate-50 p-2">
                       <table className="w-full text-right bg-white rounded-xl overflow-hidden min-w-[700px]">
                          <thead className="bg-slate-100/50 text-slate-500">
                             <tr>
                                <th className="p-4 font-semibold pb-3">المستخدم / البريد</th>
                                <th className="p-4 font-semibold pb-3">الدور / الصلاحية</th>
                                <th className="p-4 font-semibold pb-3">الفرع المخصص</th>
                                <th className="p-4 font-semibold pb-3">حالة الحساب</th>
                                <th className="p-4 font-semibold pb-3 text-left">تاريخ الانضمام</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                             {adminUsers.map((u: any) => (
                                <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                                   <td className="p-4">
                                      <div className="font-bold text-slate-800 truncate" dir="ltr">{u.email}</div>
                                   </td>
                                   <td className="p-3">
                                      <select value={u.role} onChange={(e) => handleUpdateUser(u.uid, { role: e.target.value })} className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full outline-none font-bold py-2 px-3">
                                        <option value="cashier">كاشير (إدخال التقفيل)</option>
                                        <option value="manager">مدير (معاينة شاملة)</option>
                                        <option value="admin">أدمن (كامل الصلاحيات)</option>
                                      </select>
                                   </td>
                                   <td className="p-3">
                                      <select value={u.branchId || ''} onChange={(e) => handleUpdateUser(u.uid, { branchId: e.target.value || null })} className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full outline-none font-bold py-2 px-3">
                                        <option value="">-- كل الفروع / بلا تحديد --</option>
                                        {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                      </select>
                                   </td>
                                   <td className="p-3">
                                      <select value={u.status} onChange={(e) => handleUpdateUser(u.uid, { status: e.target.value })} className={`text-sm rounded-lg block w-full outline-none font-bold py-2 px-3 border border-transparent focus:ring-2 transition-colors ${u.status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 focus:ring-emerald-200' : u.status === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-700 focus:ring-amber-200' : 'bg-rose-50 border-rose-200 text-rose-700 focus:ring-rose-200'}`}>
                                        <option value="pending">قيد الانتظار للقبول</option>
                                        <option value="active">حساب نشط ومفعل</option>
                                        <option value="suspended">موقوف/مجمد مؤقتاً</option>
                                      </select>
                                   </td>
                                   <td className="p-4 text-slate-500 font-mono text-left text-sm" dir="ltr">{new Date(u.createdAt).toLocaleDateString()}</td>
                                </tr>
                             ))}
                             {adminUsers.length === 0 && (
                                <tr>
                                   <td colSpan={5} className="p-8 text-center text-slate-500 font-medium">لم يتم تسجيل أي مستخدمين بعد.</td>
                                </tr>
                             )}
                          </tbody>
                       </table>
                    </div>
                  </section>
                </>
             )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
