import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { withTimeout } from "../lib/withTimeout";

const STATUS_OPTIONS = [
  "solicitado",
  "confirmado",
  "retirado",
  "devolvido",
  "cancelado",
];

function traduzirErro(err) {
  if (!err) return "Ocorreu um erro inesperado.";
  if (err.message === "A operação demorou demais.") {
    return "A operação demorou demais. Tente novamente.";
  }
  return err.message || "Ocorreu um erro inesperado.";
}

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

function formatarFormaPagamento(valor) {
  const mapa = {
    pix: "Pix",
    cartao_credito: "Cartão de crédito",
  };

  return mapa[valor] || valor || "-";
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

function obterChaveMes(dataRetirada) {
  if (!dataRetirada) return "sem-data";
  const [ano, mes] = dataRetirada.split("-");
  return `${ano}-${mes}`;
}

function obterTituloMes(dataRetirada) {
  if (!dataRetirada) return "Sem data de retirada";
  return new Date(`${dataRetirada}T00:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

export default function Locacoes() {
  const ativoRef = useRef(true);
  const audioRef = useRef(null);
  const ultimoIdRef = useRef(null);
  const primeiraCargaRef = useRef(true);

  const [locacoes, setLocacoes] = useState([]);
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const [atualizandoLista, setAtualizandoLista] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [locacaoSelecionada, setLocacaoSelecionada] = useState(null);
  const [atualizandoStatusId, setAtualizandoStatusId] = useState(null);

  useEffect(() => {
    ativoRef.current = true;
    buscarLocacoes();

    const intervalo = setInterval(() => {
      buscarLocacoes(false, true);
    }, 15000);

    return () => {
      ativoRef.current = false;
      clearInterval(intervalo);
    };
  }, []);

  async function buscarLocacoes(
    forcarSilencio = false,
    ehAtualizacaoSilenciosa = false,
  ) {
    if (ativoRef.current) {
      if (ehAtualizacaoSilenciosa) {
        setAtualizandoLista(true);
      } else {
        setCarregandoInicial(true);
      }
      setErro("");
    }

    try {
      const { data, error } = await withTimeout(
        supabase
          .from("locacoes")
          .select(
            `
            id,
            data_retirada,
            data_devolucao,
            forma_pagamento,
            observacoes,
            valor_total,
            status,
            created_at,
            entregue_em,
            vem_com_agencia,
            nome_agencia,
            cliente:clientes_locacao (
              id,
              nome,
              cpf,
              telefone
            ),
            itens_locacao (
              id,
              quantidade,
              valor_diaria,
              quantidade_dias,
              subtotal,
              tamanho,
              numeracao,
              equipamento:equipamentos (
                id,
                nome,
                imagem_url,
                categoria
              )
            )
          `,
          )
          .order("id", { ascending: false }),
        30000,
      );

      if (error) throw error;

      const novaLista = data || [];

      if (novaLista.length > 0) {
        const maiorIdAtual = novaLista[0].id;

        if (primeiraCargaRef.current) {
          ultimoIdRef.current = maiorIdAtual;
          primeiraCargaRef.current = false;
        } else if (
          !forcarSilencio &&
          ultimoIdRef.current !== null &&
          maiorIdAtual > ultimoIdRef.current
        ) {
          ultimoIdRef.current = maiorIdAtual;

          try {
            await audioRef.current?.play();
          } catch (audioErr) {
            console.warn(
              "Não foi possível tocar o som automaticamente.",
              audioErr,
            );
          }
        } else {
          ultimoIdRef.current = maiorIdAtual;
        }
      }

      if (ativoRef.current) {
        setLocacoes(novaLista);
      }
    } catch (err) {
      console.error("Erro ao buscar locações:", err);

      if (ativoRef.current) {
        setErro(traduzirErro(err));
      }
    } finally {
      if (ativoRef.current) {
        setCarregandoInicial(false);
        setAtualizandoLista(false);
      }
    }
  }

  async function atualizarStatus(locacaoId, novoStatus) {
    setAtualizandoStatusId(locacaoId);
    setErro("");
    setMensagem("");

    try {
      const payload = {
        status: novoStatus,
        entregue_em:
          novoStatus === "devolvido" ? new Date().toISOString() : null,
      };

      const { error } = await withTimeout(
        supabase.from("locacoes").update(payload).eq("id", locacaoId),
        30000,
      );

      if (error) throw error;

      if (ativoRef.current) {
        setMensagem(`Locação atualizada para "${novoStatus}".`);
      }

      await buscarLocacoes(true, true);
    } catch (err) {
      console.error("Erro ao atualizar status:", err);

      if (ativoRef.current) {
        setErro(traduzirErro(err));
      }
    } finally {
      if (ativoRef.current) {
        setAtualizandoStatusId(null);
      }
    }
  }

  function imprimirLocacao(locacao) {
    const itensHtml = (locacao.itens_locacao || [])
      .map((item) => {
        const detalhesExtras = [
          item.tamanho ? `Tamanho: ${item.tamanho}` : null,
          item.numeracao ? `Numeração: ${item.numeracao}` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        return `
        <div class="item">
          <div class="linha forte">${item.equipamento?.nome || "-"}</div>
          <div class="linha">
            Qtd: ${item.quantidade} | Dias: ${item.quantidade_dias}
          </div>
          <div class="linha">
            Diária: ${formatarMoeda(item.valor_diaria)}
          </div>
          <div class="linha forte">
            Subtotal: ${formatarMoeda(item.subtotal)}
          </div>
          ${detalhesExtras ? `<div class="linha pequeno">${detalhesExtras}</div>` : ""}
        </div>
      `;
      })
      .join("");

    const entradaReserva = Number(locacao.valor_total || 0) / 2;
    const restantePagar = Number(locacao.valor_total || 0) - entradaReserva;

    const html = `
    <html>
      <head>
        <title>Pedido de Locação</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 4mm;
          }

          body {
            font-family: Arial, sans-serif;
            width: 72mm;
            margin: 0 auto;
            color: #000;
            font-size: 12px;
            line-height: 1.35;
          }

          .cupom {
            width: 100%;
          }

          .centro {
            text-align: center;
          }

          .titulo {
            font-size: 16px;
            font-weight: 700;
            margin-bottom: 6px;
          }

          .subtitulo {
            font-size: 12px;
            margin-bottom: 10px;
          }

          .bloco {
            margin: 10px 0;
          }

          .linha {
            margin: 2px 0;
            word-break: break-word;
          }

          .forte {
            font-weight: 700;
          }

          .pequeno {
            font-size: 11px;
          }

          .divisor {
            border-top: 1px dashed #000;
            margin: 10px 0;
          }

          .item {
            margin-bottom: 10px;
          }

          .total {
            font-size: 15px;
            font-weight: 700;
            text-align: center;
            margin-top: 10px;
          }

          .obs {
            white-space: pre-wrap;
            word-break: break-word;
          }
        </style>
      </head>
      <body>
        <div class="cupom">
          <div class="centro">
            <div class="titulo">FRUTO DA TERRA</div>
            <div class="subtitulo">Pedido de Locação</div>
          </div>

          <div class="divisor"></div>

          <div class="bloco">
            <div class="linha"><span class="forte">Cliente:</span> ${locacao.cliente?.nome || "-"}</div>
            <div class="linha"><span class="forte">CPF:</span> ${locacao.cliente?.cpf || "-"}</div>
            <div class="linha"><span class="forte">Telefone:</span> ${locacao.cliente?.telefone || "-"}</div>
            <div class="linha"><span class="forte">Retirada:</span> ${formatarData(locacao.data_retirada)}</div>
            <div class="linha"><span class="forte">Devolução:</span> ${formatarData(locacao.data_devolucao)}</div>
            <div class="linha"><span class="forte">Agência:</span> ${locacao.vem_com_agencia ? "Sim" : "Não"}</div>
${locacao.vem_com_agencia ? `<div class="linha"><span class="forte">Nome da agência:</span> ${locacao.nome_agencia || "-"}</div>` : ""}
            <div class="linha"><span class="forte">Pagamento:</span> ${formatarFormaPagamento(locacao.forma_pagamento)}</div>
            <div class="linha"><span class="forte">Status:</span> ${locacao.status}</div>
          </div>

          <div class="divisor"></div>

          <div class="bloco">
            <div class="linha forte">ITENS</div>
            ${itensHtml || '<div class="linha">Nenhum item.</div>'}
          </div>

          <div class="divisor"></div>

          <div class="total">
            TOTAL: ${formatarMoeda(locacao.valor_total)}
          </div>
          <div class="bloco">
             <div class="linha forte">Entrada (50%):${formatarMoeda(entradaReserva)}</div>
              <div class="linha forte">Restante a pagar: ${formatarMoeda(restantePagar)}</div>
          </div>
          ${
            locacao.observacoes
              ? `
                <div class="divisor"></div>
                <div class="bloco">
                  <div class="linha forte">OBSERVAÇÕES</div>
                  <div class="linha obs pequeno">${locacao.observacoes}</div>
                </div>
              `
              : ""
          }

          <div class="divisor"></div>

          <div class="centro pequeno">
            <div>Impresso em ${new Date().toLocaleString("pt-BR")}</div>
          </div>
        </div>

        <script>
          window.onload = function () {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

    const novaJanela = window.open("", "_blank", "width=420,height=800");
    if (!novaJanela) return;

    novaJanela.document.write(html);
    novaJanela.document.close();
  }

  const locacoesFiltradas = useMemo(() => {
    return locacoes.filter((locacao) => {
      if (!filtroStatus) return true;
      return locacao.status === filtroStatus;
    });
  }, [locacoes, filtroStatus]);

  const locacoesAgrupadasPorMes = useMemo(() => {
    const grupos = locacoesFiltradas.reduce((acc, locacao) => {
      const chave = obterChaveMes(locacao.data_retirada);
      const titulo = obterTituloMes(locacao.data_retirada);

      if (!acc[chave]) {
        acc[chave] = {
          chave,
          titulo,
          itens: [],
        };
      }

      acc[chave].itens.push(locacao);
      return acc;
    }, {});

    return Object.values(grupos).sort((a, b) => b.chave.localeCompare(a.chave));
  }, [locacoesFiltradas]);

  const resumo = useMemo(() => {
    return {
      total: locacoes.length,
      solicitadas: locacoes.filter((l) => l.status === "solicitado").length,
      retiradas: locacoes.filter((l) => l.status === "retirado").length,
      devolvidas: locacoes.filter((l) => l.status === "devolvido").length,
    };
  }, [locacoes]);

  return (
    <div className="space-y-6">
      <audio ref={audioRef} preload="auto">
        <source src="/notificacao.mp3" type="audio/mpeg" />
      </audio>

      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-800">Locações</h1>
        <p className="mt-2 text-slate-600">
          Gerencie os pedidos de locação recebidos pelo sistema.
        </p>
      </div>

      {erro && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {erro}
        </div>
      )}

      {mensagem && (
        <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {mensagem}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total de locações</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {resumo.total}
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Solicitadas</p>
          <h2 className="mt-2 text-2xl font-bold text-amber-700">
            {resumo.solicitadas}
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Retiradas</p>
          <h2 className="mt-2 text-2xl font-bold text-violet-700">
            {resumo.retiradas}
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Devolvidas</p>
          <h2 className="mt-2 text-2xl font-bold text-emerald-700">
            {resumo.devolvidas}
          </h2>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm max-h-[62vh] md:h-[78vh] md:max-h-none flex flex-col">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">
              Pedidos de locação
            </h2>
            {atualizandoLista && (
              <p className="mt-1 text-sm text-slate-500">
                Atualizando pedidos...
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 outline-none focus:border-emerald-500"
            >
              <option value="">Todos os status</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <button
              onClick={() => buscarLocacoes(true, true)}
              disabled={atualizandoLista}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {atualizandoLista ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>

        {carregandoInicial ? (
          <div className="mt-6 text-slate-600">Carregando locações...</div>
        ) : locacoesAgrupadasPorMes.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-slate-500">
            Nenhuma locação encontrada.
          </div>
        ) : (
          <div className="mt-6 flex-1 space-y-6 overflow-y-auto pr-2">
            {locacoesAgrupadasPorMes.map((grupo) => (
              <div key={grupo.chave} className="space-y-4">
                <div className="sticky top-0 z-10 rounded-2xl bg-slate-100 px-4 py-3">
                  <h3 className="text-lg font-semibold capitalize text-slate-800">
                    {grupo.titulo}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {grupo.itens.length} locação(ões)
                  </p>
                </div>

                {grupo.itens.map((locacao) => (
                  <div
                    key={locacao.id}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-800">
                          {locacao.cliente?.nome || "Cliente não encontrado"}
                        </h3>

                        <p className="text-sm text-slate-600">
                          CPF: {locacao.cliente?.cpf || "-"}
                        </p>

                        <p className="text-sm text-slate-600">
                          Telefone: {locacao.cliente?.telefone || "-"}
                        </p>

                        <p className="text-sm text-slate-600">
                          Retirada: {formatarData(locacao.data_retirada)}
                        </p>

                        <p className="text-sm text-slate-600">
                          Devolução: {formatarData(locacao.data_devolucao)}
                        </p>

                        <p className="text-sm text-slate-600">
                          Pagamento:{" "}
                          {formatarFormaPagamento(locacao.forma_pagamento)}
                        </p>
                        <p className="text-sm text-slate-600">
                          Agência: {locacao.vem_com_agencia ? "Sim" : "Não"}
                        </p>

                        {locacao.vem_com_agencia && (
                          <p className="text-sm text-slate-600">
                            Nome da agência: {locacao.nome_agencia || "-"}
                          </p>
                        )}
                        <p className="text-sm text-slate-600">
                          Criado em: {formatarDataHora(locacao.created_at)}
                        </p>

                        <div
                          className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classeStatus(
                            locacao.status,
                          )}`}
                        >
                          {locacao.status}
                        </div>

                        <p className="mt-3 text-base font-bold text-slate-800">
                          Total: {formatarMoeda(locacao.valor_total)}
                        </p>
                      </div>

                      <div className="min-w-[250px] space-y-2">
                        <p className="text-sm font-medium text-slate-700">
                          Alterar status
                        </p>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {STATUS_OPTIONS.map((status) => (
                            <button
                              key={status}
                              onClick={() =>
                                atualizarStatus(locacao.id, status)
                              }
                              disabled={
                                atualizandoStatusId === locacao.id ||
                                locacao.status === status
                              }
                              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {status}
                            </button>
                          ))}
                        </div>

                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => setLocacaoSelecionada(locacao)}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                          >
                            Ver detalhes
                          </button>

                          <button
                            onClick={() => imprimirLocacao(locacao)}
                            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
                          >
                            Imprimir
                          </button>
                        </div>
                      </div>
                    </div>

                    {locacao.observacoes && (
                      <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        Observações: {locacao.observacoes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {locacaoSelecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setLocacaoSelecionada(null)}
              className="absolute right-4 top-4 rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Fechar
            </button>

            <h3 className="mb-4 pr-16 text-2xl font-bold text-slate-800">
              Detalhes da locação
            </h3>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2 text-sm text-slate-700">
                <p>
                  <span className="font-semibold text-slate-800">Cliente:</span>{" "}
                  {locacaoSelecionada.cliente?.nome || "-"}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">CPF:</span>{" "}
                  {locacaoSelecionada.cliente?.cpf || "-"}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">
                    Telefone:
                  </span>{" "}
                  {locacaoSelecionada.cliente?.telefone || "-"}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">
                    Retirada:
                  </span>{" "}
                  {formatarData(locacaoSelecionada.data_retirada)}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">
                    Devolução:
                  </span>{" "}
                  {formatarData(locacaoSelecionada.data_devolucao)}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">
                    Pagamento:
                  </span>{" "}
                  {formatarFormaPagamento(locacaoSelecionada.forma_pagamento)}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Agência:</span>{" "}
                  {locacaoSelecionada.vem_com_agencia ? "Sim" : "Não"}
                </p>
                {locacaoSelecionada.vem_com_agencia && (
                  <p>
                    <span className="font-semibold text-slate-800">
                      Nome da agência:
                    </span>{" "}
                    {locacaoSelecionada.nome_agencia || "-"}
                  </p>
                )}
                <p>
                  <span className="font-semibold text-slate-800">Status:</span>{" "}
                  {locacaoSelecionada.status}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">
                    Criado em:
                  </span>{" "}
                  {formatarDataHora(locacaoSelecionada.created_at)}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Total:</span>{" "}
                  {formatarMoeda(locacaoSelecionada.valor_total)}
                </p>
              </div>

              <div>
                <h4 className="text-lg font-semibold text-slate-800">Itens</h4>

                {locacaoSelecionada.itens_locacao?.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Nenhum item encontrado.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3 max-h-[45vh] overflow-y-auto pr-2">
                    {locacaoSelecionada.itens_locacao?.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200 p-3"
                      >
                        <div className="flex gap-3">
                          {item.equipamento?.imagem_url && (
                            <img
                              src={item.equipamento.imagem_url}
                              alt={item.equipamento?.nome || "Equipamento"}
                              className="h-20 w-20 rounded-xl bg-slate-100 object-contain p-1"
                            />
                          )}

                          <div className="flex-1">
                            <p className="font-medium text-slate-800">
                              {item.equipamento?.nome || "Equipamento"}
                            </p>

                            {item.equipamento?.categoria && (
                              <p className="text-sm text-slate-600">
                                Categoria: {item.equipamento.categoria}
                              </p>
                            )}

                            <p className="text-sm text-slate-600">
                              Quantidade: {item.quantidade}
                            </p>
                            <p className="text-sm text-slate-600">
                              Dias: {item.quantidade_dias}
                            </p>
                            <p className="text-sm text-slate-600">
                              Diária: {formatarMoeda(item.valor_diaria)}
                            </p>

                            {item.tamanho && (
                              <p className="text-sm text-slate-600">
                                Tamanho: {item.tamanho}
                              </p>
                            )}

                            {item.numeracao && (
                              <p className="text-sm text-slate-600">
                                Numeração: {item.numeracao}
                              </p>
                            )}

                            <p className="text-sm font-semibold text-slate-800">
                              Subtotal: {formatarMoeda(item.subtotal)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {locacaoSelecionada.observacoes && (
              <div className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Observações: {locacaoSelecionada.observacoes}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
