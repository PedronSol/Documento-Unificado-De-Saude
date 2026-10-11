import Link from "next/link";

import LoginForm from "@/components/auth/login-form";


export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-intro" aria-labelledby="login-title">
        <div className="clinical-mark" aria-hidden="true">
          <span>D</span>
          <i />
        </div>
        <div className="login-intro-copy">
          <p className="eyebrow">Documento Unificado de Saúde</p>
          <h1 id="login-title">Sua história de saúde, com você.</h1>
          <p>
            Um acesso único para acompanhar sua saúde e entrar nos contextos
            profissionais autorizados para a sua identidade.
          </p>
        </div>
        <div className="credential-lines" aria-hidden="true">
          <span>IDENTIDADE CLÍNICA</span>
          <span>ACESSO PROTEGIDO</span>
          <span>BRASIL · DUS</span>
        </div>
      </section>

      <section className="login-access" aria-label="Acesso ao documento de saúde">
        <div className="login-access-inner">
          <div className="access-heading">
            <p className="eyebrow">Portal seguro</p>
            <h2>Entre na sua conta</h2>
            <p>Use as credenciais vinculadas à sua identidade.</p>
          </div>
          <LoginForm />
          <div className="new-patient-entry">
            <span>Primeiro acesso?</span>
            <Link href="/register">Criar conta de paciente</Link>
          </div>
          <p className="privacy-note">
            A sessão é protegida e expira automaticamente.
          </p>
        </div>
      </section>
    </main>
  );
}
