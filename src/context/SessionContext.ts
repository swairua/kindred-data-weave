import { createContext, useContext } from "react";
import type { ApiUser } from "@/lib/api";

export type SessionContextValue = {
  user: ApiUser;
  logout: () => Promise<void>;
};

export const SessionContext = createContext<SessionContextValue | null>(null);

export const useSession = () => {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used within SessionGuard");
  return session;
};
