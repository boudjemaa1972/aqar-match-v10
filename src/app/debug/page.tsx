"use client";

import { useState, useEffect } from "react";

export default function DebugPage() {
  const [state, setState] = useState<unknown>(null);
  const [loginResult, setLoginResult] = useState<string>("");
  const [logoutResult, setLogoutResult] = useState<string>("");
  const [email, setEmail] = useState("publish-test@example.com");
  const [password, setPassword] = useState("Test1234!");
  const [loading, setLoading] = useState(false);

  async function checkAuth() {
    const res = await fetch("/api/debug/auth", { cache: "no-store" });
    const data = await res.json();
    setState(data);
  }

  useEffect(() => { checkAuth(); }, []);

  async function doLogin() {
    setLoading(true);
    setLoginResult("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe: false }),
      });
      const data = await res.json();
      setLoginResult(JSON.stringify(data, null, 2));
      // Re-check auth after login
      setTimeout(checkAuth, 500);
    } catch (e) {
      setLoginResult("ERROR: " + (e instanceof Error ? e.message : String(e)));
    }
    setLoading(false);
  }

  async function doLogout() {
    setLoading(true);
    setLogoutResult("");
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      const data = await res.json();
      setLogoutResult(JSON.stringify(data, null, 2));
      setTimeout(checkAuth, 500);
    } catch (e) {
      setLogoutResult("ERROR: " + (e instanceof Error ? e.message : String(e)));
    }
    setLoading(false);
  }

  return (
    <div className="p-8 max-w-2xl mx-auto font-mono text-sm" dir="ltr">
      <h1 className="text-xl font-bold mb-4">Auth Debug Page</h1>
      
      <div className="mb-6 p-4 bg-gray-100 rounded">
        <h2 className="font-bold mb-2">Current Auth State:</h2>
        <pre className="text-xs overflow-auto">{JSON.stringify(state, null, 2)}</pre>
        <button onClick={checkAuth} className="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-xs">
          Refresh
        </button>
      </div>

      <div className="mb-6 p-4 bg-blue-50 rounded">
        <h2 className="font-bold mb-2">Test Login:</h2>
        <input value={email} onChange={e => setEmail(e.target.value)} className="border p-1 w-full mb-1 text-xs" placeholder="Email" />
        <input value={password} onChange={e => setPassword(e.target.value)} className="border p-1 w-full mb-1 text-xs" type="password" placeholder="Password" />
        <button onClick={doLogin} disabled={loading} className="px-3 py-1 bg-green-500 text-white rounded text-xs">
          {loading ? "Loading..." : "Login"}
        </button>
        {loginResult && <pre className="text-xs mt-2 overflow-auto bg-white p-2 rounded">{loginResult}</pre>}
      </div>

      <div className="mb-6 p-4 bg-red-50 rounded">
        <h2 className="font-bold mb-2">Test Logout:</h2>
        <button onClick={doLogout} disabled={loading} className="px-3 py-1 bg-red-500 text-white rounded text-xs">
          {loading ? "Loading..." : "Logout"}
        </button>
        {logoutResult && <pre className="text-xs mt-2 overflow-auto bg-white p-2 rounded">{logoutResult}</pre>}
      </div>
    </div>
  );
}
