import { renderHtml } from "./renderHtml";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/comments') {
      if (request.method === 'GET') {
        // Show comments: Query D1
        const { results } = await env.DB.prepare(
          'SELECT * FROM comments ORDER BY created_at DESC'
        ).all();
        return new Response(JSON.stringify({ comments: results }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (request.method === 'POST') {
        // Write comment: Parse JSON body
        const { name, comment } = await request.json();
        if (!name || !comment) {
          return new Response(JSON.stringify({ error: 'Missing name or comment' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Insert into D1
        const { results } = await env.DB.prepare(
          'INSERT INTO comments (name, comment) VALUES (?, ?) RETURNING *'
        ).bind(name, comment).all();
        const newComment = results[0];

        return new Response(JSON.stringify({ comment: newComment }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Default: 404 for other paths
    return new Response('Not Found', { status: 404 });
  },
};

/*
export default {
  async fetch(request, env) {
    const stmt = env.DB.prepare("SELECT * FROM comments LIMIT 3");
    const { results } = await stmt.all();

    return new Response(renderHtml(JSON.stringify(results, null, 2)), {
      headers: {
        "content-type": "text/html",
      },
    });
  },
} satisfies ExportedHandler<Env>;
*/
