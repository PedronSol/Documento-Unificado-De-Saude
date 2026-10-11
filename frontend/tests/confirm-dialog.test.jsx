import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";


function Harness({ onConfirm, acknowledgement }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>Abrir</button>
      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Remover documento enviado por médico"
        description="O documento deixará de ficar disponível."
        confirmLabel="Remover documento"
        acknowledgement={acknowledgement}
        onConfirm={onConfirm}
      />
    </>
  );
}


describe("ConfirmDialog", () => {
  it("exige marcar a confirmação antes de habilitar a ação", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        onConfirm={onConfirm}
        acknowledgement="Entendo que este documento foi enviado por Dra. Ana Lima"
      />,
    );

    const confirm = screen.getByRole("button", { name: "Remover documento" });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", {
      name: "Entendo que este documento foi enviado por Dra. Ana Lima",
    }));
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("desmarca a confirmação ao fechar e reabrir", async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={vi.fn()} acknowledgement="Entendo" />);

    await user.click(screen.getByRole("checkbox", { name: "Entendo" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Abrir" }));

    expect(screen.getByRole("checkbox", { name: "Entendo" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Remover documento" })).toBeDisabled();
  });

  it("mantém o comportamento atual sem confirmação marcada", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Remover documento" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
