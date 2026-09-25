import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SessionGuard } from "@/components/SessionGuard";
import { useSession } from "@/context/SessionContext";

const authMocks = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
  logoutUser: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchCurrentUser: authMocks.fetchCurrentUser,
  logoutUser: authMocks.logoutUser,
}));

const user = { id: 1, name: "Test User", email: "test@example.com" };

const ProtectedScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();

  return (
    <main>
      <p>{location.pathname} · {session.user.name}</p>
      <button onClick={() => navigate("/record?material=soil")}>Open Record</button>
      <button onClick={() => void session.logout()}>Sign out</button>
    </main>
  );
};

const LoginScreen = () => {
  const [searchParams] = useSearchParams();
  return <p>Login destination: {searchParams.get("next")}</p>;
};

const renderRoutes = (initialPath = "/projects") => render(
  <MemoryRouter initialEntries={[initialPath]}>
    <Routes>
      <Route element={<SessionGuard />}>
        <Route path="/projects" element={<ProtectedScreen />} />
        <Route path="/record" element={<ProtectedScreen />} />
      </Route>
      <Route path="/login" element={<LoginScreen />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  authMocks.fetchCurrentUser.mockReset();
  authMocks.logoutUser.mockReset().mockResolvedValue({ message: "Logged out" });
});

afterEach(cleanup);

describe("SessionGuard", () => {
  it("keeps the verified session while navigating from Projects to Record", async () => {
    authMocks.fetchCurrentUser.mockResolvedValue(user);
    renderRoutes();

    expect(await screen.findByText("/projects · Test User")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Record" }));

    expect(await screen.findByText("/record · Test User")).toBeInTheDocument();
    expect(authMocks.fetchCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("redirects only confirmed unauthenticated sessions and preserves the destination", async () => {
    authMocks.fetchCurrentUser.mockResolvedValue(null);
    renderRoutes("/record?material=soil");

    expect(await screen.findByText("Login destination: /record?material=soil")).toBeInTheDocument();
  });

  it("shows retry after an indeterminate session check without redirecting", async () => {
    authMocks.fetchCurrentUser.mockRejectedValueOnce(new Error("API unavailable"))
      .mockResolvedValueOnce(user);
    renderRoutes();

    expect(await screen.findByText("We couldn’t verify your session. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByText(/Login destination/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("/projects · Test User")).toBeInTheDocument();
    expect(authMocks.fetchCurrentUser).toHaveBeenCalledTimes(2);
  });

  it("calls the logout API and navigates to login", async () => {
    authMocks.fetchCurrentUser.mockResolvedValue(user);
    renderRoutes();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(authMocks.logoutUser).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/^Login destination:/)).toBeInTheDocument();
  });
});
