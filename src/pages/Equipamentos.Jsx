import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { withTimeout } from "../lib/withTimeout";

const estadoInicial = {
  nome: "",
  descricao: "",
  valor_diaria: "",
  quantidade_total: "",
  imagem_url: "",
  ativo: true,
};

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

export default function Equipamentos() {
  const ativoRef = useRef(true);
  const [imagemModal, setImagemModal] = useState(null);
  const [equipamentos, setEquipamentos] = useState([]);
  const [form, setForm] = useState(estadoInicial);
  const [equipamentoEditando, setEquipamentoEditando] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

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
          .order("id", { ascending: false }),
        15000,
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
    const { name, value, type, checked } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function limparFormulario() {
    setForm(estadoInicial);
    setEquipamentoEditando(null);
    setErro("");
  }

  function iniciarEdicao(equipamento) {
    setEquipamentoEditando(equipamento);
    setForm({
      nome: equipamento.nome || "",
      descricao: equipamento.descricao || "",
      valor_diaria: String(equipamento.valor_diaria ?? ""),
      quantidade_total: String(equipamento.quantidade_total ?? ""),
      imagem_url: equipamento.imagem_url || "",
      ativo: Boolean(equipamento.ativo),
    });
    setErro("");
    setMensagem("");
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const valorDiariaNumero = Number(
      String(form.valor_diaria).replace(",", ".").trim(),
    );

    const quantidadeTotalNumero = Number(
      String(form.quantidade_total).replace(",", ".").trim(),
    );

    if (!form.nome.trim()) {
      setErro("Informe o nome do equipamento.");
      return;
    }

    if (Number.isNaN(valorDiariaNumero) || valorDiariaNumero < 0) {
      setErro("Informe um valor de diária válido.");
      return;
    }

    if (
      Number.isNaN(quantidadeTotalNumero) ||
      quantidadeTotalNumero < 0 ||
      !Number.isInteger(quantidadeTotalNumero)
    ) {
      setErro("Informe uma quantidade total válida.");
      return;
    }

    setSalvando(true);
    setErro("");
    setMensagem("");

    try {
      if (equipamentoEditando) {
        const { error } = await withTimeout(
          supabase
            .from("equipamentos")
            .update({
              nome: form.nome.trim(),
              descricao: form.descricao.trim() || null,
              valor_diaria: valorDiariaNumero,
              quantidade_total: quantidadeTotalNumero,
              imagem_url: form.imagem_url.trim() || null,
              ativo: form.ativo,
            })
            .eq("id", equipamentoEditando.id),
          15000,
        );

        if (error) throw error;

        if (ativoRef.current) {
          setMensagem("Equipamento atualizado com sucesso.");
        }
      } else {
        const { error } = await withTimeout(
          supabase
            .from("equipamentos")
            .insert({
              nome: form.nome.trim(),
              descricao: form.descricao.trim() || null,
              valor_diaria: valorDiariaNumero,
              quantidade_total: quantidadeTotalNumero,
              imagem_url: form.imagem_url.trim() || null,
              ativo: form.ativo,
            })
            .select(),
          15000,
        );

        if (error) throw error;

        if (ativoRef.current) {
          setMensagem("Equipamento cadastrado com sucesso.");
        }
      }

      if (ativoRef.current) {
        limparFormulario();
      }

      await buscarEquipamentos();
    } catch (err) {
      console.error("Erro ao salvar equipamento:", err);

      if (ativoRef.current) {
        setErro(traduzirErro(err));
      }
    } finally {
      if (ativoRef.current) {
        setSalvando(false);
      }
    }
  }

  async function excluirEquipamento(id) {
    const confirmar = window.confirm(
      "Deseja realmente excluir este equipamento?",
    );
    if (!confirmar) return;

    setErro("");
    setMensagem("");

    try {
      const { error } = await withTimeout(
        supabase.from("equipamentos").delete().eq("id", id),
        15000,
      );

      if (error) throw error;

      if (ativoRef.current) {
        setMensagem("Equipamento excluído com sucesso.");
      }

      await buscarEquipamentos();
    } catch (err) {
      console.error("Erro ao excluir equipamento:", err);

      if (ativoRef.current) {
        setErro(traduzirErro(err));
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-800">Equipamentos</h1>
        <p className="mt-2 text-slate-600">
          Cadastre, edite e gerencie os equipamentos disponíveis para locação.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800">
            {equipamentoEditando ? "Editar equipamento" : "Novo equipamento"}
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
                placeholder="Nome do equipamento"
                required
                disabled={salvando}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Descrição
              </label>
              <textarea
                name="descricao"
                value={form.descricao}
                onChange={handleChange}
                rows={3}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                placeholder="Descrição do equipamento"
                disabled={salvando}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                URL da imagem
              </label>
              <input
                type="text"
                name="imagem_url"
                value={form.imagem_url}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                placeholder="https://..."
                disabled={salvando}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Valor da diária
              </label>
              <input
                type="text"
                name="valor_diaria"
                value={form.valor_diaria}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                placeholder="0,00"
                disabled={salvando}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Quantidade total
              </label>
              <input
                type="text"
                name="quantidade_total"
                value={form.quantidade_total}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                placeholder="1"
                disabled={salvando}
              />
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
              <input
                type="checkbox"
                name="ativo"
                checked={form.ativo}
                onChange={handleChange}
                disabled={salvando}
              />
              <span className="text-sm font-medium text-slate-700">
                Equipamento ativo
              </span>
            </label>

            {erro && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {erro}
              </div>
            )}

            {mensagem && (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {mensagem}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={salvando}
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {salvando
                  ? "Salvando..."
                  : equipamentoEditando
                    ? "Atualizar"
                    : "Cadastrar"}
              </button>

              <button
                type="button"
                onClick={limparFormulario}
                disabled={salvando}
                className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Limpar
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm max-h-[60vh] md:h-[75vh] md:max-h-none flex flex-col">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-slate-800">
              Lista de equipamentos
            </h2>

            <button
              onClick={buscarEquipamentos}
              disabled={carregando}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {carregando ? "Atualizando..." : "Atualizar"}
            </button>
          </div>

          {carregando ? (
            <div className="mt-6 text-slate-600">
              Carregando equipamentos...
            </div>
          ) : equipamentos.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-slate-500">
              Nenhum equipamento cadastrado.
            </div>
          ) : (
            <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-2">
              {equipamentos.map((equipamento) => (
                <div
                  key={equipamento.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1">
                      {equipamento.imagem_url && (
                        <div className="mb-3">
                          <button
                            type="button"
                            onClick={() =>
                              setImagemModal({
                                url: equipamento.imagem_url,
                                nome: equipamento.nome,
                              })
                            }
                            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Ver imagem
                          </button>
                        </div>
                      )}
                      <h3 className="text-lg font-semibold text-slate-800">
                        {equipamento.nome}
                      </h3>

                      <p className="mt-1 text-sm text-slate-600">
                        Diária: {formatarMoeda(equipamento.valor_diaria)}
                      </p>

                      <p className="text-sm text-slate-600">
                        Quantidade total:{" "}
                        {Number(equipamento.quantidade_total ?? 0)}
                      </p>

                      <p className="text-sm text-slate-500">
                        {equipamento.descricao || "Sem descrição"}
                      </p>

                      <p
                        className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          equipamento.ativo
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {equipamento.ativo ? "Ativo" : "Inativo"}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => iniciarEdicao(equipamento)}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                      >
                        Editar
                      </button>

                      <button
                        onClick={() => excluirEquipamento(equipamento.id)}
                        className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {imagemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl">
            <button
              type="button"
              onClick={() => setImagemModal(null)}
              className="absolute right-3 top-3 rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Fechar
            </button>

            <h3 className="mb-4 pr-16 text-lg font-semibold text-slate-800">
              {imagemModal.nome}
            </h3>

            <img
              src={imagemModal.url}
              alt={imagemModal.nome}
              className="max-h-[75vh] w-full rounded-xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
