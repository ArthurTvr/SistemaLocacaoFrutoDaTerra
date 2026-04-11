import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { withTimeout } from "../lib/withTimeout";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  async function carregarProfile(currentUser) {
    if (!currentUser) {
      setProfile(null);
      return;
    }

    try {
      const { data, error } = await withTimeout(
        supabase
          .from("profiles")
          .select("*")
          .eq("id", currentUser.id)
          .maybeSingle(),
        15000
      );

      if (error) throw error;

      setProfile(data ?? null);
    } catch (err) {
      console.error("Erro ao buscar profile:", err);
      setProfile(null);
    }
  }

  useEffect(() => {
    let ativo = true;

    async function init() {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          15000
        );

        if (error) throw error;

        const currentSession = data?.session ?? null;
        const currentUser = currentSession?.user ?? null;

        if (!ativo) return;

        setSession(currentSession);
        setUser(currentUser);
        await carregarProfile(currentUser);
      } catch (err) {
        console.error("Erro no auth:", err);

        if (!ativo) return;
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        if (ativo) {
          setLoadingAuth(false);
        }
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      const currentUser = newSession?.user ?? null;
      setSession(newSession ?? null);
      setUser(currentUser);
      await carregarProfile(currentUser);
      setLoadingAuth(false);
    });

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    return await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      15000
    );
  }

async function signOut() {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Erro ao sair:", err);
  } finally {
    setSession(null);
    setUser(null);
    setProfile(null);
    window.location.href = "/login";
  }
}

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loadingAuth,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }

  return context;
}