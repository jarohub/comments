export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const ADMIN_PASSWORD = 'admin123';  // CHANGE THIS! For demo only.
    const MAX_NAME_LENGTH = 50;
    const MAX_COMMENT_LENGTH = 500;
    const MODEL_ID = '@cf/meta/llama-2-7b-chat-int8';  // Modelo ligero para moderación

    // Helper: Obtener y truncar IP a últimos 3 octetos (e.g., 2.3.4.5 -> 3.4.5)
    function getTruncatedIP(request) {
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '0.0.0.0';
      const parts = ip.split('.');
      if (parts.length === 4) {
        return parts.slice(1).join('.');  // Últimos 3: parts[1]+'.'+parts[2]+'.'+parts[3]
      }
      return '0.0.0';  // Fallback
    }

    // Helper: Moderación con Workers AI
    async function moderateComment(commentText) {
      if (!env.AI) {
        console.warn('Workers AI no disponible');
        return { success: true, reason: 'AI no configurado (fallback)' };  // Permite si no hay AI
      }

      const prompt = {
        messages: [
          {
            role: 'system',
            content: 'Eres un moderador estricto. Clasifica este comentario como "safe" (apropiado, sin spam/ofensas/odios/publicidad) o "unsafe" (inapropiado, con lenguaje ofensivo, spam, etc.). Responde SOLO con: {"safe": true/false, "reason": "explicación breve"}. No agregues más texto.'
          },
          {
            role: 'user',
            content: commentText
          }
        ],
        max_tokens: 100,  // Limita output
        temperature: 0.1  // Bajo para consistencia
      };

      try {
        const response = await env.AI.run(MODEL_ID, prompt);
        const moderation = JSON.parse(response.response);  // Espera JSON del modelo
        return { success: moderation.safe, reason: moderation.reason || 'Moderación AI' };
      } catch (error) {
        console.error('Error en AI moderación:', error);
        return { success: true, reason: 'Error AI (fallback)' };  // Permite en error
      }
    }

    // Helper: Relative time in Spanish
    function formatRelativeTime(dateStr) {
      const now = new Date();
      const date = new Date(dateStr);
      const diff = now - date;  // ms
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      const years = Math.floor(days / 365);

      if (years > 0) return `hace ${years} ${years === 1 ? 'año' : 'años'}`;
      if (days > 0) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
      if (hours > 0) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
      if (minutes > 0) return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
      return 'hace unos segundos';
    }

    // Helper: Auth (unchanged)
    function isAuthenticated(cookies) {
      const session = cookies.get('admin_session');
      return session === btoa(ADMIN_PASSWORD);
    }

    function setAuthCookie() {
      const headers = new Headers();
      headers.set('Set-Cookie', `admin_session=${btoa(ADMIN_PASSWORD)}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);
      return headers;
    }

    // Helper: Fetch comments (with formatted time, incluye ip_suffix internamente pero no lo expone)
    async function getComments() {
      const { results } = await env.DB.prepare(
        'SELECT * FROM comments ORDER BY created_at DESC'
      ).all();
      return results.map(c => ({ ...c, relative_time: formatRelativeTime(c.created_at) }));
    }

    async function getCommentById(id) {
      const { results } = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(id).all();
      return results[0] ? { ...results[0], relative_time: formatRelativeTime(results[0].created_at) } : null;
    }

    // Helper: Verificar si el IP truncado coincide con el del último comentario
    async function checkIPDuplicate(truncatedIP) {
      const { results } = await env.DB.prepare(
        'SELECT ip_suffix FROM comments ORDER BY created_at DESC LIMIT 1'
      ).all();
      if (results.length > 0 && results[0].ip_suffix === truncatedIP) {
        return true;  // Duplicado: mismo IP que el anterior
      }
      return false;
    }

    // Helper: Public HTML (unchanged)
    function generatePublicHTML(comments, message = '', isError = false) {
      const commentsList = comments.map(c => `
        <div class="comment">
          <strong>${c.name}</strong> (${c.relative_time})<br>
          ${c.comment}
        </div>
      `).join('');

      return `
        <!DOCTYPE html>
        <html lang="es">
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
          <h1>Tablero de Comentarios</h1>
           <img src="/imagenprueba1.jpg" alt="Logo de la App" style="max-width: 200px; display: block; margin: 0 auto 20px;">
          <p><a href="/admin" style="color: #666; font-size: 0.9em;">(¿Admin? Haz clic aquí)</a></p>
          
          ${message ? `<div class="message">${message}</div>` : ''}
          
          <form method="POST" action="/comments">
            <label for="name">Nombre:</label><br>
            <input type="text" id="name" name="name" required maxlength="${MAX_NAME_LENGTH}">
            
            <label for="comment">Comentario:</label><br>
            <textarea id="comment" name="comment" rows="4" required maxlength="${MAX_COMMENT_LENGTH}"></textarea><br>
            
            <button type="submit">Añadir Comentario</button>
          </form>
          
          <h2>Comentarios (${comments.length})</h2>
          ${commentsList || '<p>Aún no hay comentarios. ¡Sé el primero!</p>'}

          
        </body>
        </html>
      `;
    }

    // Helper: Admin HTML (with relative time)
    function generateAdminHTML(comments, message = '', isError = false) {
      const commentsList = comments.map(c => `
        <div class="comment">
          <strong>${c.name}</strong> (${c.relative_time}) | IP truncada: ${c.ip_suffix || 'N/A'}<br>
          ${c.comment}
          <div style="margin-top: 10px;">
            <a href="/admin/${c.id}/edit" style="color: #0066cc; text-decoration: none; margin-right: 10px;">Editar</a>
            <form method="POST" action="/admin/${c.id}/delete" style="display: inline;" onsubmit="return confirm('¿Eliminar este comentario?');">
              <button type="submit" style="background: #dc3545; color: white; border: none; padding: 5px 10px; cursor: pointer;">Eliminar</button>
            </form>
          </div>
        </div>
      `).join('');  // Muestra IP truncada solo en admin para debug

      return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Panel Admin - Comentarios</title>
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
          <h1>Panel de Administración</h1>
          <p><a href="/" class="logout">Volver a Página Pública</a> | 
             <form method="POST" action="/admin/logout" style="display: inline;">
               <button type="submit" class="logout">Cerrar Sesión</button>
             </form></p>
          
          ${message ? `<div class="message">${message}</div>` : ''}
          
          <h2>Todos los Comentarios (${comments.length})</h2>
          ${commentsList || '<p>No hay comentarios.</p>'}
        </body>
        </html>
      `;
    }

    // Helper: Edit HTML (with relative time)
    function generateEditHTML(comment, message = '', isError = false) {
      const createdInfo = `(Creado: ${comment.relative_time}) | IP: ${comment.ip_suffix || 'N/A'}`;
      return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Editar Comentario</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
            input, textarea { width: 100%; padding: 8px; margin: 8px 0; }
            button { padding: 10px; background: #0066cc; color: white; border: none; cursor: pointer; margin-right: 10px; }
            .cancel { background: #6c757d; }
            .message { padding: 10px; margin: 10px 0; border-radius: 5px; ${isError ? 'background: #ffebee; color: #c62828;' : 'background: #e8f5e8; color: #2e7d32;'} }
          </style>
        </head>
        <body>
          <h1>Editar Comentario</h1>
          <p><a href="/admin">Volver a Admin</a></p>
          
          ${message ? `<div class="message">${message}</div>` : ''}
          
          <p><em>${createdInfo}</em></p>
          <form method="POST" action="/admin/${comment.id}/edit">
            <label for="name">Nombre:</label><br>
            <input type="text" id="name" name="name" value="${comment.name || ''}" required maxlength="${MAX_NAME_LENGTH}">
            
            <label for="comment">Comentario:</label><br>
            <textarea id="comment" name="comment" rows="4" required maxlength="${MAX_COMMENT_LENGTH}">${comment.comment || ''}</textarea><br>
            
            <button type="submit">Actualizar Comentario</button>
            <a href="/admin"><button type="button" class="cancel">Cancelar</button></a>
          </form>
        </body>
        </html>
      `;
    }

    // Public Routes
    if (pathname === '/' || pathname === '/comments') {
      if (request.method === 'GET') {
        const comments = await getComments();
        const html = generatePublicHTML(comments);
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      if (request.method === 'POST') {
        const formData = await request.formData();
        let name = formData.get('name')?.trim();
        let comment = formData.get('comment')?.trim();
        const truncatedIP = getTruncatedIP(request);

        if (!name || !comment) {
          const comments = await getComments();
          const html = generatePublicHTML(comments, 'Por favor, proporciona nombre y comentario.', true);
          return new Response(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        // Server-side length limits
        if (name.length > MAX_NAME_LENGTH || comment.length > MAX_COMMENT_LENGTH) {
          const comments = await getComments();
          const html = generatePublicHTML(comments, `El nombre debe tener máximo ${MAX_NAME_LENGTH} caracteres y el comentario ${MAX_COMMENT_LENGTH}.`, true);
          return new Response(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        // Verificar duplicado de IP (mismo que el comentario anterior)
        const isIPDuplicate = await checkIPDuplicate(truncatedIP);
        if (isIPDuplicate) {
          const comments = await getComments();
          const html = generatePublicHTML(comments, 'No se permiten comentarios consecutivos desde la misma IP. Espera un poco o intenta más tarde.', true);
          return new Response(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        // Moderación AI para comentarios públicos
        const moderation = await moderateComment(comment);
        if (!moderation.success) {
          const comments = await getComments();
          const html = generatePublicHTML(comments, `Comentario rechazado por moderación: ${moderation.reason}. Por favor, usa lenguaje apropiado.`, true);
          return new Response(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        // Prepared statement prevents SQL injection, incluye ip_suffix
        await env.DB.prepare('INSERT INTO comments (name, comment, ip_suffix) VALUES (?, ?, ?)').bind(name, comment, truncatedIP).run();
        return Response.redirect(new URL('/', request.url), 303);
      }
    }

    // Admin Routes
    if (pathname.startsWith('/admin')) {
      const cookies = request.headers.get('Cookie') ? new URLSearchParams(request.headers.get('Cookie')) : new URLSearchParams();
      const authenticated = isAuthenticated(cookies);

      if (pathname === '/admin/logout' && request.method === 'POST') {
        const headers = new Headers();
        headers.set('Set-Cookie', 'admin_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
        return new Response('Sesión cerrada', { status: 200, headers });
      }

      if (!authenticated && request.method === 'GET') {
        return new Response(`
          <!DOCTYPE html>
          <html lang="es">
          <head><title>Login Admin</title></head>
          <body>
            <h1>Contraseña de Admin</h1>
            <form method="POST" action="/admin">
              <input type="password" name="password" required>
              <button type="submit">Entrar</button>
            </form>
            <p><a href="/">Volver a Comentarios</a></p>
          </body>
          </html>
        `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      if (pathname === '/admin' && request.method === 'POST' && !authenticated) {
        const formData = await request.formData();
        const password = formData.get('password');
        if (password !== ADMIN_PASSWORD) {
          return new Response('Contraseña inválida. <a href="/admin">Intenta de nuevo</a>', { status: 401 });
        }
        const headers = setAuthCookie();
        return Response.redirect('/admin', 303);
      }

      if (!authenticated) {
        return new Response('No autorizado', { status: 401 });
      }

      // GET /admin (ahora muestra ip_suffix para admins)
      if (pathname === '/admin' && request.method === 'GET') {
        const comments = await getComments();
        const html = generateAdminHTML(comments);
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // Edit GET
      if (pathname.match(/^\/admin\/(\d+)\/edit$/) && request.method === 'GET') {
        const id = pathname.split('/')[2];
        const comment = await getCommentById(id);
        if (!comment) return new Response('Comentario no encontrado', { status: 404 });
        const html = generateEditHTML(comment);
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // Edit POST (sin check de IP ni moderación para admins, no actualiza IP)
      if (pathname.match(/^\/admin\/(\d+)\/edit$/) && request.method === 'POST') {
        const id = pathname.split('/')[2];
        const formData = await request.formData();
        let name = formData.get('name')?.trim();
        let commentText = formData.get('comment')?.trim();

        if (!name || !commentText) {
          const comment = await getCommentById(id);
          if (!comment) return new Response('No encontrado', { status: 404 });
          const html = generateEditHTML(comment, 'Por favor, proporciona ambos campos.', true);
          return new Response(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        // Server-side length limits (sin IP check para edits)
        if (name.length > MAX_NAME_LENGTH || commentText.length > MAX_COMMENT_LENGTH) {
          const comment = await getCommentById(id);
          if (!comment) return new Response('No encontrado', { status: 404 });
          const html = generateEditHTML(comment, `El nombre debe tener máximo ${MAX_NAME_LENGTH} caracteres y el comentario ${MAX_COMMENT_LENGTH}.`, true);
          return new Response(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        // Opcional: Moderación AI para ediciones (comenta si quieres saltarla)
        // const moderation = await moderateComment(commentText);
        // if (!moderation.success) { ... rechazar }

        // Prepared statement, actualiza solo name y comment (no toca ip_suffix)
        await env.DB.prepare('UPDATE comments SET name = ?, comment = ? WHERE id = ?').bind(name, commentText, id).run();
        return Response.redirect('/admin', 303);
      }

      // Delete POST
      if (pathname.match(/^\/admin\/(\d+)\/delete$/) && request.method === 'POST') {
        const id = pathname.split('/')[2];
        await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
        return Response.redirect('/admin', 303);
      }

      return new Response('Prohibido', { status: 403 });
    }

    return new Response('No encontrado', { status: 404 });
  },
};
