import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui";

/** Botão "Sair" — form + server action de logout. */
export function LogoutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="ghost" size="sm">
        Sair
      </Button>
    </form>
  );
}
