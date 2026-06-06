// Auth context + hook + storage keys. Kept separate from the provider component
// so this file exports no components (satisfies react-refresh fast-refresh).
import { createContext, useContext } from "react";

export const TOKEN_KEY = "brainy_token";
export const USER_KEY = "brainy_user";

export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
