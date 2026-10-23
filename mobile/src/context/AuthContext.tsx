import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api";

type User = { id: string; name: string; empId: string; role: string };
type Ctx = {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (empId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({} as Ctx);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem("token");
      const u = await AsyncStorage.getItem("user");
      if (t && u) {
        setToken(t);
        setUser(JSON.parse(u));
      }
      setLoading(false);
    })();
  }, []);

  const login = async (empId: string, password: string) => {
    const data = await api("/auth/login", { method: "POST", body: { empId, password } });
    setToken(data.token);
    setUser(data.user);
    Promise.all([
      AsyncStorage.setItem("token", data.token),
      AsyncStorage.setItem("user", JSON.stringify(data.user)),
    ]).catch(() => undefined);
  };

  const logout = async () => {
    await Promise.all([AsyncStorage.removeItem("token"), AsyncStorage.removeItem("user")]);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
