import { expect, test } from "@playwright/test";
import { fulfillPaged } from "./e2e-support/paged";


async function waitForHydration(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const element = document.querySelector("button, input");
    return Boolean(
      element
      && Object.getOwnPropertyNames(element).some((key) => key.startsWith("__reactFiber")),
    );
  });
}


test.describe("Cadastro de paciente", () => {
  test("permanece utilizável em 320 px e em viewport ampla", async ({ page }) => {
    for (const viewport of [
      { width: 320, height: 780 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/register");
      await waitForHydration(page);

      await expect(page.getByRole("heading", { name: "Crie seu acesso" })).toBeVisible();
      await expect(page.getByLabel("E-mail")).toBeVisible();
      await expect(page.getByRole("button", { name: "Criar minha conta" })).toBeVisible();
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth).toBeLessThanOrEqual(viewport.width);
    }
  });

  test("envia somente os campos permitidos e inicia a sessão local", async ({ page }) => {
    let submittedPayload;
    await page.route("**/auth/patient-registration", async (route) => {
      submittedPayload = route.request().postDataJSON();
      await fulfillPaged(route, {
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            user_id: 12,
            display_name: "Novo Paciente",
            email: "novo@example.com",
            roles: ["patient"],
          },
        }),
      });
    });
    await page.route("**/me", (route) =>
      fulfillPaged(route, {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            user_id: 12,
            display_name: "Novo Paciente",
            email: "novo@example.com",
            roles: ["patient"],
          },
          patient_profile: {
            preferred_name: "Novo",
            full_name: "Novo Paciente",
            avatar_url: null,
            health_status: "pending",
            blood_type: null,
            is_adult: true,
            age: 34,
          },
        }),
      }),
    );
    await page.route("**/me/**", (route) =>
      fulfillPaged(route, { status: 200, contentType: "application/json", body: "[]" }),
    );

    await page.goto("/register");
    await waitForHydration(page);
    await page.getByLabel("E-mail").fill("novo@example.com");
    await page.getByLabel("Nome completo").fill("Novo Paciente");
    await page.getByLabel("Como prefere ser chamado").fill("Novo");
    await page.getByLabel("CPF").fill("529.982.247-25");
    await page.getByLabel("Data de nascimento").fill("1992-09-20");
    await page.getByLabel("Crie uma senha").fill("senha-local-segura");
    await page.getByRole("button", { name: "Criar minha conta" }).click();

    await expect(page).toHaveURL("/home");
    expect(submittedPayload).toEqual({
      email: "novo@example.com",
      password: "senha-local-segura",
      cpf: "529.982.247-25",
      display_name: "Novo Paciente",
      preferred_name: "Novo",
      birth_date: "1992-09-20",
    });
  });
});
