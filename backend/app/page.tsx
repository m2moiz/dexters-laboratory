export default function Page() {
  return (
    <main style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1 style={{ fontSize: "1.2rem", fontWeight: "bold" }}>Dexter API</h1>
      <p style={{ marginTop: "0.5rem", color: "#666" }}>
        POST /api/plan — body: <code>{`{ "hypothesis": "string" }`}</code>
      </p>
    </main>
  );
}
