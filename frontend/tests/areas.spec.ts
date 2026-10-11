import { expect, test, type Page, type Route } from "@playwright/test";
import { fulfillPaged } from "./e2e-support/paged";


const API_ORIGIN = "http://localhost:8000";

const patientIdentity = {
  user: {
    user_id: 9,
    display_name: "Carlos da Silva",
    email: "carlos@example.com",
    roles: ["patient"],
  },
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

const doctorIdentity = {
  user: {
    user_id: 7,
    display_name: "Dr. Marcos Nunes",
    email: "marcos@example.com",
    roles: ["doctor"],
  },
  patient_profile: null,
  dependents: [],
};

async function fulfill(route: Route, body: unknown, status = 200) {
  await fulfillPaged(route, {
    status,
    contentType: "application/json",
    body: body === null ? "" : JSON.stringify(body),
  });
}

async function mockIdentity(page: Page, identity: unknown) {
  const requested: string[] = [];
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    requested.push(`${url.pathname}${url.search}`);
    if (url.pathname === "/me") {
      await fulfill(route, identity);
    } else if (url.pathname === "/me/shares/active") {
      await fulfill(route, null);
    } else {
      await fulfill(route, []);
    }
  });
  return requested;
}


test.describe("Áreas por papel", () => {
  test("leva cada papel de /home à sua área sem voltar para /home", async ({ page }) => {
    await mockIdentity(page, doctorIdentity);

    await page.goto("/settings");
    await page.goto("/home");

    await expect(page).toHaveURL("/medical");
    await expect(
      page.getByRole("heading", { name: "Pacientes em acompanhamento" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL("/settings");
  });

  test("redireciona área sem permissão sem consultar a API da área", async ({ page }) => {
    const requested = await mockIdentity(page, patientIdentity);

    for (const path of ["/medical", "/admin", "/patient/dependents"]) {
      await page.goto(path);
      await expect(page).toHaveURL("/patient");
    }

    expect(requested.some((path) => path.startsWith("/medical"))).toBe(false);
    expect(requested.some((path) => path.startsWith("/admin"))).toBe(false);
    await expect(page.getByRole("navigation", { name: "Contexto de acesso" }))
      .toHaveCount(0);
  });

  test("navega entre áreas sem recarregar a identidade", async ({ page }) => {
    const requested = await mockIdentity(page, {
      ...patientIdentity,
      user: { ...patientIdentity.user, roles: ["patient", "doctor"] },
    });

    await page.goto("/patient");
    const contextNav = page.getByRole("navigation", { name: "Contexto de acesso" });
    await contextNav.getByRole("link", { name: "Área profissional" }).click();
    await expect(page).toHaveURL("/medical");
    await contextNav.getByRole("link", { name: "Minha saúde" }).click();
    await expect(page).toHaveURL("/patient");

    expect(requested.filter((path) => path === "/me")).toHaveLength(1);
  });
});
