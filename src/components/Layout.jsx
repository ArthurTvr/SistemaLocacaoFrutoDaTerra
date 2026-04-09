import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const location = useLocation();
  const { user, profile, signOut } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);

  const links = [
    { to: "/", label: "Dashboard" },
    { to: "/equipamentos", label: "Equipamentos" },
    { to: "/locacoes", label: "Locações" },
  ];

  useEffect(() => {
    setMenuAberto(false);
  }, [location.pathname]);

  async function handleLogout() {
    await signOut();
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        {menuAberto && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setMenuAberto(false)}
          />
        )}

        <aside
          className={`fixed left-0 top-0 z-40 flex min-h-[100dvh] w-72 flex-col bg-slate-900 p-5 text-white shadow-xl transition-transform duration-300 lg:static lg:w-64 lg:min-h-screen lg:translate-x-0 lg:shadow-none ${
            menuAberto ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div>
            <h1 className="text-2xl font-bold">Sistema de Locação Fruto da Terra</h1>

            <p className="mt-3 text-sm text-slate-300">
              {profile?.nome || "Administrador"}
            </p>

            <p className="text-xs uppercase text-emerald-400">
              {profile?.role || "admin"}
            </p>

            <p className="mt-1 text-xs text-slate-400 break-all">
              {user?.email}
            </p>

            <nav className="mt-8 space-y-2">
              {links.map((link) => {
                const ativo = location.pathname === link.to;

                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${
                      ativo
                        ? "bg-emerald-500 text-white"
                        : "text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <button
            onClick={handleLogout}
            className="mt-auto rounded-xl bg-red-500 px-4 py-3 font-semibold text-white hover:bg-red-600"
          >
            Sair
          </button>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                type="button"
                onClick={() => setMenuAberto(true)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Menu
              </button>

              <div className="text-right">
                <p className="text-sm font-semibold text-slate-800">
                  {profile?.nome || "Administrador"}
                </p>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-5 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
