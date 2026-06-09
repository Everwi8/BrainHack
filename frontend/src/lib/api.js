const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

// authHeaders pulls the stored JWT so every request is authed. Read from
// localStorage (not the auth context) to avoid an import cycle with auth.jsx.
function authHeaders() {
  const token = localStorage.getItem('brainy_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// postForm sends multipart/form-data (e.g. file uploads). The Content-Type is
// left unset so the browser supplies the multipart boundary automatically.
async function postForm(path, formData) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// postStream POSTs JSON and consumes a Server-Sent Events response, invoking
// the supplied callbacks as named events arrive:
//   onToken(text)  — one streamed token of the reply
//   onDone(info)   — final payload ({ reply, session_id, title })
//   onError(msg)   — request or stream failure
// We use fetch (not EventSource) because EventSource is GET-only and can't carry
// the Authorization header these endpoints require.
async function postStream(path, body, { onToken, onDone, onError } = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
  } catch (err) {
    onError?.(err.message ?? 'Network error');
    return;
  }
  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({}));
    onError?.(errBody.error ?? `Request failed: ${res.status}`);
    return;
  }

  const dispatch = (frame) => {
    let event = 'message';
    let data = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return;
    let payload;
    try { payload = JSON.parse(data); } catch { return; }
    if (event === 'token') onToken?.(payload.text ?? '');
    else if (event === 'done') onDone?.(payload);
    else if (event === 'error') onError?.(payload.error ?? 'Stream error');
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      dispatch(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
    }
  }
  if (buffer.trim()) dispatch(buffer); // flush any trailing frame
}

export const api = {
  get: (path, options) => request(path, { method: 'GET', ...options }),
  post: (path, body, options) =>
    request(path, { method: 'POST', body: JSON.stringify(body), ...options }),
  put: (path, body, options) =>
    request(path, { method: 'PUT', body: JSON.stringify(body), ...options }),
  patch: (path, body, options) =>
    request(path, { method: 'PATCH', body: JSON.stringify(body), ...options }),
  delete: (path, options) => request(path, { method: 'DELETE', ...options }),
  postForm,
  postStream,
};
