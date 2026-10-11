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

const MOCK_MARKERS = [
  {
    marker_id: 21,
    type: 'medication',
    name: 'Losartana',
    description: 'Uso contínuo',
    dosage: '50 mg',
    frequency: '1 vez ao dia',
    status: 'active',
    created_at: '2026-10-06T18:30:00.123456',
    updated_at: '2026-10-06T18:30:00.123456',
    removed_at: null,
  },
];


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
    let nextMarkerId = 22;
    let activeMarkers = MOCK_MARKERS.map((marker) => ({ ...marker }));
    let removedMarkers = [];
    let activeShare = null;

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
    await page.route(/\/me\/care-(invitations|groups|requests|doctors)$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    );
    await page.route('**/medical/patient-links**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    );
    await page.route('**/me/markers**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const markerId = Number(url.pathname.split('/').at(-1));

      if (request.method() === 'GET') {
        const body = url.searchParams.get('status') === 'removed'
          ? removedMarkers
          : activeMarkers;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      }

      if (request.method() === 'POST') {
        const payload = request.postDataJSON();
        const created = {
          marker_id: nextMarkerId++,
          ...payload,
          status: 'active',
          created_at: '2026-10-06T18:30:00.123456',
          updated_at: '2026-10-06T18:30:00.123456',
          removed_at: null,
        };
        activeMarkers = [...activeMarkers, created];
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created),
        });
      }

      if (request.method() === 'PUT') {
        const payload = request.postDataJSON();
        const current = activeMarkers.find((marker) => marker.marker_id === markerId);
        const updated = {
          ...current,
          ...payload,
          updated_at: '2026-10-06T18:35:00.123456',
        };
        activeMarkers = activeMarkers.map((marker) =>
          marker.marker_id === markerId ? updated : marker
        );
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(updated),
        });
      }

      if (request.method() === 'DELETE') {
        const current = activeMarkers.find((marker) => marker.marker_id === markerId);
        activeMarkers = activeMarkers.filter((marker) => marker.marker_id !== markerId);
        removedMarkers = [
          {
            ...current,
            status: 'removed',
            updated_at: '2026-10-06T18:40:00.123456',
            removed_at: '2026-10-06T18:40:00.123456',
          },
          ...removedMarkers,
        ];
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Marcador removido com sucesso!' }),
        });
      }

      return route.abort();
    });
    await page.route('**/me/shares**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() === 'GET' && url.pathname === '/me/shares/active') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(activeShare),
        });
      }

      if (request.method() === 'POST' && url.pathname === '/me/shares') {
        activeShare = {
          share_id: 42,
          share_url: `http://localhost:3000/share#${'v'.repeat(43)}`,
          created_at: '2099-10-09T12:00:00',
          expires_at: '2099-10-09T14:00:00',
        };
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(activeShare),
        });
      }

      if (request.method() === 'DELETE' && url.pathname === '/me/shares/42') {
        activeShare = null;
        return route.fulfill({ status: 204 });
      }

      return route.abort();
    });
    await page.goto('/home');
    await waitForHydration(page);
  });

  test('exibe o nome do paciente logado', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Carlos Silva' })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('navigation', { name: 'Contexto de acesso' })).toHaveCount(0);
    await expect(page.locator('.authenticated-shell')).not.toHaveClass(/has-context-dock/);
  });

  test('gera QR temporário e revoga o acesso em 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });

    await page.getByRole('button', { name: 'Gerar acesso temporário' }).click();

    await expect(page.getByLabel('QR-Code do compartilhamento')).toBeVisible();
    await expect(page.getByText(/Tempo restante/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copiar link' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

    await page.getByRole('button', { name: 'Revogar acesso' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Revogar acesso temporário' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manter acesso' })).toBeFocused();
    await page.getByRole('button', { name: 'Confirmar revogação' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Gerar acesso temporário' })).toBeVisible();
  });

  test('abre resumo público sem login, remove o fragmento e adapta o grid', async ({ page }) => {
    const token = 'v'.repeat(43);
    await page.route('**/public/shares/summary', async (route) => {
      expect(await route.request().headerValue('x-share-token')).toBe(token);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          expires_at: '2099-10-09T14:00:00',
          patient: { preferred_name: 'Carlos', blood_type: 'A+' },
          markers: {
            allergies: [{ name: 'Dipirona', description: 'Reação cutânea' }],
            medications: [{
              name: 'Losartana',
              description: 'Uso contínuo',
              dosage: '50 mg',
              frequency: '1 vez ao dia',
            }],
            conditions: [],
            diagnoses: [{ name: 'Hipertensão', description: null }],
          },
        }),
      });
    });

    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`/share#${token}`);

    await expect(page.getByRole('heading', { name: 'Resumo de Carlos' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const mobileCards = await page.locator('.public-share-card').all();
    const firstMobile = await mobileCards[0].boundingBox();
    const secondMobile = await mobileCards[1].boundingBox();
    expect(secondMobile?.y).toBeGreaterThan(firstMobile?.y ?? 0);

    await page.setViewportSize({ width: 1440, height: 900 });
    const firstDesktop = await mobileCards[0].boundingBox();
    const secondDesktop = await mobileCards[1].boundingBox();
    expect(firstDesktop?.y).toBeCloseTo(secondDesktop?.y ?? 0, 0);
  });

  test('move o seletor de contexto para um dock em mobile e mantém o header no desktop', async ({ page }) => {
    await page.unroute('**/me');
    await page.route('**/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            ...MOCK_USER,
            roles: ['patient', 'doctor'],
          },
          patient_profile: MOCK_PROFILE_RESPONSE.patient_profile,
        }),
      })
    );
    await page.route('**/medical/patients', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    );

    await page.setViewportSize({ width: 320, height: 720 });
    await page.reload();
    const contextNav = page.getByRole('navigation', { name: 'Contexto de acesso' });
    const mobileStyle = await contextNav.evaluate((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        position: style.position,
        bottom: bounds.bottom,
        viewportHeight: window.innerHeight,
        shellPadding: getComputedStyle(document.querySelector('.authenticated-shell')).paddingBottom,
      };
    });

    expect(mobileStyle.position).toBe('fixed');
    expect(mobileStyle.bottom).toBeGreaterThan(mobileStyle.viewportHeight - 100);
    expect(parseFloat(mobileStyle.shellPadding)).toBeGreaterThan(0);
    expect(await contextNav.evaluate((element) => element.closest('.identity-bar'))).toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await expect(contextNav.getByRole('button', { name: 'Minha saúde' })).toBeVisible();
    await contextNav.getByRole('button', { name: 'Área profissional' }).click();
    await expect(page.getByRole('heading', { name: 'Pacientes em acompanhamento' })).toBeVisible();
    await expect(contextNav.getByRole('button', { name: 'Área profissional' })).toHaveAttribute('aria-pressed', 'true');
    await contextNav.getByRole('button', { name: 'Minha saúde' }).focus();
    await page.keyboard.press('Enter');
    await expect(contextNav.getByRole('button', { name: 'Minha saúde' })).toHaveAttribute('aria-pressed', 'true');

    await page.setViewportSize({ width: 475, height: 900 });
    await expect.poll(() => contextNav.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    await expect.poll(() => contextNav.evaluate((element) => window.innerHeight - element.getBoundingClientRect().bottom)).toBeLessThan(100);

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect.poll(() => contextNav.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    await expect.poll(() => contextNav.evaluate((element) => window.innerHeight - element.getBoundingClientRect().bottom)).toBeLessThan(100);
    await expect.poll(() => page.locator('.authenticated-shell').evaluate((element) => getComputedStyle(element).paddingBottom)).not.toBe('0px');

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(() => contextNav.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    await expect.poll(() => contextNav.evaluate((element) => window.innerHeight - element.getBoundingClientRect().bottom)).toBeLessThan(100);

    await page.setViewportSize({ width: 1199, height: 800 });
    await expect.poll(() => contextNav.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    await expect.poll(() => contextNav.evaluate((element) => window.innerHeight - element.getBoundingClientRect().bottom)).toBeLessThan(100);

    await page.setViewportSize({ width: 1200, height: 900 });
    await expect.poll(() => contextNav.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    await expect.poll(() => contextNav.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(24);
    await expect.poll(() => contextNav.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(72);
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

  test('usa diálogo responsivo para registrar vacina', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const trigger = page.getByRole('button', { name: 'Adicionar vacina' });

    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Registrar vacina' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Nome da vacina')).toBeFocused();

    const bounds = await dialog.boundingBox();
    const style = await dialog.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        background: computed.backgroundColor,
        radius: computed.borderRadius,
      };
    });
    expect(bounds?.x).toBe(0);
    expect(bounds?.width).toBeLessThanOrEqual(390);
    expect(style.background).toBe('rgb(255, 255, 255)');
    expect(style.radius).not.toBe('0px');
    await page.getByLabel('Nome da vacina').fill('Influenza tetravalente');
    await page.getByLabel('Dose').fill('Dose anual');
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Pendente' }).click();
    await expect(page.getByLabel('Data de aplicação')).toBeDisabled();
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Aplicada' }).click();
    await expect(page.getByLabel('Data de aplicação')).toBeEnabled();
    await page.getByLabel('Data de aplicação').fill('2026-04-15');
    await page.getByRole('button', { name: 'Registrar vacina' }).click();

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('gerencia marcador em diálogos acessíveis e preserva o histórico', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const addTrigger = page.getByRole('button', { name: 'Adicionar marcador' });
    const activeTab = page.locator('.marker-view-switch button[aria-pressed="true"]');
    const activeTabStyles = await activeTab.evaluate((element) => ({
      color: getComputedStyle(element).color,
      badgeBackground: getComputedStyle(element.querySelector('span')).backgroundColor,
    }));
    expect(activeTabStyles.color).toBe('rgb(23, 79, 194)');
    expect(activeTabStyles.badgeBackground).toBe('rgb(239, 244, 255)');

    await addTrigger.click();

    const formDialog = page.getByRole('dialog', { name: 'Adicionar marcador' });
    await expect(formDialog).toBeVisible();
    await expect(page.getByLabel('Nome do marcador')).toBeFocused();
    const formBounds = await formDialog.boundingBox();
    expect(formBounds?.x).toBe(0);
    expect(formBounds?.width).toBeLessThanOrEqual(390);

    await page.getByLabel('Nome do marcador').fill('Metformina');
    await page.getByLabel('Tipo').click();
    await page.getByRole('option', { name: 'Medicação' }).click();
    await page.getByLabel('Dosagem').fill('500 mg');
    await page.getByLabel('Frequência').fill('2 vezes ao dia');
    await page.getByRole('button', { name: 'Adicionar marcador' }).click();

    await expect(formDialog).toBeHidden();
    await expect(addTrigger).toBeFocused();
    await expect(page.getByText('Metformina')).toBeVisible();

    await page.getByRole('button', { name: 'Editar Metformina' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Editar marcador' });
    await expect(editDialog).toBeVisible();
    await page.getByLabel('Nome do marcador').fill('Metformina XR');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(editDialog).toBeHidden();
    await expect(page.getByText('Metformina XR')).toBeVisible();

    const removeTrigger = page.getByRole('button', { name: 'Remover Metformina XR' });
    await removeTrigger.click();
    const confirmation = page.getByRole('alertdialog', { name: 'Remover marcador' });
    await expect(confirmation).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar remoção' })).toBeFocused();
    await page.getByRole('button', { name: 'Cancelar remoção' }).click();
    await expect(confirmation).toBeHidden();
    await expect(removeTrigger).toBeFocused();

    await removeTrigger.click();
    await page.getByRole('button', { name: 'Remover do resumo' }).click();
    await expect(page.getByText('Metformina XR')).toBeHidden();
    await page.getByRole('button', { name: 'Remover Losartana' }).click();
    await page.getByRole('button', { name: 'Remover do resumo' }).click();
    await expect(page.getByText('Losartana')).toBeHidden();

    const emptyState = page.locator('.marker-empty');
    const emptyStateStyles = await emptyState.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      border: getComputedStyle(element).borderTopColor,
      icon: getComputedStyle(element.querySelector('span')).color,
    }));
    expect(emptyStateStyles.background).toBe('rgb(247, 248, 250)');
    expect(emptyStateStyles.border).toBe('rgb(203, 214, 229)');
    expect(emptyStateStyles.icon).toBe('rgb(23, 79, 194)');

    await page.getByRole('button', { name: 'Histórico' }).click();
    await expect(page.getByText('Metformina XR')).toBeVisible();
    await expect(page.getByText('Removido em 06/10/2026').first()).toBeVisible();
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
    const contentWidth = await page.evaluate(() => {
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue('--ds-layout-content');
      return Number.parseFloat(token) * Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
    });
    expect(dashboard?.width).toBeCloseTo(contentWidth, 0);
    expect(dashboard?.x).toBeCloseTo((1920 - contentWidth) / 2, 0);

    const vaccineCards = await page.locator('.vaccine-entry').all();
    const cardBounds = await Promise.all(vaccineCards.map((card) => card.boundingBox()));
    expect(cardBounds).toHaveLength(3);
    expect(cardBounds[0]?.y).toBeCloseTo(cardBounds[1]?.y ?? 0, 0);
    expect(cardBounds[2]?.y).toBeGreaterThan(cardBounds[1]?.y ?? 0);
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

  test('oferece busca, prontuário e suspensão na área médica responsiva', async ({ page }) => {
    const medicalPatient = {
      patient_id: 10,
      preferred_name: 'Carlos Silva',
      full_name: 'Carlos Eduardo Silva',
      avatar_url: null,
      health_status: 'updated',
      age: 41,
    };
    let medicalActiveMarkers = MOCK_MARKERS.map((marker) => ({ ...marker }));
    let medicalRemovedMarkers = [];
    let denyMedicalRecord = false;

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
    await page.route('**/medical/patients**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (url.pathname === '/medical/patients') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([medicalPatient]),
        });
      }

      if (url.pathname === '/medical/patients/10') {
        if (denyMedicalRecord) {
          return route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Paciente não autorizado.' }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            patient: { ...medicalPatient, blood_type: 'A+' },
            vaccines: MOCK_VACCINES,
            markers: {
              active: medicalActiveMarkers,
              removed: medicalRemovedMarkers,
            },
          }),
        });
      }

      if (
        url.pathname === '/medical/patients/10/markers' &&
        request.method() === 'POST'
      ) {
        const created = {
          marker_id: 22,
          ...request.postDataJSON(),
          status: 'active',
          created_at: '2026-10-08T17:50:00',
          updated_at: '2026-10-08T17:50:00',
          removed_at: null,
        };
        medicalActiveMarkers = [...medicalActiveMarkers, created];
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created),
        });
      }

      if (
        url.pathname === '/medical/patients/10/markers/21' &&
        request.method() === 'DELETE'
      ) {
        const removed = medicalActiveMarkers.find((item) => item.marker_id === 21);
        medicalActiveMarkers = medicalActiveMarkers.filter(
          (item) => item.marker_id !== 21,
        );
        medicalRemovedMarkers = [
          {
            ...removed,
            status: 'removed',
            removed_at: '2026-10-08T18:00:00',
          },
        ];
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Marcador removido com sucesso!' }),
        });
      }

      return route.abort();
    });
    await page.setViewportSize({ width: 320, height: 720 });
    await page.reload();

    await expect(
      page.getByRole('heading', { name: 'Pacientes em acompanhamento' }),
    ).toBeVisible();
    await expect(page.getByText('Carlos Eduardo Silva')).toBeVisible();
    await expect(page.locator('.doctor-main')).not.toContainText(/CPF:\s*\d/i);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);

    const searchRequest = page.waitForRequest((request) =>
      request.url().includes('/medical/patients?query=Carlos')
    );
    await page.getByLabel('Buscar paciente').fill('Carlos');
    await searchRequest;

    await page.getByRole('button', {
      name: 'Abrir prontuário de Carlos Silva',
    }).click();
    await expect(
      page.getByRole('heading', { name: 'Carlos Eduardo Silva' }),
    ).toBeVisible();
    await expect(page.getByText('COVID-19 (Pfizer)')).toBeVisible();
    await expect(page.getByText('Losartana')).toBeVisible();

    await page.getByRole('button', { name: 'Adicionar marcador' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/dus-dialog-320.png' });
    await page.getByLabel('Nome do marcador').fill('Insuficiência renal leve');
    await page.getByLabel('Tipo').click();
    await page.getByRole('option', { name: 'Diagnóstico' }).click();
    await page.getByRole('button', { name: 'Adicionar marcador' }).click();
    await expect(page.getByText('Insuficiência renal leve')).toBeVisible();

    const suspendTrigger = page.getByRole('button', { name: 'Suspender Losartana' });
    await suspendTrigger.click();
    const confirmation = page.getByRole('alertdialog', {
      name: 'Suspender medicação',
    });
    await expect(confirmation).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Cancelar suspensão' }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Suspender medicação' }).click();
    await expect(confirmation).toBeHidden();

    await page.getByRole('button', { name: 'Histórico' }).click();
    await expect(page.getByText('Losartana')).toBeVisible();
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(320);

    await page.getByRole('button', { name: 'Voltar para pacientes' }).click();
    denyMedicalRecord = true;
    await page.getByRole('button', {
      name: 'Abrir prontuário de Carlos Silva',
    }).click();
    await expect(page.getByText('Acesso ao prontuário negado.')).toBeVisible();
    await expect(page.getByText('Losartana')).toHaveCount(0);
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
