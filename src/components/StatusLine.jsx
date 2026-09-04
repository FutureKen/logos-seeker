/** The single-line, aria-live result summary under the search box. */
export default function StatusLine({ text }) {
  return (
    <p id="status" className="status" aria-live="polite">
      {text || ""}
    </p>
  );
}
