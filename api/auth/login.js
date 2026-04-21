import { handleApiRequest } from "../_lib/handlers.js";

export default function handler(req, res) {
  return handleApiRequest(req, res, "/api/auth/login");
}
