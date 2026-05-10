const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Change Trash2 size from 20 to 18
code = code.replace(/<Trash2 size={20} \/>/g, '<Trash2 size={18} strokeWidth={1.5} />');
code = code.replace(/<CheckCircle2 size={20} \/>/g, '<CheckCircle2 size={18} strokeWidth={1.5} />');
code = code.replace(/<Pin size={20}/g, '<Pin size={18} strokeWidth={1.5}');
code = code.replace(/<Eye size={20} \/>/g, '<Eye size={18} strokeWidth={1.5} />');
code = code.replace(/<EyeOff size={20} \/>/g, '<EyeOff size={18} strokeWidth={1.5} />');
code = code.replace(/<PlusCircle size={20} \/>/g, '<PlusCircle size={18} strokeWidth={1.5} />');
code = code.replace(/<ArrowUpRight size={20}/g, '<ArrowUpRight size={18} strokeWidth={1.5}');
code = code.replace(/<ArrowDownRight size={20}/g, '<ArrowDownRight size={18} strokeWidth={1.5}');
code = code.replace(/<AlertCircle size={20}/g, '<AlertCircle size={18} strokeWidth={1.5}');

code = code.replace(/<X size={20} \/>/g, '<X size={18} strokeWidth={1.5} />');
code = code.replace(/<Calculator size={20} className="text-blue-600" \/>/g, '<Calculator size={18} strokeWidth={1.5} className="text-blue-600" />');
code = code.replace(/<Wallet size={20} \/>/g, '<Wallet size={18} strokeWidth={1.5} />');
code = code.replace(/<CalendarDays size={20} \/>/g, '<CalendarDays size={18} strokeWidth={1.5} />');
code = code.replace(/<BookOpen size={20} \/>/g, '<BookOpen size={18} strokeWidth={1.5} />');
code = code.replace(/<History size={20} \/>/g, '<History size={18} strokeWidth={1.5} />');
code = code.replace(/<Clock size={20} \/>/g, '<Clock size={18} strokeWidth={1.5} />');

fs.writeFileSync('src/App.tsx', code);
