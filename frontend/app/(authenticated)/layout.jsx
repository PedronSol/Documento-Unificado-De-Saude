import { AuthenticatedShell } from "@/components/shell/authenticated-shell";


export default function AuthenticatedLayout({ children }) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
