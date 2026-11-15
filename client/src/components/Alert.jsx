export default function Alert({ children, tone = "error" }) {
  if (!children) return null;

  const styles =
    tone === "success"
      ? "bg-[#00c853] text-ink"
      : "bg-ink text-paper";

  return (
    <div className={`brut-box-sm px-4 py-3 font-mono text-sm font-bold ${styles}`} role="alert">
      {children}
    </div>
  );
}
