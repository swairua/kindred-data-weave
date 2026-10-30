import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Reception from "@/pages/Reception";
import LogConsignment from "@/pages/LogConsignment";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { ReceptionConsignmentInput } from "@/lib/reception";

const receptionMocks = vi.hoisted(() => ({
  listReceptionConsignments: vi.fn(),
  saveReceptionConsignment: vi.fn(),
  listReceptionFieldDefinitions: vi.fn().mockResolvedValue([]),
  listReceptionPhotos: vi.fn().mockResolvedValue([]),
  uploadReceptionPhoto: vi.fn().mockResolvedValue(null),
  deleteReceptionPhoto: vi.fn().mockResolvedValue(true),
  generateReceptionAckPDF: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  listReceptionConsignments: receptionMocks.listReceptionConsignments,
  saveReceptionConsignment: receptionMocks.saveReceptionConsignment,
  listReceptionFieldDefinitions: receptionMocks.listReceptionFieldDefinitions,
  listReceptionPhotos: receptionMocks.listReceptionPhotos,
  uploadReceptionPhoto: receptionMocks.uploadReceptionPhoto,
  deleteReceptionPhoto: receptionMocks.deleteReceptionPhoto,
}));

vi.mock("@/lib/receptionAckPdfGenerator", () => ({
  generateReceptionAckPDF: receptionMocks.generateReceptionAckPDF,
}));

vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({
    user: { id: 1, name: "Eng. Anthony Murage", email: "a@example.com" },
    logout: vi.fn(),
  }),
}));

vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

/** The RC-26-0418 consignment from the reference mockup, as the API returns it. */
const mockConsignment = (): ReceptionConsignmentInput => ({
  rcNo: "RC-26-0418",
  jobNo: "26-0418",
  client: "Kenya Railways",
  project: "KUMIP Line 1",
  clientRef: "KR-SSF-0093",
  deliveredBy: "Joel Wairua",
  vehicleReg: "KDx 000X",
  receivedAt: "2026-10-19T09:58",
  methodSet: "BS 1377-2:2022",
  receivedBy: "Eng. Anthony Murage",
  storagePlan: "Auto by type",
  status: "on-hold",
  samples: [
    {
      labId: "26-0418/01",
      clientMark: "BH07-D1",
      location: "BH07",
      depthLabel: "0.50-1.00",
      sampleType: "Disturbed bulk",
      container: "Heavy-duty bag",
      massKg: "18.4",
      condition: "Intact",
      tests: ["MC", "PSD", "ATT", "CMP", "CBR"],
    },
    {
      labId: "26-0418/04",
      clientMark: "BH07-U2",
      location: "BH07",
      depthLabel: "4.50-4.95",
      sampleType: "Undisturbed U100",
      container: "U100 tube, waxed & capped",
      massKg: "",
      condition: "Seal broken",
      tests: ["UU"],
    },
  ],
});

/** Mirrors the current location so navigation can be asserted. */
const LocationProbe = () => {
  const location = useLocation();
  return (
    <div data-testid="current-location">
      {location.pathname}
      {location.search}
    </div>
  );
};

const renderReception = () =>
  render(
    <SidebarProvider>
      <MemoryRouter initialEntries={["/reception"]}>
        <Reception />
        <LocationProbe />
      </MemoryRouter>
    </SidebarProvider>,
  );

const renderLogConsignment = (entry = "/reception/new") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/reception/:rcNo" element={<LogConsignment />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );

afterEach(cleanup);

beforeEach(() => {
  receptionMocks.listReceptionConsignments.mockReset().mockResolvedValue([mockConsignment()]);
  receptionMocks.saveReceptionConsignment.mockReset().mockResolvedValue(undefined);
  receptionMocks.generateReceptionAckPDF.mockReset().mockResolvedValue(undefined);
});

describe("Reception dashboard", () => {
  it("lists the consignment with its client, samples and status", async () => {
    renderReception();

    expect(await screen.findByText("RC-26-0418")).toBeInTheDocument();
    expect(screen.getByText("Kenya Railways")).toBeInTheDocument();
    // The status pill for the RC-26-0418 row says "On hold"
    expect(screen.getAllByText("On hold").length).toBeGreaterThan(0);
  });

  it("shows the held sample in the on-hold rail", async () => {
    renderReception();

    expect((await screen.findAllByText(/26-0418\/04/)).length).toBeGreaterThan(0);
  });

  it("filters the table down to consignments that are to log", async () => {
    receptionMocks.listReceptionConsignments.mockResolvedValue([
      mockConsignment(),
      { ...mockConsignment(), rcNo: "RC-26-0416", status: "draft", samples: [] },
    ]);
    renderReception();

    await screen.findByText("RC-26-0418");
    expect(screen.queryByText("RC-26-0416")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /To log/ }));

    expect(await screen.findByText("RC-26-0416")).toBeInTheDocument();
    expect(screen.queryByText("RC-26-0418")).not.toBeInTheDocument();
  });
  it("narrows the list when searching by Lab ID", async () => {
    receptionMocks.listReceptionConsignments.mockResolvedValue([
      mockConsignment(),
      { ...mockConsignment(), rcNo: "RC-26-0416", jobNo: "26-0416", samples: [] },
    ]);
    renderReception();

    await screen.findByText("RC-26-0418");
    fireEvent.change(screen.getByPlaceholderText(/Scan label/), { target: { value: "26-0418/04" } });

    expect(await screen.findByText("RC-26-0418")).toBeInTheDocument();
    expect(screen.queryByText("RC-26-0416")).not.toBeInTheDocument();
  });
});
describe("Log consignment wizard", () => {
  it("seeds a new draft with the next consignment number and a first sample", async () => {
    renderLogConsignment();

    expect(await screen.findByText(/RC-26-0419/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("JOB/01")).toBeInTheDocument();
  });

  it("prefills the receiver with the signed-in technician", async () => {
    renderLogConsignment();

    expect(await screen.findByDisplayValue("Eng. Anthony Murage")).toBeInTheDocument();
  });

  it("holds a sample when its condition is a broken seal", async () => {
    renderLogConsignment();

    await screen.findByText(/RC-26-0419/);
    fireEvent.click(screen.getByRole("button", { name: "Seal broken" }));

    expect(await screen.findByText(/Seal broken: moisture may have changed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Receive · 1 on hold · print/ })).toBeInTheDocument();
  });

  it("refuses to receive a consignment that is missing its client", async () => {
    renderLogConsignment();

    await screen.findByText(/RC-26-0419/);
    fireEvent.click(screen.getByRole("button", { name: /Receive ·/ }));

    expect(await screen.findByText("Client is required.")).toBeInTheDocument();
    expect(receptionMocks.saveReceptionConsignment).not.toHaveBeenCalled();
  });

  it("saves the consignment and prints the acknowledgement on receive", async () => {
    renderLogConsignment();

    await screen.findByText(/RC-26-0419/);
    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Kenya Railways" } });
    fireEvent.change(screen.getByLabelText("Job / project"), { target: { value: "26-0419" } });
    fireEvent.change(screen.getByLabelText("Delivered by"), { target: { value: "Joel Wairua" } });
    fireEvent.change(screen.getByPlaceholderText("BH07-D1"), { target: { value: "BH07-D1" } });
    // Matrix button aria-label: "MC for JOB/01" (first sample's Lab ID on a new draft)
    fireEvent.click(screen.getByRole("button", { name: /MC for JOB\/01/ }));

    fireEvent.click(screen.getByRole("button", { name: /Receive ·/ }));

    await waitFor(() => expect(receptionMocks.saveReceptionConsignment).toHaveBeenCalled());
    const saved = receptionMocks.saveReceptionConsignment.mock
      .calls[0][0] as ReceptionConsignmentInput;
    expect(saved.client).toBe("Kenya Railways");
    expect(saved.status).toBe("logged");
    expect(saved.receivedBy).toBe("Eng. Anthony Murage");
    await waitFor(() => expect(receptionMocks.generateReceptionAckPDF).toHaveBeenCalled());
  });

  it("marks the consignment on hold when a sample is held at receive time", async () => {
    renderLogConsignment();

    await screen.findByText(/RC-26-0419/);
    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Kenya Railways" } });
    fireEvent.change(screen.getByLabelText("Job / project"), { target: { value: "26-0419" } });
    fireEvent.change(screen.getByLabelText("Delivered by"), { target: { value: "Joel Wairua" } });
    fireEvent.change(screen.getByPlaceholderText("BH07-D1"), { target: { value: "BH07-D1" } });
    fireEvent.click(screen.getByRole("button", { name: /UU for JOB\/01/ }));
    fireEvent.click(screen.getByRole("button", { name: "Seal broken" }));

    fireEvent.click(screen.getByRole("button", { name: /Receive ·/ }));

    await waitFor(() => expect(receptionMocks.saveReceptionConsignment).toHaveBeenCalled());
    const saved = receptionMocks.saveReceptionConsignment.mock
      .calls[0][0] as ReceptionConsignmentInput;
    expect(saved.status).toBe("on-hold");
  });

  it("saves custom inputs from each reception area and keeps photo upload available", async () => {
    renderLogConsignment();

    await screen.findByText(/RC-26-0419/);
    expect(screen.getByRole("button", { name: "Add consignment photos" })).toBeInTheDocument();

    const customAreas = ["consignment", "transport", "sample", "test request"];
    customAreas.forEach((area) => {
      fireEvent.click(screen.getByRole("button", { name: `Add ${area} custom input` }));
      fireEvent.change(screen.getByLabelText(`${area[0].toUpperCase()}${area.slice(1)} custom field name`), {
        target: { value: `${area.replace(/ /g, "_")}_note` },
      });
      fireEvent.change(screen.getByLabelText(`${area[0].toUpperCase()}${area.slice(1)} custom field value`), {
        target: { value: `${area} value` },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(receptionMocks.saveReceptionConsignment).toHaveBeenCalled());

    const saved = receptionMocks.saveReceptionConsignment.mock
      .calls[0][0] as ReceptionConsignmentInput;
    expect(saved.customFields).toEqual([{ key: "consignment_note", value: "consignment value" }]);
    expect(saved.transportCustomFields).toEqual([{ key: "transport_note", value: "transport value" }]);
    expect(saved.samples[0].customFields).toEqual([{ key: "sample_note", value: "sample value" }]);
    expect(saved.testCustomFields).toEqual([{ key: "test_request_note", value: "test request value" }]);
  });

  it("saves a draft without receiving it", async () => {
    renderLogConsignment();

    await screen.findByText(/RC-26-0419/);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(receptionMocks.saveReceptionConsignment).toHaveBeenCalled());
    const saved = receptionMocks.saveReceptionConsignment.mock
      .calls[0][0] as ReceptionConsignmentInput;
    expect(saved.status).toBe("draft");
    expect(receptionMocks.generateReceptionAckPDF).not.toHaveBeenCalled();
  });

  it("reopens an existing consignment instead of starting a new one", async () => {
    renderLogConsignment("/reception/RC-26-0418");

    await waitFor(
      () => {
        const clientInput = screen.getByLabelText("Client");
        expect(clientInput).toHaveValue("Kenya Railways");
      },
      { timeout: 5000 },
    );
    expect(screen.getByDisplayValue("26-0418/04")).toBeInTheDocument();
  });
});
