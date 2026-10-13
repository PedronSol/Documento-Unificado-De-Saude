import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthMarkers } from "@/components/markers/health-markers";


describe("HealthMarkers", () => {
  it("explica ao paciente o que registrar como marcador", () => {
    render(<HealthMarkers initialActive={[]} initialRemoved={[]} isAdult />);

    expect(
      screen.getByText(
        "Informações que ajudam a representar seu estado de saúde atual.",
      ),
    ).toBeInTheDocument();
  });

  it("mantém a introdução da visão médica", () => {
    render(
      <HealthMarkers
        initialActive={[]}
        initialRemoved={[]}
        isAdult
        variant="medical"
      />,
    );

    expect(
      screen.getByText("Marcadores ativos e histórico preservado deste paciente."),
    ).toBeInTheDocument();
  });
});
