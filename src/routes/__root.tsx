// @ts-nocheck
import { createRootRoute, Outlet } from "@tanstack/react-router";
import App from "../App";

export const Route = createRootRoute({
  component: () => <App />,
  notFoundComponent: () => <App />,
});

export const _Outlet = Outlet;
