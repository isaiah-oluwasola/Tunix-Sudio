// Tunix Studio is a local-first, client-side video editor. It does not
// require a database connection to function, so the health check simply
// reports that the server process is up.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true });
}
