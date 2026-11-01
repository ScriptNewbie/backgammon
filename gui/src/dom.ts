/** Elements shared by the Play and Replay screens. */
export const dom = {
  error: document.querySelector<HTMLParagraphElement>("#error")!,
  hud: document.querySelector<HTMLElement>("#hud")!,
  board: document.querySelector<HTMLElement>("#board")!,
  caption: document.querySelector<HTMLParagraphElement>("#caption")!,
  notice: document.querySelector<HTMLParagraphElement>("#notice")!,
};

export function showError(message: string | null): void {
  dom.error.hidden = !message;
  dom.error.textContent = message ?? "";
}

export type Screen = {
  activate(): void;
  deactivate(): void;
};
