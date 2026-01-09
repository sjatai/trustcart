export default function Home() {
  return (
    <main className="te-container">
      <h1 className="te-h1">TrustEye</h1>
      <p className="te-body" style={{ marginTop: 10 }}>
        Go to <a href="/mission-control">/mission-control</a> to run the demo.
      </p>
      <p className="te-meta" style={{ marginTop: 10 }}>
        Tip: use <code style={{ fontSize: 12 }}>?presentation=true</code> for board demo subtitles.
      </p>
    </main>
  );
}
