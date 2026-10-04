// Calls to the blinken.org API

export class ApiError extends Error {
  constructor(message, status, logs = []) {
    super(message);
    this.status = status;
    this.logs = logs;
  }
}

export async function api(path, {method, body} = {}) {
  const options = {method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {}};
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`/api/0${path}`, options);
  const type = res.headers.get('Content-Type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    throw new ApiError(data?.error || `Server error ${res.status}`,
        res.status, data?.logs);
  }
  return data;
}

// Shows this page has queued that haven't finished. Closing or leaving
// the page cancels them, using beacons, which outlive the page.
const activeJobs = new Set();
window.addEventListener('pagehide', () => {
  for (const token of activeJobs) {
    navigator.sendBeacon(`/api/0/cancel/${token}`);
  }
});

// Poll a queued show's status until it finishes, calling update(status)
// with each {value, message}. Returns a function that stops polling.
// Until then, the show is canceled if the visitor leaves the page.
export function watchJob(token, update) {
  let stopped = false;
  let timer;
  activeJobs.add(token);
  const poll = async () => {
    try {
      const status = await api(`/status/${token}`);
      if (stopped) {
        return;
      }
      update(status);
      if (status.value > 0) {
        timer = setTimeout(poll, 1000);
      } else {
        activeJobs.delete(token);
      }
    } catch (e) {
      if (!stopped) {
        update({value: -10, message: e.message});
      }
    }
  };
  poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    activeJobs.delete(token);
  };
}

export function cancelJob(token) {
  return api(`/cancel/${token}`, {method: 'POST'});
}
