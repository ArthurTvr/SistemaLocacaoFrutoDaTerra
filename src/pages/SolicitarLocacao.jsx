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
  { value: "pix", label: "Pix" },
  { value: "cartao_credito", label: "Cartão de crédito" },
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

function agruparPorCategoria(equipamentos) {
  return equipamentos.reduce((acc, equipamento) => {
    const categoria = equipamento.categoria || "Outros";
    if (!acc[categoria]) acc[categoria] = [];
    acc[categoria].push(equipamento);
    return acc;
  }, {});
}

export default function SolicitarLocacao() {
  const ativoRef = useRef(true);
  const formularioRef = useRef(null);
  const topoFeedbackRef = useRef(null);
  const feedbackModalRef = useRef(null);

  const [equipamentos, setEquipamentos] = useState([]);
  const [itens, setItens] = useState([]);
  const [form, setForm] = useState(FORM_INICIAL);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erroModal, setErroModal] = useState("");

  const [modalEquipamentosAberto, setModalEquipamentosAberto] = useState(false);
  const [equipamentoModalSelecionado, setEquipamentoModalSelecionado] =
    useState(null);
  const [quantidadeModal, setQuantidadeModal] = useState("1");
  const [tamanhoModal, setTamanhoModal] = useState("");
  const [numeracaoModal, setNumeracaoModal] = useState("");
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("");

  const quantidadeDias = useMemo(() => {
    return calcularQuantidadeDias(form.data_retirada, form.data_devolucao);
  }, [form.data_retirada, form.data_devolucao]);

  const totalLocacao = useMemo(() => {
    return itens.reduce((acc, item) => acc + Number(item.subtotal || 0), 0);
  }, [itens]);

  const categorias = useMemo(() => {
    return [
      ...new Set(equipamentos.map((eq) => eq.categoria).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
  }, [equipamentos]);

  const equipamentosFiltrados = useMemo(() => {
    if (!categoriaSelecionada) return equipamentos;
    return equipamentos.filter(
      (equipamento) => equipamento.categoria === categoriaSelecionada,
    );
  }, [equipamentos, categoriaSelecionada]);

  const equipamentosPorCategoria = useMemo(() => {
    return agruparPorCategoria(equipamentosFiltrados);
  }, [equipamentosFiltrados]);

  useEffect(() => {
    ativoRef.current = true;
    buscarEquipamentos();

    return () => {
      ativoRef.current = false;
    };
  }, []);

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;

    if (modalEquipamentosAberto) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = overflowAnterior || "";
    }

    return () => {
      document.body.style.overflow = overflowAnterior || "";
    };
  }, [modalEquipamentosAberto]);

  function mostrarErroPagina(texto) {
    setErro(texto);

    requestAnimationFrame(() => {
      topoFeedbackRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function mostrarErroModal(texto) {
    setErroModal(texto);

    requestAnimationFrame(() => {
      feedbackModalRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

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
          .order("categoria", { ascending: true })
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
    fecharModalEquipamentos();
  }

  function abrirModalEquipamentos() {
    setErro("");
    setMensagem("");
    setErroModal("");

    if (!form.data_retirada || !form.data_devolucao) {
      mostrarErroPagina(
        "Informe a data de retirada e a data de devolução antes de adicionar equipamentos.",
      );
      return;
    }

    if (quantidadeDias <= 0) {
      mostrarErroPagina(
        "A data de devolução deve ser maior que a data de retirada.",
      );
      return;
    }

    setErro("");
    setModalEquipamentosAberto(true);
  }

  function fecharModalEquipamentos() {
    setModalEquipamentosAberto(false);
    setEquipamentoModalSelecionado(null);
    setQuantidadeModal("1");
    setTamanhoModal("");
    setNumeracaoModal("");
    setErroModal("");
  }

  function selecionarEquipamento(equipamento) {
    setEquipamentoModalSelecionado(equipamento);
    setQuantidadeModal("1");
    setTamanhoModal("");
    setNumeracaoModal("");
    setErroModal("");
  }

  function voltarAoCatalogo() {
    setEquipamentoModalSelecionado(null);
    setQuantidadeModal("1");
    setTamanhoModal("");
    setNumeracaoModal("");
    setErroModal("");
  }

  function adicionarItemDoModal() {
    setErro("");
    setMensagem("");
    setErroModal("");

    if (!equipamentoModalSelecionado) {
      mostrarErroModal("Selecione um equipamento.");
      return;
    }

    const quantidade = Number(String(quantidadeModal).replace(",", ".").trim());

    if (
      Number.isNaN(quantidade) ||
      quantidade <= 0 ||
      !Number.isInteger(quantidade)
    ) {
      mostrarErroModal("Informe uma quantidade válida.");
      return;
    }

    if (equipamentoModalSelecionado.usa_tamanho && !tamanhoModal.trim()) {
      mostrarErroModal("Informe o tamanho.");
      return;
    }

    if (equipamentoModalSelecionado.usa_numeracao && !numeracaoModal.trim()) {
      mostrarErroModal("Informe a numeração.");
      return;
    }

    const chaveTamanho = equipamentoModalSelecionado.usa_tamanho
      ? tamanhoModal.trim()
      : null;

    const chaveNumeracao = equipamentoModalSelecionado.usa_numeracao
      ? numeracaoModal.trim()
      : null;

    setItens((prev) => {
      const itemExistente = prev.find((item) => {
        return (
          String(item.equipamento_id) ===
            String(equipamentoModalSelecionado.id) &&
          (item.tamanho || null) === chaveTamanho &&
          (item.numeracao || null) === chaveNumeracao
        );
      });

      if (itemExistente) {
        return prev.map((item) => {
          if (
            String(item.equipamento_id) ===
              String(equipamentoModalSelecionado.id) &&
            (item.tamanho || null) === chaveTamanho &&
            (item.numeracao || null) === chaveNumeracao
          ) {
            const novaQuantidade = Number(item.quantidade) + quantidade;
            return {
              ...item,
              quantidade: novaQuantidade,
              subtotal:
                novaQuantidade *
                Number(item.valor_diaria) *
                Number(item.quantidade_dias),
            };
          }

          return item;
        });
      }

      const subtotalNovoItem =
        quantidade *
        Number(equipamentoModalSelecionado.valor_diaria) *
        quantidadeDias;

      return [
        ...prev,
        {
          uid: crypto.randomUUID(),
          equipamento_id: equipamentoModalSelecionado.id,
          equipamento_nome: equipamentoModalSelecionado.nome,
          imagem_url: equipamentoModalSelecionado.imagem_url || "",
          categoria: equipamentoModalSelecionado.categoria || "Outros",
          quantidade,
          valor_diaria: Number(equipamentoModalSelecionado.valor_diaria),
          quantidade_dias: quantidadeDias,
          subtotal: subtotalNovoItem,
          tamanho: chaveTamanho,
          numeracao: chaveNumeracao,
        },
      ];
    });

    setMensagem("Equipamento adicionado ao carrinho.");
    voltarAoCatalogo();
  }

  function removerItem(uid) {
    setItens((prev) => prev.filter((item) => item.uid !== uid));
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
      mostrarErroPagina("Informe seu nome.");
      return;
    }

    if (!form.telefone.trim()) {
      mostrarErroPagina("Informe seu telefone.");
      return;
    }

    if (!form.data_retirada || !form.data_devolucao) {
      mostrarErroPagina("Informe a data de retirada e devolução.");
      return;
    }

    if (quantidadeDias <= 0) {
      mostrarErroPagina(
        "A data de devolução deve ser maior que a data de retirada.",
      );
      return;
    }

    if (itens.length === 0) {
      mostrarErroPagina("Adicione pelo menos um equipamento.");
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
        tamanho: item.tamanho,
        numeracao: item.numeracao,
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
        mostrarErroPagina(traduzirErro(err));
      }
    } finally {
      if (ativoRef.current) {
        setSalvando(false);
      }
    }
  }

  function rolarParaFormulario() {
    formularioRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <section className="relative overflow-hidden bg-slate-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_25%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Fruto da Terra
              </div>

              <h1 className="mt-5 text-3xl font-bold leading-tight sm:text-5xl">
                Alugue equipamentos para sua aventura com praticidade
              </h1>

              <p className="mt-4 max-w-2xl text-sm text-slate-200 sm:text-lg">
                Monte sua locação de forma rápida, escolha datas, selecione os
                equipamentos e envie sua solicitação direto pelo celular.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={rolarParaFormulario}
                  className="rounded-2xl bg-emerald-500 px-6 py-4 text-sm font-semibold text-white hover:bg-emerald-600"
                >
                  Fazer minha locação
                </button>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">
                    Equipamentos de qualidade
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    Produtos selecionados para camping e trekking.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">
                    Solicitação rápida
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    Faça tudo pelo celular em poucos minutos.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">
                    Atendimento simples
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    Envie a solicitação e receba a confirmação.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-3xl bg-white p-5 text-slate-800 shadow-xl">
                <p className="text-sm font-semibold text-emerald-700">
                  Como funciona
                </p>
                <div className="mt-4 space-y-4 text-sm">
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">
                      1
                    </div>
                    <div>
                      <p className="font-semibold">Escolha as datas</p>
                      <p className="text-slate-500">
                        Informe retirada e devolução antes de selecionar os
                        itens.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">
                      2
                    </div>
                    <div>
                      <p className="font-semibold">Monte seu carrinho</p>
                      <p className="text-slate-500">
                        Selecione equipamentos por categoria no catálogo.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">
                      3
                    </div>
                    <div>
                      <p className="font-semibold">Envie a solicitação</p>
                      <p className="text-slate-500">
                        Nossa equipe recebe e entra em contato para confirmar.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">
                      4
                    </div>
                    <div>
                      <p className="font-semibold">Pagamento</p>
                      <p className="text-slate-500">
                        Pague a metade do valor total para confirmar a reserva.
                        O restante é pago na entrega. (Em caso de cancelamento,
                        o valor pago <span className="font-bold">não</span> será reembolsado.)
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-white/10 p-5 text-white ring-1 ring-white/10 backdrop-blur">
                <p className="text-sm font-semibold text-emerald-300">
                  Categorias disponíveis
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {categorias.length > 0 ? (
                    categorias.map((categoria) => (
                      <span
                        key={categoria}
                        className="rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-slate-100"
                      >
                        {categoria}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-300">
                      Carregando categorias...
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        ref={formularioRef}
        className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-8"
      >
        {erro && (
          <div
            ref={topoFeedbackRef}
            className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600"
          >
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {mensagem}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-800 sm:text-xl">
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
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
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
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  placeholder="Seu telefone"
                  disabled={salvando}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Data de retirada
                  </label>
                  <input
                    type="date"
                    name="data_retirada"
                    value={form.data_retirada}
                    onChange={handleChange}
                    className="w-full max-w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
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
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                    disabled={salvando}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <h3 className="text-base font-semibold text-slate-800">
                  Equipamentos
                </h3>

                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Quantidade de diárias: {quantidadeDias}
                  </div>

                  <button
                    type="button"
                    onClick={abrirModalEquipamentos}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800"
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
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
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
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
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

              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-sm text-slate-500">
                  Metade do valor total (50%)
                </p>
                <p className="text-2xl font-bold text-slate-800">
                  {formatarMoeda(totalLocacao / 2)}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                >
                  {salvando ? "Enviando..." : "Confirmar pedido"}
                </button>

                <button
                  type="button"
                  onClick={limparTudo}
                  disabled={salvando}
                  className="rounded-2xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Limpar
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6 max-h-[60vh] md:h-[70vh] md:max-h-none flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-800 sm:text-xl">
                Carrinho da locação
              </h2>

              <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {itens.length} item(ns)
              </div>
            </div>

            {itens.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                Nenhum equipamento adicionado.
              </div>
            ) : (
              <div className="mt-6 flex-1 space-y-3 overflow-y-auto pr-2">
                {itens.map((item) => (
                  <div
                    key={item.uid}
                    className="rounded-2xl border border-slate-200 p-3 sm:p-4"
                  >
                    <div className="flex gap-3">
                      {item.imagem_url ? (
                        <img
                          src={item.imagem_url}
                          alt={item.equipamento_nome}
                          className="h-20 w-20 rounded-xl bg-slate-100 object-contain p-1"
                        />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-500">
                          Sem imagem
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold text-slate-800">
                          {item.equipamento_nome}
                        </h3>
                        <p className="text-sm text-slate-600">
                          Categoria: {item.categoria}
                        </p>
                        <p className="text-sm text-slate-600">
                          Quantidade: {item.quantidade}
                        </p>
                        <p className="text-sm text-slate-600">
                          Diárias: {item.quantidade_dias}
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

                        <p className="text-sm text-slate-600">
                          Valor da diária: {formatarMoeda(item.valor_diaria)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          Subtotal: {formatarMoeda(item.subtotal)}
                        </p>

                        <button
                          type="button"
                          onClick={() => removerItem(item.uid)}
                          className="mt-3 rounded-2xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
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
      </section>

      {modalEquipamentosAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-3">
          <div className="relative flex h-[75vh] w-full max-w-5xl flex-col rounded-3xl bg-white p-4 shadow-2xl sm:p-6">
            <button
              type="button"
              onClick={fecharModalEquipamentos}
              className="absolute right-3 top-3 rounded-xl bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
            >
              Voltar
            </button>

            <h3 className="mb-4 pr-16 text-xl font-bold text-slate-800 sm:text-2xl">
              Escolher equipamentos
            </h3>

            {erroModal && (
              <div
                ref={feedbackModalRef}
                className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600"
              >
                {erroModal}
              </div>
            )}

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={categoriaSelecionada}
                onChange={(e) => {
                  setCategoriaSelecionada(e.target.value);
                  setEquipamentoModalSelecionado(null);
                  setErroModal("");
                }}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-500"
              >
                <option value="">Todas as categorias</option>
                {categorias.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>

              {equipamentoModalSelecionado && (
                <button
                  type="button"
                  onClick={voltarAoCatalogo}
                  className="rounded-2xl border border-slate-300 bg-amber-500 px-4 py-3 text-sm font-medium text-white hover:bg-amber-600"
                >
                  Voltar ao catálogo
                </button>
              )}
            </div>

            <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-[1fr_300px]">
              <div className="overflow-y-auto pr-1">
                {carregando ? (
                  <div className="text-slate-600">
                    Carregando equipamentos...
                  </div>
                ) : equipamentosFiltrados.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-slate-500">
                    Nenhum equipamento disponível no momento.
                  </div>
                ) : equipamentoModalSelecionado ? null : (
                  <div className="space-y-5">
                    {Object.entries(equipamentosPorCategoria).map(
                      ([categoria, itensCategoria]) => (
                        <div key={categoria}>
                          <h4 className="mb-3 text-base font-semibold text-slate-800">
                            {categoria}
                          </h4>

                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {itensCategoria.map((equipamento) => (
                              <button
                                key={equipamento.id}
                                type="button"
                                onClick={() =>
                                  selecionarEquipamento(equipamento)
                                }
                                className="rounded-2xl border border-slate-200 p-3 text-left transition hover:border-slate-300"
                              >
                                <div className="mb-3 flex h-20 items-center justify-center rounded-xl bg-slate-100 p-2">
                                  {equipamento.imagem_url ? (
                                    <img
                                      src={equipamento.imagem_url}
                                      alt={equipamento.nome}
                                      className="h-full w-full object-contain"
                                    />
                                  ) : (
                                    <span className="text-xs text-slate-500">
                                      Sem imagem
                                    </span>
                                  )}
                                </div>

                                <h5 className="line-clamp-2 text-sm font-semibold text-slate-800">
                                  {equipamento.nome}
                                </h5>

                                <p className="mt-1 text-sm text-slate-600">
                                  {formatarMoeda(equipamento.valor_diaria)} por
                                  dia
                                </p>

                                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                  {equipamento.descricao || "Sem descrição"}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-y-auto rounded-2xl border border-slate-200 p-4">
                {!equipamentoModalSelecionado ? (
                  <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">
                    Selecione um equipamento no catálogo para ver os detalhes.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex h-28 items-center justify-center rounded-xl bg-slate-100 p-2">
                      {equipamentoModalSelecionado.imagem_url ? (
                        <img
                          src={equipamentoModalSelecionado.imagem_url}
                          alt={equipamentoModalSelecionado.nome}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-sm text-slate-500">
                          Sem imagem
                        </span>
                      )}
                    </div>

                    <div>
                      <h5 className="text-lg font-bold text-slate-800">
                        {equipamentoModalSelecionado.nome}
                      </h5>
                      <p className="mt-1 text-sm text-slate-600">
                        Categoria:{" "}
                        {equipamentoModalSelecionado.categoria || "Outros"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatarMoeda(
                          equipamentoModalSelecionado.valor_diaria,
                        )}{" "}
                        por dia
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        {equipamentoModalSelecionado.descricao ||
                          "Sem descrição"}
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Quantidade
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={quantidadeModal}
                        onChange={(e) => setQuantidadeModal(e.target.value)}
                        className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                        placeholder="1"
                      />
                    </div>

                    {equipamentoModalSelecionado.usa_tamanho && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">
                          Tamanho
                        </label>
                        <input
                          type="text"
                          value={tamanhoModal}
                          onChange={(e) => setTamanhoModal(e.target.value)}
                          className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                          placeholder="Ex: P, M, G, GG"
                        />
                      </div>
                    )}

                    {equipamentoModalSelecionado.usa_numeracao && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">
                          Numeração
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={numeracaoModal}
                          onChange={(e) => setNumeracaoModal(e.target.value)}
                          className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                          placeholder="Ex: 38, 39, 40"
                        />
                      </div>
                    )}

                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Diárias: {quantidadeDias}
                    </div>

                    <button
                      type="button"
                      onClick={adicionarItemDoModal}
                      className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-600"
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
