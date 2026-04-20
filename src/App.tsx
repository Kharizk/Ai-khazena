import React, { useState, useEffect, useRef } from 'react';
import { Save, Printer, FilePlus, Plus, Trash2, Calculator, Wallet, ArrowDownRight, ArrowUpRight, AlertCircle, CheckCircle2, CreditCard, Receipt, Layers, Pin, Settings, Undo2, History, Eye, EyeOff, X, LogIn, LogOut, CalendarDays, Download, FileText, Image as ImageIcon, BookOpen, PlusCircle, Copy, Search, Check, Edit2, BarChart3, TrendingUp, ChevronUp, ChevronDown } from 'lucide-react';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, User, signOut, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy, updateDoc, where } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'motion/react';

type FundHistoryEntry = {
  id: string;
  date: string;
  amount: number;
  type: 'add' | 'sub' | 'init';
  note?: string;
};

type Transaction = { id: string; name: string; amount: number; isPinned?: boolean; showInSummary?: boolean; history?: FundHistoryEntry[] };
type ArchivedFund = Transaction & { type: 'toUs' | 'byUs'; dateSettled: string };
type POSData = { id: string; name: string; sales: number; returns: number; networks: number[]; physicalCash?: number };

type UserRole = 'admin' | 'manager' | 'cashier';
type UserStatus = 'pending' | 'active' | 'suspended';

export type UserProfile = {
  uid: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  branchId: string | null;
  createdAt: number;
};

export type Branch = {
  id: string;
  name: string;
  createdAt: number;
};

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

const DailyPrintView = ({ state, summary, formatNum, isPdfMode = false, id }: any) => (
  <div id={id} className={isPdfMode ? "rtl p-8 bg-white text-black font-sans w-[800px]" : "hidden print:block rtl p-8 w-full print:bg-white text-black font-sans"}>
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

const PosPrintView = ({ pos, summary, formatNum }: any) => {
  const net = pos.sales - pos.returns;
  const networksTotal = pos.networks.reduce((a: number, b: any) => a + (typeof b === 'number' ? b : b.amount || 0), 0);
  const diff = (pos.physicalCash !== undefined ? pos.physicalCash : 0) - (net - networksTotal);
  
  return (
    <div className="hidden print:block rtl p-8 w-full print:bg-white text-black font-sans">
      <div className="text-center mb-6 pb-4 border-b-2 border-gray-300">
        <h1 className="text-3xl font-bold mb-2">تسوية نقطة بيع: {pos.name || 'بدون اسم'}</h1>
        <p className="text-lg">تاريخ: <span dir="ltr" className="font-bold">{summary.date}</span></p>
      </div>
      <table className="w-full text-right border-collapse text-lg border border-gray-300 mb-6">
        <tbody>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold bg-gray-50/50 w-2/3">إجمالي المبيعات</td>
            <td className="py-3 px-4 font-bold" dir="ltr">{formatNum(pos.sales)}</td>
          </tr>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold text-rose-700 bg-rose-50 w-2/3">المرتجعات</td>
            <td className="py-3 px-4 font-bold text-rose-700" dir="ltr">{formatNum(pos.returns)}</td>
          </tr>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold bg-gray-50/50 w-2/3">صافي المبيعات</td>
            <td className="py-3 px-4 font-bold" dir="ltr">{formatNum(net)}</td>
          </tr>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold text-blue-700 bg-blue-50 w-2/3">الشبكات (تخصم)</td>
            <td className="py-3 px-4 font-bold text-blue-700" dir="ltr">{formatNum(networksTotal)}</td>
          </tr>
          <tr className="border-b-2 border-gray-800 bg-gray-100">
            <td className="py-4 px-4 font-black w-2/3">المطلوب كاش</td>
            <td className="py-4 px-4 font-black font-mono text-indigo-700" dir="ltr">{formatNum(net - networksTotal)}</td>
          </tr>
          {pos.physicalCash !== undefined && (
            <tr className="border-b border-gray-300">
              <td className="py-3 px-4 font-bold text-emerald-800 bg-emerald-50 w-2/3">الكاش الفعلي بالدرج</td>
              <td className="py-3 px-4 font-bold text-emerald-800" dir="ltr">{formatNum(pos.physicalCash)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {pos.physicalCash !== undefined && (
        <div className={`p-6 mt-8 rounded-xl border-4 text-center font-black text-2xl ${diff === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : diff > 0 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {diff === 0 ? 'الدرج مطابق تماماً' : diff > 0 ? `يوجد زيادة: ${formatNum(Math.abs(diff))}` : `يوجد عجز: ${formatNum(Math.abs(diff))}`}
        </div>
      )}
    </div>
  );
};

const PendingPrintView = ({ pendingOwedToUs, pendingOwedByUs, formatNum, isPdfMode = false, id }: any) => {
  const sumOwedToUs = pendingOwedToUs.reduce((a: number, b: any) => a + b.amount, 0);
  const sumOwedByUs = pendingOwedByUs.reduce((a: number, b: any) => a + b.amount, 0);

  return (
    <div id={id} className={isPdfMode ? "rtl p-8 bg-white text-black font-sans w-[800px]" : "hidden print:block rtl p-8 w-full print:bg-white text-black font-sans"}>
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
    const refunds = state.expenseRefunds ? state.expenseRefunds.reduce((a:number, c:any)=>a+c.amount, 0) : 0;
    const totalIn = netSales + refunds;

    const exp1 = state.expenses ? state.expenses.reduce((a:number,c:any)=>a+c.amount,0) : 0;
    const exp2 = state.companyPayments ? state.companyPayments.reduce((a:number,c:any)=>a+c.amount,0) : 0;
    const exp3 = state.customerTransfers ? state.customerTransfers.reduce((a:number,c:any)=>a+c.amount,0) : 0;
    const totalOut = exp1 + exp2 + exp3;
    
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
      sales: totalIn,
      expenses: totalOut,
      net: totalIn - totalOut,
      isCurrent: state.isCurrent,
      dateName: parts.length === 3 ? `${day}/${month}` : state.date
    };
  }).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  const monthlyAgg = dailyMetrics.reduce((acc: any, curr: any) => {
    if (!acc[curr.monthYear]) acc[curr.monthYear] = { monthYear: curr.monthYear, dateObj: curr.dateObj, totalSales: 0, totalExpenses: 0, totalNet: 0, daysCount: 0 };
    acc[curr.monthYear].totalSales += curr.sales;
    acc[curr.monthYear].totalExpenses += curr.expenses;
    acc[curr.monthYear].totalNet += curr.net;
    acc[curr.monthYear].daysCount += 1;
    return acc;
  }, {});

  const monthlyList = Object.values(monthlyAgg).sort((a: any, b: any) => a.dateObj.getTime() - b.dateObj.getTime());

  const [reportType, setReportType] = useState<'daily'|'monthly'|'yearly'>('daily');
  const [reportDateInput, setReportDateInput] = useState<string>(new Date().toISOString().split('T')[0]);
  const [copySuccess, setCopySuccess] = useState(false);

  const generateReportText = () => {
    // Parse the input date YYYY-MM-DD to DD/MM/YYYY
    const inputDateObj = new Date(reportDateInput);
    if (isNaN(inputDateObj.getTime())) return 'يرجى اختيار تاريخ صحيح.';
    
    const day = String(inputDateObj.getDate()).padStart(2, '0');
    const month = String(inputDateObj.getMonth() + 1).padStart(2, '0');
    const year = inputDateObj.getFullYear();
    const targetDateStr = `${day}/${month}/${year}`;
    const targetMonthYear = `${month}/${year}`;
    const targetYear = `${year}`;
    
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    if (reportType === 'daily') {
      const dayData = dailyMetrics.find((d: any) => d.dateStr === targetDateStr);
      const dailySales = dayData ? dayData.sales : 0;
      
      const monthData = dailyMetrics.filter((d: any) => d.monthYear === targetMonthYear && d.dateObj.getTime() <= inputDateObj.getTime());
      const monthTotalSales = monthData.reduce((sum: number, d: any) => sum + d.sales, 0);
      const daysCountInMonth = monthData.length;
      const avgMonthly = daysCountInMonth > 0 ? monthTotalSales / daysCountInMonth : 0;

      return `═══════════════════════════════════════
           📊 تقرير مبيعات اليوم
═══════════════════════════════════════

📅 التاريخ: ${targetDateStr}

💰 إجمالي مبيعات اليوم
   ${formatNum(dailySales)} ريال

📈 المتوسط اليومي (لهذا الشهر حتى اليوم)
   ${formatNum(avgMonthly)} ريال

📊 إجمالي مبيعات الشهر (تراكمي)
   ${formatNum(monthTotalSales)} ريال

═══════════════════════════════════════
   تم إنشاء التقرير في: ${timeStr}`;
    } 
    else if (reportType === 'monthly') {
      const monthData = dailyMetrics.filter((d: any) => d.monthYear === targetMonthYear);
      const monthTotalSales = monthData.reduce((sum: number, d: any) => sum + d.sales, 0);
      const daysCountInMonth = monthData.length;
      const avgDaily = daysCountInMonth > 0 ? monthTotalSales / daysCountInMonth : 0;
      
      const yearData = dailyMetrics.filter((d: any) => d.dateObj.getFullYear().toString() === targetYear && d.dateObj.getTime() <= inputDateObj.getTime());
      const yearTotalSales = yearData.reduce((sum: number, d: any) => sum + d.sales, 0);

      return `═══════════════════════════════════════
           📊 تقرير مبيعات الشهر
═══════════════════════════════════════

📅 الشهر: ${targetMonthYear}

💰 إجمالي مبيعات الشهر
   ${formatNum(monthTotalSales)} ريال

📈 المتوسط اليومي
   ${formatNum(avgDaily)} ريال

📊 إجمالي مبيعات السنة (تراكمي)
   ${formatNum(yearTotalSales)} ريال

═══════════════════════════════════════
   تم إنشاء التقرير في: ${timeStr}`;
    }
    else {
      // Yearly
      const yearData = dailyMetrics.filter((d: any) => d.dateObj.getFullYear().toString() === targetYear);
      const yearTotalSales = yearData.reduce((sum: number, d: any) => sum + d.sales, 0);
      
      const uniqueMonths = new Set(yearData.map((d:any) => d.monthYear)).size;
      const avgMonthly = uniqueMonths > 0 ? yearTotalSales / uniqueMonths : 0;

      return `═══════════════════════════════════════
           📊 تقرير مبيعات السنة
═══════════════════════════════════════

📅 السنة: ${targetYear}

💰 إجمالي مبيعات السنة
   ${formatNum(yearTotalSales)} ريال

📈 المتوسط الشهري
   ${formatNum(avgMonthly)} ريال

═══════════════════════════════════════
   تم إنشاء التقرير في: ${timeStr}`;
    }
  };

  const reportText = generateReportText();

  const handleCopy = () => {
    navigator.clipboard.writeText(reportText).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  return (
    <div className="print:block print:w-full space-y-6">
      
      {/* Overall Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 font-bold text-sm mb-1">إجمالي الوارد (محصلة البيع)</p>
              <h3 className="text-3xl font-black text-emerald-600 font-mono" dir="ltr">
                {formatNum(dailyMetrics.reduce((sum, d) => sum + d.sales, 0))}
              </h3>
            </div>
            <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600">
              <TrendingUp size={24} />
            </div>
          </div>
          <p className="text-xs text-slate-400">إجمالي المقبوضات عبر جميع الأيام المسجلة</p>
        </div>
        
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 font-bold text-sm mb-1">إجمالي المنصرف (مصروفات)</p>
              <h3 className="text-3xl font-black text-rose-600 font-mono" dir="ltr">
                {formatNum(dailyMetrics.reduce((sum, d) => sum + d.expenses, 0))}
              </h3>
            </div>
            <div className="bg-rose-50 p-3 rounded-2xl text-rose-600">
              <BarChart3 size={24} />
            </div>
          </div>
          <p className="text-xs text-slate-400">مجموع كل ما تم صرفه أو سداده</p>
        </div>
        
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 font-bold text-sm mb-1">صافي الحركة الكلية (الأرباح/الخسائر)</p>
              <h3 className={`text-3xl font-black font-mono ${dailyMetrics.reduce((sum, d) => sum + d.net, 0) >= 0 ? 'text-blue-600' : 'text-rose-600'}`} dir="ltr">
                {formatNum(dailyMetrics.reduce((sum, d) => sum + d.net, 0))}
              </h3>
            </div>
            <div className={`p-3 rounded-2xl ${dailyMetrics.reduce((sum, d) => sum + d.net, 0) >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'}`}>
              <Wallet size={24} />
            </div>
          </div>
          <p className="text-xs text-slate-400">الفرق بين الوارد والمنصرف لكل الأيام</p>
        </div>
      </div>

      {/* Add Reports Generator Section */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 print:hidden">
        <h2 className="text-2xl font-bold flex items-center gap-3 mb-6 text-slate-800">
          <FileText className="text-purple-600" size={28} /> تقارير نصية (قابلة للنسخ)
        </h2>
        
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-1/3 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">نوع التقرير</label>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                {[{id: 'daily', label: 'يومي'}, {id: 'monthly', label: 'شهري'}, {id: 'yearly', label: 'سنوي'}].map(rt => (
                  <button 
                    key={rt.id}
                    onClick={() => setReportType(rt.id as any)}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${reportType === rt.id ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}
                  >
                    {rt.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                {reportType === 'daily' ? 'اختر اليوم' : reportType === 'monthly' ? 'اختر أي يوم في الشهر' : 'اختر أي يوم في السنة'}
              </label>
              <input 
                type="date" 
                value={reportDateInput}
                onChange={(e) => setReportDateInput(e.target.value)}
                className="w-full bg-slate-50 hover:bg-white border text-slate-700 border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-[3px] focus:ring-purple-500/20 focus:border-purple-500 focus:bg-white transition-all text-sm"
              />
            </div>
            
            <button 
              onClick={handleCopy}
              className={`mt-auto flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${copySuccess ? 'bg-emerald-100 text-emerald-700 pointer-events-none' : 'bg-purple-600 text-white hover:bg-purple-700 active:scale-95 shadow-sm hover:shadow-md'}`}
            >
              {copySuccess ? <Check size={20} /> : <Copy size={20} />}
              {copySuccess ? 'تم النسخ بنجاح!' : 'نسخ التقرير (WhatsApp)'}
            </button>
          </div>
          
          <div className="w-full lg:w-2/3 bg-slate-800 text-slate-300 rounded-2xl p-4 md:p-6 relative overflow-hidden font-mono text-sm leading-relaxed whitespace-pre-wrap flex items-center justify-center min-h-[250px]" dir="rtl">
             <div className="relative z-10 w-full text-right">{reportText}</div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold flex items-center gap-3 mb-6 text-slate-800">
          <BarChart3 className="text-blue-600" size={28} /> ملخص الأداء الشهري
        </h2>
        {monthlyList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {monthlyList.map((m: any) => (
              <div key={m.monthYear} className="bg-slate-50 border border-slate-200 rounded-3xl p-6 flex flex-col hover:bg-white hover:shadow-md transition-all relative overflow-hidden">
                <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-slate-700 font-bold text-xl">شهر {m.monthYear}</span>
                  <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2 py-1 rounded-md">{m.daysCount} أيام مسجلة</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <span className="text-xs text-emerald-600 font-bold block mb-1">المقبوضات (الوارد)</span>
                    <span className="text-lg font-black text-emerald-700 font-mono" dir="ltr">{formatNum(m.totalSales)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-rose-600 font-bold block mb-1">المدفوعات (المنصرف)</span>
                    <span className="text-lg font-black text-rose-700 font-mono" dir="ltr">{formatNum(m.totalExpenses)}</span>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-200">
                    <span className="text-sm text-slate-600 font-bold block mb-1">صافي الحركة (الرصيد)</span>
                    <span className={`text-2xl font-black font-mono ${m.totalNet >= 0 ? 'text-blue-700' : 'text-rose-600'}`} dir="ltr">{formatNum(m.totalNet)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-6">لا توجد بيانات كافية لعرض التقرير الشهري</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 print:break-inside-avoid">
        <h2 className="text-2xl font-bold flex items-center gap-3 mb-8 text-slate-800">
          <TrendingUp className="text-emerald-600" size={28} /> حركة الماليّات اليومية
        </h2>
        
        {dailyMetrics.length >= 2 ? (
          <div className="h-[400px] w-full mb-8" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                <XAxis dataKey="dateName" tick={{ fill: '#64748b', fontSize: 13, fontFamily: 'monospace' }} tickMargin={10} />
                <YAxis tick={{ fill: '#64748b', fontSize: 13, fontFamily: 'monospace' }} tickFormatter={(val) => Math.floor(val).toLocaleString()} width={80} />
                <RechartsTooltip 
                  formatter={(value: number, name: string) => [formatNum(value), name === 'sales' ? 'المقبوضات' : name === 'expenses' ? 'المدفوعات' : 'الصافي']}
                  labelFormatter={(label) => `التاريخ: ${label}`}
                  contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', fontFamily: 'Cairo', textAlign: 'right', padding: '12px 16px' }}
                />
                <Legend wrapperStyle={{ fontFamily: 'Cairo', paddingTop: '20px' }} formatter={(value) => value === 'sales' ? 'المقبوضات' : value === 'expenses' ? 'المدفوعات' : 'الصافي'} />
                <Line type="monotone" dataKey="sales" name="sales" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="expenses" name="expenses" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4, fill: '#f43f5e', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="net" name="net" stroke="#3b82f6" strokeWidth={4} dot={{ r: 5, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8, strokeWidth: 0 }} />
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
                <th className="py-4 px-6 font-bold w-1/4">التاريخ</th>
                <th className="py-4 px-6 font-bold text-center text-emerald-700">المقبوضات</th>
                <th className="py-4 px-6 font-bold text-center text-rose-700">المدفوعات</th>
                <th className="py-4 px-6 font-bold text-left text-blue-700">صافي الحركة</th>
              </tr>
            </thead>
            <tbody>
              {dailyMetrics.map((day: any) => (
                <tr key={day.dateStr} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${day.isCurrent ? 'bg-blue-50/40 hover:bg-blue-50/60' : ''}`}>
                  <td className="py-4 px-6 font-bold text-slate-700 flex items-center gap-3 border-l border-slate-100">
                    <span className="font-mono text-sm">{day.dateStr}</span>
                    {day.isCurrent && <span className="bg-blue-600 text-white px-2 py-0.5 rounded-md text-xs">اليوم (جاري)</span>}
                  </td>
                  <td className="py-4 px-6 font-bold text-center text-emerald-700 font-mono border-l border-slate-100 bg-emerald-50/20" dir="ltr">{formatNum(day.sales)}</td>
                  <td className="py-4 px-6 font-bold text-center text-rose-700 font-mono border-l border-slate-100 bg-rose-50/20" dir="ltr">{formatNum(day.expenses)}</td>
                  <td className="py-4 px-6 font-black text-left text-blue-800 font-mono text-lg bg-blue-50/20" dir="ltr">{formatNum(day.net)}</td>
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

const Input = ({ value, onChange, onBlur, type = "text", className = "", dir = "rtl", placeholder = "", list, ...props }: any) => {
  return (
    <input
      type={type}
      value={value === 0 && type === 'number' ? '' : value}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={e => e.target.select()}
      placeholder={placeholder}
      dir={dir}
      list={list}
      className={`w-full bg-slate-50/80 hover:bg-white border text-slate-700 border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-[3px] focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all text-sm placeholder-slate-400 shadow-sm ${type === 'number' ? '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : ''} ${className}`}
      {...props}
    />
  );
};

const AddNameInput = ({ onAdd }: { onAdd: (name: string) => void }) => {
  const [val, setVal] = useState('');
  return (
    <div className="flex gap-2">
      <Input 
        value={val} 
        onChange={(e: any) => setVal(e.target.value)} 
        onKeyDown={(e: any) => {
          if (e.key === 'Enter') {
            e.stopPropagation();
            if (val.trim()) {
              onAdd(val.trim());
              setVal('');
            }
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
        className="bg-blue-600 text-white px-3 py-2 rounded-xl border border-blue-700 shadow-sm hover:shadow active:scale-95 hover:bg-blue-700 transition-all flex items-center justify-center shrink-0"
      >
        <Plus size={18} />
      </button>
    </div>
  );
};

const DynamicTable = ({ title, field, data, icon: Icon, colorClass, onAdd, onUpdate, onRemove, onArchive, onTogglePin, onToggleSummary, onManage, onReorder, sumTransactions, formatNum, savedNames, onSaveName }: any) => {
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
        <AnimatePresence initial={false}>
        {filteredData.map((item: any, index: number) => {
          const actualIndex = data.findIndex((d: any) => d.id === item.id);
          return (
          <motion.div 
            initial={{ opacity: 0, y: -10, height: 0, overflow: 'hidden' }}
            animate={{ opacity: 1, y: 0, height: 'auto', overflow: 'visible' }}
            exit={{ opacity: 0, scale: 0.95, height: 0, overflow: 'hidden' }}
            transition={{ duration: 0.2 }}
            key={item.id} 
            className="flex gap-2.5 mb-2.5 items-center group/row"
          >
            {onReorder && searchQuery === '' && (
              <div className="flex flex-col opacity-0 group-hover/row:opacity-100 transition-opacity gap-0.5">
                <button onClick={() => onReorder(item.id, 'up')} disabled={actualIndex === 0} className="text-slate-400 hover:text-blue-600 disabled:opacity-0 disabled:cursor-not-allowed hover:bg-slate-100 rounded">
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => onReorder(item.id, 'down')} disabled={actualIndex === data.length - 1} className="text-slate-400 hover:text-blue-600 disabled:opacity-0 disabled:cursor-not-allowed hover:bg-slate-100 rounded">
                  <ChevronDown size={14} />
                </button>
              </div>
            )}
            <span className={`text-slate-300 text-xs font-bold select-none text-center ${onReorder && searchQuery === '' ? 'w-2' : 'w-4'}`}>{actualIndex + 1}</span>
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
          </motion.div>
        )})}
        </AnimatePresence>
        {data.length === 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-10 px-4 flex flex-col items-center gap-3 bg-slate-50/50 rounded-2xl mx-5 mb-5 border border-dashed border-slate-200">
            <div className="bg-white p-4 rounded-full shadow-sm border border-slate-100 text-slate-300">
              <Icon size={32} strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-slate-600">لا يوجد بيانات حالياً</p>
              <p className="text-sm text-slate-400">لم تقم بإضافة أي بنود في هذا القسم بعد.</p>
            </div>
            <button onClick={onAdd} className="mt-2 text-sm font-bold text-blue-600 bg-blue-50 px-4 py-2 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-2">
              <Plus size={16} /> أضف أول بند
            </button>
          </motion.div>
        )}
        {data.length > 0 && (
          <div className="px-5 pb-5">
            <button onClick={onAdd} className="flex items-center justify-center gap-2 w-full text-blue-600 hover:text-blue-800 text-sm font-bold px-4 py-3 rounded-xl border-2 border-dashed border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-95 group/btn">
              <Plus size={18} className="group-hover/btn:rotate-90 transition-transform" /> إضافة بند جديد
            </button>
          </div>
        )}
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
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
      </motion.div>
    </motion.div>
  );
};

export default function App() {
  const [state, setState] = useState<AppState>(getInitialState());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  
  const [history, setHistory] = useState<DailySnapshot[]>([]);
  const [activeTab, setActiveTab] = useState<'sales' | 'payments' | 'pending' | 'cash' | 'archive' | 'history' | 'ledger' | 'settings' | 'admin'>('sales');
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

  const loadBranchData = async (branchId: string) => {
    try {
      const docRef = doc(db, `branches/${branchId}/treasury/state`);
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
      } else {
        setState(getInitialState());
      }
      
      const historyRef = collection(db, `branches/${branchId}/treasury_history`);
      const q = query(historyRef, orderBy('timestamp', 'desc'));
      const historySnap = await getDocs(q);
      
      const historyData = historySnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as DailySnapshot));
      setHistory(historyData);
    } catch (e) {
      console.error(e);
      showToast("خطأ في تحميل بيانات الفرع", "error");
    }
  };

  const handleAddBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    try {
      const newBranch = {
        name: newBranchName.trim(),
        createdAt: Date.now()
      };
      const docRef = await addDoc(collection(db, 'branches'), newBranch);
      setBranches(prev => [...prev, { id: docRef.id, ...newBranch }]);
      showToast("تمت إضافة الفرع بنجاح", "success");
      setShowAddBranchModal(false);
      setNewBranchName('');
    } catch (e) {
      showToast("خطأ في إضافة الفرع", "error");
    }
  };

  const handleUpdateUser = async (userId: string, updates: Partial<UserProfile>) => {
    try {
      await updateDoc(doc(db, `users/${userId}`), updates);
      setAdminUsers(prev => prev.map(u => u.uid === userId ? { ...u, ...updates } as UserProfile : u));
      showToast("تم تحديث بيانات المستخدم", "success");
    } catch (e) {
      showToast("خطأ في تحديث البيانات", "error");
    }
  };

  const handleUpdateBranch = async (branchId: string, newName: string) => {
    if (!newName.trim() || !user || userProfile?.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'branches', branchId), { name: newName.trim() });
      setBranches(prev => prev.map(b => b.id === branchId ? { ...b, name: newName.trim() } : b));
      showToast("تم تحديث اسم الفرع بنجاح", "success");
    } catch (e) {
      showToast("خطأ في تحديث الفرع", "error");
    }
  };

  const handleDeleteBranch = async (branchId: string) => {
    if (!user || userProfile?.role !== 'admin') return;
    if (!window.confirm('هل أنت متأكد من حذف هذا الفرع نهائياً؟')) return;
    try {
      await updateDoc(doc(db, 'branches', branchId), { deleted: true }); // Soft delete
      setBranches(prev => prev.filter(b => b.id !== branchId));
      if (currentBranchId === branchId) {
        setCurrentBranchId(null);
        setState(getInitialState());
        setHistory([]);
      }
      showToast("تم إخفاء/حذف الفرع بنجاح", "success");
    } catch (e) {
      showToast("خطأ في حذف الفرع", "error");
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    // Fallback timer: force exit loading state if Firebase hangs
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
        // If it hangs, we can try to fall back to local data gracefully
        const saved = localStorage.getItem('treasury_app_data');
        if (saved && isMounted) {
            try { setState(JSON.parse(saved)); } catch(e) {}
        }
      }
    }, 7000);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const withTimeout = (promise: Promise<any>, ms: number) => 
            Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

          // Fetch user profile
          const profileRef = doc(db, `users/${currentUser.uid}`);
          const profileSnap = await withTimeout(getDoc(profileRef), 5000);
          let currentProfile: UserProfile;

          if (!profileSnap.exists()) {
            const isAdmin = currentUser.email === 'kk.rizk@gmail.com';
            currentProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              role: isAdmin ? 'admin' : 'cashier',
              status: isAdmin ? 'active' : 'pending',
              branchId: null,
              createdAt: Date.now()
            };
            await setDoc(profileRef, currentProfile);
          } else {
            currentProfile = profileSnap.data() as UserProfile;
          }
          if (isMounted) setUserProfile(currentProfile);

          if (currentProfile.status === 'active') {
            if (currentProfile.role === 'admin') {
              // Load all branches and users for admin
              const branchesRef = collection(db, 'branches');
              const branchesSnap = await withTimeout(getDocs(branchesRef), 5000);
              const loadedBranches = branchesSnap.docs.map(d => ({id: d.id, ...d.data()} as Branch));
              if (isMounted) setBranches(loadedBranches);

              const usersRef = collection(db, 'users');
              const usersSnap = await withTimeout(getDocs(usersRef), 5000);
              const loadedUsers = usersSnap.docs.map(d => d.data() as UserProfile);
              if (isMounted) setAdminUsers(loadedUsers);

              // If admin has a branch selected, fetch its data, else fetch their own isolated or just leave empty
              if (currentBranchId) {
                 await loadBranchData(currentBranchId);
              }
            } else if (currentProfile.branchId) {
              // Cashier or Manager: loads their assigned branch
              if (isMounted) setCurrentBranchId(currentProfile.branchId);
              await loadBranchData(currentProfile.branchId);
            }
          }
        } catch (error) {
          console.error("Error loading data from Firebase:", error);
          if (error instanceof Error && error.message === 'timeout') {
            showToast("تأخر الاتصال بالسحابة، قد تكون غير متصل بالإنترنت", "error");
          }
        }
      } else {
        if (isMounted) {
            setUserProfile(null);
            setCurrentBranchId(null);
            setBranches([]);
        }
      }
      if (isMounted) {
        clearTimeout(safetyTimer);
        setLoading(false);
      }
    });
    
    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []);

  const handleGoogleLogin = async () => {
    setAuthError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      showToast("تم تسجيل الدخول بحساب جوجل بنجاح", "success");
      setShowAuthModal(false);
    } catch (error: any) {
      console.error("Google login failed", error);
      setAuthError(error.message || "فشل تسجيل الدخول بواسطة جوجل");
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        showToast("تم إنشاء الحساب بنجاح", "success");
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
        showToast("تم تسجيل الدخول بنجاح", "success");
      }
      setShowAuthModal(false);
      setAuthPassword('');
    } catch (error: any) {
      console.error("Auth error", error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setAuthError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      } else if (error.code === 'auth/email-already-in-use') {
        setAuthError('البريد الإلكتروني مستخدم مسبقاً');
      } else if (error.code === 'auth/weak-password') {
        setAuthError('كلمة المرور ضعيفة جداً (يجب أن تكون 6 أحرف على الأقل)');
      } else {
        setAuthError(error.message);
      }
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

  const [printView, setPrintView] = useState<'none' | 'daily' | 'pending' | 'pos' | 'history'>('none');
  const [activePrintPosId, setActivePrintPosId] = useState<string | null>(null);
  const [printSnapshot, setPrintSnapshot] = useState<{state: AppState, summary: ReturnType<typeof getSummary>} | null>(null);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintView('none');
      setIsExporting(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const handleExport = () => {
    setIsExporting(true);
    setShowExportModal(false);
    
    if (exportMode === 'summary') {
      setPrintView('daily');
    } else {
      setPrintView('none');
    }
    
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const handlePrintPos = (posId: string) => {
    setActivePrintPosId(posId);
    setPrintView('pos');
    setIsExporting(true);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const handlePrintPending = () => {
    setPrintView('pending');
    setIsExporting(true); // Re-use isExporting overlay for UI blocking
    
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const handlePrintHistory = (snap: DailySnapshot) => {
    setPrintSnapshot({ state: snap.state, summary: snap.summary });
    setPrintView('history');
    setIsExporting(true);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const saveStateToFirebase = async (newState: AppState, isAutoSave = false) => {
    if (!user || userProfile?.status !== 'active' || !currentBranchId) {
      localStorage.setItem('treasury_app_data', JSON.stringify(newState));
      if (!isAutoSave) {
         if (!user) showToast('تم الحفظ محلياً (يرجى تسجيل الدخول للحفظ السحابي)', 'success');
         else showToast('تم الحفظ محلياً (ليس لديك فرع محدد أو الصلاحيات لم تكتمل)', 'success');
      }
      return;
    }
    setSaving(true);
    try {
      const sanitizedState = JSON.parse(JSON.stringify(newState));
      await setDoc(doc(db, `branches/${currentBranchId}/treasury/state`), sanitizedState);
      if (!isAutoSave) showToast('تم حفظ البيانات بنجاح في السحابة للفرع!', 'success');
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

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl + S: Save
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveStateToFirebase(state);
        showToast('تم الحفظ يدوياً بنجاح', 'success');
      }
      // Ctrl + P: Print / Export
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowExportModal(true);
      }
      // Esc to close modals
      if (e.key === 'Escape') {
        if (confirmDialog) setConfirmDialog(null);
        else if (managingFund) setManagingFund(null);
        else if (viewSnapshot) setViewSnapshot(null);
        else {
          setShowAuthModal(false);
          setShowAddBranchModal(false);
          setShowExportModal(false);
          setShowSettingsModal(false);
        }
      }

      // Enter key for navigation
      if (e.key === 'Enter') {
        const target = e.target as HTMLElement;
        // Don't intercept if it's a textarea or a button
        if (target.tagName !== 'TEXTAREA' && target.tagName !== 'BUTTON') {
          e.preventDefault();
          const focusableElements = Array.from(document.querySelectorAll('input, button, select, textarea')) as HTMLElement[];
          const currentIndex = focusableElements.indexOf(target);
          if (currentIndex > -1 && currentIndex < focusableElements.length - 1) {
            focusableElements[currentIndex + 1].focus();
          }
        }
      }
    };
    
    const handleMouseWheel = (e: WheelEvent) => {
      if (document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).type === 'number') {
        e.preventDefault();
      }
    };
    
    const handleFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
        e.target.select();
      }
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('wheel', handleMouseWheel, { passive: false });
    window.addEventListener('focusin', handleFocusIn);
    
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('wheel', handleMouseWheel);
      window.removeEventListener('focusin', handleFocusIn);
    };
  }, [state]);

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
        
        if (user && userProfile?.status === 'active' && currentBranchId) {
          try {
            const sanitizedSnapshot = JSON.parse(JSON.stringify(snapshot));
            const docRef = await addDoc(collection(db, `branches/${currentBranchId}/treasury_history`), sanitizedSnapshot);
            setHistory(prev => [{ id: docRef.id, ...snapshot }, ...prev]);
            
            const sanitizedNextState = JSON.parse(JSON.stringify(nextState));
            await setDoc(doc(db, `branches/${currentBranchId}/treasury/state`), sanitizedNextState);
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

  const handleReorderTransaction = (field: keyof AppState, id: string, direction: 'up' | 'down') => {
    setState(prev => {
      const list = [...(prev[field] as Transaction[])];
      const index = list.findIndex(item => item.id === id);
      if (index < 0) return prev;
      
      if (direction === 'up' && index > 0) {
        const temp = list[index - 1];
        list[index - 1] = list[index];
        list[index] = temp;
      } else if (direction === 'down' && index < list.length - 1) {
        const temp = list[index + 1];
        list[index + 1] = list[index];
        list[index] = temp;
      } else {
        return prev;
      }
      return { ...prev, [field]: list };
    });
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
      onReorder={isPending ? (id: string, direction: 'up'|'down') => handleReorderTransaction(field, id, direction) : undefined}
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-200"></div>
            <div className="absolute top-0 left-0 animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent"></div>
            <Calculator size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-600" />
          </div>
          <p className="font-bold text-slate-500 animate-pulse">جاري تحميل البيانات...</p>
        </motion.div>
      </div>
    );
  }

  if (user && userProfile && userProfile.status === 'pending') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50" dir="rtl">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">حسابك قيد المراجعة</h2>
          <p className="text-slate-600 mb-6 font-medium">يرجى الانتظار حتى تقوم الإدارة بمراجعة حسابك وتفعيله للتمكن من الدخول للخزينة الفعالة.</p>
          <button onClick={handleLogout} className="text-slate-500 hover:text-slate-700 underline font-bold mt-2">تسجيل الخروج</button>
        </div>
      </div>
    );
  }

  const activePos = state.posData.find(p => p.id === activeNetworkPosId);

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-800 font-sans ${printView !== 'none' ? 'print:bg-white' : ''}`} dir="rtl">
      <div className={printView !== 'none' ? 'print:hidden' : ''}>
        <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-2.5 rounded-xl shadow-md"><Calculator size={22} /></div>
              <h1 className="font-extrabold text-xl text-slate-800 tracking-tight">الخزينة الذكية</h1>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              {!user ? (
                <button onClick={() => setShowAuthModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 transition-colors font-bold shadow-sm">
                  <LogIn size={18} /> <span className="hidden sm:inline">تسجيل الدخول</span>
                </button>
              ) : (
                <>
                  {userProfile?.role === 'admin' && (
                    <div className="hidden md:flex items-center gap-2">
                      <select 
                        value={currentBranchId || ''} 
                        onChange={(e) => {
                          setCurrentBranchId(e.target.value || null);
                          if (e.target.value) {
                            loadBranchData(e.target.value);
                          } else {
                            setState(getInitialState());
                            setHistory([]);
                          }
                        }}
                        className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block w-full px-3 py-2 outline-none font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <option value="">-- اختر الفرع --</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="hidden md:flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 font-bold">
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    <span className="font-mono">{user.email?.split('@')[0]}</span>
                  </div>
                  <button onClick={() => setShowSettingsModal(true)} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 px-2 py-2 rounded-xl hover:bg-blue-50 transition-colors" title="إعدادات">
                    <Settings size={20} />
                  </button>
                  <button onClick={handleLogout} className="flex items-center gap-2 text-slate-500 hover:text-rose-600 px-2 py-2 rounded-xl hover:bg-rose-50 transition-colors" title="تسجيل الخروج">
                    <LogOut size={20} />
                  </button>
                  <div className="w-px h-8 bg-slate-200 mx-1 hidden sm:block"></div>
                  <button onClick={handleSave} disabled={saving} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold shadow-sm disabled:opacity-50 hover:shadow-md active:scale-95 ${saving ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'}`}>
                    {saving ? <Save size={18} className="animate-pulse" /> : <CheckCircle2 size={18} />}
                    <span className="hidden sm:inline">{saving ? 'جاري الحفظ...' : 'حفظ'}</span>
                  </button>
                </>
              )}
              <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-200 transition-all font-bold shadow-sm hover:shadow-md active:scale-95">
                <Download size={18} /> <span className="hidden sm:inline">تصدير</span>
              </button>
              <button onClick={handleNewDay} className="flex items-center gap-2 bg-indigo-600 text-white border border-indigo-500 px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-sm hover:shadow-md active:scale-95">
                <FilePlus size={18} /> <span className="hidden sm:inline">يوم جديد</span>
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
                    { id: 'analytics', label: 'تحليلات المبيعات', icon: BarChart3 }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`relative flex items-center gap-2 px-5 py-3 rounded-2xl font-bold transition-all whitespace-nowrap transform hover:scale-[1.02] active:scale-95 ${
                        activeTab === tab.id ? 'text-white shadow-lg shadow-blue-500/30' : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="activeTabIndicator"
                          className="absolute inset-0 bg-blue-600 rounded-2xl"
                          style={{ zIndex: 0 }}
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-2">
                        <tab.icon size={18} className={activeTab === tab.id ? 'animate-pulse' : ''} /> {tab.label}
                      </span>
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
                          <th className="pb-3 font-medium w-[15%]">إجمالي المبيعات</th>
                          <th className="pb-3 font-medium w-[15%]">المرتجعات</th>
                          <th className="pb-3 font-medium w-[15%]">صافي المبيعات</th>
                          <th className="pb-3 font-medium w-[15%]">الشبكات (تخصم)</th>
                          <th className="pb-3 font-medium w-[15%]">الكاش الفعلي</th>
                          <th className="pb-3 font-medium w-[8%] print:hidden text-center">طباعة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.posData.map((pos, index) => {
                          const net = pos.sales - pos.returns;
                          const posNetworksTotal = sumNetworks(pos.networks);
                          return (
                            <tr key={pos.id} className="border-b border-slate-100 last:border-0 relative group">
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
                              <td className="py-2 px-1">
                                <Input type="number" value={pos.physicalCash !== undefined ? pos.physicalCash : ''} placeholder="" onChange={(e: any) => {
                                  const newData = [...state.posData];
                                  newData[index].physicalCash = e.target.value === '' ? undefined : Number(e.target.value);
                                  updateField('posData', newData);
                                }} dir="ltr" className="text-left font-bold text-blue-700 pointer-events-auto" />
                              </td>
                              <td className="py-2 pl-2 text-center print:hidden">
                                <button onClick={() => handlePrintPos(pos.id)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-2 rounded-lg transition-colors" title="طباعة تسوية النقطة">
                                  <Printer size={18} />
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
                          <td className="py-3 px-2 text-left text-blue-600" dir="ltr">{formatNum(state.posData.reduce((acc, p) => acc + (p.physicalCash || 0), 0))}</td>
                          <td className="print:hidden"></td>
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
                      <Download size={20} /> تصدير السجل كـ PDF
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
                              <div className="flex items-center gap-2">
                                <button onClick={() => setViewSnapshot(snap)} className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold flex items-center gap-1">
                                  <Eye size={14} /> التفاصيل
                                </button>
                                <button onClick={() => handlePrintHistory(snap)} className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold flex items-center gap-1">
                                  <Printer size={14} /> طباعة
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {history.length === 0 && (
                          <tr>
                            <td colSpan={6}>
                              <div className="flex flex-col items-center justify-center py-12 text-slate-400 bg-slate-50/50 rounded-xl my-4 border border-dashed border-slate-200">
                                <CalendarDays size={48} className="opacity-20 mb-3" />
                                <p className="font-bold text-lg text-slate-500">سجل الأيام السابقة فارغ</p>
                                <p className="text-sm text-slate-400 mt-1">اضغط على "يوم جديد" للبدء بحفظ التقفيلات اليومية</p>
                              </div>
                            </td>
                          </tr>
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

                  const sortedEntries = allEntries.sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());
                  let runningBalance = 0;
                  const balanceEntries = sortedEntries.map(e => {
                    if (e.type === 'in') runningBalance += e.amount;
                    if (e.type === 'out') runningBalance -= e.amount;
                    return { ...e, balance: runningBalance };
                  });

                  const filteredLedger = balanceEntries.filter(entry => {
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
                              @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap');
                              body { 
                                font-family: 'Cairo', sans-serif; 
                                padding: 30px; 
                                color: #1e293b;
                                background: #fff;
                              }
                              .report-header {
                                display: flex;
                                justify-content: space-between;
                                align-items: flex-start;
                                border-bottom: 2px solid #0f172a;
                                padding-bottom: 15px;
                                margin-bottom: 30px;
                              }
                              .report-header h2 {
                                margin: 0 0 10px 0;
                                font-size: 28px;
                                color: #0f172a;
                              }
                              .filters-info {
                                color: #64748b;
                                font-size: 14px;
                                line-height: 1.6;
                              }
                              table { 
                                width: 100%; 
                                border-collapse: collapse; 
                                font-size: 14px;
                              }
                              th, td { 
                                border: 1px solid #e2e8f0; 
                                padding: 12px 10px; 
                                text-align: right; 
                              }
                              th { 
                                background-color: #f8fafc; 
                                color: #475569;
                                font-weight: 800;
                              }
                              .text-left { text-align: left; font-family: monospace; font-size: 15px; }
                              .summary-grid { 
                                display: grid;
                                grid-template-columns: repeat(4, 1fr);
                                gap: 15px; 
                                margin-bottom: 30px; 
                              }
                              .summary-card { 
                                padding: 15px; 
                                border: 1px solid #e2e8f0; 
                                border-radius: 8px; 
                                text-align: center;
                                background: #f8fafc;
                              }
                              .summary-card span {
                                display: block;
                                font-size: 20px;
                                font-weight: 800;
                                font-family: monospace;
                                margin-top: 5px;
                              }
                              .val-in { color: #059669; }
                              .val-out { color: #e11d48; }
                              .val-net { color: #2563eb; }
                              
                              @media print {
                                body { padding: 0; }
                                .no-print { display: none; }
                              }
                            </style>
                          </head>
                          <body>
                            <div class="report-header">
                              <div>
                                <h2>تقرير دفتر الأستاذ</h2>
                                <div class="filters-info">
                                  ${ledgerFilter.startDate || ledgerFilter.endDate ? `<div><strong>الفترة:</strong> ${ledgerFilter.startDate || 'البداية'} إلى ${ledgerFilter.endDate || 'النهاية'}</div>` : ''}
                                  ${ledgerFilter.category !== 'all' ? `<div><strong>القسم:</strong> ${ledgerFilter.category}</div>` : ''}
                                  ${ledgerFilter.search ? `<div><strong>بحث:</strong> ${ledgerFilter.search}</div>` : ''}
                                  <div><strong>تاريخ الطباعة:</strong> ${new Date().toLocaleString('ar-EG')}</div>
                                </div>
                              </div>
                            </div>
                            
                            <div class="summary-grid">
                              <div class="summary-card">
                                <strong>إجمالي الوارد (مدين)</strong>
                                <span class="val-in" dir="ltr">${formatNum(filteredIn)}</span>
                              </div>
                              <div class="summary-card">
                                <strong>إجمالي المنصرف (دائن)</strong>
                                <span class="val-out" dir="ltr">${formatNum(filteredOut)}</span>
                              </div>
                              <div class="summary-card">
                                <strong>إجمالي المعلق</strong>
                                <span dir="ltr" style="color: #d97706;">${formatNum(filteredNeutral)}</span>
                              </div>
                              <div class="summary-card">
                                <strong>صافي الرصيد</strong>
                                <span class="val-net" dir="ltr">${formatNum(filteredIn - filteredOut)}</span>
                              </div>
                            </div>

                            <table>
                              <thead>
                                <tr>
                                  <th>التاريخ</th>
                                  <th style="width: 35%">البيان</th>
                                  <th>التصنيف</th>
                                  <th>مدين (وارد)</th>
                                  <th>دائن (منصرف)</th>
                                  <th>الرصيد التراكمي</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${filteredLedger.map((e: any) => `
                                  <tr>
                                    <td>${e.date}</td>
                                    <td><strong>${e.description}</strong></td>
                                    <td style="color: #64748b; font-size: 12px;">${e.category}</td>
                                    <td class="text-left val-in" dir="ltr">${e.type === 'in' ? formatNum(e.amount) : '-'}</td>
                                    <td class="text-left val-out" dir="ltr">${e.type === 'out' ? formatNum(e.amount) : '-'}</td>
                                    <td class="text-left val-net font-bold" dir="ltr" style="background:#f8fafc;">${formatNum(e.balance)}</td>
                                  </tr>
                                `).join('')}
                                ${filteredLedger.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding: 30px; color: #94a3b8;">لا توجد حركات مسجلة تطابق البحث</td></tr>' : ''}
                              </tbody>
                            </table>
                            <script>
                              window.onload = () => {
                                setTimeout(() => window.print(), 500);
                              };
                            </script>
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }
                  };

                  return (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                          <div>
                            <p className="text-emerald-600 text-sm font-bold mb-1">إجمالي الوارد (مدين)</p>
                            <p className="text-xl font-black text-emerald-800" dir="ltr">{formatNum(filteredIn)}</p>
                          </div>
                        </div>
                        <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                          <div>
                            <p className="text-rose-600 text-sm font-bold mb-1">إجمالي المنصرف (دائن)</p>
                            <p className="text-xl font-black text-rose-800" dir="ltr">{formatNum(filteredOut)}</p>
                          </div>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                          <div>
                            <p className="text-amber-600 text-sm font-bold mb-1">إجمالي المعلق</p>
                            <p className="text-xl font-black text-amber-800" dir="ltr">{formatNum(filteredNeutral)}</p>
                          </div>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                          <div>
                            <p className="text-blue-600 text-sm font-bold mb-1">صافي الرصيد</p>
                            <p className="text-xl font-black text-blue-800" dir="ltr">{formatNum(filteredIn - filteredOut)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                        <div className="bg-slate-800 text-white p-4 flex justify-between items-center border-b border-slate-700">
                          <div className="flex items-center gap-2 font-bold">
                            <BookOpen size={20} className="text-slate-300" /> كشف حساب (النتائج: {filteredLedger.length})
                          </div>
                          <button onClick={handlePrintFilteredLedger} className="flex items-center gap-2 bg-slate-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold border border-slate-600 hover:bg-slate-600 transition-colors">
                            <Printer size={16} /> طباعة التقرير
                          </button>
                        </div>
                        <div className="p-0 overflow-x-auto">
                          <table className="w-full text-sm text-right border-collapse">
                            <thead>
                              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                                <th className="p-3 font-bold border-l border-slate-200">التاريخ</th>
                                <th className="p-3 font-bold border-l border-slate-200 w-1/3">البيان</th>
                                <th className="p-3 font-bold border-l border-slate-200">التصنيف</th>
                                <th className="p-3 font-bold border-l border-slate-200 text-emerald-700">مدين (وارد)</th>
                                <th className="p-3 font-bold border-l border-slate-200 text-rose-700">دائن (منصرف)</th>
                                <th className="p-3 font-bold text-blue-700">الرصيد</th>
                              </tr>
                            </thead>
                            <tbody>
                              <AnimatePresence>
                              {filteredLedger.map((entry: any, index: number) => (
                                <motion.tr 
                                  initial={{ opacity: 0, x: -10 }} 
                                  animate={{ opacity: 1, x: 0 }} 
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  transition={{ duration: 0.15 }}
                                  key={entry.id + index} 
                                  className="border-b border-slate-200 hover:bg-amber-50/50 transition-colors"
                                >
                                  <td className="p-3 font-medium text-slate-700 border-l border-slate-200">{entry.date}</td>
                                  <td className="p-3 font-bold text-slate-800 border-l border-slate-200">{entry.description}</td>
                                  <td className="p-3 text-slate-500 text-xs border-l border-slate-200">
                                    <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">{entry.category}</span>
                                  </td>
                                  <td className="p-3 border-l border-slate-200 font-mono text-emerald-700 font-bold bg-emerald-50/30" dir="ltr">
                                    {entry.type === 'in' ? formatNum(entry.amount) : '-'}
                                  </td>
                                  <td className="p-3 border-l border-slate-200 font-mono text-rose-700 font-bold bg-rose-50/30" dir="ltr">
                                    {entry.type === 'out' ? formatNum(entry.amount) : '-'}
                                  </td>
                                  <td className="p-3 font-mono text-blue-700 font-black bg-blue-50/30" dir="ltr">
                                    {formatNum(entry.balance)}
                                  </td>
                                </motion.tr>
                              ))}
                              </AnimatePresence>
                              {filteredLedger.length === 0 && (
                                <tr>
                                  <td colSpan={6}>
                                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 bg-slate-50">
                                      <BookOpen size={48} className="opacity-20 mb-3" />
                                      <p className="font-bold text-lg text-slate-500">لا توجد حركات مسجلة تطابق البحث</p>
                                    </div>
                                  </td>
                                </tr>
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
                          <tr>
                            <td colSpan={5}>
                              <div className="flex flex-col items-center justify-center py-12 text-slate-400 bg-slate-50/50 rounded-xl my-4 border border-dashed border-slate-200">
                                <History size={48} className="opacity-20 mb-3" />
                                <p className="font-bold text-lg text-slate-500">الأرشيف فارغ حالياً</p>
                                <p className="text-sm text-slate-400 mt-1">تظهر هنا الأموال المعلقة بعد تسويتها</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
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
      <AnimatePresence>
      {showExportModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
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
                  <>جاري تجهيز الملف...</>
                ) : (
                  <>
                    {exportMode === 'summary' ? <Download size={20} /> : <Printer size={20} />}
                    {exportMode === 'summary' ? 'تصدير الملخص كـ PDF' : 'طباعة التقرير المفصل'}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* View Snapshot Modal */}
      <AnimatePresence>
      {viewSnapshot && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <CalendarDays size={20} className="text-blue-600" /> 
                تفاصيل يوم: {viewSnapshot.state.date}
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { setViewSnapshot(null); handlePrintHistory(viewSnapshot); }} className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors text-sm font-bold flex items-center gap-2">
                  <Printer size={16} /> طباعة
                </button>
                <button onClick={() => setViewSnapshot(null)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto bg-slate-100">
              <SummaryDashboard state={viewSnapshot.state} summary={viewSnapshot.summary} />
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Fund Manager Modal */}
      <AnimatePresence>
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
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
      {showSettingsModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto print:hidden">
          <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-slate-50 rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10 shrink-0 shadow-sm">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Settings size={22} className="text-blue-600" /> لوحة الإدارة والإعدادات
              </h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-slate-600 p-1 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-8">
              
              {/* Lists Management */}
              <section>
                <div className="flex items-center gap-2 font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">
                  <BookOpen size={20} className="text-indigo-600" /> إدارة القوائم المنسدلة (الأسماء المحفوظة)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <div key={fieldKey} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                      <h3 className="font-bold text-slate-700 mb-3 text-sm">{label}</h3>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {(state.savedNames[fieldKey as keyof typeof state.savedNames] || []).map(name => (
                          <span key={name} className="bg-slate-50 text-slate-700 px-2 py-1 rounded-md text-xs flex items-center gap-2 border border-slate-200">
                            {name}
                            <button onClick={() => removeSavedName(fieldKey as any, name)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                          </span>
                        ))}
                      </div>
                      <AddNameInput onAdd={(name) => addSavedName(fieldKey as any, name)} />
                    </div>
                  ))}
                </div>
              </section>

              {/* Admin Panel */}
              {userProfile?.role === 'admin' && (
                <section>
                  <div className="flex items-center gap-2 font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2 mt-4">
                    <Pin size={20} className="text-amber-600" /> إدارة الفروع والموظفين
                  </div>

                  {/* Branches Settings */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                    <h4 className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                      الفروع
                      <button onClick={() => { setShowSettingsModal(false); setShowAddBranchModal(true); }} className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1">
                        <Plus size={16} /> إضافة فرع
                      </button>
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-right bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="p-3">اسم الفرع</th>
                            <th className="p-3 w-40 text-center">إجراء</th>
                          </tr>
                        </thead>
                        <tbody>
                          {branches.map(b => (
                            <tr key={b.id} className="border-b border-slate-200 last:border-0 hover:bg-white transition-colors">
                              <td className="p-3">
                                <Input value={b.name} onChange={(e: any) => {
                                  const newBranches = [...branches];
                                  const idx = newBranches.findIndex(x => x.id === b.id);
                                  if (idx > -1) { newBranches[idx].name = e.target.value; setBranches(newBranches); }
                                }} onBlur={(e: any) => handleUpdateBranch(b.id, e.target.value)} className="w-full max-w-sm" />
                              </td>
                              <td className="p-3 text-center">
                                <button onClick={() => handleDeleteBranch(b.id)} className="text-red-500 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors" title="حذف الفرع">
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {branches.length === 0 && <tr><td colSpan={2} className="text-center p-6 text-slate-500">لا يوجد فروع</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Users Settings */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h4 className="font-bold text-slate-700 mb-4">المستخدمون</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-right bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="p-3">الإيميل</th>
                            <th className="p-3">الدور</th>
                            <th className="p-3">الفرع</th>
                            <th className="p-3">الحالة</th>
                            <th className="p-3">تاريخ التسجيل</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminUsers.map(u => (
                            <tr key={u.uid} className="border-b border-slate-200 last:border-0 hover:bg-white transition-colors">
                              <td className="p-3 font-medium text-slate-800">{u.email}</td>
                              <td className="p-3">
                                <select value={u.role} onChange={(e) => handleUpdateUser(u.uid, { role: e.target.value as UserRole })} className="border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none">
                                  <option value="cashier">كاشير</option>
                                  <option value="manager">مدير</option>
                                  <option value="admin">أدمن</option>
                                </select>
                              </td>
                              <td className="p-3">
                                <select value={u.branchId || ''} onChange={(e) => handleUpdateUser(u.uid, { branchId: e.target.value || null })} className="border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none">
                                  <option value="">-- بدون فرع --</option>
                                  {branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-3">
                                <select value={u.status} onChange={(e) => handleUpdateUser(u.uid, { status: e.target.value as UserStatus })} className={`border rounded-lg px-2 py-1 outline-none font-bold ${u.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : u.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                  <option value="pending">قيد الانتظار</option>
                                  <option value="active">نشط</option>
                                  <option value="suspended">موقوف</option>
                                </select>
                              </td>
                              <td className="p-3 text-slate-500" dir="ltr">{new Date(u.createdAt).toLocaleDateString()}</td>
                            </tr>
                          ))}
                          {adminUsers.length === 0 && <tr><td colSpan={5} className="text-center p-6 text-slate-500">لا يوجد مستخدمين</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </section>
              )}

            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
      {toast && (
        <motion.div initial={{ opacity: 0, y: 50, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 20, x: '-50%' }} className={`fixed bottom-4 left-1/2 z-[200] px-6 py-3 rounded-full shadow-lg font-bold text-white flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          {toast.message}
        </motion.div>
      )}
      </AnimatePresence>

      {/* Confirm Dialog */}
      <AnimatePresence>
      {confirmDialog && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <p className="text-lg font-bold text-slate-800 mb-2">تأكيد الإجراء</p>
              <p className="text-slate-600 mb-6">{confirmDialog.message}</p>
              <div className="flex gap-3">
                <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="flex-1 bg-blue-600 text-white py-2 rounded-xl font-bold hover:bg-blue-700 transition-colors">تأكيد</button>
                <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl font-bold hover:bg-slate-200 transition-colors">إلغاء</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Networks Modal */}
      <AnimatePresence>
      {activeNetworkPosId && activePos && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
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
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Add Branch Modal */}
      <AnimatePresence>
      {showAddBranchModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden" dir="rtl">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Plus className="text-blue-600" size={20} />
                إضافة فرع جديد
              </h3>
              <button disabled={loading} onClick={() => setShowAddBranchModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddBranchSubmit} className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-bold text-slate-700 mb-2">اسم الفرع</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: فرع المدينة"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !newBranchName.trim()}
                className="w-full bg-blue-600 outline-none text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-all shadow-sm shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 size={20} />}
                إضافة
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {showAuthModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden" dir="rtl">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <LogIn className="text-blue-600" size={24} />
                {isSignUp ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
              </h3>
              <button onClick={() => setShowAuthModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              {authError && (
                <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-xl text-sm font-bold border border-red-200 flex items-center gap-2">
                  <AlertCircle size={18} className="shrink-0" />
                  {authError}
                </div>
              )}
              <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">البريد الإلكتروني</label>
                  <input
                    type="email"
                    required
                    dir="ltr"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">كلمة المرور</label>
                  <input
                    type="password"
                    required
                    dir="ltr"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl mt-2 hover:bg-blue-700 transition-all shadow-sm active:scale-95"
                >
                  {isSignUp ? 'إنشاء الحساب' : 'دخول'}
                </button>
              </form>

              <div className="mt-5 relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500 font-medium">أو</span>
                </div>
              </div>

              <button
                onClick={handleGoogleLogin}
                className="mt-5 w-full bg-white border-2 border-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                المتابعة بواسطة Google
              </button>

              <div className="mt-6 text-center">
                <button
                  onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }}
                  className="text-slate-500 hover:text-blue-600 font-bold transition-colors text-sm relative after:bg-blue-600 after:absolute after:h-[2px] after:w-0 hover:after:w-full after:bottom-0 after:-right-0 after:transition-all after:duration-300"
                >
                  {isSignUp ? 'لدي حساب بالفعل، تسجيل الدخول' : 'جديد؟ قم بإنشاء حساب'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      </div>

      {printView === 'daily' && <DailyPrintView state={state} summary={currentSummary} formatNum={formatNum} />}
      {printView === 'history' && printSnapshot && <DailyPrintView state={printSnapshot.state} summary={printSnapshot.summary} formatNum={formatNum} />}
      {printView === 'pending' && <PendingPrintView pendingOwedToUs={state.pendingFundsOwedToUs} pendingOwedByUs={state.pendingFundsOwedByUs} formatNum={formatNum} />}
      {printView === 'pos' && activePrintPosId && state.posData.find(p => p.id === activePrintPosId) && (
        <PosPrintView pos={state.posData.find(p => p.id === activePrintPosId)} summary={currentSummary} formatNum={formatNum} />
      )}
      
      {/* Hidden containers for PDF export calculation */}
      <div className="absolute top-0 left-0 -z-50 opacity-0 pointer-events-none">
        <DailyPrintView id="daily-print-container" isPdfMode={true} state={state} summary={currentSummary} formatNum={formatNum} />
        <PendingPrintView id="pending-print-container" isPdfMode={true} pendingOwedToUs={state.pendingFundsOwedToUs} pendingOwedByUs={state.pendingFundsOwedByUs} formatNum={formatNum} />
      </div>
    </div>
  );
}
