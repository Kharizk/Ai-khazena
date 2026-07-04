import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Printer, ArrowRight, Download, Calendar, 
  User, Building, RotateCcw, HelpCircle, 
  Edit, Check, Sparkles, CheckCircle2, FileText, X
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

interface AttendanceSheetProps {
  onClose: () => void;
  defaultBranch?: string | null;
}

interface DayRow {
  dateStr: string;
  dayName: string;
  isFriday: boolean;
  morningIn: string;
  morningOut: string;
  eveningIn: string;
  eveningOut: string;
  delay: string;
}

export const AttendanceSheet: React.FC<AttendanceSheetProps> = ({ onClose, defaultBranch }) => {
  const [employeeName, setEmployeeName] = useState('عبد الرحيم الحربي');
  const [branchName, setBranchName] = useState(defaultBranch || 'المدينة المنورة');
  const [companyName, setCompanyName] = useState('شركة ركن العمارية');
  
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(7); // July by default to match the attached pdf
  
  const [absenceDays, setAbsenceDays] = useState('');
  const [delayHours, setDelayHours] = useState('');
  const [notes, setNotes] = useState('');

  // Auto-fill configuration
  const [autoMorningIn, setAutoMorningIn] = useState('08:00');
  const [autoMorningOut, setAutoMorningOut] = useState('12:00');
  const [autoEveningIn, setAutoEveningIn] = useState('16:00');
  const [autoEveningOut, setAutoEveningOut] = useState('20:00');

  const [days, setDays] = useState<DayRow[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [previewScale, setPreviewScale] = useState(0.8);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfTargetRef = useRef<HTMLDivElement>(null);

  const arabicMonths = [
    { value: 1, label: 'يناير' },
    { value: 2, label: 'فبراير' },
    { value: 3, label: 'مارس' },
    { value: 4, label: 'أبريل' },
    { value: 5, label: 'مايو' },
    { value: 6, label: 'يونيو' },
    { value: 7, label: 'يوليو' },
    { value: 8, label: 'أغسطس' },
    { value: 9, label: 'سبتمبر' },
    { value: 10, label: 'أكتوبر' },
    { value: 11, label: 'نوفمبر' },
    { value: 12, label: 'ديسمبر' }
  ];

  // Generate days when month/year changes
  useEffect(() => {
    generateInitialDays();
  }, [year, month]);

  // Adjust preview scaling to fit container
  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth - 32; // padding
        const a4Width = 794; // standard A4 pixels width at 96 DPI
        const newScale = containerWidth / a4Width;
        setPreviewScale(Math.min(newScale, 1.0));
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const generateInitialDays = () => {
    const list: DayRow[] = [];
    const date = new Date(year, month - 1, 1);
    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    
    while (date.getMonth() === month - 1) {
      const dayIndex = date.getDay();
      const isFriday = dayIndex === 5; // Friday index in standard JavaScript Date.getDay() (0 is Sunday, 5 is Friday, 6 is Saturday)
      
      list.push({
        dateStr: String(date.getDate()).padStart(2, '0'),
        dayName: arabicDays[dayIndex],
        isFriday,
        morningIn: isFriday ? '' : ': :',
        morningOut: isFriday ? '' : ': :',
        eveningIn: isFriday ? '' : ': :',
        eveningOut: isFriday ? '' : ': :',
        delay: ''
      });
      date.setDate(date.getDate() + 1);
    }
    setDays(list);
  };

  const handleCellChange = (index: number, field: keyof DayRow, value: string) => {
    setDays(prev => prev.map((day, idx) => {
      if (idx === index) {
        return { ...day, [field]: value };
      }
      return day;
    }));
  };

  const handleAutoFill = () => {
    setDays(prev => prev.map(day => {
      if (day.isFriday) {
        return {
          ...day,
          morningIn: '',
          morningOut: '',
          eveningIn: '',
          eveningOut: '',
          delay: ''
        };
      }
      return {
        ...day,
        morningIn: autoMorningIn,
        morningOut: autoMorningOut,
        eveningIn: autoEveningIn,
        eveningOut: autoEveningOut,
        delay: ''
      };
    }));
  };

  const handleResetTimes = () => {
    setDays(prev => prev.map(day => ({
      ...day,
      morningIn: day.isFriday ? '' : ': :',
      morningOut: day.isFriday ? '' : ': :',
      eveningIn: day.isFriday ? '' : ': :',
      eveningOut: day.isFriday ? '' : ': :',
      delay: ''
    })));
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!pdfTargetRef.current) return;
    setIsGeneratingPdf(true);
    
    try {
      const element = pdfTargetRef.current;
      const dataUrl = await toPng(element, {
        quality: 1.0,
        backgroundColor: '#ffffff',
        pixelRatio: 3, // very high quality
        style: {
          transform: 'none',
        }
      });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      const monthLabel = arabicMonths.find(m => m.value === month)?.label || `${month}`;
      pdf.save(`كشف_دوام_${employeeName.replace(/\s+/g, '_')}_${monthLabel}_${year}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const monthLabel = arabicMonths.find(m => m.value === month)?.label || '';

  return (
    <div className="fixed inset-0 z-[150] bg-slate-900 text-white overflow-hidden flex flex-col" dir="rtl">
      {/* Header Panel */}
      <div className="relative z-10 shrink-0 flex justify-between items-center px-6 py-4 bg-[#354a5f] border-b border-white/5 print:hidden">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center hover:bg-white/10 text-white rounded-[3px] transition-all"
            title="رجوع للرئيسية"
          >
            <ArrowRight size={20} />
          </button>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
              <span>كشف الدوام اليومي</span>
              <span className="text-[10px] text-brand-200 bg-white/10 border border-white/10 px-1.5 py-0.5 rounded font-bold tracking-widest font-mono">PWA</span>
            </h1>
            <p className="text-xs text-brand-100 opacity-85">توليد وطباعة كشوفات الحضور والانصراف بدقة عالية (A4)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-750 text-white text-[15px] font-bold rounded-[3px] border border-slate-700 transition-all"
          >
            <Printer size={18} />
            <span>طباعة كشف (A4)</span>
          </button>
          <button 
            onClick={handleDownloadPDF}
            disabled={isGeneratingPdf}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[15px] font-bold rounded-[3px] transition-all shadow-md"
          >
            <Download size={18} />
            <span>{isGeneratingPdf ? 'جاري التوليد...' : 'تحميل PDF معتمد'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 flex overflow-hidden print:overflow-visible print:bg-white print:text-black">
        {/* Left Form Editor: 40% width on large screens */}
        <div className="w-full lg:w-[38%] bg-slate-800/90 border-l border-slate-700/50 p-6 overflow-y-auto shrink-0 print:hidden flex flex-col gap-6">
          
          {/* Employee & Branch Section */}
          <div className="bg-slate-900/55 p-4 rounded-xl border border-slate-700/40">
            <h2 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
              <User size={16} className="text-brand-400" />
              <span>معلومات الكادر والفرع</span>
            </h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">اسم الموظف</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={employeeName} 
                    onChange={e => setEmployeeName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-[4px] px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-bold"
                    placeholder="أدخل اسم الموظف"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">الفرع</label>
                  <input 
                    type="text" 
                    value={branchName} 
                    onChange={e => setBranchName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-[4px] px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-bold"
                    placeholder="الفرع"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">اسم الشركة</label>
                  <input 
                    type="text" 
                    value={companyName} 
                    onChange={e => setCompanyName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-[4px] px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-bold"
                    placeholder="اسم الشركة"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Month & Year Selection */}
          <div className="bg-slate-900/55 p-4 rounded-xl border border-slate-700/40">
            <h2 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-brand-400" />
              <span>تحديد الشهر والسنة لتحديث التقويم</span>
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">الشهر</label>
                <select 
                  value={month} 
                  onChange={e => setMonth(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-[4px] px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-bold cursor-pointer"
                >
                  {arabicMonths.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">السنة</label>
                <input 
                  type="number" 
                  value={year} 
                  onChange={e => setYear(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-[4px] px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-bold"
                  min="2020"
                  max="2040"
                />
              </div>
            </div>
          </div>

          {/* Quick Autocomplete Tools */}
          <div className="bg-slate-900/55 p-4 rounded-xl border border-slate-700/40">
            <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
              <Sparkles size={16} className="text-brand-400 animate-pulse" />
              <span>أدوات التعبئة التلقائية والتحكم الذكي</span>
            </h2>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              يمكنك تعبئة مواعيد الدوام الصباحي والمسائي بضغطة واحدة، أو تصفيرها للطباعة اليدوية. يتم استثناء أيام الجمعة تلقائياً.
            </p>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">الفترة الصباحية</label>
                <div className="flex gap-1">
                  <input type="text" value={autoMorningIn} onChange={e => setAutoMorningIn(e.target.value)} className="w-1/2 bg-slate-800 border border-slate-700 rounded-[3px] text-center text-xs py-1 text-white focus:outline-none" placeholder="حضور"/>
                  <input type="text" value={autoMorningOut} onChange={e => setAutoMorningOut(e.target.value)} className="w-1/2 bg-slate-800 border border-slate-700 rounded-[3px] text-center text-xs py-1 text-white focus:outline-none" placeholder="انصراف"/>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">الفترة المسائية</label>
                <div className="flex gap-1">
                  <input type="text" value={autoEveningIn} onChange={e => setAutoEveningIn(e.target.value)} className="w-1/2 bg-slate-800 border border-slate-700 rounded-[3px] text-center text-xs py-1 text-white focus:outline-none" placeholder="حضور"/>
                  <input type="text" value={autoEveningOut} onChange={e => setAutoEveningOut(e.target.value)} className="w-1/2 bg-slate-800 border border-slate-700 rounded-[3px] text-center text-xs py-1 text-white focus:outline-none" placeholder="انصراف"/>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={handleAutoFill}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-2 rounded-[4px] text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                تعبئة جميع الأيام
              </button>
              <button 
                onClick={handleResetTimes}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-[4px] text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={14} />
                نموذج فارغ للطباعة
              </button>
            </div>
          </div>

          {/* Footer Statistics */}
          <div className="bg-slate-900/55 p-4 rounded-xl border border-slate-700/40">
            <h2 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
              <FileText size={16} className="text-brand-400" />
              <span>إحصائيات وملاحظات نهاية الشهر</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">عدد أيام الغياب</label>
                <input 
                  type="text" 
                  value={absenceDays} 
                  onChange={e => setAbsenceDays(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-[4px] px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-center font-bold"
                  placeholder="مثال: 2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">ساعات التأخير</label>
                <input 
                  type="text" 
                  value={delayHours} 
                  onChange={e => setDelayHours(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-[4px] px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-center font-bold"
                  placeholder="مثال: 5"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">ملاحظات</label>
              <textarea 
                value={notes} 
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-[4px] px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs font-semibold"
                placeholder="ملاحظات حول الدوام..."
                rows={3}
              />
            </div>
          </div>

        </div>

        {/* Right Preview Column: 60% width */}
        <div 
          ref={containerRef}
          className="flex-1 bg-slate-900/40 p-6 flex justify-center items-start overflow-auto print:p-0 print:bg-white print:overflow-visible"
        >
          {/* Printable Target Container */}
          <div className="relative origin-top transition-transform duration-100 print:transform-none print:scale-100 shrink-0 select-none print:select-text" style={{ transform: `scale(${previewScale})` }}>
            
            {/* The Actual A4 Paper representation */}
            <div 
              id="attendance-sheet-a4-target"
              ref={pdfTargetRef}
              dir="rtl"
              className="bg-white text-black p-8 box-border border-2 border-slate-400 shadow-2xl flex flex-col justify-between"
              style={{
                width: '794px',
                height: '1123px',
                minHeight: '1123px',
                maxHeight: '1123px',
                fontFamily: "'Cairo', 'Inter', sans-serif",
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact'
              }}
            >
              <div>
                {/* 1. TOP HEADER SECTION */}
                <div className="flex justify-between items-start pb-2 border-b-4 border-double border-black">
                  <div className="flex-1 text-right">
                    <h2 className="text-[21px] font-black text-sky-800 tracking-tight leading-tight">{companyName}</h2>
                  </div>
                  <div className="flex-1 text-center">
                    <h1 className="text-[24px] font-black tracking-tight leading-none text-slate-950">كشف الدوام اليومي</h1>
                  </div>
                  <div className="flex-1 text-left flex flex-col items-end">
                    <div className="flex items-center gap-1">
                      <span className="text-[13px] font-black text-slate-950">الفرع :</span>
                      <span className="text-[13px] font-bold text-slate-800">{branchName}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600 font-mono">
                      <span>Branch:</span>
                      <span>{branchName}</span>
                    </div>
                  </div>
                </div>

                {/* 2. EMPLOYEE & MONTH DETAILS SECTION */}
                <div className="flex justify-between items-center py-2.5 border-b-2 border-black/80 text-[13px]">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-950 text-sm">الاســــــــــــــم :</span>
                    <span className="font-black border-b-2 border-dashed border-slate-500 pb-0.5 px-4 text-slate-900 text-[15px]">{employeeName}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-slate-950">شهر:</span>
                      <span className="font-black border-b-2 border-dashed border-slate-500 pb-0.5 px-4 text-slate-900 text-[14px]">{monthLabel} {year}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-700 font-mono text-[11px]">
                      <span className="font-bold">Month:</span>
                      <span className="font-bold">{monthLabel} {year}</span>
                    </div>
                  </div>
                </div>

                {/* 3. GRID TABLE SECTION */}
                <table className="w-full border-collapse border-2 border-black text-center text-[10.5px] mt-2">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-black header-shaded">
                      <th rowSpan={3} className="border border-black py-2 font-black text-[11px] w-[6%] header-shaded">التاريخ<br/>DATE</th>
                      <th rowSpan={3} className="border border-black py-2 font-black text-[11px] w-[10%] header-shaded">اليوم<br/>DAY</th>
                      <th colSpan={4} className="border border-black py-1 font-black text-[11.5px] header-shaded">الفترة الصباحية Morning Period</th>
                      <th colSpan={4} className="border border-black py-1 font-black text-[11.5px] header-shaded">الفترة المسائية Evening Period</th>
                      <th rowSpan={3} className="border border-black py-2 font-black text-[11px] w-[8%] leading-tight header-shaded">ساعات<br/>التأخير<br/>Delay<br/>Hour</th>
                    </tr>
                    <tr className="bg-slate-50 border-b border-black font-bold sub-header-shaded">
                      {/* Morning Period Columns */}
                      <th colSpan={2} className="border border-black py-0.5 font-black text-[10px] sub-header-shaded">حضور Incoming</th>
                      <th colSpan={2} className="border border-black py-0.5 font-black text-[10px] sub-header-shaded">انصراف Going Out</th>
                      {/* Evening Period Columns */}
                      <th colSpan={2} className="border border-black py-0.5 font-black text-[10px] sub-header-shaded">حضور Incoming</th>
                      <th colSpan={2} className="border border-black py-0.5 font-black text-[10px] sub-header-shaded">انصراف Going Out</th>
                    </tr>
                    <tr className="bg-slate-50 border-b-2 border-black text-[8px] font-bold text-slate-800 sub-header-shaded">
                      {/* Morning In */}
                      <th className="border border-black py-0.5 sub-header-shaded">الساعة<br/>Time</th>
                      <th className="border border-black py-0.5 sub-header-shaded">التوقيع<br/>.Sign</th>
                      {/* Morning Out */}
                      <th className="border border-black py-0.5 sub-header-shaded">الساعة<br/>Time</th>
                      <th className="border border-black py-0.5 sub-header-shaded">التوقيع<br/>.Sign</th>
                      {/* Evening In */}
                      <th className="border border-black py-0.5 sub-header-shaded">الساعة<br/>Time</th>
                      <th className="border border-black py-0.5 sub-header-shaded">التوقيع<br/>.Sign</th>
                      {/* Evening Out */}
                      <th className="border border-black py-0.5 sub-header-shaded">الساعة<br/>Time</th>
                      <th className="border border-black py-0.5 sub-header-shaded">التوقيع<br/>.Sign</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((day, idx) => (
                      <tr 
                        key={day.dateStr} 
                        className={`border-b border-black h-[21px] ${day.isFriday ? 'friday-shaded' : ''}`}
                      >
                        {/* DATE */}
                        <td 
                          className={`border border-black font-black text-[11px] ${day.isFriday ? 'friday-shaded' : 'bg-slate-50'}`}
                        >
                          {day.dateStr}
                        </td>

                        {/* DAY */}
                        <td 
                          className={`border border-black font-black text-[11px] ${day.isFriday ? 'text-red-600 font-bold friday-shaded' : 'bg-slate-50'}`}
                        >
                          {day.dayName}
                        </td>
                        
                        {/* Morning In - Time */}
                        <td className={`border border-black font-bold font-mono text-[10.5px] p-0 m-0 ${day.isFriday ? 'friday-shaded' : ''}`}>
                          {day.isFriday ? '' : (
                            <input 
                              type="text" 
                              value={day.morningIn}
                              onChange={e => handleCellChange(idx, 'morningIn', e.target.value)}
                              className="w-full h-full bg-transparent border-0 text-center focus:outline-none cursor-text p-0 m-0 text-black font-bold text-[10.5px]"
                            />
                          )}
                        </td>

                        {/* Morning In - Sign */}
                        <td className={`border border-black ${day.isFriday ? 'friday-shaded' : ''}`}></td>

                        {/* Morning Out - Time */}
                        <td className={`border border-black font-bold font-mono text-[10.5px] p-0 m-0 ${day.isFriday ? 'friday-shaded' : ''}`}>
                          {day.isFriday ? '' : (
                            <input 
                              type="text" 
                              value={day.morningOut}
                              onChange={e => handleCellChange(idx, 'morningOut', e.target.value)}
                              className="w-full h-full bg-transparent border-0 text-center focus:outline-none cursor-text p-0 m-0 text-black font-bold text-[10.5px]"
                            />
                          )}
                        </td>

                        {/* Morning Out - Sign */}
                        <td className={`border border-black ${day.isFriday ? 'friday-shaded' : ''}`}></td>

                        {/* Evening In - Time */}
                        <td className={`border border-black font-bold font-mono text-[10.5px] p-0 m-0 ${day.isFriday ? 'friday-shaded' : ''}`}>
                          {day.isFriday ? '' : (
                            <input 
                              type="text" 
                              value={day.eveningIn}
                              onChange={e => handleCellChange(idx, 'eveningIn', e.target.value)}
                              className="w-full h-full bg-transparent border-0 text-center focus:outline-none cursor-text p-0 m-0 text-black font-bold text-[10.5px]"
                            />
                          )}
                        </td>

                        {/* Evening In - Sign */}
                        <td className={`border border-black ${day.isFriday ? 'friday-shaded' : ''}`}></td>

                        {/* Evening Out - Time */}
                        <td className={`border border-black font-bold font-mono text-[10.5px] p-0 m-0 ${day.isFriday ? 'friday-shaded' : ''}`}>
                          {day.isFriday ? '' : (
                            <input 
                              type="text" 
                              value={day.eveningOut}
                              onChange={e => handleCellChange(idx, 'eveningOut', e.target.value)}
                              className="w-full h-full bg-transparent border-0 text-center focus:outline-none cursor-text p-0 m-0 text-black font-bold text-[10.5px]"
                            />
                          )}
                        </td>

                        {/* Evening Out - Sign */}
                        <td className={`border border-black ${day.isFriday ? 'friday-shaded' : ''}`}></td>

                        {/* Delay */}
                        <td className={`border border-black font-bold font-mono text-[10.5px] p-0 m-0 ${day.isFriday ? 'friday-shaded' : ''}`}>
                          {day.isFriday ? '' : (
                            <input 
                              type="text" 
                              value={day.delay}
                              onChange={e => handleCellChange(idx, 'delay', e.target.value)}
                              className="w-full h-full bg-transparent border-0 text-center focus:outline-none cursor-text p-0 m-0 text-black font-bold text-[10.5px]"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 4. FOOTER SIGNATURES & REASON SECTION */}
              <div className="mt-4 flex justify-between items-end">
                {/* Managers Signs */}
                <div className="flex-1 flex justify-around text-center text-xs font-black pb-2">
                  <div className="flex flex-col gap-10">
                    <span>الإدارة</span>
                    <span className="w-24 border-b border-black"></span>
                  </div>
                  <div className="flex flex-col gap-10">
                    <span>المحاسبة</span>
                    <span className="w-24 border-b border-black"></span>
                  </div>
                  <div className="flex flex-col gap-10">
                    <span>مدير القسم</span>
                    <span className="w-24 border-b border-black"></span>
                  </div>
                </div>

                {/* Absence and delay table on the right */}
                <div className="w-[45%] flex flex-col border-2 border-black shrink-0 text-xs font-black bg-white rounded-none">
                  <div className="flex border-b border-black h-8 items-center bg-slate-50">
                    <span className="w-1/3 text-center border-l border-black py-1 bg-slate-100">ملاحظات :</span>
                    <span className="w-2/3 px-2 text-[10px] text-slate-700 font-semibold truncate">{notes || ' '}</span>
                  </div>
                  <div className="flex border-b border-black h-8 items-center">
                    <span className="w-2/3 px-3 py-1">عدد أيام الغياب</span>
                    <span className="w-1/3 text-center border-r border-black py-1 font-black text-sm bg-slate-50">{absenceDays || ' '}</span>
                  </div>
                  <div className="flex h-8 items-center">
                    <span className="w-2/3 px-3 py-1">عدد ساعات التأخير</span>
                    <span className="w-1/3 text-center border-r border-black py-1 font-black text-sm bg-slate-50">{delayHours || ' '}</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      </div>

      {/* Embedded print style to handle only printing the A4 target on print command */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap');

        .friday-shaded {
          background-color: #cbd5e1 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .header-shaded {
          background-color: #f1f5f9 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .sub-header-shaded {
          background-color: #f8fafc !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 0mm !important;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Hide everything by default in the body */
          body * {
            visibility: hidden !important;
          }
          /* Show only the target sheet container and its internal tree */
          #attendance-sheet-a4-target,
          #attendance-sheet-a4-target * {
            visibility: visible !important;
          }
          /* Position the target container precisely to cover exactly one A4 page */
          #attendance-sheet-a4-target {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            margin: 0 !important;
            padding: 1.2cm 1.2cm !important; /* Proper margin for standard A4 printing */
            width: 210mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            box-sizing: border-box !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .friday-shaded {
            background-color: #cbd5e1 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .header-shaded {
            background-color: #f1f5f9 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .sub-header-shaded {
            background-color: #f8fafc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
};
