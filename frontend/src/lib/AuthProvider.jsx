// Provides the auth context: holds the JWT + current user, persists them to
// localStorage, and exposes login (login-or-register) / logout. The token is
// read by lib/api.js on every request, so anything using `api` is authed.
import { useCallback, useState } from "react";
import { api } from "./api";
import { AuthContext, TOKEN_KEY, USER_KEY } from "./auth";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  });

  const persist = useCallback((tok, usr) => {
    setToken(tok);
    setUser(usr);
    if (tok) localStorage.setItem(TOKEN_KEY, tok);
    else localStorage.removeItem(TOKEN_KEY);
    if (usr) localStorage.setItem(USER_KEY, JSON.stringify(usr));
    else localStorage.removeItem(USER_KEY);
  }, []);

  // login authenticates against the backend. If the account doesn't exist yet
  // (first time a demo preset is used), it self-registers — so preset logins
  // work against a fresh database without manual seeding.
  const login = useCallback(
    async ({ email, password, name, role }) => {
      let data;
      try {
        data = await api.post("/api/auth/login", { email, password });
      } catch {
        data = await api.post("/api/auth/register", {
          email,
          password,
          name: name || email.split("@")[0],
          role: role || "resident",
        });
      }
      // Prefer the role the backend returns; fall back to the requested demo
      // role (e.g. first-time preset register) so RBAC-gated UI works either way.
      const merged = { ...data.user, role: data.user?.role ?? role ?? null };
      persist(data.token, merged);
      return merged;
    },
    [persist],
  );

  const logout = useCallback(() => persist(null, null), [persist]);

  // updateUser merges partial fields (e.g. an edited name) into the cached user
  // and re-persists, so the navbar and greetings reflect profile edits at once.
  const updateUser = useCallback((partial) => {
    setUser((prev) => {
      const next = { ...(prev || {}), ...partial };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated: !!token, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
