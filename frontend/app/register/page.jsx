import Link from "next/link";

import PatientRegistration from "@/components/auth/patient-registration";


export default function RegisterPage() {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  return (
    <main className="login-shell registration-shell">
      <section className="login-intro registration-intro" aria-labelledby="register-title">
        <div className="clinical-mark" aria-hidden="true">
          <span>D</span>
          <i />
        </div>
        <div className="login-intro-copy">
          <p className="eyebrow">Identidade do paciente</p>
          <h1 id="register-title">Seu cuidado começa por você.</h1>
          <p>
            Crie sua conta diretamente ou escolha o Google. Em qualquer opção,
            seu cadastro nasce somente como paciente.
          </p>
        </div>
        <div className="credential-lines" aria-hidden="true">
          <span>CADASTRO PESSOAL</span>
          <span>ROLE PROTEGIDA</span>
          <span>SIGILO CLÍNICO</span>
        </div>
      </section>

      <section className="login-access registration-access" aria-label="Cadastro de paciente">
        <div className="login-access-inner registration-access-inner">
          <div className="access-heading">
            <p className="eyebrow">Conta de paciente</p>
            <h2>Crie seu acesso</h2>
            <p>Escolha uma forma de cadastro. O Google é sempre opcional.</p>
          </div>
          <PatientRegistration googleClientId={googleClientId} />
          <p className="privacy-note">
            Já possui cadastro? <Link href="/">Voltar para entrar</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
