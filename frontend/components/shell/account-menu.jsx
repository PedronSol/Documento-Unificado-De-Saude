"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import LogOut from "lucide-react/dist/esm/icons/log-out";
import Settings from "lucide-react/dist/esm/icons/settings";

import { UserAvatar } from "@/components/identity/user-avatar";


export function AccountMenu({ name, avatarName, email, src, onLogout }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="account-menu-trigger"
          type="button"
          aria-label={`Conta de ${avatarName}`}
        >
          <UserAvatar name={avatarName} src={src} className="identity-avatar" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="account-menu-content"
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          <div className="account-menu-identity">
            <strong>{name}</strong>
            <span>{email}</span>
          </div>
          <DropdownMenu.Separator className="account-menu-separator" />
          <DropdownMenu.Item className="account-menu-item" asChild>
            <a href="/settings">
              <Settings aria-hidden="true" size={17} />
              Configurações
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="account-menu-separator" />
          <DropdownMenu.Item
            className="account-menu-item account-menu-logout"
            onSelect={onLogout}
          >
            <LogOut aria-hidden="true" size={17} />
            Sair da conta
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
