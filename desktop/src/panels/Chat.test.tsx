import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPanel } from "./Chat";
import { act } from "@testing-library/react";
import { addVoiceExchange, ingestListen, resetChat } from "./chatStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

const mocked = vi.mocked(invoke);

beforeEach(() => {
  resetChat();
  mocked.mockReset();
});
afterEach(cleanup);

function send(text: string) {
  fireEvent.change(screen.getByPlaceholderText("Escríbele a Lazo…"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

describe("chat", () => {
  it("scrolls_to_newest_when_section_becomes_active", () => {
    const spy = vi.fn();
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    try {
      const { rerender } = render(<ChatPanel active={false} />);
      spy.mockClear();
      rerender(<ChatPanel active={false} />);
      expect(spy).not.toHaveBeenCalled();
      rerender(<ChatPanel active />);
      expect(spy).toHaveBeenCalledWith({ block: "end" });
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
  });

  it("chat_scrolls_to_latest", async () => {
    const spy = vi.fn();
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    try {
      render(<ChatPanel />);
      spy.mockClear();
      act(() => void addVoiceExchange("hola", "qué tal"));
      await waitFor(() => expect(spy).toHaveBeenCalledWith({ block: "end" }));
      // El historial tiene su propio contenedor con scroll (tope de altura por CSS: --avail).
      expect(document.querySelector(".chat-msgs")).toBeTruthy();
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
  });

  it("chat_thinking_dots_static", () => {
    mocked.mockImplementation(() => new Promise(() => {}));
    render(<ChatPanel />);
    send("hola");
    const dots = screen.getByTestId("thinking");
    expect(dots.querySelectorAll("i").length).toBe(3);
    const classes = [dots, ...Array.from(dots.querySelectorAll("*"))].map((el) => el.getAttribute("class") ?? "").join(" ");
    expect(classes).not.toMatch(/animate|pulse|bounce|spin|transition/);
  });

  it("sends_message_and_shows_reply", async () => {
    mocked.mockImplementation(async (cmd) => (cmd === "api_request" ? { reply: "Hoy tienes dentista a las 10" } : null));
    render(<ChatPanel />);
    send("¿qué tengo hoy?");
    expect(screen.getByText("¿qué tengo hoy?")).toBeTruthy();
    expect(await screen.findByText("Hoy tienes dentista a las 10")).toBeTruthy();
    expect(mocked).toHaveBeenCalledWith("api_request", { method: "POST", path: "/voz", body: { texto: "¿qué tengo hoy?" } });
    expect((screen.getByPlaceholderText("Escríbele a Lazo…") as HTMLInputElement).value).toBe("");
  });

  it("shows_error_on_offline", async () => {
    mocked.mockImplementation(async () => {
      throw { kind: "offline", message: "error sending request" };
    });
    render(<ChatPanel />);
    send("hola");
    expect(await screen.findByText("Sin conexión con Lazo. Revisa la red e intenta de nuevo.")).toBeTruthy();
    // El mensaje queda en el historial para reintentar.
    expect(screen.getByText("hola")).toBeTruthy();
  });

  it("ignores_empty_text", () => {
    render(<ChatPanel />);
    send("   ");
    expect(mocked).not.toHaveBeenCalled();
  });

  it("shows_voice_exchanges_from_the_lazo_key", async () => {
    render(<ChatPanel />);
    addVoiceExchange("pon un recordatorio", "Listo, te lo recuerdo");
    await waitFor(() => expect(screen.getByText("Listo, te lo recuerdo")).toBeTruthy());
    expect(screen.getByText("pon un recordatorio")).toBeTruthy();
  });

  it("mic_button_uses_the_lazo_flow", () => {
    mocked.mockResolvedValue(null);
    render(<ChatPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Hablar con Lazo" }));
    expect(mocked).toHaveBeenCalledWith("lazo_mic", { on: true });
  });

  it("typed_thinking_survives_unrelated_listen_ticks", async () => {
    let resolve: (v: unknown) => void = () => {};
    mocked.mockImplementation(() => new Promise((r) => (resolve = r)));
    render(<ChatPanel />);
    send("hola");
    expect(screen.getByLabelText("Lazo está pensando…")).toBeTruthy();
    act(() => void ingestListen({ id: 9, mode: "lazo", phase: "recording", level: 0.2 }));
    act(() => void ingestListen({ id: 9, mode: "lazo", phase: "done" }));
    expect(screen.getByLabelText("Lazo está pensando…")).toBeTruthy();
    await act(async () => resolve({ reply: "Hola Ana" }));
    expect(screen.queryByLabelText("Lazo está pensando…")).toBeNull();
  });

  it("voice_error_without_heard_is_shown", () => {
    render(<ChatPanel />);
    act(() => void ingestListen({ id: 3, mode: "lazo", phase: "thinking" }));
    act(() => void ingestListen({ id: 3, mode: "lazo", phase: "error", text: "Sin conexión con Lazo" }));
    expect(screen.getByText("Sin conexión con Lazo")).toBeTruthy();
    expect(screen.queryByLabelText("Lazo está pensando…")).toBeNull();
  });
});
