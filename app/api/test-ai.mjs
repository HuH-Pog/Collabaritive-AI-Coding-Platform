import "dotenv/config";

const key = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim();

if (!key || !model) {
  console.error("Missing GEMINI_API_KEY or GEMINI_MODEL.");
  process.exit(1);
}

const started = Date.now();

try {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: "Reply with only: Hello" }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1024,
          thinkingConfig: {
            thinkingLevel: "low",
          },
        },
      }),
    }
  );

  console.log("HTTP status:", response.status);
  console.log("Elapsed seconds:", (Date.now() - started) / 1000);

  const data = await response.json();

  if (response.ok) {
    const reply = data.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("");

    console.log("Reply:", reply || "(empty)");
  } else {
    console.log("Provider error status:", data.error?.status);
    console.log("Provider error code:", data.error?.code);
  }
} catch (error) {
  console.error("Request failed:", error.name);
  console.error("Network error code:", error.cause?.code ?? "(none)");
  console.log("Elapsed seconds:", (Date.now() - started) / 1000);
}