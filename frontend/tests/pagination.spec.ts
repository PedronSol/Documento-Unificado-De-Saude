import { expect, test, type Page } from "@playwright/test";


const API_ORIGIN = "http://localhost:8000";

const patientIdentity = {
  user: { user_id: 1, display_name: "Carlos da Silva", email: "c@example.com", roles: ["patient"] },
  patient_profile: {
    preferred_name: "Carlos",
    full_name: "Carlos Eduardo da Silva",
    avatar_url: null,
    health_status: "updated",
    blood_type: "A+",
    is_adult: true,
    age: 41,
  },
  dependents: [],
};

const vaccines = Array.from({ length: 45 }, (_, index) => ({
  vaccine_id: index + 1,
  name: `Vacina ${String(index + 1).padStart(2, "0")}`,
  dose: "Dose única",
  administered_on: "2025-01-15",
  status: index % 3 === 0 ? "pending" : "applied",
}));

// Serves /me/vaccines like the API: filters and slices on the "server".
async function mockPaginatedApi(page: Page) {
  const requests: string[] = [];
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/me") {
      return route.fulfill({ json: patientIdentity });
    }
    if (url.pathname === "/me/shares/active") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    }
    if (url.pathname === "/me/vaccines") {
      requests.push(url.search);
      const query = (url.searchParams.get("query") || "").toLowerCase();
      const status = url.searchParams.get("status");
      const pageNumber = Number(url.searchParams.get("page"));
      const pageSize = Number(url.searchParams.get("page_size"));
      const filtered = vaccines.filter((item) => (
        (!query || item.name.toLowerCase().includes(query)) && (!status || item.status === status)
      ));
      const items = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
      return route.fulfill({
        json: {
          items,
          page: pageNumber,
          page_size: pageSize,
          total: filtered.length,
          has_next: pageNumber * pageSize < filtered.length,
        },
      });
    }
    const empty = url.searchParams.has("page")
      ? { items: [], page: 1, page_size: 20, total: 0, has_next: false }
      : [];
    return route.fulfill({ json: empty });
  });
  return requests;
}


for (const viewport of [{ width: 320, height: 800 }, { width: 1280, height: 900 }]) {
  test(`pagina vacinas com rolagem infinita, busca e tamanho em ${viewport.width} px`, async ({ page }) => {
    const requests = await mockPaginatedApi(page);
    await page.setViewportSize(viewport);
    await page.goto("/patient");

    const section = page.locator("section", { has: page.getByRole("heading", { name: "Histórico de Vacinação" }) });
    await expect(section.getByText("Vacina 20")).toBeVisible();
    await expect(section.getByText("Vacina 21")).toHaveCount(0);
    expect(requests[0]).toBe("?page=1&page_size=20");

    await section.locator(".infinite-list-sentinel").scrollIntoViewIfNeeded();
    await expect(section.getByText("Vacina 40")).toBeVisible();
    await expect(section.getByText("40 de 45 vacinas carregadas")).toBeAttached();
    expect(requests).toContain("?page=2&page_size=20");

    const more = section.getByRole("button", { name: "Carregar mais" });
    expect((await more.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await more.click();
    await expect(section.getByText("Vacina 45")).toBeVisible();
    await expect(more).toHaveCount(0);

    await section.getByRole("searchbox", { name: "Buscar vacinas" }).fill("vacina 4");
    await expect(section.getByText("Vacina 01")).toHaveCount(0);
    await expect(section.getByText("6 resultados")).toBeVisible();
    expect(requests).toContain("?page=1&page_size=20&query=vacina+4");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);

    await section.getByRole("button", { name: "Limpar busca" }).click();
    await section.getByLabel("Itens por página").click();
    await page.getByRole("option", { name: "50" }).click();
    await expect(section.getByText("Vacina 45")).toBeVisible();
    expect(requests).toContain("?page=1&page_size=50");
  });
}
