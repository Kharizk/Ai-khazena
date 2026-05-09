const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');

// Update lucide-react imports
code = code.replace(
  "import { Save, Printer, FilePlus, Plus, Trash2, Calculator, Wallet, ArrowDownRight, ArrowUpRight, AlertCircle, CheckCircle2, CreditCard, Receipt, Layers, Pin, Settings, Undo2, History, Eye, EyeOff, X, LogIn, LogOut, CalendarDays, Download, FileText, Image as ImageIcon, BookOpen, PlusCircle, Copy, Search, Check, Edit2, BarChart3, TrendingUp, ChevronUp, ChevronDown, ArrowRight, ChevronLeft, Database, Sparkles } from 'lucide-react';",
  "import { Save, Printer, FilePlus, Plus, Trash2, Calculator, Wallet, ArrowDownRight, ArrowUpRight, AlertCircle, CheckCircle2, CreditCard, Receipt, Layers, Pin, Settings, Undo2, History, Eye, EyeOff, X, LogIn, LogOut, CalendarDays, Download, FileText, Image as ImageIcon, BookOpen, PlusCircle, Copy, Search, Check, Edit2, BarChart3, TrendingUp, TrendingDown, ChevronUp, ChevronDown, ArrowRight, ChevronLeft, Database, Sparkles, Activity, PieChart as PieChartIcon, LineChart as LineChartIcon } from 'lucide-react';"
);

fs.writeFileSync('src/App.tsx', code);
console.log('Successfully updated Lucide imports!');
