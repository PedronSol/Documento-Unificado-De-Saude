import ProfessionalInvitation from "@/components/auth/professional-invitation";


export const metadata = {
  title: "Convite profissional · DUS",
  referrer: "no-referrer",
};


export default function ProfessionalInvitationPage() {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  return (
    <main className="login-shell registration-shell">
      <section className="login-intro registration-intro" aria-labelledby="invitation-title">
        <div className="clinical-mark" aria-hidden="true">
          <span>D</span>
          <i />
        </div>
        <div className="login-intro-copy">
          <p className="eyebrow">Identidade profissional</p>
          <h1 id="invitation-title">Seu acesso médico foi preparado.</h1>
          <p>
            Confirme sua identidade com a conta Google do e-mail informado ao
            administrador. O acesso a prontuários começa somente após a
            verificação do seu CRM.
          </p>
        </div>
        <div className="credential-lines" aria-hidden="true">
          <span>CONVITE DE USO ÚNICO</span>
          <span>CRM VERIFICADO</span>
          <span>SIGILO CLÍNICO</span>
        </div>
      </section>

      <section className="login-access registration-access" aria-label="Convite profissional">
        <div className="login-access-inner registration-access-inner">
          <div className="access-heading">
            <p className="eyebrow">Convite profissional</p>
            <h2>Concluir cadastro médico</h2>
            <p>Você não precisa criar senha: o Google confirma sua identidade.</p>
          </div>
          <ProfessionalInvitation googleClientId={googleClientId} />
        </div>
      </section>
    </main>
  );
}
