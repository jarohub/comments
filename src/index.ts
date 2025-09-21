export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const ADMIN_PASSWORD = 'admin123';  // CHANGE THIS! For demo only. Use hashing in prod (e.g., bcrypt via Worker).

    // Helper: Check if user is authenticated (via cookie)
    function isAuthenticated(cookies) {
      // Simple: Check for 'admin_session' cookie matching hashed password (base64 for demo)
      const session = cookies.get('admin_session');
      return session === btoa(ADMIN_PASSWORD);  // Base64 "hash"—insecure; replace with proper hash.
    }

    // Helper: Set auth cookie
    function setAuthCookie() {
      const headers = new Headers();
      headers.set('Set-Cookie', `admin_session=${btoa(ADMIN_PASSWORD)}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);  // 1 hour
      return headers;
    }

    // Helper: Fetch all comments from D1
    async function getComments() {
      const { results } = await env.DB.prepare(
        'SELECT * FROM comments ORDER BY created_at DESC'
      ).all();
      return results;
    }

    // Helper: Get single comment by ID
    async function getCommentById(id) {
      const { results } = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(id).all();
      return results[0] || null;
    }

    // Helper: Generate Public HTML page (unchanged from before)
    function generatePublicHTML(comments, message = '', isError = false) {
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
          <p><a href="/admin" style="color: #666; font-size: 0.9em;">(Admin? Click here)</a></p>  <!-- Hint for access -->
          
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

    // Helper: Generate Admin HTML (list view)
    function generateAdminHTML(comments, message = '', isError = false) {
      const commentsList = comments.map(c => `
        <div class="comment">
          <strong>${c.name}</strong> (${new Date(c.created_at).toLocaleString()})<br>
          ${c.comment}
          <div style="margin-top: 10px;">
            <a href="/admin/${c.id}/edit" style="color: #0066cc; text-decoration: none; margin-right: 10px;">Edit</a>
            <form method="POST" action="/admin/${c.id}/delete" style="display: inline;" onsubmit="return confirm('Delete this comment?');">
              <button type="submit" style="background: #dc3545; color: white; border: none; padding: 5px 10px; cursor: pointer;">Delete</button>
            </form>
          </div>
        </div>
      `).join('');

      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Admin Panel - Comments</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .comment { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
            .message { padding: 10px; margin: 10px 0; border-radius: 5px; ${isError ? 'background: #ffebee; color: #c62828;' : 'background: #e8f5e8; color: #2e7d32;'} }
            a { color: #0066cc; text-decoration: none; }
            button { padding: 5px 10px; border: none; cursor: pointer; }
            form { margin: 0; }
            .logout { background: #6c757d; color: white; }
          </style>
        </head>
        <body>
          <h1>Admin Panel</h1>
          <p><a href="/" class="logout">Back to Public Page</a> | 
             <form method="POST" action="/admin/logout" style="display: inline;">
               <button type="submit" class="logout">Logout</button>
             </form></p>
          
          ${message ? `<div class="message">${message}</div>` : ''}
          
          <h2>All Comments (${comments.length})</h2>
          ${commentsList || '<p>No comments.</p>'}
        </body>
        </html>
      `;
    }

    // Helper: Generate Edit HTML
    function generateEditHTML(comment, message = '', isError = false) {
      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Edit Comment</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
            input, textarea { width: 100%; padding: 8px; margin: 8px 0; }
            button { padding: 10px; background: #0066cc; color: white; border: none; cursor: pointer; margin-right: 10px; }
            .cancel { background: #6c757d; }
            .message { padding: 10px; margin: 10px 0; border-radius: 5px; ${isError ? 'background: #ffebee; color: #c62828;' : 'background: #e8f5e8; color: #2e7d32;'} }
          </style>
        </head>
        <body>
          <h1>Edit Comment</h1>
          <p><a href="/admin">Back to Admin</a></p>
          
          ${message ? `<div class="message">${message}</div>` : ''}
          
          <form method="POST" action="/admin/${comment.id}/edit">
            <label for="name">Name:</label><br>
            <input type="text" id="name" name="name" value="${comment.name || ''}" required maxlength="50">
            
            <label for="comment">Comment:</label><br>
            <textarea id="comment" name="comment" rows="4" required maxlength="500">${comment.comment || ''}</textarea><br>
            
            <button type="submit">Update Comment</button>
            <a href="/admin"><button type="button" class="cancel">Cancel</button></a>
          </form>
        </body>
        </html>
      `;
    }

    // Public Routes (unchanged)
    if (pathname === '/' || pathname === '/comments') {
      if (request.method === 'GET') {
        const comments = await getComments();
        const html = generatePublicHTML(comments);
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      if (request.method === 'POST') {
        const formData = await request.formData();
        const name = formData.get('name')?.trim();
        const comment = formData.get('comment')?.trim();

        if (!name || !comment) {
          const comments = await getComments();
          const html = generatePublicHTML(comments, 'Please provide both name and comment.', true);
          return new Response(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        await env.DB.prepare('INSERT INTO comments (name, comment) VALUES (?, ?)').bind(name, comment).run();
        return Response.redirect(new URL('/', request.url), 303);
      }
    }

    // Admin Routes
    if (pathname.startsWith('/admin')) {
      const cookies = request.headers.get('Cookie') ? new URLSearchParams(request.headers.get('Cookie')) : new URLSearchParams();
      const authenticated = isAuthenticated(cookies);

      // Logout: Clear cookie
      if (pathname === '/admin/logout' && request.method === 'POST') {
        const headers = new Headers();
        headers.set('Set-Cookie', 'admin_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
        return new Response('Logged out', { status: 200, headers });
      }

      // Auth check: If not authenticated, show login form
      if (!authenticated && request.method === 'GET') {
        return new Response(`
          <!DOCTYPE html>
          <html lang="en">
          <head><title>Admin Login</title></head>
          <body>
            <h1>Enter Admin Password</h1>
            <form method="POST" action="/admin">
              <input type="password" name="password" required>
              <button type="submit">Login</button>
            </form>
            <p><a href="/">Back to Comments</a></p>
          </body>
          </html>
        `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // Handle login POST
      if (pathname === '/admin' && request.method === 'POST' && !authenticated) {
        const formData = await request.formData();
        const password = formData.get('password');
        if (password !== ADMIN_PASSWORD) {
          return new Response('Invalid password. <a href="/admin">Try again</a>', { status: 401 });
        }
        const headers = setAuthCookie();
        return new Response(null, { status: 303, headers: { ...headers, ...Object.fromEntries(headers) }, redirect: '/admin' });
      }

      // If authenticated, handle admin actions
      if (!authenticated) {
        return new Response('Unauthorized', { status: 401 });
      }

      // GET /admin: Show panel
      if (pathname === '/admin' && request.method === 'GET') {
        const comments = await getComments();
        const html = generateAdminHTML(comments);
        const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
        return new Response(html, { headers });
      }

      // GET /admin/:id/edit: Show edit form
      if (pathname.match(/^\/admin\/(\d+)\/edit$/) && request.method === 'GET') {
        const id = pathname.split('/')[2];
        const comment = await getCommentById(id);
        if (!comment) {
          return new Response('Comment not found', { status: 404 });
        }
        const html = generateEditHTML(comment);
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // POST /admin/:id/edit: Update comment
      if (pathname.match(/^\/admin\/(\d+)\/edit$/) && request.method === 'POST') {
        const id = pathname.split('/')[2];
        const formData = await request.formData();
        const name = formData.get('name')?.trim();
        const commentText = formData.get('comment')?.trim();

        if (!name || !commentText) {
          const comment = await getCommentById(id);
          if (!comment) return new Response('Not found', { status: 404 });
          const html = generateEditHTML(comment, 'Please provide both fields.', true);
          return new Response(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        await env.DB.prepare('UPDATE comments SET name = ?, comment = ? WHERE id = ?').bind(name, commentText, id).run();
        return Response.redirect(new URL('/admin', request.url), 303);
      }

      // POST /admin/:id/delete: Delete comment
      if (pathname.match(/^\/admin\/(\d+)\/delete$/) && request.method === 'POST') {
        const id = pathname.split('/')[2];
        await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
        return Response.redirect(new URL('/admin', request.url), 303);
      }

      // Unauthorized or invalid admin path
      return new Response('Forbidden', { status: 403 });
    }

    // 404
    return new Response('Not Found', { status: 404 });
  },
};
