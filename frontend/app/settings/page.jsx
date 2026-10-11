import { SettingsPage } from "@/components/identity/settings-page";


export default function SettingsRoute() {
  return (
    <SettingsPage
      googleClientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}
    />
  );
}
