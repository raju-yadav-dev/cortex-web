import { handleApiRequest } from "./_lib/handlers.js";

// Public endpoint for the desktop updater to fetch the latest version.
export default function handler(req, res) {
  return handleApiRequest(req, res, "/api/update");
}
