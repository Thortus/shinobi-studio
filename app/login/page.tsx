'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      const from = searchParams.get('from') || '/';
      router.push(from);
    } else {
      setError('Wrong password');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F1FD] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-10 w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src="/Shinobiriselogo_black_nobg.png" alt="ShinobiRise" className="h-14 w-auto" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 text-center mb-1">Studio Access</h1>
        <p className="text-slate-400 text-sm text-center mb-8">Private workspace</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full px-5 py-4 rounded-2xl border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
          />
          {error && <p className="text-rose-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="bg-[#732C3F] hover:bg-[#1A0B12] disabled:opacity-50 text-white font-semibold py-4 rounded-2xl transition-all"
          >
            {loading ? 'Entering…' : 'Enter Studio'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
