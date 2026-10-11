import PatientClaim from "@/components/auth/patient-claim";


export const metadata = {
  title: "Assumir conta · DUS",
  referrer: "no-referrer",
};


export default function PatientClaimPage() {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  return (
    <main className="login-shell registration-shell">
      <section className="login-intro registration-intro" aria-labelledby="claim-title">
        <div className="clinical-mark" aria-hidden="true">
          <span>D</span>
          <i />
        </div>
        <div className="login-intro-copy">
          <p className="eyebrow">Identidade do paciente</p>
          <h1 id="claim-title">Seu prontuário já começou.</h1>
          <p>
            Seu médico registrou as primeiras informações. Confirme seus dados
            para assumir a conta e decidir quem acessa seu prontuário.
          </p>
        </div>
        <div className="credential-lines" aria-hidden="true">
          <span>LINK DE USO ÚNICO</span>
          <span>CPF E NASCIMENTO</span>
          <span>SIGILO CLÍNICO</span>
        </div>
      </section>

      <section className="login-access registration-access" aria-label="Assumir conta">
        <div className="login-access-inner registration-access-inner">
          <div className="access-heading">
            <p className="eyebrow">Conta de paciente</p>
            <h2>Assumir minha conta</h2>
            <p>Confirme CPF e data de nascimento e escolha como vai entrar.</p>
          </div>
          <PatientClaim googleClientId={googleClientId} />
        </div>
      </section>
    </main>
  );
}
