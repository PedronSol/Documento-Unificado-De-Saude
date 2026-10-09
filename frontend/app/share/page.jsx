import { PublicHealthShare } from "@/components/sharing/public-health-share";


export const metadata = {
  title: "Resumo temporário | DUS",
  description: "Resumo clínico temporário compartilhado pelo paciente.",
  robots: { index: false, follow: false },
};

export default function SharePage() {
  return <PublicHealthShare />;
}
