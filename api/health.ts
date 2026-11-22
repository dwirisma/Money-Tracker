interface ApiRequest {
  method?: string;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader?.('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Metode tidak diizinkan.' });
    return;
  }

  res.status(200).json({
    ok: true,
    geminiConfigured: Boolean((process.env.GEMINI_API_KEY || '').trim()),
  });
}
