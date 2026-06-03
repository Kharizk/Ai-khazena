import React, { useState, useEffect, useRef, useDeferredValue, useMemo, Suspense } from 'react';
import { createPortal } from 'react-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Save, Printer, FilePlus, Plus, Trash2, Calculator, Wallet, ArrowDownRight, ArrowUpRight, AlertCircle, CheckCircle2, CreditCard, Receipt, Layers, Pin, Settings, Undo2, History, Eye, EyeOff, X, LogIn, LogOut, CalendarDays, Download, FileText, Image as ImageIcon, BookOpen, PlusCircle, Copy, Search, Check, Edit2, BarChart3, TrendingUp, TrendingDown, ChevronUp, ChevronDown, ArrowRight, ChevronLeft, Database, Sparkles, Activity, PieChart as PieChartIcon, LineChart as LineChartIcon } from 'lucide-react';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, User, signOut, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy, updateDoc, where } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, ComposedChart } from 'recharts';
import CalculatorWidget from './components/Calculator';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

import { SettingsModalComponent } from './components/SettingsModal';

const safeLocalStorage = {
  getItem: (key: string) => { try { return window.localStorage.getItem(key); } catch(e) { return null; } },
  setItem: (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch(e) {} },
  removeItem: (key: string) => { try { window.localStorage.removeItem(key); } catch(e) {} }
};


type FundHistoryEntry = {
  id: string;
  date: string;
  amount: number;
  type: 'add' | 'sub' | 'init';
  note?: string;
};

type Transaction = { id: string; name: string; amount: number; isPinned?: boolean; showInSummary?: boolean; history?: FundHistoryEntry[] };
type ArchivedFund = Transaction & { type: 'toUs' | 'byUs'; dateSettled: string };
type POSData = { id: string; name: string; sales: number; returns: number; networks: number[]; physicalCash?: number; isPinned?: boolean };

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
  deleted?: boolean;
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
    posData: string[];
  };
  historicalMonths?: { monthYear: string, netSales: number }[];
  historicalSales?: {
    id: string;
    type: string;
    dateStr: string;
    netSales: number;
  }[];
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
    posData: [],
  },
  historicalMonths: [],
  historicalSales: []
});

const round2 = (num: number) => Math.round(num * 100) / 100;
const sumTransactions = (arr: Transaction[]) => round2((arr || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
const sumNetworks = (networks: number[]) => round2(networks.reduce((sum, val) => sum + (Number(val) || 0), 0));

const getSummary = (s: AppState) => {
  const safePosData = s.posData || [];
  const safeExpenses = s.expenses || [];
  
  const totalSales = round2(safePosData.reduce((sum, item) => sum + (Number(item.sales) || 0), 0));
  const totalReturns = round2(safePosData.reduce((sum, item) => sum + (Number(item.returns) || 0), 0));
  const netSales = round2(totalSales - totalReturns);
  const totalExpenseRefunds = sumTransactions(s.expenseRefunds);
  const totalCashIn = round2(netSales + totalExpenseRefunds);

  const totalNetworks = round2(safePosData.reduce((sum, item) => sum + sumNetworks(item.networks || []), 0));
  const totalCustomerTransfers = sumTransactions(s.customerTransfers);
  const totalCompanyPayments = sumTransactions(s.companyPayments);
  
  const separatedExpenses = safeExpenses.filter(e => e.showInSummary && e.amount > 0);
  const separatedExpensesTotal = sumTransactions(separatedExpenses);
  const generalExpensesTotal = sumTransactions(safeExpenses.filter(e => !e.showInSummary));
  const totalExpenses = round2(generalExpensesTotal + separatedExpensesTotal);
  
  const totalCashDeposits = sumTransactions(s.cashDeposits);
  const totalCashOut = round2(totalNetworks + totalCustomerTransfers + totalCompanyPayments + totalExpenses + totalCashDeposits);

  const expectedCash = round2((s.previousBalance || 0) + totalCashIn - totalCashOut);

  const physicalDenominations = round2(Object.entries(s.cashDenominations || {}).reduce((sum, [denom, count]) => sum + (Number(denom) * (Number(count) || 0)), 0));
  const physicalCustomCash = sumTransactions(s.customCashAmounts);
  const physicalCash = round2(physicalDenominations + physicalCustomCash);
  
  const totalPendingOwedToUs = sumTransactions(s.pendingFundsOwedToUs);
  const totalPendingOwedByUs = sumTransactions(s.pendingFundsOwedByUs);

  const actualCash = round2(physicalCash + totalPendingOwedToUs - totalPendingOwedByUs);
  const difference = round2(actualCash - expectedCash);

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

const DailyPrintView = ({ companyName, state, summary, formatNum, isPdfMode = false, id, printFormat = 'a4', thermalMargins = { right: 24, left: 24, top: 0 }, isPreviewMode = false }: any) => {
  if (printFormat === 'thermal') {
    return (
      <div id={id} dir="rtl" className={`${isPreviewMode ? 'flex flex-col bg-white dark:bg-slate-900 print:bg-white' : 'hidden print:flex print:flex-col print:bg-white dark:bg-slate-900 print:bg-white'} rtl text-black dark:text-white print:text-black font-sans box-border ${isPreviewMode && 'rounded-[4px] shadow-sm border border-slate-200 dark:border-slate-700'}`} style={{ width: '100%', margin: 0, padding: `${thermalMargins.top}px ${thermalMargins.left}px 10px ${thermalMargins.right}px`, fontSize: '20px', lineHeight: '1.6' }}>
        {!isPreviewMode && <style dangerouslySetInnerHTML={{__html: `
          @media print {
            @page { margin: 0; padding: 0; size: 79mm auto; }
            body { margin: 0; padding: 0; background: white; width: 100%; box-sizing: border-box; }
            * { box-shadow: none !important; box-sizing: border-box !important; }
          }
        `}} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px', borderBottom: '2px dashed #000', paddingBottom: '10px' }}>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0', color: '#000' }}>{companyName}</h2>
          </div>
          <div style={{ flex: 1.5, textAlign: 'center' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0' }}>تقرير التقفيل اليومي</h1>
          </div>
          <div style={{ flex: 1, textAlign: 'left', fontSize: '14px', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <div><span dir="ltr">{state.date}</span></div>
            <div><span dir="ltr">{new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span></div>
          </div>
        </div>

        <div style={{ fontWeight: 'bold', borderBottom: '2px dashed #000', marginBottom: '10px', paddingBottom: '5px', fontSize: '20px' }}>ملخص الوارد والمنصرف</div>
        <table style={{ width: '100%', marginBottom: '25px', borderCollapse: 'collapse', fontSize: '20px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px 0' }}>رصيد أول المدة</td>
              <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: 'bold' }} dir="ltr">{formatNum(state.previousBalance)}</td>
            </tr>
            <tr>
              <td style={{ padding: '8px 0' }}>+ إجمالي الإيرادات</td>
              <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: 'bold' }} dir="ltr">{formatNum(summary.totalCashIn)}</td>
            </tr>
            <tr style={{ fontSize: '18px' }}>
              <td colSpan={2} style={{ padding: '6px 0 12px 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>صافي المبيعات</span><span dir="ltr">{formatNum(summary.netSales)}</span></div>
                {summary.totalExpenseRefunds > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>مردود مصروفات</span><span dir="ltr">{formatNum(summary.totalExpenseRefunds)}</span></div>}
              </td>
            </tr>
            <tr style={{ borderTop: '2px dashed #000' }}>
              <td style={{ padding: '10px 0 8px 0' }}>- إجمالي المخصومات</td>
              <td style={{ padding: '10px 0 8px 0', textAlign: 'left', fontWeight: 'bold' }} dir="ltr">{formatNum(summary.totalCashOut)}</td>
            </tr>
            <tr style={{ fontSize: '18px' }}>
              <td colSpan={2} style={{ padding: '8px 0 12px 10px' }}>
                {summary.totalNetworks > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>الشبكات</span><span dir="ltr">{formatNum(summary.totalNetworks)}</span></div>}
                {summary.totalCustomerTransfers > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>تحويلات عملاء</span><span dir="ltr">{formatNum(summary.totalCustomerTransfers)}</span></div>}
                {summary.totalCompanyPayments > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>شركات وموردين</span><span dir="ltr">{formatNum(summary.totalCompanyPayments)}</span></div>}
                {summary.generalExpensesTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>مصروفات عامة</span><span dir="ltr">{formatNum(summary.generalExpensesTotal)}</span></div>}
                {summary.totalCashDeposits > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>إيداعات بنكية</span><span dir="ltr">{formatNum(summary.totalCashDeposits)}</span></div>}
                {summary.separatedExpenses.map((exp: any) => (
                  <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>{exp.name || 'محدد'}</span><span dir="ltr">{formatNum(exp.amount)}</span></div>
                ))}
              </td>
            </tr>
            <tr style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000' }}>
              <td style={{ padding: '14px 0', fontWeight: 'bold', fontSize: '26px' }}>الرصيد الدفتري</td>
              <td style={{ padding: '14px 0', textAlign: 'left', fontWeight: 'bold', fontSize: '26px' }} dir="ltr">{formatNum(summary.expectedCash)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontWeight: 'bold', borderBottom: '2px solid #000', marginBottom: '10px', paddingBottom: '5px', fontSize: '24px' }}>الجرد الفعلي</div>
        <table style={{ width: '100%', marginBottom: '25px', borderCollapse: 'collapse', fontSize: '20px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px 0' }}>النقدية الفعلية</td>
              <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: 'bold' }} dir="ltr">{formatNum(summary.physicalCash)}</td>
            </tr>
            <tr>
              <td style={{ padding: '8px 0' }}>+ معلقة لنا</td>
              <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: 'bold' }} dir="ltr">{formatNum(summary.totalPendingOwedToUs)}</td>
            </tr>
            <tr>
              <td style={{ padding: '8px 0' }}>- معلقة علينا</td>
              <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: 'bold' }} dir="ltr">{formatNum(summary.totalPendingOwedByUs)}</td>
            </tr>
            <tr style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000' }}>
              <td style={{ padding: '14px 0', fontWeight: 'bold', fontSize: '26px' }}>الصافي الفعلي</td>
              <td style={{ padding: '14px 0', textAlign: 'left', fontWeight: 'bold', fontSize: '26px' }} dir="ltr">{formatNum(summary.actualCash)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ textAlign: 'center', marginTop: '25px', marginBottom: '15px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', padding: '12px', border: '3px dashed #000', borderRadius: '8px' }}>
            {summary.difference === 0 ? 'الخزينة مطابقة تماماً' : summary.difference > 0 ? `النتيجة: زيادة ${formatNum(Math.abs(summary.difference))}` : `النتيجة: عجز ${formatNum(Math.abs(summary.difference))}`}
          </div>
        </div>
        
        <div style={{ marginTop: '45px', textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>توقيع الكاشير / المسؤول</div>
          <div style={{ marginTop: '40px', borderBottom: '2px dashed #000', margin: '40px 30px 0 30px' }}></div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '30px', fontSize: '18px', paddingBottom: '20px', fontWeight: 'bold' }}>-- تمت التسوية بنجاح --</div>
      </div>
    );
  }

  return (
    <div id={id} dir="rtl" className={isPdfMode ? "rtl p-8 bg-white dark:bg-slate-900 print:bg-white text-black dark:text-white print:text-black font-sans w-[800px]" : "hidden print:block rtl p-8 w-full print:bg-white dark:bg-slate-900 print:bg-white text-black dark:text-white print:text-black font-sans"}>
    <div className="flex justify-between items-start mb-4 pb-3 border-b-2 border-gray-300">
      <div className="flex-1 text-right">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white print:text-black">{companyName}</h2>
      </div>
      <div className="flex-1 text-center">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white print:text-black">تقرير التقفيل اليومي</h1>
      </div>
      <div className="flex-1 text-left flex flex-col items-end gap-1">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 print:text-slate-700 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:border-slate-200 print:bg-slate-50 px-2 rounded-[4px]">التاريخ: <span dir="ltr" className="font-mono">{state.date}</span></p>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 print:text-slate-700 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:border-slate-200 print:bg-slate-50 px-2 rounded-[4px]">الوقت: <span dir="ltr" className="font-mono">{new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span></p>
      </div>
    </div>
    
    <div className="mb-6">
      <h2 className="text-2xl font-bold bg-slate-50 dark:bg-slate-800/50 p-2 mb-4 border-r-4 border-slate-900">ملخص الوارد والمنصرف</h2>
      <table className="w-full text-right border-collapse text-lg border border-gray-300">
        <tbody>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold bg-slate-50 dark:bg-slate-800/50/50/50 w-2/3">رصيد أول المدة</td>
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
          <tr className="border-t-2 border-gray-800 bg-slate-50 dark:bg-slate-800/50">
            <td className="py-4 px-4 font-black w-2/3">الرصيد الدفتري (المتوقع)</td>
            <td className="py-4 px-4 font-black font-mono" dir="ltr">{formatNum(summary.expectedCash)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div className="mb-6 break-inside-avoid">
      <h2 className="text-2xl font-bold bg-slate-50 dark:bg-slate-800/50 p-2 mb-4 border-r-4 border-indigo-600">الجرد الفعلي</h2>
      <table className="w-full text-right border-collapse text-lg border border-gray-300">
        <tbody>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold bg-slate-50 dark:bg-slate-800/50/50/50 w-2/3">النقدية الفعلية (الجرد)</td>
            <td className="py-3 px-4 font-bold" dir="ltr">{formatNum(summary.physicalCash)}</td>
          </tr>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold text-amber-700 bg-amber-50 w-2/3">+ أموال معلقة لنا</td>
            <td className="py-3 px-4 font-bold text-amber-700" dir="ltr">{formatNum(summary.totalPendingOwedToUs)}</td>
          </tr>
          <tr className="border-b border-gray-300">
            <td className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300 w-2/3">- أموال معلقة علينا</td>
            <td className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300" dir="ltr">{formatNum(summary.totalPendingOwedByUs)}</td>
          </tr>
          <tr className="border-t-2 border-gray-800 bg-slate-50 dark:bg-slate-800/50">
            <td className="py-4 px-4 font-black w-2/3">الرصيد الفعلي (الصافي)</td>
            <td className="py-4 px-4 font-black font-mono text-indigo-700" dir="ltr">{formatNum(summary.actualCash)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div className={`p-6 mt-8 rounded-[4px] border-4 text-center font-black text-2xl ${summary.difference === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : summary.difference > 0 ? 'bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
      {summary.difference === 0 ? 'الخزينة مطابقة تماماً' : summary.difference > 0 ? `يوجد زيادة: ${formatNum(Math.abs(summary.difference))}` : `يوجد عجز: ${formatNum(Math.abs(summary.difference))}`}
    </div>
  </div>
  );
};

const PosPrintView = ({ companyName, pos, summary, formatNum, date, printFormat = 'a4', thermalMargins = { right: 24, left: 24, top: 0 }, isPreviewMode = false }: any) => {
  const net = pos.sales - pos.returns;
  const networksTotal = pos.networks.reduce((a: number, b: any) => a + (typeof b === 'number' ? b : b.amount || 0), 0);
  const diff = (pos.physicalCash !== undefined ? pos.physicalCash : 0) - (net - networksTotal);
  
  if (printFormat === 'thermal') {
    return (
      <div dir="rtl"  className={`${isPreviewMode ? 'flex flex-col bg-white dark:bg-slate-900 print:bg-white' : 'hidden print:flex print:flex-col print:bg-white dark:bg-slate-900 print:bg-white'} rtl text-black dark:text-white print:text-black font-sans box-border ${isPreviewMode && 'rounded-[4px] shadow-sm border border-slate-200 dark:border-slate-700'}`} style={{ width: '100%', margin: 0, padding: `${thermalMargins.top}px ${thermalMargins.left}px 10px ${thermalMargins.right}px`, fontSize: '20px', lineHeight: '1.6' }}>
        {!isPreviewMode && <style dangerouslySetInnerHTML={{__html: `
          @media print {
            @page { margin: 0; padding: 0; size: 79mm auto; }
            body { margin: 0; padding: 0; background: white; width: 100%; box-sizing: border-box; }
            * { box-shadow: none !important; box-sizing: border-box !important; }
          }
        `}} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px', borderBottom: '2px dashed #000', paddingBottom: '10px' }}>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0', color: '#000' }}>{companyName}</h2>
          </div>
          <div style={{ flex: 2, textAlign: 'center' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0' }}>تسوية {pos.name || 'مبيعات'}</h1>
          </div>
          <div style={{ flex: 1, textAlign: 'left', fontSize: '14px', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <div><span dir="ltr">{date || summary?.date || new Date().toLocaleDateString('en-GB')}</span></div>
            <div><span dir="ltr">{new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span></div>
          </div>
        </div>
        
        <table style={{ width: '100%', marginBottom: '25px', borderCollapse: 'collapse', fontSize: '20px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px 0' }}>إجمالي المبيعات</td>
              <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: 'bold' }} dir="ltr">{formatNum(pos.sales)}</td>
            </tr>
            <tr>
              <td style={{ padding: '8px 0' }}>المرتجعات</td>
              <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: 'bold' }} dir="ltr">{formatNum(pos.returns)}</td>
            </tr>
            <tr style={{ borderTop: '2px dashed #000', borderBottom: '2px dashed #000' }}>
              <td style={{ padding: '12px 0', fontWeight: 'bold', fontSize: '26px' }}>صافي المبيعات</td>
              <td style={{ padding: '12px 0', textAlign: 'left', fontWeight: 'bold', fontSize: '26px' }} dir="ltr">{formatNum(net)}</td>
            </tr>
            <tr>
              <td style={{ padding: '10px 0' }}>
                الشبكات
                {pos.networks?.length > 0 && <div style={{ fontSize: '16px', marginTop: '4px' }}>({pos.networks.map((n: number) => formatNum(n)).join(' + ')})</div>}
              </td>
              <td style={{ padding: '10px 0', textAlign: 'left', fontWeight: 'bold' }} dir="ltr">{formatNum(networksTotal)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ borderTop: '3px solid #000', borderBottom: '3px solid #000', margin: '30px 0', padding: '25px 0', textAlign: 'center' }}>
          <div style={{ fontSize: '26px', fontWeight: 'bold', marginBottom: '10px' }}>المطلوب كاش في الدرج</div>
          <div style={{ fontSize: '42px', fontWeight: 'bold' }} dir="ltr">{formatNum(net - networksTotal)}</div>
        </div>

        {pos.physicalCash !== undefined && (
          <div style={{ textAlign: 'center', marginTop: '30px' }}>
            <div style={{ fontSize: '26px' }}>الكاش الفعلي الموجود: <span dir="ltr" style={{ fontWeight: 'bold', fontSize: '32px', display: 'block', marginTop: '8px' }}>{formatNum(pos.physicalCash)}</span></div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '20px', padding: '15px', border: '3px dashed #000', borderRadius: '8px' }}>
              {diff === 0 ? 'الدرج مطابق تماماً' : diff > 0 ? `النتيجة: زيادة ${formatNum(Math.abs(diff))}` : `النتيجة: عجز ${formatNum(Math.abs(diff))}`}
            </div>
          </div>
        )}
        
        <div style={{ marginTop: '50px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>توقيع الكاشير</div>
          <div style={{ marginTop: '50px', borderBottom: '2px dashed #000', margin: '50px 30px 0 30px' }}></div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '40px', fontSize: '22px', paddingBottom: '30px', fontWeight: 'bold' }}>-- تم --</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="hidden print:block rtl p-8 w-[800px] print:w-full print:bg-white dark:bg-slate-900 print:bg-white text-black dark:text-white print:text-black font-sans mx-auto">
      <div className="flex justify-between items-start mb-4 pb-3 border-b-2 border-gray-300">
        <div className="flex-1 text-right">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white print:text-black">{companyName}</h2>
        </div>
        <div className="flex-[2] text-center">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white print:text-black border-2 border-slate-900 dark:border-white print:border-slate-800 inline-block px-5 py-1.5 rounded-[4px] shadow-[2px_2px_0_0_rgba(17,24,39,1)] dark:shadow-[2px_2px_0_0_rgba(255,255,255,1)] print:shadow-[2px_2px_0_0_rgba(17,24,39,1)]">
            تسوية نقطة بيع: {pos.name || 'بدون اسم'}
          </h1>
        </div>
        <div className="flex-1 text-left flex flex-col items-end gap-1">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300 print:text-slate-700 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:border-slate-200 print:bg-slate-50 px-2 rounded-[4px]">التاريخ: <span dir="ltr" className="font-mono">{date || summary?.date || new Date().toLocaleDateString('en-GB')}</span></p>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300 print:text-slate-700 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:border-slate-200 print:bg-slate-50 px-2 rounded-[4px]">الطباعة: <span dir="ltr" className="font-mono">{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span></p>
        </div>
      </div>
      
      <table className="w-full text-right border-collapse text-xl border-2 border-gray-400 mb-8 rounded-[4px] overflow-hidden shadow-sm">
        <tbody>
          <tr className="border-b-2 border-gray-300">
            <td className="py-4 px-6 font-bold bg-slate-50 dark:bg-slate-800/50/50 align-middle w-2/3">إجمالي المبيعات</td>
            <td className="py-4 px-6 font-black font-mono text-2xl border-r-2 border-gray-300 bg-white dark:bg-slate-900 print:bg-white" dir="ltr">{formatNum(pos.sales)}</td>
          </tr>
          <tr className="border-b-2 border-gray-300">
            <td className="py-4 px-6 font-bold text-rose-800 bg-rose-50 align-middle w-2/3">المرتجعات (تخصم)</td>
            <td className="py-4 px-6 font-black font-mono text-2xl text-rose-700 border-r-2 border-gray-300 bg-white dark:bg-slate-900 print:bg-white" dir="ltr">{formatNum(pos.returns)}</td>
          </tr>
          <tr className="border-b-2 border-gray-400">
            <td className="py-4 px-6 font-black bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 align-middle w-2/3">صافي المبيعات</td>
            <td className="py-4 px-6 font-black font-mono text-2xl border-r-2 border-gray-400 bg-white dark:bg-slate-900 print:bg-white text-slate-800 dark:text-slate-200" dir="ltr">{formatNum(net)}</td>
          </tr>
          <tr className="border-b-2 border-gray-300">
            <td className="py-4 px-6 font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800/80 align-middle w-2/3 break-words relative">
              <span className="block mb-1">إجمالي الشبكات (تخصم)</span>
              {pos.networks?.length > 0 && (
                <span className="text-[15px] font-normal text-slate-900 dark:text-white tracking-tight block bg-slate-100 dark:bg-slate-800/50 px-2 py-1 rounded inline-block mt-1">
                  ( {pos.networks.map((n: number) => formatNum(n)).join(' + ')} )
                </span>
              )}
            </td>
            <td className="py-4 px-6 font-black font-mono text-2xl text-slate-800 dark:text-slate-200 font-bold border-r-2 border-gray-300 bg-white dark:bg-slate-900 print:bg-white align-middle" dir="ltr">{formatNum(networksTotal)}</td>
          </tr>
          <tr className="border-b-[3px] border-slate-800 bg-amber-50">
            <td className="py-5 px-6 font-black text-amber-900 align-middle w-2/3 text-2xl">المطلوب كاش في الدرج</td>
            <td className="py-5 px-6 font-black font-mono text-3xl text-indigo-800 border-r-2 border-slate-800 bg-amber-50/50" dir="ltr">{formatNum(net - networksTotal)}</td>
          </tr>
          {pos.physicalCash !== undefined && (
            <tr className="border-b-0 border-gray-300">
              <td className="py-4 px-6 font-bold text-emerald-900 bg-emerald-100 align-middle w-2/3 text-xl">الكاش الفعلي الموجود بالدرج</td>
              <td className="py-4 px-6 font-black font-mono text-2xl text-emerald-800 border-r-2 border-gray-300 bg-emerald-50/30" dir="ltr">{formatNum(pos.physicalCash)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {pos.physicalCash !== undefined && (
        <div className={`p-8 mt-8 rounded-[4px] border-4 text-center ${diff === 0 ? 'bg-emerald-50 border-emerald-400' : diff > 0 ? 'bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-600' : 'bg-rose-50 border-rose-400'}`}>
          <p className="text-xl font-bold mb-2 text-gray-600">نتيجة جرد الدرج الفعلي</p>
          <div className={`font-black text-4xl tracking-tight ${diff === 0 ? 'text-emerald-800' : diff > 0 ? 'text-slate-900 dark:text-white' : 'text-rose-800'}`}>
            {diff === 0 ? 'الدرج مطابق تماماً (لا عجز ولا زيادة)' : diff > 0 ? `يوجد زيادة: ${formatNum(Math.abs(diff))}` : `يوجد عجز: ${formatNum(Math.abs(diff))}`}
          </div>
          {diff !== 0 && (
             <p className={`mt-3 font-bold ${diff > 0 ? 'text-slate-900 dark:text-white tracking-tight' : 'text-rose-600'}`}>
               يرجى المراجعة والتسوية مع القسم المختص.
             </p>
          )}
        </div>
      )}
    </div>
  );
};

const ComprehensivePrintView = ({ companyName, state, summary, formatNum }: any) => {
  return (
    <div dir="rtl" className="hidden print:block rtl w-full min-h-screen bg-white dark:bg-slate-900 print:bg-white text-black font-sans p-8 box-border print:!m-0">
      <div className="flex justify-between items-start mb-4 pb-3 border-b-4 border-double border-gray-400">
        <div className="flex-1 text-right">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white print:text-black">{companyName}</h2>
        </div>
        <div className="flex-[2] text-center">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white print:text-black border-2 border-slate-900 dark:border-white print:border-slate-800 inline-block px-4 py-1.5 rounded-[4px] shadow-[2px_2px_0_0_rgba(17,24,39,1)] dark:shadow-[2px_2px_0_0_rgba(255,255,255,1)] print:shadow-[2px_2px_0_0_rgba(17,24,39,1)]">ملخص الخزينة اليومي</h1>
        </div>
        <div className="flex-1 text-left flex flex-col items-end gap-1">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300 print:text-slate-700 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:border-slate-200 print:bg-slate-50 px-2 rounded-[4px]">التاريخ: <span dir="ltr" className="font-mono">{state.date}</span></p>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300 print:text-slate-700 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:border-slate-200 print:bg-slate-50 px-2 rounded-[4px]">الطباعة: <span dir="ltr" className="font-mono">{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="border-2 border-gray-300 rounded-[4px] p-4">
          <h2 className="text-xl font-bold bg-slate-50 dark:bg-slate-800/50 -mx-4 -mt-4 mb-4 p-2 text-center rounded-t-lg border-b-2 border-gray-300">بيانات الأرصدة</h2>
          <table className="w-full text-right font-medium">
            <tbody>
              <tr className="border-b border-gray-200"><td className="py-4">رصيد أول المدة</td><td dir="ltr" className="py-2 text-left">{formatNum(state.previousBalance)}</td></tr>
              <tr className="border-b border-gray-200"><td className="py-4">إجمالي الإيرادات (+)</td><td dir="ltr" className="py-2 text-left text-green-700">{formatNum(summary.totalCashIn)}</td></tr>
              <tr className="border-b border-gray-200"><td className="py-4">إجمالي المصروفات (-)</td><td dir="ltr" className="py-2 text-left text-red-700">{formatNum(summary.totalCashOut)}</td></tr>
              <tr className="bg-slate-50 dark:bg-slate-800/50/50 font-bold text-lg"><td className="py-3">الرصيد الدفتري المتوقع</td><td dir="ltr" className="py-3 text-left">{formatNum(summary.expectedCash)}</td></tr>
              <tr className="bg-slate-100 dark:bg-slate-800 font-bold text-lg"><td className="py-3">الرصيد الفعلي (الخزينة)</td><td dir="ltr" className="py-3 text-left">{formatNum(summary.actualCash)}</td></tr>
              <tr className={`font-black text-xl ${summary.difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                <td className="py-3 pt-4 border-t-2 border-gray-400">العجز أو الزيادة</td>
                <td dir="ltr" className="py-3 pt-4 border-t-2 border-gray-400 text-left">{summary.difference > 0 ? '+' : ''}{formatNum(summary.difference)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border-2 border-gray-300 rounded-[4px] p-4">
          <h2 className="text-xl font-bold bg-slate-50 dark:bg-slate-800/50 -mx-4 -mt-4 mb-4 p-2 text-center rounded-t-lg border-b-2 border-gray-300">ملخص الإيرادات والنقاط</h2>
          <table className="w-full text-right font-medium text-[15px]">
            <thead>
              <tr className="border-b border-gray-300 text-gray-600">
                <th className="py-1">نقطة البيع</th><th className="py-1 text-center">الصافي</th><th className="py-1 text-left">شبكات</th>
              </tr>
            </thead>
            <tbody>
              {(state.posData || []).map((pos: any, i: number) => {
                const net = pos.sales - pos.returns;
                const networksTotal = pos.networks.reduce((a: number, b: any) => a + (typeof b === 'number' ? b : b.amount || 0), 0);
                return (
                  <tr key={i} className="border-b border-gray-200 last:border-0 relative">
                     <td className="py-4 font-bold w-1/3">{pos.name || 'بدون اسم'}</td>
                     <td className="py-4 text-center" dir="ltr">{formatNum(net)}</td>
                     <td className="py-4 text-left" dir="ltr">{formatNum(networksTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {((state.expenseRefunds) || []).length > 0 && (
             <div className="mt-4 pt-4 border-t border-gray-300">
               <p className="font-bold mb-2">إيرادات أخرى (إضافات للخزينة):</p>
               {(state.expenseRefunds || []).map((e: any, i: number) => (
                  <div key={i} className="flex justify-between text-[15px] py-1">
                    <span>{e.name}</span><span dir="ltr" className="font-medium">{formatNum(e.amount)}</span>
                  </div>
               ))}
             </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="border-2 border-gray-300 rounded-[4px] p-4">
          <h2 className="text-xl font-bold bg-slate-50 dark:bg-slate-800/50 -mx-4 -mt-4 mb-4 p-2 text-center rounded-t-lg border-b-2 border-gray-300">المصروفات والمدفوعات</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-bold underline decoration-gray-400 mb-1">مصروفات متنوعة</h3>
              {((state.expenses) || []).length > 0 ? (state.expenses || []).map((e: any, i: number) => (
                  <div key={i} className="flex justify-between text-[15px] py-1 border-b border-gray-100 last:border-0">
                    <span>{e.name}</span><span dir="ltr">{formatNum(e.amount)}</span>
                  </div>
              )) : <p className="text-gray-500 text-[15px]">لا يوجد</p>}
            </div>
            <div>
              <h3 className="font-bold underline decoration-gray-400 mb-1">تحويلات عملاء (يخصم من الخزينة)</h3>
              {((state.customerTransfers) || []).length > 0 ? (state.customerTransfers || []).map((e: any, i: number) => (
                  <div key={i} className="flex justify-between text-[15px] py-1 border-b border-gray-100 last:border-0">
                    <span>{e.name}</span><span dir="ltr">{formatNum(e.amount)}</span>
                  </div>
              )) : <p className="text-gray-500 text-[15px]">لا يوجد</p>}
            </div>
            <div>
              <h3 className="font-bold underline decoration-gray-400 mb-1">سداد شركات / موردين</h3>
              {((state.companyPayments) || []).length > 0 ? (state.companyPayments || []).map((e: any, i: number) => (
                  <div key={i} className="flex justify-between text-[15px] py-1 border-b border-gray-100 last:border-0">
                    <span>{e.name}</span><span dir="ltr">{formatNum(e.amount)}</span>
                  </div>
              )) : <p className="text-gray-500 text-[15px]">لا يوجد</p>}
            </div>
          </div>
        </div>

        <div className="border-2 border-gray-300 rounded-[4px] p-4">
          <h2 className="text-xl font-bold bg-slate-50 dark:bg-slate-800/50 -mx-4 -mt-4 mb-4 p-2 text-center rounded-t-lg border-b-2 border-gray-300">ملاحظات وعهدة</h2>
           <div>
              <h3 className="font-bold underline decoration-gray-400 mb-1">إيداعات بنكية (خوارج)</h3>
              {((state.cashDeposits) || []).length > 0 ? (state.cashDeposits || []).map((e: any, i: number) => (
                  <div key={i} className="flex justify-between text-[15px] py-1 border-b border-gray-100 last:border-0">
                    <span>{e.name}</span><span dir="ltr">{formatNum(e.amount)}</span>
                  </div>
              )) : <p className="text-gray-500 text-[15px]">لا يوجد</p>}
            </div>
            <div className="mt-4">
              <h3 className="font-bold underline decoration-gray-400 mb-1">أموال معلقة (آجل)</h3>
              <div className="flex justify-between text-[15px] py-1">
                 <span>لنا (تضاف للعهدة):</span><span dir="ltr" className="font-bold">{formatNum(summary.totalPendingOwedToUs)}</span>
              </div>
              <div className="flex justify-between text-[15px] py-1">
                 <span>علينا (تخصم من العهدة):</span><span dir="ltr" className="font-bold">{formatNum(summary.totalPendingOwedByUs)}</span>
              </div>
            </div>
        </div>
      </div>
      
      <div className="mt-8 pt-8 border-t-2 border-black flex justify-between px-16 text-xl font-bold">
        <div className="text-center">
          <p className="mb-8">توقيع المستلم</p>
          <p>.......................</p>
        </div>
        <div className="text-center">
          <p className="mb-8">توقيع المُسلِّم</p>
          <p>.......................</p>
        </div>
      </div>
    </div>
  );
};
const PendingPrintView = ({ companyName, pendingOwedToUs, pendingOwedByUs, formatNum, isPdfMode = false, id }: any) => {
  const sumOwedToUs = pendingOwedToUs.reduce((a: number, b: any) => a + b.amount, 0);
  const sumOwedByUs = pendingOwedByUs.reduce((a: number, b: any) => a + b.amount, 0);

  return (
    <div id={id} dir="rtl" className={isPdfMode ? "rtl bg-white text-black font-sans w-[800px] mx-auto p-10 box-border" : "hidden print:block rtl w-full bg-white text-black font-sans py-8 px-6 box-border print:!m-0"}>
      
      {/* Header aligned perfectly */}
      <div className="flex justify-between items-start mb-4 pb-3 border-b-4 border-double border-gray-400">
        <div className="flex-[1.5] text-right">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white print:text-black">{companyName}</h2>
        </div>
        <div className="flex-[2] text-center">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white print:text-black border-2 border-slate-900 dark:border-white print:border-slate-800 inline-block px-5 py-1.5 rounded-[4px] shadow-[2px_2px_0_0_rgba(17,24,39,1)] dark:shadow-[2px_2px_0_0_rgba(255,255,255,1)] print:shadow-[2px_2px_0_0_rgba(17,24,39,1)]">تقرير الأموال المعلقة</h1>
        </div>
        <div className="flex-1 text-left flex flex-col items-end gap-1">
           <p className="text-sm font-bold text-slate-700 dark:text-slate-300 print:text-slate-700 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:border-slate-200 print:bg-slate-50 px-2 rounded-[4px]">التاريخ: <span dir="ltr" className="font-mono">{new Date().toLocaleDateString('en-GB')}</span></p>
           <p className="text-sm font-bold text-slate-700 dark:text-slate-300 print:text-slate-700 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:border-slate-200 print:bg-slate-50 px-2 rounded-[4px]">الوقت: <span dir="ltr" className="font-mono">{new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span></p>
        </div>
      </div>

      <div className="columns-1 print:columns-2 gap-8 items-start" style={{ columnRule: '1px solid #cbd5e1' }}>
        
        {/* Us Column */}
        <div className="flex flex-col border border-slate-300 rounded-[4px] mb-8">
          <div className="bg-slate-100 p-3 flex justify-between items-center border-b border-slate-300 break-inside-avoid">
             <h3 className="text-lg font-bold text-slate-800">لنا (سلف / عهد)</h3>
             <span dir="ltr" className="font-mono font-black text-lg text-slate-900">{formatNum(sumOwedToUs)}</span>
          </div>
          <div className="bg-white">
            <table className="w-full text-right border-collapse">
              <thead className="break-inside-avoid">
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-2 font-bold text-slate-600 text-xs w-10 text-center">#</th>
                  <th className="p-2 font-bold text-slate-600 text-[13px]">الاسم</th>
                  <th className="p-2 font-bold text-slate-600 text-[13px] text-left">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {pendingOwedToUs.length > 0 ? pendingOwedToUs.map((item: any, idx: number) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0 break-inside-avoid">
                    <td className="p-2 text-center text-slate-500 font-bold text-sm">{idx + 1}</td>
                    <td className="p-2 font-bold text-slate-800 text-[15px]">{item.name}</td>
                    <td className="p-2 font-mono font-bold text-slate-900 text-[15px] text-left" dir="ltr">{formatNum(item.amount)}</td>
                  </tr>
                )) : (
                  <tr className="break-inside-avoid">
                    <td colSpan={3} className="p-6 text-center text-slate-400 font-bold text-sm">لا توجد أموال معلقة لنا</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Them Column */}
        <div className="flex flex-col border border-slate-300 rounded-[4px] mb-8">
          <div className="bg-slate-100 p-3 flex justify-between items-center border-b border-slate-300 break-inside-avoid">
             <h3 className="text-lg font-bold text-slate-800">علينا (أمانات / مستحقات)</h3>
             <span dir="ltr" className="font-mono font-black text-lg text-slate-900">{formatNum(sumOwedByUs)}</span>
          </div>
          <div className="bg-white">
            <table className="w-full text-right border-collapse">
              <thead className="break-inside-avoid">
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-2 font-bold text-slate-600 text-xs w-10 text-center">#</th>
                  <th className="p-2 font-bold text-slate-600 text-[13px]">الاسم</th>
                  <th className="p-2 font-bold text-slate-600 text-[13px] text-left">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {pendingOwedByUs.length > 0 ? pendingOwedByUs.map((item: any, idx: number) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0 break-inside-avoid">
                    <td className="p-2 text-center text-slate-500 font-bold text-sm">{idx + 1}</td>
                    <td className="p-2 font-bold text-slate-800 text-[15px]">{item.name}</td>
                    <td className="p-2 font-mono font-bold text-slate-900 text-[15px] text-left" dir="ltr">{formatNum(item.amount)}</td>
                  </tr>
                )) : (
                  <tr className="break-inside-avoid">
                    <td colSpan={3} className="p-6 text-center text-slate-400 font-bold text-sm">لا توجد أموال معلقة علينا</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>


      <div className="mt-8 p-4 border-2 border-slate-300 bg-slate-50 rounded-[4px] flex justify-between items-center">
         <div className="text-lg font-bold text-slate-800">صافي فرق المعلق: 
            <span dir="ltr" className="mx-3 font-mono text-xl text-black">{formatNum(Math.abs(sumOwedToUs - sumOwedByUs))}</span>
            <span className="text-[15px] text-slate-600">({sumOwedToUs - sumOwedByUs >= 0 ? 'صافي لنا' : 'صافي علينا'})</span>
         </div>
         <div className="text-[15px] font-bold text-slate-500">
            توقيع المراجع: ..............................
         </div>
      </div>
      
    </div>
  );
};

const AnalyticsView = ({ history, currentState, formatNum, onUpdate }: any) => {
  const [dateRange, setDateRange] = useState<'all' | 'year' | 'month'>('all');
  
  const allData = [...history.map((s: any) => ({ ...s.state, isCurrent: false })), { ...currentState, isCurrent: true }];
  
  let metricsRawData = allData.map(state => {
    const netSales = state.posData ? state.posData.reduce((acc: number, pos: any) => acc + (pos.sales - pos.returns), 0) : 0;
    const refunds = state.expenseRefunds ? state.expenseRefunds.reduce((a:number, c:any)=>a+c.amount, 0) : 0;
    const totalIn = netSales + refunds;

    const exp1 = state.expenses ? state.expenses.reduce((a:number,c:any)=>a+c.amount,0) : 0;
    const exp2 = state.companyPayments ? state.companyPayments.reduce((a:number,c:any)=>a+c.amount,0) : 0;
    const exp3 = state.customerTransfers ? state.customerTransfers.reduce((a:number,c:any)=>a+c.amount,0) : 0;
    const totalOut = exp1 + exp2 + exp3;
    
    const posSalesBreakdown = state.posData ? state.posData.map((pos: any) => ({ name: pos.name || 'بدون اسم', sales: pos.sales - pos.returns })) : [];

    const parts = state.date.split('/');
    let month = '', day = '', year = '';
    let dObj = new Date();
    
    if (parts.length === 3) {
      day = parts[0]; month = parts[1]; year = parts[2];
      dObj = new Date(Number(year), Number(month) - 1, Number(day));
    }
    
    return {
      isHistoricalDay: false,
      historicalId: '',
      dateStr: state.date,
      dateObj: dObj,
      monthYear: parts.length === 3 ? `${month}/${year}` : 'غير محدد',
      sales: totalIn,
      pureNetSales: netSales,
      expenses: totalOut,
      net: totalIn - totalOut,
      isCurrent: state.isCurrent,
      dateName: parts.length === 3 ? `${day}/${month}` : state.date,
      posSalesBreakdown,
      year: year,
      month: month
    };
  });

  if (currentState.historicalSales && Array.isArray(currentState.historicalSales)) {
    currentState.historicalSales.forEach((hist: any) => {
      if (hist.type === 'day') {
        const parts = hist.dateStr.split('/');
        if (parts.length === 3) {
           metricsRawData.push({
             dateStr: hist.dateStr,
             dateObj: new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])),
             monthYear: `${parts[1]}/${parts[2]}`,
             sales: hist.netSales,
             pureNetSales: hist.netSales,
             expenses: 0,
             net: hist.netSales,
             isCurrent: false,
             isHistoricalDay: true,
             historicalId: hist.id,
             dateName: `${parts[0]}/${parts[1]}`,
             posSalesBreakdown: [],
             year: parts[2],
             month: parts[1]
           });
        }
      }
    });
  }

  const uniqueMetricsMap = new Map();
  metricsRawData.forEach(item => {
    if (!uniqueMetricsMap.has(item.dateStr)) {
      uniqueMetricsMap.set(item.dateStr, item);
    } else {
      // Prioritize current over historical or history ones
      if (item.isCurrent) {
        uniqueMetricsMap.set(item.dateStr, item);
      }
    }
  });

  const dailyMetricsRaw = Array.from(uniqueMetricsMap.values()).sort((a: any, b: any) => a.dateObj.getTime() - b.dateObj.getTime());
  
  const currentYearStr = new Date().getFullYear().toString();
  const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
  
  const dailyMetrics = dailyMetricsRaw.filter((d: any) => {
    if (dateRange === 'year') return d.year === currentYearStr;
    if (dateRange === 'month') return d.year === currentYearStr && d.month === currentMonthStr;
    return true;
  });

  const totalSalesVal = dailyMetrics.reduce((sum, d) => sum + d.pureNetSales, 0);
  const totalExpensesVal = dailyMetrics.reduce((sum, d) => sum + d.expenses, 0);
  const totalNetVal = totalSalesVal - totalExpensesVal;
  const daysRecorded = dailyMetrics.length;
  const avgDailySales = daysRecorded > 0 ? totalSalesVal / daysRecorded : 0;

  const posAgg = dailyMetrics.reduce((acc: any, curr: any) => {
    curr.posSalesBreakdown.forEach((pos: any) => {
      if (!acc[pos.name]) acc[pos.name] = 0;
      acc[pos.name] += pos.sales;
    });
    return acc;
  }, {});

  const posChartData = Object.keys(posAgg).map(key => ({
    name: key,
    value: posAgg[key]
  })).sort((a, b) => b.value - a.value).filter(p => p.value > 0);

  const formatCurrency = (val: number) => Math.floor(val).toLocaleString('en-US');
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  const handleAnalyzeSales = async () => {
    setAiLoading(true);
    try {
      const summaryText = dailyMetrics.map((d: any) => `- التاريخ ${d.dateStr}: مبيعات ${formatNum(d.pureNetSales)}, منصرفات ${formatNum(d.expenses)}`).join('\n');
      const prompt = `بصفتك محلل مالي ومدير حسابات استراتيجي، قم بتحليل بيانات الخزينة التالية وقدم تقريراً مفصلاً باللغة العربية:

1. **ملخص الأداء:** جدول يوضح إجمالي المبيعات، والمنصرفات، وصافي الأرباح للمدة المحددة.
2. **رؤى مالية:** تحليل لكفاءة الأداء، هل هناك تضخم في المصروفات؟
3. **التوصيات:** 3 نصائح عملية لتحسين الأداء.

البيانات:
${summaryText.substring(0, 3000)}

ملاحظات:
- استخدم جداول Markdown.
- كن إيجابياً ومحترفاً في لهجتك.
- استخدم رموز تعبيرية (📊، 💰، 💡)`;

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      setAiAnalysis(response.text);
    } catch (err) {
      console.error("AI Analysis failed:", err);
      setAiAnalysis("حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.");
    } finally {
      setAiLoading(false);
    }
  };

  const calculateGrowthPercentage = () => {
     // A simple fallback if we don't have previous period exactly, just return a random positive looking string or empty.
     // Better not to fake data, we can just return an empty string if we can't reliably compute it.
     return ''; 
  };

  return (
    <div className="space-y-6 print:block print:w-full animate-in fade-in zoom-in-95 duration-300 pb-10">
      
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 print:hidden bg-transparent py-2">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Activity className="text-slate-900 dark:text-white tracking-tight" />
            لوحة التأشيرات والتحليلات
          </h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 font-medium">نظرة شاملة ومتقدمة على مؤشرات الأداء والنمو المالي</p>
        </div>
        
        <div className="flex bg-white dark:bg-slate-900 print:bg-white/80 p-1 rounded-[4px] shadow-sm border border-slate-200 dark:border-slate-700/50 w-full sm:w-auto">
          {[
            { id: 'all', label: 'كل الأوقات' },
            { id: 'year', label: 'العام الحالي' },
            { id: 'month', label: 'الشهر الحالي' }
          ].map(rt => (
            <button 
              key={rt.id}
              onClick={() => { setDateRange(rt.id as any); setAiAnalysis(null); }}
              className={`flex-1 sm:px-6 py-2 text-[13px] sm:text-sm font-bold rounded-[4px] transition-all duration-300 ${dateRange === rt.id ? 'bg-slate-800 text-white shadow-sm border-slate-700' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50'}`}
            >
              {rt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 print:hidden">
        <div className="bg-white dark:bg-slate-900 print:bg-white p-5 rounded-[4px] shadow-sm border border-slate-200 dark:border-slate-700/60 relative overflow-hidden group hover:border-slate-300 dark:border-slate-600 transition-all duration-300">
          
          <p className="text-slate-500 dark:text-slate-400 text-[13px] font-medium mb-3 flex items-center gap-2">
             <TrendingUp size={16} className="text-slate-900 dark:text-white"/> إجمالي المبيعات
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-[26px] font-bold text-slate-800 dark:text-slate-200 font-mono tracking-tight" dir="ltr">{formatCurrency(totalSalesVal)}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 print:bg-white p-5 rounded-[4px] shadow-sm border border-slate-200 dark:border-slate-700/60 relative overflow-hidden group hover:border-slate-300 dark:border-slate-600 transition-all duration-300">
          
          <p className="text-slate-500 dark:text-slate-400 text-[13px] font-medium mb-3 flex items-center gap-2">
            <TrendingDown size={16} className="text-rose-500"/> المنصرفات والمدفوعات
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-[26px] font-bold text-slate-800 dark:text-slate-200 font-mono tracking-tight" dir="ltr">{formatCurrency(totalExpensesVal)}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 print:bg-white p-5 rounded-[4px] shadow-sm border border-slate-200 dark:border-slate-700/60 relative overflow-hidden group hover:border-slate-300 dark:border-slate-600 transition-all duration-300">
          
          <p className="text-slate-500 dark:text-slate-400 text-[13px] font-medium mb-3 flex items-center gap-2">
            <Wallet size={16} className="text-[#2b7d2b] text-brand-success"/> صافي التدفق المالي
          </p>
          <div className="flex items-end justify-between">
            <h3 className={`text-[26px] font-bold font-mono tracking-tight ${totalNetVal >= 0 ? 'text-slate-800 dark:text-slate-200' : 'text-slate-800 dark:text-slate-200'}`} dir="ltr">{formatCurrency(totalNetVal)}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 print:bg-white p-5 rounded-[4px] shadow-sm border border-slate-200 dark:border-slate-700/60 relative overflow-hidden group hover:border-slate-300 dark:border-slate-600 transition-all duration-300">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-indigo-500"></div>
          <p className="text-slate-500 dark:text-slate-400 text-[13px] font-medium mb-3 flex items-center gap-2">
            <CalendarDays size={16} className="text-indigo-500"/> المتوسط اليومي
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-[26px] font-bold text-slate-800 dark:text-slate-200 font-mono tracking-tight" dir="ltr">{formatCurrency(avgDailySales)}</h3>
            <div className="text-indigo-600 bg-indigo-50/80 px-2 py-1 rounded-[4px] text-[11px] font-bold">
               ${daysRecorded} أيام
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Trend Combo Chart */}
        <div className="bg-white dark:bg-slate-900 print:bg-white/90 backdrop-blur-xl p-6 rounded-[4px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 dark:border-slate-700/60 lg:col-span-2 flex flex-col transition-all hover:shadow-lg">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-lg">
              <LineChartIcon className="text-slate-900 dark:text-white" size={20} /> الاتجاه العام للمبيعات والمصروفات
            </h3>
          </div>
          {dailyMetrics.length >= 2 ? (
            <div className="h-[320px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyMetrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="dateName" tick={{ fill: '#64748B', fontSize: 12, fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickMargin={10} minTickGap={20} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 12, fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={(val) => `${val >= 1000 ? val/1000 + 'k' : val}`} />
                  <RechartsTooltip 
                    formatter={(value: number, name: string) => [formatNum(value), name === 'pureNetSales' ? 'المبيعات الصافية' : 'المصروفات والمدفوعات']}
                    labelFormatter={(label) => `التاريخ: ${label}`}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', fontFamily: 'Cairo', textAlign: 'right', fontWeight: 'bold' }}
                    itemStyle={{ padding: '4px 0' }}
                  />
                  <Legend wrapperStyle={{ fontFamily: 'Cairo', fontSize: '13px', paddingTop: '15px' }} />
                  <Area type="monotone" dataKey="pureNetSales" name="المبيعات الصافية" fill="url(#colorSales)" stroke="#3b82f6" strokeWidth={3} activeDot={{r: 6, strokeWidth: 0}} />
                  <Line type="monotone" dataKey="expenses" name="المصروفات والمدفوعات" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3, fill: '#f43f5e', strokeWidth: 0 }} activeDot={{r: 5, strokeWidth: 0}} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50 dark:bg-slate-800/50/50 rounded-[4px] border border-dashed border-slate-200 dark:border-slate-700 min-h-[250px]">
              <LineChartIcon size={40} className="mb-3 opacity-30" />
              <p className="font-medium text-[15px]">نحتاج إلى يومين على الأقل لتوضيح الاتجاه</p>
            </div>
          )}
        </div>

        {/* POS Breakdown Chart */}
        <div className="bg-white dark:bg-slate-900 print:bg-white/90 backdrop-blur-xl p-6 rounded-[4px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 dark:border-slate-700/60 flex flex-col transition-all hover:shadow-lg">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2 text-lg">
            <PieChartIcon className="text-[#2b7d2b] text-brand-success" size={20} /> مساهمة نقاط البيع
          </h3>
          {posChartData.length > 0 ? (
            <div className="h-[280px] w-full flex flex-col" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={posChartData}
                    cx="50%"
                    cy="45%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {posChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="hover:opacity-80 transition-opacity outline-none" />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: number) => formatNum(value)}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontFamily: 'Cairo', textAlign: 'right', fontSize: '14px', fontWeight: 'bold' }}
                  />
                  <Legend layout={undefined} verticalAlign="bottom" align="center" wrapperStyle={{ fontFamily: 'Cairo', fontSize: '12px', paddingTop: '10px' }} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50 dark:bg-slate-800/50/50 rounded-[4px] border border-dashed border-slate-200 dark:border-slate-700 min-h-[250px]">
              <PieChartIcon size={40} className="mb-3 opacity-30" />
              <p className="font-medium text-[15px]">تصنيف مبيعات النقاط غير متاح</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Assistant Section */}
      <div className="bg-indigo-950 rounded-[4px] shadow-xl p-[2px] relative overflow-hidden mt-8 print:hidden transition-all hover:shadow-2xl">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/microbial-mat.png')] opacity-10 MixBlendMode-overlay"></div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600 rounded-full mix-blend-screen filter blur-[80px] opacity-20"></div>
        <div className="bg-[#0f172a]/90 backdrop-blur-xl rounded-[1.4rem] p-6 md:p-8 relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 border border-indigo-500/20">
          <div className="text-right md:flex-1">
            <h3 className="text-xl md:text-2xl font-black text-white mb-2 flex items-center gap-2">
              <Sparkles className="text-indigo-400" /> تحليل مالي متقدم (AI)
            </h3>
            <p className="text-indigo-200 text-[14px] leading-relaxed max-w-2xl opacity-90">
              احصل على تحليل فوري وعميق لبيانات الخزينة والمبيعات ({dateRange === 'all' ? 'لكل الأوقات' : dateRange === 'year' ? 'للعام الحالي' : 'للشهر الحالي'}) لاكتشاف فرص النمو، ومراقبة المصروفات بدقة.
            </p>
          </div>
          <button 
            onClick={handleAnalyzeSales}
            disabled={aiLoading}
            className="w-full md:w-auto shrink-0 bg-white dark:bg-slate-900 print:bg-white text-indigo-900 px-8 py-3.5 rounded-[4px] font-black hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 hover:scale-105 transition-all shadow-[0_4px_20px_rgba(255,255,255,0.15)] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {aiLoading ? (
              <><div className="w-5 h-5 border-2 border-indigo-900 border-t-transparent rounded-full animate-spin"></div> جاري المعالجة...</>
            ) : (
              <><Sparkles size={18} className="text-indigo-600" /> بدء التحليل</>
            )}
          </button>
        </div>
      </div>

      {/* AI Analysis Result */}
      {aiAnalysis && (
        <div className="bg-gradient-to-b from-indigo-50 to-white border border-indigo-100 rounded-[4px] p-6 md:p-8 shadow-md mt-6 animate-in slide-in-from-top-4 duration-500">
          <div className="flex justify-between items-start mb-6 border-b border-indigo-100 pb-4">
            <h3 className="font-black text-indigo-900 text-xl flex items-center gap-2">
              <FileText className="text-indigo-600" /> تقرير المحلل المالي
            </h3>
            <button onClick={() => setAiAnalysis(null)} className="text-slate-400 hover:text-indigo-700 bg-white dark:bg-slate-900 print:bg-white p-2 rounded-[4px] shadow-sm transition-colors border border-slate-100 dark:border-slate-800">
              <X size={18} />
            </button>
          </div>
          <div className="prose prose-indigo prose-sm sm:prose-base max-w-none 
             prose-headings:text-indigo-900 prose-headings:font-bold prose-h3:text-lg 
             prose-p:leading-relaxed text-slate-700 dark:text-slate-300
             prose-table:w-full prose-table:border-collapse prose-table:rounded-[4px] prose-table:overflow-hidden prose-table:shadow-sm prose-table:my-6
             prose-th:bg-indigo-600 prose-th:text-white prose-th:p-4 prose-th:text-right prose-th:border-0
             prose-td:p-4 prose-td:border-b prose-td:border-indigo-50 prose-tr:bg-white dark:bg-slate-900 print:bg-white prose-tr:hover:bg-indigo-50/30 transition-colors
             prose-strong:text-indigo-900" dir="rtl">
            <Markdown remarkPlugins={[remarkGfm]}>{aiAnalysis}</Markdown>
          </div>
        </div>
      )}

      {/* Daily Records List */}
      <div className="bg-white dark:bg-slate-900 print:bg-white/90 backdrop-blur-xl p-6 rounded-[4px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 dark:border-slate-700/60 mt-8 print:hidden transition-all hover:shadow-lg">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2 text-lg">
           <Layers className="text-slate-500 dark:text-slate-400" size={20} /> السجلات اليومية ({dailyMetrics.length})
        </h3>
        {dailyMetrics.length > 0 ? (
          <div className="overflow-x-auto rounded-[4px] border border-slate-200 dark:border-slate-700/60">
            <table className="w-full text-right text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                  <th className="py-4 px-6 font-bold w-1/3 text-right">التاريخ</th>
                  <th className="py-4 px-6 font-bold text-center text-slate-800 dark:text-slate-200 font-bold">المبيعات</th>
                  <th className="py-4 px-6 font-bold text-center text-rose-600">المصروفات</th>
                  <th className="py-4 px-6 font-bold text-center text-[#2b7d2b] text-brand-success">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {dailyMetrics.map((day: any, idx: number) => (
                  <tr key={`${day.dateStr}-${idx}`} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50/80 transition-colors">
                    <td className="py-4 px-6 font-bold text-slate-700 dark:text-slate-300 flex items-center gap-3 border-l border-slate-100 dark:border-slate-800">
                      <span className="font-mono text-[14px]">{day.dateStr}</span>
                      {day.isCurrent && <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md text-[10px] tracking-tight">قيد التشغيل</span>}
                    </td>
                    <td className="py-4 px-6 font-bold text-center text-slate-800 dark:text-slate-200 font-bold font-mono" dir="ltr">{formatCurrency(day.pureNetSales)}</td>
                    <td className="py-4 px-6 font-bold text-center text-rose-600 font-mono" dir="ltr">{formatCurrency(day.expenses)}</td>
                    <td className="py-4 px-6 font-black text-center text-[#2b7d2b] text-brand-success font-mono bg-emerald-50/30" dir="ltr">{formatCurrency(day.pureNetSales - day.expenses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 bg-slate-50 dark:bg-slate-800/50/50 rounded-[4px] border border-dashed border-slate-200 dark:border-slate-700">
            <CalendarDays size={40} className="mb-3 opacity-30" />
            <p className="font-medium text-[15px]">لا يوجد سجلات لهذه الفترة</p>
          </div>
        )}
      </div>

    </div>
  );
};

const SummaryDashboard = ({ state, summary, isExport = false }: { state: AppState, summary: ReturnType<typeof getSummary>, isExport?: boolean }) => {
  if (isExport) {
    return (
      <div className="bg-white dark:bg-slate-900 print:bg-white text-black dark:text-white print:text-black p-6 border border-slate-300 dark:border-slate-600 rounded-[4px] print:border-none print:p-0">
        <h2 className="text-xl font-bold text-center mb-6 border-b border-slate-200 dark:border-slate-700 pb-4 text-slate-800 dark:text-slate-200">ملخص التقفيل اليومي</h2>
        <table className="w-full text-right border-collapse mb-8 text-[15px] text-slate-700 dark:text-slate-300">
          <tbody>
            <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-3 font-bold cursor-default hover:text-slate-900 dark:text-white transition-colors">رصيد أول المدة</td><td className="py-3 font-bold text-slate-900 dark:text-white" dir="ltr">{formatNum(state.previousBalance)}</td></tr>
            <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-3 font-bold text-[#2b7d2b] text-brand-success">+ إجمالي الإيرادات (الوارد)</td><td className="py-3 font-bold text-[#2b7d2b] text-brand-success" dir="ltr">{formatNum(summary.totalCashIn)}</td></tr>
            <tr>
              <td colSpan={2} className="py-2 pr-4 text-[13px] text-slate-500 dark:text-slate-400 font-medium">
                <div className="flex justify-between mb-1"><span>صافي المبيعات</span><span dir="ltr">{formatNum(summary.netSales)}</span></div>
                {summary.totalExpenseRefunds > 0 && <div className="flex justify-between mb-1"><span>مردود مصروفات</span><span dir="ltr">{formatNum(summary.totalExpenseRefunds)}</span></div>}
              </td>
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-800 border-t"><td className="py-3 font-bold text-rose-500">- إجمالي المخصومات (المنصرف)</td><td className="py-3 font-bold text-rose-500" dir="ltr">{formatNum(summary.totalCashOut)}</td></tr>
            <tr>
              <td colSpan={2} className="py-2 pr-4 text-[13px] text-slate-500 dark:text-slate-400 font-medium">
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
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 opacity-90"><td className="py-3 font-bold text-base text-slate-800 dark:text-slate-200 px-2 rounded-r-lg">الرصيد الدفتري (المتوقع)</td><td className="py-3 font-bold text-base text-slate-900 dark:text-white px-2 rounded-l-lg" dir="ltr">{formatNum(summary.expectedCash)}</td></tr>
          </tbody>
        </table>

        <h3 className="text-lg font-bold mb-4 border-b border-slate-200 dark:border-slate-700 pb-2 text-slate-800 dark:text-slate-200">تفاصيل الجرد الفعلي</h3>
        <table className="w-full text-right border-collapse mb-6 text-[15px] text-slate-700 dark:text-slate-300">
          <tbody>
            <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-3 font-bold">النقدية الفعلية (الجرد)</td><td className="py-3 font-bold text-slate-900 dark:text-white" dir="ltr">{formatNum(summary.physicalCash)}</td></tr>
            <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-3 font-bold text-indigo-500">+ أموال معلقة لنا</td><td className="py-3 font-bold text-indigo-500" dir="ltr">{formatNum(summary.totalPendingOwedToUs)}</td></tr>
            <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-3 font-bold text-slate-500 dark:text-slate-400">- أموال معلقة علينا</td><td className="py-3 font-bold text-slate-500 dark:text-slate-400" dir="ltr">{formatNum(summary.totalPendingOwedByUs)}</td></tr>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 opacity-90"><td className="py-3 font-bold text-base text-slate-800 dark:text-slate-200 px-2 rounded-r-lg">الرصيد الفعلي</td><td className="py-3 font-bold text-base text-slate-900 dark:text-white px-2 rounded-l-lg" dir="ltr">{formatNum(summary.actualCash)}</td></tr>
          </tbody>
        </table>

        <div className={`p-4 rounded-[4px] border text-center font-bold text-lg ${summary.difference === 0 ? 'border-none bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : summary.difference > 0 ? 'border-none bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 font-bold' : 'border-none bg-rose-50 text-rose-700'}`}>
          {summary.difference === 0 ? 'الخزينة مطابقة' : summary.difference > 0 ? `يوجد زيادة: ${formatNum(Math.abs(summary.difference))}` : `يوجد عجز: ${formatNum(Math.abs(summary.difference))}`}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="pro-card overflow-hidden print:bg-white dark:bg-slate-900 print:bg-white print:text-black dark:text-white print:text-black print:border print:border-slate-300 dark:border-slate-600">
        <div className="p-4 md:p-5 border-b border-slate-100 dark:border-slate-800 print:border-slate-200 dark:border-slate-700">
          <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-900 animate-pulse"></div> ملخص التقفيل تفصيلي</h2>
          <div className="space-y-2 text-xs md:text-[15px]">
            <div className="flex justify-between items-center gap-2">
              <span className="text-slate-600 dark:text-slate-400 font-medium truncate">رصيد أول المدة</span>
              <span className="font-medium shrink-0" dir="ltr">{formatNum(state.previousBalance)}</span>
            </div>
            
            {/* Inflow Breakdown */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 print:border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-center gap-2 text-[#2b7d2b] text-brand-success font-bold mb-1 pt-1">
                <span className="truncate">+ إجمالي الإيرادات (الوارد)</span>
                <span className="shrink-0" dir="ltr">{formatNum(summary.totalCashIn)}</span>
              </div>
              <div className="pr-4 space-y-1 text-slate-500 dark:text-slate-400 font-medium text-[13px]">
                <div className="flex justify-between gap-2"><span className="truncate">صافي المبيعات</span><span className="shrink-0" dir="ltr">{formatNum(summary.netSales)}</span></div>
                {summary.totalExpenseRefunds > 0 && <div className="flex justify-between gap-2"><span className="truncate">مردود مصروفات</span><span className="shrink-0" dir="ltr">{formatNum(summary.totalExpenseRefunds)}</span></div>}
              </div>
            </div>

            {/* Outflow Breakdown */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 print:border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-center gap-2 text-rose-500 font-bold mb-1 pt-1">
                <span className="truncate">- إجمالي المخصومات (المنصرف)</span>
                <span className="shrink-0" dir="ltr">{formatNum(summary.totalCashOut)}</span>
              </div>
              <div className="pr-4 space-y-1 text-slate-500 dark:text-slate-400 font-medium text-[13px]">
                {summary.totalNetworks > 0 && <div className="flex justify-between gap-2"><span className="truncate">الشبكات</span><span className="shrink-0" dir="ltr">{formatNum(summary.totalNetworks)}</span></div>}
                {summary.totalCustomerTransfers > 0 && <div className="flex justify-between gap-2"><span className="truncate">تحويلات العملاء</span><span className="shrink-0" dir="ltr">{formatNum(summary.totalCustomerTransfers)}</span></div>}
                {summary.totalCompanyPayments > 0 && <div className="flex justify-between gap-2"><span className="truncate">سداد شركات وموردين</span><span className="shrink-0" dir="ltr">{formatNum(summary.totalCompanyPayments)}</span></div>}
                {summary.generalExpensesTotal > 0 && <div className="flex justify-between gap-2"><span className="truncate">مصروفات عامة</span><span className="shrink-0" dir="ltr">{formatNum(summary.generalExpensesTotal)}</span></div>}
                {summary.totalCashDeposits > 0 && <div className="flex justify-between gap-2"><span className="truncate">إيداعات بنكية</span><span className="shrink-0" dir="ltr">{formatNum(summary.totalCashDeposits)}</span></div>}
                
                {/* Separated Expenses */}
                {summary.separatedExpenses.map(exp => (
                  <div key={exp.id} className="flex justify-between gap-2 text-purple-600 font-medium">
                    <span className="truncate">{exp.name || 'مصروف محدد'}</span>
                    <span className="shrink-0" dir="ltr">{formatNum(exp.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 text-[15px] font-bold text-slate-800 dark:text-slate-200">
              <span className="truncate">الرصيد الدفتري (المتوقع)</span>
              <span className="shrink-0" dir="ltr">{formatNum(summary.expectedCash)}</span>
            </div>
          </div>
        </div>
        <div className="p-4 md:p-5 bg-slate-50 dark:bg-slate-800/50/50 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-2 text-xs md:text-[15px] mb-3">
            <div className="flex justify-between items-center gap-2">
              <span className="text-slate-400 print:text-slate-600 dark:text-slate-400 truncate">النقدية الفعلية (الجرد)</span>
              <span className="font-medium shrink-0" dir="ltr">{formatNum(summary.physicalCash)}</span>
            </div>
            <div className="flex justify-between items-center gap-2 text-slate-900 dark:text-white tracking-tight font-medium">
              <span className="truncate">+ أموال معلقة لنا (تُحسب بالخزينة)</span>
              <span className="font-medium shrink-0" dir="ltr">{formatNum(summary.totalPendingOwedToUs)}</span>
            </div>
            <div className="flex justify-between items-center gap-2 text-slate-400 print:text-slate-600 dark:text-slate-400">
              <span className="truncate">- أموال معلقة علينا</span>
              <span className="font-medium shrink-0" dir="ltr">{formatNum(summary.totalPendingOwedByUs)}</span>
            </div>
          </div>
          <div className="flex justify-between items-center gap-2 text-[16px] font-bold text-slate-900 dark:text-white mb-4 pt-1">
            <span className="truncate">الرصيد الفعلي</span>
            <span className="shrink-0" dir="ltr">{formatNum(summary.actualCash)}</span>
          </div>
          <div className={`p-3 rounded-[4px] flex items-center justify-between ${
            summary.difference === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : summary.difference > 0 ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 font-bold border border-slate-300 dark:border-slate-600/60' : 'bg-rose-50 text-rose-700 border border-rose-200/60'
          }`}>
            <div className="flex items-center gap-2 font-bold text-[15px] md:text-base">
              {summary.difference === 0 ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span>{summary.difference === 0 ? 'الخزينة مطابقة' : summary.difference > 0 ? 'يوجد زيادة' : 'يوجد عجز'}</span>
            </div>
            <div className="text-[18px] font-bold" dir="ltr">{formatNum(Math.abs(summary.difference))}</div>
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
      className={`w-full bg-slate-50 dark:bg-slate-800/50/50 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800/30 border text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700/60 rounded-[4px] px-3 py-2 outline-none focus:ring-[3px] focus:ring-brand-500/5 focus:border-slate-400 focus:bg-white dark:bg-slate-900 print:bg-white transition-all text-[14px] placeholder-slate-400 ${type === 'number' ? '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : ''} ${className}`}
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
        className="bg-brand-500 text-white border-none hover:bg-blue-700 text-white px-3 py-2 rounded-[4px] border border-slate-800 shadow-sm hover:shadow active:scale-95 hover:bg-slate-800 transition-all flex items-center justify-center shrink-0"
      >
        <Plus size={18} />
      </button>
    </div>
  );
};

const DynamicTable = ({ title, field, data, icon: Icon, colorClass, onAdd, onUpdate, onRemove, onArchive, onTogglePin, onToggleSummary, onManage, onReorder, sumTransactions, formatNum, savedNames, onSaveName }: any) => {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const safeData = data || [];
  const total = sumTransactions(safeData);
  const listId = `list-${field}`;
  
  const filteredData = useMemo(() => safeData.filter((item: any) => 
    item.name?.toString().toLowerCase().includes(deferredSearchQuery.toLowerCase()) || 
    item.amount?.toString().includes(deferredSearchQuery)
  ), [safeData, deferredSearchQuery]);

  return (
    <div className="bg-white dark:bg-slate-900 print:bg-white rounded-[1rem] shadow-sm border border-slate-200 dark:border-slate-700/60 overflow-hidden mb-6 transition-all">
      <datalist id={listId}>
        {savedNames?.map((name: string) => <option key={name} value={name} />)}
      </datalist>
      
      <div className={`flex justify-between items-center px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 dark:border-slate-800 bg-transparent text-slate-800 dark:text-slate-200`}>
        <div className="flex items-center gap-2 font-bold text-base md:text-lg">
          <Icon size={22} className="opacity-80" />
          {title}
        </div>
        <div className="font-bold bg-white dark:bg-slate-900 print:bg-white/60 px-3 md:px-4 py-1 md:py-1.5 rounded-[4px] shadow-sm text-[15px] md:text-base cursor-default" dir="ltr">{formatNum(total)}</div>
      </div>
      
      {data.length > 0 && (
        <div className="px-4 md:px-5 pt-4 md:pt-5 pb-2 md:pb-3">
          <div className="relative group">
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none transition-opacity opacity-50 group-hover:opacity-100">
              <Search size={16} className="text-slate-500 dark:text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم أو المبلغ..."
              className="w-full pl-3 pr-10 py-2 pro-card dark:border-slate-700/60 rounded-[4px] text-[13px] focus:outline-none focus:ring-[3px] focus:ring-brand-500/5 focus:border-slate-400 focus:bg-white dark:bg-slate-900 print:bg-white transition-all placeholder-slate-400"
            />
          </div>
        </div>
      )}

      <div className="p-5 pt-2">
        
        {filteredData.map((item: any, index: number) => {
          const actualIndex = safeData.findIndex((d: any) => d.id === item.id);
          return (
          <div
key={item.id} 
            className="flex gap-2.5 mb-2.5 items-center group/row"
          >
            {onReorder && searchQuery === '' && (
              <div className="flex flex-col opacity-0 group-hover/row:opacity-100 transition-opacity gap-0.5">
                <button onClick={() => onReorder(item.id, 'up')} disabled={actualIndex === 0} className="text-slate-400 hover:text-slate-900 dark:text-white tracking-tight disabled:opacity-0 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded">
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => onReorder(item.id, 'down')} disabled={actualIndex === safeData.length - 1} className="text-slate-400 hover:text-slate-900 dark:text-white tracking-tight disabled:opacity-0 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded">
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
                className="group-hover/row:border-slate-300 dark:border-slate-600/60 !rounded-[4px]"
              />
            </div>
            <div className="w-1/3">
              <Input type="number" value={item.amount !== undefined && item.amount !== 0 ? round2(item.amount) : item.amount === 0 ? 0 : ''} onChange={(e: any) => onUpdate(item.id, 'amount', e.target.value === '' ? '' : Number(e.target.value))} placeholder="المبلغ" className="text-left font-semibold group-hover/row:border-slate-300 dark:border-slate-600/60 !rounded-[4px]" dir="ltr" />
            </div>
            {onManage && (
              <button onClick={() => onManage(item)} title="إدارة الحساب وكشف الحساب" className="p-2.5 text-slate-900 dark:text-white tracking-tight hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800/80 rounded-[4px] transition-all hover:scale-105 active:scale-95">
                <PlusCircle size={20} />
              </button>
            )}
            {onToggleSummary && (
              <button 
                onClick={() => onToggleSummary(item.id)} 
                title="إظهار منفصل في الملخص"
                className={`p-2.5 rounded-[4px] transition-all hover:scale-105 active:scale-95 ${item.showInSummary ? 'text-purple-600 bg-purple-50 shadow-sm' : 'text-white/70 hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50'}`}
              >
                {item.showInSummary ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
            )}
            {onTogglePin && (
              <button 
                onClick={() => onTogglePin(item.id)} 
                title="تثبيت البند ليظهر يومياً"
                className={`p-2.5 rounded-[4px] transition-all hover:scale-105 active:scale-95 ${item.isPinned ? 'text-slate-900 dark:text-white tracking-tight bg-slate-100 dark:bg-slate-800/80 shadow-sm' : 'text-white/70 hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50'}`}
              >
                <Pin size={20} className={item.isPinned ? "fill-current" : ""} />
              </button>
            )}
            {onArchive && (
              <button onClick={() => onArchive(item.id)} title="تسوية وترحيل للأرشيف" className="p-2.5 text-[#2b7d2b] text-brand-success hover:text-emerald-700 hover:bg-emerald-50 rounded-[4px] transition-all hover:scale-105 active:scale-95">
                <CheckCircle2 size={20} />
              </button>
            )}
            <button onClick={() => onRemove(item.id)} title={onArchive ? "حذف بالخطأ (بدون أرشفة)" : "حذف البند"} className="p-2.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-[4px] transition-all hover:scale-105 active:scale-95 opacity-50 group-hover/row:opacity-100">
              <Trash2 size={20} />
            </button>
          </div>
        )})}
        
        {data.length === 0 && (
          <div className="text-center py-10 px-4 flex flex-col items-center gap-3 bg-slate-50 dark:bg-slate-800/50/50 rounded-[4px] mx-5 mb-5 border border-dashed border-slate-200 dark:border-slate-700">
            <div className="bg-white dark:bg-slate-900 print:bg-white p-4 rounded-full shadow-sm border border-slate-100 dark:border-slate-800 text-slate-300">
              <Icon size={32} strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-slate-600 dark:text-slate-400">لا يوجد بيانات حالياً</p>
              <p className="text-[15px] text-slate-400">لم تقم بإضافة أي بنود في هذا القسم بعد.</p>
            </div>
            <button onClick={onAdd} className="mt-2 text-[15px] font-bold text-slate-900 dark:text-white tracking-tight bg-slate-100 dark:bg-slate-800/80 px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-[4px] transition-colors flex items-center gap-2">
              <Plus size={16} /> أضف أول بند
            </button>
          </div>
        )}
        {data.length > 0 && (
          <div className="px-5 pb-5">
            <button onClick={onAdd} className="flex items-center justify-center gap-2 w-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white text-[14px] font-medium px-4 py-2.5 rounded-[4px] border border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-all active:scale-95 group/btn">
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
    <div className="fixed inset-0 z-[150] bg-slate-100 dark:bg-slate-800/500 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <div className="pro-card w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Calculator size={20} className="text-slate-900 dark:text-white tracking-tight" /> 
            إدارة حساب: {fund.name}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-[4px] transition-colors flex items-center gap-1 text-[15px] font-bold"><ArrowRight size={18} /> رجوع</button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          <div className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-[4px] p-6 text-center mb-6">
            <p className="text-slate-900 dark:text-white tracking-tight font-medium mb-1">الرصيد الحالي</p>
            <p className="text-4xl font-black text-slate-900 dark:text-white" dir="ltr">{formatNum(fund.amount)}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mb-8 items-end">
            <div className="flex-1 w-full">
              <label className="block text-[15px] font-bold text-slate-700 dark:text-slate-300 mb-2">المبلغ (إضافة أو خصم)</label>
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
              <button onClick={handleAdd} disabled={!amount} className="flex-1 sm:flex-none btn-success text-white px-6 py-2.5 rounded-[4px] font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <Plus size={18} /> إضافة
              </button>
              <button onClick={handleSubtract} disabled={!amount} className="flex-1 sm:flex-none bg-rose-600 text-white px-6 py-2.5 rounded-[4px] font-bold hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <Trash2 size={18} /> خصم / تسديد
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-slate-800 dark:text-slate-200">كشف الحساب (من دفتر الأستاذ)</h4>
              <div className="flex gap-2">
                <button onClick={handleCopy} className="text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 dark:bg-slate-700 px-3 py-1.5 rounded-[4px] text-[15px] font-medium transition-colors flex items-center gap-1">
                  <Copy size={16} /> نسخ
                </button>
                <button onClick={handlePrint} className="text-slate-900 dark:text-white tracking-tight bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 px-3 py-1.5 rounded-[4px] text-[15px] font-medium transition-colors flex items-center gap-1">
                  <Printer size={16} /> طباعة
                </button>
              </div>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-[4px] border border-slate-200 dark:border-slate-700 overflow-hidden mb-6">
              <div className="bg-slate-100 dark:bg-slate-800 p-3 font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">سجل الحركات التفصيلية (الجديدة)</div>
              <table className="w-full text-[15px] text-right">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50">
                    <th className="p-3 font-medium">التاريخ والوقت</th>
                    <th className="p-3 font-medium">البيان</th>
                    <th className="p-3 font-medium">النوع</th>
                    <th className="p-3 font-medium">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {historyEntries.map((entry: any) => (
                    <tr key={entry.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-white dark:bg-slate-900 print:bg-white">
                      <td className="p-3">{entry.date}</td>
                      <td className="p-3">{entry.description}</td>
                      <td className="p-3">
                        {editingEntry === entry.id ? (
                          <select 
                            value={editType} 
                            onChange={(e: any) => setEditType(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 print:bg-white border border-slate-200 dark:border-slate-700 rounded-[4px] px-2 py-1 text-[15px] focus:ring-2 focus:ring-brand-500/20 outline-none"
                          >
                            <option value="add">إضافة</option>
                            <option value="sub">خصم</option>
                          </select>
                        ) : (
                          entry.type === 'in' ? <span className="text-[#2b7d2b] text-brand-success">إضافة</span> : 
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
                              className="w-24 bg-white dark:bg-slate-900 print:bg-white border border-slate-200 dark:border-slate-700 rounded-[4px] px-2 py-1 text-[15px] focus:ring-2 focus:ring-brand-500/20 outline-none text-left"
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
                              className="text-[#2b7d2b] text-brand-success hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded-[4px]"
                            >
                              <Check size={16} />
                            </button>
                            <button 
                              onClick={() => setEditingEntry(null)}
                              className="text-white/70 hover:text-white bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 p-1.5 rounded-[4px]"
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
                                  className="text-slate-900 dark:text-white hover:text-slate-800 dark:text-slate-200 font-bold p-1 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800/80 rounded"
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
                      <td colSpan={4} className="text-center p-8 bg-white dark:bg-slate-900 print:bg-white">
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

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-[4px] border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
              <div className="bg-slate-100 dark:bg-slate-800 p-4 font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span>ملخص الأيام السابقة (من دفتر الأستاذ)</span>
                <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2 py-1 rounded-md font-medium">سجل قديم مجمع</span>
              </div>
              <table className="w-full text-[15px] text-right">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50">
                    <th className="p-3 font-semibold pb-4">التاريخ</th>
                    <th className="p-3 font-semibold pb-4">البيان</th>
                    <th className="p-3 font-semibold pb-4">النوع</th>
                    <th className="p-3 font-semibold pb-4">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {personEntries.map((entry: any) => (
                    <tr key={entry.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-white dark:bg-slate-900 print:bg-white transition-colors duration-200 group">
                      <td className="p-3 text-slate-600 dark:text-slate-400">{entry.date}</td>
                      <td className="p-3 font-medium text-slate-700 dark:text-slate-300">{entry.description}</td>
                      <td className="p-3">
                        {entry.type === 'in' ? <span className="text-[#2b7d2b] text-brand-success bg-emerald-50 px-2 py-1 rounded-md font-bold">وارد</span> : 
                         entry.type === 'out' ? <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded-md font-bold">منصرف</span> :
                         <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded-md font-bold">معلق</span>}
                      </td>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200" dir="ltr">{formatNum(entry.amount)}</td>
                    </tr>
                  ))}
                  {personEntries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center p-8 bg-white dark:bg-slate-900 print:bg-white">
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

const LiveClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50/80 backdrop-blur border border-slate-200 dark:border-slate-700/60 px-3 md:px-4 py-1.5 md:py-2 rounded-[4px] shadow-sm text-center min-w-[90px]">
      <span className="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-200 tabular-nums tracking-tight font-mono" dir="ltr">
        {time.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="text-[9px] md:text-[10px] font-bold text-slate-900 dark:text-white tracking-tight mt-0.5">
        {time.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
      </span>
    </div>
  );
};

export default function App() {
  const [state, setState] = useState<AppState>(getInitialState());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [skipLogin, setSkipLogin] = useState(false);
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
  const [activeTab, setActiveTab] = useState<'sales' | 'payments' | 'pending' | 'cash' | 'archive' | 'history' | 'ledger' | 'analytics' | 'settings' | 'admin'>('sales');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isInitialLoad = useRef(true);
  
  // Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<'summary' | 'comprehensive' | 'detailed'>('summary');
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

  const [currentAppView, setCurrentAppView] = useState<'launcher' | 'treasury'>('launcher');

  const [theme, setTheme] = useState<'system'|'light'|'dark'>(() => {
    return (safeLocalStorage.getItem('smart_safe_theme') as any) || 'system';
  });

  useEffect(() => {
    safeLocalStorage.setItem('smart_safe_theme', theme);
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  const [uiScale, setUiScale] = useState<number>(() => {
    return Number(safeLocalStorage.getItem('smart_safe_ui_scale') || 1);
  });
  
  const [companyName, setCompanyName] = useState<string>(() => {
    return safeLocalStorage.getItem('smart_safe_company_name') || 'اسم شركتك هنا';
  });

  const [ledgerPrintCols, setLedgerPrintCols] = useState(() => {
    try {
      const stored = safeLocalStorage.getItem('smart_safe_ledger_cols');
      return stored ? JSON.parse(stored) : { date: true, desc: true, category: true, in: true, out: true, bal: true };
    } catch {
      return { date: true, desc: true, category: true, in: true, out: true, bal: true };
    }
  });
  
  const [thermalMargins, setThermalMargins] = useState<{ right: number, left: number, top: number }>(() => {
    try {
      const stored = safeLocalStorage.getItem('smart_safe_thermal_margins');
      return stored ? { top: 0, ...JSON.parse(stored) } : { right: 24, left: 24, top: 0 };
    } catch {
      return { right: 24, left: 24, top: 0 };
    }
  });

  useEffect(() => {
    safeLocalStorage.setItem('smart_safe_ui_scale', uiScale.toString());
  }, [uiScale]);

  useEffect(() => {
    safeLocalStorage.setItem('smart_safe_company_name', companyName);
  }, [companyName]);

  useEffect(() => {
    safeLocalStorage.setItem('smart_safe_ledger_cols', JSON.stringify(ledgerPrintCols));
  }, [ledgerPrintCols]);

  useEffect(() => {
    safeLocalStorage.setItem('smart_safe_thermal_margins', JSON.stringify(thermalMargins));
  }, [thermalMargins]);

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
        const saved = safeLocalStorage.getItem('treasury_app_data');
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

  const [printView, setPrintView] = useState<'none' | 'comprehensive_a4' | 'daily' | 'daily_thermal' | 'pending' | 'pos' | 'pos_thermal' | 'history' | 'history_thermal'>('none');
  const [activePrintPosId, setActivePrintPosId] = useState<string | null>(null);
  const [printSnapshot, setPrintSnapshot] = useState<{state: AppState, summary: ReturnType<typeof getSummary>} | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [thermalPreviewData, setThermalPreviewData] = useState<{ type: 'daily' | 'pos' | 'history', id?: string, snap?: any } | null>(null);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintView('none');
      setIsExporting(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);


const handleCopyDailyReport = () => {
    // Calculate monthly data based on history and current state
    const allData = [...history.map((s: any) => ({ ...s.state, isCurrent: false })), { ...state, isCurrent: true }];
    const uniqueMetricsMap = new Map();
    
    allData.forEach((item: any) => {
        let netSales = 0;
        if (item.posData) {
            netSales = item.posData.reduce((acc: number, pos: any) => acc + (pos.sales - pos.returns), 0);
        }
        
        let d = item.date;
        const parts = d.split('/');
        let month = String(new Date().getMonth() + 1).padStart(2, '0');
        let year = String(new Date().getFullYear());
        
        if (parts.length === 3) {
            month = parts[1];
            year = parts[2];
        }
        
        if (!uniqueMetricsMap.has(d)) {
            uniqueMetricsMap.set(d, { netSales, month, year, isCurrent: item.isCurrent });
        } else {
            if (item.isCurrent) {
                uniqueMetricsMap.set(d, { netSales, month, year, isCurrent: item.isCurrent });
            }
        }
    });

    const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
    const currentYearStr = String(new Date().getFullYear());
    
    const dailyMetrics = Array.from(uniqueMetricsMap.values());
    const monthlyMetrics = dailyMetrics.filter(d => d.month === currentMonthStr && d.year === currentYearStr);
    
    const totalMonthlySales = monthlyMetrics.reduce((sum, d) => sum + d.netSales, 0);
    const daysRecorded = monthlyMetrics.length || 1;
    const monthlyAverage = totalMonthlySales / daysRecorded;

    const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    
    const text = `═══════════════════════════════════════
           📊 تقرير مبيعات اليوم
═══════════════════════════════════════

📅 التاريخ: ${state.date}

💰 إجمالي مبيعات اليوم
   ${formatNum(currentSummary.netSales)} ريال

📈 المتوسط الشهري (حتى اليوم)
   ${formatNum(monthlyAverage)} ريال

📊 إجمالي مبيعات الشهر (تراكمي)
   ${formatNum(totalMonthlySales)} ريال

═══════════════════════════════════════
   تم إنشاء التقرير في: ${timeFormatter.format(new Date())}
═══════════════════════════════════════`;

    navigator.clipboard.writeText(text);
    showToast('تم نسخ التقرير للحافظة', 'success');
};

  const handleExport = (format: 'a4' | 'thermal' = 'a4') => {
    setShowExportModal(false);
    
    if (format === 'thermal') {
      setThermalPreviewData({ type: 'daily' });
      return;
    }

    setIsExporting(true);
    if (exportMode === 'summary') {
      setPrintView('daily');
    } else if (exportMode === 'comprehensive') {
      setPrintView('comprehensive_a4');
    } else {
      setPrintView('none');
    }
    
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const handlePrintPos = (posId: string, format: 'a4' | 'thermal' = 'a4') => {
    setActivePrintPosId(posId);
    if (format === 'thermal') {
      setThermalPreviewData({ type: 'pos', id: posId });
      return;
    }
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

  const handlePrintHistory = (snap: DailySnapshot, format: 'a4' | 'thermal' = 'a4') => {
    setPrintSnapshot({ state: snap.state, summary: snap.summary });
    if (format === 'thermal') {
      setThermalPreviewData({ type: 'history', snap });
      return;
    }
    setPrintView('history');
    setIsExporting(true);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const saveStateToFirebase = async (newState: AppState, isAutoSave = false) => {
    if (!user || userProfile?.status !== 'active' || !currentBranchId) {
      safeLocalStorage.setItem('treasury_app_data', JSON.stringify(newState));
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
          
          expenseRefunds: keepPinned(state.expenseRefunds || []),
          companyPayments: keepPinned(state.companyPayments || []),
          expenses: keepPinned(state.expenses || []),
          customerTransfers: keepPinned(state.customerTransfers || []),
          cashDeposits: keepPinned(state.cashDeposits || []),
          customCashAmounts: keepPinned(state.customCashAmounts || []),
          
          pendingFundsOwedToUs: state.pendingFundsOwedToUs,
          pendingFundsOwedByUs: state.pendingFundsOwedByUs,

          historicalSales: [...(state.historicalSales || []), {
            id: generateId(),
            type: 'day',
            dateStr: state.date,
            netSales: currentSummary.netSales
          }],
          historicalMonths: state.historicalMonths || [],

          posData: state.posData.filter(p => p.isPinned || p.sales > 0 || p.returns > 0 || p.networks.length > 0 || p.physicalCash !== undefined).map(p => ({ 
            ...p, 
            sales: 0, 
            returns: 0, 
            networks: [],
            physicalCash: undefined
          })).filter(p => p.isPinned), // Keep only pinned items for the new day
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
          safeLocalStorage.setItem('treasury_history', JSON.stringify(newHistory));
          safeLocalStorage.setItem('treasury_app_data', JSON.stringify(nextState));
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

  const clearHistory = async () => {
    setConfirmDialog({
      message: 'هل أنت متأكد من مسح جميع السجلات بأرشيف الأيام السابقة والأموال المعلقة؟ لن يتأثر تقفيل اليوم الحالي المفتوح.',
      onConfirm: async () => {
        try {
          setState(prev => ({ ...prev, archivedPendingFunds: [] }));
          setHistory([]);
          safeLocalStorage.removeItem('treasury_history');
          showToast('تم مسح جميع السجلات بنجاح', 'success');
        } catch (error) {
          console.error(error);
          showToast('حدث خطأ أثناء مسح السجلات', 'error');
        }
      }
    });
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
      savedNames={state.savedNames?.[field as keyof AppState['savedNames']] || []}
      onSaveName={addSavedName}
    />
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8" dir="rtl">
        <div className="max-w-[1600px] mx-auto opacity-60">
          {/* Header Skeleton */}
          <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
            <div className="h-10 w-48 bg-slate-200 dark:bg-slate-800 rounded-[4px] animate-pulse"></div>
            <div className="flex gap-3">
              <div className="h-10 w-10 bg-slate-200 dark:bg-slate-800 rounded-full animate-pulse"></div>
              <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded-[4px] animate-pulse"></div>
            </div>
          </div>

          {/* Nav Skeleton */}
          <div className="flex gap-2 overflow-x-hidden mb-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
               <div key={i} className="h-12 w-28 bg-slate-200 dark:bg-slate-800 rounded-[4px] animate-pulse shrink-0"></div>
            ))}
          </div>

          {/* Layout Skeleton */}
          <div className="flex flex-col xl:flex-row gap-6">
            {/* Main Content Area */}
            <div className="w-full xl:w-2/3 flex flex-col gap-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="bg-white dark:bg-slate-900 h-28 rounded-[4px] border border-slate-200 dark:border-slate-800 shadow-sm animate-pulse">
                    <div className="p-4 flex flex-col gap-3">
                      <div className="h-4 w-1/2 bg-slate-100 dark:bg-slate-800 rounded-[4px]"></div>
                      <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-700 rounded-[4px] mt-2"></div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Big Section */}
              <div className="bg-white dark:bg-slate-900 rounded-[4px] border border-slate-200 dark:border-slate-800 shadow-sm min-h-[300px] animate-pulse p-6">
                 <div className="h-5 w-40 bg-slate-200 dark:bg-slate-800 rounded-[4px] mb-6"></div>
                 <div className="flex flex-col gap-4">
                   {[1, 2, 3].map(i => (
                     <div key={i} className="h-16 w-full bg-slate-100 dark:bg-slate-800/50 rounded-[4px]"></div>
                   ))}
                 </div>
              </div>
            </div>

            {/* Sidebar Skeleton */}
            <div className="w-full xl:w-1/3 flex flex-col gap-4">
               <div className="bg-white dark:bg-slate-900 rounded-[4px] border border-slate-200 dark:border-slate-800 shadow-sm min-h-[500px] animate-pulse p-6">
                 <div className="h-5 w-32 bg-slate-200 dark:bg-slate-800 rounded-[4px] mb-6"></div>
                 <div className="flex justify-center mb-8">
                   <div className="h-32 w-32 bg-slate-100 dark:bg-slate-800/50 rounded-full"></div>
                 </div>
                 <div className="flex flex-col gap-3">
                   {[1, 2, 3, 4, 5].map(i => (
                     <div key={i} className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/20 p-3 rounded-[4px]">
                       <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded-[4px]"></div>
                       <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded-[4px]"></div>
                     </div>
                   ))}
                 </div>
               </div>
            </div>
          </div>
        </div>
        
        {/* Centered spinner overlay just to be sure user knows it's loading */}
        <div className="fixed inset-0 flex flex-col items-center justify-center pointer-events-none z-50">
           <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-6 rounded-[4px] shadow-xl flex flex-col items-center gap-4">
             <div className="relative">
               <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 dark:border-slate-700"></div>
               <div className="absolute top-0 left-0 animate-spin rounded-full h-12 w-12 border-4 border-brand-500 border-t-transparent"></div>
               <Calculator size={20} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-500 dark:text-brand-500" />
             </div>
             <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">جاري تحميل البيانات...</p>
           </div>
        </div>
      </div>
    );
  }

  
  if (!user && !skipLogin) {
    return (
      <div className="fixed inset-0 bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 flex flex-col justify-center items-center p-4 selection:bg-slate-200 dark:selection:bg-slate-800/500 selection:text-black dark:text-white print:text-black" dir="rtl">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, #1A1A1A 0%, transparent 60%), linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, .1) 25%, rgba(255, 255, 255, .1) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .1) 75%, rgba(255, 255, 255, .1) 76%, transparent 77%, transparent)',
          backgroundSize: '100% 100%, 50px 50px, 50px 50px'
        }}></div>
        <div className="z-10 bg-white dark:bg-slate-900 print:bg-white/95 backdrop-blur-2xl rounded-[4px] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/80 ring-1 ring-slate-900/5 w-full max-w-sm overflow-hidden flex flex-col text-slate-800 dark:text-slate-200 relative">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg flex items-center gap-2">
              <LogIn className="text-slate-900 dark:text-white tracking-tight" size={24} />
              {isSignUp ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
            </h3>
            <button onClick={() => setSkipLogin(true)} className="text-slate-700 dark:text-slate-300 px-3 py-1.5 bg-slate-200 dark:bg-slate-800 rounded-[4px] text-sm font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">
              تخطي
            </button>
          </div>
          <div className="p-6 pb-8">
            {authError && (
              <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-[4px] text-[15px] font-bold border border-red-200 flex items-center gap-2">
                <AlertCircle size={18} className="shrink-0" />
                {authError}
              </div>
            )}
            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[15px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">البريد الإلكتروني</label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 print:bg-white rounded-[4px] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all font-mono shadow-sm"
                />
              </div>
              <div>
                <label className="block text-[15px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">كلمة المرور</label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 print:bg-white rounded-[4px] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all font-mono shadow-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-brand-500 text-white border-none hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-[4px] mt-2 hover:bg-slate-800 transition-all shadow-sm active:scale-95 flex justify-center items-center gap-2"
              >
                <LogIn size={20} /> {isSignUp ? 'إنشاء الحساب' : 'دخول'}
              </button>
            </form>

            <div className="mt-5 relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-[15px]">
                <span className="px-3 bg-white dark:bg-slate-900 print:bg-white text-slate-500 dark:text-slate-400 font-medium text-xs">أو</span>
              </div>
            </div>

            <button
              onClick={handleGoogleLogin}
              className="mt-5 w-full bg-white dark:bg-slate-900 print:bg-white border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold py-3 px-4 rounded-[4px] hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-sm"
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
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white tracking-tight font-bold transition-colors text-[15px]"
              >
                {isSignUp ? 'لدي حساب بالفعل، تسجيل الدخول' : 'جديد؟ قم بإنشاء حساب'}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-8 text-center text-white/50 text-xs font-medium z-10">
          تم التطوير بواسطة <span className="font-bold text-white/80">Eng. Khaled Rizk</span> &copy; {new Date().getFullYear()}
        </div>
      </div>
    );
  }

  if (user && userProfile && userProfile.status === 'pending') {
    return (
      <div className="min-h-screen bg-[#f4f4f6] dark:bg-slate-900 text-slate-800 dark:text-slate-100" dir="rtl">
        <div className="bg-white dark:bg-slate-900 print:bg-white/90 backdrop-blur-2xl p-8  rounded-[4px] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/80 ring-1 ring-slate-900/5 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">حسابك قيد المراجعة</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 font-medium">يرجى الانتظار حتى تقوم الإدارة بمراجعة حسابك وتفعيله للتمكن من الدخول للخزينة الفعالة.</p>
          <button onClick={handleLogout} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 underline font-bold mt-2">تسجيل الخروج</button>
        </div>
      </div>
    );
  }

  const activePos = state.posData.find(p => p.id === activeNetworkPosId);

  if (currentAppView === 'launcher') {
    return (
      <>
      <div className="fixed inset-0 bg-slate-900 text-white overflow-hidden flex flex-col" dir="rtl">
        {/* Abstract Background pattern */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, #1A1A1A 0%, transparent 60%), linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, .1) 25%, rgba(255, 255, 255, .1) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .1) 75%, rgba(255, 255, 255, .1) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(255, 255, 255, .1) 25%, rgba(255, 255, 255, .1) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .1) 75%, rgba(255, 255, 255, .1) 76%, transparent 77%, transparent)',
          backgroundSize: '100% 100%, 50px 50px, 50px 50px'
        }}></div>

        {/* Status Bar */}
        <div className="relative z-10 shrink-0 flex justify-between items-start px-6 py-4 drop-shadow-md border-b border-white/5 bg-[#354a5f] text-white">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 relative">
               <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
                 <path d="M 80 30 C 80 15, 65 10, 50 10 C 30 10, 20 25, 20 40 C 20 60, 45 60, 50 70 C 55 80, 45 85, 30 85 C 15 85, 10 75, 10 75" fill="none" stroke="url(#smLogoGrad)" strokeWidth="18" strokeLinecap="round" />
                 <path d="M 65 35 L 85 20 L 95 30 L 75 45 Z" fill="#fff" />
                 <circle cx="80" cy="28" r="2" fill="#000000" />
                 <defs>
                   <linearGradient id="smLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                     <stop offset="0%" stopColor="#0f172a" />
                     <stop offset="100%" stopColor="#3b82f6" />
                   </linearGradient>
                 </defs>
               </svg>
             </div>
             <div>
               <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2 leading-none">
                 <span className="text-white drop-shadow">ســـرب</span>
                 <span className="text-[10px] text-brand-200 bg-white dark:bg-slate-900 print:bg-white/10 border border-white/10 px-1.5 py-0.5 rounded font-bold tracking-widest font-mono">ERP</span>
               </h1>
             </div>
          </div>

          <div className="flex flex-col items-end gap-1 mt-1 text-white/90">
            <span className="text-sm font-bold tracking-wide drop-shadow-md font-mono">{new Date().toLocaleTimeString('ar-SA', { hour12: true, hour: '2-digit', minute: '2-digit' })}</span>
            <div className="text-[11px] font-medium drop-shadow-md opacity-80">
              {new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </div>

        <div className="relative z-10 flex-1 flex flex-col pb-6 justify-between">

          {/* Apps Grid (TOP) */}
          <div className="pt-8 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-x-4 gap-y-8 px-6 max-w-4xl mx-auto w-full">
            {/* Treasury App */}
            <button 
              onClick={() => setCurrentAppView('treasury')}
              className="flex flex-col items-center gap-2 group active:scale-95 transition-all"
            >
              <div className="w-[72px] h-[72px] bg-white dark:bg-slate-900 print:bg-white rounded-[4px] shadow-xl ring-1 ring-white/10 flex flex-col items-center justify-center overflow-hidden transition-all group-hover:shadow-2xl group-hover:-translate-y-1 group-hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
                {/* Simplified Logo icon for app */}
                <svg viewBox="0 0 100 100" className="w-10 h-10 drop-shadow-md mb-0.5">
                  <path d="M 80 30 C 80 15, 65 10, 50 10 C 30 10, 20 25, 20 40 C 20 60, 45 60, 50 70 C 55 80, 45 85, 30 85 C 15 85, 10 75, 10 75" fill="none" stroke="#0a6ed1" strokeWidth="18" strokeLinecap="round" />
                  <path d="M 65 35 L 85 20 L 95 30 L 75 45 Z" fill="#fff" />
                </svg>
              </div>
              <span className="text-xs font-bold drop-shadow-md tracking-wide text-white/90">الخزينة</span>
            </button>

            {/* Dummy Apps */}
            {[
              { name: 'المبيعات', icon: Receipt, color: '#1A1A1A', disabled: true },
              { name: 'المخازن', icon: BookOpen, color: '#1A1A1A', disabled: true },
              { name: 'الموظفين', icon: LogIn, color: '#1A1A1A', disabled: true },
              { name: 'التحليلات', icon: BarChart3, color: '#1A1A1A', disabled: true },
              { name: 'المشتريات', icon: Wallet, color: '#1A1A1A', disabled: true },
              { name: 'الإعدادات', icon: Settings, color: '#1A1A1A', disabled: false, action: () => setShowSettingsModal(true) }
            ].map((app, idx) => (
              <button 
                key={idx}
                onClick={app.action}
                className={`flex flex-col items-center gap-2 group transition-all ${app.disabled ? 'opacity-60 cursor-not-allowed hover:opacity-100' : 'opacity-100 active:scale-95'}`}
              >
                <div className={`w-[72px] h-[72px] rounded-[4px] shadow-xl ring-1 ring-white/10 flex items-center justify-center ${app.disabled ? 'bg-white dark:bg-slate-900 print:bg-white/80' : 'bg-white dark:bg-slate-900 print:bg-white hover:-translate-y-1 hover:shadow-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-all'}`}>
                  <app.icon size={28} className="text-slate-900 dark:text-white drop-shadow-md" />
                </div>
                <span className={`text-xs font-bold drop-shadow-md tracking-wide ${app.disabled ? 'text-white/80' : 'text-white/90'}`}>{app.name}</span>
              </button>
            ))}
          </div>

          <div className="text-center text-white/50 text-[11px] font-medium mt-auto w-full">
            تم التطوير بواسطة <span className="font-bold text-white/80 tracking-wide text-xs">Eng. Khaled Rizk</span>
          </div>
        </div>
      </div>
      
      <SettingsModalComponent
        show={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        companyName={companyName}
        setCompanyName={setCompanyName}
        theme={theme}
        setTheme={setTheme}
        uiScale={uiScale}
        setUiScale={setUiScale}
        thermalMargins={thermalMargins}
        setThermalMargins={setThermalMargins}
        clearHistory={clearHistory}
        branches={branches}
        adminUsers={adminUsers}
        handleUpdateBranch={handleUpdateBranch}
        handleDeleteBranch={handleDeleteBranch}
        handleUpdateUser={handleUpdateUser}
        setShowAddBranchModal={setShowAddBranchModal}
        user={user}
        userProfile={userProfile}
        savedNames={state?.savedNames || {}}
        addSavedName={addSavedName}
        removeSavedName={removeSavedName}
      />
      </>
    );
  }

  return (
    <div className={`min-h-screen pb-24 md:pb-0 bg-[#f4f4f6] text-slate-800 dark:bg-slate-900 dark:text-slate-200 font-sans selection:bg-brand-100 selection:text-brand-900 print:text-black ${printView !== "none" ? "print:bg-white dark:bg-slate-900" : ""} `} dir="rtl">
      <div style={{ zoom: uiScale }}>
      <div className={printView !== 'none' ? 'print:hidden' : ''}>
        <div className="sticky top-0 z-50 bg-[#354a5f] text-white print:hidden transition-all shadow-md px-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 sm:h-[4.5rem]">
            {/* Logo/Name on the right side (RTL start) */}
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setCurrentAppView('launcher')}
                className="w-10 h-10 flex items-center justify-center hover:bg-white/10 text-white rounded-[3px] transition-all"
                title="الرئيسية (سرب ERP)"
              >
                <ArrowRight size={20} />
              </button>
              
              <div className="flex items-center gap-2.5 px-3 py-1.5">
                <div className="w-9 h-9 md:w-11 md:h-11 bg-srb-main rounded-[4px] shadow-md flex items-center justify-center ring-1 ring-black/5 overflow-hidden">
                  <svg viewBox="0 0 100 100" className="w-6 h-6 md:w-7 md:h-7 mt-0.5 drop-shadow-sm">
                    <path d="M 80 30 C 80 15, 65 10, 50 10 C 30 10, 20 25, 20 40 C 20 60, 45 60, 50 70 C 55 80, 45 85, 30 85 C 15 85, 10 75, 10 75" fill="none" stroke="#0a6ed1" strokeWidth="18" strokeLinecap="round" />
                    <path d="M 65 35 L 85 20 L 95 30 L 75 45 Z" fill="#fff" />
                  </svg>
                </div>
                <div className="flex flex-col items-start translate-y-0.5">
                  <div className="flex items-center gap-1.5 leading-none">
                    <h1 className="font-normal text-white text-base md:text-xl tracking-tight leading-none">سرب</h1>
                    <span className="text-white font-normal text-xs md:text-[15px] tracking-[0.1em] font-poppins leading-none">ERP</span>
                  </div>
                  <span className="text-[9px] md:text-[10px] text-brand-100 font-normal">نظام الخزينة الذكية</span>
                </div>
              </div>
            </div>
            
            {/* Action Buttons on the left side (RTL end) */}
            <div className="flex items-center gap-2 md:gap-3 justify-end">
              
              {!user ? (
                <button onClick={() => setShowAuthModal(true)} className="flex items-center gap-2 btn-primary">
                  <LogIn size={18} /> <span className="text-[15px] sm:text-base hidden sm:inline">تسجيل الدخول</span>
                </button>
              ) : (
                <>
                  {userProfile?.role === 'admin' && (
                    <div className="flex items-center gap-2 max-w-[130px] sm:max-w-xs">
                      <select value={currentBranchId || ''} 
                        onChange={(e) => {
                          setCurrentBranchId(e.target.value || null);
                          if (e.target.value) {
                            loadBranchData(e.target.value);
                          } else {
                            setState(getInitialState());
                            setHistory([]);
                          }
                        }}
                        className="bg-white dark:bg-slate-900 print:bg-white/50 border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-[15px] rounded-[4px] focus:ring-4 focus:ring-brand-500/20/10 focus:border-brand-500 focus:ring-4 focus:ring-blue-100 focus:bg-white dark:bg-slate-900 print:bg-white block w-full px-4 py-2.5 outline-none font-bold hover:bg-white dark:bg-slate-900 print:bg-white transition-all cursor-pointer shadow-sm"
                      >
                        <option value="">-- اختر الفرع --</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="hidden md:flex items-center gap-2 text-[15px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 print:bg-white/60 backdrop-blur-sm px-4 py-2.5 rounded-[4px] border border-slate-200 dark:border-slate-700/60 font-medium shadow-sm">
                    <div className="w-2.5 h-2.5 btn-success rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    <span className="font-mono">{user.email?.split('@')[0]}</span>
                  </div>
                  <button onClick={() => setShowCalculator(true)} className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors active:scale-95 ${showCalculator ? 'bg-slate-200 dark:bg-slate-700/80 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800'}`} title="آلة حاسبة">
                    <Calculator size={20} strokeWidth={1.5} />
                  </button>
                  <button onClick={() => setShowSettingsModal(true)} className="flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 transition-colors active:scale-95" title="إعدادات">
                    <Settings size={20} strokeWidth={1.5} />
                  </button>
                  <button onClick={handleLogout} className="flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-600 w-10 h-10 rounded-full hover:bg-rose-50 transition-colors active:scale-95" title="تسجيل الخروج">
                    <LogOut size={20} strokeWidth={1.5} />
                  </button>
                  <div className="w-px h-8 bg-slate-200 dark:bg-slate-700/80 mx-1 hidden sm:block"></div>
                  <button onClick={handleSave} disabled={saving} className={`flex items-center gap-2 px-4 py-2 text-[14px] rounded-full transition-all font-medium disabled:opacity-50 active:scale-95 ${saving ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 dark:bg-slate-700'}`}>
                    {saving ? <Save size={16} className="animate-pulse" strokeWidth={2} /> : <CheckCircle2 size={16} strokeWidth={2} />}
                    <span className="hidden sm:inline">{saving ? 'جاري الحفظ...' : 'حفظ'}</span>
                  </button>
                </>
              )}
              <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 bg-white dark:bg-slate-900 print:bg-white text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-4 py-2 text-[14px] rounded-full hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-all font-medium active:scale-95">
                <Printer size={16} strokeWidth={2} /> <span className="hidden sm:inline">تصدير</span>
              </button>
              <button onClick={handleNewDay} className="flex items-center gap-2 bg-brand-500 text-white border-none hover:bg-blue-700 text-white px-4 py-2 text-[14px] rounded-full hover:bg-slate-800 transition-all font-medium active:scale-95 flex-nowrap shrink-0 max-w-fit">
                <FilePlus size={16} strokeWidth={2} /> <span className="hidden sm:inline">يوم جديد</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="export-container" className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 ${isExporting ? 'bg-white dark:bg-slate-900 print:bg-white' : ''}`}>
        {isExporting && (
          <div className="text-center mb-8 pb-4 border-b border-slate-200 dark:border-slate-700/80">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">الخزينة الذكية - تقرير التسوية</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">تاريخ: {state.date}</p>
            <p className="text-slate-500 dark:text-slate-400">نوع التقرير: {exportMode === 'detailed' ? 'مفصل' : 'ملخص'}</p>
          </div>
        )}

        {(!isExporting || exportMode === 'detailed') && (!userProfile || userProfile.role !== 'admin' || currentBranchId) && (
          <div className="pro-card p-5 mb-8 flex flex-wrap gap-8 items-center print:hidden">
            <div className="flex items-center gap-3">
              <label className="font-semibold text-slate-600 dark:text-slate-400">تاريخ اليوم:</label>
              <Input value={state.date} onChange={(e: any) => updateField('date', e.target.value)} className="w-44 text-center font-bold text-lg" />
            </div>
            <div className="w-px h-8 bg-slate-200 dark:bg-slate-700/80 hidden sm:block"></div>
            <div className="flex items-center gap-3">
              <label className="font-semibold text-slate-600 dark:text-slate-400">رصيد أول المدة:</label>
              <Input type="number" value={state.previousBalance !== undefined ? Math.round(state.previousBalance * 100) / 100 : ''} onChange={(e: any) => updateField('previousBalance', Number(e.target.value))} className="w-44 text-left font-bold text-slate-800 dark:text-slate-200 font-bold bg-slate-100 dark:bg-slate-800/80/50 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800/80 border-slate-300 dark:border-slate-600/80 text-lg focus:ring-brand-500/20/20" dir="ltr" />
            </div>
          </div>
        )}

        <div className={`flex flex-col lg:flex-row gap-8 ${isExporting && exportMode === 'summary' ? 'justify-center' : ''}`}>
          {(!isExporting || exportMode === 'detailed') && (
            <div className="flex-1 min-w-0 print:w-full">
              {(!isExporting && (!userProfile || userProfile.role !== 'admin' || currentBranchId)) && (
                <div className="fixed bottom-0 inset-x-0 bg-white dark:bg-slate-900 print:bg-white/95 backdrop-blur-2xl border-t border-slate-200 dark:border-slate-700 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-[90] flex overflow-x-auto gap-1.5 print:hidden md:relative md:bg-transparent md:backdrop-blur-none md:border-t-0 md:p-0 md:mb-8 md:pb-2 md:gap-2 overscroll-x-contain shadow-md md:shadow-none items-center scrollbar-hide">
                  {[
                    { id: 'sales', label: 'المبيعات', icon: Receipt },
                    { id: 'payments', label: 'المدفوعات', icon: ArrowUpRight },
                    { id: 'pending', label: 'معلقة', icon: AlertCircle },
                    { id: 'cash', label: 'جرد', icon: Wallet },
                    { id: 'history', label: 'السجل', icon: CalendarDays },
                    { id: 'ledger', label: 'الأستاذ', icon: BookOpen },
                    { id: 'archive', label: 'أرشيف', icon: History },
                    { id: 'analytics', label: 'تحليلات', icon: BarChart3 }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`relative flex flex-col md:flex-row items-center justify-center md:gap-2 px-3 py-2 md:px-5 md:py-2.5 rounded-[3px] font-normal transition-colors whitespace-nowrap min-w-[72px] sm:min-w-[80px] md:min-w-0 flex-shrink-0 ${
                        activeTab === tab.id ? 'text-brand-500 bg-brand-50 shadow-sm border-b-[3px] border-brand-500 rounded-b-none' : 'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800/50'
                      }`}
                    >
                      <span className="relative z-10 flex flex-col md:flex-row items-center gap-1.5 md:gap-2">
                        <tab.icon size={18} strokeWidth={activeTab === tab.id ? 2.5 : 2} /> 
                        <span className="text-[11px] md:text-[14px] mt-0.5 md:mt-0">{tab.label}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="print:block">
                {userProfile?.role === 'admin' && !currentBranchId && activeTab !== 'admin' && activeTab !== 'settings' ? (
                  <div className="bg-white dark:bg-slate-900 print:bg-white/90 backdrop-blur-2xl rounded-[4px] shadow-xl border border-slate-200 dark:border-slate-700/60 p-8 sm:p-12 mb-8 text-center mt-4">
                    <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white tracking-tight rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-200 dark:border-slate-700/50">
                       <Database size={48} />
                    </div>
                    <h2 className="text-3xl font-black text-slate-800 dark:text-slate-200 mb-4 tracking-tight">اختر الفرع للبدء</h2>
                    <p className="text-slate-600 dark:text-slate-400 font-medium text-base mb-10 max-w-xl mx-auto leading-relaxed">بصفتك مديراً للنظام، يجب عليك اختيار الفرع الذي تود استعراض أو إدخال بيانات الخزينة والمبيعات الخاصة به.</p>
                    
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
                      <select 
                        value=""
                        onChange={(e) => {
                          setCurrentBranchId(e.target.value || null);
                          if (e.target.value) {
                            loadBranchData(e.target.value);
                          }
                        }}
                        className="bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-lg rounded-[4px] focus:ring-4 focus:ring-brand-500/20/20 focus:border-brand-500 block w-full sm:w-[400px] px-6 py-4 outline-none font-bold shadow-sm transition-all hover:bg-white dark:bg-slate-900 print:bg-white hover:border-slate-400 cursor-pointer"
                      >
                        <option value="" disabled>-- الرجاء الضغط لاختيار الفرع --</option>
                        {branches.filter(b => !b.deleted).map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    {branches.length === 0 && (
                       <button onClick={() => setShowSettingsModal(true)} className="text-rose-500 font-bold mb-4 bg-rose-50 p-4 rounded-[4px] inline-block hover:bg-rose-100 transition-all">لا توجد فروع مضافة في النظام حالياً. اضغط هنا لفتح الإعدادات وإضافة فروع ⚙️</button>
                    )}
                    
                    <div className="mt-10 pt-8 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">أو يمكنك إدارة النظام والنسخ الاحتياطي عبر قائمة الإعدادات العلوية</p>
                    </div>
                  </div>
                ) : (
                <>
                {/* Sales Tab */}
                { (activeTab === 'sales' || (isExporting && exportMode === 'detailed')) && (<div className="print:block mb-6">
                <div className="bg-white dark:bg-slate-900 print:bg-white rounded-[4px] shadow-sm border border-slate-200 dark:border-slate-700/60 overflow-hidden mb-6 flex flex-col">
                  <div className="bg-transparent text-slate-800 dark:text-slate-200 px-5 flex items-center gap-2 font-semibold text-[15px] pt-4 pb-2">
                    <Receipt size={20} /> مبيعات نقاط البيع
                  </div>
                  <datalist id="list-posData">
                    {(state.savedNames?.posData || []).map(name => <option key={name} value={name} />)}
                  </datalist>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-[15px] text-right">
                      <thead>
                        <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                          <th className="pb-3 font-medium w-[22%]">نقطة البيع</th>
                          <th className="pb-3 font-medium w-[13%]">إجمالي المبيعات</th>
                          <th className="pb-3 font-medium w-[13%]">المرتجعات</th>
                          <th className="pb-3 font-medium w-[13%]">صافي المبيعات</th>
                          <th className="pb-3 font-medium w-[13%]">الشبكات (تخصم)</th>
                          <th className="pb-3 font-medium w-[13%]">الكاش الفعلي</th>
                          <th className="pb-3 font-medium w-[13%] print:hidden text-center">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(state.posData || []).map((pos, index) => {
                          const net = pos.sales - pos.returns;
                          const posNetworksTotal = sumNetworks(pos.networks);
                          return (
                            <tr key={pos.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 relative group">
                              <td className="py-4 pr-2">
                                <Input 
                                  value={pos.name} 
                                  list="list-posData"
                                  onChange={(e: any) => {
                                    const newData = [...state.posData];
                                    newData[index].name = e.target.value;
                                    updateField('posData', newData);
                                  }} 
                                  onBlur={(e: any) => addSavedName('posData', e.target.value)}
                                  className="bg-transparent border-transparent shadow-none hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 focus:bg-white dark:bg-slate-900 print:bg-white focus:border-slate-300 dark:border-slate-600 transition-colors rounded-[4px]"
                                />
                              </td>
                              <td className="py-4 px-1"><Input type="number" value={pos.sales !== undefined ? round2(pos.sales) : ''} onChange={(e: any) => {
                                  const newData = [...state.posData];
                                  newData[index].sales = Number(e.target.value);
                                  updateField('posData', newData);
                                }} dir="ltr" className="text-left bg-transparent border-transparent shadow-none hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 focus:bg-white dark:bg-slate-900 print:bg-white focus:border-slate-300 dark:border-slate-600 transition-colors rounded-[4px]" /></td>
                              <td className="py-4 px-1"><Input type="number" value={pos.returns !== undefined ? round2(pos.returns) : ''} onChange={(e: any) => {
                                  const newData = [...state.posData];
                                  newData[index].returns = Number(e.target.value);
                                  updateField('posData', newData);
                                }} dir="ltr" className="text-left text-rose-600 bg-transparent border-transparent shadow-none hover:bg-rose-50 focus:bg-white dark:bg-slate-900 print:bg-white focus:border-rose-200 transition-colors rounded-[4px]" /></td>
                              <td className="py-4 px-2 text-left font-bold text-[#2b7d2b] text-brand-success" dir="ltr">{formatNum(net)}</td>
                              <td className="py-4 px-1">
                                <button 
                                  onClick={() => setActiveNetworkPosId(pos.id)}
                                  className="w-full bg-slate-50 dark:bg-slate-800/50/70 border border-slate-200 dark:border-slate-700/60 rounded-[4px] px-3 py-2 text-left hover:bg-amber-50 hover:border-amber-300 transition-colors text-amber-700 font-medium flex justify-between items-center"
                                  dir="ltr"
                                >
                                  <span>{formatNum(posNetworksTotal)}</span>
                                  <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-[4px]">
                                    {pos.networks.length} مبالغ
                                  </span>
                                </button>
                              </td>
                              <td className="py-4 px-1">
                                <Input type="number" value={pos.physicalCash !== undefined ? round2(pos.physicalCash) : ''} placeholder="" onChange={(e: any) => {
                                  const newData = [...state.posData];
                                  newData[index].physicalCash = e.target.value === '' ? undefined : Number(e.target.value);
                                  updateField('posData', newData);
                                }} dir="ltr" className="text-left font-bold text-slate-800 dark:text-slate-200 font-bold pointer-events-auto bg-transparent border-transparent shadow-none hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 focus:bg-white dark:bg-slate-900 print:bg-white focus:border-slate-300 dark:border-slate-600 transition-colors rounded-[4px] font-mono text-lg tracking-tight" />
                              </td>
                              <td className="py-4 pl-2 flex justify-center items-center gap-1.5 print:hidden h-full mt-2">
                                <button 
                                  onClick={() => {
                                    const newData = [...state.posData];
                                    newData[index].isPinned = !newData[index].isPinned;
                                    updateField('posData', newData);
                                  }} 
                                  title="تثبيت النقطة لليوم التالي"
                                  className={`p-2 rounded-[4px] transition-all ${pos.isPinned ? 'text-slate-900 dark:text-white tracking-tight bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-600 shadow-sm' : 'text-white/70 hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800'}`}
                                >
                                  <Pin size={18} className={pos.isPinned ? "fill-current" : ""} />
                                </button>
                                <button 
                                  onClick={() => updateField('posData', state.posData.filter(p => p.id !== pos.id))} 
                                  className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-[4px] transition-all ml-1" title="إزالة النقطة"
                                >
                                  <Trash2 size={18} />
                                </button>
                                  <div className="flex bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800/80 hover:border-slate-300 dark:border-slate-600 transition-all rounded-[4px] overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                                    <button onClick={() => handlePrintPos(pos.id, 'a4')} className="hover:bg-slate-200 dark:hover:bg-slate-700 dark:bg-slate-700 hover:text-slate-800 dark:text-slate-200 font-bold p-1.5 px-2 text-xs font-bold transition-colors border-l border-slate-200 dark:border-slate-700" title="طباعة A4">A4</button>
                                    <button onClick={() => handlePrintPos(pos.id, 'thermal')} className="hover:bg-slate-200 dark:hover:bg-slate-700 dark:bg-slate-700 hover:text-slate-800 dark:text-slate-200 font-bold p-1.5 px-2 text-[11px] font-bold transition-colors flex items-center" title="طباعة إيصال حراري">إيصال</button>
                                  </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 font-bold text-slate-800 dark:text-slate-200">
                          <td className="py-3 px-2">الإجمالي</td>
                          <td className="py-3 px-2 text-left" dir="ltr">{formatNum(currentSummary.totalSales)}</td>
                          <td className="py-3 px-2 text-left text-rose-600" dir="ltr">{formatNum(currentSummary.totalReturns)}</td>
                          <td className="py-3 px-2 text-left text-[#2b7d2b] text-brand-success" dir="ltr">{formatNum(currentSummary.netSales)}</td>
                          <td className="py-3 px-2 text-left text-amber-600" dir="ltr">{formatNum(currentSummary.totalNetworks)}</td>
                          <td className="py-3 px-2 text-left text-slate-900 dark:text-white tracking-tight" dir="ltr">{formatNum(state.posData.reduce((acc, p) => acc + (p.physicalCash || 0), 0))}</td>
                          <td className="print:hidden"></td>
                        </tr>
                      </tfoot>
                    </table>
                    <button onClick={() => updateField('posData', [...state.posData, { id: generateId(), name: '', sales: 0, returns: 0, networks: [] }])} className="mt-4 flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800/80 text-[14px] font-medium px-4 py-2 rounded-[4px] transition-all active:scale-95">
                      <Plus size={16} /> إضافة نقطة بيع جديدة
                    </button>
                  </div>
                </div>
                {renderTable('مردود مصروف (يضاف للخزينة)', 'expenseRefunds', Undo2, '')}
              </div>
              )}

              {/* Payments Tab */}
              { (activeTab === 'payments' || (isExporting && exportMode === 'detailed')) && (<div className="print:block mb-6">
                {renderTable('تحويلات العملاء (شبكة/بنكي تخصم من الخزينة)', 'customerTransfers', CreditCard, '')}
                {renderTable('سداد شركات وموردين', 'companyPayments', ArrowUpRight, '')}
                {/* Expenses table with showInSummary toggle */}
                {renderTable('مصروفات متنوعة (رواتب، نثريات...)', 'expenses', ArrowUpRight, '', false, true)}
                {renderTable('إيداعات بنكية', 'cashDeposits', Wallet, '')}
              </div>
              )}

              {/* Pending Funds Tab */}
              { (activeTab === 'pending' || (isExporting && exportMode === 'detailed')) && (<div className="print:block mb-6">
                {!isExporting && (
                  <div className="flex flex-col sm:flex-row justify-between mb-6 gap-4">
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-[4px] text-[15px] flex gap-3 items-start flex-1">
                      <AlertCircle className="shrink-0 mt-0.5" size={18} />
                      <p>
                        <strong>الأموال المعلقة:</strong> تُرحل بالكامل لليوم التالي حتى يتم تسويتها. <br/>
                        - لإضافة أكثر من مبلغ لنفس الشخص/الشركة، اضغط "إضافة بند" واكتب نفس الاسم.<br/>
                        - عند السداد، اضغط على <strong>علامة الصح الخضراء</strong> لتسوية المبلغ ونقله إلى <strong>الأرشيف</strong>.
                      </p>
                    </div>
                    <button onClick={handlePrintPending} className="flex h-fit items-center gap-2 bg-amber-600 text-white px-5 py-3 rounded-[4px] hover:bg-amber-700 transition-colors font-bold shadow-sm whitespace-nowrap">
                      <Download size={20} /> تصدير السجل كـ PDF
                    </button>
                  </div>
                )}
                {renderTable('أموال معلقة لنا (تُحسب ككاش بالخزينة)', 'pendingFundsOwedToUs', ArrowDownRight, '', true)}
                {renderTable('أموال معلقة علينا (تُخصم من الخزينة)', 'pendingFundsOwedByUs', ArrowUpRight, '', true)}
              </div>
              )}

              {/* Cash Count Tab */}
              { (activeTab === 'cash' || (isExporting && exportMode === 'detailed')) && (<div className="print:block mb-6">
                <div className="bg-white dark:bg-slate-900 print:bg-white rounded-[4px] shadow-sm border border-slate-200 dark:border-slate-700/60 overflow-hidden mb-6 flex flex-col">
                  <div className="bg-transparent text-slate-800 dark:text-slate-200 px-5 pt-4 pb-2 flex items-center justify-between font-semibold text-[15px]">
                    <div className="flex items-center gap-2"><Wallet size={20} /> جرد الخزينة (الفئات النقدية)</div>
                    <div className="bg-white dark:bg-slate-900 print:bg-white/60 px-3 py-1 rounded-[4px]" dir="ltr">{formatNum(currentSummary.physicalDenominations)}</div>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                    {['500', '200', '100', '50', '20', '10', '5', '1'].map(denom => (
                      <div key={denom} className="flex items-center gap-4 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 rounded-[4px] transition-colors">
                        <div className="w-16 font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 text-center py-2 rounded-[4px] border border-slate-200 dark:border-slate-700">{denom}</div>
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
                {renderTable('مبالغ نقدية مجمعة (رزم أو مبالغ معدودة مسبقاً)', 'customCashAmounts', Layers, '')}
              </div>
              )}

              {/* History Tab */}
              { (activeTab === 'history' && !isExporting) && (<div className="print:hidden">
                <div className="bg-white dark:bg-slate-900 print:bg-white rounded-[4px] shadow-sm border border-slate-200 dark:border-slate-700/60 overflow-hidden mb-6 flex flex-col">
                  <div className="bg-transparent text-slate-800 dark:text-slate-200 p-4 flex items-center gap-2 font-bold border-b border-slate-100 dark:border-slate-800">
                    <CalendarDays size={20} /> سجل الأيام السابقة
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-[15px] text-right">
                      <thead>
                        <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
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
                          <tr key={snap.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
                            <td className="py-3 font-bold">{snap.state.date}</td>
                            <td className="py-3 text-[#2b7d2b] text-brand-success" dir="ltr">{formatNum(snap.summary.totalCashIn)}</td>
                            <td className="py-3 text-rose-600" dir="ltr">{formatNum(snap.summary.totalCashOut)}</td>
                            <td className="py-3 font-bold" dir="ltr">{formatNum(snap.summary.actualCash)}</td>
                            <td className="py-3" dir="ltr">
                              <span className={`px-2 py-1 rounded-md text-xs font-bold ${snap.summary.difference === 0 ? 'bg-emerald-100 text-emerald-700' : snap.summary.difference > 0 ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold' : 'bg-rose-100 text-rose-700'}`}>
                                {formatNum(snap.summary.difference)}
                              </span>
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <button onClick={() => setViewSnapshot(snap)} className="text-slate-900 dark:text-white tracking-tight hover:text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 px-3 py-1.5 rounded-[4px] transition-colors text-xs font-bold flex items-center gap-1">
                                  <Eye size={14} /> التفاصيل
                                </button>
                                <button onClick={() => handlePrintHistory(snap)} className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-[4px] transition-colors text-xs font-bold flex items-center gap-1">
                                  <Printer size={14} /> طباعة
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {history.length === 0 && (
                          <tr>
                            <td colSpan={6}>
                              <div className="flex flex-col items-center justify-center py-12 text-slate-400 bg-slate-50 dark:bg-slate-800/50/50 rounded-[4px] my-4 border border-dashed border-slate-200 dark:border-slate-700">
                                <CalendarDays size={48} className="opacity-20 mb-3" />
                                <p className="font-bold text-lg text-slate-500 dark:text-slate-400">سجل الأيام السابقة فارغ</p>
                                <p className="text-[15px] text-slate-400 mt-1">اضغط على "يوم جديد" للبدء بحفظ التقفيلات اليومية</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
)}

              {/* Ledger Tab */}
              { (activeTab === 'ledger' && !isExporting) && (<div className="print:hidden">
                
                {/* Filters */}
                <div className="bg-white dark:bg-slate-900 print:bg-white p-4 rounded-[1rem] shadow-sm border border-slate-200 dark:border-slate-700/60 mb-6">
                  <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[15px] font-bold text-slate-700 dark:text-slate-300 mb-2">من تاريخ</label>
                      <Input type="date" value={ledgerFilter.startDate} onChange={(e: any) => setLedgerFilter(p => ({...p, startDate: e.target.value}))} dir="ltr" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[15px] font-bold text-slate-700 dark:text-slate-300 mb-2">إلى تاريخ</label>
                      <Input type="date" value={ledgerFilter.endDate} onChange={(e: any) => setLedgerFilter(p => ({...p, endDate: e.target.value}))} dir="ltr" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[15px] font-bold text-slate-700 dark:text-slate-300 mb-2">القسم / التصنيف</label>
                      <select 
                        value={ledgerFilter.category} 
                        onChange={e => setLedgerFilter(p => ({...p, category: e.target.value}))}
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-[4px] px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/20"
                      >
                        <option value="all">جميع الأقسام</option>
                        {Array.from(new Set(generateLedgerEntries().map(e => e.category))).map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[15px] font-bold text-slate-700 dark:text-slate-300 mb-2">بحث بالبند / الاسم</label>
                      <Input type="text" value={ledgerFilter.search} onChange={(e: any) => setLedgerFilter(p => ({...p, search: e.target.value}))} placeholder="اكتب للبحث..." />
                    </div>
                    <button onClick={() => setLedgerFilter({startDate: '', endDate: '', category: 'all', search: ''})} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-[4px] hover:bg-slate-200 dark:hover:bg-slate-700 dark:bg-slate-700 font-bold transition-colors shrink-0">
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
                                .summary-grid { display: none !important; }
                              }
                            </style>
                          </head>
                          <body>
                            <div class="report-header" style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #cbd5e1; margin-bottom: 20px;">
                                <div style="flex: 1; text-align: right;">
                                  <h2 style="font-size: 20px; font-weight: bold; color: #000; margin: 0;">${companyName}</h2>
                                </div>
                                <div style="flex: 2; text-align: center;">
                                  <h2 style="font-size: 20px; font-weight: 800; margin: 0; display: inline-block; padding: 4px 16px; border: 2px solid #1e293b; border-radius: 4px; box-shadow: 2px 2px 0 0 #1e293b; background: white;">تقرير دفتر الأستاذ</h2>
                                </div>
                                <div style="flex: 1; text-align: left; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                                  ${(ledgerFilter.startDate || ledgerFilter.endDate) ? `<div style="font-size: 13px; font-weight: bold; background: #f8fafc; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 4px;">الفترة: <span dir="ltr">${ledgerFilter.startDate || '-'} / ${ledgerFilter.endDate || '-'}</span></div>` : ''}
                                  ${ledgerFilter.category !== 'all' ? `<div style="font-size: 13px; font-weight: bold; background: #f8fafc; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 4px;">القسم: ${ledgerFilter.category}</div>` : ''}
                                  <div style="font-size: 13px; font-weight: bold; background: #f8fafc; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 4px;">الطباعة: <span dir="ltr">${new Date().toLocaleString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span></div>
                                </div>
                              </div>
                            
                            <div class="summary-grid no-print">
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
                                  ${ledgerPrintCols.date ? `<th>التاريخ</th>` : ''}
                                  ${ledgerPrintCols.desc ? `<th style="width: 35%">البيان</th>` : ''}
                                  ${ledgerPrintCols.category ? `<th>التصنيف</th>` : ''}
                                  ${ledgerPrintCols.in ? `<th>مدين (وارد)</th>` : ''}
                                  ${ledgerPrintCols.out ? `<th>دائن (منصرف)</th>` : ''}
                                  ${ledgerPrintCols.bal ? `<th>الرصيد التراكمي</th>` : ''}
                                </tr>
                              </thead>
                              <tbody>
                                ${filteredLedger.map((e: any) => `
                                  <tr>
                                    ${ledgerPrintCols.date ? `<td>${e.date}</td>` : ''}
                                    ${ledgerPrintCols.desc ? `<td><strong>${e.description}</strong></td>` : ''}
                                    ${ledgerPrintCols.category ? `<td style="color: #64748b; font-size: 12px;">${e.category}</td>` : ''}
                                    ${ledgerPrintCols.in ? `<td class="text-left val-in" dir="ltr">${e.type === 'in' ? formatNum(e.amount) : '-'}</td>` : ''}
                                    ${ledgerPrintCols.out ? `<td class="text-left val-out" dir="ltr">${e.type === 'out' ? formatNum(e.amount) : '-'}</td>` : ''}
                                    ${ledgerPrintCols.bal ? `<td class="text-left val-net font-bold" dir="ltr" style="background:#f8fafc;">${formatNum(e.balance)}</td>` : ''}
                                  </tr>
                                `).join('')}
                                ${filteredLedger.length === 0 ? `<tr><td colspan="6" style="text-align:center; padding: 30px; color: #94a3b8;">لا توجد حركات مسجلة تطابق البحث</td></tr>` : ''}
                              </tbody>
                              ${filteredLedger.length > 0 ? `
                              <tfoot style="background: #f1f5f9; font-weight: bold;">
                                <tr>
                                  <td colspan="${(ledgerPrintCols.date?1:0)+(ledgerPrintCols.desc?1:0)+(ledgerPrintCols.category?1:0)}" style="text-align: center;">الإجمالي النهائي</td>
                                  ${ledgerPrintCols.in ? `<td class="text-left val-in" dir="ltr">${formatNum(filteredIn)}</td>` : ''}
                                  ${ledgerPrintCols.out ? `<td class="text-left val-out" dir="ltr">${formatNum(filteredOut)}</td>` : ''}
                                  ${ledgerPrintCols.bal ? `<td class="text-left val-net" dir="ltr">${formatNum(filteredIn - filteredOut)}</td>` : ''}
                                </tr>
                              </tfoot>
                              ` : ''}
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
                        <div className="bg-white dark:bg-slate-900 print:bg-white border border-slate-200 dark:border-slate-700/80 rounded-[1rem] p-4 flex items-center justify-between shadow-sm">
                          <div>
                            <p className="text-slate-500 dark:text-slate-400 text-[13px] font-medium mb-1">إجمالي الوارد (مدين)</p>
                            <p className="text-[20px] font-bold text-slate-800 dark:text-slate-200" dir="ltr">{formatNum(filteredIn)}</p>
                          </div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 print:bg-white border border-slate-200 dark:border-slate-700/80 rounded-[1rem] p-4 flex items-center justify-between shadow-sm">
                          <div>
                            <p className="text-slate-500 dark:text-slate-400 text-[13px] font-medium mb-1">إجمالي المنصرف (دائن)</p>
                            <p className="text-[20px] font-bold text-slate-800 dark:text-slate-200" dir="ltr">{formatNum(filteredOut)}</p>
                          </div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 print:bg-white border border-slate-200 dark:border-slate-700/80 rounded-[1rem] p-4 flex items-center justify-between shadow-sm">
                          <div>
                            <p className="text-slate-500 dark:text-slate-400 text-[13px] font-medium mb-1">إجمالي المعلق</p>
                            <p className="text-[20px] font-bold text-slate-800 dark:text-slate-200" dir="ltr">{formatNum(filteredNeutral)}</p>
                          </div>
                        </div>
                        <div className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-[4px] p-4 flex items-center justify-between shadow-sm">
                          <div>
                            <p className="text-slate-500 dark:text-slate-400 text-[13px] font-medium mb-1">صافي الرصيد</p>
                            <p className="text-[20px] font-bold text-slate-800 dark:text-slate-200" dir="ltr">{formatNum(filteredIn - filteredOut)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-slate-900 print:bg-white rounded-[4px] sm:rounded-[4px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200 dark:border-slate-700/60 overflow-hidden mb-6">
                        <div className="bg-slate-800 text-white p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-700">
                          <div className="flex items-center gap-2 font-bold">
                            <BookOpen size={20} className="text-slate-300" /> كشف حساب (النتائج: {filteredLedger.length})
                          </div>
                          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 w-full sm:w-auto">
                            <div className="flex flex-wrap items-center gap-2 bg-slate-700/50 p-2 rounded-[4px] border border-slate-600/50 text-xs">
                              <span className="text-slate-400 ml-1">أعمدة الطباعة:</span>
                              <label className="flex items-center gap-1 cursor-pointer hover:text-white"><input type="checkbox" checked={ledgerPrintCols.date} onChange={e => setLedgerPrintCols({...ledgerPrintCols, date: e.target.checked})} className="accent-slate-900" /> التاريخ</label>
                              <label className="flex items-center gap-1 cursor-pointer hover:text-white"><input type="checkbox" checked={ledgerPrintCols.desc} onChange={e => setLedgerPrintCols({...ledgerPrintCols, desc: e.target.checked})} className="accent-slate-900" /> البيان</label>
                              <label className="flex items-center gap-1 cursor-pointer hover:text-white"><input type="checkbox" checked={ledgerPrintCols.category} onChange={e => setLedgerPrintCols({...ledgerPrintCols, category: e.target.checked})} className="accent-slate-900" /> التصنيف</label>
                              <label className="flex items-center gap-1 cursor-pointer hover:text-white"><input type="checkbox" checked={ledgerPrintCols.in} onChange={e => setLedgerPrintCols({...ledgerPrintCols, in: e.target.checked})} className="accent-emerald-500" /> وارد</label>
                              <label className="flex items-center gap-1 cursor-pointer hover:text-white"><input type="checkbox" checked={ledgerPrintCols.out} onChange={e => setLedgerPrintCols({...ledgerPrintCols, out: e.target.checked})} className="accent-rose-500" /> منصرف</label>
                              <label className="flex items-center gap-1 cursor-pointer hover:text-white"><input type="checkbox" checked={ledgerPrintCols.bal} onChange={e => setLedgerPrintCols({...ledgerPrintCols, bal: e.target.checked})} className="accent-slate-900" /> الرصيد</label>
                            </div>
                            <button onClick={handlePrintFilteredLedger} className="flex items-center justify-center gap-2 bg-brand-500 text-white border-none hover:bg-blue-700 text-white px-4 py-2 rounded-[4px] text-[15px] font-bold border border-slate-900 hover:bg-slate-900 transition-colors shrink-0 shadow-sm w-full sm:w-auto">
                              <Printer size={16} /> طباعة التقرير
                            </button>
                          </div>
                        </div>
                        <div className="p-0 overflow-x-auto">
                          <table className="w-full text-[15px] text-right border-collapse">
                            <thead>
                              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                <th className="p-3 font-bold border-l border-slate-200 dark:border-slate-700">التاريخ</th>
                                <th className="p-3 font-bold border-l border-slate-200 dark:border-slate-700 w-1/3">البيان</th>
                                <th className="p-3 font-bold border-l border-slate-200 dark:border-slate-700">التصنيف</th>
                                <th className="p-3 font-bold border-l border-slate-200 dark:border-slate-700 text-emerald-700">مدين (وارد)</th>
                                <th className="p-3 font-bold border-l border-slate-200 dark:border-slate-700 text-rose-700">دائن (منصرف)</th>
                                <th className="p-3 font-bold text-slate-800 dark:text-slate-200 font-bold">الرصيد</th>
                              </tr>
                            </thead>
                            <tbody>
                              
                              {filteredLedger.map((entry: any, index: number) => (
                                <tr
key={entry.id + index} 
                                  className="border-b border-slate-200 dark:border-slate-700 hover:bg-amber-50/50 transition-colors"
                                >
                                  <td className="p-3 font-medium text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700">{entry.date}</td>
                                  <td className="p-3 font-bold text-slate-800 dark:text-slate-200 border-l border-slate-200 dark:border-slate-700">{entry.description}</td>
                                  <td className="p-3 text-slate-500 dark:text-slate-400 text-xs border-l border-slate-200 dark:border-slate-700">
                                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">{entry.category}</span>
                                  </td>
                                  <td className="p-3 border-l border-slate-200 dark:border-slate-700 font-mono text-emerald-700 font-bold bg-emerald-50/30" dir="ltr">
                                    {entry.type === 'in' ? formatNum(entry.amount) : '-'}
                                  </td>
                                  <td className="p-3 border-l border-slate-200 dark:border-slate-700 font-mono text-rose-700 font-bold bg-rose-50/30" dir="ltr">
                                    {entry.type === 'out' ? formatNum(entry.amount) : '-'}
                                  </td>
                                  <td className="p-3 font-mono text-slate-800 dark:text-slate-200 font-bold font-black bg-slate-100 dark:bg-slate-800/80/30" dir="ltr">
                                    {formatNum(entry.balance)}
                                  </td>
                                </tr>
                              ))}
                              
                              {filteredLedger.length === 0 && (
                                <tr>
                                  <td colSpan={6}>
                                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                                      <BookOpen size={48} className="opacity-20 mb-3" />
                                      <p className="font-bold text-lg text-slate-500 dark:text-slate-400">لا توجد حركات مسجلة تطابق البحث</p>
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
              )}

              {/* Archive Tab */}
              { (activeTab === 'archive' && !isExporting) && (<div className="print:block">
                <div className="bg-white dark:bg-slate-900 print:bg-white rounded-[4px] shadow-sm border border-slate-200 dark:border-slate-700/60 overflow-hidden mb-6 flex flex-col">
                  <div className="bg-transparent text-slate-800 dark:text-slate-200 p-4 flex items-center gap-2 font-bold border-b border-slate-100 dark:border-slate-800">
                    <History size={20} /> أرشيف الأموال المعلقة (المسددة)
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-[15px] text-right">
                      <thead>
                        <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                          <th className="pb-3 font-medium">تاريخ التسوية</th>
                          <th className="pb-3 font-medium">البيان</th>
                          <th className="pb-3 font-medium">النوع</th>
                          <th className="pb-3 font-medium">المبلغ</th>
                          <th className="pb-3 font-medium print:hidden">إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(state.archivedPendingFunds || []).map(item => (
                          <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
                            <td className="py-3">{item.dateSettled}</td>
                            <td className="py-3 font-medium">{item.name}</td>
                            <td className="py-3">
                              {item.type === 'toUs' ? 
                                <span className="text-amber-700 bg-amber-50 px-2 py-1 rounded-md text-xs font-bold border border-amber-200">لنا</span> : 
                                <span className="text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md text-xs font-bold border border-slate-200 dark:border-slate-700">علينا</span>}
                            </td>
                            <td className="py-3 font-bold" dir="ltr">{formatNum(item.amount)}</td>
                            <td className="py-3 print:hidden">
                              <button onClick={() => {
                                setConfirmDialog({
                                  message: 'حذف نهائي من الأرشيف؟',
                                  onConfirm: () => {
                                    setState(prev => ({...prev, archivedPendingFunds: (prev.archivedPendingFunds || []).filter(t => t.id !== item.id)}));
                                    showToast('تم الحذف من الأرشيف', 'success');
                                  }
                                });
                              }} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-[4px] transition-colors">
                                <Trash2 size={16}/>
                              </button>
                            </td>
                          </tr>
                        ))}
                        {((state.archivedPendingFunds) || []).length === 0 && (
                          <tr>
                            <td colSpan={5}>
                              <div className="flex flex-col items-center justify-center py-12 text-slate-400 bg-slate-50 dark:bg-slate-800/50/50 rounded-[4px] my-4 border border-dashed border-slate-200 dark:border-slate-700">
                                <History size={48} className="opacity-20 mb-3" />
                                <p className="font-bold text-lg text-slate-500 dark:text-slate-400">الأرشيف فارغ حالياً</p>
                                <p className="text-[15px] text-slate-400 mt-1">تظهر هنا الأموال المعلقة بعد تسويتها</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              )}
              
              {/* Analytics Tab */}
              { (activeTab === 'analytics' && !isExporting) && (<div className="print:hidden">
                <AnalyticsView history={history} currentState={state} formatNum={formatNum} onUpdate={setState} />
              </div>
              )}
              </>
              )}
            </div>
            </div>
          )}

          {/* Right Column: Sticky Summary Dashboard */}
          {(!userProfile || userProfile.role !== 'admin' || currentBranchId) && !['history', 'ledger', 'archive', 'analytics'].includes(activeTab) && (
            <div className="w-full lg:w-80 xl:w-96 shrink-0 print:w-full">
              <div className={`sticky top-20 flex flex-col gap-4 ${isExporting ? '' : 'max-h-[calc(100vh-6rem)] overflow-y-auto'} pb-4 scrollbar-hide`}>
                <div className="mb-4 flex justify-center"><LiveClock /></div>
                <SummaryDashboard state={state} summary={currentSummary} isExport={isExporting} />
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Export Modal */}
      
      {showExportModal && (
        <div className="fixed inset-0 z-[200] bg-slate-100 dark:bg-slate-800/500 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="pro-card w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Download size={20} className="text-slate-900 dark:text-white tracking-tight" /> 
                تصدير التسوية
              </h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-[4px] transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-[15px] font-bold text-slate-700 dark:text-slate-300 mb-3">نوع التقرير (التفاصيل)</label>
                <div className="grid grid-cols-3 gap-3">
                  <button 
                    onClick={() => setExportMode('summary')}
                    className={`p-3 rounded-[4px] border-2 flex flex-col items-center gap-2 transition-colors ${exportMode === 'summary' ? 'border-slate-900 bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 font-bold' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:border-slate-600'}`}
                  >
                    <FileText size={24} />
                    <span className="font-bold">مبسط</span>
                    <span className="text-xs text-center opacity-80">التقفيل النهائي</span>
                  </button>
                  <button 
                    onClick={() => setExportMode('comprehensive')}
                    className={`p-3 rounded-[4px] border-2 flex flex-col items-center gap-2 transition-colors ${exportMode === 'comprehensive' ? 'border-slate-900 bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 font-bold' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:border-slate-600'}`}
                  >
                    <BarChart3 size={24} />
                    <span className="font-bold">شامل</span>
                    <span className="text-xs text-center opacity-80">صفحة A4</span>
                  </button>
                  <button 
                    onClick={() => setExportMode('detailed')}
                    className={`p-3 rounded-[4px] border-2 flex flex-col items-center gap-2 transition-colors ${exportMode === 'detailed' ? 'border-slate-900 bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 font-bold' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:border-slate-600'}`}
                  >
                    <BookOpen size={24} />
                    <span className="font-bold">مفصل</span>
                    <span className="text-xs text-center opacity-80">كل الجداول</span>
                  </button>
                </div>
              </div>
              
              <div className="flex gap-2 w-full mt-4">
                <button 
                  onClick={() => handleExport('a4')}
                  disabled={isExporting}
                  className="flex-1 bg-brand-500 text-white border-none hover:bg-blue-700 text-white py-3 rounded-[4px] font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isExporting ? 'جاري التحضير...' : (
                    <>
                      {exportMode === 'summary' ? <Download size={20} /> : <Printer size={20} />} طباعة A4
                    </>
                  )}
                </button>
                
                {exportMode === 'summary' && (
                  <button 
                    onClick={() => handleExport('thermal')}
                    disabled={isExporting}
                    className="flex-1 bg-slate-800 text-white py-3 rounded-[4px] font-bold hover:bg-slate-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Printer size={20} /> حراري
                  </button>
                )}
              </div>
              
              {exportMode === 'summary' && (
                  <button 
                    onClick={handleCopyDailyReport}
                    className="w-full mt-3 btn-success text-white py-3 rounded-[4px] font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Copy size={20} /> نسخ التقرير النصي
                  </button>
              )}
            </div>
          </div>
        </div>
      )}
      

      {/* View Snapshot Modal */}
      
      {viewSnapshot && (
        <div className="fixed inset-0 z-[100] bg-slate-100 dark:bg-slate-800/500 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="pro-card w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <CalendarDays size={20} className="text-slate-900 dark:text-white tracking-tight" /> 
                تفاصيل يوم: {viewSnapshot.state.date}
              </h3>
              <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white tracking-tight rounded-[4px] overflow-hidden border border-slate-300 dark:border-slate-600">
                  <button onClick={() => { setViewSnapshot(null); handlePrintHistory(viewSnapshot, 'a4'); }} className="hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 px-3 py-1.5 text-[15px] font-bold transition-colors border-l border-slate-300 dark:border-slate-600 flex items-center gap-1" title="طباعة A4"><Printer size={16} /> A4</button>
                  <button onClick={() => { setViewSnapshot(null); handlePrintHistory(viewSnapshot, 'thermal'); }} className="hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 px-3 py-1.5 text-[15px] font-bold transition-colors" title="طباعة حراري">حراري</button>
                </div>
                <button onClick={() => setViewSnapshot(null)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-[4px] transition-colors"><X size={20} /></button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto bg-slate-100 dark:bg-slate-800">
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
      

            <SettingsModalComponent
        show={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        companyName={companyName}
        setCompanyName={setCompanyName}
        theme={theme}
        setTheme={setTheme}
        uiScale={uiScale}
        setUiScale={setUiScale}
        thermalMargins={thermalMargins}
        setThermalMargins={setThermalMargins}
        clearHistory={clearHistory}
        branches={branches}
        adminUsers={adminUsers}
        handleUpdateBranch={handleUpdateBranch}
        handleDeleteBranch={handleDeleteBranch}
        handleUpdateUser={handleUpdateUser}
        setShowAddBranchModal={setShowAddBranchModal}
        user={user}
        userProfile={userProfile}
        savedNames={state.savedNames}
        addSavedName={addSavedName}
        removeSavedName={removeSavedName}
      />

      {/* Toast Notification */}
      
      {toast && (
        <div className={`fixed bottom-24 md:bottom-8 left-1/2 z-[200] px-6 py-3 rounded-full shadow-lg font-bold text-white flex items-center gap-2 whitespace-nowrap ${toast.type === 'success' ? 'btn-success' : 'bg-rose-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          {toast.message}
        </div>
      )}
      

      {/* Confirm Dialog */}
      
      {confirmDialog && (
        <div className="fixed inset-0 z-[200] bg-slate-100 dark:bg-slate-800/500 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="pro-card w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">تأكيد الإجراء</p>
              <p className="text-slate-600 dark:text-slate-400 mb-6">{confirmDialog.message}</p>
              <div className="flex gap-3">
                <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="flex-1 bg-brand-500 text-white border-none hover:bg-blue-700 text-white py-2 rounded-[4px] font-bold hover:bg-slate-800 transition-colors">تأكيد</button>
                <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2 rounded-[4px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 dark:bg-slate-700 transition-colors">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
      

      {/* Networks Modal */}
      
      {activeNetworkPosId && activePos && (
        <div className="fixed inset-0 z-[100] bg-slate-100 dark:bg-slate-800/500 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="pro-card w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <CreditCard size={20} className="text-amber-600" /> 
                مبالغ الشبكات - {activePos.name}
              </h3>
              <button onClick={() => setActiveNetworkPosId(null)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-[4px] transition-colors flex items-center gap-1 text-[15px] font-bold"><ArrowRight size={18} /> رجوع</button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {activePos.networks.map((amount, idx) => (
                <div key={idx} className="flex gap-2 mb-3">
                  <span className="text-slate-400 text-[15px] mt-2">{idx + 1}.</span>
                  <Input 
                    type="number" 
                    value={amount !== undefined ? round2(amount) : ''} 
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
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-[4px]"
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
                className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-[4px] hover:border-slate-300 dark:border-slate-600 hover:text-slate-900 dark:text-white tracking-tight transition-colors flex items-center justify-center gap-2 font-medium mt-2"
              >
                <Plus size={18} /> إضافة مبلغ شبكة جديد
              </button>
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
              <span className="font-bold text-slate-600 dark:text-slate-400">إجمالي الشبكات:</span>
              <span className="font-black text-amber-600 text-lg" dir="ltr">{formatNum(sumNetworks(activePos.networks))}</span>
            </div>
            <div className="p-4 pt-0 bg-slate-50 dark:bg-slate-800/50">
              <button onClick={() => setActiveNetworkPosId(null)} className="w-full bg-brand-500 text-white border-none hover:bg-blue-700 text-white py-2 rounded-[4px] font-bold hover:bg-slate-800 transition-colors">
                موافق
              </button>
            </div>
          </div>
        </div>
      )}
      

      {/* Add Branch Modal */}
      
      {showAddBranchModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden" dir="rtl">
          <div className="pro-card w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg flex items-center gap-2">
                <Plus className="text-slate-900 dark:text-white tracking-tight" size={20} />
                إضافة فرع جديد
              </h3>
              <button disabled={loading} onClick={() => setShowAddBranchModal(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-[4px] transition-colors flex items-center gap-1 text-[15px] font-bold"><ArrowRight size={18} /> رجوع</button>
            </div>
            <form onSubmit={handleAddBranchSubmit} className="p-6">
              <div className="mb-4">
                <label className="block text-[15px] font-bold text-slate-700 dark:text-slate-300 mb-2">اسم الفرع</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: فرع المدينة"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-[4px] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-transparent transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !newBranchName.trim()}
                className="w-full bg-brand-500 text-white border-none hover:bg-blue-700 outline-none text-white font-bold py-3 px-4 rounded-[4px] hover:bg-slate-800 transition-all shadow-sm shadow-black/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 size={20} />}
                إضافة
              </button>
            </form>
          </div>
        </div>
      )}
      

      
      {showAuthModal && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden" dir="rtl">
          <div className="pro-card w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg flex items-center gap-2">
                <LogIn className="text-slate-900 dark:text-white tracking-tight" size={24} />
                {isSignUp ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
              </h3>
              <button onClick={() => setShowAuthModal(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-[4px] transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6">
              {authError && (
                <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-[4px] text-[15px] font-bold border border-red-200 flex items-center gap-2">
                  <AlertCircle size={18} className="shrink-0" />
                  {authError}
                </div>
              )}
              <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-[15px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">البريد الإلكتروني</label>
                  <input
                    type="email"
                    required
                    dir="ltr"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-[4px] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[15px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">كلمة المرور</label>
                  <input
                    type="password"
                    required
                    dir="ltr"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-[4px] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-brand-500 text-white border-none hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-[4px] mt-2 hover:bg-slate-800 transition-all shadow-sm active:scale-95"
                >
                  {isSignUp ? 'إنشاء الحساب' : 'دخول'}
                </button>
              </form>

              <div className="mt-5 relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                </div>
                <div className="relative flex justify-center text-[15px]">
                  <span className="px-2 bg-white dark:bg-slate-900 print:bg-white text-slate-500 dark:text-slate-400 font-medium">أو</span>
                </div>
              </div>

              <button
                onClick={handleGoogleLogin}
                className="mt-5 w-full bg-white dark:bg-slate-900 print:bg-white border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold py-3 px-4 rounded-[4px] hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 hover:border-slate-300 dark:border-slate-600 transition-all active:scale-95 flex items-center justify-center gap-3"
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
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white tracking-tight font-bold transition-colors text-[15px] relative after:bg-brand-500 text-white border-none hover:bg-blue-700 after:absolute after:h-[2px] after:w-0 hover:after:w-full after:bottom-0 after:-right-0 after:transition-all after:duration-300"
                >
                  {isSignUp ? 'لدي حساب بالفعل، تسجيل الدخول' : 'جديد؟ قم بإنشاء حساب'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      </div>

      {printView === 'comprehensive_a4' && <ComprehensivePrintView companyName={companyName} state={state} summary={currentSummary} formatNum={formatNum} />}
      {printView === 'daily' && <DailyPrintView companyName={companyName} state={state} summary={currentSummary} formatNum={formatNum} />}
      {printView === 'daily_thermal' && <DailyPrintView companyName={companyName} state={state} summary={currentSummary} formatNum={formatNum} printFormat="thermal" thermalMargins={thermalMargins} />}
      {printView === 'history' && printSnapshot && <DailyPrintView companyName={companyName} state={printSnapshot.state} summary={printSnapshot.summary} formatNum={formatNum} />}
      {printView === 'history_thermal' && printSnapshot && <DailyPrintView companyName={companyName} state={printSnapshot.state} summary={printSnapshot.summary} formatNum={formatNum} printFormat="thermal" thermalMargins={thermalMargins} />}
      {printView === 'pending' && <PendingPrintView companyName={companyName} pendingOwedToUs={state.pendingFundsOwedToUs} pendingOwedByUs={state.pendingFundsOwedByUs} formatNum={formatNum} />}
      {printView === 'pos' && activePrintPosId && state.posData.find(p => p.id === activePrintPosId) && (
        <PosPrintView companyName={companyName} pos={state.posData.find(p => p.id === activePrintPosId)} summary={currentSummary} formatNum={formatNum} date={state.date} printFormat="a4" />
      )}
      {printView === 'pos_thermal' && activePrintPosId && state.posData.find(p => p.id === activePrintPosId) && (
        <PosPrintView companyName={companyName} pos={state.posData.find(p => p.id === activePrintPosId)} summary={currentSummary} formatNum={formatNum} date={state.date} printFormat="thermal" thermalMargins={thermalMargins} />
      )}
      
      {showCalculator && <CalculatorWidget onClose={() => setShowCalculator(false)} />}
      
      {thermalPreviewData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-[4px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 print:bg-white flex justify-between items-center">
              <h2 className="font-bold text-lg">معاينة وتخصيص الإيصال الحراري</h2>
              <button onClick={() => setThermalPreviewData(null)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-[4px] transition-colors flex items-center gap-1 text-[15px] font-bold"><ArrowRight size={18} /> رجوع</button>
            </div>
            
            <div className="p-4 bg-white dark:bg-slate-900 print:bg-white border-b border-slate-200 dark:border-slate-700 flex flex-col gap-4">
              <p className="text-[15px] text-slate-500 dark:text-slate-400 text-center font-bold">هوامش الطباعة (اسحب المسطرة لتوسيط الإيصال)</p>
              <div className="grid grid-cols-2 gap-4">
                 <div className="flex flex-col gap-1 bg-slate-50 dark:bg-slate-800/50/50 p-2.5 rounded-[4px] border border-gray-200">
                   <div className="flex justify-between items-center px-1">
                     <span className="text-[15px] font-semibold text-slate-600 dark:text-slate-400">أعلى (Top)</span>
                     <span className="font-bold text-[15px] text-slate-800 dark:text-slate-200 font-bold">{thermalMargins.top}px</span>
                   </div>
                   <input type="range" min="0" max="100" value={thermalMargins.top} onChange={(e) => setThermalMargins(p => ({...p, top: parseInt(e.target.value)}))} className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-[4px] appearance-none cursor-pointer accent-slate-900" />
                 </div>
                 <div className="flex flex-col gap-1 bg-slate-50 dark:bg-slate-800/50/50 p-2.5 rounded-[4px] border border-gray-200 hidden">
                   <div className="flex justify-between items-center px-1">
                     <span className="text-[15px] font-semibold text-slate-600 dark:text-slate-400">أسفل</span>
                     <span className="font-bold text-[15px] text-slate-800 dark:text-slate-200 font-bold">0px</span>
                   </div>
                   <input type="range" min="0" max="100" value="0" disabled className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-[4px] appearance-none cursor-not-allowed accent-gray-400" />
                 </div>
                 <div className="flex flex-col gap-1 bg-slate-50 dark:bg-slate-800/50/50 p-2.5 rounded-[4px] border border-gray-200">
                   <div className="flex justify-between items-center px-1">
                     <span className="text-[15px] font-semibold text-slate-600 dark:text-slate-400">اليمين (Right)</span>
                     <span className="font-bold text-[15px] text-slate-800 dark:text-slate-200 font-bold">{thermalMargins.right}px</span>
                   </div>
                   <input type="range" min="0" max="200" value={thermalMargins.right} onChange={(e) => setThermalMargins(p => ({...p, right: parseInt(e.target.value)}))} className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-[4px] appearance-none cursor-pointer accent-slate-900" />
                 </div>
                 <div className="flex flex-col gap-1 bg-slate-50 dark:bg-slate-800/50/50 p-2.5 rounded-[4px] border border-gray-200">
                   <div className="flex justify-between items-center px-1">
                     <span className="text-[15px] font-semibold text-slate-600 dark:text-slate-400">اليسار (Left)</span>
                     <span className="font-bold text-[15px] text-slate-800 dark:text-slate-200 font-bold">{thermalMargins.left}px</span>
                   </div>
                   <input type="range" min="0" max="200" value={thermalMargins.left} onChange={(e) => setThermalMargins(p => ({...p, left: parseInt(e.target.value)}))} className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-[4px] appearance-none cursor-pointer accent-slate-900" />
                 </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex justify-center bg-slate-200 dark:bg-slate-700 shadow-inner">
              <div className="relative mx-auto shrink-0 bg-white dark:bg-slate-900 print:bg-white shadow border border-slate-300 dark:border-slate-600" style={{ width: '80mm', minHeight: '100mm' }}>
                <div id="thermal-receipt-preview-export">
                  {thermalPreviewData.type === 'daily' && <DailyPrintView companyName={companyName} state={state} summary={currentSummary} formatNum={formatNum} printFormat="thermal" thermalMargins={thermalMargins} isPreviewMode={true} />}
                  {thermalPreviewData.type === 'history' && <DailyPrintView companyName={companyName} state={thermalPreviewData.snap.state} summary={thermalPreviewData.snap.summary} formatNum={formatNum} printFormat="thermal" thermalMargins={thermalMargins} isPreviewMode={true} />}
                  {thermalPreviewData.type === 'pos' && <PosPrintView companyName={companyName} pos={state.posData.find(p => p.id === thermalPreviewData.id)} summary={currentSummary} formatNum={formatNum} date={state.date} printFormat="thermal" thermalMargins={thermalMargins} isPreviewMode={true} />}
                </div>
                {/* Margin overlays */}
                <div className="absolute inset-y-0 right-0 border-l-2 border-dashed border-slate-300 dark:border-slate-600/60 bg-slate-100 dark:bg-slate-800/50 pointer-events-none flex items-center justify-center transition-all" style={{ width: thermalMargins.right }}><span className="-rotate-90 text-[10px] text-slate-900 dark:text-white font-bold mix-blend-multiply opacity-50 whitespace-nowrap">{thermalMargins.right}px</span></div>
                <div className="absolute inset-y-0 left-0 border-r-2 border-dashed border-slate-300 dark:border-slate-600/60 bg-slate-100 dark:bg-slate-800/50 pointer-events-none flex items-center justify-center transition-all" style={{ width: thermalMargins.left }}><span className="rotate-90 text-[10px] text-slate-900 dark:text-white font-bold mix-blend-multiply opacity-50 whitespace-nowrap">{thermalMargins.left}px</span></div>
                <div className="absolute inset-x-0 top-0 border-b-2 border-dashed border-slate-300 dark:border-slate-600/60 bg-slate-100 dark:bg-slate-800/50 pointer-events-none flex justify-center items-center transition-all" style={{ height: thermalMargins.top }}><span className="text-[10px] text-slate-900 dark:text-white font-bold mix-blend-multiply opacity-50">{thermalMargins.top}px</span></div>
              </div>
            </div>
            
            <div className="p-4 bg-white dark:bg-slate-900 print:bg-white border-t border-slate-200 dark:border-slate-700 flex flex-col gap-3">
              <button 
                onClick={async () => {
                  const element = document.getElementById('thermal-receipt-preview-export');
                  if (!element) return;
                  try {
                    const htmlToImage = await import('html-to-image');
                    const dataUrl = await htmlToImage.toPng(element, { quality: 1, backgroundColor: '#ffffff', pixelRatio: 2 });
                    const link = document.createElement('a');
                    link.download = `receipt-${state.date.split('/').join('-')}.png`;
                    link.href = dataUrl;
                    link.click();
                  } catch (err) {
                    console.error("Failed to export image", err);
                  }
                }}
                className="w-full btn-success text-white py-3 rounded-[4px] font-bold hover:bg-emerald-700 transition-colors flex justify-center items-center gap-2"
              >
                <Download size={20} /> تصدير كصورة (Image)
              </button>
              <button 
                onClick={() => {
                  let v = '';
                  if (thermalPreviewData.type === 'daily') {
                    setPrintView('daily_thermal');
                    v = 'daily_thermal';
                  } else if (thermalPreviewData.type === 'history') {
                    setPrintSnapshot({ state: thermalPreviewData.snap.state, summary: thermalPreviewData.snap.summary });
                    setPrintView('history_thermal');
                    v = 'history_thermal';
                  } else if (thermalPreviewData.type === 'pos') {
                    setActivePrintPosId(thermalPreviewData.id!);
                    setPrintView('pos_thermal');
                    v = 'pos_thermal';
                  }
                  setThermalPreviewData(null);
                  setIsExporting(true);
                  if (v !== '') {
                    setTimeout(() => {
                      window.print();
                    }, 500);
                  }
                }}
                className="w-full bg-brand-500 text-white hover:bg-blue-700 py-3 rounded-[4px] font-bold hover:bg-slate-800 transition-colors flex justify-center items-center gap-2"
              >
                <Printer size={20} /> طباعة حراري الآن
              </button>
            </div>
          </div>
        </div>
      )}

      
      

      {/* Signature */}
      <div className="py-6 text-center text-slate-400 text-xs font-medium print:hidden">
        تم التطوير بواسطة <span className="font-bold text-slate-900 dark:text-white tracking-tight">Eng. Khaled Rizk</span> &copy; {new Date().getFullYear()}
      </div>
    </div>
  );
}
