import { handleApiRequest } from "../../api/_lib/handlers.js";

export default async function handler(req) {
  const rawBody = await req.text();
  const body = rawBody ? JSON.parse(rawBody) : undefined;
  const headers = Object.fromEntries(req.headers.entries());
  let statusCode = 200;
  const responseHeaders = {};
  let responseBody = "";

  const nodeReq = {
    method: req.method,
    url: new URL(req.url).pathname.replace(/^\/\.netlify\/functions\/api/, "/api"),
    headers,
    body,
    async *[Symbol.asyncIterator]() {
      if (rawBody) yield Buffer.from(rawBody);
    }
  };

  const nodeRes = {
    set statusCode(value) {
      statusCode = value;
    },
    get statusCode() {
      return statusCode;
    },
    setHeader(name, value) {
      responseHeaders[name] = value;
    },
    end(value = "") {
      responseBody = String(value);
    }
  };

  await handleApiRequest(nodeReq, nodeRes);

  return new Response(responseBody, {
    status: statusCode,
    headers: responseHeaders
  });
}

export const config = {
  path: "/api/*"
};
