import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { withTimeout } from "../lib/withTimeout";

const FORM_INICIAL = {
  nome: "",
  telefone: "",
  data_retirada: "",
  data_devolucao: "",
  forma_pagamento: "pix",
  observacoes: "",
};

const FORMAS_PAGAMENTO = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "cartao_debito", label: "Cartão de débito" },
  { value: "boleto", label: "Boleto" },
  { value: "prazo", label: "A prazo" },
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

function calcularQuantidadeDias(dataRetirada, dataDevolucao) {
  if (!dataRetirada || !dataDevolucao) return 0;

  const retirada = new Date(`${dataRetirada}T00:00:00`);
  const devolucao = new Date(`${dataDevolucao}T00:00:00`);

  const diffMs = devolucao - retirada;
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return diffDias > 0 ? diffDias : 0;
}

export default function SolicitarLocacao() {
  const ativoRef = useRef(true);

  const [equipamentos, setEquipamentos] = useState([]);
  const [itens, setItens] = useState([]);
  const [form, setForm] = useState(FORM_INICIAL);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [modalEquipamentosAberto, setModalEquipamentosAberto] = useState(false);
  const [equipamentoModalSelecionado, setEquipamentoModalSelecionado] =
    useState(null);
  const [quantidadeModal, setQuantidadeModal] = useState("1");

  const quantidadeDias = useMemo(() => {
    return calcularQuantidadeDias(form.data_retirada, form.data_devolucao);
  }, [form.data_retirada, form.data_devolucao]);

  const totalLocacao = useMemo(() => {
    return itens.reduce((acc, item) => acc + Number(item.subtotal || 0), 0);
  }, [itens]);

  useEffect(() => {
    ativoRef.current = true;
    buscarEquipamentos();

    return () => {
      ativoRef.current = false;
    };
  }, []);

  async function buscarEquipamentos() {
    if (ativoRef.current) {
      setCarregando(true);
      setErro("");
    }

    try {
      const { data, error } = await withTimeout(
        supabase
          .from("equipamentos")
          .select("*")
          .eq("ativo", true)
          .order("nome", { ascending: true }),
        30000,
      );

      if (error) throw error;

      if (ativoRef.current) {
        setEquipamentos(data || []);
      }
    } catch (err) {
      console.error("Erro ao buscar equipamentos:", err);

      if (ativoRef.current) {
        setErro(traduzirErro(err));
        setEquipamentos([]);
      }
    } finally {
      if (ativoRef.current) {
        setCarregando(false);
      }
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function limparTudo() {
    setForm(FORM_INICIAL);
    setItens([]);
    setErro("");
    setMensagem("");
    setEquipamentoModalSelecionado(null);
    setQuantidadeModal("1");
    setModalEquipamentosAberto(false);
  }

  function abrirModalEquipamentos() {
    setErro("");
    setMensagem("");

    if (!form.data_retirada || !form.data_devolucao) {
      setErro(
        "Informe a data de retirada e a data de devolução antes de adicionar equipamentos.",
      );
      return;
    }

    if (quantidadeDias <= 0) {
      setErro("A data de devolução deve ser maior que a data de retirada.");
      return;
    }

    setModalEquipamentosAberto(true);
  }

  function fecharModalEquipamentos() {
    setModalEquipamentosAberto(false);
    setEquipamentoModalSelecionado(null);
    setQuantidadeModal("1");
  }

  function adicionarItemDoModal() {
    setErro("");
    setMensagem("");

    if (!equipamentoModalSelecionado) {
      setErro("Selecione um equipamento.");
      return;
    }

    const quantidade = Number(String(quantidadeModal).replace(",", ".").trim());

    if (!form.data_retirada || !form.data_devolucao) {
      setErro(
        "Informe a data de retirada e a data de devolução antes de adicionar equipamentos.",
      );
      return;
    }

    if (quantidadeDias <= 0) {
      setErro("A data de devolução deve ser maior que a data de retirada.");
      return;
    }

    if (
      Number.isNaN(quantidade) ||
      quantidade <= 0 ||
      !Number.isInteger(quantidade)
    ) {
      setErro("Informe uma quantidade válida.");
      return;
    }

    const itemExistente = itens.find(
      (item) =>
        String(item.equipamento_id) === String(equipamentoModalSelecionado.id),
    );

    const subtotalNovoItem =
      quantidade *
      Number(equipamentoModalSelecionado.valor_diaria) *
      quantidadeDias;

    if (itemExistente) {
      const atualizados = itens.map((item) => {
        if (
          String(item.equipamento_id) !== String(equipamentoModalSelecionado.id)
        ) {
          return item;
        }

        const novaQuantidade = Number(item.quantidade) + quantidade;
        const novoSubtotal =
          novaQuantidade *
          Number(item.valor_diaria) *
          Number(item.quantidade_dias);

        return {
          ...item,
          quantidade: novaQuantidade,
          subtotal: novoSubtotal,
        };
      });

      setItens(atualizados);
    } else {
      setItens((prev) => [
        ...prev,
        {
          equipamento_id: equipamentoModalSelecionado.id,
          equipamento_nome: equipamentoModalSelecionado.nome,
          imagem_url: equipamentoModalSelecionado.imagem_url || "",
          quantidade,
          valor_diaria: Number(equipamentoModalSelecionado.valor_diaria),
          quantidade_dias: quantidadeDias,
          subtotal: subtotalNovoItem,
        },
      ]);
    }

    setQuantidadeModal("1");
    setEquipamentoModalSelecionado(null);
    setMensagem("Equipamento adicionado ao carrinho.");
  }
  function removerItem(equipamentoId) {
    setItens((prev) =>
      prev.filter(
        (item) => String(item.equipamento_id) !== String(equipamentoId),
      ),
    );
  }

  async function buscarOuCriarCliente() {
    const telefoneLimpo = form.telefone.trim();

    const { data: clienteExistente, error: erroBusca } = await withTimeout(
      supabase
        .from("clientes_locacao")
        .select("*")
        .eq("telefone", telefoneLimpo)
        .maybeSingle(),
      30000,
    );

    if (erroBusca) throw erroBusca;

    if (clienteExistente) {
      return clienteExistente;
    }

    const { data: novoCliente, error: erroCriacao } = await withTimeout(
      supabase
        .from("clientes_locacao")
        .insert({
          nome: form.nome.trim(),
          telefone: telefoneLimpo || null,
        })
        .select()
        .single(),
      30000,
    );

    if (erroCriacao) throw erroCriacao;

    return novoCliente;
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.nome.trim()) {
      setErro("Informe seu nome.");
      return;
    }

    if (!form.telefone.trim()) {
      setErro("Informe seu telefone.");
      return;
    }

    if (!form.data_retirada || !form.data_devolucao) {
      setErro("Informe a data de retirada e devolução.");
      return;
    }

    if (quantidadeDias <= 0) {
      setErro("A data de devolução deve ser maior que a data de retirada.");
      return;
    }

    if (itens.length === 0) {
      setErro("Adicione pelo menos um equipamento.");
      return;
    }

    setSalvando(true);
    setErro("");
    setMensagem("");

    let locacaoCriada = null;

    try {
      const cliente = await buscarOuCriarCliente();

      const { data, error } = await withTimeout(
        supabase
          .from("locacoes")
          .insert({
            cliente_id: cliente.id,
            data_retirada: form.data_retirada,
            data_devolucao: form.data_devolucao,
            forma_pagamento: form.forma_pagamento,
            observacoes: form.observacoes.trim() || null,
            valor_total: totalLocacao,
            status: "solicitado",
          })
          .select()
          .single(),
        30000,
      );

      if (error) throw error;

      locacaoCriada = data;

      const itensParaSalvar = itens.map((item) => ({
        locacao_id: locacaoCriada.id,
        equipamento_id: item.equipamento_id,
        quantidade: item.quantidade,
        valor_diaria: item.valor_diaria,
        quantidade_dias: item.quantidade_dias,
        subtotal: item.subtotal,
      }));

      const { error: erroItens } = await withTimeout(
        supabase.from("itens_locacao").insert(itensParaSalvar),
        30000,
      );

      if (erroItens) throw erroItens;

      if (ativoRef.current) {
        setMensagem(
          "Solicitação enviada com sucesso! Em breve entraremos em contato.",
        );
        setForm(FORM_INICIAL);
        setItens([]);
      }
    } catch (err) {
      console.error("Erro ao salvar locação:", err);

      if (locacaoCriada?.id) {
        try {
          await withTimeout(
            supabase
              .from("itens_locacao")
              .delete()
              .eq("locacao_id", locacaoCriada.id),
            5000,
          );
        } catch (rollbackItensErr) {
          console.error("Erro ao desfazer itens da locação:", rollbackItensErr);
        }

        try {
          await withTimeout(
            supabase.from("locacoes").delete().eq("id", locacaoCriada.id),
            5000,
          );
        } catch (rollbackLocacaoErr) {
          console.error("Erro ao desfazer locação:", rollbackLocacaoErr);
        }
      }

      if (ativoRef.current) {
        setErro(traduzirErro(err));
      }
    } finally {
      if (ativoRef.current) {
        setSalvando(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-800">
            Solicitar locação
          </h1>
          <p className="mt-2 text-slate-600">
            Escolha os equipamentos, informe as datas e envie sua solicitação.
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

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-800">
              Seus dados e locação
            </h2>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nome
                </label>
                <input
                  type="text"
                  name="nome"
                  value={form.nome}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  placeholder="Seu nome"
                  disabled={salvando}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Telefone
                </label>
                <input
                  type="text"
                  name="telefone"
                  value={form.telefone}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  placeholder="Seu telefone"
                  disabled={salvando}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Data de retirada
                </label>
                <input
                  type="date"
                  name="data_retirada"
                  value={form.data_retirada}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  disabled={salvando}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Data de devolução
                </label>
                <input
                  type="date"
                  name="data_devolucao"
                  value={form.data_devolucao}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  disabled={salvando}
                />
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <h3 className="text-base font-semibold text-slate-800">
                  Equipamentos
                </h3>

                <div className="mt-4 space-y-3">
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Quantidade de diárias: {quantidadeDias}
                  </div>

                  <button
                    type="button"
                    onClick={abrirModalEquipamentos}
                    className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800"
                    disabled={salvando || carregando}
                  >
                    Adicionar equipamentos
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Forma de pagamento
                </label>
                <select
                  name="forma_pagamento"
                  value={form.forma_pagamento}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  disabled={salvando}
                >
                  {FORMAS_PAGAMENTO.map((forma) => (
                    <option key={forma.value} value={forma.value}>
                      {forma.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Observações
                </label>
                <textarea
                  name="observacoes"
                  value={form.observacoes}
                  onChange={handleChange}
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  placeholder="Observações"
                  disabled={salvando}
                />
              </div>

              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-sm text-slate-500">Total da locação</p>
                <p className="text-2xl font-bold text-slate-800">
                  {formatarMoeda(totalLocacao)}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                >
                  {salvando ? "Enviando..." : "Enviar solicitação"}
                </button>

                <button
                  type="button"
                  onClick={limparTudo}
                  disabled={salvando}
                  className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Limpar
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm max-h-[60vh] md:h-[70vh] md:max-h-none flex flex-col">
            <h2 className="text-xl font-semibold text-slate-800">
              Carrinho da locação
            </h2>

            {itens.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-slate-500">
                Nenhum equipamento adicionado.
              </div>
            ) : (
              <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-2">
                {itens.map((item) => (
                  <div
                    key={item.equipamento_id}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="flex gap-4">
                      {item.imagem_url ? (
                        <img
                          src={item.imagem_url}
                          alt={item.equipamento_nome}
                          className="h-24 w-24 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-500">
                          Sem imagem
                        </div>
                      )}

                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-800">
                          {item.equipamento_nome}
                        </h3>
                        <p className="text-sm text-slate-600">
                          Quantidade: {item.quantidade}
                        </p>
                        <p className="text-sm text-slate-600">
                          Diárias: {item.quantidade_dias}
                        </p>
                        <p className="text-sm text-slate-600">
                          Valor da diária: {formatarMoeda(item.valor_diaria)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          Subtotal: {formatarMoeda(item.subtotal)}
                        </p>

                        <button
                          type="button"
                          onClick={() => removerItem(item.equipamento_id)}
                          className="mt-3 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

{modalEquipamentosAberto && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-6 shadow-xl">
      <button
        type="button"
        onClick={fecharModalEquipamentos}
        className="absolute right-4 top-4 rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200"
      >
        Fechar
      </button>

      <h3 className="mb-4 pr-16 text-2xl font-bold text-slate-800">
        Escolher equipamentos
      </h3>

      <div className="grid flex-1 gap-6 overflow-hidden lg:grid-cols-[1fr_320px]">
        <div className="overflow-y-auto pr-2">
          {carregando ? (
            <div className="text-slate-600">Carregando equipamentos...</div>
          ) : equipamentos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-slate-500">
              Nenhum equipamento disponível no momento.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {equipamentos.map((equipamento) => (
                <button
                  key={equipamento.id}
                  type="button"
                  onClick={() => setEquipamentoModalSelecionado(equipamento)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    equipamentoModalSelecionado?.id === equipamento.id
                      ? "border-emerald-500 ring-2 ring-emerald-100"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {equipamento.imagem_url ? (
                    <img
                      src={equipamento.imagem_url}
                      alt={equipamento.nome}
                      className="mb-3 h-40 w-full rounded-xl bg-slate-100 object-contain p-2"
                    />
                  ) : (
                    <div className="mb-3 flex h-40 w-full items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
                      Sem imagem
                    </div>
                  )}

                  <h4 className="text-lg font-semibold text-slate-800">
                    {equipamento.nome}
                  </h4>

                  <p className="mt-1 text-sm text-slate-600">
                    {formatarMoeda(equipamento.valor_diaria)} por dia
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    {equipamento.descricao || "Sem descrição"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 p-4 max-h-[40vh] overflow-y-auto lg:max-h-none">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-lg font-semibold text-slate-800">
              Detalhes
            </h4>

            {equipamentoModalSelecionado && (
              <button
                type="button"
                onClick={() => {
                  setEquipamentoModalSelecionado(null);
                  setQuantidadeModal("1");
                }}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Voltar ao catálogo
              </button>
            )}
          </div>

          {!equipamentoModalSelecionado ? (
            <p className="mt-4 text-sm text-slate-500">
              Selecione um equipamento para ver os detalhes.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {equipamentoModalSelecionado.imagem_url ? (
                <img
                  src={equipamentoModalSelecionado.imagem_url}
                  alt={equipamentoModalSelecionado.nome}
                  className="h-48 w-full rounded-xl bg-slate-100 object-contain p-2"
                />
              ) : (
                <div className="flex h-48 w-full items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
                  Sem imagem
                </div>
              )}

              <div>
                <h5 className="text-xl font-bold text-slate-800">
                  {equipamentoModalSelecionado.nome}
                </h5>
                <p className="mt-1 text-sm text-slate-600">
                  {formatarMoeda(equipamentoModalSelecionado.valor_diaria)} por dia
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {equipamentoModalSelecionado.descricao || "Sem descrição"}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Quantidade
                </label>
                <input
                  type="text"
                  value={quantidadeModal}
                  onChange={(e) => setQuantidadeModal(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  placeholder="1"
                />
              </div>

              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Diárias: {quantidadeDias}
              </div>

              <button
                type="button"
                onClick={adicionarItemDoModal}
                className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-600"
              >
                Adicionar ao carrinho
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
