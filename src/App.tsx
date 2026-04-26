import React, { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Save, Printer, FilePlus, Plus, Trash2, Calculator, Wallet, ArrowDownRight, ArrowUpRight, AlertCircle, CheckCircle2, CreditCard, Receipt, Layers, Pin, Settings, Undo2, History, Eye, EyeOff, X, LogIn, LogOut, CalendarDays, Download, FileText, Image as ImageIcon, BookOpen, PlusCircle, Copy, Search, Check, Edit2, BarChart3, TrendingUp, ChevronUp, ChevronDown, ArrowRight, ChevronLeft, Database, Sparkles } from 'lucide-react';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, User, signOut, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy, updateDoc, where } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import CalculatorWidget from './components/Calculator';
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
    type: 'day' | 'month' | 'year';
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
const sumTransactions = (arr: Transaction[]) => round2(arr.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
const sumNetworks = (networks: number[]) => round2(networks.reduce((sum, val) => sum + (Number(val) || 0), 0));

const getSummary = (s: AppState) => {
  const totalSales = round2(s.posData.reduce((sum, item) => sum + (Number(item.sales) || 0), 0));
  const totalReturns = round2(s.posData.reduce((sum, item) => sum + (Number(item.returns) || 0), 0));
  const netSales = round2(totalSales - totalReturns);
  const totalExpenseRefunds = sumTransactions(s.expenseRefunds);
  const totalCashIn = round2(netSales + totalExpenseRefunds);

  const totalNetworks = round2(s.posData.reduce((sum, item) => sum + sumNetworks(item.networks), 0));
  const totalCustomerTransfers = sumTransactions(s.customerTransfers);
  const totalCompanyPayments = sumTransactions(s.companyPayments);
  
  const separatedExpenses = s.expenses.filter(e => e.showInSummary && e.amount > 0);
  const separatedExpensesTotal = sumTransactions(separatedExpenses);
  const generalExpensesTotal = sumTransactions(s.expenses.filter(e => !e.showInSummary));
  const totalExpenses = round2(generalExpensesTotal + separatedExpensesTotal);
  
  const totalCashDeposits = sumTransactions(s.cashDeposits);
  const totalCashOut = round2(totalNetworks + totalCustomerTransfers + totalCompanyPayments + totalExpenses + totalCashDeposits);

  const expectedCash = round2(s.previousBalance + totalCashIn - totalCashOut);

  const physicalDenominations = round2(Object.entries(s.cashDenominations).reduce((sum, [denom, count]) => sum + (Number(denom) * (Number(count) || 0)), 0));
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

const DailyPrintView = ({ state, summary, formatNum, isPdfMode = false, id, printFormat = 'a4', thermalMargins = { right: 24, left: 24 } }: any) => {
  if (printFormat === 'thermal') {
    return (
      <div id={id} className="hidden print:flex print:flex-col rtl print:bg-white text-black font-sans box-border" style={{ width: '100%', margin: 0, padding: `0px ${thermalMargins.left}px 10px ${thermalMargins.right}px`, fontSize: '20px', lineHeight: '1.6' }}>
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            @page { margin: 0; padding: 0; }
            body { margin: 0; padding: 0; background: white; width: 100%; box-sizing: border-box; }
            * { box-shadow: none !important; box-sizing: border-box !important; }
          }
        `}} />
        <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px dashed #000', paddingBottom: '15px' }}>
          <h1 style={{ fontSize: '30px', fontWeight: 'bold', margin: '0 0 8px 0' }}>تقرير التقفيل اليومي</h1>
          <div style={{ fontSize: '18px' }}>
            <div style={{ marginBottom: '4px' }}>التاريخ: <span dir="ltr" style={{ fontWeight: 'bold' }}>{state.date}</span></div>
            <div>طباعة: <span dir="ltr">{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span></div>
          </div>
        </div>

        <div style={{ fontWeight: 'bold', borderBottom: '2px solid #000', marginBottom: '10px', paddingBottom: '5px', fontSize: '24px' }}>ملخص الوارد والمنصرف</div>
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
};

const PosPrintView = ({ pos, summary, formatNum, date, printFormat = 'a4', thermalMargins = { right: 24, left: 24 } }: any) => {
  const net = pos.sales - pos.returns;
  const networksTotal = pos.networks.reduce((a: number, b: any) => a + (typeof b === 'number' ? b : b.amount || 0), 0);
  const diff = (pos.physicalCash !== undefined ? pos.physicalCash : 0) - (net - networksTotal);
  
  if (printFormat === 'thermal') {
    return (
      <div className="hidden print:flex print:flex-col rtl print:bg-white text-black font-sans box-border" style={{ width: '100%', margin: 0, padding: `0px ${thermalMargins.left}px 10px ${thermalMargins.right}px`, fontSize: '20px', lineHeight: '1.6' }}>
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            @page { margin: 0; padding: 0; }
            body { margin: 0; padding: 0; background: white; width: 100%; box-sizing: border-box; }
            * { box-shadow: none !important; box-sizing: border-box !important; }
          }
        `}} />
        <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px dashed #000', paddingBottom: '15px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: '0 0 8px 0' }}>تسوية نقطة بيع</h1>
          <h2 style={{ fontSize: '32px', fontWeight: 'bold', margin: '0 0 8px 0' }}>{pos.name || 'بدون اسم'}</h2>
          <div style={{ fontSize: '18px' }}>
            <div style={{ marginBottom: '4px' }}>التاريخ: <span dir="ltr" style={{ fontWeight: 'bold' }}>{date || summary?.date || new Date().toLocaleDateString('en-GB')}</span></div>
            <div>طباعة: <span dir="ltr">{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span></div>
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
    <div className="hidden print:block rtl p-8 w-[800px] print:w-full print:bg-white text-black font-sans mx-auto">
      <div className="text-center mb-8 pb-6 border-b-2 border-gray-400">
        <h1 className="text-4xl font-black mb-3 text-gray-900 border-2 border-gray-900 inline-block px-8 py-3 rounded-2xl shadow-[4px_4px_0_0_rgba(17,24,39,1)]">
          تسوية نقطة بيع: {pos.name || 'بدون اسم'}
        </h1>
        <div className="flex justify-center gap-6 mt-6">
          <p className="text-lg font-bold bg-gray-100 px-4 py-2 rounded-lg border border-gray-300">
            تاريخ الإعداد: <span dir="ltr" className="font-mono text-blue-700">{date || summary?.date || new Date().toLocaleDateString('en-GB')}</span>
          </p>
          <p className="text-lg font-bold bg-gray-100 px-4 py-2 rounded-lg border border-gray-300">
            تاريخ الطباعة: <span dir="ltr" className="font-mono text-gray-700">{new Date().toLocaleDateString('en-GB')}</span>
          </p>
        </div>
      </div>
      
      <table className="w-full text-right border-collapse text-xl border-2 border-gray-400 mb-8 rounded-lg overflow-hidden shadow-sm">
        <tbody>
          <tr className="border-b-2 border-gray-300">
            <td className="py-4 px-6 font-bold bg-gray-50 align-middle w-2/3">إجمالي المبيعات</td>
            <td className="py-4 px-6 font-black font-mono text-2xl border-r-2 border-gray-300 bg-white" dir="ltr">{formatNum(pos.sales)}</td>
          </tr>
          <tr className="border-b-2 border-gray-300">
            <td className="py-4 px-6 font-bold text-rose-800 bg-rose-50 align-middle w-2/3">المرتجعات (تخصم)</td>
            <td className="py-4 px-6 font-black font-mono text-2xl text-rose-700 border-r-2 border-gray-300 bg-white" dir="ltr">{formatNum(pos.returns)}</td>
          </tr>
          <tr className="border-b-2 border-gray-400">
            <td className="py-4 px-6 font-black bg-slate-100 text-slate-800 align-middle w-2/3">صافي المبيعات</td>
            <td className="py-4 px-6 font-black font-mono text-2xl border-r-2 border-gray-400 bg-white text-slate-800" dir="ltr">{formatNum(net)}</td>
          </tr>
          <tr className="border-b-2 border-gray-300">
            <td className="py-4 px-6 font-bold text-blue-800 bg-blue-50 align-middle w-2/3 break-words relative">
              <span className="block mb-1">إجمالي الشبكات (تخصم)</span>
              {pos.networks?.length > 0 && (
                <span className="text-sm font-normal text-blue-600 block bg-blue-100/50 px-2 py-1 rounded inline-block mt-1">
                  ( {pos.networks.map((n: number) => formatNum(n)).join(' + ')} )
                </span>
              )}
            </td>
            <td className="py-4 px-6 font-black font-mono text-2xl text-blue-700 border-r-2 border-gray-300 bg-white align-middle" dir="ltr">{formatNum(networksTotal)}</td>
          </tr>
          <tr className="border-b-[3px] border-gray-900 bg-amber-50">
            <td className="py-5 px-6 font-black text-amber-900 align-middle w-2/3 text-2xl">المطلوب كاش في الدرج</td>
            <td className="py-5 px-6 font-black font-mono text-3xl text-indigo-800 border-r-2 border-gray-900 bg-amber-50/50" dir="ltr">{formatNum(net - networksTotal)}</td>
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
        <div className={`p-8 mt-8 rounded-2xl border-4 text-center ${diff === 0 ? 'bg-emerald-50 border-emerald-400' : diff > 0 ? 'bg-blue-50 border-blue-400' : 'bg-rose-50 border-rose-400'}`}>
          <p className="text-xl font-bold mb-2 text-gray-600">نتيجة جرد الدرج الفعلي</p>
          <div className={`font-black text-4xl tracking-tight ${diff === 0 ? 'text-emerald-800' : diff > 0 ? 'text-blue-800' : 'text-rose-800'}`}>
            {diff === 0 ? 'الدرج مطابق تماماً (لا عجز ولا زيادة)' : diff > 0 ? `يوجد زيادة: ${formatNum(Math.abs(diff))}` : `يوجد عجز: ${formatNum(Math.abs(diff))}`}
          </div>
          {diff !== 0 && (
             <p className={`mt-3 font-bold ${diff > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
               يرجى المراجعة والتسوية مع القسم المختص.
             </p>
          )}
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

      <div className="grid grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-bold p-3 mb-4 bg-amber-50 text-amber-900 border border-amber-200 flex justify-between rounded-lg">
            <span>أموال لنا (سلف/عهد)</span>
            <span dir="ltr" className="font-mono">{formatNum(sumOwedToUs)}</span>
          </h2>
          <table className="w-full text-right border-collapse text-[15px] border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-2 px-2 border border-gray-300 w-10 text-center">م</th>
                <th className="py-2 px-2 border border-gray-300">الاسم</th>
                <th className="py-2 px-2 border border-gray-300 w-28 text-left">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {pendingOwedToUs.length > 0 ? pendingOwedToUs.map((item: any, idx: number) => (
                <tr key={item.id} className="border-b border-gray-200">
                  <td className="py-2 px-2 border border-gray-300 text-center">{idx + 1}</td>
                  <td className="py-2 px-2 border border-gray-300">{item.name}</td>
                  <td className="py-2 px-2 border border-gray-300 text-left font-bold font-mono" dir="ltr">{formatNum(item.amount)}</td>
                </tr>
              )) : <tr><td colSpan={3} className="text-center py-4 text-gray-500 border border-gray-300">لا توجد أموال معلقة لنا</td></tr>}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="text-xl font-bold p-3 mb-4 bg-slate-100 text-slate-800 border border-slate-200 flex justify-between rounded-lg">
            <span>أموال علينا (أمانات/مستحقات)</span>
            <span dir="ltr" className="font-mono">{formatNum(sumOwedByUs)}</span>
          </h2>
          <table className="w-full text-right border-collapse text-[15px] border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-2 px-2 border border-gray-300 w-10 text-center">م</th>
                <th className="py-2 px-2 border border-gray-300">الاسم</th>
                <th className="py-2 px-2 border border-gray-300 w-28 text-left">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {pendingOwedByUs.length > 0 ? pendingOwedByUs.map((item: any, idx: number) => (
                <tr key={item.id} className="border-b border-gray-200">
                  <td className="py-2 px-2 border border-gray-300 text-center">{idx + 1}</td>
                  <td className="py-2 px-2 border border-gray-300">{item.name}</td>
                  <td className="py-2 px-2 border border-gray-300 text-left font-bold font-mono" dir="ltr">{formatNum(item.amount)}</td>
                </tr>
              )) : <tr><td colSpan={3} className="text-center py-4 text-gray-500 border border-gray-300">لا توجد أموال معلقة علينا</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const AnalyticsView = ({ history, currentState, formatNum, onUpdate }: any) => {
  const allData = [...history.map((s: any) => ({ ...s.state, isCurrent: false })), { ...currentState, isCurrent: true }];
  
  let metricsRawData = allData.map(state => {
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
      pureNetSales: netSales,
      expenses: totalOut,
      net: totalIn - totalOut,
      isCurrent: state.isCurrent,
      dateName: parts.length === 3 ? `${day}/${month}` : state.date
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
            dateName: `${parts[0]}/${parts[1]}`
          });
        }
      }
    });
  }

  const dailyMetrics = metricsRawData.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  const yearlyAgg = dailyMetrics.reduce((acc: any, curr: any) => {
    const year = curr.dateObj.getFullYear().toString();
    if (!acc[year]) acc[year] = { year, totalSales: 0, totalPureNetSales: 0, totalExpenses: 0, totalNet: 0, months: {} };
    if (!acc[year].months[curr.monthYear]) acc[year].months[curr.monthYear] = { monthYear: curr.monthYear, dateObj: curr.dateObj, totalSales: 0, totalPureNetSales: 0, totalExpenses: 0, totalNet: 0, daysCount: 0 };
    
    acc[year].totalSales += curr.sales;
    acc[year].totalPureNetSales += curr.pureNetSales;
    acc[year].totalExpenses += curr.expenses;
    acc[year].totalNet += curr.net;
    
    acc[year].months[curr.monthYear].totalSales += curr.sales;
    acc[year].months[curr.monthYear].totalPureNetSales += curr.pureNetSales;
    acc[year].months[curr.monthYear].totalExpenses += curr.expenses;
    acc[year].months[curr.monthYear].totalNet += curr.net;
    
    if (!curr.isHistoricalDay) {
       // normal days count
       acc[year].months[curr.monthYear].daysCount += 1;
    } else {
       // historical days also count as 1
       acc[year].months[curr.monthYear].daysCount += 1;
    }
    
    return acc;
  }, {});

  // Add historical data directly into yearlyAgg
  if (currentState.historicalMonths && Array.isArray(currentState.historicalMonths)) {
    currentState.historicalMonths.forEach((hist: any) => {
      const parts = hist.monthYear.split('/');
      if (parts.length === 2) {
        const month = parts[0];
        const year = parts[1];
        if (!yearlyAgg[year]) yearlyAgg[year] = { year, totalSales: 0, totalPureNetSales: 0, totalExpenses: 0, totalNet: 0, months: {} };
        if (!yearlyAgg[year].months[hist.monthYear]) {
           yearlyAgg[year].months[hist.monthYear] = { 
             monthYear: hist.monthYear, 
             dateObj: new Date(Number(year), Number(month) - 1, 1), 
             totalSales: 0, totalPureNetSales: 0, totalExpenses: 0, totalNet: 0, daysCount: 0, isHistorical: true 
           };
        }
        
        // Add to historical month
        yearlyAgg[year].totalSales += hist.netSales;
        yearlyAgg[year].totalPureNetSales += hist.netSales;
        yearlyAgg[year].months[hist.monthYear].totalSales += hist.netSales;
        yearlyAgg[year].months[hist.monthYear].totalPureNetSales += hist.netSales;
        yearlyAgg[year].months[hist.monthYear].daysCount = new Date(Number(year), Number(month), 0).getDate();
      }
    });
  }

  if (currentState.historicalSales && Array.isArray(currentState.historicalSales)) {
    currentState.historicalSales.forEach((hist: any) => {
      let year = '';
      let monthYear = '';
      let dateObj = new Date();
      let daysCount = 1;
      
      if (hist.type === 'year') {
         year = hist.dateStr;
         monthYear = `إجمالي/${year}`;
         dateObj = new Date(Number(year), 0, 1);
         daysCount = 365;
      } else if (hist.type === 'month') {
         const parts = hist.dateStr.split('/');
         year = parts[1];
         monthYear = hist.dateStr;
         dateObj = new Date(Number(year), Number(parts[0]) - 1, 1);
         daysCount = new Date(Number(year), Number(parts[0]), 0).getDate();
      } else if (hist.type === 'day') {
         const parts = hist.dateStr.split('/');
         year = parts[2];
         monthYear = `${parts[1]}/${year}`;
         dateObj = new Date(Number(year), Number(parts[1]) - 1, Number(parts[0]));
         daysCount = 1;
      }

      // Important: for day type, it's already in dailyMetrics which adds to yearlyAgg.
      // So we only need to add month or year types here, to avoid double counting days!
      if (hist.type === 'day') return; 

      if (!yearlyAgg[year]) yearlyAgg[year] = { year, totalSales: 0, totalPureNetSales: 0, totalExpenses: 0, totalNet: 0, months: {} };
      if (!yearlyAgg[year].months[monthYear]) {
         yearlyAgg[year].months[monthYear] = { 
           monthYear, 
           dateObj, 
           totalSales: 0, totalPureNetSales: 0, totalExpenses: 0, totalNet: 0, daysCount: 0, isHistorical: true, isYearlyOnly: hist.type === 'year',
           historicalId: hist.id
         };
      }
      
      yearlyAgg[year].totalSales += hist.netSales;
      yearlyAgg[year].totalPureNetSales += hist.netSales;
      yearlyAgg[year].months[monthYear].totalSales += hist.netSales;
      yearlyAgg[year].months[monthYear].totalPureNetSales += hist.netSales;
      yearlyAgg[year].months[monthYear].daysCount = daysCount;
    });
  }

  const yearlyList = Object.values(yearlyAgg).sort((a: any, b: any) => Number(b.year) - Number(a.year));
  const latestYear = yearlyList.length > 0 ? (yearlyList[0] as any).year : null;

  const [expandedYears, setExpandedYears] = useState<string[]>(latestYear ? [latestYear] : []);
  const toggleYear = (year: string) => setExpandedYears(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]);

  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
  const toggleMonth = (month: string) => setExpandedMonths(prev => prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]);

  const [reportType, setReportType] = useState<'daily'|'monthly'|'yearly'>('daily');
  const [reportDateInput, setReportDateInput] = useState<string>(new Date().toISOString().split('T')[0]);
  const [copySuccess, setCopySuccess] = useState(false);
  
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [histType, setHistType] = useState('month'); // 'day', 'month', 'year'
  const [histMonth, setHistMonth] = useState('');
  const [histYear, setHistYear] = useState('');
  const [histDayDate, setHistDayDate] = useState('');
  const [histSales, setHistSales] = useState('');
  
  const handleAddHistoricalMonth = () => {
    if (!histSales) return;
    
    let dateStr = '';
    if (histType === 'year') {
      if (!histYear) return;
      dateStr = histYear;
    } else if (histType === 'month') {
       if (!histMonth || !histYear) return;
       dateStr = `${histMonth.padStart(2, '0')}/${histYear}`;
    } else if (histType === 'day') {
       if (!histDayDate) return;
       const parts = histDayDate.split('-'); // YYYY-MM-DD
       dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    const newId = generateId();
    const newHist = { id: newId, type: histType, dateStr, netSales: Number(histSales) };
    
    onUpdate((prevState: any) => ({
      ...prevState,
      historicalSales: [...(prevState.historicalSales || []), newHist]
    }));
    
    setHistMonth('');
    setHistYear('');
    setHistDayDate('');
    setHistSales('');
    setShowHistoryModal(false);
  };
  
  const handleDeleteHistoricalItem = (itemId: string) => {
    onUpdate((prevState: any) => ({
      ...prevState,
      historicalSales: (prevState.historicalSales || []).filter((h: any) => h.id !== itemId)
    }));
  };

  const handleAnalyzeSales = async () => {
    setAiLoading(true);
    try {
      const flattenedMonths = yearlyList.flatMap((y: any) => Object.values(y.months));
      
      const currentMonthYearStr = `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`;
      
      const summaryText = flattenedMonths.map((m: any) => {
          const isCurrent = m.monthYear === currentMonthYearStr;
          return `- شهر ${m.monthYear}: صافي المبيعات ${formatNum(m.totalPureNetSales)} ريال (أيام العمل المسجلة: ${m.daysCount})${isCurrent ? ' [تنبيه: هذا هو الشهر الجاري الحالي وهو غير مكتمل بعد]' : ''}`;
      }).join('\n');
      
      const prompt = `بصفتك محلل مبيعات استراتيجي، قم بتحليل بيانات المبيعات التالية وقدم تقريراً مفصلاً باللغة العربية يركز فقط على "صافي المبيعات":

1. **جدول ملخص الأداء:** قم بإنشاء جدول Markdown أنيق يقارن بين الأشهر (الشهر، المبيعات، المتوسط اليومي).
2. **رؤى المبيعات:** ما هو أفضل وأسوأ شهر؟ (تنبيه هام جداً: الشهر الجاري ${currentMonthYearStr} هو شهر "غير مكتمل" ولديك فقط جزء من أيامه! لذا يُمنع منعاً باتاً اعتباره أسوأ شهر لمجرد أن مبيعاته لم تكتمل. لتحديد قوة الشهر الجاري، احسب "المتوسط اليومي" وقارنه بالمتوسط اليومي للأشهر السابقة، وتنبأ استنتاجياً بالمبيعات الإجمالية إذا استمر الشهر بنفس الريتم).
3. **التوصيات:** 3 نصائح دقيقة ومباشرة لزيادة المبيعات الشهر القادم.

البيانات المتاحة:
${summaryText}

ملاحظات هامة:
- استخدم "جداول Markdown" لعرض الأرقام بشكل منتظم، واحرص على دقة الأرقام.
- استخدم الرموز التعبيرية بحيوية (مثل 📊، 📈، 💡، ⚠️) لتجميل التقرير.
- نسق النص بشكل احترافي ليستفيد منه مدير المبيعات مباشرة.`;

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      
      setAiAnalysis(response.text);
    } catch (err) {
      console.error("AI Analysis failed:", err);
      setAiAnalysis("عذراً، حدث خطأ أثناء الاتصال بمنصة الذكاء الاصطناعي للمحاسبة. تأكد من إعدادات الشبكة وحاول مرة أخرى.");
    } finally {
      setAiLoading(false);
    }
  };

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
      const dailySales = dayData ? dayData.pureNetSales : 0;
      
      const monthData = dailyMetrics.filter((d: any) => d.monthYear === targetMonthYear && d.dateObj.getTime() <= inputDateObj.getTime());
      const monthTotalSales = monthData.reduce((sum: number, d: any) => sum + d.pureNetSales, 0);
      const daysCountInMonth = monthData.length;
      const avgMonthly = daysCountInMonth > 0 ? monthTotalSales / daysCountInMonth : 0;

      return `═══════════════════════════════════════
           📊 تقرير المبيعات اليومي
═══════════════════════════════════════

📅 التاريخ: ${targetDateStr}

💰 صافي مبيعات اليوم
   ${formatNum(dailySales)} ريال

📈 المتوسط اليومي (لهذا الشهر حتى اليوم)
   ${formatNum(avgMonthly)} ريال بناءً على ${daysCountInMonth} يوم عمل مسجل

📊 إجمالي صافي المبيعات خلال الشهر (تراكمي)
   ${formatNum(monthTotalSales)} ريال

═══════════════════════════════════════
   تم إنشاء التقرير في: ${timeStr}`;
    } 
    else if (reportType === 'monthly') {
      const monthData = dailyMetrics.filter((d: any) => d.monthYear === targetMonthYear);
      const monthTotalSales = monthData.reduce((sum: number, d: any) => sum + d.pureNetSales, 0);
      const daysCountInMonth = monthData.length;
      const avgDaily = daysCountInMonth > 0 ? monthTotalSales / daysCountInMonth : 0;
      
      const yearData = dailyMetrics.filter((d: any) => d.dateObj.getFullYear().toString() === targetYear && d.dateObj.getTime() <= inputDateObj.getTime());
      const yearTotalSales = yearData.reduce((sum: number, d: any) => sum + d.pureNetSales, 0);

      // historical injection checking
      const currentYearObj = yearlyList.find((y:any) => y.year === targetYear);
      let injectedAvgMonthlyText = '';
      if (currentYearObj) {
         const numMonths = Object.keys(currentYearObj.months).length;
         const avgMonthlyThisYear = numMonths > 0 ? (currentYearObj as any).totalPureNetSales / numMonths : 0;
         let comparison = '';
         if (monthTotalSales > avgMonthlyThisYear) {
             comparison = `(أعلى من المتوسط السنوي البالغ ${formatNum(avgMonthlyThisYear)} ريال)`;
         } else if (monthTotalSales < avgMonthlyThisYear) {
             comparison = `(أقل من المتوسط السنوي البالغ ${formatNum(avgMonthlyThisYear)} ريال)`;
         } else {
             comparison = '(يساوي المتوسط السنوي)';
         }
         injectedAvgMonthlyText = `\n🔄 مقارنة بالمتوسط: \n   ${comparison}`;
      }

      return `═══════════════════════════════════════
           📊 تقرير المبيعات الشهري
═══════════════════════════════════════

📅 الشهر: ${targetMonthYear}

💰 إجمالي صافي مبيعات الشهر
   ${formatNum(monthTotalSales)} ريال

📈 المتوسط اليومي للمبيعات
   ${formatNum(avgDaily)} ريال بناءً على ${daysCountInMonth} يوم عمل مسجل${injectedAvgMonthlyText}

📊 إجمالي مبيعات السنة حتى الآن (تراكمي)
   ${formatNum(yearTotalSales)} ريال

═══════════════════════════════════════
   تم إنشاء التقرير في: ${timeStr}`;
    }
    else {
      // Yearly
      const yearData = yearlyList.find((y:any) => y.year === targetYear) as any;
      const yearTotalSales = yearData ? yearData.totalPureNetSales : 0;
      
      const uniqueMonths = yearData ? Object.keys(yearData.months).length : 0;
      const avgMonthly = uniqueMonths > 0 ? yearTotalSales / uniqueMonths : 0;

      return `═══════════════════════════════════════
           📊 تقرير المبيعات السنوي
═══════════════════════════════════════

📅 السنة: ${targetYear}

💰 إجمالي صافي مبيعات السنة
   ${formatNum(yearTotalSales)} ريال

📈 المتوسط الشهري للمبيعات
   ${formatNum(avgMonthly)} ريال بناءً على ${uniqueMonths} أشهر مسجلة

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

  const handlePrintSales = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html dir="rtl">
          <head>
            <title>تقرير المبيعات</title>
            <style>
              body { font-family: 'Cairo', system-ui, -apple-system, sans-serif; padding: 40px; margin: 0; line-height: 1.8; color: #1e293b; background: white; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
              .header h2 { margin: 0; color: #0f172a; font-size: 24px; }
              .content { white-space: pre-wrap; font-size: 16px; font-weight: 500; font-family: 'Courier New', Courier, monospace; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
              @media print {
                 body { padding: 0; }
                 .content { border: none; background: transparent; padding: 0; font-size: 14px; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>تقرير المبيعات - الخزينة الذكية</h2>
            </div>
            <div class="content">${reportText}</div>
            <script>
              window.onload = () => { window.print(); window.close(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="print:block print:w-full space-y-6">
      
      {/* Overall Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 font-bold text-sm mb-1">إجمالي صافي المبيعات المسجلة</p>
              <h3 className="text-4xl font-black text-blue-600 font-mono" dir="ltr">
                {formatNum(dailyMetrics.reduce((sum, d) => sum + d.pureNetSales, 0) + (currentState.historicalMonths?.reduce((acc: number, h: any)=>acc+h.netSales,0) || 0))}
              </h3>
            </div>
            <div className="bg-blue-50 p-4 rounded-2xl text-blue-600">
              <TrendingUp size={28} />
            </div>
          </div>
          <p className="text-xs text-slate-400">إجمالي المبيعات الصافية عبر جميع الأيام والشهور التراكمية</p>
        </div>
        
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 font-bold text-sm mb-1">أعلى شهر بالمبيعات</p>
              <h3 className="text-3xl font-black text-emerald-600 font-mono" dir="ltr">
                {(() => {
                  const flattened = yearlyList.flatMap((y: any) => Object.values(y.months)) as any[];
                  if (flattened.length === 0) return '0';
                  const maxMonth = flattened.reduce((max, current) => (max.totalPureNetSales > current.totalPureNetSales) ? max : current, flattened[0]);
                  return `${formatNum(maxMonth.totalPureNetSales)}`;
                })()}
              </h3>
            </div>
            <div className="bg-emerald-50 p-4 rounded-2xl text-emerald-600">
              <BarChart3 size={28} />
            </div>
          </div>
          <p className="text-xs text-slate-400">
             في {(() => {
                  const flattened = yearlyList.flatMap((y: any) => Object.values(y.months)) as any[];
                  if (flattened.length === 0) return '-';
                  const maxMonth = flattened.reduce((max, current) => (max.totalPureNetSales > current.totalPureNetSales) ? max : current, flattened[0]);
                  return `شهر ${maxMonth.monthYear}`;
                })()}
          </p>
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
            
            <div className="flex gap-2 mt-auto">
              <button 
                onClick={handlePrintSales}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-sm hover:shadow-md"
              >
                <Printer size={20} />
                طباعة التقرير
              </button>
              <button 
                onClick={handleCopy}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${copySuccess ? 'bg-emerald-100 text-emerald-700 pointer-events-none' : 'bg-purple-600 text-white hover:bg-purple-700 active:scale-95 shadow-sm hover:shadow-md'}`}
              >
                {copySuccess ? <Check size={20} /> : <Copy size={20} />}
                {copySuccess ? 'تم' : 'WhatsApp'}
              </button>
            </div>
          </div>
          
          <div className="w-full lg:w-2/3 bg-slate-800 text-slate-300 rounded-2xl p-4 md:p-6 relative overflow-hidden font-mono text-sm leading-relaxed whitespace-pre-wrap flex items-center justify-center min-h-[250px]" dir="rtl">
             <div className="relative z-10 w-full text-right">{reportText}</div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold flex flex-col md:flex-row md:items-center justify-between mb-6 text-slate-800 border-b border-slate-100 pb-4 gap-4">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <BarChart3 className="text-blue-600" size={28} /> ملخص الأداء الشهري والسنوي
          </div>
          <div className="flex flex-wrap gap-2">
            <button
               onClick={() => {
                 setExpandedYears(yearlyList.map((y: any) => y.year));
                 setTimeout(() => window.print(), 300);
               }}
               className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-2.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 print:hidden border border-slate-300"
            >
              <Printer size={20} /> طباعة
            </button>
            <button
               onClick={() => setShowHistoryModal(true)}
               className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 print:hidden"
            >
              <PlusCircle size={20} /> إدخال تاريخي
            </button>
            <button 
              onClick={handleAnalyzeSales}
              disabled={aiLoading}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 print:hidden"
            >
              {aiLoading ? (
                <div className="flex items-center gap-2 animate-pulse">جاري تحليل البيانات...</div>
              ) : (
                <>تحليل بواسطة الذكاء الاصطناعي <span className="bg-white/20 px-2 py-0.5 rounded-lg text-xs leading-none">AI</span></>
              )}
            </button>
          </div>
        </h2>

        {aiAnalysis && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="mb-8 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-3xl p-6 md:p-8 shadow-sm"
          >
            <h3 className="font-black text-indigo-900 text-xl mb-6 flex items-center gap-3">
              <Sparkles className="text-purple-600" /> تحليل خبير الذكاء الاصطناعي
            </h3>
            <div className="prose prose-indigo prose-sm sm:prose-base max-w-none 
               prose-headings:text-indigo-900 prose-headings:font-bold prose-h3:text-lg 
               prose-p:leading-relaxed text-slate-700
               prose-table:w-full prose-table:border-collapse prose-table:rounded-xl prose-table:overflow-hidden prose-table:shadow-sm prose-table:my-6
               prose-th:bg-indigo-100 prose-th:text-indigo-900 prose-th:p-3 prose-th:text-right prose-th:border-b-2 prose-th:border-indigo-200
               prose-td:p-3 prose-td:border-b prose-td:border-indigo-50 prose-tr:bg-white
               prose-strong:text-indigo-800" dir="rtl">
              <Markdown remarkPlugins={[remarkGfm]}>{aiAnalysis}</Markdown>
            </div>
            <div className="mt-6 flex justify-end border-t border-indigo-100 pt-4">
               <button onClick={() => setAiAnalysis(null)} className="text-indigo-500 hover:text-indigo-700 font-bold transition-colors text-sm flex items-center gap-2">
                 <X size={16} /> إغلاق التحليل
               </button>
            </div>
          </motion.div>
        )}

        {yearlyList.length > 0 ? (
          <div className="space-y-6">
            {yearlyList.map((yData: any) => (
              <div key={yData.year} className="bg-white/60 backdrop-blur-sm border border-slate-200/80 rounded-[2rem] overflow-hidden transition-all shadow-sm">
                <button 
                  onClick={() => toggleYear(yData.year)}
                  className="w-full bg-white p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors border-b border-slate-100"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-2xl transition-all duration-300 ${expandedYears.includes(yData.year) ? 'rotate-180 bg-slate-100 text-slate-700' : 'bg-blue-50 text-blue-600 shadow-sm'}`}>
                      <ChevronDown size={22} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 text-right">سنة {yData.year}</h3>
                      <p className="text-slate-500 text-sm text-right mt-1">{Object.keys(yData.months).length} أشهر مسجلة</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 self-start md:self-auto">
                    <div className="text-right">
                      <span className="text-xs text-slate-500 font-bold block mb-1">صافي المبيعات الكلي السنة</span>
                      <span className="text-xl font-bold text-blue-600 font-mono" dir="ltr">{formatNum(yData.totalPureNetSales)}</span>
                    </div>
                  </div>
                </button>
                
                <AnimatePresence>
                  {expandedYears.includes(yData.year) && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 pb-2 border-b border-slate-200">
                        <div className="h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={Object.values(yData.months).sort((a: any, b: any) => a.dateObj.getTime() - b.dateObj.getTime())} margin={{ top: 10, right: 30, left: 0, bottom: 0 }} dir="ltr">
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                              <XAxis dataKey="monthYear" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value / 1000}k`} />
                              <RechartsTooltip cursor={{ fill: '#F1F5F9' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                              <Bar dataKey="totalPureNetSales" name="المبيعات" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-slate-100/50">
                        {Object.values(yData.months).sort((a: any, b: any) => a.dateObj.getTime() - b.dateObj.getTime()).map((m: any) => (
                          <div key={m.monthYear} className="bg-white border text-center relative border-slate-200 rounded-2xl hover:shadow-md transition-all overflow-hidden flex flex-col">
                             <div className="p-5 relative flex-1">
                               <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-400"></div>
                               {m.isHistorical && (
                                 <button 
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     if (m.historicalId) {
                                       handleDeleteHistoricalItem(m.historicalId);
                                     } else {
                                       // backward compatibility for old historicalMonths
                                       onUpdate((prevState: any) => ({
                                         ...prevState,
                                         historicalMonths: (prevState.historicalMonths || []).filter((h: any) => h.monthYear !== m.monthYear)
                                       }));
                                     }
                                   }}
                                   className="absolute top-3 left-3 text-rose-400 hover:text-rose-600 border border-slate-100 p-1 rounded-md hover:bg-rose-50"
                                   title="حذف هذه البيانات"
                                 >
                                   <Trash2 size={14} />
                                 </button>
                               )}
                               <h4 className="text-xl font-bold text-slate-700 mb-1 border-b border-slate-100 pb-2">
                                 {m.isHistorical ? (
                                    m.monthYear.startsWith('إجمالي/') ? `إجمالي سنة ${m.monthYear.split('/')[1]}` : (m.monthYear.split('/').length === 3 ? `يوم ${m.monthYear}` : `شهر ${m.monthYear}`)
                                 ) : `شهر ${m.monthYear}`}
                               </h4>
                               <p className="text-xs text-slate-500 mb-4">{m.isHistorical ? 'تم إدخاله يدوياً' : `${m.daysCount} أيام عمل مسجلة`}</p>
                               
                               <div className="flex flex-col gap-1 items-center mb-3">
                                 <span className="text-sm text-slate-500 font-bold">صافي المبيعات</span>
                                 <span className="text-2xl font-black text-blue-700 font-mono" dir="ltr">{formatNum(m.totalPureNetSales)}</span>
                               </div>
                             </div>
                             
                             <div className="pt-3 border-t border-slate-100 bg-slate-50 relative mt-auto p-4 rounded-b-2xl">
                                <div className="flex justify-between items-center text-xs px-1">
                                  <span className="text-slate-500 font-bold">المتوسط اليومي</span>
                                  <span className="font-bold text-slate-700 font-mono" dir="ltr">{formatNum(m.daysCount > 0 ? m.totalPureNetSales / m.daysCount : 0)}</span>
                                </div>
                             </div>

                             {/* Toggle days visibility button */}
                             {(!m.isHistorical || m.monthYear.split('/').length < 3) && (
                                <button 
                                  onClick={() => toggleMonth(m.monthYear)}
                                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs flex justify-center items-center gap-2 border-t border-slate-200 transition-colors"
                                >
                                  {expandedMonths.includes(m.monthYear) ? (
                                    <>إخفاء الأيام <ChevronDown size={14} className="rotate-180" /></>
                                  ) : (
                                    <>عرض الأيام <ChevronDown size={14} /></>
                                  )}
                                </button>
                             )}

                             {/* Days Breakdown Table */}
                             <AnimatePresence>
                               {expandedMonths.includes(m.monthYear) && (!m.isHistorical || m.monthYear.split('/').length < 3) && (
                                 <motion.div
                                   initial={{ height: 0, opacity: 0 }}
                                   animate={{ height: 'auto', opacity: 1 }}
                                   exit={{ height: 0, opacity: 0 }}
                                   className="overflow-hidden bg-white border-t border-slate-200 text-right"
                                 >
                                   <div className="overflow-y-auto max-h-48 text-xs">
                                     <table className="w-full border-collapse">
                                       <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                                         <tr>
                                           <th className="py-2 px-3 font-bold text-slate-600">التاريخ</th>
                                           <th className="py-2 px-3 font-bold text-slate-600 border-r border-slate-200 text-center">المبيعات</th>
                                           <th className="py-2 px-3 w-10 text-center border-r border-slate-200"></th>
                                         </tr>
                                       </thead>
                                       <tbody>
                                          {dailyMetrics.filter((d: any) => d.monthYear === m.monthYear).map((day: any) => (
                                            <tr key={day.dateStr} className={`border-b border-slate-100 hover:bg-blue-50/50 ${day.isCurrent ? 'bg-blue-50/30' : ''}`}>
                                               <td className="py-2 px-3 font-mono text-slate-700">{day.dateName}</td>
                                               <td className="py-2 px-3 font-mono font-bold text-blue-700 border-r border-slate-100 text-center" dir="ltr">{formatNum(day.pureNetSales)}</td>
                                               <td className="py-1 px-1 border-r border-slate-100 text-center">
                                                 {day.isHistoricalDay ? (
                                                   <button
                                                     onClick={(e) => {
                                                       e.stopPropagation();
                                                       handleDeleteHistoricalItem(day.historicalId);
                                                     }}
                                                     className="text-rose-400 hover:text-rose-600 p-1"
                                                     title="حذف"
                                                   ><Trash2 size={12} /></button>
                                                 ) : (
                                                    <span className="text-slate-300 text-[10px]" title="مسجل بالنظام">--</span>
                                                 )}
                                               </td>
                                            </tr>
                                          ))}
                                          {dailyMetrics.filter((d: any) => d.monthYear === m.monthYear).length === 0 && (
                                            <tr>
                                              <td colSpan={3} className="py-3 text-center text-slate-400">لا توجد تفاصيل يومية</td>
                                            </tr>
                                          )}
                                       </tbody>
                                     </table>
                                   </div>
                                 </motion.div>
                               )}
                             </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-6">لا توجد بيانات كافية لعرض التقرير</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 print:break-inside-avoid">
        <h2 className="text-2xl font-bold flex items-center gap-3 mb-8 text-slate-800">
          <TrendingUp className="text-blue-600" size={28} /> حركة المبيعات الصافية اليومية
        </h2>
        
        {dailyMetrics.length >= 2 ? (
          <div className="h-[400px] w-full mb-8" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                <XAxis dataKey="dateName" tick={{ fill: '#64748b', fontSize: 13, fontFamily: 'monospace' }} tickMargin={10} />
                <YAxis tick={{ fill: '#64748b', fontSize: 13, fontFamily: 'monospace' }} tickFormatter={(val) => Math.floor(val).toLocaleString()} width={80} />
                <RechartsTooltip 
                  formatter={(value: number, name: string) => [formatNum(value), 'صافي المبيعات']}
                  labelFormatter={(label) => `التاريخ: ${label}`}
                  contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', fontFamily: 'Cairo', textAlign: 'right', padding: '12px 16px' }}
                />
                <Legend wrapperStyle={{ fontFamily: 'Cairo', paddingTop: '20px' }} formatter={() => 'صافي المبيعات'} />
                <Line type="monotone" dataKey="pureNetSales" name="pureNetSales" stroke="#3b82f6" strokeWidth={4} dot={{ r: 5, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-slate-500 text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-300 font-medium">نحتاج إلى تسجيل يومين على الأقل لرسم مخطط المقارنة البياني للمبيعات.</p>
        )}

        <div className="overflow-x-auto print:mt-8">
          <table className="w-full text-right text-base border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-200 text-slate-700">
                <th className="py-4 px-6 font-bold w-1/3">التاريخ</th>
                <th className="py-4 px-6 font-bold text-center text-blue-700">صافي المبيعات</th>
              </tr>
            </thead>
            <tbody>
              {dailyMetrics.map((day: any) => (
                <tr key={day.dateStr} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${day.isCurrent ? 'bg-blue-50/40 hover:bg-blue-50/60' : ''}`}>
                  <td className="py-4 px-6 font-bold text-slate-700 flex items-center gap-3 border-l border-slate-100">
                    <span className="font-mono text-sm">{day.dateStr}</span>
                    {day.isCurrent && <span className="bg-blue-600 text-white px-2 py-0.5 rounded-md text-xs">اليوم (جاري)</span>}
                  </td>
                  <td className="py-4 px-6 font-black text-center text-blue-800 font-mono text-lg bg-blue-50/20" dir="ltr">{formatNum(day.pureNetSales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showHistoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm print:hidden"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-200"
            >
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-lg text-slate-800">إدخال مبيعات تاريخية سابقة</h3>
                <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-slate-600 bg-white shadow-sm p-1.5 rounded-xl border border-slate-200"><X size={20} /></button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                   <label className="block text-sm font-bold text-slate-700 mb-2">نوع الإدخال</label>
                   <select 
                      value={histType} onChange={(e) => setHistType(e.target.value)} 
                      className="w-full bg-slate-50 hover:bg-white border text-center text-slate-700 border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-[3px] focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold" 
                   >
                     <option value="year">تجميع على مستوى السنة</option>
                     <option value="month">تجميع على مستوى الشهر</option>
                     <option value="day">يوم محدد</option>
                   </select>
                </div>
                
                {histType === 'year' && (
                  <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">السنة</label>
                      <input 
                        type="number" min="2000" max="2100" placeholder="مثال: 2025" 
                        value={histYear} onChange={(e) => setHistYear(e.target.value)} 
                        className="w-full bg-slate-50 hover:bg-white border text-center text-slate-700 border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-[3px] focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono" 
                      />
                  </div>
                )}
                
                {histType === 'month' && (
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">الشهر رقم</label>
                        <input 
                          type="number" min="1" max="12" placeholder="مثال: 1" 
                          value={histMonth} onChange={(e) => setHistMonth(e.target.value)} 
                          className="w-full bg-slate-50 hover:bg-white border text-center text-slate-700 border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-[3px] focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono" 
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">السنة</label>
                        <input 
                          type="number" min="2000" max="2100" placeholder="مثال: 2025" 
                          value={histYear} onChange={(e) => setHistYear(e.target.value)} 
                          className="w-full bg-slate-50 hover:bg-white border text-center text-slate-700 border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-[3px] focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono" 
                        />
                     </div>
                  </div>
                )}
                
                {histType === 'day' && (
                  <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">التاريخ</label>
                      <input 
                        type="date"
                        value={histDayDate} onChange={(e) => setHistDayDate(e.target.value)} 
                        className="w-full bg-slate-50 hover:bg-white border text-center text-slate-700 border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-[3px] focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono" 
                      />
                  </div>
                )}

                <div>
                   <label className="block text-sm font-bold text-slate-700 mb-2">المبيعات الصافية</label>
                   <input 
                      type="number" placeholder="مثال: 120000" 
                      value={histSales} onChange={(e) => setHistSales(e.target.value)} 
                      className="w-full bg-slate-50 hover:bg-white border text-left text-slate-700 border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-[3px] focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-lg" 
                   />
                </div>
              </div>
              
              <div className="p-5 border-t border-slate-100 bg-slate-50">
                <button 
                  onClick={handleAddHistoricalMonth}
                  className="w-full py-3 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                >
                  <Plus size={20} /> إضافة للسجل
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
      className={`w-full bg-slate-50 hover:bg-slate-100/50 border text-slate-800 border-slate-200/80 rounded-xl px-4 py-3 outline-none focus:ring-[3px] focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all text-sm placeholder-slate-400 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] ${type === 'number' ? '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : ''} ${className}`}
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
                className="group-hover/row:border-blue-200/60 rounded-xl"
              />
            </div>
            <div className="w-1/3">
              <Input type="number" value={item.amount !== undefined && item.amount !== 0 ? round2(item.amount) : item.amount === 0 ? 0 : ''} onChange={(e: any) => onUpdate(item.id, 'amount', e.target.value === '' ? '' : Number(e.target.value))} placeholder="المبلغ" className="text-left font-bold group-hover/row:border-blue-200/60 rounded-xl" dir="ltr" />
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
  const [activeTab, setActiveTab] = useState<'sales' | 'payments' | 'pending' | 'cash' | 'archive' | 'history' | 'ledger' | 'analytics' | 'settings' | 'admin'>('sales');
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

  // UI Scale State
  const [uiScale, setUiScale] = useState<number>(() => {
    return Number(localStorage.getItem('smart_safe_ui_scale') || 1);
  });
  
  const [thermalMargins, setThermalMargins] = useState<{ right: number, left: number }>(() => {
    try {
      const stored = localStorage.getItem('smart_safe_thermal_margins');
      return stored ? JSON.parse(stored) : { right: 24, left: 24 };
    } catch {
      return { right: 24, left: 24 };
    }
  });

  useEffect(() => {
    localStorage.setItem('smart_safe_ui_scale', uiScale.toString());
  }, [uiScale]);

  useEffect(() => {
    localStorage.setItem('smart_safe_thermal_margins', JSON.stringify(thermalMargins));
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

  const [printView, setPrintView] = useState<'none' | 'daily' | 'daily_thermal' | 'pending' | 'pos' | 'pos_thermal' | 'history' | 'history_thermal'>('none');
  const [activePrintPosId, setActivePrintPosId] = useState<string | null>(null);
  const [printSnapshot, setPrintSnapshot] = useState<{state: AppState, summary: ReturnType<typeof getSummary>} | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintView('none');
      setIsExporting(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const handleExport = (format: 'a4' | 'thermal' = 'a4') => {
    setIsExporting(true);
    setShowExportModal(false);
    
    if (exportMode === 'summary') {
      setPrintView(format === 'thermal' ? 'daily_thermal' : 'daily');
    } else {
      setPrintView('none');
    }
    
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const handlePrintPos = (posId: string, format: 'a4' | 'thermal' = 'a4') => {
    setActivePrintPosId(posId);
    setPrintView(format === 'thermal' ? 'pos_thermal' : 'pos');
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
    setPrintView(format === 'thermal' ? 'history_thermal' : 'history');
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
    <div className={`min-h-screen bg-[#f4f7fa] text-slate-800 font-sans selection:bg-blue-200 selection:text-blue-900 ${printView !== 'none' ? 'print:bg-white' : ''}`} dir="rtl" style={{ zoom: uiScale }}>
      <div className={printView !== 'none' ? 'print:hidden' : ''}>
        <div className="sticky top-0 z-50 bg-white/70 backdrop-blur-2xl border-b border-white/50 shadow-[0_4px_30px_rgba(0,0,0,0.03)] print:hidden transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-[4.5rem]">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-2.5 rounded-[14px] shadow-lg shadow-blue-600/30 ring-1 ring-white/20"><Calculator size={22} className="drop-shadow-sm" /></div>
              <h1 className="font-extrabold text-2xl text-slate-800 tracking-tight">الخزينة الذكية</h1>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              {!user ? (
                <button onClick={() => setShowAuthModal(true)} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2.5 rounded-xl hover:from-blue-500 hover:to-indigo-500 transition-all font-bold shadow-lg shadow-blue-500/20 active:scale-95">
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
                        className="bg-white/50 border border-slate-200/60 text-slate-700 text-sm rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white block w-full px-4 py-2.5 outline-none font-bold hover:bg-white transition-all cursor-pointer shadow-sm"
                      >
                        <option value="">-- اختر الفرع --</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="hidden md:flex items-center gap-2 text-sm text-slate-600 bg-white/60 backdrop-blur-sm px-4 py-2.5 rounded-xl border border-slate-200/60 font-medium shadow-sm">
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    <span className="font-mono">{user.email?.split('@')[0]}</span>
                  </div>
                  <button onClick={() => setShowCalculator(true)} className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all active:scale-90 ${showCalculator ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'}`} title="آلة حاسبة">
                    <Calculator size={20} />
                  </button>
                  <button onClick={() => setShowSettingsModal(true)} className="flex items-center justify-center text-slate-500 hover:text-blue-600 w-10 h-10 rounded-xl hover:bg-blue-50 transition-all active:scale-90" title="إعدادات">
                    <Settings size={20} />
                  </button>
                  <button onClick={handleLogout} className="flex items-center justify-center text-slate-500 hover:text-rose-600 w-10 h-10 rounded-xl hover:bg-rose-50 transition-all active:scale-90" title="تسجيل الخروج">
                    <LogOut size={20} />
                  </button>
                  <div className="w-px h-8 bg-slate-200/80 mx-1 hidden sm:block"></div>
                  <button onClick={handleSave} disabled={saving} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all font-bold shadow-sm disabled:opacity-50 hover:shadow-md active:scale-95 ${saving ? 'bg-amber-100 text-amber-700 border border-amber-200/60' : 'bg-emerald-50/80 text-emerald-700 border border-emerald-200/60 hover:bg-emerald-100'}`}>
                    {saving ? <Save size={18} className="animate-pulse" /> : <CheckCircle2 size={18} />}
                    <span className="hidden sm:inline">{saving ? 'جاري الحفظ...' : 'صافي وحفظ'}</span>
                  </button>
                </>
              )}
              <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200/80 px-5 py-2.5 rounded-xl hover:bg-slate-50 transition-all font-bold shadow-sm hover:shadow-md active:scale-95">
                <Download size={18} /> <span className="hidden sm:inline">تصدير</span>
              </button>
              <button onClick={handleNewDay} className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-sm hover:shadow-md active:scale-95 shadow-indigo-600/20 ring-1 ring-indigo-500/50">
                <FilePlus size={18} /> <span className="hidden sm:inline">يوم جديد</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="export-container" className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${isExporting ? 'bg-white' : ''}`}>
        {isExporting && (
          <div className="text-center mb-8 pb-4 border-b border-slate-200/80">
            <h1 className="text-2xl font-bold text-slate-900">الخزينة الذكية - تقرير التسوية</h1>
            <p className="text-slate-500 mt-2">تاريخ: {state.date}</p>
            <p className="text-slate-500">نوع التقرير: {exportMode === 'detailed' ? 'مفصل' : 'ملخص'}</p>
          </div>
        )}

        {(!isExporting || exportMode === 'detailed') && (
          <div className="bg-white/90 backdrop-blur-md p-5 rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 mb-8 flex flex-wrap gap-8 items-center print:hidden">
            <div className="flex items-center gap-3">
              <label className="font-semibold text-slate-600">تاريخ اليوم:</label>
              <Input value={state.date} onChange={(e: any) => updateField('date', e.target.value)} className="w-44 text-center font-bold text-lg" />
            </div>
            <div className="w-px h-8 bg-slate-200/80 hidden sm:block"></div>
            <div className="flex items-center gap-3">
              <label className="font-semibold text-slate-600">رصيد أول المدة:</label>
              <Input type="number" value={state.previousBalance !== undefined ? Math.round(state.previousBalance * 100) / 100 : ''} onChange={(e: any) => updateField('previousBalance', Number(e.target.value))} className="w-44 text-left font-bold text-blue-700 bg-blue-50/50 hover:bg-blue-50 border-blue-200/80 text-lg focus:ring-blue-500/20" dir="ltr" />
            </div>
          </div>
        )}

        <div className={`flex flex-col lg:flex-row gap-8 ${isExporting && exportMode === 'summary' ? 'justify-center' : ''}`}>
          {(!isExporting || exportMode === 'detailed') && (
            <div className="flex-1 min-w-0 print:w-full">
              {!isExporting && (
                <div className="flex overflow-x-auto gap-3 mb-8 pb-3 print:hidden scrollbar-hide">
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
                      className={`relative flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all whitespace-nowrap transform hover:scale-[1.02] active:scale-95 border ${
                        activeTab === tab.id ? 'text-white border-transparent shadow-[0_8px_16px_-6px_rgba(37,99,235,0.4)]' : 'bg-white text-slate-600 border-slate-200/80 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300'
                      }`}
                    >
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="activeTabIndicator"
                          className="absolute inset-0 bg-blue-600 rounded-2xl"
                          style={{ zIndex: 0 }}
                          transition={{ type: "spring", stiffness: 350, damping: 25 }}
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
                <div className="bg-white/95 backdrop-blur-2xl rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 overflow-hidden mb-6">
                  <div className="bg-emerald-50 text-emerald-800 p-4 border-b border-emerald-100 flex items-center gap-2 font-bold">
                    <Receipt size={20} /> مبيعات نقاط البيع
                  </div>
                  <datalist id="list-posData">
                    {(state.savedNames.posData || []).map(name => <option key={name} value={name} />)}
                  </datalist>
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-sm text-right">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-200">
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
                        {state.posData.map((pos, index) => {
                          const net = pos.sales - pos.returns;
                          const posNetworksTotal = sumNetworks(pos.networks);
                          return (
                            <tr key={pos.id} className="border-b border-slate-100 last:border-0 relative group">
                              <td className="py-2 pr-2">
                                <Input 
                                  value={pos.name} 
                                  list="list-posData"
                                  onChange={(e: any) => {
                                    const newData = [...state.posData];
                                    newData[index].name = e.target.value;
                                    updateField('posData', newData);
                                  }} 
                                  onBlur={(e: any) => addSavedName('posData', e.target.value)}
                                  className="bg-transparent border-transparent shadow-none hover:bg-slate-50 focus:bg-white focus:border-blue-200 transition-colors rounded-xl"
                                />
                              </td>
                              <td className="py-2 px-1"><Input type="number" value={pos.sales !== undefined ? round2(pos.sales) : ''} onChange={(e: any) => {
                                  const newData = [...state.posData];
                                  newData[index].sales = Number(e.target.value);
                                  updateField('posData', newData);
                                }} dir="ltr" className="text-left bg-transparent border-transparent shadow-none hover:bg-slate-50 focus:bg-white focus:border-blue-200 transition-colors rounded-xl" /></td>
                              <td className="py-2 px-1"><Input type="number" value={pos.returns !== undefined ? round2(pos.returns) : ''} onChange={(e: any) => {
                                  const newData = [...state.posData];
                                  newData[index].returns = Number(e.target.value);
                                  updateField('posData', newData);
                                }} dir="ltr" className="text-left text-rose-600 bg-transparent border-transparent shadow-none hover:bg-rose-50 focus:bg-white focus:border-rose-200 transition-colors rounded-xl" /></td>
                              <td className="py-2 px-2 text-left font-bold text-emerald-600" dir="ltr">{formatNum(net)}</td>
                              <td className="py-2 px-1">
                                <button 
                                  onClick={() => setActiveNetworkPosId(pos.id)}
                                  className="w-full bg-slate-50/70 border border-slate-200/60 rounded-xl px-3 py-2 text-left hover:bg-amber-50 hover:border-amber-300 transition-colors text-amber-700 font-medium flex justify-between items-center"
                                  dir="ltr"
                                >
                                  <span>{formatNum(posNetworksTotal)}</span>
                                  <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-lg">
                                    {pos.networks.length} مبالغ
                                  </span>
                                </button>
                              </td>
                              <td className="py-2 px-1">
                                <Input type="number" value={pos.physicalCash !== undefined ? round2(pos.physicalCash) : ''} placeholder="" onChange={(e: any) => {
                                  const newData = [...state.posData];
                                  newData[index].physicalCash = e.target.value === '' ? undefined : Number(e.target.value);
                                  updateField('posData', newData);
                                }} dir="ltr" className="text-left font-bold text-blue-700 pointer-events-auto bg-transparent border-transparent shadow-none hover:bg-slate-50 focus:bg-white focus:border-blue-200 transition-colors rounded-xl font-mono text-lg tracking-tight" />
                              </td>
                              <td className="py-2 pl-2 flex justify-center items-center gap-1.5 print:hidden h-full mt-2">
                                <button 
                                  onClick={() => {
                                    const newData = [...state.posData];
                                    newData[index].isPinned = !newData[index].isPinned;
                                    updateField('posData', newData);
                                  }} 
                                  title="تثبيت النقطة لليوم التالي"
                                  className={`p-2 rounded-xl transition-all ${pos.isPinned ? 'text-blue-600 bg-blue-50 border-blue-200 shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                                >
                                  <Pin size={18} className={pos.isPinned ? "fill-current" : ""} />
                                </button>
                                <button 
                                  onClick={() => updateField('posData', state.posData.filter(p => p.id !== pos.id))} 
                                  className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition-all ml-1" title="إزالة النقطة"
                                >
                                  <Trash2 size={18} />
                                </button>
                                  <div className="flex bg-slate-50 text-slate-600 hover:text-blue-700 hover:bg-blue-50 hover:border-blue-200 transition-all rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                                    <button onClick={() => handlePrintPos(pos.id, 'a4')} className="hover:bg-slate-200 hover:text-blue-700 p-1.5 px-2 text-xs font-bold transition-colors border-l border-slate-200" title="طباعة A4">A4</button>
                                    <button onClick={() => handlePrintPos(pos.id, 'thermal')} className="hover:bg-slate-200 hover:text-blue-700 p-1.5 px-2 text-[11px] font-bold transition-colors flex items-center" title="طباعة إيصال حراري">إيصال</button>
                                  </div>
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
                    <button onClick={() => updateField('posData', [...state.posData, { id: generateId(), name: '', sales: 0, returns: 0, networks: [] }])} className="mt-4 flex items-center gap-2 bg-blue-50 text-blue-700 hover:text-blue-800 hover:bg-blue-100 text-sm font-bold px-4 py-2.5 rounded-xl border border-blue-100 shadow-sm transition-all active:scale-95">
                      <Plus size={16} /> إضافة نقطة بيع جديدة
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
                <div className="bg-white/95 backdrop-blur-2xl rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 overflow-hidden mb-6">
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
                <div className="bg-white/95 backdrop-blur-2xl rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 overflow-hidden mb-6">
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

                      <div className="bg-white rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 overflow-hidden mb-6">
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
                <div className="bg-white/95 backdrop-blur-2xl rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-slate-200/60 overflow-hidden mb-6">
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
                <AnalyticsView history={history} currentState={state} formatNum={formatNum} onUpdate={setState} />
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
              
              <div className="flex gap-2 w-full mt-4">
                <button 
                  onClick={() => handleExport('a4')}
                  disabled={isExporting}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
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
                    className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Printer size={20} /> حراري
                  </button>
                )}
              </div>
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
                <div className="flex bg-blue-50 text-blue-600 rounded-lg overflow-hidden border border-blue-200">
                  <button onClick={() => { setViewSnapshot(null); handlePrintHistory(viewSnapshot, 'a4'); }} className="hover:bg-blue-100 px-3 py-1.5 text-sm font-bold transition-colors border-l border-blue-200 flex items-center gap-1" title="طباعة A4"><Printer size={16} /> A4</button>
                  <button onClick={() => { setViewSnapshot(null); handlePrintHistory(viewSnapshot, 'thermal'); }} className="hover:bg-blue-100 px-3 py-1.5 text-sm font-bold transition-colors" title="طباعة حراري">حراري</button>
                </div>
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

      {/* Settings Page (Full Screen Android Style) */}
      <AnimatePresence>
      {showSettingsModal && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 z-[100] bg-[#f2f2f7] overflow-y-auto print:hidden" dir="rtl">
          {/* Android-like App Bar */}
          <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200/60 px-2 py-3 flex items-center gap-2 shadow-sm">
            <button onClick={() => setShowSettingsModal(false)} className="p-3 hover:bg-black/5 active:bg-black/10 rounded-full transition-colors">
              <ArrowRight size={24} className="text-gray-800" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 flex-1">الإعدادات</h2>
          </div>
          
          <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-8 pb-12">

            {/* UI Preferences */}
            <section>
              <div className="px-4 mb-2 flex items-center gap-2">
                <Settings size={18} className="text-blue-600" />
                <h3 className="font-bold text-gray-600 text-sm tracking-wide">تفضيلات الواجهة</h3>
              </div>
              <div className="bg-white rounded-3xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-gray-900 text-base">حجم الخط (تكبير/تصغير)</h4>
                  <p className="text-gray-500 text-sm mt-1">التحكم في حجم الخط والواجهة في جميع أنحاء التطبيق.</p>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-200">
                  <button onClick={() => setUiScale(Math.min(uiScale + 0.1, 1.5))} className="p-2 hover:bg-white rounded-xl shadow-sm text-gray-700 transition" title="تكبير">+</button>
                  <span className="font-bold w-12 text-center text-blue-700 dir-ltr">{Math.round(uiScale * 100)}%</span>
                  <button onClick={() => setUiScale(Math.max(uiScale - 0.1, 0.7))} className="p-2 hover:bg-white rounded-xl shadow-sm text-gray-700 transition" title="تصغير">-</button>
                  <button onClick={() => setUiScale(1)} className="p-2 hover:bg-zinc-200 bg-zinc-100 rounded-xl shadow-sm text-xs font-bold mr-1 transition" title="افتراضي">افتراضي</button>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4">
                <div>
                  <h4 className="font-bold text-gray-900 text-base">هوامش الطباعة الحرارية (يمين/يسار)</h4>
                  <p className="text-gray-500 text-sm mt-1">تحديد هوامش الإيصال الحراري لتصحيح العرض التلقائي.</p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-200">
                    <span className="text-sm font-semibold px-2 text-slate-500">اليمين:</span>
                    <button onClick={() => setThermalMargins(p => ({...p, right: p.right + 2}))} className="p-1.5 hover:bg-white rounded-lg shadow-sm text-gray-700 transition">+</button>
                    <span className="font-bold w-8 text-center text-blue-700">{thermalMargins.right}</span>
                    <button onClick={() => setThermalMargins(p => ({...p, right: Math.max(0, p.right - 2)}))} className="p-1.5 hover:bg-white rounded-lg shadow-sm text-gray-700 transition">-</button>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-200">
                    <span className="text-sm font-semibold px-2 text-slate-500">اليسار:</span>
                    <button onClick={() => setThermalMargins(p => ({...p, left: p.left + 2}))} className="p-1.5 hover:bg-white rounded-lg shadow-sm text-gray-700 transition">+</button>
                    <span className="font-bold w-8 text-center text-blue-700">{thermalMargins.left}</span>
                    <button onClick={() => setThermalMargins(p => ({...p, left: Math.max(0, p.left - 2)}))} className="p-1.5 hover:bg-white rounded-lg shadow-sm text-gray-700 transition">-</button>
                  </div>
                </div>
              </div>
            </section>
            
            {/* Lists Management */}
            <section>
              <div className="px-4 mb-2 flex items-center gap-2">
                <BookOpen size={18} className="text-blue-600" />
                <h3 className="font-bold text-gray-600 text-sm tracking-wide">إدارة القوائم المنسدلة (الحفظ التلقائي)</h3>
              </div>
              <div className="bg-white rounded-3xl overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-gray-100">
                  {Object.entries({
                    expenseRefunds: 'مردود المصروفات',
                    expenses: 'المصروفات المتنوعة',
                    companyPayments: 'سداد الشركات والموردين',
                    customerTransfers: 'تحويلات العملاء',
                    pendingFundsOwedToUs: 'أموال معلقة لنا (سلف/عهد)',
                    pendingFundsOwedByUs: 'أموال معلقة علينا (لعملاء)',
                    cashDeposits: 'الإيداعات البنكية',
                    customCashAmounts: 'المبالغ النقدية المجمعة',
                    posData: 'نقاط البيع',
                  }).map(([fieldKey, label], index) => (
                    <div key={fieldKey} className={`p-5 ${index % 2 !== 0 ? '' : ''} hover:bg-gray-50/50 transition-colors`}>
                      <h3 className="font-bold text-gray-800 mb-3 text-base flex justify-between items-center">
                        {label}
                        <span className="text-xs font-normal bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{(state.savedNames[fieldKey as keyof typeof state.savedNames] || []).length}</span>
                      </h3>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {(state.savedNames[fieldKey as keyof typeof state.savedNames] || []).map(name => (
                          <span key={name} className="bg-white group text-gray-700 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 border border-gray-200 shadow-sm">
                            {name}
                            <button onClick={() => removeSavedName(fieldKey as any, name)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-md transition-colors"><Trash2 size={14} /></button>
                          </span>
                        ))}
                      </div>
                      <AddNameInput onAdd={(name) => addSavedName(fieldKey as any, name)} />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* System Actions (Backup / Restore) */}
            <section>
              <div className="px-4 mb-2 flex items-center gap-2">
                <Database size={18} className="text-blue-600" />
                <h3 className="font-bold text-gray-600 text-sm tracking-wide">النسخ الاحتياطي للأجهزة السحابية</h3>
              </div>
              <div className="bg-white rounded-3xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-gray-900 text-base">حفظ واستعادة البيانات</h4>
                  <p className="text-gray-500 text-sm mt-1">يمكنك تصدير نسخة احتياطية من بيانات التطبيق أو استعادتها. مفيد عند مسح بيانات المتصفح.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => {
                      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ state, history }, null, 2));
                      const downloadAnchorNode = document.createElement('a');
                      downloadAnchorNode.setAttribute("href", dataStr);
                      downloadAnchorNode.setAttribute("download", `khazna_backup_${new Date().toISOString().split('T')[0]}.json`);
                      document.body.appendChild(downloadAnchorNode);
                      downloadAnchorNode.click();
                      downloadAnchorNode.remove();
                      showToast("تم تنزيل النسخة الاحتياطية بنجاح", "success");
                    }} 
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl font-bold transition-colors"
                  >
                    <Download size={18} /> تصدير نسخة
                  </button>
                  <label className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-colors cursor-pointer">
                    <Database size={18} /> استعادة نسخة
                    <input 
                      type="file" 
                      accept=".json" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            try {
                              const result = JSON.parse(event.target?.result as string);
                              if (result.state && result.history) {
                                if (window.confirm('هل أنت متأكد من استعادة هذه النسخة؟ سيتم استبدال جميع البيانات الحالية.')) {
                                  setState(result.state);
                                  setHistory(result.history);
                                  showToast('تمت استعادة البيانات بنجاح', 'success');
                                  setShowSettingsModal(false);
                                }
                              } else {
                                showToast('ملف النسخة الاحتياطية غير صالح', 'error');
                              }
                            } catch (err) {
                              showToast('حدث خطأ أثناء قراءة الملف', 'error');
                            }
                          };
                          reader.readAsText(file);
                        }
                      }} 
                    />
                  </label>
                  <button 
                    onClick={() => {
                      if (window.confirm("تحذير ⚠️: سيتم حذف جميع البيانات والتقارير بشكل نهائي! هل أنت متأكد من مسح كافة بيانات التطبيق واسترجاع الحالة الافتراضية؟")) {
                        setState(getInitialState());
                        setHistory([]);
                        showToast("تم مسح كافة البيانات بنجاح", "success");
                        setShowSettingsModal(false);
                      }
                    }} 
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl font-bold transition-colors mt-4 sm:mt-0"
                  >
                    <Trash2 size={18} /> مسح كل البيانات
                  </button>
                </div>
              </div>
            </section>

            {/* Admin Panel */}
            {userProfile?.role === 'admin' && (
              <section>
                <div className="px-4 mb-2 flex items-center gap-2">
                  <Database size={18} className="text-amber-600" />
                  <h3 className="font-bold text-gray-600 text-sm tracking-wide">إدارة النظام المركزية</h3>
                </div>

                {/* Branches Settings */}
                <div className="bg-white rounded-3xl overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100 mb-6">
                  <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                    <div>
                      <h4 className="font-bold text-gray-900 text-lg">الفروع</h4>
                      <p className="text-gray-500 text-sm mt-1">التحكم في منافذ وفروع المنشأة</p>
                    </div>
                    <button onClick={() => { setShowSettingsModal(false); setShowAddBranchModal(true); }} className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2.5 rounded-xl text-sm font-bold transition-transform active:scale-95 flex items-center gap-2 shadow-sm">
                      <Plus size={18} /> إضافة فرع
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                      <thead className="bg-gray-50 text-gray-600 border-b border-gray-100">
                        <tr>
                          <th className="p-4 font-semibold">اسم الفرع</th>
                          <th className="p-4 w-40 text-center font-semibold">إجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {branches.map(b => (
                          <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="p-4">
                              <Input value={b.name} onChange={(e: any) => {
                                const newBranches = [...branches];
                                const idx = newBranches.findIndex(x => x.id === b.id);
                                if (idx > -1) { newBranches[idx].name = e.target.value; setBranches(newBranches); }
                              }} onBlur={(e: any) => handleUpdateBranch(b.id, e.target.value)} className="w-full max-w-sm bg-transparent border-gray-200 focus:bg-white" />
                            </td>
                            <td className="p-4 text-center">
                              <button onClick={() => handleDeleteBranch(b.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2.5 rounded-xl transition-colors" title="حذف الفرع">
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {branches.length === 0 && <tr><td colSpan={2} className="text-center p-8 text-gray-500 font-medium">لا توجد فروع مسجلة</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Users Settings */}
                <div className="bg-white rounded-3xl overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100">
                  <div className="p-5 border-b border-gray-100 bg-gray-50/30">
                    <h4 className="font-bold text-gray-900 text-lg">المستخدمون النشطون</h4>
                    <p className="text-gray-500 text-sm mt-1">صلاحيات التحكم والدخول للمنصة</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right">
                      <thead className="bg-gray-50 text-gray-600 border-b border-gray-100 text-sm">
                        <tr>
                          <th className="p-4 font-semibold">البريد الإلكتروني</th>
                          <th className="p-4 font-semibold">تحديد الدور</th>
                          <th className="p-4 font-semibold">تعيين الفرع</th>
                          <th className="p-4 font-semibold">حالة الحساب</th>
                          <th className="p-4 font-semibold text-left">تاريخ الانضمام</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                        {adminUsers.map(u => (
                          <tr key={u.uid} className="hover:bg-gray-50/50 transition-colors">
                            <td className="p-4 font-bold text-gray-800">{u.email}</td>
                            <td className="p-4">
                              <select value={u.role} onChange={(e) => handleUpdateUser(u.uid, { role: e.target.value as UserRole })} className="cursor-pointer border border-gray-200 rounded-xl px-3 py-2 bg-white outline-none w-full max-w-[150px] shadow-sm hover:border-gray-300 transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                                <option value="cashier">كاشير (إدخال)</option>
                                <option value="manager">مدير (تقفيل)</option>
                                <option value="admin">أدمن (كامل)</option>
                              </select>
                            </td>
                            <td className="p-4">
                              <select value={u.branchId || ''} onChange={(e) => handleUpdateUser(u.uid, { branchId: e.target.value || null })} className="cursor-pointer border border-gray-200 rounded-xl px-3 py-2 bg-white outline-none w-full max-w-[150px] shadow-sm hover:border-gray-300 transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                                <option value="">-- بلا فرع --</option>
                                {branches.map(b => (
                                  <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-4">
                              <select value={u.status} onChange={(e) => handleUpdateUser(u.uid, { status: e.target.value as UserStatus })} className={`cursor-pointer border rounded-xl px-3 py-2 outline-none font-bold shadow-sm transition-colors w-full max-w-[150px] focus:ring-2 ${u.status === 'active' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:border-emerald-300 focus:ring-emerald-100' : u.status === 'pending' ? 'bg-amber-50 text-amber-800 border-amber-200 hover:border-amber-300 focus:ring-amber-100' : 'bg-rose-50 text-rose-800 border-rose-200 hover:border-rose-300 focus:ring-rose-100'}`}>
                                <option value="pending">قيد الانتظار</option>
                                <option value="active">حساب نشط</option>
                                <option value="suspended">موقوف/مجمد</option>
                              </select>
                            </td>
                            <td className="p-4 text-gray-500 font-mono text-left" dir="ltr">{new Date(u.createdAt).toLocaleDateString('en-GB')}</td>
                          </tr>
                        ))}
                        {adminUsers.length === 0 && <tr><td colSpan={5} className="text-center p-8 text-gray-500 font-medium">لم يتم تسجيل أي مستخدم</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

              </section>
            )}

          </div>
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
      {printView === 'daily_thermal' && <DailyPrintView state={state} summary={currentSummary} formatNum={formatNum} printFormat="thermal" thermalMargins={thermalMargins} />}
      {printView === 'history' && printSnapshot && <DailyPrintView state={printSnapshot.state} summary={printSnapshot.summary} formatNum={formatNum} />}
      {printView === 'history_thermal' && printSnapshot && <DailyPrintView state={printSnapshot.state} summary={printSnapshot.summary} formatNum={formatNum} printFormat="thermal" thermalMargins={thermalMargins} />}
      {printView === 'pending' && <PendingPrintView pendingOwedToUs={state.pendingFundsOwedToUs} pendingOwedByUs={state.pendingFundsOwedByUs} formatNum={formatNum} />}
      {printView === 'pos' && activePrintPosId && state.posData.find(p => p.id === activePrintPosId) && (
        <PosPrintView pos={state.posData.find(p => p.id === activePrintPosId)} summary={currentSummary} formatNum={formatNum} date={state.date} printFormat="a4" />
      )}
      {printView === 'pos_thermal' && activePrintPosId && state.posData.find(p => p.id === activePrintPosId) && (
        <PosPrintView pos={state.posData.find(p => p.id === activePrintPosId)} summary={currentSummary} formatNum={formatNum} date={state.date} printFormat="thermal" thermalMargins={thermalMargins} />
      )}
      
      {showCalculator && <CalculatorWidget onClose={() => setShowCalculator(false)} />}
      
      {/* Hidden containers for PDF export calculation */}
      <div className="absolute top-0 left-0 -z-50 opacity-0 pointer-events-none">
        <DailyPrintView id="daily-print-container" isPdfMode={true} state={state} summary={currentSummary} formatNum={formatNum} />
        <PendingPrintView id="pending-print-container" isPdfMode={true} pendingOwedToUs={state.pendingFundsOwedToUs} pendingOwedByUs={state.pendingFundsOwedByUs} formatNum={formatNum} />
      </div>
    </div>
  );
}
