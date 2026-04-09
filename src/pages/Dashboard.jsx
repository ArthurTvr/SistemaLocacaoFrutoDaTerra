import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { withTimeout } from "../lib/withTimeout";
import { useAuth } from "../contexts/AuthContext";

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(data) {
  if (!data) return "-";
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatarDataHora(data) {
  if (!data) return "-";
  return new Date(data).toLocaleString("pt-BR");
}

function classeStatus(status) {
  const mapa = {
    solicitado: "bg-amber-50 text-amber-700",
    confirmado: "bg-blue-50 text-blue-700",
    retirado: "bg-violet-50 text-violet-700",
    devolvido: "bg-emerald-50 text-emerald-700",
    cancelado: "bg-red-50 text-red-700",
  };

  return mapa[status] || "bg-slate-100 text-slate-700";
}

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

function mesAtualPrefixo() {
  return new Date().toISOString().slice(0, 7);
}

export default function Dashboard() {
  const { user, profile } = useAuth();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [locacoes, setLocacoes] = useState([]);
  const [equipamentos, setEquipamentos] = useState([]);
  const [itensLocacao, setItensLocacao] = useState([]);

  const nome = profile?.nome || user?.email || "Administrador";
  const hoje = hojeIso();
  const mesAtual = mesAtualPrefixo();

  useEffect(() => {
    carregarDashboard();
  }, []);

  async function carregarDashboard() {
    setCarregando(true);
    setErro("");

    try {
      const [locacoesResp, equipamentosResp, itensResp] = await Promise.all([
        withTimeout(
          supabase
            .from("locacoes")
            .select(`
              id,
              data_retirada,
              data_devolucao,
              valor_total,
              status,
              created_at,
              cliente:clientes_locacao (
                nome,
                telefone
              )
            `)
            .order("created_at", { ascending: false }),
          30000
        ),
        withTimeout(
          supabase
            .from("equipamentos")
            .select("id, nome, quantidade_total, ativo"),
          30000
        ),
        withTimeout(
          supabase
            .from("itens_locacao")
            .select(`
              id,
              quantidade,
              subtotal,
              equipamento:equipamentos (
                id,
                nome
              ),
              locacao:locacoes (
                id,
                status
              )
            `),
          30000
        ),
      ]);

      if (locacoesResp.error) throw locacoesResp.error;
      if (equipamentosResp.error) throw equipamentosResp.error;
      if (itensResp.error) throw itensResp.error;

      setLocacoes(locacoesResp.data || []);
      setEquipamentos(equipamentosResp.data || []);
      setItensLocacao(itensResp.data || []);
    } catch (err) {
      console.error("Erro ao carregar dashboard:", err);
      setErro(err.message || "Erro ao carregar dashboard.");
    } finally {
      setCarregando(false);
    }
  }

  const resumo = useMemo(() => {
    const locacoesMes = locacoes.filter(
      (locacao) => locacao.data_retirada?.slice(0, 7) === mesAtual
    );

    const retiradasHoje = locacoes.filter(
      (locacao) => locacao.data_retirada === hoje
    );

    const devolucoesHoje = locacoes.filter(
      (locacao) => locacao.data_devolucao === hoje
    );

    const emAberto = locacoes.filter((locacao) =>
      ["solicitado", "confirmado", "retirado"].includes(locacao.status)
    );

    const faturamentoMes = locacoesMes
      .filter((locacao) => locacao.status !== "cancelado")
      .reduce((acc, locacao) => acc + Number(locacao.valor_total || 0), 0);

    return {
      locacoesMes: locacoesMes.length,
      retiradasHoje: retiradasHoje.length,
      devolucoesHoje: devolucoesHoje.length,
      emAberto: emAberto.length,
      faturamentoMes,
    };
  }, [locacoes, hoje, mesAtual]);

  const statusResumo = useMemo(() => {
    return {
      solicitado: locacoes.filter((l) => l.status === "solicitado").length,
      confirmado: locacoes.filter((l) => l.status === "confirmado").length,
      retirado: locacoes.filter((l) => l.status === "retirado").length,
      devolvido: locacoes.filter((l) => l.status === "devolvido").length,
      cancelado: locacoes.filter((l) => l.status === "cancelado").length,
    };
  }, [locacoes]);

  const agendaHoje = useMemo(() => {
    return {
      retiradas: locacoes.filter((locacao) => locacao.data_retirada === hoje),
      devolucoes: locacoes.filter((locacao) => locacao.data_devolucao === hoje),
    };
  }, [locacoes, hoje]);

  const ultimasLocacoes = useMemo(() => {
    return locacoes.slice(0, 6);
  }, [locacoes]);

  const alertas = useMemo(() => {
    const atrasadas = locacoes.filter(
      (locacao) =>
        locacao.data_devolucao < hoje &&
        !["devolvido", "cancelado"].includes(locacao.status)
    );

    const pendentes = locacoes.filter((locacao) => locacao.status === "solicitado");

    const poucoEstoque = equipamentos.filter(
      (equipamento) => Number(equipamento.quantidade_total || 0) <= 1
    );

    return {
      atrasadas,
      pendentes,
      poucoEstoque,
    };
  }, [locacoes, equipamentos, hoje]);

  const topEquipamentos = useMemo(() => {
    const contador = {};

    itensLocacao.forEach((item) => {
      if (item.locacao?.status === "cancelado") return;

      const nome = item.equipamento?.nome || "Equipamento";
      if (!contador[nome]) {
        contador[nome] = 0;
      }
      contador[nome] += Number(item.quantidade || 0);
    });

    return Object.entries(contador)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }, [itensLocacao]);

  if (carregando) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm text-slate-600">
        Carregando dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-800">Olá, {nome}</h1>
        <p className="mt-2 text-slate-600">
          Aqui está o resumo da operação da locadora.
        </p>
      </div>

      {erro && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {erro}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Locações do mês</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {resumo.locacoesMes}
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Retiradas hoje</p>
          <h2 className="mt-2 text-2xl font-bold text-blue-700">
            {resumo.retiradasHoje}
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Devoluções hoje</p>
          <h2 className="mt-2 text-2xl font-bold text-emerald-700">
            {resumo.devolucoesHoje}
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Locações em aberto</p>
          <h2 className="mt-2 text-2xl font-bold text-amber-700">
            {resumo.emAberto}
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Faturamento previsto</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {formatarMoeda(resumo.faturamentoMes)}
          </h2>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800">Agenda de hoje</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-800">Retiradas</h3>

              {agendaHoje.retiradas.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  Nenhuma retirada para hoje.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {agendaHoje.retiradas.map((locacao) => (
                    <div key={locacao.id} className="rounded-xl bg-slate-50 p-3">
                      <p className="font-medium text-slate-800">
                        {locacao.cliente?.nome || "-"}
                      </p>
                      <p className="text-sm text-slate-600">
                        Telefone: {locacao.cliente?.telefone || "-"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-800">Devoluções</h3>

              {agendaHoje.devolucoes.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  Nenhuma devolução para hoje.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {agendaHoje.devolucoes.map((locacao) => (
                    <div key={locacao.id} className="rounded-xl bg-slate-50 p-3">
                      <p className="font-medium text-slate-800">
                        {locacao.cliente?.nome || "-"}
                      </p>
                      <p className="text-sm text-slate-600">
                        Telefone: {locacao.cliente?.telefone || "-"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800">
            Status das locações
          </h2>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {Object.entries(statusResumo).map(([status, quantidade]) => (
              <div
                key={status}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <div
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classeStatus(
                    status
                  )}`}
                >
                  {status}
                </div>
                <p className="mt-3 text-2xl font-bold text-slate-800">
                  {quantidade}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm max-h-[60vh] md:h-[65vh] md:max-h-none flex flex-col">
          <h2 className="text-xl font-semibold text-slate-800">
            Últimas locações
          </h2>

          {ultimasLocacoes.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Nenhuma locação encontrada.
            </p>
          ) : (
            <div className="mt-5 flex-1 space-y-4 overflow-y-auto pr-2">
              {ultimasLocacoes.map((locacao) => (
                <div
                  key={locacao.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-800">
                        {locacao.cliente?.nome || "-"}
                      </h3>
                      <p className="text-sm text-slate-600">
                        Retirada: {formatarData(locacao.data_retirada)}
                      </p>
                      <p className="text-sm text-slate-600">
                        Devolução: {formatarData(locacao.data_devolucao)}
                      </p>
                      <p className="text-sm text-slate-600">
                        Criado em: {formatarDataHora(locacao.created_at)}
                      </p>
                    </div>

                    <div className="text-right">
                      <div
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classeStatus(
                          locacao.status
                        )}`}
                      >
                        {locacao.status}
                      </div>
                      <p className="mt-3 font-bold text-slate-800">
                        {formatarMoeda(locacao.valor_total)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-800">Alertas</h2>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="font-semibold text-red-700">Devoluções atrasadas</p>
                <p className="mt-2 text-2xl font-bold text-red-800">
                  {alertas.atrasadas.length}
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-semibold text-amber-700">
                  Solicitações aguardando confirmação
                </p>
                <p className="mt-2 text-2xl font-bold text-amber-800">
                  {alertas.pendentes.length}
                </p>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <p className="font-semibold text-blue-700">
                  Equipamentos com quantidade baixa
                </p>
                <p className="mt-2 text-2xl font-bold text-blue-800">
                  {alertas.poucoEstoque.length}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-800">
              Itens mais alugados
            </h2>

            {topEquipamentos.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                Ainda não há dados suficientes.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {topEquipamentos.map((item, index) => (
                  <div
                    key={item.nome}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                        {index + 1}
                      </div>
                      <p className="font-medium text-slate-800">{item.nome}</p>
                    </div>

                    <p className="font-bold text-slate-800">{item.quantidade}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}