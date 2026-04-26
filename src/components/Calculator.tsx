import React, { useState } from 'react';
import { X } from 'lucide-react';

export default function CalculatorWidget({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');

  const append = (val: string) => {
    if (display === '0' && val !== '.') setDisplay(val);
    else setDisplay(display + val);
  };

  const handleOp = (op: string) => {
    setEquation(display + ' ' + op + ' ');
    setDisplay('0');
  };

  const calculate = () => {
    try {
      // Basic safe eval alternative or just simple eval for a calculator
      const result = new Function('return ' + equation + display)();
      setDisplay(String(Math.round(result * 100) / 100));
      setEquation('');
    } catch (e) {
      setDisplay('Error');
    }
  };

  const clear = () => {
    setDisplay('0');
    setEquation('');
  };

  const del = () => {
    if (display.length > 1) setDisplay(display.slice(0, -1));
    else setDisplay('0');
  };

  return (
    <div className="fixed bottom-24 left-6 bg-slate-800 text-white rounded-2xl shadow-2xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.2)] w-72 z-50 animate-in fade-in slide-in-from-bottom-4" style={{direction: "ltr"}}>
      <div className="bg-slate-900 p-3 flex justify-between items-center group cursor-move">
        <h3 className="text-sm font-bold text-slate-300">Calculator</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-rose-500 rounded-full p-1"><X size={16}/></button>
      </div>
      <div className="p-4">
        <div className="bg-slate-900 rounded-xl p-3 mb-4 text-right shadow-inner min-h-[70px] flex flex-col justify-end">
          <div className="text-slate-400 text-sm h-5">{equation}</div>
          <div className="text-3xl font-mono tracking-tight font-bold text-emerald-400 truncate">{display}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {/* Row 1 */}
          <button onClick={clear} className="col-span-2 py-3 bg-rose-500 hover:bg-rose-600 rounded-xl font-bold transition-colors active:scale-95 text-white shadow-sm">AC</button>
          <button onClick={del} className="py-3 bg-slate-700 hover:bg-slate-600 rounded-xl flex justify-center items-center font-bold text-orange-400 transition-colors active:scale-95 shadow-sm">C</button>
          <button onClick={() => handleOp('/')} className="py-3 bg-slate-700 hover:bg-blue-600 hover:text-white rounded-xl font-bold text-blue-400 transition-colors active:scale-95 shadow-sm">÷</button>
          
          {/* Row 2 */}
          <button onClick={() => append('7')} className="py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-bold transition-colors active:scale-95 shadow-sm">7</button>
          <button onClick={() => append('8')} className="py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-bold transition-colors active:scale-95 shadow-sm">8</button>
          <button onClick={() => append('9')} className="py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-bold transition-colors active:scale-95 shadow-sm">9</button>
          <button onClick={() => handleOp('*')} className="py-3 bg-slate-700 hover:bg-blue-600 hover:text-white rounded-xl font-bold text-blue-400 transition-colors active:scale-95 shadow-sm">×</button>

          {/* Row 3 */}
          <button onClick={() => append('4')} className="py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-bold transition-colors active:scale-95 shadow-sm">4</button>
          <button onClick={() => append('5')} className="py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-bold transition-colors active:scale-95 shadow-sm">5</button>
          <button onClick={() => append('6')} className="py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-bold transition-colors active:scale-95 shadow-sm">6</button>
          <button onClick={() => handleOp('-')} className="py-3 bg-slate-700 hover:bg-blue-600 hover:text-white rounded-xl font-bold text-blue-400 transition-colors active:scale-95 shadow-sm">−</button>

          {/* Row 4 */}
          <button onClick={() => append('1')} className="py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-bold transition-colors active:scale-95 shadow-sm">1</button>
          <button onClick={() => append('2')} className="py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-bold transition-colors active:scale-95 shadow-sm">2</button>
          <button onClick={() => append('3')} className="py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-bold transition-colors active:scale-95 shadow-sm">3</button>
          <button onClick={() => handleOp('+')} className="py-3 bg-slate-700 hover:bg-blue-600 hover:text-white rounded-xl font-bold text-blue-400 transition-colors active:scale-95 shadow-sm">+</button>

          {/* Row 5 */}
          <button onClick={() => append('0')} className="col-span-2 py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-bold transition-colors active:scale-95 text-left pl-6 shadow-sm">0</button>
          <button onClick={() => append('.')} className="py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-bold transition-colors active:scale-95 shadow-sm">.</button>
          <button onClick={calculate} className="py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors active:scale-95 shadow-sm">=</button>
        </div>
      </div>
    </div>
  )
}
