import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { withTimeout } from "../lib/withTimeout";
import logo from "../assets/images/logo.png";

const PIX_KEY = "61.282.940/0001-05";
const BENEFICIARIO_PIX = "Dalmes Dutra Cardoso Junior";
const WHATSAPP_FRUTO_DA_TERRA = "5532988263667";

const FORM_INICIAL = {
  nome: "",
  telefone: "",
  data_retirada: "",
  data_devolucao: "",
  forma_pagamento: "pix",
  observacoes: "",
};

function formatarData(data) {
  if (!data) return "-";
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

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

function limparTelefone(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function formatarTelefone(valor) {
  const numeros = limparTelefone(valor).slice(0, 11);

  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 7) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
  }

  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
}

function calcularQuantidadeDias(dataRetirada, dataDevolucao) {
  if (!dataRetirada || !dataDevolucao) return 0;

  const retirada = new Date(`${dataRetirada}T00:00:00`);
  const devolucao = new Date(`${dataDevolucao}T00:00:00`);

  const diffMs = devolucao - retirada;
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return diffDias > 0 ? diffDias : 0;
}

function calcularValorComAcrescimo(valorDiaria, quantidadeDias) {
  const valorBase = Number(valorDiaria || 0);
  const dias = Number(quantidadeDias || 0);

  if (dias <= 0) return 0;
  if (dias === 1) return valorBase;

  return valorBase * (1 + (dias - 1) * 0.1);
}

function calcularSubtotalItem(valorDiaria, quantidade, quantidadeDias) {
  const valorPorPeriodo = calcularValorComAcrescimo(
    valorDiaria,
    quantidadeDias,
  );
  return valorPorPeriodo * Number(quantidade || 0);
}

function agruparPorCategoria(equipamentos) {
  return equipamentos.reduce((acc, equipamento) => {
    const categoria = equipamento.categoria || "Outros";
    if (!acc[categoria]) acc[categoria] = [];
    acc[categoria].push(equipamento);
    return acc;
  }, {});
}

function gerarMensagemWhatsAppPedido({
  numeroPedido,
  clienteNome,
  clienteTelefone,
  dataRetirada,
  dataDevolucao,
  itens,
  totalLocacao,
  metadeTotal,
  observacoes,
}) {
  const itensTexto = itens
    .map((item) => {
      const extras = [
        item.tamanho ? `Tamanho: ${item.tamanho}` : null,
        item.numeracao ? `Numeração: ${item.numeracao}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      return `- ${item.equipamento_nome} | Qtd: ${item.quantidade}${extras ? ` | ${extras}` : ""}`;
    })
    .join("\n");

  return `Olá! Pedido de locação #${numeroPedido}

Cliente: ${clienteNome}
Telefone: ${clienteTelefone || "-"}
Retirada: ${formatarData(dataRetirada)}
Devolução: ${formatarData(dataDevolucao)}

Itens:
${itensTexto || "- Nenhum item"}

Total: ${formatarMoeda(totalLocacao)}
Entrada (50%): ${formatarMoeda(metadeTotal)}
Pagamento: Pix
Chave Pix: ${PIX_KEY}
Beneficiário: ${BENEFICIARIO_PIX}
${observacoes?.trim() ? `Observações: ${observacoes.trim()}` : "Observações: -"}

Estarei enviando o comprovante abaixo.`;
}

export default function SolicitarLocacao() {
  const ativoRef = useRef(true);
  const topoRef = useRef(null);
  const carrinhoRef = useRef(null);

  const [equipamentos, setEquipamentos] = useState([]);
  const [itens, setItens] = useState([]);
  const [form, setForm] = useState(FORM_INICIAL);

  const [etapaAtual, setEtapaAtual] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [busca, setBusca] = useState("");
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("");

  const [modalProdutoAberto, setModalProdutoAberto] = useState(false);
  const [erroModalProduto, setErroModalProduto] = useState("");
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [quantidadeSelecionada, setQuantidadeSelecionada] = useState("1");
  const [tamanhoSelecionado, setTamanhoSelecionado] = useState("");
  const [numeracaoSelecionada, setNumeracaoSelecionada] = useState("");

  const [pixCopiado, setPixCopiado] = useState(false);

  const quantidadeDias = useMemo(() => {
    return calcularQuantidadeDias(form.data_retirada, form.data_devolucao);
  }, [form.data_retirada, form.data_devolucao]);

  const totalLocacao = useMemo(() => {
    if (quantidadeDias <= 0) return 0;

    return itens.reduce((acc, item) => {
      return (
        acc +
        calcularSubtotalItem(item.valor_diaria, item.quantidade, quantidadeDias)
      );
    }, 0);
  }, [itens, quantidadeDias]);

  const totalReferenciaDiaria = useMemo(() => {
    return itens.reduce((acc, item) => {
      return (
        acc + Number(item.valor_diaria || 0) * Number(item.quantidade || 0)
      );
    }, 0);
  }, [itens]);

  const metadeTotal = useMemo(() => totalLocacao / 2, [totalLocacao]);

  const categorias = useMemo(() => {
    return [
      ...new Set(equipamentos.map((eq) => eq.categoria).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
  }, [equipamentos]);

  const equipamentosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return equipamentos.filter((equipamento) => {
      const bateCategoria = categoriaSelecionada
        ? equipamento.categoria === categoriaSelecionada
        : true;

      const bateBusca = termo
        ? `${equipamento.nome} ${equipamento.descricao || ""} ${equipamento.categoria || ""}`
            .toLowerCase()
            .includes(termo)
        : true;

      return bateCategoria && bateBusca;
    });
  }, [equipamentos, categoriaSelecionada, busca]);

  const equipamentosPorCategoria = useMemo(() => {
    return agruparPorCategoria(equipamentosFiltrados);
  }, [equipamentosFiltrados]);

  const passos = [
    { id: 1, label: "Carrinho" },
    { id: 2, label: "Seus dados" },
    { id: 3, label: "Pagamento" },
    { id: 4, label: "Confirmação" },
  ];

  useEffect(() => {
    ativoRef.current = true;
    buscarEquipamentos();

    return () => {
      ativoRef.current = false;
    };
  }, []);

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;

    if (modalProdutoAberto) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = overflowAnterior || "";
    }

    return () => {
      document.body.style.overflow = overflowAnterior || "";
    };
  }, [modalProdutoAberto]);

  function irParaTopo() {
    topoRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function irParaCarrinho() {
    carrinhoRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function mostrarErro(texto) {
    setErro(texto);
    setMensagem("");
    irParaTopo();
  }

  async function copiarChavePix() {
    try {
      await navigator.clipboard.writeText(PIX_KEY);
      setPixCopiado(true);

      setTimeout(() => {
        setPixCopiado(false);
      }, 2000);
    } catch (err) {
      console.error("Erro ao copiar chave Pix:", err);
      mostrarErro("Não foi possível copiar a chave Pix.");
    }
  }

  function abrirWhatsAppComPedido(numeroPedido) {
    const mensagemWhatsapp = gerarMensagemWhatsAppPedido({
      numeroPedido,
      clienteNome: form.nome.trim(),
      clienteTelefone: form.telefone,
      dataRetirada: form.data_retirada,
      dataDevolucao: form.data_devolucao,
      itens,
      totalLocacao,
      metadeTotal,
      observacoes: form.observacoes,
    });

    const url = `https://wa.me/${WHATSAPP_FRUTO_DA_TERRA}?text=${encodeURIComponent(mensagemWhatsapp)}`;
    window.open(url, "_blank");
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
      [name]: name === "telefone" ? formatarTelefone(value) : value,
    }));
  }

  function abrirModalProduto(produto) {
    const temVariacao = produto.usa_tamanho || produto.usa_numeracao;

    let quantidadeInicial = "1";

    if (!temVariacao) {
      const itemExistente = itens.find(
        (item) => String(item.equipamento_id) === String(produto.id),
      );

      if (itemExistente) {
        quantidadeInicial = String(itemExistente.quantidade || 1);
      }
    }

    setProdutoSelecionado(produto);
    setQuantidadeSelecionada(quantidadeInicial);
    setTamanhoSelecionado("");
    setNumeracaoSelecionada("");
    setErroModalProduto("");
    setModalProdutoAberto(true);
  }

  function fecharModalProduto() {
    setModalProdutoAberto(false);
    setProdutoSelecionado(null);
    setQuantidadeSelecionada("1");
    setTamanhoSelecionado("");
    setNumeracaoSelecionada("");
    setErroModalProduto("");
  }

  function adicionarAoCarrinho() {
    setErro("");
    setMensagem("");
    setErroModalProduto("");

    if (!produtoSelecionado) {
      setErroModalProduto("Selecione um produto.");
      return;
    }

    const quantidade = Number(
      String(quantidadeSelecionada).replace(",", ".").trim(),
    );

    if (
      Number.isNaN(quantidade) ||
      quantidade <= 0 ||
      !Number.isInteger(quantidade)
    ) {
      setErroModalProduto("Informe uma quantidade válida.");
      return;
    }

    if (produtoSelecionado.usa_tamanho && !tamanhoSelecionado.trim()) {
      setErroModalProduto("Informe o tamanho.");
      return;
    }

    if (produtoSelecionado.usa_numeracao && !numeracaoSelecionada.trim()) {
      setErroModalProduto("Informe a numeração.");
      return;
    }

    const chaveTamanho = produtoSelecionado.usa_tamanho
      ? tamanhoSelecionado.trim()
      : null;

    const chaveNumeracao = produtoSelecionado.usa_numeracao
      ? numeracaoSelecionada.trim()
      : null;

    setItens((prev) => {
      const itemExistente = prev.find((item) => {
        return (
          String(item.equipamento_id) === String(produtoSelecionado.id) &&
          (item.tamanho || null) === chaveTamanho &&
          (item.numeracao || null) === chaveNumeracao
        );
      });

      if (itemExistente) {
        return prev.map((item) => {
          if (
            String(item.equipamento_id) === String(produtoSelecionado.id) &&
            (item.tamanho || null) === chaveTamanho &&
            (item.numeracao || null) === chaveNumeracao
          ) {
            return {
              ...item,
              quantidade,
            };
          }

          return item;
        });
      }

      return [
        ...prev,
        {
          uid: crypto.randomUUID(),
          equipamento_id: produtoSelecionado.id,
          equipamento_nome: produtoSelecionado.nome,
          imagem_url: produtoSelecionado.imagem_url || "",
          categoria: produtoSelecionado.categoria || "Outros",
          quantidade,
          valor_diaria: Number(produtoSelecionado.valor_diaria),
          tamanho: chaveTamanho,
          numeracao: chaveNumeracao,
        },
      ];
    });

    setMensagem("Produto adicionado ao carrinho.");
    fecharModalProduto();
  }

  function removerItem(uid) {
    setItens((prev) => prev.filter((item) => item.uid !== uid));
  }

  function irParaEtapaDados() {
    if (itens.length === 0) {
      mostrarErro("Adicione pelo menos um item ao carrinho.");
      return;
    }

    setErro("");
    setMensagem("");
    setEtapaAtual(2);
    irParaTopo();
  }

  function irParaEtapaPagamento() {
    const telefoneLimpo = limparTelefone(form.telefone);

    if (!form.nome.trim()) {
      mostrarErro("Informe seu nome.");
      return;
    }

    if (telefoneLimpo.length < 11) {
      mostrarErro("Informe um telefone válido.");
      return;
    }

    if (!form.data_retirada || !form.data_devolucao) {
      mostrarErro("Informe a data de retirada e devolução.");
      return;
    }

    if (quantidadeDias <= 0) {
      mostrarErro("A data de devolução deve ser maior que a data de retirada.");
      return;
    }

    if (itens.length === 0) {
      mostrarErro("Adicione pelo menos um item ao carrinho.");
      return;
    }

    setErro("");
    setMensagem("");
    setEtapaAtual(3);
    irParaTopo();
  }

  async function buscarOuCriarCliente() {
    const telefoneLimpo = limparTelefone(form.telefone);

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

  async function confirmarPedido() {
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
            forma_pagamento: "pix",
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
        quantidade_dias: quantidadeDias,
        subtotal: calcularSubtotalItem(
          item.valor_diaria,
          item.quantidade,
          quantidadeDias,
        ),
        tamanho: item.tamanho,
        numeracao: item.numeracao,
      }));

      const { error: erroItens } = await withTimeout(
        supabase.from("itens_locacao").insert(itensParaSalvar),
        30000,
      );

      if (erroItens) throw erroItens;

      const numeroPedido =
        locacaoCriada.numero_pedido || locacaoCriada.id || "-";

      if (ativoRef.current) {
        setMensagem(
          `Pedido #${numeroPedido} enviado com sucesso! Agora envie o comprovante pelo WhatsApp.`,
        );
        setEtapaAtual(4);
        irParaTopo();
      }

      abrirWhatsAppComPedido(numeroPedido);
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
        } catch {}

        try {
          await withTimeout(
            supabase.from("locacoes").delete().eq("id", locacaoCriada.id),
            5000,
          );
        } catch {}
      }

      if (ativoRef.current) {
        mostrarErro(traduzirErro(err));
      }
    } finally {
      if (ativoRef.current) {
        setSalvando(false);
      }
    }
  }

  function reiniciarFluxo() {
    setItens([]);
    setForm(FORM_INICIAL);
    setErro("");
    setMensagem("");
    setEtapaAtual(1);
    fecharModalProduto();
    irParaTopo();
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <section
        ref={topoRef}
        className="relative overflow-hidden bg-slate-900 text-white"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_25%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="mx-auto max-w-5xl text-center">
            <div className="flex justify-center">
              <img
                src={logo}
                alt="Fruto da Terra"
                className="h-24 w-auto sm:h-32"
              />
            </div>

            <h1 className="mt-6 text-3xl font-bold leading-tight sm:text-5xl">
              Alugue equipamentos para sua aventura com praticidade
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-200 sm:text-lg">
              Explore o catálogo, monte seu carrinho e finalize sua solicitação
              em poucos passos.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        {erro && (
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {mensagem}
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-3">
          {passos.map((passo) => {
            const ativo = etapaAtual === passo.id;
            const concluido = etapaAtual > passo.id;

            return (
              <div
                key={passo.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  ativo
                    ? "bg-emerald-500 text-white"
                    : concluido
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-white text-slate-500"
                }`}
              >
                {passo.id}. {passo.label}
              </div>
            );
          })}
        </div>

        {etapaAtual === 1 && (
          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h2 className="text-xl font-semibold text-slate-800">
                  Catálogo de produtos
                </h2>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar produto"
                    className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  />

                  <select
                    value={categoriaSelecionada}
                    onChange={(e) => setCategoriaSelecionada(e.target.value)}
                    className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  >
                    <option value="">Todas as categorias</option>
                    {categorias.map((categoria) => (
                      <option key={categoria} value={categoria}>
                        {categoria}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {carregando ? (
                <div className="mt-6 text-slate-600">
                  Carregando produtos...
                </div>
              ) : equipamentosFiltrados.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-slate-500">
                  Nenhum produto encontrado.
                </div>
              ) : (
                <div className="mt-6 space-y-6">
                  {Object.entries(equipamentosPorCategoria).map(
                    ([categoria, itensCategoria]) => (
                      <div key={categoria}>
                        <h3 className="mb-3 text-lg font-semibold text-slate-800">
                          {categoria}
                        </h3>

                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {itensCategoria.map((produto) => (
                            <div
                              key={produto.id}
                              className="rounded-2xl border border-slate-200 bg-white p-4"
                            >
                              <div className="flex h-40 items-center justify-center rounded-xl bg-slate-100 p-2">
                                {produto.imagem_url ? (
                                  <img
                                    src={produto.imagem_url}
                                    alt={produto.nome}
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <span className="text-sm text-slate-500">
                                    Sem imagem
                                  </span>
                                )}
                              </div>

                              <h4 className="mt-4 text-base font-semibold text-slate-800">
                                {produto.nome}
                              </h4>

                              <p className="mt-1 text-sm text-slate-500">
                                {produto.descricao || "Sem descrição"}
                              </p>

                              <p className="mt-3 text-lg font-bold text-slate-800">
                                {formatarMoeda(produto.valor_diaria)} / diária
                              </p>

                              <button
                                type="button"
                                onClick={() => abrirModalProduto(produto)}
                                className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800"
                              >
                                Adicionar ao carrinho
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            <div
              ref={carrinhoRef}
              className="rounded-3xl bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-slate-800">
                  Seu carrinho
                </h2>

                <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {itens.length} item(ns)
                </div>
              </div>

              {itens.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  Nenhum item adicionado.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {itens.map((item) => (
                    <div
                      key={item.uid}
                      className="rounded-2xl border border-slate-200 p-3"
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
                          <h3 className="text-base font-semibold text-slate-800">
                            {item.equipamento_nome}
                          </h3>
                          <p className="text-sm text-slate-600">
                            Quantidade: {item.quantidade}
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
                          <button
                            type="button"
                            onClick={() => removerItem(item.uid)}
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

              <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-4">
                {quantidadeDias > 0 ? (
                  <>
                    <p className="text-sm text-slate-500">Total da locação</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {formatarMoeda(totalLocacao)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Cálculo com {quantidadeDias} diária(s), com acréscimo de
                      10% por dia extra.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-500">
                      Valor de referência
                    </p>
                    <p className="text-2xl font-bold text-slate-800">
                      {formatarMoeda(totalReferenciaDiaria)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Valor referente a 1 diária. O total final será calculado
                      após informar as datas.
                    </p>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={irParaEtapaDados}
                className="mt-5 w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-600"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {etapaAtual === 2 && (
          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold text-slate-800">
                Seus dados
              </h2>

              <div className="mt-5 space-y-4">
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
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Telefone
                  </label>
                  <input
                    type="tel"
                    name="telefone"
                    value={form.telefone}
                    onChange={handleChange}
                    inputMode="numeric"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                    placeholder="(00) 00000-0000"
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
                      className="block w-full min-w-0 max-w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="min-w-0">
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Data de devolução
                    </label>
                    <input
                      type="date"
                      name="data_devolucao"
                      value={form.data_devolucao}
                      onChange={handleChange}
                      className="block w-full min-w-0 max-w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEtapaAtual(1)}
                    className="rounded-2xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Voltar
                  </button>

                  <button
                    type="button"
                    onClick={irParaEtapaPagamento}
                    className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-600"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold text-slate-800">
                Resumo da locação
              </h2>

              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p>Itens no carrinho: {itens.length}</p>
                <p>Diárias: {quantidadeDias}</p>
                <p className="text-lg font-bold text-slate-800">
                  Total: {formatarMoeda(totalLocacao)}
                </p>
              </div>
            </div>
          </div>
        )}

        {etapaAtual === 3 && (
          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold text-slate-800">
                Pagamento
              </h2>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                  <p className="text-sm font-medium text-emerald-700">
                    Forma de pagamento
                  </p>
                  <p className="mt-1 text-lg font-bold text-emerald-900">Pix</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-sm text-slate-500">Chave Pix</p>
                  <p className="mt-1 break-all text-lg font-bold text-slate-800">
                    {PIX_KEY}
                  </p>

                  <p className="text-sm text-slate-500">
                    Beneficiário: {BENEFICIARIO_PIX}
                  </p>

                  <button
                    type="button"
                    onClick={copiarChavePix}
                    className="mt-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    {pixCopiado ? "Chave copiada!" : "Copiar chave Pix"}
                  </button>
                </div>

                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-sm text-slate-500">Total da locação</p>
                  <p className="text-2xl font-bold text-slate-800">
                    {formatarMoeda(totalLocacao)}
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <p className="text-sm text-amber-700">
                    Valor de 50% para confirmar a reserva
                  </p>
                  <p className="text-2xl font-bold text-amber-900">
                    {formatarMoeda(metadeTotal)}
                  </p>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-800">
                  Após o pagamento dos 50% do valor, favor enviar o comprovante
                  para a Fruto da Terra, que seu pedido será confirmado.
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Observações
                  </label>
                  <textarea
                    name="observacoes"
                    value={form.observacoes}
                    onChange={handleChange}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                    placeholder="Observações"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEtapaAtual(2)}
                    className="rounded-2xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Voltar
                  </button>

                  <button
                    type="button"
                    onClick={confirmarPedido}
                    disabled={salvando}
                    className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {salvando
                      ? "Enviando..."
                      : "Confirmar pedido e enviar comprovante"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold text-slate-800">
                Resumo final
              </h2>

              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p>Cliente: {form.nome || "-"}</p>
                <p>Telefone: {form.telefone || "-"}</p>
                <p>Retirada: {formatarData(form.data_retirada)}</p>
                <p>Devolução: {formatarData(form.data_devolucao)}</p>
                <p>Diárias: {quantidadeDias}</p>
                <p className="text-lg font-bold text-slate-800">
                  Total: {formatarMoeda(totalLocacao)}
                </p>
                <p className="text-lg font-bold text-emerald-700">
                  Entrada (50%): {formatarMoeda(metadeTotal)}
                </p>
              </div>
            </div>
          </div>
        )}

        {etapaAtual === 4 && (
          <div className="rounded-3xl bg-white p-6 text-center shadow-sm">
            <h2 className="text-2xl font-bold text-slate-800">
              Pedido enviado com sucesso
            </h2>
            <p className="mt-3 text-slate-600">
              Seu pedido foi salvo. O WhatsApp foi aberto para você enviar o
              comprovante e concluir a solicitação.
            </p>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={reiniciarFluxo}
                className="rounded-2xl bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-800"
              >
                Fazer novo pedido
              </button>
            </div>
          </div>
        )}
      </section>

      {etapaAtual === 1 && (
        <button
          type="button"
          onClick={irParaCarrinho}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-radial-[at_30%_20%] from-slate-800 via-slate-700 to-slate-800 px-3 py-2 text-sm font-semibold text-white shadow-lg hover:bg-emerald-600 md:hidden"
        >
          <span className="text-base">🛒</span>
          <span>{itens.length}</span>
        </button>
      )}

      {modalProdutoAberto && produtoSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-bold text-slate-800">
                {produtoSelecionado.nome}
              </h3>

              <button
                type="button"
                onClick={fecharModalProduto}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Fechar
              </button>
            </div>

            {erroModalProduto && (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {erroModalProduto}
              </div>
            )}

            <div className="mt-4 flex h-40 items-center justify-center rounded-xl bg-slate-100 p-2">
              {produtoSelecionado.imagem_url ? (
                <img
                  src={produtoSelecionado.imagem_url}
                  alt={produtoSelecionado.nome}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-sm text-slate-500">Sem imagem</span>
              )}
            </div>

            <p className="mt-4 text-sm text-slate-500">
              {produtoSelecionado.descricao || "Sem descrição"}
            </p>

            <p className="mt-3 text-lg font-bold text-slate-800">
              {formatarMoeda(produtoSelecionado.valor_diaria)} / diária
            </p>

            {!produtoSelecionado.usa_tamanho &&
              !produtoSelecionado.usa_numeracao &&
              itens.some(
                (item) =>
                  String(item.equipamento_id) === String(produtoSelecionado.id),
              ) && (
                <p className="mt-2 text-sm text-amber-600">
                  Você já possui{" "}
                  {
                    itens.find(
                      (item) =>
                        String(item.equipamento_id) ===
                        String(produtoSelecionado.id),
                    )?.quantidade
                  }{" "}
                  desse item no carrinho. Escreva a NOVA quantidade que deseja.
                </p>
              )}

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Quantidade
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantidadeSelecionada}
                  onChange={(e) => setQuantidadeSelecionada(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                />
              </div>

              {produtoSelecionado.usa_tamanho && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Tamanho
                  </label>
                  <input
                    type="text"
                    value={tamanhoSelecionado}
                    onChange={(e) => setTamanhoSelecionado(e.target.value)}
                    placeholder="Ex: P, M, G, GG"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {produtoSelecionado.usa_numeracao && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Numeração
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={numeracaoSelecionada}
                    onChange={(e) => setNumeracaoSelecionada(e.target.value)}
                    placeholder="Ex: 38, 39, 40"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={adicionarAoCarrinho}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-600"
              >
                Adicionar ao carrinho
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}