import { test, expect } from '@playwright/test';

const MOCK_USER = {
  user_id: 1,
  display_name: 'Carlos Eduardo Silva',
  email: 'carlos.silva@email.com',
  roles: ['patient'],
};

const MOCK_LOGIN_RESPONSE = {
  user: MOCK_USER,
};

const MOCK_PROFILE_RESPONSE = {
  user: MOCK_USER,
  patient_profile: {
    preferred_name: 'Carlos Silva',
    full_name: 'Carlos Eduardo Silva',
    avatar_url: null,
    health_status: 'updated',
    blood_type: 'A+',
    is_adult: true,
    age: 41,
  },
};

const MOCK_VACCINES = [
  {
    vaccine_id: 1,
    name: 'COVID-19 (Pfizer)',
    dose: '3ª Dose - Reforço',
    administered_on: '2024-02-10',
    status: 'applied',
  },
];

const MOCK_ALERTS = [
  {
    alert_id: 1,
    type: 'condition',
    title: 'Hipertensão',
    description: 'Controlada.',
    severity: 'high',
  },
];

const MOCK_DOCUMENTS = [];


async function waitForHydration(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const el = document.querySelector('button, input');
    return !!el && Object.getOwnPropertyNames(el).some(k => k.startsWith('__reactFiber'));
  });
}

test.describe('Página de Login', () => {
  test('mantém a moldura lateral alinhada ao dashboard em desktop e mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await waitForHydration(page);

    const desktopIntro = await page.locator('.login-intro').boundingBox();
    const desktopAccess = await page.locator('.login-access').boundingBox();
    expect(desktopIntro?.x).toBeGreaterThanOrEqual(24);
    expect(desktopIntro?.x).toBeLessThanOrEqual(36);
    expect((desktopAccess?.x ?? 0) + (desktopAccess?.width ?? 0)).toBeLessThanOrEqual(1896);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileIntro = await page.locator('.login-intro').boundingBox();
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(mobileIntro?.x).toBeGreaterThanOrEqual(8);
    expect(mobileIntro?.x).toBeLessThanOrEqual(12);
    expect(pageWidth).toBeLessThanOrEqual(390);
  });

  test('exibe os elementos da página corretamente', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);

    await expect(page.getByRole('heading', { name: 'Sua história de saúde, com você.' })).toBeVisible();
    await expect(page.getByText('Documento Unificado de Saúde')).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByPlaceholder('Digite sua senha')).toBeVisible();
    await expect(page.getByRole('button', { name: /Entrar/i })).toBeVisible();
  });

  test('alterna visibilidade da senha', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);

    const senhaInput = page.getByRole('textbox', { name: 'Senha' });
    await expect(senhaInput).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Mostrar senha' }).click();
    await expect(senhaInput).toHaveAttribute('type', 'text');
  });

  test('exibe mensagem de erro com credenciais inválidas', async ({ page }) => {
    await page.route('**/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'E-mail ou senha incorretos.' }),
      })
    );

    await page.goto('/');
    await waitForHydration(page);
    await page.getByLabel('E-mail').fill('errado@email.com');
    await page.getByRole('textbox', { name: 'Senha' }).fill('senhaerrada');
    await page.getByRole('button', { name: /Entrar/i }).click();

    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible({ timeout: 10000 });
  });

  test('redireciona para /home após login com sucesso', async ({ page }) => {
    await page.route('**/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_LOGIN_RESPONSE),
      })
    );
    await page.route('**/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PROFILE_RESPONSE),
      })
    );

    await page.goto('/');
    await waitForHydration(page);
    await page.getByLabel('E-mail').fill('carlos.silva@email.com');
    await page.getByRole('textbox', { name: 'Senha' }).fill('senha123');
    await page.getByRole('button', { name: /Entrar/i }).click();

    await expect(page).toHaveURL('/home', { timeout: 10000 });
  });
});

test.describe('Página Home', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PROFILE_RESPONSE),
      })
    );
    await page.route('**/me/vaccines', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_VACCINES),
      })
    );
    await page.route('**/me/alerts', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ALERTS),
      })
    );
    await page.route('**/me/documents', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DOCUMENTS),
      })
    );
    await page.goto('/home');
    await waitForHydration(page);
  });

  test('exibe o nome do paciente logado', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Carlos Silva' })
    ).toBeVisible({ timeout: 10000 });
  });

  test('preserva avatar e resumo do perfil sem expor CPF', async ({ page }) => {
    const avatar = page.getByRole('img', { name: 'Avatar de Carlos Silva' });
    await expect(avatar).toBeVisible();
    await expect(avatar).toContainText('CS');
    await expect(page.getByText('Meu perfil')).toBeVisible();
    await expect(page.getByText('Carlos Eduardo Silva')).toBeVisible();
    await expect(page.getByText('41 anos')).toBeVisible();
    await expect(page.getByText('A+')).toBeVisible();
    await expect(page.locator('.patient-main')).not.toContainText(/CPF/i);
  });

  test('exibe vacinas do paciente', async ({ page }) => {
    await expect(page.getByText('COVID-19 (Pfizer)')).toBeVisible({ timeout: 10000 });
  });

  test('mantém o dashboard amplo e os cards alinhados em desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.unroute('**/me/vaccines');
    await page.route('**/me/vaccines', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          ...MOCK_VACCINES,
          {
            vaccine_id: 2,
            name: 'Influenza',
            dose: 'Dose Anual',
            administered_on: null,
            status: 'pending',
          },
          {
            vaccine_id: 3,
            name: 'Hepatite B',
            dose: '3ª Dose',
            administered_on: '2024-01-05',
            status: 'applied',
          },
        ]),
      })
    );
    await page.goto('/home');
    await waitForHydration(page);

    const dashboard = await page.locator('.patient-main').boundingBox();
    expect(dashboard?.x).toBeGreaterThanOrEqual(24);
    expect(dashboard?.x).toBeLessThanOrEqual(48);
    expect(dashboard?.width).toBeGreaterThan(1800);

    const vaccineCards = await page.locator('.vaccine-entry').all();
    const cardBounds = await Promise.all(vaccineCards.map((card) => card.boundingBox()));
    expect(cardBounds).toHaveLength(3);
    expect(cardBounds[0]?.y).toBeCloseTo(cardBounds[1]?.y ?? 0, 0);
    expect(cardBounds[1]?.y).toBeCloseTo(cardBounds[2]?.y ?? 0, 0);
    expect(cardBounds.every((bounds) => (bounds?.width ?? 0) > 500)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileDashboard = await page.locator('.patient-main').boundingBox();
    const mobileCards = await Promise.all(
      vaccineCards.map((card) => card.boundingBox())
    );
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(mobileDashboard?.x).toBeGreaterThanOrEqual(8);
    expect(mobileDashboard?.x).toBeLessThanOrEqual(12);
    expect(mobileDashboard?.width).toBeLessThan(390);
    expect(pageWidth).toBeLessThanOrEqual(390);
    expect(mobileCards[1]?.y).toBeGreaterThan(mobileCards[0]?.y ?? 0);
    expect(mobileCards[2]?.y).toBeGreaterThan(mobileCards[1]?.y ?? 0);
  });

  test('exibe estado institucional para doctor sem dados clínicos', async ({ page }) => {
    await page.unroute('**/me');
    await page.route('**/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            user_id: 7,
            display_name: 'Dr. Rui Lima',
            email: 'rui@example.com',
            roles: ['doctor'],
          },
          patient_profile: null,
        }),
      })
    );
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Área profissional' })).toBeVisible();
    await expect(page.locator('.credential-name')).toHaveText('Dr. Rui Lima');
    await expect(page.locator('.credential-avatar')).toContainText('DR');
    const credentialStyle = await page.locator('.institutional-credential').evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, radius: style.borderRadius };
    });
    expect(credentialStyle.background).toBe('rgb(255, 255, 255)');
    expect(credentialStyle.radius).not.toBe('0px');
    await expect(page.getByText('Histórico de Vacinação')).toHaveCount(0);
    await expect(page.getByText('COVID-19 (Pfizer)')).toHaveCount(0);
  });

  test('redireciona para login se não há sessão', async ({ page }) => {
    await page.unroute('**/me');
    await page.route('**/me', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Autenticação necessária.' }),
      })
    );
    await page.reload({ waitUntil: 'commit' }).catch(() => undefined);
    await expect(page).toHaveURL('/', { timeout: 15000 });
  });
});
