import { renderHtml } from "./renderHtml";


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Helper: Fetch all comments from D1
    async function getComments() {
      const { results } = await env.DB.prepare(
        'SELECT * FROM comments ORDER BY created_at DESC'
      ).all();
      return results;
    }

    // Helper: Generate HTML page
    function generateHTML(comments, message = '', isError = false) {
      const commentsList = comments.map(c => `
        <div class="comment">
          <strong>${c.name}</strong> (${new Date(c.created_at).toLocaleString()})<br>
          ${c.comment}
        </div>
      `).join('');

      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Comment App</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
            form { margin-bottom: 20px; }
            input, textarea { width: 100%; padding: 8px; margin: 5px 0; }
            button { padding: 10px; background: #0066cc; color: white; border: none; cursor: pointer; }
            .comment { border: 1px solid #ddd; padding: 10px; margin: 10px 0; border-radius: 5px; }
            .message { padding: 10px; margin: 10px 0; border-radius: 5px; ${isError ? 'background: #ffebee; color: #c62828;' : 'background: #e8f5e8; color: #2e7d32;'} }
          </style>
        </head>
        <body>
          <h1>Comment Board</h1>
          
          ${message ? `<div class="message">${message}</div>` : ''}
          
          <form method="POST" action="/comments">
            <label for="name">Name:</label><br>
            <input type="text" id="name" name="name" required maxlength="50">
            
            <label for="comment">Comment:</label><br>
            <textarea id="comment" name="comment" rows="4" required maxlength="500"></textarea><br>
            
            <button type="submit">Add Comment</button>
          </form>
          
          <h2>Comments (${comments.length})</h2>
          ${commentsList || '<p>No comments yet. Be the first!</p>'}
        </body>
        </html>
      `;
    }

    if (pathname === '/' || pathname === '/comments') {
      if (request.method === 'GET') {
        const comments = await getComments();
        const html = generateHTML(comments);
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      if (request.method === 'POST') {
        // Parse form data
        const formData = await request.formData();
        const name = formData.get('name')?.trim();
        const comment = formData.get('comment')?.trim();

        if (!name || !comment) {
          const comments = await getComments();
          const html = generateHTML(comments, 'Please provide both name and comment.', true);
          return new Response(html, {
            status: 400,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }

        // Insert into D1
        await env.DB.prepare(
          'INSERT INTO comments (name, comment) VALUES (?, ?)'
        ).bind(name, comment).run();

        // Redirect to GET / to show updated list
        return Response.redirect(new URL('/', request.url), 303);
      }
    }

    // 404 for other paths
    return new Response('Not Found', { status: 404 });
  },
};

/*
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
