/**
 * The signed-in (non-anonymous) account that new rows belong to. Sheet 14: user_id stays null
 * until the user signs in. Set by src/services/auth.ts; read by repos when they write rows.
 */
let ownerId: string | null = null;

export function getRowOwner(): string | null {
  return ownerId;
}

export function setRowOwner(id: string | null): void {
  ownerId = id;
}
