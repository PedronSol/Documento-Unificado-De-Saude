import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


function initialsFor(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}


export function UserAvatar({ name, src, className = "" }) {
  return (
    <Avatar
      role="img"
      aria-label={`Avatar de ${name}`}
      className={`dus-avatar ${className}`}
    >
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className="dus-avatar-fallback" aria-hidden="true">
        {initialsFor(name)}
      </AvatarFallback>
    </Avatar>
  );
}
