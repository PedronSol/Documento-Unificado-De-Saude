import { expect, test, type Page, type Route } from "@playwright/test";
import { fulfillPaged } from "./e2e-support/paged";


const API_ORIGIN = "http://localhost:8000";

const doctorEnvelope = {
  user: {
    user_id: 7,
    display_name: "Dr. Marcos Nunes",
    email: "marcos@example.com",
    roles: ["doctor"],
  },
  patient_profile: null,
};

const patientEnvelope = {
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
};

async function fulfill(route: Route, body: unknown, status = 200) {
  await fulfillPaged(route, {
    status,
    contentType: "application/json",
    body: body === null ? "" : JSON.stringify(body),
  });
}

async function mockApi(page: Page, handler: (key: string, route: Route) => Promise<boolean>) {
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    // Pagination is ignored when keying mocks; fulfillPaged wraps the list.
    url.searchParams.delete("page");
    url.searchParams.delete("page_size");
    const key = `${request.method()} ${url.pathname}${url.search}`;
    if (!(await handler(key, route))) {
      await fulfill(route, [], 200);
    }
  });
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width);
}


test.describe("Vínculo direto médico–paciente", () => {
  test("médico solicita acesso pelo CPF em 320 px e viewport ampla", async ({ page }) => {
    let pending: unknown[] = [];
    let submitted: unknown = null;
    await mockApi(page, async (key, route) => {
      if (key === "GET /me") {
        await fulfill(route, doctorEnvelope);
        return true;
      }
      if (key === "GET /medical/patient-links?status=pending") {
        await fulfill(route, pending);
        return true;
      }
      if (key === "POST /medical/patient-links") {
        submitted = route.request().postDataJSON();
        pending = [{
          link_id: 8,
          patient_display_name: "Carlos Eduardo da Silva Albuquerque Figueiredo",
          masked_cpf: "***.982.247-**",
          expires_at: "2026-10-18T12:00:00",
        }];
        await fulfill(route, { result: "request_sent", link_id: 8 }, 202);
        return true;
      }
      return false;
    });

    for (const viewport of [{ width: 320, height: 800 }, { width: 1440, height: 900 }]) {
      pending = [];
      await page.setViewportSize(viewport);
      await page.goto("/home");
      const cpfField = page.getByLabel("CPF do paciente");
      await expect(cpfField).toBeVisible();
      await cpfField.fill("529.982.247-25");
      const submit = page.getByRole("button", { name: "Solicitar acesso" });
      expect((await submit.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await submit.click();
      await expect(
        page.getByText("Solicitação enviada. O acesso começa após o aceite do paciente."),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Cancelar solicitação para Carlos Eduardo da Silva Albuquerque Figueiredo",
        }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page, viewport.width);
    }
    expect(submitted).toEqual({ cpf: "529.982.247-25" });
  });

  test("paciente aceita solicitação de médico em 320 px", async ({ page }) => {
    let accepted = false;
    await mockApi(page, async (key, route) => {
      if (key === "GET /me") {
        await fulfill(route, patientEnvelope);
        return true;
      }
      if (key === "GET /me/shares/active") {
        await fulfill(route, null);
        return true;
      }
      if (key === "GET /me/care-requests") {
        await fulfill(route, accepted ? [] : [{
          link_id: 11,
          doctor_display_name: "Dr. Marcos Nunes",
          crm_number: "100002",
          crm_state: "RN",
          expires_at: "2026-10-18T12:00:00",
        }]);
        return true;
      }
      if (key === "POST /me/care-requests/11/accept") {
        accepted = true;
        await fulfill(route, null, 204);
        return true;
      }
      return false;
    });

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/home");
    const accept = page.getByRole("button", {
      name: "Aceitar solicitação de Dr. Marcos Nunes",
    });
    await expect(accept).toBeVisible();
    expect((await accept.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page, 320);
    await accept.click();
    await expect(
      page.getByText("Solicitação aceita. O médico passa a acessar seu prontuário."),
    ).toBeVisible();
    expect(accepted).toBe(true);
  });
});


test.describe("Paciente provisório", () => {
  test("médico cadastra provisório e recebe link com QR em 320 px e amplo", async ({ page }) => {
    const token = "q".repeat(43);
    await mockApi(page, async (key, route) => {
      if (key === "GET /me") {
        await fulfill(route, doctorEnvelope);
        return true;
      }
      if (key === "POST /medical/patient-links") {
        const body = route.request().postDataJSON();
        if (!body.patient) {
          await fulfill(route, { detail: "Paciente não encontrado." }, 404);
        } else {
          await fulfill(route, {
            result: "provisional_created",
            patient_id: 40,
            claim: { token, expires_at: "2026-10-18T12:00:00", recipient: "patient" },
          }, 201);
        }
        return true;
      }
      return false;
    });

    for (const viewport of [{ width: 320, height: 900 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/home");
      await page.getByLabel("CPF do paciente").fill("529.982.247-25");
      await page.getByRole("button", { name: "Solicitar acesso" }).click();
      await page.getByLabel("Nome completo").fill("Joana Prado Ribeiro Albuquerque");
      await page.getByLabel("Nome preferido").fill("Joana");
      await page.getByLabel("Data de nascimento").fill("1979-08-15");
      await page.getByRole("button", { name: "Cadastrar paciente provisório" }).click();
      await expect(page.getByLabel("Link para o paciente assumir a conta")).toHaveValue(
        new RegExp(`/patient-claim#token=${token}$`),
      );
      await expect(page.getByRole("img", { name: "QR-Code para assumir a conta" })).toBeVisible();
      await expectNoHorizontalOverflow(page, viewport.width);
    }
  });

  test("paciente assume a conta pela página de reivindicação", async ({ page }) => {
    let submitted: Record<string, string> | null = null;
    await mockApi(page, async (key, route) => {
      if (key === "POST /auth/patient-claim/local") {
        submitted = route.request().postDataJSON();
        await fulfill(route, { user: { user_id: 40, display_name: "Joana", email: "j@example.com", roles: ["patient"] } }, 201);
        return true;
      }
      return false;
    });
    const token = "r".repeat(43);

    for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto("about:blank");
      await page.goto(`/patient-claim#token=${token}`);
      await expect(page.getByRole("heading", { name: "Assumir minha conta" })).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
      await expectNoHorizontalOverflow(page, viewport.width);
    }

    await page.getByLabel("CPF").fill("529.982.247-25");
    await page.getByLabel("Data de nascimento").fill("1979-08-15");
    await page.getByLabel("E-mail").fill("joana@example.com");
    await page.getByLabel("Senha").fill("senha-paciente-segura");
    await page.getByRole("button", { name: "Assumir minha conta" }).click();
    await expect.poll(() => submitted).toEqual({
      token,
      cpf: "529.982.247-25",
      birth_date: "1979-08-15",
      email: "joana@example.com",
      password: "senha-paciente-segura",
    });
  });
});


test.describe("Responsável legal", () => {
  test("responsável alterna para a saúde do dependente com cabeçalho de atuação", async ({ page }) => {
    const actingHeaders: string[] = [];
    const guardianEnvelope = {
      ...patientEnvelope,
      dependents: [{
        patient_id: 41,
        guardianship_id: 4,
        preferred_name: "Lia",
        full_name: "Lia Prado Ribeiro",
        avatar_url: null,
        health_status: "pending",
        blood_type: null,
        is_adult: false,
        age: 9,
      }],
    };
    await mockApi(page, async (key, route) => {
      const acting = route.request().headers()["x-acting-patient"];
      if (key === "GET /me") {
        await fulfill(route, guardianEnvelope);
        return true;
      }
      if (key === "GET /me/shares/active") {
        await fulfill(route, null);
        return true;
      }
      if (key === "GET /me/markers?status=active") {
        if (acting) {
          actingHeaders.push(acting);
        }
        await fulfill(route, acting === "41" ? [{
          marker_id: 1,
          type: "allergy",
          name: "Amendoim",
          description: null,
          dosage: null,
          frequency: null,
          status: "active",
          created_at: "2026-10-10T12:00:00",
          updated_at: "2026-10-10T12:00:00",
          removed_at: null,
        }] : []);
        return true;
      }
      return false;
    });

    for (const viewport of [{ width: 320, height: 800 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/home");
      await expect(page).toHaveURL("/patient");
      const contextNav = page.getByRole("navigation", { name: "Contexto de acesso" });
      const dependentContext = contextNav.getByRole("link", { name: "Saúde de Lia" });
      await expect(dependentContext).toBeVisible();
      if (viewport.width === 320) {
        expect((await dependentContext.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
      await dependentContext.click();
      await expect(page).toHaveURL("/patient/dependents/41");
      await expect(page.getByRole("heading", { name: "Lia", exact: true })).toBeVisible();
      await expect(page.getByText("Amendoim")).toBeVisible();
      await expect(dependentContext).toHaveAttribute("aria-current", "page");
      const banner = page.getByRole("region", { name: "Você está vendo a saúde de Lia" });
      await expect(banner.getByText("Menor de idade")).toBeVisible();
      const minorColors = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const probe = document.createElement("span");
        probe.style.color = root.getPropertyValue("--ds-color-minor");
        probe.style.backgroundColor = root.getPropertyValue("--ds-color-minor-soft");
        document.body.append(probe);
        const expected = getComputedStyle(probe);
        const result = {
          expectedText: expected.color,
          expectedSoft: expected.backgroundColor,
          banner: getComputedStyle(document.querySelector(".dependent-context-banner")!).backgroundColor,
          badge: getComputedStyle(document.querySelector(".dependent-context-banner .minor-badge")!).color,
          switcher: getComputedStyle(document.querySelector('.context-switcher a[aria-current="page"]')!).color,
          action: getComputedStyle(document.querySelector(".patient-main button")!).backgroundColor,
        };
        probe.remove();
        return result;
      });
      expect(minorColors.banner).toBe(minorColors.expectedSoft);
      expect(minorColors.badge).toBe(minorColors.expectedText);
      expect(minorColors.switcher).toBe(minorColors.expectedText);
      expect(minorColors.action).not.toBe(minorColors.expectedText);
      await expectNoHorizontalOverflow(page, viewport.width);
      await contextNav.getByRole("link", { name: "Minha saúde" }).click();
      await expect(page).toHaveURL("/patient");
      await expect(page.getByText("Amendoim")).toHaveCount(0);
    }
    expect(new Set(actingHeaders)).toEqual(new Set(["41"]));
  });

  test("responsável lista os dependentes e não acessa dependente alheio pela URL", async ({ page }) => {
    const actingHeaders: string[] = [];
    const guardianEnvelope = {
      ...patientEnvelope,
      dependents: [
        {
          patient_id: 41,
          guardianship_id: 4,
          has_own_access: false,
          preferred_name: "Lia",
          full_name: "Lia Prado Ribeiro",
          avatar_url: null,
          health_status: "pending",
          blood_type: null,
          is_adult: false,
          age: 9,
        },
        {
          patient_id: 42,
          guardianship_id: 5,
          has_own_access: true,
          preferred_name: "Caio",
          full_name: "Caio Prado Ribeiro com um nome bastante longo para quebrar",
          avatar_url: null,
          health_status: "updated",
          blood_type: null,
          is_adult: true,
          age: 19,
        },
      ],
    };
    await mockApi(page, async (key, route) => {
      const acting = route.request().headers()["x-acting-patient"];
      if (acting) {
        actingHeaders.push(acting);
      }
      if (key === "GET /me") {
        await fulfill(route, guardianEnvelope);
        return true;
      }
      if (key === "GET /me/shares/active") {
        await fulfill(route, null);
        return true;
      }
      return false;
    });

    for (const viewport of [{ width: 320, height: 800 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/patient");
      await page.getByRole("link", { name: "Meus dependentes" }).click();
      await expect(page).toHaveURL("/patient/dependents");
      const list = page.getByRole("list", { name: "Meus dependentes" });
      await expect(list.getByRole("listitem")).toHaveCount(2);
      await expect(list.getByRole("listitem").nth(0).getByText("Menor de idade")).toBeVisible();
      await expect(list.getByRole("listitem").nth(1).getByText("Menor de idade")).toHaveCount(0);
      const link = list.getByRole("link", { name: "Ver saúde de Caio" });
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await expectNoHorizontalOverflow(page, viewport.width);
      await link.click();
      await expect(page).toHaveURL("/patient/dependents/42");
      const banner = page.getByRole("region", { name: "Você está vendo a saúde de Caio" });
      await expect(banner).toBeVisible();
      await expect(banner.getByText("Menor de idade")).toHaveCount(0);
      await expect(page.locator("[data-patient-tone='minor']")).toHaveCount(0);
      await banner.getByRole("link", { name: "Voltar aos meus dependentes" }).click();
      await expect(page).toHaveURL("/patient/dependents");
    }

    actingHeaders.length = 0;
    await page.goto("/patient/dependents/99");
    await expect(page).toHaveURL("/patient");
    expect(actingHeaders).not.toContain("99");
  });

  test("médico informa o responsável de um menor em 320 px", async ({ page }) => {
    let guardianPayload: unknown = null;
    await mockApi(page, async (key, route) => {
      if (key === "GET /me") {
        await fulfill(route, doctorEnvelope);
        return true;
      }
      if (key === "POST /medical/patient-links") {
        const body = route.request().postDataJSON();
        if (!body.patient) {
          await fulfill(route, { detail: "Paciente não encontrado." }, 404);
        } else if (!body.guardian) {
          await fulfill(route, { detail: "Paciente menor exige responsável." }, 409);
        } else {
          guardianPayload = body.guardian;
          await fulfill(route, {
            result: "provisional_created",
            patient_id: 41,
            claim: { token: "g".repeat(43), expires_at: "2026-10-18T12:00:00", recipient: "guardian" },
          }, 201);
        }
        return true;
      }
      return false;
    });

    await page.setViewportSize({ width: 320, height: 1000 });
    await page.goto("/home");
    await page.getByLabel("CPF do paciente").fill("529.982.247-25");
    await page.getByRole("button", { name: "Solicitar acesso" }).click();
    await page.getByLabel("Nome completo", { exact: true }).fill("Lia Prado Ribeiro");
    await page.getByLabel("Nome preferido").fill("Lia");
    await page.getByLabel("Data de nascimento", { exact: true }).fill("2016-05-02");
    await page.getByRole("button", { name: "Cadastrar paciente provisório" }).click();
    await page.getByLabel("CPF do responsável").fill("168.995.350-09");
    await page.getByLabel("Nome completo do responsável").fill("Joana Prado Ribeiro");
    await page.getByLabel("Data de nascimento do responsável").fill("1986-02-11");
    await page.getByRole("combobox", { name: "Parentesco" }).click();
    await page.getByRole("option", { name: "Mãe ou pai" }).click();
    await expectNoHorizontalOverflow(page, 320);
    await page.getByRole("button", { name: "Cadastrar paciente provisório" }).click();

    await expect(page.getByLabel("Link para o responsável assumir a conta")).toHaveValue(
      /&for=guardian$/,
    );
    expect(guardianPayload).toEqual({
      cpf: "168.995.350-09",
      full_name: "Joana Prado Ribeiro",
      birth_date: "1986-02-11",
      relationship: "parent",
    });
  });
});


test.describe("Transferência e desvínculo", () => {
  test("dependente adulto desvincula responsável e responsável gera acesso", async ({ page }) => {
    let released = false;
    let transferRequested = false;
    const envelope = {
      ...patientEnvelope,
      dependents: [{
        patient_id: 41,
        guardianship_id: 4,
        has_own_access: false,
        preferred_name: "Ana",
        full_name: "Ana Prado Ribeiro",
        avatar_url: null,
        health_status: "pending",
        blood_type: null,
        is_adult: true,
        age: 18,
      }],
    };
    await mockApi(page, async (key, route) => {
      if (key === "GET /me") {
        await fulfill(route, envelope);
        return true;
      }
      if (key === "GET /me/shares/active") {
        await fulfill(route, null);
        return true;
      }
      if (key === "GET /me/guardians") {
        await fulfill(route, released ? [] : [{
          guardianship_id: 7,
          guardian_display_name: "Joana Prado Ribeiro",
          relationship: "parent",
          status: "active",
          awaiting_my_confirmation: false,
        }]);
        return true;
      }
      if (key === "DELETE /me/guardians/7") {
        released = true;
        await fulfill(route, null, 204);
        return true;
      }
      if (key === "POST /me/dependents/41/claim-link") {
        transferRequested = true;
        await fulfill(route, { token: "t".repeat(43), expires_at: "2026-10-18T12:00:00", recipient: "patient" }, 201);
        return true;
      }
      return false;
    });

    for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 900 }]) {
      released = false;
      await page.setViewportSize(viewport);
      await page.goto("/home");
      const transfer = page.getByRole("button", { name: "Gerar acesso para Ana" });
      await expect(transfer).toBeVisible();
      await transfer.click();
      await expect(page.getByLabel("Link para o paciente assumir a conta")).toBeVisible();
      await page.getByRole("button", { name: "Desvincular Joana Prado Ribeiro" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Desvincular responsável" }).click();
      await expect(page.getByRole("heading", { name: "Meus responsáveis" })).toHaveCount(0);
      await expectNoHorizontalOverflow(page, viewport.width);
    }
    expect(transferRequested).toBe(true);
  });
});
