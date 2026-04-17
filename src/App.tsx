import React, { useState, useEffect, useRef } from 'react';
import { Save, Printer, FilePlus, Plus, Trash2, Calculator, Wallet, ArrowDownRight, ArrowUpRight, AlertCircle, CheckCircle2, CreditCard, Receipt, Layers, Pin, Settings, Undo2, History, Eye, EyeOff, X, LogIn, LogOut, CalendarDays, Download, FileText, Image as ImageIcon, BookOpen, PlusCircle, Copy, Search, Check, Edit2, BarChart3, TrendingUp } from 'lucide-react';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

type FundHistoryEntry = {
  id: string;
  date: string;
  amount: number;
  type: 'add' | 'sub' | 'init';
  note?: string;
};

type Transaction = { id: string; name: string; amount: number; isPinned?: boolean; showInSummary?: boolean; history?: FundHistoryEntry[] };
type ArchivedFund = Transaction & { type: 'toUs' | 'byUs'; dateSettled: string };
type POSData = { id: string; name: string; sales: number; returns: number; networks: number[] };

type AppState = {
  date: string;
  previousBalance: number;
  posData: POSData[];
  expenseRefunds: Transaction[];
  companyPayments: Transaction[];
  expenses: Transaction[];
  customerTransfers: Transaction[];
  pendingFundsOwedToUs: Transaction[]; 
  pendingFundsOwedByUs: Transaction[]; 
  archivedPendingFunds: ArchivedFund[];
  cashDeposits: Transaction[];
  cashDenominations: { [key: string]: number };
  customCashAmounts: Transaction[];
  savedNames: {
    expenseRefunds: string[];
    companyPayments: string[];
    expenses: string[];
    customerTransfers: string[];
    pendingFundsOwedToUs: string[];
    pendingFundsOwedByUs: string[];
    cashDeposits: string[];
    customCashAmounts: string[];
  };
};

const generateId = () => Math.random().toString(36).substr(2, 9);

const defaultPOS: POSData[] = [
  { id: generateId(), name: 'نقطة بيع 501', sales: 0, returns: 0, networks: [] },
  { id: generateId(), name: 'نقطة بيع 502', sales: 0, returns: 0, networks: [] },
  { id: generateId(), name: 'نقطة بيع 500', sales: 0, returns: 0, networks: [] },
];

const defaultDenominations = {
  '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '1': 0
};

const getInitialState = (): AppState => ({
  date: new Date().toLocaleDateString('en-GB'),
  previousBalance: 0,
  posData: defaultPOS,
  expenseRefunds: [],
  companyPayments: [],
  expenses: [],
  customerTransfers: [],
  pendingFundsOwedToUs: [{ id: generateId(), name: 'رصيد مستخدم 19 (نقطة 500)', amount: 0, isPinned: true }],
  pendingFundsOwedByUs: [],
  archivedPendingFunds: [],
  cashDeposits: [],
  cashDenominations: { ...defaultDenominations },
  customCashAmounts: [],
  savedNames: {
    expenseRefunds: ['مردود مصروف صيانة', 'مردود عهدة'],
    companyPayments: [],
    expenses: ['خصم خارج الفاتورة', 'صيانة', 'رواتب', 'نثريات', 'بوفيه', 'كهرباء'],
    customerTransfers: [],
    pendingFundsOwedToUs: ['رصيد مستخدم 19 (نقطة 500)', 'سلفة موظف'],
    pendingFundsOwedByUs: ['مبلغ زائد لعميل'],
    cashDeposits: [],
    customCashAmounts: ['رزمة 50', 'رزمة 100', 'مبلغ معدود مسبقاً'],
  }
});

const sumTransactions = (arr: Transaction[]) => arr.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
const sumNetworks = (networks: number[]) => networks.reduce((sum, val) => sum + (Number(val) || 0), 0);

const getSummary = (s: AppState) => {
  const totalSales = s.posData.reduce((sum, item) => sum + (Number(item.sales) || 0), 0);
  const totalReturns = s.posData.reduce((sum, item) => sum + (Number(item.returns) || 0), 0);
  const netSales = totalSales - totalReturns;
  const totalExpenseRefunds = sumTransactions(s.expenseRefunds);
  const totalCashIn = netSales + totalExpenseRefunds;

  const totalNetworks = s.posData.reduce((sum, item) => sum + sumNetworks(item.networks), 0);
  const totalCustomerTransfers = sumTransactions(s.customerTransfers);
  const totalCompanyPayments = sumTransactions(s.companyPayments);
  
  const separatedExpenses = s.expenses.filter(e => e.showInSummary && e.amount > 0);
  const separatedExpensesTotal = sumTransactions(separatedExpenses);
  const generalExpensesTotal = sumTransactions(s.expenses.filter(e => !e.showInSummary));
  const totalExpenses = generalExpensesTotal + separatedExpensesTotal;
  
  const totalCashDeposits = sumTransactions(s.cashDeposits);
  const totalCashOut = totalNetworks + totalCustomerTransfers + totalCompanyPayments + totalExpenses + totalCashDeposits;

  const expectedCash = s.previousBalance + totalCashIn - totalCashOut;

  const physicalDenominations = Object.entries(s.cashDenominations).reduce((sum, [denom, count]) => sum + (Number(denom) * (Number(count) || 0)), 0);
  const physicalCustomCash = sumTransactions(s.customCashAmounts);
  const physicalCash = physicalDenominations + physicalCustomCash;
  
  const totalPendingOwedToUs = sumTransactions(s.pendingFundsOwedToUs);
  const totalPendingOwedByUs = sumTransactions(s.pendingFundsOwedByUs);

  const actualCash = physicalCash + totalPendingOwedToUs - totalPendingOwedByUs;
  const difference = actualCash - expectedCash;

  return {
    totalSales, totalReturns, netSales, totalExpenseRefunds, totalCashIn,
    totalNetworks, totalCustomerTransfers, totalCompanyPayments,
    separatedExpenses, separatedExpensesTotal, generalExpensesTotal, totalExpenses, totalCashDeposits, totalCashOut,
    expectedCash, physicalDenominations, physicalCustomCash, physicalCash,
    totalPendingOwedToUs, totalPendingOwedByUs, actualCash, difference
  };
};

type DailySnapshot = {
  id: string;
  timestamp: number;
  state: AppState;
  summary: ReturnType<typeof getSummary>;
};

const formatNum = (num: number) => num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DailyPrintView = ({ state, summary, formatNum }: any) => (
  <div className="hidden print:block rtl p-8 w-full print:bg-white text-black font-sans">
    <div className="text-center mb-6 pb-4 border-b-2 border-gray-300">
      <h1 className="text-3xl font-bold mb-2">الخزينة الذكية - تقرير التقفيل اليومي</h1>
      <p className="text-lg">تاريخ: <span dir="ltr" className="font-bold">{state.date}</span></p>
    </div>
    
    <div className="mb-6">
      <h2 className="text-2xl font-bold bg-gray-100 p-2 mb-4 border-r-4 border-blue-600">ملخص الوارد والمنصرف</h2>
      <table className="w-full text-right border-collapse text-lg border border-gray-300">
        <tbody>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold bg-gray-50/50 w-2/3">رصيد أول المدة</td>
            <td className="py-3 px-4 font-bold" dir="ltr">{formatNum(state.previousBalance)}</td>
          </tr>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold bg-emerald-50 text-emerald-800 w-2/3">+ إجمالي الإيرادات (الوارد)</td>
            <td className="py-3 px-4 font-bold text-emerald-800" dir="ltr">{formatNum(summary.totalCashIn)}</td>
          </tr>
          <tr>
            <td colSpan={2} className="py-2 px-8 text-base text-gray-700">
              <div className="flex justify-between border-b border-gray-100 py-1"><span>صافي المبيعات</span><span dir="ltr">{formatNum(summary.netSales)}</span></div>
              {summary.totalExpenseRefunds > 0 && <div className="flex justify-between py-1"><span>مردود مصروفات</span><span dir="ltr">{formatNum(summary.totalExpenseRefunds)}</span></div>}
            </td>
          </tr>
          <tr className="border-b border-gray-300 border-t-2">
            <td className="py-3 px-4 font-bold bg-rose-50 text-rose-800 w-2/3">- إجمالي المخصومات (المنصرف)</td>
            <td className="py-3 px-4 font-bold text-rose-800" dir="ltr">{formatNum(summary.totalCashOut)}</td>
          </tr>
          <tr>
            <td colSpan={2} className="py-2 px-8 text-base text-gray-700">
              {summary.totalNetworks > 0 && <div className="flex justify-between border-b border-gray-100 py-1"><span>الشبكات</span><span dir="ltr">{formatNum(summary.totalNetworks)}</span></div>}
              {summary.totalCustomerTransfers > 0 && <div className="flex justify-between border-b border-gray-100 py-1"><span>تحويلات العملاء</span><span dir="ltr">{formatNum(summary.totalCustomerTransfers)}</span></div>}
              {summary.totalCompanyPayments > 0 && <div className="flex justify-between border-b border-gray-100 py-1"><span>سداد شركات وموردين</span><span dir="ltr">{formatNum(summary.totalCompanyPayments)}</span></div>}
              {summary.generalExpensesTotal > 0 && <div className="flex justify-between border-b border-gray-100 py-1"><span>مصروفات عامة</span><span dir="ltr">{formatNum(summary.generalExpensesTotal)}</span></div>}
              {summary.totalCashDeposits > 0 && <div className="flex justify-between border-b border-gray-100 py-1"><span>إيداعات بنكية</span><span dir="ltr">{formatNum(summary.totalCashDeposits)}</span></div>}
              {summary.separatedExpenses.map((exp: any) => (
                <div key={exp.id} className="flex justify-between py-1"><span>{exp.name || 'مصروف محدد'}</span><span dir="ltr">{formatNum(exp.amount)}</span></div>
              ))}
            </td>
          </tr>
          <tr className="border-t-2 border-gray-800 bg-gray-100">
            <td className="py-4 px-4 font-black w-2/3">الرصيد الدفتري (المتوقع)</td>
            <td className="py-4 px-4 font-black font-mono" dir="ltr">{formatNum(summary.expectedCash)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div className="mb-6 break-inside-avoid">
      <h2 className="text-2xl font-bold bg-gray-100 p-2 mb-4 border-r-4 border-indigo-600">الجرد الفعلي</h2>
      <table className="w-full text-right border-collapse text-lg border border-gray-300">
        <tbody>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold bg-gray-50/50 w-2/3">النقدية الفعلية (الجرد)</td>
            <td className="py-3 px-4 font-bold" dir="ltr">{formatNum(summary.physicalCash)}</td>
          </tr>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold text-amber-700 bg-amber-50 w-2/3">+ أموال معلقة لنا</td>
            <td className="py-3 px-4 font-bold text-amber-700" dir="ltr">{formatNum(summary.totalPendingOwedToUs)}</td>
          </tr>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold text-slate-700 w-2/3">- أموال معلقة علينا</td>
            <td className="py-3 px-4 font-bold text-slate-700" dir="ltr">{formatNum(summary.totalPendingOwedByUs)}</td>
          </tr>
          <tr className="border-t-2 border-gray-800 bg-gray-100">
            <td className="py-4 px-4 font-black w-2/3">الرصيد الفعلي (الصافي)</td>
            <td className="py-4 px-4 font-black font-mono text-indigo-700" dir="ltr">{formatNum(summary.actualCash)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div className={`p-6 mt-8 rounded-xl border-4 text-center font-black text-2xl ${summary.difference === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : summary.difference > 0 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
      {summary.difference === 0 ? 'الخزينة مطابقة تماماً' : summary.difference > 0 ? `يوجد زيادة: ${formatNum(Math.abs(summary.difference))}` : `يوجد عجز: ${formatNum(Math.abs(summary.difference))}`}
    </div>
  </div>
);

const PendingPrintView = ({ pendingOwedToUs, pendingOwedByUs, formatNum }: any) => {
  const sumOwedToUs = pendingOwedToUs.reduce((a: number, b: any) => a + b.amount, 0);
  const sumOwedByUs = pendingOwedByUs.reduce((a: number, b: any) => a + b.amount, 0);

  return (
    <div className="hidden print:block rtl p-8 w-full print:bg-white text-black font-sans">
      <div className="text-center mb-8 pb-4 border-b-2 border-gray-300">
        <h1 className="text-3xl font-bold mb-2">تقرير الأموال المعلقة</h1>
        <p className="text-gray-700 text-lg">تاريخ الطباعة: <span dir="ltr" className="font-bold font-mono">{new Date().toLocaleDateString('en-GB')}</span></p>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold p-3 mb-4 bg-amber-50 text-amber-900 border border-amber-200 flex justify-between rounded-lg">
          <span>أموال معلقة لنا (سلف/عهد)</span>
          <span dir="ltr" className="font-mono">{formatNum(sumOwedToUs)}</span>
        </h2>
        <table className="w-full text-right border-collapse text-lg border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-2 px-4 border border-gray-300 w-16 text-center">م</th>
              <th className="py-2 px-4 border border-gray-300">البيان / الاسم</th>
              <th className="py-2 px-4 border border-gray-300 w-48 text-left">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {pendingOwedToUs.length > 0 ? pendingOwedToUs.map((item: any, idx: number) => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="py-2 px-4 border border-gray-300 text-center">{idx + 1}</td>
                <td className="py-2 px-4 border border-gray-300">{item.name}</td>
                <td className="py-2 px-4 border border-gray-300 text-left font-bold font-mono" dir="ltr">{formatNum(item.amount)}</td>
              </tr>
            )) : <tr><td colSpan={3} className="text-center py-4 text-gray-500 border border-gray-300">لا توجد أموال معلقة لنا</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mb-8 break-inside-avoid">
        <h2 className="text-2xl font-bold p-3 mb-4 bg-slate-100 text-slate-800 border border-slate-200 flex justify-between rounded-lg">
          <span>أموال معلقة علينا (أمانات/مستحقات)</span>
          <span dir="ltr" className="font-mono">{formatNum(sumOwedByUs)}</span>
        </h2>
        <table className="w-full text-right border-collapse text-lg border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-2 px-4 border border-gray-300 w-16 text-center">م</th>
              <th className="py-2 px-4 border border-gray-300">البيان / الاسم</th>
              <th className="py-2 px-4 border border-gray-300 w-48 text-left">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {pendingOwedByUs.length > 0 ? pendingOwedByUs.map((item: any, idx: number) => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="py-2 px-4 border border-gray-300 text-center">{idx + 1}</td>
                <td className="py-2 px-4 border border-gray-300">{item.name}</td>
                <td className="py-2 px-4 border border-gray-300 text-left font-bold font-mono" dir="ltr">{formatNum(item.amount)}</td>
              </tr>
            )) : <tr><td colSpan={3} className="text-center py-4 text-gray-500 border border-gray-300">لا توجد أموال معلقة علينا</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AnalyticsView = ({ history, currentState, formatNum }: any) => {
  const allData = [...history.map((s: any) => ({ ...s.state, isCurrent: false })), { ...currentState, isCurrent: true }];
  
  const dailyMetrics = allData.map(state => {
    const netSales = state.posData ? state.posData.reduce((acc: number, pos: any) => acc + (pos.sales - pos.returns), 0) : 0;
    
    const parts = state.date.split('/');
    let month = '', day = '', year = '';
    let dObj = new Date();
    
    if (parts.length === 3) {
      day = parts[0]; month = parts[1]; year = parts[2];
      dObj = new Date(Number(year), Number(month) - 1, Number(day));
    }
    
    return {
      dateStr: state.date,
      dateObj: dObj,
      monthYear: parts.length === 3 ? `${month}/${year}` : 'غير محدد',
      sales: netSales,
      isCurrent: state.isCurrent,
      dateName: parts.length === 3 ? `${day}/${month}` : state.date
    };
  }).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  const monthlyAgg = dailyMetrics.reduce((acc: any, curr: any) => {
    if (!acc[curr.monthYear]) acc[curr.monthYear] = { monthYear: curr.monthYear, dateObj: curr.dateObj, totalSales: 0, daysCount: 0 };
    acc[curr.monthYear].totalSales += curr.sales;
    acc[curr.monthYear].daysCount += 1;
    return acc;
  }, {});

  const monthlyList = Object.values(monthlyAgg).sort((a: any, b: any) => a.dateObj.getTime() - b.dateObj.getTime());

  return (
    <div className="print:block print:w-full space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold flex items-center gap-3 mb-6 text-slate-800">
          <BarChart3 className="text-blue-600" size={28} /> ملخص المبيعات الشهري
        </h2>
        {monthlyList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {monthlyList.map((m: any) => (
              <div key={m.monthYear} className="bg-slate-50 border border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-center hover:bg-white hover:shadow-md transition-all">
                <span className="text-slate-500 font-bold mb-3 text-lg">شهر {m.monthYear}</span>
                <span className="text-3xl font-black text-blue-700 block mb-3 font-mono" dir="ltr">{formatNum(m.totalSales)}</span>
                <span className="text-sm text-slate-500 bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-300">أيام العمل المسجلة: {m.daysCount}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-6">لا توجد بيانات كافية لعرض التقرير الشهري</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 print:break-inside-avoid">
        <h2 className="text-2xl font-bold flex items-center gap-3 mb-8 text-slate-800">
          <TrendingUp className="text-emerald-600" size={28} /> حركة صافي المبيعات اليومية
        </h2>
        
        {dailyMetrics.length >= 2 ? (
          <div className="h-[400px] w-full mb-8" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                <XAxis dataKey="dateName" tick={{ fill: '#64748b', fontSize: 13, fontFamily: 'monospace' }} tickMargin={10} />
                <YAxis tick={{ fill: '#64748b', fontSize: 13, fontFamily: 'monospace' }} tickFormatter={(val) => Math.floor(val).toLocaleString()} width={80} />
                <RechartsTooltip 
                  formatter={(value: number) => [formatNum(value), 'صافي المبيعات']}
                  labelFormatter={(label) => `التاريخ: ${label}`}
                  contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', fontFamily: 'Cairo', textAlign: 'right', padding: '12px 16px' }}
                />
                <Legend wrapperStyle={{ fontFamily: 'Cairo', paddingTop: '20px' }} />
                <Line type="monotone" dataKey="sales" name="صافي المبيعات" stroke="#2563eb" strokeWidth={4} dot={{ r: 5, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8, strokeWidth: 0, fill: '#1d4ed8' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-slate-500 text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-300 font-medium">نحتاج إلى تسجيل يومين على الأقل لرسم مخطط المقارنة البياني.</p>
        )}

        <div className="overflow-x-auto print:mt-8">
          <table className="w-full text-right text-base border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-200 text-slate-700">
                <th className="py-4 px-6 font-bold rounded-tr-2xl w-1/3">التاريخ</th>
                <th className="py-4 px-6 font-bold rounded-tl-2xl text-left">صافي المبيعات اليومي</th>
              </tr>
            </thead>
            <tbody>
              {dailyMetrics.map((day: any) => (
                <tr key={day.dateStr} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${day.isCurrent ? 'bg-blue-50/40 hover:bg-blue-50/60' : ''}`}>
                  <td className="py-4 px-6 font-bold text-slate-700 flex items-center gap-3">
                    <span className="font-mono text-sm">{day.dateStr}</span>
                    {day.isCurrent && <span className="bg-blue-600 text-white px-2 py-0.5 rounded-md text-xs">اليوم (جاري)</span>}
                  </td>
                  <td className="py-4 px-6 font-black text-left text-slate-900 font-mono text-lg" dir="ltr">{formatNum(day.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SummaryDashboard = ({ state, summary, isExport = false }: { state: AppState, summary: ReturnType<typeof getSummary>, isExport?: boolean }) => {
  if (isExport) {
    return (
      <div className="bg-white text-black p-6 border border-slate-300 rounded-lg print:border-none print:p-0">
        <h2 className="text-xl font-bold text-center mb-6 border-b-2 border-black pb-2">ملخص التقفيل اليومي</h2>
        <table className="w-full text-right border-collapse mb-8 text-sm">
          <tbody>
            <tr className="border-b border-slate-200"><td className="py-3 font-bold">رصيد أول المدة</td><td className="py-3 font-bold" dir="ltr">{formatNum(state.previousBalance)}</td></tr>
            <tr className="border-b border-slate-200"><td className="py-3 font-bold">+ إجمالي الإيرادات (الوارد)</td><td className="py-3 font-bold" dir="ltr">{formatNum(summary.totalCashIn)}</td></tr>
            <tr>
              <td colSpan={2} className="py-2 pr-4 text-xs text-slate-600">
                <div className="flex justify-between mb-1"><span>صافي المبيعات</span><span dir="ltr">{formatNum(summary.netSales)}</span></div>
                {summary.totalExpenseRefunds > 0 && <div className="flex justify-between mb-1"><span>مردود مصروفات</span><span dir="ltr">{formatNum(summary.totalExpenseRefunds)}</span></div>}
              </td>
            </tr>
            <tr className="border-b border-slate-200 border-t"><td className="py-3 font-bold">- إجمالي المخصومات (المنصرف)</td><td className="py-3 font-bold" dir="ltr">{formatNum(summary.totalCashOut)}</td></tr>
            <tr>
              <td colSpan={2} className="py-2 pr-4 text-xs text-slate-600">
                {summary.totalNetworks > 0 && <div className="flex justify-between mb-1"><span>الشبكات</span><span dir="ltr">{formatNum(summary.totalNetworks)}</span></div>}
                {summary.totalCustomerTransfers > 0 && <div className="flex justify-between mb-1"><span>تحويلات العملاء</span><span dir="ltr">{formatNum(summary.totalCustomerTransfers)}</span></div>}
                {summary.totalCompanyPayments > 0 && <div className="flex justify-between mb-1"><span>سداد شركات وموردين</span><span dir="ltr">{formatNum(summary.totalCompanyPayments)}</span></div>}
                {summary.generalExpensesTotal > 0 && <div className="flex justify-between mb-1"><span>مصروفات عامة</span><span dir="ltr">{formatNum(summary.generalExpensesTotal)}</span></div>}
                {summary.totalCashDeposits > 0 && <div className="flex justify-between mb-1"><span>إيداعات بنكية</span><span dir="ltr">{formatNum(summary.totalCashDeposits)}</span></div>}
                {summary.separatedExpenses.map(exp => (
                  <div key={exp.id} className="flex justify-between mb-1"><span>{exp.name || 'مصروف محدد'}</span><span dir="ltr">{formatNum(exp.amount)}</span></div>
                ))}
              </td>
            </tr>
            <tr className="border-b-2 border-black bg-slate-50"><td className="py-3 font-bold text-base">الرصيد الدفتري (المتوقع)</td><td className="py-3 font-bold text-base" dir="ltr">{formatNum(summary.expectedCash)}</td></tr>
          </tbody>
        </table>

        <h3 className="text-lg font-bold mb-3 border-b border-black pb-1">تفاصيل الجرد الفعلي</h3>
        <table className="w-full text-right border-collapse mb-6 text-sm">
          <tbody>
            <tr className="border-b border-slate-200"><td className="py-3 font-bold">النقدية الفعلية (الجرد)</td><td className="py-3 font-bold" dir="ltr">{formatNum(summary.physicalCash)}</td></tr>
            <tr className="border-b border-slate-200"><td className="py-3 font-bold">+ أموال معلقة لنا</td><td className="py-3 font-bold" dir="ltr">{formatNum(summary.totalPendingOwedToUs)}</td></tr>
            <tr className="border-b border-slate-200"><td className="py-3 font-bold">- أموال معلقة علينا</td><td className="py-3 font-bold" dir="ltr">{formatNum(summary.totalPendingOwedByUs)}</td></tr>
            <tr className="border-b-2 border-black bg-slate-50"><td className="py-3 font-bold text-base">الرصيد الفعلي</td><td className="py-3 font-bold text-base" dir="ltr">{formatNum(summary.actualCash)}</td></tr>
          </tbody>
        </table>

        <div className={`p-4 rounded border-2 text-center font-bold text-lg ${summary.difference === 0 ? 'border-black' : 'border-black'}`}>
          {summary.difference === 0 ? 'الخزينة مطابقة' : summary.difference > 0 ? `يوجد زيادة: ${formatNum(Math.abs(summary.difference))}` : `يوجد عجز: ${formatNum(Math.abs(summary.difference))}`}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-slate-900 text-white rounded-3xl shadow-xl overflow-hidden print:bg-white print:text-black print:border print:border-slate-300">
        <div className="p-4 md:p-5 border-b border-slate-800 print:border-slate-200">
          <h2 className="text-base font-bold text-slate-300 print:text-slate-800 mb-3">ملخص التقفيل اليومي تفصيلي</h2>
          <div className="space-y-2 text-xs md:text-sm">
            <div className="flex justify-between items-center gap-2">
              <span className="text-slate-400 print:text-slate-600 truncate">رصيد أول المدة</span>
              <span className="font-medium shrink-0" dir="ltr">{formatNum(state.previousBalance)}</span>
            </div>
            
            {/* Inflow Breakdown */}
            <div className="pt-2 border-t border-slate-800 print:border-slate-200">
              <div className="flex justify-between items-center gap-2 text-emerald-400 print:text-emerald-700 font-bold mb-1">
                <span className="truncate">+ إجمالي الإيرادات (الوارد)</span>
                <span className="shrink-0" dir="ltr">{formatNum(summary.totalCashIn)}</span>
              </div>
              <div className="pr-4 space-y-1 text-slate-400 print:text-slate-600 text-xs">
                <div className="flex justify-between gap-2"><span className="truncate">صافي المبيعات</span><span className="shrink-0" dir="ltr">{formatNum(summary.netSales)}</span></div>
                {summary.totalExpenseRefunds > 0 && <div className="flex justify-between gap-2"><span className="truncate">مردود مصروفات</span><span className="shrink-0" dir="ltr">{formatNum(summary.totalExpenseRefunds)}</span></div>}
              </div>
            </div>

            {/* Outflow Breakdown */}
            <div className="pt-2 border-t border-slate-800 print:border-slate-200">
              <div className="flex justify-between items-center gap-2 text-rose-400 print:text-rose-700 font-bold mb-1">
                <span className="truncate">- إجمالي المخصومات (المنصرف)</span>
                <span className="shrink-0" dir="ltr">{formatNum(summary.totalCashOut)}</span>
              </div>
              <div className="pr-4 space-y-1 text-slate-400 print:text-slate-600 text-xs">
                {summary.totalNetworks > 0 && <div className="flex justify-between gap-2"><span className="truncate">الشبكات</span><span className="shrink-0" dir="ltr">{formatNum(summary.totalNetworks)}</span></div>}
                {summary.totalCustomerTransfers > 0 && <div className="flex justify-between gap-2"><span className="truncate">تحويلات العملاء</span><span className="shrink-0" dir="ltr">{formatNum(summary.totalCustomerTransfers)}</span></div>}
                {summary.totalCompanyPayments > 0 && <div className="flex justify-between gap-2"><span className="truncate">سداد شركات وموردين</span><span className="shrink-0" dir="ltr">{formatNum(summary.totalCompanyPayments)}</span></div>}
                {summary.generalExpensesTotal > 0 && <div className="flex justify-between gap-2"><span className="truncate">مصروفات عامة</span><span className="shrink-0" dir="ltr">{formatNum(summary.generalExpensesTotal)}</span></div>}
                {summary.totalCashDeposits > 0 && <div className="flex justify-between gap-2"><span className="truncate">إيداعات بنكية</span><span className="shrink-0" dir="ltr">{formatNum(summary.totalCashDeposits)}</span></div>}
                
                {/* Separated Expenses */}
                {summary.separatedExpenses.map(exp => (
                  <div key={exp.id} className="flex justify-between gap-2 text-purple-400 print:text-purple-700 font-medium">
                    <span className="truncate">{exp.name || 'مصروف محدد'}</span>
                    <span className="shrink-0" dir="ltr">{formatNum(exp.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 mt-2 border-t border-slate-800 print:border-slate-200 flex justify-between items-center gap-2 text-base font-bold text-blue-400 print:text-blue-700">
              <span className="truncate">الرصيد الدفتري (المتوقع)</span>
              <span className="shrink-0" dir="ltr">{formatNum(summary.expectedCash)}</span>
            </div>
          </div>
        </div>
        <div className="p-4 md:p-5 bg-slate-800/50 print:bg-slate-50">
          <div className="space-y-2 text-xs md:text-sm mb-3">
            <div className="flex justify-between items-center gap-2">
              <span className="text-slate-400 print:text-slate-600 truncate">النقدية الفعلية (الجرد)</span>
              <span className="font-medium shrink-0" dir="ltr">{formatNum(summary.physicalCash)}</span>
            </div>
            <div className="flex justify-between items-center gap-2 text-amber-400 print:text-amber-700">
              <span className="truncate">+ أموال معلقة لنا (تُحسب بالخزينة)</span>
              <span className="font-medium shrink-0" dir="ltr">{formatNum(summary.totalPendingOwedToUs)}</span>
            </div>
            <div className="flex justify-between items-center gap-2 text-slate-400 print:text-slate-600">
              <span className="truncate">- أموال معلقة علينا</span>
              <span className="font-medium shrink-0" dir="ltr">{formatNum(summary.totalPendingOwedByUs)}</span>
            </div>
          </div>
          <div className="flex justify-between items-center gap-2 text-lg font-bold text-white print:text-black mb-4">
            <span className="truncate">الرصيد الفعلي</span>
            <span className="shrink-0" dir="ltr">{formatNum(summary.actualCash)}</span>
          </div>
          <div className={`p-3 rounded-2xl flex items-center justify-between ${
            summary.difference === 0 ? 'bg-emerald-500/20 text-emerald-400 print:bg-emerald-100 print:text-emerald-800 border border-emerald-500/30' : summary.difference > 0 ? 'bg-blue-500/20 text-blue-400 print:bg-blue-100 print:text-blue-800 border border-blue-500/30' : 'bg-rose-500/20 text-rose-400 print:bg-rose-100 print:text-rose-800 border border-rose-500/30'
          }`}>
            <div className="flex items-center gap-2 font-bold text-sm md:text-base">
              {summary.difference === 0 ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span>{summary.difference === 0 ? 'الخزينة مطابقة' : summary.difference > 0 ? 'يوجد زيادة' : 'يوجد عجز'}</span>
            </div>
            <div className="text-xl font-black" dir="ltr">{formatNum(Math.abs(summary.difference))}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Input = ({ value, onChange, onBlur, type = "text", className = "", dir = "rtl", placeholder = "", list }: any) => (
  <input
    type={type}
    value={value === 0 && type === 'number' ? '' : value}
    onChange={onChange}
    onBlur={onBlur}
    onFocus={e => e.target.select()}
    onWheel={e => (e.target as HTMLElement).blur()}
    placeholder={placeholder}
    dir={dir}
    list={list}
    className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 focus:bg-white inset-shadow-sm transition-all text-sm placeholder-slate-400 ${className}`}
  />
);

const AddNameInput = ({ onAdd }: { onAdd: (name: string) => void }) => {
  const [val, setVal] = useState('');
  return (
    <div className="flex gap-2">
      <Input 
        value={val} 
        onChange={(e: any) => setVal(e.target.value)} 
        onKeyDown={(e: any) => {
          if (e.key === 'Enter' && val.trim()) {
            onAdd(val.trim());
            setVal('');
          }
        }} 
        placeholder="إضافة اسم جديد..." 
      />
      <button 
        onClick={() => {
          if (val.trim()) {
            onAdd(val.trim());
            setVal('');
          }
        }} 
        className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center shrink-0"
      >
        <Plus size={18} />
      </button>
    </div>
  );
};

const DynamicTable = ({ title, field, data, icon: Icon, colorClass, onAdd, onUpdate, onRemove, onArchive, onTogglePin, onToggleSummary, onManage, sumTransactions, formatNum, savedNames, onSaveName }: any) => {
  const [searchQuery, setSearchQuery] = useState('');
  const total = sumTransactions(data);
  const listId = `list-${field}`;
  
  const filteredData = data.filter((item: any) => 
    item.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.amount?.toString().includes(searchQuery)
  );

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden mb-6 transition-all duration-300 hover:shadow-md">
      <datalist id={listId}>
        {savedNames?.map((name: string) => <option key={name} value={name} />)}
      </datalist>
      
      <div className={`flex justify-between items-center px-5 py-4 border-b border-slate-100 ${colorClass}`}>
        <div className="flex items-center gap-2 font-bold text-lg">
          <Icon size={22} className="opacity-80" />
          {title}
        </div>
        <div className="font-bold bg-white/60 px-4 py-1.5 rounded-xl shadow-sm" dir="ltr">{formatNum(total)}</div>
      </div>
      
      {data.length > 0 && (
        <div className="px-5 pt-5 pb-3">
          <div className="relative group">
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none transition-opacity opacity-50 group-hover:opacity-100">
              <Search size={16} className="text-slate-500" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم أو المبلغ..."
              className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white transition-all placeholder-slate-400"
            />
          </div>
        </div>
      )}

      <div className="p-5 pt-2">
        {filteredData.map((item: any, index: number) => (
          <div key={item.id} className="flex gap-2.5 mb-2.5 items-center group/row">
            <span className="text-slate-300 text-xs w-4 font-bold select-none">{data.findIndex((d: any) => d.id === item.id) + 1}</span>
            <div className="flex-1">
              <Input 
                list={listId}
                value={item.name} 
                onChange={(e: any) => onUpdate(item.id, 'name', e.target.value)} 
                onBlur={(e: any) => onSaveName(field, e.target.value)}
                placeholder="البيان (اختر من القائمة أو اكتب)" 
                className="group-hover/row:border-blue-200/60"
              />
            </div>
            <div className="w-1/3">
              <Input type="number" value={item.amount} onChange={(e: any) => onUpdate(item.id, 'amount', Number(e.target.value))} placeholder="المبلغ" className="text-left font-bold group-hover/row:border-blue-200/60" dir="ltr" />
            </div>
            {onManage && (
              <button onClick={() => onManage(item)} title="إدارة الحساب وكشف الحساب" className="p-2.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-xl transition-all hover:scale-105 active:scale-95">
                <PlusCircle size={20} />
              </button>
            )}
            {onToggleSummary && (
              <button 
                onClick={() => onToggleSummary(item.id)} 
                title="إظهار منفصل في الملخص"
                className={`p-2.5 rounded-xl transition-all hover:scale-105 active:scale-95 ${item.showInSummary ? 'text-purple-600 bg-purple-50 shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                {item.showInSummary ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
            )}
            {onTogglePin && (
              <button 
                onClick={() => onTogglePin(item.id)} 
                title="تثبيت البند ليظهر يومياً"
                className={`p-2.5 rounded-xl transition-all hover:scale-105 active:scale-95 ${item.isPinned ? 'text-blue-600 bg-blue-50 shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                <Pin size={20} className={item.isPinned ? "fill-current" : ""} />
              </button>
            )}
            {onArchive && (
              <button onClick={() => onArchive(item.id)} title="تسوية وترحيل للأرشيف" className="p-2.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all hover:scale-105 active:scale-95">
                <CheckCircle2 size={20} />
              </button>
            )}
            <button onClick={() => onRemove(item.id)} title={onArchive ? "حذف بالخطأ (بدون أرشفة)" : "حذف البند"} className="p-2.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all hover:scale-105 active:scale-95 opacity-50 group-hover/row:opacity-100">
              <Trash2 size={20} />
            </button>
          </div>
        ))}
        {data.length === 0 && (
          <div className="text-center py-8 text-slate-400 flex flex-col items-center gap-2">
            <span className="bg-slate-50 text-slate-300 p-4 rounded-full"><Plus size={32} /></span>
            <span className="font-medium text-slate-500">اضغط على إضافة للبدء...</span>
          </div>
        )}
        <button onClick={onAdd} className="mt-4 flex items-center justify-center gap-2 w-full text-blue-600 hover:text-blue-800 text-sm font-bold px-4 py-3 rounded-xl border-2 border-dashed border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-95">
          <Plus size={18} /> إضافة بند جديد
        </button>
      </div>
    </div>
  );
};

const FundManagerModal = ({ fund, field, ledgerEntries, onUpdate, onAdjustFund, onEditHistory, onDeleteHistory, onArchive, onClose, formatNum, showToast }: any) => {
  const [amount, setAmount] = useState<number | ''>('');
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number | ''>('');
  const [editType, setEditType] = useState<'add' | 'sub'>('add');

  const handleAdd = () => {
    if (amount && Number(amount) > 0) {
      onAdjustFund(field, fund.id, Number(amount), 'add');
      setAmount('');
      showToast('تمت إضافة المبلغ بنجاح', 'success');
    }
  };

  const handleSubtract = () => {
    if (amount && Number(amount) > 0) {
      const newAmount = Number(fund.amount) - Number(amount);
      if (newAmount <= 0) {
        onClose();
        onArchive(field, fund.id);
      } else {
        onAdjustFund(field, fund.id, Number(amount), 'sub');
        setAmount('');
        showToast('تم خصم المبلغ بنجاح', 'success');
      }
    }
  };

  const personEntries = ledgerEntries.filter((e: any) => e.description.includes(fund.name));
  
  // Process legacy entries that don't have detailed history
  const legacyEntries = personEntries.filter((pe: any) => 
    !fund.history || !fund.history.some((h: any) => h.date.split(' ')[0] === pe.date)
  ).map((pe: any) => ({
    id: pe.id,
    date: pe.date,
    description: pe.description + ' (سجل قديم)',
    type: pe.type,
    amount: pe.amount,
    isLegacy: true
  }));

  const historyEntries = [
    ...legacyEntries,
    ...(fund.history || []).map((h: any) => ({
      id: h.id,
      date: h.date,
      description: h.type === 'add' ? 'إضافة مبلغ' : h.type === 'sub' ? 'خصم مبلغ' : 'رصيد افتتاحي',
      type: h.type === 'add' ? 'in' : h.type === 'sub' ? 'out' : 'neutral',
      amount: h.amount,
      isLegacy: false
    }))
  ].sort((a, b) => {
    // Sort logic to handle both simple dates (legacy) and timestamps (new)
    // Legacy format is usually DD/MM/YYYY, new is DD/MM/YYYY HH:MM:SS
    // Simple fallback: sort by ID or keep original order as fallback
    if (a.date.length > 10 && b.date.length > 10) {
       // Both new format, standard string compare usually works for YYYY-MM-DD, 
       // but ours is DD/MM/YYYY. For now, keep them in order of concatenation 
       // since old entries are likely older than new entries.
       return 0; // Maintain insertion order
    }
    return 0;
  });

  const handleCopy = () => {
    const text = `كشف حساب: ${fund.name}\nالرصيد الحالي: ${formatNum(fund.amount)}\n\nسجل الحركات التفصيلية:\n` +
      historyEntries.map((e: any) => `${e.date} | ${e.type === 'in' ? 'إضافة' : e.type === 'out' ? 'خصم' : 'معلق'} | ${formatNum(e.amount)}`).join('\n') +
      `\n\nملخص الأيام السابقة:\n` +
      personEntries.map((e: any) => `${e.date} | ${e.description} | ${formatNum(e.amount)}`).join('\n');
    navigator.clipboard.writeText(text);
    showToast('تم نسخ التقرير للحافظة', 'success');
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html dir="rtl">
          <head>
            <title>كشف حساب - ${fund.name}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
              th { background-color: #f4f4f4; }
              .header { margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
              .text-left { text-align: left; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>كشف حساب: ${fund.name}</h2>
              <h3>الرصيد الحالي: <span dir="ltr">${formatNum(fund.amount)}</span></h3>
            </div>
            
            ${historyEntries.length > 0 ? `
            <h3>سجل الحركات التفصيلية (الجديدة)</h3>
            <table>
              <thead>
                <tr>
                  <th>التاريخ والوقت</th>
                  <th>البيان</th>
                  <th>النوع</th>
                  <th>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                ${historyEntries.map((e: any) => `
                  <tr>
                    <td>${e.date}</td>
                    <td>${e.description}</td>
                    <td>${e.type === 'in' ? 'إضافة' : e.type === 'out' ? 'خصم' : 'معلق'}</td>
                    <td dir="ltr" class="text-left">${formatNum(e.amount)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            ` : ''}

            <h3>ملخص الأيام السابقة</h3>
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>البيان</th>
                  <th>النوع</th>
                  <th>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                ${personEntries.map((e: any) => `
                  <tr>
                    <td>${e.date}</td>
                    <td>${e.description}</td>
                    <td>${e.type === 'in' ? 'وارد' : e.type === 'out' ? 'منصرف' : 'معلق'}</td>
                    <td dir="ltr" class="text-left">${formatNum(e.amount)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <script>window.print();</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Calculator size={20} className="text-blue-600" /> 
            إدارة حساب: {fund.name}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-center mb-6">
            <p className="text-blue-600 font-medium mb-1">الرصيد الحالي</p>
            <p className="text-4xl font-black text-blue-800" dir="ltr">{formatNum(fund.amount)}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mb-8 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-bold text-slate-700 mb-2">المبلغ (إضافة أو خصم)</label>
              <Input 
                type="number" 
                value={amount} 
                onChange={(e: any) => setAmount(e.target.value)} 
                placeholder="أدخل المبلغ..." 
                className="text-center text-lg font-bold"
                dir="ltr"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={handleAdd} disabled={!amount} className="flex-1 sm:flex-none bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <Plus size={18} /> إضافة
              </button>
              <button onClick={handleSubtract} disabled={!amount} className="flex-1 sm:flex-none bg-rose-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <Trash2 size={18} /> خصم / تسديد
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-slate-800">كشف الحساب (من دفتر الأستاذ)</h4>
              <div className="flex gap-2">
                <button onClick={handleCopy} className="text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1">
                  <Copy size={16} /> نسخ
                </button>
                <button onClick={handlePrint} className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1">
                  <Printer size={16} /> طباعة
                </button>
              </div>
            </div>
            
            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden mb-6">
              <div className="bg-slate-100 p-3 font-bold text-slate-700 border-b border-slate-200">سجل الحركات التفصيلية (الجديدة)</div>
              <table className="w-full text-sm text-right">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200 bg-slate-100/50">
                    <th className="p-3 font-medium">التاريخ والوقت</th>
                    <th className="p-3 font-medium">البيان</th>
                    <th className="p-3 font-medium">النوع</th>
                    <th className="p-3 font-medium">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {historyEntries.map((entry: any) => (
                    <tr key={entry.id} className="border-b border-slate-100 last:border-0 hover:bg-white">
                      <td className="p-3">{entry.date}</td>
                      <td className="p-3">{entry.description}</td>
                      <td className="p-3">
                        {editingEntry === entry.id ? (
                          <select 
                            value={editType} 
                            onChange={(e: any) => setEditType(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                            <option value="add">إضافة</option>
                            <option value="sub">خصم</option>
                          </select>
                        ) : (
                          entry.type === 'in' ? <span className="text-emerald-600">إضافة</span> : 
                          entry.type === 'out' ? <span className="text-rose-600">خصم</span> :
                          <span className="text-amber-600">معلق</span>
                        )}
                      </td>
                      <td className="p-3 font-bold" dir="ltr">
                        {editingEntry === entry.id ? (
                          <div className="flex items-center gap-2 justify-end">
                            <input 
                              type="number" 
                              value={editAmount} 
                              onChange={(e: any) => setEditAmount(e.target.value)}
                              className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-left"
                              dir="ltr"
                            />
                            <button 
                              onClick={() => {
                                if (editAmount && Number(editAmount) > 0) {
                                  onEditHistory(field, fund.id, entry.id, Number(editAmount), editType);
                                  setEditingEntry(null);
                                  showToast('تم تعديل الحركة بنجاح', 'success');
                                }
                              }}
                              className="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded-lg"
                            >
                              <Check size={16} />
                            </button>
                            <button 
                              onClick={() => setEditingEntry(null)}
                              className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-1.5 rounded-lg"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 justify-end">
                            <span>{formatNum(entry.amount)}</span>
                            {!entry.isLegacy && (
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => {
                                    setEditingEntry(entry.id);
                                    setEditAmount(entry.amount);
                                    setEditType(entry.type === 'in' ? 'add' : 'sub');
                                  }}
                                  className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button 
                                  onClick={() => {
                                    if(window.confirm('هل أنت متأكد من حذف هذه الحركة؟')) {
                                      onDeleteHistory(field, fund.id, entry.id);
                                      showToast('تم حذف الحركة بنجاح', 'success');
                                    }
                                  }}
                                  className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {historyEntries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center p-8 bg-white">
                        <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                          <History size={32} className="opacity-50" />
                          <span className="font-medium">لا توجد حركات تفصيلية جديدة</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-100 p-4 font-bold text-slate-800 border-b border-slate-200 flex items-center justify-between">
                <span>ملخص الأيام السابقة (من دفتر الأستاذ)</span>
                <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-md font-medium">سجل قديم مجمع</span>
              </div>
              <table className="w-full text-sm text-right">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200 bg-slate-100/50">
                    <th className="p-3 font-semibold pb-4">التاريخ</th>
                    <th className="p-3 font-semibold pb-4">البيان</th>
                    <th className="p-3 font-semibold pb-4">النوع</th>
                    <th className="p-3 font-semibold pb-4">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {personEntries.map((entry: any) => (
                    <tr key={entry.id} className="border-b border-slate-100 last:border-0 hover:bg-white transition-colors duration-200 group">
                      <td className="p-3 text-slate-600">{entry.date}</td>
                      <td className="p-3 font-medium text-slate-700">{entry.description}</td>
                      <td className="p-3">
                        {entry.type === 'in' ? <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md font-bold">وارد</span> : 
                         entry.type === 'out' ? <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded-md font-bold">منصرف</span> :
                         <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded-md font-bold">معلق</span>}
                      </td>
                      <td className="p-3 font-bold text-slate-800" dir="ltr">{formatNum(entry.amount)}</td>
                    </tr>
                  ))}
                  {personEntries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center p-8 bg-white">
                        <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                          <BookOpen size={32} className="opacity-50" />
                          <span className="font-medium">لا توجد حركات سابقة مسجلة بهذا الاسم</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [state, setState] = useState<AppState>(getInitialState());
  const [history, setHistory] = useState<DailySnapshot[]>([]);
  const [activeTab, setActiveTab] = useState<'sales' | 'payments' | 'pending' | 'cash' | 'archive' | 'history' | 'ledger' | 'settings'>('sales');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isInitialLoad = useRef(true);
  
  // Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<'summary' | 'detailed'>('summary');
  const [exportFormat, setExportFormat] = useState<'pdf' | 'image'>('pdf');
  
  // Ledger Filter State
  const [ledgerFilter, setLedgerFilter] = useState({
    startDate: '',
    endDate: '',
    category: 'all',
    search: ''
  });

  // Managing Fund State
  const [managingFund, setManagingFund] = useState<{item: Transaction, field: 'pendingFundsOwedToUs' | 'pendingFundsOwedByUs'} | null>(null);

  // UI State
  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{message: string, onConfirm: () => void} | null>(null);
  
  // Modals State
  const [activeNetworkPosId, setActiveNetworkPosId] = useState<string | null>(null);

  const showToast = (message: string, type: 'success'|'error' = 'success') => {
    setToast({message, type});
    setTimeout(() => setToast(null), 3000);
  };
  const [viewSnapshot, setViewSnapshot] = useState<DailySnapshot | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const docRef = doc(db, `users/${currentUser.uid}/treasury/state`);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as AppState;
            if (data.posData) {
              data.posData = data.posData.map(p => ({
                ...p,
                networks: Array.isArray(p.networks) ? p.networks : [(p as any).network || 0]
              }));
            }
            setState(data);
          }
          
          // Load history
          const historyRef = collection(db, `users/${currentUser.uid}/treasury_history`);
          const q = query(historyRef, orderBy('timestamp', 'desc'));
          const historySnap = await getDocs(q);
          const historyData = historySnap.docs.map(d => ({ id: d.id, ...d.data() } as DailySnapshot));
          setHistory(historyData);
          
        } catch (error) {
          console.error("Error loading data from Firebase:", error);
        }
      } else {
        // Fallback to local storage if not logged in
        const saved = localStorage.getItem('treasury_app_data');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.posData) {
              parsed.posData = parsed.posData.map((p: any) => ({
                ...p,
                networks: Array.isArray(p.networks) ? p.networks : [p.network || 0]
              }));
            }
            setState(parsed);
          } catch (e) {
            console.error("Failed to load local data", e);
          }
        }
        const savedHistory = localStorage.getItem('treasury_history');
        if (savedHistory) {
          try {
            setHistory(JSON.parse(savedHistory));
          } catch (e) {
            console.error("Failed to load local history", e);
          }
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
      showToast("فشل تسجيل الدخول", "error");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setState(getInitialState());
      setHistory([]);
      showToast("تم تسجيل الخروج بنجاح", "success");
    } catch (error) {
      console.error("Logout failed", error);
      showToast("فشل تسجيل الخروج", "error");
    }
  };

  const [printView, setPrintView] = useState<'none' | 'daily' | 'pending'>('none');

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintView('none');
      setIsExporting(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const handleExport = () => {
    if (exportMode === 'summary') {
      setPrintView('daily');
    } else {
      // For detailed mode, we use the app's native print styles (all tabs become visible)
      setPrintView('none'); 
    }
    setIsExporting(true);
    setShowExportModal(false);
    
    setTimeout(() => {
      window.print();
      // For detailed mode, we reset isExporting immediately after print dialog
      if (exportMode === 'detailed') {
        setTimeout(() => setIsExporting(false), 500);
      }
    }, 300);
  };

  const handlePrintPending = () => {
    setPrintView('pending');
    setTimeout(() => window.print(), 300);
  };

  const saveStateToFirebase = async (newState: AppState, isAutoSave = false) => {
    if (!user) {
      localStorage.setItem('treasury_app_data', JSON.stringify(newState));
      if (!isAutoSave) showToast('تم الحفظ محلياً (يرجى تسجيل الدخول للحفظ السحابي)', 'success');
      return;
    }
    setSaving(true);
    try {
      const sanitizedState = JSON.parse(JSON.stringify(newState));
      await setDoc(doc(db, `users/${user.uid}/treasury/state`), sanitizedState);
      if (!isAutoSave) showToast('تم حفظ البيانات بنجاح في السحابة!', 'success');
    } catch (error) {
      console.error("Error saving to Firebase:", error);
      if (!isAutoSave) showToast('حدث خطأ أثناء الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Auto-save effect
  useEffect(() => {
    if (loading) {
      isInitialLoad.current = true;
      return;
    }
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    
    const timer = setTimeout(() => {
      saveStateToFirebase(state, true);
    }, 2000);

    return () => clearTimeout(timer);
  }, [state, loading]);

  const handleSave = () => {
    saveStateToFirebase(state);
  };

  const handlePrint = () => {
    window.print();
  };

  const currentSummary = getSummary(state);

  const handleNewDay = () => {
    setConfirmDialog({
      message: 'بدء يوم جديد؟ سيتم حفظ اليوم الحالي في السجل، وترحيل الرصيد الفعلي والأموال المعلقة لليوم التالي وتصفير باقي الخانات.',
      onConfirm: async () => {
        const snapshot: Omit<DailySnapshot, 'id'> = {
          timestamp: Date.now(),
          state: { ...state },
          summary: currentSummary
        };

        const newState = getInitialState();
        const keepPinned = (arr: Transaction[]) => arr.filter(t => t.isPinned).map(t => ({ ...t, amount: 0 }));

        const nextState = {
          ...newState,
          date: new Date().toLocaleDateString('en-GB'),
          previousBalance: currentSummary.actualCash,
          savedNames: state.savedNames,
          archivedPendingFunds: state.archivedPendingFunds,
          
          expenseRefunds: keepPinned(state.expenseRefunds),
          companyPayments: keepPinned(state.companyPayments),
          expenses: keepPinned(state.expenses),
          customerTransfers: keepPinned(state.customerTransfers),
          cashDeposits: keepPinned(state.cashDeposits),
          customCashAmounts: keepPinned(state.customCashAmounts),
          
          pendingFundsOwedToUs: state.pendingFundsOwedToUs,
          pendingFundsOwedByUs: state.pendingFundsOwedByUs,

          posData: state.posData.map(p => ({ ...p, sales: 0, returns: 0, networks: [] })),
        };
        
        setState(nextState);
        
        if (user) {
          try {
            const sanitizedSnapshot = JSON.parse(JSON.stringify(snapshot));
            const docRef = await addDoc(collection(db, `users/${user.uid}/treasury_history`), sanitizedSnapshot);
            setHistory(prev => [{ id: docRef.id, ...snapshot }, ...prev]);
            
            const sanitizedNextState = JSON.parse(JSON.stringify(nextState));
            await setDoc(doc(db, `users/${user.uid}/treasury/state`), sanitizedNextState);
            showToast('تم التقفيل بنجاح وبدء يوم جديد!', 'success');
          } catch (e) {
            console.error("Error saving history to Firebase", e);
            showToast('حدث خطأ أثناء التقفيل.', 'error');
          }
        } else {
          const newSnap = { id: generateId(), ...snapshot };
          const newHistory = [newSnap, ...history];
          setHistory(newHistory);
          localStorage.setItem('treasury_history', JSON.stringify(newHistory));
          localStorage.setItem('treasury_app_data', JSON.stringify(nextState));
          showToast('تم التقفيل محلياً بنجاح!', 'success');
        }
      }
    });
  };

  const updateField = (field: keyof AppState, value: any) => setState(prev => ({ ...prev, [field]: value }));

  const addTransaction = (field: keyof AppState) => {
    setState(prev => ({ ...prev, [field]: [...(prev[field] as Transaction[]), { id: generateId(), name: '', amount: 0 }] }));
  };

  const updateTransaction = (field: keyof AppState, id: string, key: 'name' | 'amount', value: string | number) => {
    setState(prev => ({ ...prev, [field]: (prev[field] as Transaction[]).map(t => t.id === id ? { ...t, [key]: value } : t) }));
  };

  const adjustFundAmount = (field: keyof AppState, id: string, amountChange: number, actionType: 'add' | 'sub') => {
    setState(prev => {
      const list = prev[field] as Transaction[];
      return {
        ...prev,
        [field]: list.map(t => {
          if (t.id === id) {
            const newHistory = [...(t.history || [])];
            newHistory.push({
              id: generateId(),
              date: new Date().toLocaleString('ar-EG'),
              amount: amountChange,
              type: actionType
            });
            return { 
              ...t, 
              amount: actionType === 'add' ? Number(t.amount) + amountChange : Number(t.amount) - amountChange, 
              history: newHistory 
            };
          }
          return t;
        })
      };
    });
  };

  const editFundHistoryEntry = (field: keyof AppState, fundId: string, entryId: string, newAmount: number, newType: 'add' | 'sub') => {
    setState(prev => {
      const list = prev[field] as Transaction[];
      return {
        ...prev,
        [field]: list.map(t => {
          if (t.id === fundId && t.history) {
            const entryIndex = t.history.findIndex(h => h.id === entryId);
            if (entryIndex > -1) {
              const oldEntry = t.history[entryIndex];
              const newHistory = [...t.history];
              newHistory[entryIndex] = { ...oldEntry, amount: newAmount, type: newType };
              
              let currentAmount = Number(t.amount);
              if (oldEntry.type === 'add') currentAmount -= oldEntry.amount;
              else if (oldEntry.type === 'sub') currentAmount += oldEntry.amount;
              
              if (newType === 'add') currentAmount += newAmount;
              else if (newType === 'sub') currentAmount -= newAmount;

              return { ...t, amount: currentAmount, history: newHistory };
            }
          }
          return t;
        })
      };
    });
  };

  const deleteFundHistoryEntry = (field: keyof AppState, fundId: string, entryId: string) => {
    setState(prev => {
      const list = prev[field] as Transaction[];
      return {
        ...prev,
        [field]: list.map(t => {
          if (t.id === fundId && t.history) {
            const entryIndex = t.history.findIndex(h => h.id === entryId);
            if (entryIndex > -1) {
              const oldEntry = t.history[entryIndex];
              const newHistory = t.history.filter(h => h.id !== entryId);
              
              let currentAmount = Number(t.amount);
              if (oldEntry.type === 'add') currentAmount -= oldEntry.amount;
              else if (oldEntry.type === 'sub') currentAmount += oldEntry.amount;

              return { ...t, amount: currentAmount, history: newHistory };
            }
          }
          return t;
        })
      };
    });
  };

  const removeTransaction = (field: keyof AppState, id: string) => {
    setState(prev => ({ ...prev, [field]: (prev[field] as Transaction[]).filter(t => t.id !== id) }));
  };

  const togglePin = (field: keyof AppState, id: string) => {
    setState(prev => ({ ...prev, [field]: (prev[field] as Transaction[]).map(t => t.id === id ? { ...t, isPinned: !t.isPinned } : t) }));
  };

  const toggleSummary = (field: keyof AppState, id: string) => {
    setState(prev => ({ ...prev, [field]: (prev[field] as Transaction[]).map(t => t.id === id ? { ...t, showInSummary: !t.showInSummary } : t) }));
  };

  const archivePendingFund = (field: 'pendingFundsOwedToUs' | 'pendingFundsOwedByUs', id: string) => {
    setConfirmDialog({
      message: 'هل أنت متأكد من تسوية هذا المبلغ ونقله للأرشيف؟',
      onConfirm: () => {
        setState(prev => {
          const item = prev[field].find(t => t.id === id);
          if (!item) return prev;
          const archivedItem: ArchivedFund = {
            ...item,
            type: field === 'pendingFundsOwedToUs' ? 'toUs' : 'byUs',
            dateSettled: prev.date
          };
          return {
            ...prev,
            [field]: prev[field].filter(t => t.id !== id),
            archivedPendingFunds: [...(prev.archivedPendingFunds || []), archivedItem]
          };
        });
        showToast('تم نقل المبلغ للأرشيف بنجاح', 'success');
      }
    });
  };

  const addSavedName = (field: keyof AppState['savedNames'], name: string) => {
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    setState(prev => {
      const list = prev.savedNames[field] || [];
      if (list.includes(trimmed)) return prev;
      return { ...prev, savedNames: { ...prev.savedNames, [field]: [...list, trimmed] } };
    });
  };

  const removeSavedName = (field: keyof AppState['savedNames'], name: string) => {
    setState(prev => ({ ...prev, savedNames: { ...prev.savedNames, [field]: (prev.savedNames[field] || []).filter(n => n !== name) } }));
  };

  const generateLedgerEntries = () => {
    const entries: { id: string; date: string; description: string; type: 'in' | 'out' | 'neutral'; amount: number; category: string }[] = [];
    
    const prevPendingToUs: Record<string, number> = {};
    const prevPendingByUs: Record<string, number> = {};
    const processedHistoryIds = new Set<string>();

    const processState = (s: AppState, dateStr: string) => {
      s.posData.forEach(pos => {
        if (pos.sales > 0) entries.push({ id: generateId(), date: dateStr, description: `مبيعات - ${pos.name}`, type: 'in', amount: pos.sales, category: 'مبيعات' });
        if (pos.returns > 0) entries.push({ id: generateId(), date: dateStr, description: `مرتجعات - ${pos.name}`, type: 'out', amount: pos.returns, category: 'مرتجعات' });
        const networksTotal = sumNetworks(pos.networks);
        if (networksTotal > 0) entries.push({ id: generateId(), date: dateStr, description: `شبكات - ${pos.name}`, type: 'out', amount: networksTotal, category: 'شبكات' });
      });

      s.expenseRefunds.forEach(t => t.amount > 0 && entries.push({ id: generateId(), date: dateStr, description: t.name || 'مردود مصروف', type: 'in', amount: t.amount, category: 'مردود مصروفات' }));
      s.companyPayments.forEach(t => t.amount > 0 && entries.push({ id: generateId(), date: dateStr, description: t.name || 'سداد شركة', type: 'out', amount: t.amount, category: 'سداد شركات' }));
      s.expenses.forEach(t => t.amount > 0 && entries.push({ id: generateId(), date: dateStr, description: t.name || 'مصروف', type: 'out', amount: t.amount, category: 'مصروفات' }));
      s.customerTransfers.forEach(t => t.amount > 0 && entries.push({ id: generateId(), date: dateStr, description: t.name || 'تحويل عميل', type: 'out', amount: t.amount, category: 'تحويلات عملاء' }));
      s.cashDeposits.forEach(t => t.amount > 0 && entries.push({ id: generateId(), date: dateStr, description: t.name || 'إيداع', type: 'out', amount: t.amount, category: 'إيداعات بنكية' }));
      
      s.pendingFundsOwedToUs.forEach(t => {
        const prevAmount = prevPendingToUs[t.id] || 0;
        const delta = t.amount - prevAmount;
        
        let historyNetEffect = 0;
        if (t.history) {
          t.history.forEach(h => {
            if (!processedHistoryIds.has(h.id)) {
              processedHistoryIds.add(h.id);
              historyNetEffect += (h.type === 'add' ? h.amount : -h.amount);
              entries.push({
                id: h.id,
                date: h.date,
                description: `${t.name || 'معلق لنا'} - ${h.type === 'add' ? 'إضافة' : h.type === 'sub' ? 'خصم' : 'رصيد افتتاحي'}`,
                type: 'neutral',
                amount: h.amount,
                category: 'أموال معلقة لنا'
              });
            }
          });
        }

        const remainingDelta = delta - historyNetEffect;
        if (remainingDelta !== 0) {
          const descSuffix = prevAmount === 0 ? '' : (remainingDelta > 0 ? ' (إضافة)' : ' (خصم)');
          entries.push({ id: generateId(), date: dateStr, description: `${t.name || 'معلق لنا'}${descSuffix}`, type: 'neutral', amount: Math.abs(remainingDelta), category: 'أموال معلقة لنا' });
        }
        prevPendingToUs[t.id] = t.amount;
      });
      
      s.pendingFundsOwedByUs.forEach(t => {
        const prevAmount = prevPendingByUs[t.id] || 0;
        const delta = t.amount - prevAmount;
        
        let historyNetEffect = 0;
        if (t.history) {
          t.history.forEach(h => {
            if (!processedHistoryIds.has(h.id)) {
              processedHistoryIds.add(h.id);
              historyNetEffect += (h.type === 'add' ? h.amount : -h.amount);
              entries.push({
                id: h.id,
                date: h.date,
                description: `${t.name || 'معلق علينا'} - ${h.type === 'add' ? 'إضافة' : h.type === 'sub' ? 'خصم' : 'رصيد افتتاحي'}`,
                type: 'neutral',
                amount: h.amount,
                category: 'أموال معلقة علينا'
              });
            }
          });
        }

        const remainingDelta = delta - historyNetEffect;
        if (remainingDelta !== 0) {
          const descSuffix = prevAmount === 0 ? '' : (remainingDelta > 0 ? ' (إضافة)' : ' (خصم)');
          entries.push({ id: generateId(), date: dateStr, description: `${t.name || 'معلق علينا'}${descSuffix}`, type: 'neutral', amount: Math.abs(remainingDelta), category: 'أموال معلقة علينا' });
        }
        prevPendingByUs[t.id] = t.amount;
      });

      s.archivedPendingFunds?.forEach(t => {
        if (t.dateSettled === dateStr) {
           let historyNetEffect = 0;
           if (t.history) {
             t.history.forEach(h => {
               if (!processedHistoryIds.has(h.id)) {
                 processedHistoryIds.add(h.id);
                 historyNetEffect += (h.type === 'add' ? h.amount : -h.amount);
                 entries.push({
                   id: h.id,
                   date: h.date,
                   description: `${t.name || (t.type === 'toUs' ? 'معلق لنا' : 'معلق علينا')} - ${h.type === 'add' ? 'إضافة' : h.type === 'sub' ? 'خصم' : 'رصيد افتتاحي'}`,
                   type: 'neutral',
                   amount: h.amount,
                   category: t.type === 'toUs' ? 'أموال معلقة لنا' : 'أموال معلقة علينا'
                 });
               }
             });
           }

           const prevToUs = prevPendingToUs[t.id];
           if (prevToUs !== undefined && prevToUs > 0 && t.type === 'toUs') {
             const remainingDelta = 0 - prevToUs - historyNetEffect;
             if (remainingDelta !== 0) {
                entries.push({ id: generateId(), date: dateStr, description: `${t.name || 'معلق لنا'} (تسوية/أرشيف)`, type: 'neutral', amount: Math.abs(remainingDelta), category: 'أموال معلقة لنا' });
             }
             prevPendingToUs[t.id] = 0;
           }
           const prevByUs = prevPendingByUs[t.id];
           if (prevByUs !== undefined && prevByUs > 0 && t.type === 'byUs') {
             const remainingDelta = 0 - prevByUs - historyNetEffect;
             if (remainingDelta !== 0) {
                entries.push({ id: generateId(), date: dateStr, description: `${t.name || 'معلق علينا'} (تسوية/أرشيف)`, type: 'neutral', amount: Math.abs(remainingDelta), category: 'أموال معلقة علينا' });
             }
             prevPendingByUs[t.id] = 0;
           }
        }
      });
    };

    // Process history chronologically
    const chronologicalHistory = [...history].reverse();
    chronologicalHistory.forEach(snap => processState(snap.state, snap.state.date));
    // Process current state
    processState(state, state.date);

    return entries;
  };

  const renderTable = (title: string, field: keyof AppState, icon: any, colorClass: string, isPending = false, canShowInSummary = false) => (
    <DynamicTable 
      title={title} 
      field={field}
      data={state[field]} 
      icon={icon} 
      colorClass={colorClass} 
      onAdd={() => addTransaction(field)}
      onUpdate={(id: string, key: string, val: any) => updateTransaction(field, id, key as any, val)}
      onRemove={(id: string) => removeTransaction(field, id)}
      onTogglePin={isPending ? undefined : (id: string) => togglePin(field, id)}
      onToggleSummary={canShowInSummary ? (id: string) => toggleSummary(field, id) : undefined}
      onArchive={isPending ? (id: string) => archivePendingFund(field as any, id) : undefined}
      onManage={isPending ? (item: Transaction) => setManagingFund({ item, field: field as any }) : undefined}
      sumTransactions={sumTransactions}
      formatNum={formatNum}
      savedNames={state.savedNames[field as keyof AppState['savedNames']]}
      onSaveName={addSavedName}
    />
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  const activePos = state.posData.find(p => p.id === activeNetworkPosId);

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-800 font-sans ${printView !== 'none' ? 'print:bg-white' : ''}`} dir="rtl">
      <div className={printView !== 'none' ? 'print:hidden' : ''}>
        <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 text-white p-2 rounded-xl"><Calculator size={24} /></div>
              <h1 className="font-bold text-xl text-slate-900">الخزينة الذكية</h1>
            </div>
            <div className="flex items-center gap-3">
              {!user ? (
                <button onClick={handleLogin} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors font-medium shadow-sm">
                  <LogIn size={18} /> <span className="hidden sm:inline">تسجيل الدخول للحفظ السحابي</span>
                </button>
              ) : (
                <>
                  <div className="hidden md:flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    {user.email}
                  </div>
                  <button onClick={handleLogout} className="flex items-center gap-2 text-slate-500 hover:text-rose-600 px-2 py-2 rounded-lg hover:bg-rose-50 transition-colors" title="تسجيل الخروج">
                    <LogOut size={18} />
                  </button>
                  <button onClick={handleSave} disabled={saving} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold shadow-sm disabled:opacity-50 hover:shadow-md active:scale-95 ${saving ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'}`}>
                    {saving ? <Save size={20} className="animate-pulse" /> : <CheckCircle2 size={20} />}
                    <span className="hidden sm:inline">{saving ? 'جاري الحفظ...' : 'تم الحفظ تلقائياً'}</span>
                  </button>
                </>
              )}
              <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 transition-all font-bold shadow-sm hover:shadow-md active:scale-95">
                <Download size={20} /> <span className="hidden sm:inline">تصدير</span>
              </button>
              <button onClick={handleNewDay} className="flex items-center gap-2 bg-rose-50 text-rose-700 border border-rose-200 px-4 py-2 rounded-xl hover:bg-rose-100/80 transition-all font-bold shadow-sm hover:shadow-md active:scale-95">
                <FilePlus size={20} /> <span className="hidden sm:inline">تقفيل ويوم جديد</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="export-container" className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${isExporting ? 'bg-white' : ''}`}>
        {isExporting && (
          <div className="text-center mb-8 pb-4 border-b border-slate-200">
            <h1 className="text-2xl font-bold text-slate-900">الخزينة الذكية - تقرير التسوية</h1>
            <p className="text-slate-500 mt-2">تاريخ: {state.date}</p>
            <p className="text-slate-500">نوع التقرير: {exportMode === 'detailed' ? 'مفصل' : 'ملخص'}</p>
          </div>
        )}

        {(!isExporting || exportMode === 'detailed') && (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-wrap gap-6 items-center print:hidden">
            <div className="flex items-center gap-3">
              <label className="font-semibold text-slate-600">تاريخ اليوم:</label>
              <Input value={state.date} onChange={(e: any) => updateField('date', e.target.value)} className="w-40 text-center font-bold" />
            </div>
            <div className="flex items-center gap-3">
              <label className="font-semibold text-slate-600">رصيد أول المدة:</label>
              <Input type="number" value={state.previousBalance} onChange={(e: any) => updateField('previousBalance', Number(e.target.value))} className="w-40 text-left font-bold text-blue-600 bg-blue-50" dir="ltr" />
            </div>
          </div>
        )}

        <div className={`flex flex-col lg:flex-row gap-8 ${isExporting && exportMode === 'summary' ? 'justify-center' : ''}`}>
          {(!isExporting || exportMode === 'detailed') && (
            <div className="flex-1 min-w-0 print:w-full">
              {!isExporting && (
                <div className="flex overflow-x-auto gap-2 mb-6 pb-2 print:hidden scrollbar-hide">
                  {[
                    { id: 'sales', label: 'الإيرادات والمبيعات', icon: Receipt },
                    { id: 'payments', label: 'المخصومات والمدفوعات', icon: ArrowUpRight },
                    { id: 'pending', label: 'الأموال المعلقة', icon: AlertCircle },
                    { id: 'cash', label: 'جرد الخزينة', icon: Wallet },
                    { id: 'history', label: 'سجل الأيام السابقة', icon: CalendarDays },
                    { id: 'ledger', label: 'دفتر الأستاذ (التقارير)', icon: BookOpen },
                    { id: 'archive', label: 'أرشيف المعلقات', icon: History },
                    { id: 'settings', label: 'إعدادات القوائم', icon: Settings },
                    { id: 'analytics', label: 'تحليلات المبيعات', icon: BarChart3 },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold transition-all whitespace-nowrap transform hover:scale-[1.02] active:scale-95 ${
                        activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <tab.icon size={18} className={activeTab === tab.id ? 'animate-pulse' : ''} /> {tab.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="print:block">
                {/* Sales Tab */}
                <div className={`${activeTab === 'sales' || (isExporting && exportMode === 'detailed') ? 'block' : 'hidden'} print:block mb-6`}>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                  <div className="bg-emerald-50 text-emerald-800 p-4 border-b border-emerald-100 flex items-center gap-2 font-bold">
                    <Receipt size={20} /> مبيعات نقاط البيع
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-sm text-right">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-200">
                          <th className="pb-3 font-medium">نقطة البيع</th>
                          <th className="pb-3 font-medium w-1/5">إجمالي المبيعات</th>
                          <th className="pb-3 font-medium w-1/5">المرتجعات</th>
                          <th className="pb-3 font-medium w-1/5">صافي المبيعات</th>
                          <th className="pb-3 font-medium w-1/5">الشبكات (تخصم)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.posData.map((pos, index) => {
                          const net = pos.sales - pos.returns;
                          const posNetworksTotal = sumNetworks(pos.networks);
                          return (
                            <tr key={pos.id} className="border-b border-slate-100 last:border-0">
                              <td className="py-2 pr-2">
                                <Input value={pos.name} onChange={(e: any) => {
                                  const newData = [...state.posData];
                                  newData[index].name = e.target.value;
                                  updateField('posData', newData);
                                }} />
                              </td>
                              <td className="py-2 px-1"><Input type="number" value={pos.sales} onChange={(e: any) => {
                                  const newData = [...state.posData];
                                  newData[index].sales = Number(e.target.value);
                                  updateField('posData', newData);
                                }} dir="ltr" className="text-left" /></td>
                              <td className="py-2 px-1"><Input type="number" value={pos.returns} onChange={(e: any) => {
                                  const newData = [...state.posData];
                                  newData[index].returns = Number(e.target.value);
                                  updateField('posData', newData);
                                }} dir="ltr" className="text-left text-rose-600" /></td>
                              <td className="py-2 px-2 text-left font-bold text-emerald-600" dir="ltr">{formatNum(net)}</td>
                              <td className="py-2 px-1">
                                <button 
                                  onClick={() => setActiveNetworkPosId(pos.id)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-left hover:bg-amber-50 hover:border-amber-300 transition-colors text-amber-700 font-medium flex justify-between items-center"
                                  dir="ltr"
                                >
                                  <span>{formatNum(posNetworksTotal)}</span>
                                  <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                                    {pos.networks.length} مبالغ
                                  </span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 font-bold text-slate-800">
                          <td className="py-3 px-2">الإجمالي</td>
                          <td className="py-3 px-2 text-left" dir="ltr">{formatNum(currentSummary.totalSales)}</td>
                          <td className="py-3 px-2 text-left text-rose-600" dir="ltr">{formatNum(currentSummary.totalReturns)}</td>
                          <td className="py-3 px-2 text-left text-emerald-600" dir="ltr">{formatNum(currentSummary.netSales)}</td>
                          <td className="py-3 px-2 text-left text-amber-600" dir="ltr">{formatNum(currentSummary.totalNetworks)}</td>
                        </tr>
                      </tfoot>
                    </table>
                    <button onClick={() => updateField('posData', [...state.posData, { id: generateId(), name: '', sales: 0, returns: 0, networks: [] }])} className="mt-4 flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                      <Plus size={16} /> إضافة نقطة بيع
                    </button>
                  </div>
                </div>
                {renderTable('مردود مصروف (يضاف للخزينة)', 'expenseRefunds', Undo2, 'bg-emerald-50 text-emerald-800')}
              </div>

              {/* Payments Tab */}
              <div className={`${activeTab === 'payments' || (isExporting && exportMode === 'detailed') ? 'block' : 'hidden'} print:block mb-6`}>
                {renderTable('تحويلات العملاء (شبكة/بنكي تخصم من الخزينة)', 'customerTransfers', CreditCard, 'bg-amber-50 text-amber-800')}
                {renderTable('سداد شركات وموردين', 'companyPayments', ArrowUpRight, 'bg-rose-50 text-rose-800')}
                {/* Expenses table with showInSummary toggle */}
                {renderTable('مصروفات متنوعة (رواتب، نثريات...)', 'expenses', ArrowUpRight, 'bg-rose-50 text-rose-800', false, true)}
                {renderTable('إيداعات بنكية', 'cashDeposits', Wallet, 'bg-blue-50 text-blue-800')}
              </div>

              {/* Pending Funds Tab */}
              <div className={`${activeTab === 'pending' || (isExporting && exportMode === 'detailed') ? 'block' : 'hidden'} print:block mb-6`}>
                {!isExporting && (
                  <div className="flex flex-col sm:flex-row justify-between mb-6 gap-4">
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm flex gap-3 items-start flex-1">
                      <AlertCircle className="shrink-0 mt-0.5" size={18} />
                      <p>
                        <strong>الأموال المعلقة:</strong> تُرحل بالكامل لليوم التالي حتى يتم تسويتها. <br/>
                        - لإضافة أكثر من مبلغ لنفس الشخص/الشركة، اضغط "إضافة بند" واكتب نفس الاسم.<br/>
                        - عند السداد، اضغط على <strong>علامة الصح الخضراء</strong> لتسوية المبلغ ونقله إلى <strong>الأرشيف</strong>.
                      </p>
                    </div>
                    <button onClick={handlePrintPending} className="flex h-fit items-center gap-2 bg-amber-600 text-white px-5 py-3 rounded-xl hover:bg-amber-700 transition-colors font-bold shadow-sm whitespace-nowrap">
                      <Printer size={20} /> طباعة الأموال المعلقة
                    </button>
                  </div>
                )}
                {renderTable('أموال معلقة لنا (تُحسب ككاش بالخزينة)', 'pendingFundsOwedToUs', ArrowDownRight, 'bg-amber-100 text-amber-900', true)}
                {renderTable('أموال معلقة علينا (تُخصم من الخزينة)', 'pendingFundsOwedByUs', ArrowUpRight, 'bg-slate-100 text-slate-800', true)}
              </div>

              {/* Cash Count Tab */}
              <div className={`${activeTab === 'cash' || (isExporting && exportMode === 'detailed') ? 'block' : 'hidden'} print:block mb-6`}>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                  <div className="bg-indigo-50 text-indigo-800 p-4 border-b border-indigo-100 flex items-center justify-between font-bold">
                    <div className="flex items-center gap-2"><Wallet size={20} /> جرد الخزينة (الفئات النقدية)</div>
                    <div className="bg-white/60 px-3 py-1 rounded-lg" dir="ltr">{formatNum(currentSummary.physicalDenominations)}</div>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                    {['500', '200', '100', '50', '20', '10', '5', '1'].map(denom => (
                      <div key={denom} className="flex items-center gap-4 p-2 hover:bg-slate-50 rounded-lg transition-colors">
                        <div className="w-16 font-bold text-slate-700 bg-slate-100 text-center py-2 rounded-lg border border-slate-200">{denom}</div>
                        <div className="text-slate-400">×</div>
                        <div className="flex-1">
                          <Input type="number" value={state.cashDenominations[denom]} onChange={(e: any) => setState(prev => ({ ...prev, cashDenominations: { ...prev.cashDenominations, [denom]: Number(e.target.value) } }))} className="text-center" />
                        </div>
                        <div className="text-slate-400">=</div>
                        <div className="w-24 text-left font-bold text-indigo-600" dir="ltr">{formatNum(Number(denom) * (state.cashDenominations[denom] || 0))}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {renderTable('مبالغ نقدية مجمعة (رزم أو مبالغ معدودة مسبقاً)', 'customCashAmounts', Layers, 'bg-indigo-50 text-indigo-800')}
              </div>

              {/* History Tab */}
              <div className={`${activeTab === 'history' && !isExporting ? 'block' : 'hidden'} print:hidden`}>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                  <div className="bg-blue-50 text-blue-800 p-4 flex items-center gap-2 font-bold border-b border-blue-100">
                    <CalendarDays size={20} /> سجل الأيام السابقة
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-sm text-right">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-200">
                          <th className="pb-3 font-medium">التاريخ</th>
                          <th className="pb-3 font-medium">الوارد</th>
                          <th className="pb-3 font-medium">المنصرف</th>
                          <th className="pb-3 font-medium">الرصيد الفعلي</th>
                          <th className="pb-3 font-medium">العجز/الزيادة</th>
                          <th className="pb-3 font-medium">إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map(snap => (
                          <tr key={snap.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 font-bold">{snap.state.date}</td>
                            <td className="py-3 text-emerald-600" dir="ltr">{formatNum(snap.summary.totalCashIn)}</td>
                            <td className="py-3 text-rose-600" dir="ltr">{formatNum(snap.summary.totalCashOut)}</td>
                            <td className="py-3 font-bold" dir="ltr">{formatNum(snap.summary.actualCash)}</td>
                            <td className="py-3" dir="ltr">
                              <span className={`px-2 py-1 rounded-md text-xs font-bold ${snap.summary.difference === 0 ? 'bg-emerald-100 text-emerald-700' : snap.summary.difference > 0 ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
                                {formatNum(snap.summary.difference)}
                              </span>
                            </td>
                            <td className="py-3">
                              <button onClick={() => setViewSnapshot(snap)} className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold flex items-center gap-1">
                                <Eye size={14} /> عرض التفاصيل
                              </button>
                            </td>
                          </tr>
                        ))}
                        {history.length === 0 && (
                          <tr><td colSpan={6} className="text-center py-8 text-slate-400">لا يوجد سجل للأيام السابقة</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Ledger Tab */}
              <div className={`${activeTab === 'ledger' && !isExporting ? 'block' : 'hidden'} print:hidden`}>
                
                {/* Filters */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6">
                  <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-bold text-slate-700 mb-2">من تاريخ</label>
                      <Input type="date" value={ledgerFilter.startDate} onChange={(e: any) => setLedgerFilter(p => ({...p, startDate: e.target.value}))} dir="ltr" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-bold text-slate-700 mb-2">إلى تاريخ</label>
                      <Input type="date" value={ledgerFilter.endDate} onChange={(e: any) => setLedgerFilter(p => ({...p, endDate: e.target.value}))} dir="ltr" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-bold text-slate-700 mb-2">القسم / التصنيف</label>
                      <select 
                        value={ledgerFilter.category} 
                        onChange={e => setLedgerFilter(p => ({...p, category: e.target.value}))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">جميع الأقسام</option>
                        {Array.from(new Set(generateLedgerEntries().map(e => e.category))).map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-bold text-slate-700 mb-2">بحث بالبند / الاسم</label>
                      <Input type="text" value={ledgerFilter.search} onChange={(e: any) => setLedgerFilter(p => ({...p, search: e.target.value}))} placeholder="اكتب للبحث..." />
                    </div>
                    <button onClick={() => setLedgerFilter({startDate: '', endDate: '', category: 'all', search: ''})} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-bold transition-colors shrink-0">
                      إعادة ضبط
                    </button>
                  </div>
                </div>

                {/* Filtered Summary */}
                {(() => {
                  const allEntries = generateLedgerEntries();
                  const parseDate = (dateStr: string) => {
                    const [day, month, year] = dateStr.split('/');
                    return new Date(Number(year), Number(month) - 1, Number(day));
                  };

                  const filteredLedger = allEntries.filter(entry => {
                    const entryDate = parseDate(entry.date);
                    const start = ledgerFilter.startDate ? new Date(ledgerFilter.startDate) : null;
                    const end = ledgerFilter.endDate ? new Date(ledgerFilter.endDate) : null;
                    
                    let dateMatch = true;
                    if (start) { start.setHours(0,0,0,0); dateMatch = dateMatch && entryDate >= start; }
                    if (end) { end.setHours(23,59,59,999); dateMatch = dateMatch && entryDate <= end; }

                    const categoryMatch = ledgerFilter.category === 'all' || entry.category === ledgerFilter.category;
                    const searchMatch = !ledgerFilter.search || entry.description.toLowerCase().includes(ledgerFilter.search.toLowerCase());

                    return dateMatch && categoryMatch && searchMatch;
                  });

                  const filteredIn = filteredLedger.filter(e => e.type === 'in').reduce((sum, e) => sum + e.amount, 0);
                  const filteredOut = filteredLedger.filter(e => e.type === 'out').reduce((sum, e) => sum + e.amount, 0);
                  const filteredNeutral = filteredLedger.filter(e => e.type === 'neutral').reduce((sum, e) => sum + e.amount, 0);

                  const handlePrintFilteredLedger = () => {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      printWindow.document.write(`
                        <html dir="rtl">
                          <head>
                            <title>تقرير دفتر الأستاذ</title>
                            <style>
                              body { font-family: Arial, sans-serif; padding: 20px; }
                              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                              th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
                              th { background-color: #f4f4f4; }
                              .header { margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
                              .text-left { text-align: left; }
                              .summary { display: flex; gap: 20px; margin-top: 10px; font-weight: bold; }
                              .summary div { padding: 10px; border: 1px solid #ccc; border-radius: 5px; }
                            </style>
                          </head>
                          <body>
                            <div class="header">
                              <h2>تقرير دفتر الأستاذ</h2>
                              ${ledgerFilter.startDate || ledgerFilter.endDate ? `<p>الفترة: ${ledgerFilter.startDate || 'البداية'} إلى ${ledgerFilter.endDate || 'النهاية'}</p>` : ''}
                              ${ledgerFilter.category !== 'all' ? `<p>القسم: ${ledgerFilter.category}</p>` : ''}
                              ${ledgerFilter.search ? `<p>بحث: ${ledgerFilter.search}</p>` : ''}
                              <div class="summary">
                                <div>إجمالي الوارد: <span dir="ltr">${formatNum(filteredIn)}</span></div>
                                <div>إجمالي المنصرف: <span dir="ltr">${formatNum(filteredOut)}</span></div>
                                <div>إجمالي المعلق: <span dir="ltr">${formatNum(filteredNeutral)}</span></div>
                              </div>
                            </div>
                            <table>
                              <thead>
                                <tr>
                                  <th>التاريخ</th>
                                  <th>البيان</th>
                                  <th>التصنيف</th>
                                  <th>النوع</th>
                                  <th>المبلغ</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${filteredLedger.map((e: any) => `
                                  <tr>
                                    <td>${e.date}</td>
                                    <td>${e.description}</td>
                                    <td>${e.category}</td>
                                    <td>${e.type === 'in' ? 'وارد' : e.type === 'out' ? 'منصرف' : 'معلق'}</td>
                                    <td dir="ltr" class="text-left">${formatNum(e.amount)}</td>
                                  </tr>
                                `).join('')}
                                ${filteredLedger.length === 0 ? '<tr><td colspan="5" style="text-align:center;">لا توجد بيانات مطابقة</td></tr>' : ''}
                              </tbody>
                            </table>
                            <script>window.print();</script>
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }
                  };

                  return (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-between">
                          <div>
                            <p className="text-emerald-600 text-sm font-bold mb-1">إجمالي الوارد (المفلتر)</p>
                            <p className="text-2xl font-black text-emerald-800" dir="ltr">{formatNum(filteredIn)}</p>
                          </div>
                        </div>
                        <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 flex items-center justify-between">
                          <div>
                            <p className="text-rose-600 text-sm font-bold mb-1">إجمالي المنصرف (المفلتر)</p>
                            <p className="text-2xl font-black text-rose-800" dir="ltr">{formatNum(filteredOut)}</p>
                          </div>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-center justify-between">
                          <div>
                            <p className="text-amber-600 text-sm font-bold mb-1">إجمالي المعلق (المفلتر)</p>
                            <p className="text-2xl font-black text-amber-800" dir="ltr">{formatNum(filteredNeutral)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                        <div className="bg-purple-50 text-purple-800 p-4 flex justify-between items-center border-b border-purple-100">
                          <div className="flex items-center gap-2 font-bold">
                            <BookOpen size={20} /> دفتر الأستاذ (النتائج: {filteredLedger.length})
                          </div>
                          <button onClick={handlePrintFilteredLedger} className="flex items-center gap-2 bg-white text-purple-700 px-3 py-1.5 rounded-lg text-sm font-bold border border-purple-200 hover:bg-purple-100 transition-colors">
                            <Printer size={16} /> طباعة التقرير
                          </button>
                        </div>
                        <div className="p-4 overflow-x-auto">
                          <table className="w-full text-sm text-right">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-200">
                                <th className="pb-3 font-medium">التاريخ</th>
                                <th className="pb-3 font-medium">البيان</th>
                                <th className="pb-3 font-medium">التصنيف</th>
                                <th className="pb-3 font-medium">النوع</th>
                                <th className="pb-3 font-medium">المبلغ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredLedger.map(entry => (
                                <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                                  <td className="py-3 font-bold">{entry.date}</td>
                                  <td className="py-3">{entry.description}</td>
                                  <td className="py-3 text-slate-500">{entry.category}</td>
                                  <td className="py-3">
                                    {entry.type === 'in' ? <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md text-xs font-bold">وارد</span> : 
                                    entry.type === 'out' ? <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded-md text-xs font-bold">منصرف</span> :
                                    <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded-md text-xs font-bold">معلق</span>}
                                  </td>
                                  <td className="py-3 font-bold" dir="ltr">{formatNum(entry.amount)}</td>
                                </tr>
                              ))}
                              {filteredLedger.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-slate-400">لا توجد حركات مسجلة تطابق البحث</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Archive Tab */}
              <div className={`${activeTab === 'archive' && !isExporting ? 'block' : 'hidden'} print:block`}>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                  <div className="bg-slate-800 text-white p-4 flex items-center gap-2 font-bold">
                    <History size={20} /> أرشيف الأموال المعلقة (المسددة)
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-sm text-right">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-200">
                          <th className="pb-3 font-medium">تاريخ التسوية</th>
                          <th className="pb-3 font-medium">البيان</th>
                          <th className="pb-3 font-medium">النوع</th>
                          <th className="pb-3 font-medium">المبلغ</th>
                          <th className="pb-3 font-medium print:hidden">إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.archivedPendingFunds.map(item => (
                          <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3">{item.dateSettled}</td>
                            <td className="py-3 font-medium">{item.name}</td>
                            <td className="py-3">
                              {item.type === 'toUs' ? 
                                <span className="text-amber-700 bg-amber-50 px-2 py-1 rounded-md text-xs font-bold border border-amber-200">لنا</span> : 
                                <span className="text-slate-700 bg-slate-100 px-2 py-1 rounded-md text-xs font-bold border border-slate-200">علينا</span>}
                            </td>
                            <td className="py-3 font-bold" dir="ltr">{formatNum(item.amount)}</td>
                            <td className="py-3 print:hidden">
                              <button onClick={() => {
                                setConfirmDialog({
                                  message: 'حذف نهائي من الأرشيف؟',
                                  onConfirm: () => {
                                    setState(prev => ({...prev, archivedPendingFunds: prev.archivedPendingFunds.filter(t => t.id !== item.id)}));
                                    showToast('تم الحذف من الأرشيف', 'success');
                                  }
                                });
                              }} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={16}/>
                              </button>
                            </td>
                          </tr>
                        ))}
                        {state.archivedPendingFunds.length === 0 && (
                          <tr><td colSpan={5} className="text-center py-8 text-slate-400">لا يوجد بيانات في الأرشيف</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Settings Tab */}
              <div className={`${activeTab === 'settings' && !isExporting ? 'block' : 'hidden'} print:hidden`}>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                  <div className="bg-slate-50 text-slate-800 p-4 border-b border-slate-100 flex items-center gap-2 font-bold">
                    <Settings size={20} /> إدارة القوائم المنسدلة (الأسماء المحفوظة)
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {Object.entries({
                        expenseRefunds: 'مردود المصروفات',
                        expenses: 'المصروفات المتنوعة',
                        companyPayments: 'سداد الشركات والموردين',
                        customerTransfers: 'تحويلات العملاء',
                        pendingFundsOwedToUs: 'أموال معلقة لنا (سلف/عهد)',
                        pendingFundsOwedByUs: 'أموال معلقة علينا (لعملاء)',
                        cashDeposits: 'الإيداعات البنكية',
                        customCashAmounts: 'المبالغ النقدية المجمعة'
                      }).map(([fieldKey, label]) => (
                        <div key={fieldKey} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                          <h3 className="font-bold text-slate-700 mb-3">{label}</h3>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {(state.savedNames[fieldKey as keyof typeof state.savedNames] || []).map(name => (
                              <span key={name} className="bg-white text-slate-700 px-3 py-1 rounded-lg text-sm flex items-center gap-2 border border-slate-200 shadow-sm">
                                {name}
                                <button onClick={() => removeSavedName(fieldKey as any, name)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                              </span>
                            ))}
                          </div>
                          <AddNameInput onAdd={(name) => addSavedName(fieldKey as any, name)} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Analytics Tab */}
              <div className={`${activeTab === 'analytics' && !isExporting ? 'block' : 'hidden'} print:hidden`}>
                <AnalyticsView history={history} currentState={state} formatNum={formatNum} />
              </div>
              
              </div>
            </div>
          )}

          {/* Right Column: Sticky Summary Dashboard */}
          <div className="w-full lg:w-80 xl:w-96 shrink-0 print:w-full">
            <div className={`sticky top-20 flex flex-col gap-4 ${isExporting ? '' : 'max-h-[calc(100vh-6rem)] overflow-y-auto'} pb-4 scrollbar-hide`}>
              <SummaryDashboard state={state} summary={currentSummary} isExport={isExporting} />
            </div>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Download size={20} className="text-blue-600" /> 
                تصدير التسوية
              </h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-bold text-slate-700 mb-3">نوع التقرير (التفاصيل)</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setExportMode('summary')}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-colors ${exportMode === 'summary' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                  >
                    <FileText size={24} />
                    <span className="font-bold">ملخص</span>
                    <span className="text-xs text-center opacity-80">التقفيل النهائي فقط</span>
                  </button>
                  <button 
                    onClick={() => setExportMode('detailed')}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-colors ${exportMode === 'detailed' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                  >
                    <BookOpen size={24} />
                    <span className="font-bold">مفصل</span>
                    <span className="text-xs text-center opacity-80">كل الجداول والبنود</span>
                  </button>
                </div>
              </div>
              
              <button 
                onClick={handleExport}
                disabled={isExporting}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isExporting ? (
                  <>جاري تجهيز الطباعة...</>
                ) : (
                  <>
                    <Printer size={20} />
                    طباعة التقرير / تحميل كـ PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Snapshot Modal */}
      {viewSnapshot && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <CalendarDays size={20} className="text-blue-600" /> 
                تفاصيل يوم: {viewSnapshot.state.date}
              </h3>
              <button onClick={() => setViewSnapshot(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto bg-slate-100">
              <SummaryDashboard state={viewSnapshot.state} summary={viewSnapshot.summary} />
            </div>
          </div>
        </div>
      )}

      {/* Fund Manager Modal */}
      {managingFund && state[managingFund.field].find(f => f.id === managingFund.item.id) && (
        <FundManagerModal 
          fund={state[managingFund.field].find(f => f.id === managingFund.item.id)}
          field={managingFund.field}
          ledgerEntries={generateLedgerEntries()}
          onUpdate={updateTransaction}
          onAdjustFund={adjustFundAmount}
          onEditHistory={editFundHistoryEntry}
          onDeleteHistory={deleteFundHistoryEntry}
          onArchive={archivePendingFund}
          onClose={() => setManagingFund(null)}
          formatNum={formatNum}
          showToast={showToast}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-full shadow-lg font-bold text-white flex items-center gap-2 animate-fade-in-up ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          {toast.message}
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <p className="text-lg font-bold text-slate-800 mb-2">تأكيد الإجراء</p>
              <p className="text-slate-600 mb-6">{confirmDialog.message}</p>
              <div className="flex gap-3">
                <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="flex-1 bg-blue-600 text-white py-2 rounded-xl font-bold hover:bg-blue-700 transition-colors">تأكيد</button>
                <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl font-bold hover:bg-slate-200 transition-colors">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Networks Modal */}
      {activeNetworkPosId && activePos && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <CreditCard size={20} className="text-amber-600" /> 
                مبالغ الشبكات - {activePos.name}
              </h3>
              <button onClick={() => setActiveNetworkPosId(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {activePos.networks.map((amount, idx) => (
                <div key={idx} className="flex gap-2 mb-3">
                  <span className="text-slate-400 text-sm mt-2">{idx + 1}.</span>
                  <Input 
                    type="number" 
                    value={amount} 
                    onChange={(e: any) => {
                      const newNetworks = [...activePos.networks];
                      newNetworks[idx] = Number(e.target.value);
                      setState(prev => ({
                        ...prev,
                        posData: prev.posData.map(p => p.id === activePos.id ? { ...p, networks: newNetworks } : p)
                      }));
                    }} 
                    dir="ltr" 
                    className="text-left" 
                  />
                  <button 
                    onClick={() => {
                      const newNetworks = activePos.networks.filter((_, i) => i !== idx);
                      setState(prev => ({
                        ...prev,
                        posData: prev.posData.map(p => p.id === activePos.id ? { ...p, networks: newNetworks } : p)
                      }));
                    }}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              <button 
                onClick={() => {
                  setState(prev => ({
                    ...prev,
                    posData: prev.posData.map(p => p.id === activePos.id ? { ...p, networks: [...p.networks, 0] } : p)
                  }));
                }}
                className="w-full py-2 border-2 border-dashed border-slate-200 text-slate-500 rounded-xl hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2 font-medium mt-2"
              >
                <Plus size={18} /> إضافة مبلغ شبكة جديد
              </button>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <span className="font-bold text-slate-600">إجمالي الشبكات:</span>
              <span className="font-black text-amber-600 text-lg" dir="ltr">{formatNum(sumNetworks(activePos.networks))}</span>
            </div>
            <div className="p-4 pt-0 bg-slate-50">
              <button onClick={() => setActiveNetworkPosId(null)} className="w-full bg-blue-600 text-white py-2 rounded-xl font-bold hover:bg-blue-700 transition-colors">
                موافق
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {printView === 'daily' && <DailyPrintView state={state} summary={currentSummary} formatNum={formatNum} />}
      {printView === 'pending' && <PendingPrintView pendingOwedToUs={state.pendingFundsOwedToUs} pendingOwedByUs={state.pendingFundsOwedByUs} formatNum={formatNum} />}
    </div>
  );
}
