import { test, expect } from '@playwright/test';

const MOCK_PACIENTE_RESPONSE = {
  message: 'Login efetuado com sucesso!',
  user: {
    user_id: 1,
    display_name: 'Carlos Eduardo Silva',
    email: 'carlos.silva@email.com',
    roles: ['patient'],
  },
  patient_data: {
    nome_paciente: 'Carlos Silva',
    nome_completo: 'Carlos Eduardo Silva',
    avatar: null,
    status_saude: 'updated',
    tipo_sanguineo: 'A+',
    valor_qr: 'QR_Carlos',
    maior_de_idade: true,
    idade: 41,
  },
  vaccines: [
    {
      id_vacina: 1,
      nome_vacina: 'COVID-19 (Pfizer)',
      dose: '3ª Dose - Reforço',
      data_aplicacao: '2024-02-10',
      status_vacina: 'applied',
    },
  ],
  alerts: [
    {
      id_alerta: 1,
      tipo_alerta: 'condition',
      titulo_alerta: 'Hipertensão',
      descricao_alerta: 'Controlada.',
      severidade_alerta: 'high',
    },
  ],
  documents: [],
};


async function waitForHydration(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const el = document.querySelector('button, input');
    return !!el && Object.getOwnPropertyNames(el).some(k => k.startsWith('__reactFiber'));
  });
}

test.describe('Página de Login', () => {
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
        body: JSON.stringify(MOCK_PACIENTE_RESPONSE),
      })
    );
    await page.route('**/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PACIENTE_RESPONSE),
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
        body: JSON.stringify(MOCK_PACIENTE_RESPONSE),
      })
    );
    await page.goto('/home');
    await waitForHydration(page);
  });

  test('exibe o nome do paciente logado', async ({ page }) => {
    await expect(page.getByText('Carlos Silva')).toBeVisible({ timeout: 10000 });
  });

  test('exibe vacinas do paciente', async ({ page }) => {
    await expect(page.getByText('COVID-19 (Pfizer)')).toBeVisible({ timeout: 10000 });
  });

  test('exibe estado institucional para doctor sem dados clínicos', async ({ page }) => {
    await page.unroute('**/me');
    await page.route('**/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Sessão válida.',
          user: {
            user_id: 7,
            display_name: 'Dr. Rui Lima',
            email: 'rui@example.com',
            roles: ['doctor'],
          },
          patient_data: null,
          vaccines: [],
          alerts: [],
          documents: [],
        }),
      })
    );
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Área profissional' })).toBeVisible();
    await expect(page.getByText('Dr. Rui Lima')).toBeVisible();
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
