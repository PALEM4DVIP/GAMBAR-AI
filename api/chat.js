const VALID_MODELS = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY belum diatur di server. Tambahkan di Vercel Project Settings > Environment Variables.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { contents, model, temperature } = body || {};

  if (!Array.isArray(contents) || contents.length === 0) {
    res.status(400).json({ error: 'Field "contents" wajib diisi.' });
    return;
  }

  const targetModel = VALID_MODELS.includes(model) ? model : 'gemini-3.5-flash';
  const safeTemp = typeof temperature === 'number' && temperature >= 0 && temperature <= 2 ? temperature : 0.9;

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents, generationConfig: { temperature: safeTemp } })
      }
    );

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => '');
      let message = `Gemini merespons status ${upstream.status}`;
      try { message = JSON.parse(errText)?.error?.message || message; } catch (e) { /* keep default */ }
      res.status(upstream.status || 500).json({ error: message });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message || 'Gagal menghubungi Gemini API.' });
  }
};
