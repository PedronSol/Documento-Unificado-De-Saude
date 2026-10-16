import { useRef, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MarkerDialog } from "@/components/markers/marker-dialogs";

function Form({ editing = false, onSubmit = vi.fn() }) {
  const returnFocusRef = useRef(null);
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState({
    name: editing ? "Marcador personalizado" : "",
    type: "medication",
    description: "Contexto existente",
    dosage: "50 mg",
    frequency: "1 vez ao dia",
  });
  return <MarkerDialog
    form={form} isEditing={editing} isOpen={open} isSaving={false}
    returnFocusRef={returnFocusRef} onOpenChange={setOpen}
    onFieldChange={({ target: { name, value } }) => setForm((current) => ({ ...current, [name]: value }))}
    onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}
  />;
}

describe("sugestões de nome no diálogo de marcadores", () => {
  it("abre e fecha pela seta como Tipo e mantém o foco no campo", async () => {
    const user = userEvent.setup();
    render(<Form />);
    const input = screen.getByLabelText("Nome do marcador");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abrir sugestões de marcadores" }));
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(input).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Fechar sugestões de marcadores" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("associa pressão ao nome completo e mantém o check ao reabrir", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<Form onSubmit={submit} />);
    const input = screen.getByLabelText("Nome do marcador");
    await user.type(input, "pressão");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{ArrowDown}{Enter}");
    const name = "Pressão arterial (sistólica/diastólica)";
    expect(input).toHaveValue(name);
    await user.click(screen.getByRole("button", { name: "Abrir sugestões de marcadores" }));
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(screen.getByRole("option", { name })).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("option", { name })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Adicionar marcador" }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name }));
    await user.clear(input);
    await user.type(input, "Pressão personalizada");
    expect(screen.queryByRole("option", { selected: true })).not.toBeInTheDocument();
  });

  it("abre por clique e filtra sem acentos ou diferença de caixa", async () => {
    const user = userEvent.setup();
    render(<Form />);
    const input = screen.getByRole("combobox", { name: "Nome do marcador" });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.click(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option")).toHaveLength(6);
    for (const name of ["Cardiovascular", "Diabetes / Metabolismo", "Composição corporal"]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    }
    await user.type(input, "  PRESSAO  ");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: "Pressão arterial (sistólica/diastólica)" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Composição corporal" })).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  it("preenche somente o nome por clique, sem enviar e preservando campos clínicos", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<Form onSubmit={submit} />);
    await user.click(screen.getByLabelText("Nome do marcador"));
    await user.click(screen.getByRole("option", { name: "Glicemia em jejum" }));
    expect(screen.getByLabelText("Nome do marcador")).toHaveValue("Glicemia em jejum");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Tipo")).toHaveTextContent("Medicação");
    expect(screen.getByLabelText("Observação")).toHaveValue("Contexto existente");
    expect(screen.getByLabelText("Dosagem")).toHaveValue("50 mg");
    expect(screen.getByLabelText("Frequência")).toHaveValue("1 vez ao dia");
    await user.click(screen.getByRole("button", { name: "Adicionar marcador" }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: "Glicemia em jejum", type: "medication" }));
  });

  it("navega com setas e seleciona com Enter sem enviar; Escape fecha a lista antes do modal", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<Form onSubmit={submit} />);
    const input = screen.getByLabelText("Nome do marcador");
    await user.type(input, "glicemia");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    const option = screen.getByRole("option", { name: "Glicemia pós-prandial" });
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    expect(option).toHaveAttribute("data-highlighted");
    expect(option).toHaveAttribute("aria-selected", "false");
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("Glicemia pós-prandial");
    expect(input).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
    await user.keyboard("{ArrowUp}{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("aceita nome livre sem resultados e Enter envia quando não há opção ativa", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<Form onSubmit={submit} />);
    const input = screen.getByLabelText("Nome do marcador");
    await user.type(input, "Minha condição");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Nenhuma sugestão encontrada");
    await user.keyboard("{Enter}");
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: "Minha condição" }));
  });

  it("preserva o nome em edição; Tab e clique fora fecham sem escolher e novo foco reabre", async () => {
    const user = userEvent.setup();
    render(<Form editing />);
    const input = screen.getByLabelText("Nome do marcador");
    expect(input).toHaveValue("Marcador personalizado");
    await user.clear(input);
    await user.keyboard("{ArrowDown}{Tab}");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.click(input);
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(6);
    await user.click(screen.getByLabelText("Observação"));
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.click(input);
    await user.keyboard("{ArrowUp}{Enter}");
    expect(input).toHaveValue("Circunferência abdominal");
  });
});
