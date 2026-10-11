import { expect, test, type Page, type Route } from "@playwright/test";


const API_ORIGIN = "http://localhost:8000";
const TOKEN = "k".repeat(43);

const adminEnvelope = {
  user: {
    user_id: 8,
    display_name: "Alex Ferreira",
    email: "admin@email.com",
    roles: ["admin"],
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
    full_name: "Carlos Eduardo da Silva Albuquerque",
    avatar_url: null,
    health_status: "updated",
    blood_type: "A+",
    is_adult: true,
    age: 41,
  },
};

const doctor = {
  doctor_id: 3,
  display_name: "Dra. Ana Beatriz Lima de Albuquerque Figueiredo",
  masked_cpf: "***.111.222-**",
  crm_number: "1234567890",
  crm_state: "SP",
  verification_status: "pending",
  professional_status: "active",
  verified_at: null,
};

function paged(items: unknown[]) {
  return { items, page: 1, has_next: false };
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: body === null ? "" : JSON.stringify(body),
  });
}

async function mockApi(page: Page, handlers: Record<string, unknown>) {
  const calls: string[] = [];
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}${url.search}`;
    calls.push(key);
    if (key in handlers) {
      const handler = handlers[key];
      if (Array.isArray(handler) && typeof handler[1] === "number") {
        await fulfill(route, handler[0], handler[1]);
      } else {
        await fulfill(route, handler);
      }
      return;
    }
    await fulfill(route, { detail: "Não encontrado" }, 404);
  });
  return calls;
}

async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const element = document.querySelector("main h2");
    return Boolean(
      element
      && Object.getOwnPropertyNames(element).some((key) => key.startsWith("__react")),
    );
  });
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  const documentWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(documentWidth).toBeLessThanOrEqual(width);
}


test.describe("Governança administrativa", () => {
  test("área admin funciona em 320 px e respeita a largura de conteúdo ampla", async ({ page }) => {
    const calls = await mockApi(page, {
      "GET /me": adminEnvelope,
      "GET /admin/doctor-invitations": paged([]),
      "GET /admin/doctors": paged([doctor]),
      "GET /admin/care-groups": paged([
        { care_group_id: 1, name: "Unidade Centro", status: "active" },
      ]),
      "POST /admin/doctor-invitations": [
        {
          invitation_id: 7,
          status: "pending",
          expires_at: "2026-10-17T12:00:00",
          token: TOKEN,
        },
        201,
      ],
    });

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/home");
    await expect(
      page.getByRole("heading", { name: "Governança administrativa" }),
    ).toBeVisible();
    await expect(page.getByText(doctor.display_name)).toBeVisible();
    await expectNoHorizontalOverflow(page, 320);

    const tabBoxes = [];
    for (const name of ["Médicos", "Grupos", "Diretório", "Auditoria"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      tabBoxes.push(box);
    }
    const tabTops = new Set(tabBoxes.map((box) => Math.round(box?.y ?? -1)));
    expect(tabTops.size).toBe(1);
    const tabsFit = await page.locator(".admin-tabs").evaluate(
      (nav) => nav.scrollWidth <= nav.clientWidth,
    );
    expect(tabsFit).toBe(true);
    const verifyBox = await page
      .getByRole("button", { name: `Verificar CRM de ${doctor.display_name}` })
      .boundingBox();
    expect(verifyBox?.height).toBeGreaterThanOrEqual(44);

    await page.getByLabel("CPF").fill("529.982.247-25");
    await page.getByLabel("Nome completo").fill("Dra. Ana Lima");
    await page.getByLabel("E-mail").fill("ana@example.com");
    await page.getByLabel("CRM", { exact: true }).fill("123456");
    await page.getByRole("combobox", { name: "UF do CRM" }).click();
    await page.getByRole("option", { name: "SP" }).click();
    await page.getByRole("button", { name: "Emitir convite" }).click();
    await expect(page.getByLabel("Link do convite")).toHaveValue(
      /\/professional-invitation#token=k{43}$/,
    );
    await expectNoHorizontalOverflow(page, 320);

    await page.getByRole("button", { name: "Diretório", exact: true }).click();
    await expect(page.getByLabel("Buscar usuário")).toBeVisible();
    await expectNoHorizontalOverflow(page, 320);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Médicos", exact: true }).click();
    const content = await page.locator(".admin-content").boundingBox();
    const contentMax = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.width = "var(--ds-layout-content)";
      document.body.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    });
    expect(content?.width).toBeLessThanOrEqual(contentMax + 1);
    await expectNoHorizontalOverflow(page, 1440);
    expect(
      calls.every((call) => call === "GET /me" || call.includes(" /admin/")),
    ).toBe(true);
  });

  test("paciente aceita convite de equipe em 320 px", async ({ page }) => {
    let accepted = false;
    await mockApi(page, {
      "GET /me": patientEnvelope,
      "GET /me/vaccines": [],
      "GET /me/alerts": [],
      "GET /me/documents": [],
      "GET /me/markers?status=active": [],
      "GET /me/markers?status=removed": [],
      "GET /me/shares/active": null,
      "GET /me/care-groups": [],
      "GET /me/care-requests": [],
      "GET /me/care-doctors": [],
      "GET /me/care-invitations": [
        {
          invitation_id: 4,
          care_group_name: "Cardiologia e Acompanhamento Ambulatorial Integrado",
          expires_at: "2026-10-17T12:00:00",
          doctors: [
            {
              display_name: "Dra. Ana Beatriz Lima de Albuquerque Figueiredo",
              crm_number: "1234567890",
              crm_state: "SP",
            },
          ],
        },
      ],
    });

    await page.route(`${API_ORIGIN}/me/care-invitations/4/accept`, async (route) => {
      accepted = true;
      await route.fulfill({ status: 204, body: "" });
    });

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/home");
    const accept = page.getByRole("button", {
      name: "Aceitar convite de Cardiologia e Acompanhamento Ambulatorial Integrado",
    });
    await expect(accept).toBeVisible();
    expect((await accept.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page, 320);

    await accept.click();
    await expect(
      page.getByText("Convite aceito. A equipe passa a acessar seu prontuário."),
    ).toBeVisible();
    expect(accepted).toBe(true);
  });

  test("convite profissional remove o token da URL em 320 px e amplo", async ({ page }) => {
    for (const viewport of [
      { width: 320, height: 740 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("about:blank");
      await page.goto(`/professional-invitation#token=${TOKEN}`);
      await waitForHydration(page);
      await expect(
        page.getByRole("heading", { name: "Concluir cadastro médico" }),
      ).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
      await expectNoHorizontalOverflow(page, viewport.width);
    }

    await page.goto("/professional-invitation");
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Link de convite incompleto",
    );
  });
});
