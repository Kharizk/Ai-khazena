const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add skipLogin state
code = code.replace(/const \[showAuthModal, setShowAuthModal\] = useState\(false\);/, "const [showAuthModal, setShowAuthModal] = useState(false);\n  const [skipLogin, setSkipLogin] = useState(false);");

// 2. We need to inject the !user && !skipLogin render block right after the loading check and the pending user check.
const authFullPageRender = `
  if (!user && !skipLogin) {
    return (
      <div className="fixed inset-0 bg-[#0B2D2E] text-white flex flex-col justify-center items-center p-4 selection:bg-blue-200" dir="rtl">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, #13655B 0%, transparent 60%), linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, .1) 25%, rgba(255, 255, 255, .1) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .1) 75%, rgba(255, 255, 255, .1) 76%, transparent 77%, transparent)',
          backgroundSize: '100% 100%, 50px 50px, 50px 50px'
        }}></div>
        <div className="z-10 bg-white/95 backdrop-blur-2xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/80 ring-1 ring-slate-900/5 w-full max-w-sm overflow-hidden flex flex-col text-slate-800 relative">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <LogIn className="text-blue-600" size={24} />
              {isSignUp ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
            </h3>
            <button onClick={() => setSkipLogin(true)} className="text-slate-400 hover:text-slate-600 px-3 py-1 bg-slate-100 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors">
              تخطي
            </button>
          </div>
          <div className="p-6 pb-8">
            {authError && (
              <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-xl text-[15px] font-bold border border-red-200 flex items-center gap-2">
                <AlertCircle size={18} className="shrink-0" />
                {authError}
              </div>
            )}
            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[15px] font-bold text-slate-700 mb-1.5">البريد الإلكتروني</label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono shadow-sm"
                />
              </div>
              <div>
                <label className="block text-[15px] font-bold text-slate-700 mb-1.5">كلمة المرور</label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono shadow-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl mt-2 hover:bg-blue-700 transition-all shadow-sm active:scale-95 flex justify-center items-center gap-2"
              >
                <LogIn size={20} /> {isSignUp ? 'إنشاء الحساب' : 'دخول'}
              </button>
            </form>

            <div className="mt-5 relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-[15px]">
                <span className="px-3 bg-white text-slate-500 font-medium text-xs">أو</span>
              </div>
            </div>

            <button
              onClick={handleGoogleLogin}
              className="mt-5 w-full bg-white border border-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl hover:bg-slate-50 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-sm"
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
                className="text-slate-500 hover:text-blue-600 font-bold transition-colors text-[15px]"
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
`;

code = code.replace(/if \(user && userProfile && userProfile\.status === 'pending'\) {/g, authFullPageRender + '\n  if (user && userProfile && userProfile.status === \'pending\') {');

fs.writeFileSync('src/App.tsx', code);
console.log('Login wrapper added.');
