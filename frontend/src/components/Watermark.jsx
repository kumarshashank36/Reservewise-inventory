// Fixed bottom-right watermark, present on every route. Purely decorative:
// it never intercepts clicks and sits below snackbars and dialogs.
export function Watermark() {
  return <span className="watermark" aria-hidden="true">Developed by Kumar Shashank</span>;
}
