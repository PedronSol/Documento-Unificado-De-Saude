import { describe, expect, it } from "vitest";

import { formatCpf } from "@/lib/cpf";


describe("formatCpf", () => {
  it.each([
    ["", ""],
    ["529", "529"],
    ["5299", "529.9"],
    ["529982", "529.982"],
    ["5299822", "529.982.2"],
    ["529982247", "529.982.247"],
    ["5299822472", "529.982.247-2"],
    ["52998224725", "529.982.247-25"],
  ])("formata progressivamente %s", (input, expected) => {
    expect(formatCpf(input)).toBe(expected);
  });

  it("aceita CPF já formatado", () => {
    expect(formatCpf("529.982.247-25")).toBe("529.982.247-25");
  });

  it("descarta letras e símbolos e ignora dígitos além de 11", () => {
    expect(formatCpf("52a9.98#2247-2599")).toBe("529.982.247-25");
  });
});
