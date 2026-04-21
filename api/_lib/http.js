export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function methodNotAllowed(res) {
  return sendJson(res, 405, { error: "Method not allowed." });
}

export function unauthorized(res, message = "Login required.") {
  return sendJson(res, 401, { error: message });
}

export function forbidden(res) {
  return sendJson(res, 403, { error: "Admin access required." });
}
